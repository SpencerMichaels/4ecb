import { ContentPackRepository } from "@4ecb/browser-storage";
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

import {
  QueryWorkerClient,
  type QueryIndexInfo,
  type QueryProgressHandler,
} from "./query-client";
import { RulesWorkerClient } from "./rules-client";

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

class MemoizedRulesClient implements RulesRuntimeClient {
  readonly #delegate: RulesRuntimeClient;
  readonly #evaluations = new Map<string, Promise<EvaluatedCharacter>>();

  constructor(delegate: RulesRuntimeClient) {
    this.#delegate = delegate;
  }

  initialize(packId: string, contentDigest?: string): Promise<void> {
    return this.#delegate.initialize(packId, contentDigest);
  }

  evaluate(input: EvaluationInput): Promise<EvaluatedCharacter> {
    const key = JSON.stringify(input);
    const existing = this.#evaluations.get(key);
    if (existing !== undefined) return existing;
    const result = this.#delegate.evaluate(input).catch((error: unknown) => {
      this.#evaluations.delete(key);
      throw error;
    });
    this.#evaluations.set(key, result);
    while (this.#evaluations.size > 32)
      this.#evaluations.delete(this.#evaluations.keys().next().value as string);
    return result;
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
    this.#retainedPackCount = options.retainedPackCount ?? 2;
  }

  getPack(packId: string): Promise<ContentPack | undefined> {
    const existing = this.#packs.get(packId);
    if (existing !== undefined) {
      existing.used = ++this.#clock;
      return existing.ready;
    }
    const entry = {
      ready: this.#loadPack(packId).catch((error: unknown) => {
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
            client.terminate("Compendium initialization failed");
            throw error;
          }),
        used: ++this.#clock,
      };
      this.#queries.set(packId, entry);
      this.#evictOldest(this.#queries, (discarded) =>
        discarded.client.terminate("Cached compendium profile evicted"),
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
      const client = new MemoizedRulesClient(this.#createRulesClient());
      entry = {
        client,
        ready: client
          .initialize(packId, contentDigest)
          .then(() => client)
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
