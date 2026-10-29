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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips queued evaluations cancelled before they start", async () => {
    // Sequenced explicitly (promises resolved by postMessage, fake timers for
    // the queue's yield) rather than polled with vi.waitFor, whose real-time
    // timeout made this fail under machine load.
    const responses: RulesWorkerResponse[] = [];
    const waiting = new Map<RulesWorkerResponse["type"], () => void>();
    const received = (type: RulesWorkerResponse["type"]) =>
      new Promise<void>((resolve) => waiting.set(type, resolve));
    const scope: {
      onmessage?: (event: MessageEvent<RulesWorkerRequest>) => void;
      postMessage: (message: RulesWorkerResponse) => void;
    } = {
      postMessage: (message) => {
        responses.push(message);
        waiting.get(message.type)?.();
      },
    };
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

    const initialized = received("initialized");
    const contentReady = received("content-progress");
    send({ type: "initialize", requestId: 1, packId: "core" });
    await initialized;
    await contentReady;

    vi.useFakeTimers();
    // Each worker message is its own task, so the cancels arrive after the
    // first evaluate has already scheduled the queue.
    for (const deliver of [
      () => evaluate(2, 3),
      () => evaluate(3, 4),
      () => evaluate(4, 5),
      () => send({ type: "cancel", requestId: 2 }),
      () => send({ type: "cancel", requestId: 3 }),
    ])
      setTimeout(deliver, 0);
    const evaluation = received("evaluation");
    await vi.runAllTimersAsync();
    await evaluation;

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
