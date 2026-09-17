/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentEntity } from "@4ecb/content-domain";
import { evaluateCharacter, previewProfileMigration } from "@4ecb/rules-engine";

import type {
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";
import { contentProfileMatchesRevision } from "./profile-migration";

const worker = self as DedicatedWorkerGlobalScope;
let entities: readonly ContentEntity[] | undefined;
let entitiesReady: Promise<readonly ContentEntity[]> | undefined;
let initializedProfile:
  { readonly packId: string; readonly contentDigest: string } | undefined;

function respond(message: RulesWorkerResponse): void {
  worker.postMessage(message);
}

async function evaluationEntities(): Promise<readonly ContentEntity[]> {
  if (entities !== undefined) return entities;
  if (entitiesReady !== undefined) return entitiesReady;
  if (initializedProfile === undefined)
    throw new Error("The rules worker is not ready");
  const profile = initializedProfile;
  entitiesReady = new ContentPackRepository()
    .get(profile.packId)
    .then((pack) => {
      if (pack === undefined)
        throw new Error(
          `Installed content pack ${profile.packId} was not found`,
        );
      if (pack.manifest.contentDigest !== profile.contentDigest)
        throw new Error(
          `Installed content pack ${profile.packId} no longer matches the bound revision`,
        );
      entities = pack.entities;
      return entities;
    })
    .catch((error: unknown) => {
      entitiesReady = undefined;
      throw error;
    });
  return entitiesReady;
}

async function handle(request: RulesWorkerRequest): Promise<void> {
  switch (request.type) {
    case "initialize": {
      const manifest = await new ContentPackRepository().manifest(
        request.packId,
      );
      if (manifest === undefined)
        throw new Error(
          `Installed content pack ${request.packId} was not found`,
        );
      if (
        !contentProfileMatchesRevision(
          {
            packId: request.packId,
            ...(request.contentDigest === undefined
              ? {}
              : { contentDigest: request.contentDigest }),
          },
          manifest,
        )
      )
        throw new Error(
          `Installed content pack ${request.packId} no longer matches the bound revision`,
        );
      initializedProfile = {
        packId: request.packId,
        contentDigest: manifest.contentDigest,
      };
      entities = undefined;
      entitiesReady = undefined;
      respond({
        type: "initialized",
        requestId: request.requestId,
        packId: request.packId,
        contentDigest: manifest.contentDigest,
        recordCount: manifest.recordCount,
      });
      break;
    }
    case "evaluate": {
      const started = performance.now();
      const evaluationContent = await evaluationEntities();
      const evaluationStarted = performance.now();
      const result = evaluateCharacter(request.input, evaluationContent);
      const completed = performance.now();
      respond({
        type: "evaluation",
        requestId: request.requestId,
        result,
        elapsedMilliseconds: completed - started,
        contentLoadMilliseconds: evaluationStarted - started,
        evaluationMilliseconds: completed - evaluationStarted,
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
