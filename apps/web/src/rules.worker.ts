/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentEntity } from "@4ecb/content-domain";
import { evaluateCharacter, previewProfileMigration } from "@4ecb/rules-engine";

import type {
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";

const worker = self as DedicatedWorkerGlobalScope;
let entities: readonly ContentEntity[] | undefined;

function respond(message: RulesWorkerResponse): void {
  worker.postMessage(message);
}

async function handle(request: RulesWorkerRequest): Promise<void> {
  switch (request.type) {
    case "initialize": {
      const pack = await new ContentPackRepository().get(request.packId);
      if (pack === undefined)
        throw new Error(
          `Installed content pack ${request.packId} was not found`,
        );
      entities = pack.entities;
      respond({
        type: "initialized",
        requestId: request.requestId,
        packId: request.packId,
        recordCount: entities.length,
      });
      break;
    }
    case "evaluate": {
      if (entities === undefined)
        throw new Error("The rules worker is not ready");
      const started = performance.now();
      const result = evaluateCharacter(request.input, entities);
      respond({
        type: "evaluation",
        requestId: request.requestId,
        result,
        elapsedMilliseconds: performance.now() - started,
      });
      break;
    }
    case "preview-profile-migration": {
      const repository = new ContentPackRepository();
      const [source, target] = await Promise.all([
        request.sourcePackId === undefined
          ? Promise.resolve(undefined)
          : repository.get(request.sourcePackId),
        repository.get(request.targetPackId),
      ]);
      if (target === undefined)
        throw new Error(
          `Installed target content pack ${request.targetPackId} was not found`,
        );
      const started = performance.now();
      const sourceMatchesBinding =
        source !== undefined &&
        (request.sourceContentDigest === undefined ||
          source.manifest.contentDigest === request.sourceContentDigest);
      const result = previewProfileMigration(
        request.build,
        sourceMatchesBinding ? source.entities : undefined,
        target.entities,
      );
      respond({
        type: "profile-migration-preview",
        requestId: request.requestId,
        result,
        elapsedMilliseconds: performance.now() - started,
      });
      break;
    }
  }
}

worker.onmessage = (event: MessageEvent<RulesWorkerRequest>) => {
  const request = event.data;
  void handle(request).catch((error: unknown) => {
    respond({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};
