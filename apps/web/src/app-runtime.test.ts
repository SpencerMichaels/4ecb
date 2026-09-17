import { describe, expect, it, vi } from "vitest";

import type { ContentPack } from "@4ecb/content-pack";
import type { EvaluatedCharacter, EvaluationInput } from "@4ecb/rules-engine";
import { RULES_EVALUATION_CACHE_VERSION } from "@4ecb/rules-engine";

import {
  AppContentRuntime,
  type EvaluationCacheStore,
  type QueryRuntimeClient,
  type RulesRuntimeClient,
} from "./app-runtime";

function evaluation(level = 1): EvaluatedCharacter {
  return {
    level,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [],
    activeDefinitionIds: [],
    activeDefinitions: [],
    choices: [],
    stats: {},
    textStrings: {},
    overlays: [],
    powers: [],
    suggestions: [],
    diagnostics: [],
  };
}

function evaluationCache(): EvaluationCacheStore & {
  readonly get: ReturnType<typeof vi.fn>;
  readonly put: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
} {
  const values = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, _engine, _profile, result: unknown) => {
      values.set(key, result);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

function pack(packId: string): ContentPack {
  return {
    format: "4ecb-content-pack",
    manifest: {
      formatVersion: 1,
      packId,
      name: packId,
      contentDigest: `digest-${packId}`,
      gameSystem: "D&D4E",
      sourceKey: "test",
      recordCount: 0,
      typeCounts: [],
      accounting: {
        topLevelRecords: 0,
        acceptedRecords: 0,
        warnedRecords: 0,
        rejectedRecords: 0,
        rawTopLevelElements: 0,
      },
      diagnosticCounts: { error: 0, warning: 0, info: 0 },
    },
    entities: [],
    rejected: [],
    rawTopLevel: [],
    diagnostics: [],
  };
}

function queryClient(initialize: ReturnType<typeof vi.fn>): QueryRuntimeClient {
  return {
    initialize,
    query: vi.fn(),
    getEntity: vi.fn(),
    relationships: vi.fn(),
    subscribeProgress: vi.fn(() => vi.fn()),
    terminate: vi.fn(),
  } as QueryRuntimeClient;
}

function rulesClient(
  initialize: ReturnType<typeof vi.fn>,
  evaluate: RulesRuntimeClient["evaluate"] = vi.fn(
    async () => ({}) as EvaluatedCharacter,
  ),
): RulesRuntimeClient {
  return {
    initialize,
    evaluate,
    previewProfileMigration: vi.fn(),
    terminate: vi.fn(),
  } as RulesRuntimeClient;
}

describe("application content runtime", () => {
  it("deduplicates pack decoding and worker initialization across route users", async () => {
    const loadPack = vi.fn(async (packId: string) => pack(packId));
    const queryInitialize = vi.fn(async (packId: string) => ({
      packId,
      contentDigest: `digest-${packId}`,
      recordCount: 0,
      elapsedMilliseconds: 1,
    }));
    const rulesInitialize = vi.fn(async () => undefined);
    const query = queryClient(queryInitialize);
    const rules = rulesClient(rulesInitialize);
    const runtime = new AppContentRuntime({
      loadPack,
      createQueryClient: () => query,
      createRulesClient: () => rules,
    });

    const [firstPack, secondPack] = await Promise.all([
      runtime.getPack("core"),
      runtime.getPack("core"),
    ]);
    const [firstQuery, secondQuery] = await Promise.all([
      runtime.getQueryClient("core"),
      runtime.getQueryClient("core"),
    ]);
    const [firstRules, secondRules] = await Promise.all([
      runtime.getRulesClient("core", "digest-core"),
      runtime.getRulesClient("core", "digest-core"),
    ]);

    expect(firstPack).toBe(secondPack);
    expect(loadPack).toHaveBeenCalledOnce();
    expect(firstQuery.client).toBe(secondQuery.client);
    expect(queryInitialize).toHaveBeenCalledOnce();
    expect(firstRules).toBe(secondRules);
    expect(rulesInitialize).toHaveBeenCalledOnce();
    await Promise.all([
      firstRules.evaluate({} as EvaluationInput),
      secondRules.evaluate({} as EvaluationInput),
    ]);
    expect(rules.evaluate).toHaveBeenCalledOnce();
  });

  it("clears decoded data and terminates retained workers after content changes", async () => {
    const query = queryClient(
      vi.fn(async (packId: string) => ({
        packId,
        contentDigest: `digest-${packId}`,
        recordCount: 0,
        elapsedMilliseconds: 1,
      })),
    );
    const rules = rulesClient(vi.fn(async () => undefined));
    const loadPack = vi.fn(async (packId: string) => pack(packId));
    const runtime = new AppContentRuntime({
      loadPack,
      createQueryClient: () => query,
      createRulesClient: () => rules,
    });
    await runtime.getPack("core");
    await runtime.getQueryClient("core");
    await runtime.getRulesClient("core", "digest-core");

    runtime.clear();
    await runtime.getPack("core");

    expect(query.terminate).toHaveBeenCalledOnce();
    expect(rules.terminate).toHaveBeenCalledOnce();
    expect(loadPack).toHaveBeenCalledTimes(2);
  });

  it("reuses an exact persisted evaluation across document runtimes", async () => {
    const cache = evaluationCache();
    const firstEvaluate = vi.fn(async () => evaluation(8));
    const first = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          firstEvaluate,
        ),
    });
    const input = {
      level: 8,
      baseAbilities: {},
      occurrences: [],
      inventory: [],
      candidateDetailLevels: [8],
      includePowers: false,
    } satisfies EvaluationInput;

    const firstClient = await first.getRulesClient("core", "digest-core");
    await expect(firstClient.evaluate(input)).resolves.toEqual(evaluation(8));
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce());

    const secondEvaluate = vi.fn(async () => evaluation(8));
    const second = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          secondEvaluate,
        ),
    });
    const secondClient = await second.getRulesClient("core", "digest-core");

    await expect(secondClient.evaluate(input)).resolves.toEqual(evaluation(8));
    expect(firstEvaluate).toHaveBeenCalledOnce();
    expect(secondEvaluate).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenLastCalledWith(
      expect.any(String),
      RULES_EVALUATION_CACHE_VERSION,
      "core\0digest-core",
    );
  });

  it("misses for changed inputs and changed profile revisions", async () => {
    const cache = evaluationCache();
    const evaluate = vi.fn(async (input: EvaluationInput) =>
      evaluation(input.level),
    );
    const first = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          evaluate,
        ),
    });
    const input = {
      level: 4,
      baseAbilities: {},
      occurrences: [],
      inventory: [],
      candidateDetailLevels: [4],
      includePowers: false,
    } satisfies EvaluationInput;
    await (await first.getRulesClient("core", "digest-1")).evaluate(input);
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce());

    const secondEvaluate = vi.fn(async (next: EvaluationInput) =>
      evaluation(next.level),
    );
    const second = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          secondEvaluate,
        ),
    });
    const sameProfile = await second.getRulesClient("core", "digest-1");
    await sameProfile.evaluate({ ...input, level: 5 });
    const changedProfile = await second.getRulesClient("core", "digest-2");
    await changedProfile.evaluate(input);

    expect(secondEvaluate).toHaveBeenCalledTimes(2);
    expect(cache.get.mock.calls.at(-1)?.[2]).toBe("core\0digest-2");
  });

  it("recovers from a malformed persisted result", async () => {
    const cache = evaluationCache();
    cache.get.mockResolvedValueOnce({ level: 8, legal: true });
    const evaluated = evaluation(8);
    const delegateEvaluate = vi.fn(async () => evaluated);
    const runtime = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          delegateEvaluate,
        ),
    });
    const client = await runtime.getRulesClient("core", "digest-core");

    await expect(
      client.evaluate({
        level: 8,
        baseAbilities: {},
        occurrences: [],
        inventory: [],
        candidateDetailLevels: [8],
        includePowers: false,
      }),
    ).resolves.toEqual(evaluated);

    expect(cache.delete).toHaveBeenCalledOnce();
    expect(delegateEvaluate).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce());
  });

  it("falls back to canonical evaluation when cache reads or writes fail", async () => {
    const unreadable = evaluationCache();
    unreadable.get.mockRejectedValueOnce(new Error("storage unavailable"));
    unreadable.put.mockRejectedValueOnce(new Error("quota exceeded"));
    const delegateEvaluate = vi.fn(async () => evaluation(3));
    const runtime = new AppContentRuntime({
      evaluationCache: unreadable,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          delegateEvaluate,
        ),
    });
    const client = await runtime.getRulesClient("core", "digest-core");

    await expect(
      client.evaluate({
        level: 3,
        baseAbilities: {},
        occurrences: [],
        inventory: [],
        candidateDetailLevels: [],
        includePowers: false,
      }),
    ).resolves.toEqual(evaluation(3));

    expect(delegateEvaluate).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(unreadable.put).toHaveBeenCalledOnce());
  });

  it("normalizes the default power mode but isolates omitted-power results", async () => {
    const cache = evaluationCache();
    const delegateEvaluate = vi.fn(async (input: EvaluationInput) => ({
      ...evaluation(2),
      powers: input.includePowers === false ? [] : ([{ id: "power" }] as never),
    }));
    const runtime = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          delegateEvaluate,
        ),
    });
    const client = await runtime.getRulesClient("core", "digest-core");
    const base = {
      level: 2,
      baseAbilities: {},
      occurrences: [],
      inventory: [],
      candidateDetailLevels: [],
    } satisfies EvaluationInput;

    await client.evaluate(base);
    await client.evaluate({ ...base, includePowers: true });
    await client.evaluate({ ...base, includePowers: false });

    expect(delegateEvaluate).toHaveBeenCalledTimes(2);
  });

  it("does not persist unscoped exhaustive evaluations", async () => {
    const cache = evaluationCache();
    const evaluate = vi.fn(async () => evaluation());
    const runtime = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          evaluate,
        ),
    });
    const client = await runtime.getRulesClient("core", "digest-core");

    await client.evaluate({
      level: 1,
      baseAbilities: {},
      occurrences: [],
      inventory: [],
    });

    expect(evaluate).toHaveBeenCalledOnce();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does not persist evaluations without an exact content digest", async () => {
    const cache = evaluationCache();
    const evaluate = vi.fn(async () => evaluation());
    const runtime = new AppContentRuntime({
      evaluationCache: cache,
      createRulesClient: () =>
        rulesClient(
          vi.fn(async () => undefined),
          evaluate,
        ),
    });
    const client = await runtime.getRulesClient("legacy-without-digest");

    await client.evaluate({
      level: 1,
      baseAbilities: {},
      occurrences: [],
      inventory: [],
    });

    expect(evaluate).toHaveBeenCalledOnce();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
