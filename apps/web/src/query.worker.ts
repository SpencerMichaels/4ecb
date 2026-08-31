/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import { CompendiumIndex } from "@4ecb/query-engine";

import type {
  QueryWorkerRequest,
  QueryWorkerResponse,
} from "./query-worker-messages";

const worker = self as DedicatedWorkerGlobalScope;
let index: CompendiumIndex | undefined;

function respond(message: QueryWorkerResponse): void {
  worker.postMessage(message);
}

function requireIndex(): CompendiumIndex {
  if (index === undefined) throw new Error("The compendium index is not ready");
  return index;
}

async function handle(request: QueryWorkerRequest): Promise<void> {
  switch (request.type) {
    case "initialize": {
      const started = performance.now();
      respond({
        type: "progress",
        requestId: request.requestId,
        phase: "loading-pack",
      });
      const pack = await new ContentPackRepository().get(request.packId);
      if (pack === undefined) {
        throw new Error(
          `Installed content pack ${request.packId} was not found`,
        );
      }
      respond({
        type: "progress",
        requestId: request.requestId,
        phase: "building-index",
        recordCount: pack.entities.length,
      });
      const built = new CompendiumIndex(pack.entities);
      index = built;
      respond({
        type: "initialized",
        requestId: request.requestId,
        packId: request.packId,
        contentDigest: pack.manifest.contentDigest,
        recordCount: built.size,
        elapsedMilliseconds: performance.now() - started,
      });
      break;
    }
    case "query":
      respond({
        type: "query-result",
        requestId: request.requestId,
        result: requireIndex().query(request.query),
      });
      break;
    case "get-entity":
      const entity = requireIndex().getEntity(request.entityId);
      respond({
        type: "entity-result",
        requestId: request.requestId,
        ...(entity === undefined ? {} : { entity }),
      });
      break;
    case "get-relationships":
      const relationships = requireIndex().relationships(request.entityId);
      respond({
        type: "relationships-result",
        requestId: request.requestId,
        ...(relationships === undefined ? {} : { relationships }),
      });
      break;
  }
}

worker.onmessage = (event: MessageEvent<QueryWorkerRequest>) => {
  const request = event.data;
  void handle(request).catch((error: unknown) => {
    respond({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};

worker.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  respond({
    type: "error",
    requestId: 0,
    message:
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason),
  });
});
