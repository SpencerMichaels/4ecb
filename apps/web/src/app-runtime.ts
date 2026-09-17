import {
  ContentPackRepository,
  EvaluationCacheRepository,
} from "@4ecb/browser-storage";
import type { ContentPack } from "@4ecb/content-pack";
import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CompendiumQuery,
  CompendiumQueryResult,
  EntityRelationships,
} from "@4ecb/query-engine";
import type {
  EvaluatedCharacter,
  EvaluationInput,
  ProfileMigrationPreview,
} from "@4ecb/rules-engine";
import { RULES_EVALUATION_CACHE_VERSION } from "@4ecb/rules-engine";

import {
  QueryWorkerClient,
  type QueryIndexInfo,
  type QueryProgressHandler,
} from "./query-client";
import { RulesWorkerClient } from "./rules-client";
import { recordLoadDuration } from "./load-performance";

export interface QueryRuntimeClient {
  initialize(packId: string): Promise<QueryIndexInfo>;
  query(query: CompendiumQuery): Promise<CompendiumQueryResult>;
  getEntity(entityId: string): Promise<ContentEntity | undefined>;
  relationships(entityId: string): Promise<EntityRelationships | undefined>;
  subscribeProgress(handler: QueryProgressHandler): () => void;
  terminate(reason?: string): void;
}

export interface RulesRuntimeClient {
  initialize(packId: string, contentDigest?: string): Promise<void>;
  evaluate(input: EvaluationInput): Promise<EvaluatedCharacter>;
  previewProfileMigration(
    build: CharacterBuild,
    targetPackId: string,
    sourcePackId?: string,
    sourceContentDigest?: string,
  ): Promise<ProfileMigrationPreview>;
  terminate(reason?: string): void;
}

interface QueryEntry {
  readonly client: QueryRuntimeClient;
  readonly ready: Promise<QueryIndexInfo>;
  used: number;
}

interface RulesEntry {
  readonly client: RulesRuntimeClient;
  readonly ready: Promise<RulesRuntimeClient>;
  used: number;
}

