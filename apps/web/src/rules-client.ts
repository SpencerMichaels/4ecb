import type { EvaluatedCharacter, EvaluationInput } from "@4ecb/rules-engine";

import type {
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";

interface PendingRequest {
  readonly resolve: (response: RulesWorkerResponse) => void;
  readonly reject: (reason: Error) => void;
}

type RequestWithoutId =
  | Omit<Extract<RulesWorkerRequest, { type: "initialize" }>, "requestId">
  | Omit<Extract<RulesWorkerRequest, { type: "evaluate" }>, "requestId">;

export class RulesWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  #nextRequestId = 1;

  constructor() {
    this.#worker = new Worker(new URL("./rules.worker.ts", import.meta.url), {
      type: "module",
    });
    this.#worker.onmessage = (event: MessageEvent<RulesWorkerResponse>) => {
      const response = event.data;
      const pending = this.#pending.get(response.requestId);
      if (pending === undefined) return;
      this.#pending.delete(response.requestId);
      if (response.type === "error")
        pending.reject(new Error(response.message));
      else pending.resolve(response);
    };
    this.#worker.onerror = (event) => {
      this.#rejectAll(new Error(event.message || "Rules worker failed"));
    };
  }

  async initialize(packId: string): Promise<void> {
    const response = await this.#request({ type: "initialize", packId });
    if (response.type !== "initialized")
      throw new Error("Unexpected rules-worker initialization response");
  }

  async evaluate(input: EvaluationInput): Promise<EvaluatedCharacter> {
    const response = await this.#request({ type: "evaluate", input });
    if (response.type !== "evaluation")
      throw new Error("Unexpected rules-worker evaluation response");
    return response.result;
  }

  terminate(reason = "Rules evaluation cancelled"): void {
    this.#worker.terminate();
    this.#rejectAll(new Error(reason));
  }

  #request(request: RequestWithoutId): Promise<RulesWorkerResponse> {
    const requestId = this.#nextRequestId;
    this.#nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      this.#worker.postMessage({ ...request, requestId });
    });
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
