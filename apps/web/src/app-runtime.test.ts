import { describe, expect, it, vi } from "vitest";

import type { ContentPack } from "@4ecb/content-pack";
import type { EvaluatedCharacter, EvaluationInput } from "@4ecb/rules-engine";

import {
  AppContentRuntime,
  type QueryRuntimeClient,
  type RulesRuntimeClient,
} from "./app-runtime";

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
  evaluate = vi.fn(async () => ({}) as EvaluatedCharacter),
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
});