export interface EvaluationCacheStore {
  get(
    key: string,
    engineVersion: string,
    profileRevision: string,
  ): Promise<unknown | undefined>;
  put(
    key: string,
    engineVersion: string,
    profileRevision: string,
    result: unknown,
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEvaluatedCharacter(
  value: unknown,
  input: EvaluationInput,
): value is EvaluatedCharacter {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<EvaluatedCharacter>;
  return (
    candidate.level === input.level &&
    typeof candidate.converged === "boolean" &&
    typeof candidate.iterations === "number" &&
    typeof candidate.complete === "boolean" &&
    typeof candidate.legal === "boolean" &&
    Array.isArray(candidate.occurrences) &&
    Array.isArray(candidate.activeDefinitionIds) &&
    Array.isArray(candidate.activeDefinitions) &&
    Array.isArray(candidate.choices) &&
    isRecord(candidate.stats) &&
    isRecord(candidate.textStrings) &&
    Array.isArray(candidate.overlays) &&
    Array.isArray(candidate.powers) &&
    (input.includePowers !== false || candidate.powers.length === 0) &&
    Array.isArray(candidate.suggestions) &&
    Array.isArray(candidate.diagnostics)
  );
}

function serializeEvaluationInput(input: EvaluationInput): string {
  return JSON.stringify({
    level: input.level,
    baseAbilities: input.baseAbilities,
    occurrences: input.occurrences,
    inventory: input.inventory,
    textStrings: input.textStrings,
    localEntities: input.localEntities,
    sourceEntitlements: input.sourceEntitlements,
    candidateDetailLevels: input.candidateDetailLevels,
    candidateDetailReplacementChoiceIds:
      input.candidateDetailReplacementChoiceIds,
    // Omitted has always meant true. Canonicalize those equivalent requests.
    includePowers: input.includePowers !== false,
  });
}

function isPersistentEvaluation(input: EvaluationInput): boolean {
  // Exhaustive compatibility evaluations can contain very large candidate
  // catalogs. Product screens explicitly scope candidates and are safe to
  // retain in the bounded disposable cache.
  return input.candidateDetailLevels !== undefined;
}

async function evaluationDigest(
  profileRevision: string,
  serializedInput: string,
): Promise<string> {
  const payload = new TextEncoder().encode(
    `${RULES_EVALUATION_CACHE_VERSION}\0${profileRevision}\0${serializedInput}`,
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

class MemoizedRulesClient implements RulesRuntimeClient {
  readonly #delegate: RulesRuntimeClient;
  readonly #persistentCache: EvaluationCacheStore;
  readonly #evaluations = new Map<string, Promise<EvaluatedCharacter>>();
  #profileRevision: string | undefined;

  constructor(
    delegate: RulesRuntimeClient,
    persistentCache: EvaluationCacheStore,
  ) {
    this.#delegate = delegate;
    this.#persistentCache = persistentCache;
  }

  initialize(packId: string, contentDigest?: string): Promise<void> {
    this.#profileRevision =
      contentDigest === undefined ? undefined : `${packId}\0${contentDigest}`;
    return this.#delegate.initialize(packId, contentDigest);
  }

  evaluate(input: EvaluationInput): Promise<EvaluatedCharacter> {
    const serializedInput = serializeEvaluationInput(input);
    const existing = this.#evaluations.get(serializedInput);
    if (existing !== undefined) return existing;
    const result = this.#evaluatePersistent(input, serializedInput).catch(
      (error: unknown) => {
        this.#evaluations.delete(serializedInput);
        throw error;
      },
    );
    this.#evaluations.set(serializedInput, result);
    while (this.#evaluations.size > 32)
      this.#evaluations.delete(this.#evaluations.keys().next().value as string);
    return result;
  }

  async #evaluatePersistent(
    input: EvaluationInput,
    serializedInput: string,
  ): Promise<EvaluatedCharacter> {
    const startedAt = performance.now();
    const profileRevision = this.#profileRevision;
    if (profileRevision !== undefined && isPersistentEvaluation(input)) {
      let persistentKey: string | undefined;
      try {
        persistentKey = await evaluationDigest(
          profileRevision,
          serializedInput,
        );
        const cached = await this.#persistentCache.get(
          persistentKey,
          RULES_EVALUATION_CACHE_VERSION,
          profileRevision,
        );
        if (isEvaluatedCharacter(cached, input)) {
          recordLoadDuration("rules-evaluation", startedAt, {
            source: "persistent-cache",
            level: input.level,
          });
          return cached;
        }
        if (cached !== undefined)
          await this.#persistentCache
            .delete(persistentKey)
            .catch(() => undefined);
      } catch {
        // Derived storage and hashing are optional. Evaluation remains canonical.
      }
      const evaluated = await this.#delegate.evaluate(input);
      recordLoadDuration("rules-evaluation", startedAt, {
        source: "worker",
        level: input.level,
      });
      if (persistentKey !== undefined)
        void this.#persistentCache
          .put(
            persistentKey,
            RULES_EVALUATION_CACHE_VERSION,
            profileRevision,
            evaluated,
          )
          .catch(() => undefined);
      return evaluated;
    }
    const evaluated = await this.#delegate.evaluate(input);
    recordLoadDuration("rules-evaluation", startedAt, {
      source: "worker-no-persistent-cache",
      level: input.level,
    });
    return evaluated;
  }

  previewProfileMigration(
    build: CharacterBuild,
    targetPackId: string,
    sourcePackId?: string,
    sourceContentDigest?: string,
  ): Promise<ProfileMigrationPreview> {
    return this.#delegate.previewProfileMigration(
      build,
      targetPackId,
      sourcePackId,
      sourceContentDigest,
    );
  }

  terminate(reason?: string): void {
    this.#evaluations.clear();
    this.#delegate.terminate(reason);
  }
}

export interface AppContentRuntimeOptions {
  readonly loadPack?: (packId: string) => Promise<ContentPack | undefined>;
  readonly createQueryClient?: () => QueryRuntimeClient;
  readonly createRulesClient?: () => RulesRuntimeClient;
  readonly evaluationCache?: EvaluationCacheStore;
  readonly retainedPackCount?: number;
}

/**
 * Owns immutable content-derived state for the lifetime of the SPA document.
 * Route components borrow these objects; they do not own or terminate them.
 */
export class AppContentRuntime {
  readonly #loadPack: (packId: string) => Promise<ContentPack | undefined>;
  readonly #createQueryClient: () => QueryRuntimeClient;
  readonly #createRulesClient: () => RulesRuntimeClient;
  readonly #retainedPackCount: number;
  readonly #evaluationCache: EvaluationCacheStore;
  readonly #packs = new Map<
    string,
    { ready: Promise<ContentPack | undefined>; used: number }
  >();
  readonly #queries = new Map<string, QueryEntry>();
  readonly #rules = new Map<string, RulesEntry>();
  #clock = 0;

