import { describe, expect, it, vi } from "vitest";

import type { EvaluationInput } from "@4ecb/rules-engine";

import type {
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";

// The worker feeds each loaded pack's campaign restrictions (D116) to the
// engine: evaluate, library summaries, ritual fills, and each side of a
// migration preview from its own pack.
const calls = vi.hoisted(() => ({
  evaluated: [] as (readonly string[] | undefined)[],
  fills: [] as (readonly string[] | undefined)[],
  previews: [] as Record<string, unknown>[],
}));

const packs = vi.hoisted(
  () =>
    ({
      campaign: {
        manifest: { contentDigest: "campaign-digest" },
        entities: [],
        campaign: {
          campaignId: "golarion",
          revision: 1,
          contentDigest: "doc",
          restrictedIds: ["ID_DEITY_STOCK"],
        },
      },
      newer: {
        manifest: { contentDigest: "newer-digest" },
        entities: [],
        campaign: {
          campaignId: "golarion",
          revision: 2,
          contentDigest: "doc-2",
          restrictedIds: ["ID_DEITY_STOCK", "ID_ITEM_STOCK"],
        },
      },
      plain: { manifest: { contentDigest: "plain-digest" }, entities: [] },
    }) as Record<string, unknown>,
);

vi.mock("@4ecb/browser-storage", () => ({
  ContentPackRepository: class {
    async manifest() {
      return {
        packId: "campaign",
        contentDigest: "campaign-digest",
        recordCount: 0,
      };
    }
    async get(packId: string) {
      return packs[packId];
    }
  },
}));

vi.mock("@4ecb/rules-engine", () => ({
  evaluateCharacter: (input: EvaluationInput) => {
    calls.evaluated.push(input.restrictedDefinitionIds);
    return { level: input.level };
  },
  fillRitualChoicesFromKnown: (
    build: unknown,
    _entities: unknown,
    restrictedDefinitionIds?: readonly string[],
  ) => {
    calls.fills.push(restrictedDefinitionIds);
    return { build, fills: [] };
  },
  previewProfileMigration: (
    _build: unknown,
    _source: unknown,
    _target: unknown,
    options: Record<string, unknown>,
  ) => {
    calls.previews.push(
      Object.fromEntries(
        Object.entries(options).filter(([name]) => name !== "onProgress"),
      ),
    );
    return {};
  },
}));

vi.mock("./library-summary", () => ({
  libraryCharacterSummary: () => ({}),
  libraryEvaluationInput: () => ({ level: 1 }),
}));

describe("rules worker campaign restrictions", () => {
  it("evaluates under each loaded pack's restricted IDs", async () => {
    const waiting = new Map<number, () => void>();
    const scope: {
      onmessage?: (event: MessageEvent<RulesWorkerRequest>) => void;
      postMessage: (message: RulesWorkerResponse) => void;
    } = {
      postMessage: (message) => {
        if (message.type === "error") throw new Error(message.message);
        if ("requestId" in message && message.type !== "evaluation-progress")
          waiting.get(message.requestId)?.();
      },
    };
    vi.stubGlobal("self", scope);
    await import("./rules.worker");
    const request = (value: RulesWorkerRequest) =>
      new Promise<void>((resolve) => {
        waiting.set(value.requestId, resolve);
        scope.onmessage?.({ data: value } as MessageEvent<RulesWorkerRequest>);
      });
    const build = {} as never;

    await request({ type: "initialize", requestId: 1, packId: "campaign" });
    await request({
      type: "evaluate",
      requestId: 2,
      input: { level: 1 } as EvaluationInput,
    });
    await request({ type: "library-summary", requestId: 3, build });
    await request({ type: "fill-ritual-choices", requestId: 4, build });
    expect(calls.evaluated).toEqual([["ID_DEITY_STOCK"], ["ID_DEITY_STOCK"]]);
    expect(calls.fills).toEqual([["ID_DEITY_STOCK"]]);

    // Source reused from the worker's pack; target decoded with its own.
    await request({
      type: "preview-profile-migration",
      requestId: 5,
      build,
      sourcePackId: "campaign",
      targetPackId: "newer",
    });
    // A decoded source carries its own (here none); so does the target.
    await request({
      type: "preview-profile-migration",
      requestId: 6,
      build,
      sourcePackId: "plain",
      targetPackId: "campaign",
    });
    expect(calls.previews).toEqual([
      {
        sourceRestrictedDefinitionIds: ["ID_DEITY_STOCK"],
        targetRestrictedDefinitionIds: ["ID_DEITY_STOCK", "ID_ITEM_STOCK"],
      },
      { targetRestrictedDefinitionIds: ["ID_DEITY_STOCK"] },
    ]);
    vi.unstubAllGlobals();
  });
});
