import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CompendiumQuery,
  CompendiumQueryResult,
  EntityRelationships,
} from "@4ecb/query-engine";

import type {
  QueryWorkerRequest,
  QueryWorkerResponse,
} from "./query-worker-messages";

export interface QueryIndexInfo {
  readonly packId: string;
  readonly contentDigest: string;
  readonly recordCount: number;
  readonly elapsedMilliseconds: number;
}

export type QueryProgressHandler = (
  phase: "loading-pack" | "building-index",
  recordCount?: number,
) => void;

interface PendingRequest {
  readonly resolve: (response: QueryWorkerResponse) => void;
  readonly reject: (reason: Error) => void;
}

type QueryWorkerRequestWithoutId =
  | Omit<Extract<QueryWorkerRequest, { type: "initialize" }>, "requestId">
  | Omit<Extract<QueryWorkerRequest, { type: "query" }>, "requestId">
  | Omit<Extract<QueryWorkerRequest, { type: "get-entity" }>, "requestId">
  | Omit<
      Extract<QueryWorkerRequest, { type: "get-relationships" }>,
      "requestId"
    >;

export class QueryWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #onProgress: QueryProgressHandler;
  #nextRequestId = 1;

  constructor(onProgress: QueryProgressHandler) {
    this.#onProgress = onProgress;
    this.#worker = new Worker(new URL("./query.worker.ts", import.meta.url), {
      type: "module",
    });
    this.#worker.onmessage = (event: MessageEvent<QueryWorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        this.#onProgress(response.phase, response.recordCount);
        return;
      }
      const pending = this.#pending.get(response.requestId);
      if (pending === undefined) return;
      this.#pending.delete(response.requestId);
      if (response.type === "error")
        pending.reject(new Error(response.message));
      else pending.resolve(response);
    };
    this.#worker.onerror = (event) => {
      this.#rejectAll(new Error(event.message || "Compendium worker failed"));
    };
  }

  async initialize(packId: string): Promise<QueryIndexInfo> {
    const response = await this.#request({ type: "initialize", packId });
    if (response.type !== "initialized")
      throw new Error("Unexpected initialize response");
    return response;
  }

  async query(query: CompendiumQuery): Promise<CompendiumQueryResult> {
    const response = await this.#request({ type: "query", query });
    if (response.type !== "query-result")
      throw new Error("Unexpected query response");
    return response.result;
  }

  async getEntity(entityId: string): Promise<ContentEntity | undefined> {
    const response = await this.#request({ type: "get-entity", entityId });
    if (response.type !== "entity-result")
      throw new Error("Unexpected entity response");
    return response.entity;
  }

  async relationships(
    entityId: string,
  ): Promise<EntityRelationships | undefined> {
    const response = await this.#request({
      type: "get-relationships",
      entityId,
    });
    if (response.type !== "relationships-result")
      throw new Error("Unexpected relationship response");
    return response.relationships;
  }

  terminate(reason = "Compendium operation cancelled"): void {
    this.#worker.terminate();
    this.#rejectAll(new Error(reason));
  }

  #request(request: QueryWorkerRequestWithoutId): Promise<QueryWorkerResponse> {
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
