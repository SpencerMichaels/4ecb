import { afterEach, describe, expect, it, vi } from "vitest";

import type * as RulesEngine from "@4ecb/rules-engine";
import type { EvaluationInput } from "@4ecb/rules-engine";

import type {
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";

const evaluated = vi.hoisted(() => [] as number[]);

vi.mock("@4ecb/browser-storage", () => ({
  ContentPackRepository: class {
    async manifest() {
      return { packId: "core", contentDigest: "digest", recordCount: 0 };
    }
    async get() {
      return { manifest: { contentDigest: "digest" }, entities: [] };
    }
  },
}));

vi.mock("@4ecb/rules-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof RulesEngine>()),
  evaluateCharacter: (input: EvaluationInput) => {
    evaluated.push(input.level);
    return { level: input.level };
  },
}));

describe("rules worker evaluation queue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips queued evaluations cancelled before they start", async () => {
    const responses: RulesWorkerResponse[] = [];
    const scope: {
      onmessage?: (event: MessageEvent<RulesWorkerRequest>) => void;
      postMessage: (message: RulesWorkerResponse) => void;
    } = { postMessage: (message) => responses.push(message) };
    vi.stubGlobal("self", scope);
    await import("./rules.worker");
    const send = (request: RulesWorkerRequest) =>
      scope.onmessage?.({ data: request } as MessageEvent<RulesWorkerRequest>);
    const evaluate = (requestId: number, level: number) =>
      send({
        type: "evaluate",
        requestId,
        input: { level } as EvaluationInput,
      });

    send({ type: "initialize", requestId: 1, packId: "core" });
    await vi.waitFor(() =>
      expect(responses.some(({ type }) => type === "initialized")).toBe(true),
    );
    evaluate(2, 3);
    evaluate(3, 4);
    evaluate(4, 5);
    send({ type: "cancel", requestId: 2 });
    send({ type: "cancel", requestId: 3 });

    await vi.waitFor(() =>
      expect(
        responses.filter(({ type }) => type === "evaluation"),
      ).toHaveLength(1),
    );
    expect(evaluated).toEqual([5]);
    expect(
      responses.flatMap((response) =>
        response.type === "evaluation" || response.type === "error"
          ? [response.requestId]
          : [],
      ),
    ).toEqual([4]);
  });
});