  constructor(options: AppContentRuntimeOptions = {}) {
    const repository = new ContentPackRepository();
    this.#loadPack = options.loadPack ?? ((packId) => repository.get(packId));
    this.#createQueryClient =
      options.createQueryClient ?? (() => new QueryWorkerClient());
    this.#createRulesClient =
      options.createRulesClient ?? (() => new RulesWorkerClient());
    this.#evaluationCache =
      options.evaluationCache ?? new EvaluationCacheRepository();
    this.#retainedPackCount = options.retainedPackCount ?? 2;
  }

  getPack(packId: string): Promise<ContentPack | undefined> {
    const existing = this.#packs.get(packId);
    if (existing !== undefined) {
      existing.used = ++this.#clock;
      return existing.ready;
    }
    const startedAt = performance.now();
    const entry = {
      ready: this.#loadPack(packId)
        .then((pack) => {
          recordLoadDuration("content-pack-ready", startedAt, {
            packId,
            source: "storage",
            recordCount: pack?.entities.length ?? 0,
          });
          return pack;
        })
        .catch((error: unknown) => {
          this.#packs.delete(packId);
          throw error;
        }),
      used: ++this.#clock,
    };
    this.#packs.set(packId, entry);
    this.#evictOldest(this.#packs);
    return entry.ready;
  }

  async getQueryClient(
    packId: string,
    onProgress?: QueryProgressHandler,
  ): Promise<{
    readonly client: QueryRuntimeClient;
    readonly info: QueryIndexInfo;
  }> {
    let entry = this.#queries.get(packId);
    if (entry === undefined) {
      const client = this.#createQueryClient();
      entry = {
        client,
        ready: Promise.resolve()
          .then(() => client.initialize(packId))
          .catch((error: unknown) => {
            this.#queries.delete(packId);
            client.terminate("Content query initialization failed");
            throw error;
          }),
        used: ++this.#clock,
      };
      this.#queries.set(packId, entry);
      this.#evictOldest(this.#queries, (discarded) =>
        discarded.client.terminate("Cached content query profile evicted"),
      );
    } else {
      entry.used = ++this.#clock;
    }
    const unsubscribe =
      onProgress === undefined
        ? undefined
        : entry.client.subscribeProgress(onProgress);
    try {
      return { client: entry.client, info: await entry.ready };
    } finally {
      unsubscribe?.();
    }
  }

  async getRulesClient(
    packId: string,
    contentDigest?: string,
  ): Promise<RulesRuntimeClient> {
    const key = `${packId}\0${contentDigest ?? ""}`;
    let entry = this.#rules.get(key);
    if (entry === undefined) {
      const startedAt = performance.now();
      const client = new MemoizedRulesClient(
        this.#createRulesClient(),
        this.#evaluationCache,
      );
      entry = {
        client,
        ready: client
          .initialize(packId, contentDigest)
          .then(() => {
            recordLoadDuration("rules-worker-ready", startedAt, {
              packId,
            });
            return client;
          })
          .catch((error: unknown) => {
            this.#rules.delete(key);
            client.terminate("Rules initialization failed");
            throw error;
          }),
        used: ++this.#clock,
      };
      this.#rules.set(key, entry);
      this.#evictOldest(this.#rules, (discarded) =>
        discarded.client.terminate("Cached rules profile evicted"),
      );
    } else {
      entry.used = ++this.#clock;
    }
    return entry.ready;
  }

  clear(): void {
    for (const entry of this.#queries.values())
      entry.client.terminate("Content runtime cleared");
    for (const entry of this.#rules.values())
      entry.client.terminate("Content runtime cleared");
    this.#packs.clear();
    this.#queries.clear();
    this.#rules.clear();
  }

  #evictOldest<T extends { used: number }>(
    cache: Map<string, T>,
    dispose?: (entry: T) => void,
  ): void {
    while (cache.size > this.#retainedPackCount) {
      const oldest = [...cache].reduce((left, right) =>
        left[1].used <= right[1].used ? left : right,
      );
      cache.delete(oldest[0]);
      dispose?.(oldest[1]);
    }
  }
}

export const appContentRuntime = new AppContentRuntime();
