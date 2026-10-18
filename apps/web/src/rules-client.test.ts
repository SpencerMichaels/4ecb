import { afterEach, describe, expect, it, vi } from "vitest";

import type { EvaluationInput } from "@4ecb/rules-engine";

import { RulesWorkerClient, type RulesProgress } from "./rules-client";
import type {
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";

class FakeWorker {
  static latest: FakeWorker | undefined;
  onmessage: ((event: MessageEvent<RulesWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: RulesWorkerRequest[] = [];
  constructor() {
    FakeWorker.latest = this;
  }
  postMessage(request: RulesWorkerRequest): void {
    this.requests.push(request);
  }
  terminate(): void {}
  reply(response: RulesWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<RulesWorkerResponse>);
  }
}

const input = (level: number) => ({ level }) as unknown as EvaluationInput;

function evaluation(requestId: number): RulesWorkerResponse {
  return {
    type: "evaluation",
    requestId,
    result: {} as never,
    elapsedMilliseconds: 0,
    contentLoadMilliseconds: 0,
    evaluationMilliseconds: 0,
  };
}

describe("rules worker progress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sums interim progress across queued evaluations until idle", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new RulesWorkerClient();
    const worker = FakeWorker.latest!;
    const seen: RulesProgress["evaluation"][] = [];
    client.subscribeProgress(({ evaluation }) => seen.push(evaluation));
    expect(seen).toEqual([undefined]);

    const first = client.evaluate(input(3));
    const second = client.evaluate(input(2));
    const [a, b] = worker.requests.map(({ requestId }) => requestId);
    expect(seen.at(-1)).toEqual({ completed: 0, total: 5 });

    worker.reply({
      type: "evaluation-progress",
      requestId: a!,
      completed: 2,
      total: 3,
    });
    expect(seen.at(-1)).toEqual({ completed: 2, total: 5 });

    worker.reply(evaluation(a!));
    await first;
    expect(seen.at(-1)).toEqual({ completed: 3, total: 5 });

    worker.reply(evaluation(b!));
    await second;
    expect(seen.at(-1)).toEqual({ completed: 5, total: 5 });

    // A later evaluation starts a fresh batch.
    void client.evaluate(input(4));
    expect(seen.at(-1)).toEqual({ completed: 0, total: 4 });
  });
});

describe("rules worker content progress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tracks the worker's content load and replays it to new listeners", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new RulesWorkerClient();
    const worker = FakeWorker.latest!;
    worker.reply({
      type: "content-progress",
      completed: 40,
      total: 100,
      ready: false,
    });
    const seen: RulesProgress[] = [];
    client.subscribeProgress((progress) => seen.push(progress));
    expect(seen.at(-1)?.content).toEqual({
      completed: 40,
      total: 100,
      ready: false,
    });
    worker.reply({
      type: "content-progress",
      completed: 1,
      total: 1,
      ready: true,
    });
    expect(seen.at(-1)?.content?.ready).toBe(true);
  });
});
