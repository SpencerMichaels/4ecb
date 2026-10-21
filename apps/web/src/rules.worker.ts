/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import type { ContentEntity } from "@4ecb/content-domain";
import { evaluateCharacter, previewProfileMigration } from "@4ecb/rules-engine";

import type {
  ProfileMigrationPreviewProgress,
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";
import {
  libraryCharacterSummary,
  libraryEvaluationInput,
} from "./library-summary";
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
    .get(profile.packId, {
      onProgress: ({ completed, total }) =>
        respond({ type: "content-progress", completed, total, ready: false }),
    })
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
      respond({
        type: "content-progress",
        completed: 1,
        total: 1,
        ready: true,
      });
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
      // Load content now rather than on the first evaluation, so it overlaps
      // persistent-cache lookups. Failures resurface on the next evaluate.
      void evaluationEntities().catch(() => undefined);
      break;
    }
    case "evaluate": {
      const started = performance.now();
      const evaluationContent = await evaluationEntities();
      const evaluationStarted = performance.now();
      const result = evaluateCharacter(request.input, evaluationContent, {
        onProgress: ({ completed, total }) =>
          respond({
            type: "evaluation-progress",
            requestId: request.requestId,
            completed,
            total,
          }),
      });
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
    case "library-summary": {
      const content = await evaluationEntities();
      const evaluation = evaluateCharacter(
        libraryEvaluationInput(request.build, content),
        content,
      );
      respond({
        type: "library-summary",
        requestId: request.requestId,
        result: libraryCharacterSummary(
          request.snapshot,
          request.build,
          evaluation,
          content,
        ),
      });
      break;
    }
    case "preview-profile-migration": {
      const repository = new ContentPackRepository();
      const progress = (
        step: ProfileMigrationPreviewProgress["step"],
        sourceAvailable: boolean,
        completed: number,
        total: number,
      ) =>
        respond({
          type: "profile-migration-progress",
          requestId: request.requestId,
          progress: { step, sourceAvailable, completed, total },
        });
      // The worker's own content is usually the character's current pack:
      // reuse it (and its rules index) rather than decoding a second copy.
      const reuseSource =
        request.sourcePackId !== undefined &&
        initializedProfile?.packId === request.sourcePackId &&
        (request.sourceContentDigest === undefined ||
          initializedProfile.contentDigest === request.sourceContentDigest);
      const decodeSource = request.sourcePackId !== undefined && !reuseSource;
      // Packs being decoded load at once, so report their combined bytes.
      const decoded = new Map<string, { completed: number; total: number }>();
      const decodeProgress =
        (pack: string) =>
        ({ completed, total }: { completed: number; total: number }) => {
          decoded.set(pack, { completed, total });
          // Wait for every total, so the combined percentage never dips.
          if (decoded.size < (decodeSource ? 2 : 1)) return;
          let sumCompleted = 0;
          let sumTotal = 0;
          for (const entry of decoded.values()) {
            sumCompleted += entry.completed;
            sumTotal += entry.total;
          }
          progress(
            "content",
            request.sourcePackId !== undefined,
            sumCompleted,
            sumTotal,
          );
        };
      const [sourceEntities, target] = await Promise.all([
        reuseSource
          ? evaluationEntities()
          : request.sourcePackId === undefined
            ? Promise.resolve(undefined)
            : repository
                .get(request.sourcePackId, {
                  onProgress: decodeProgress("source"),
                })
                .then((source) =>
                  source !== undefined &&
                  (request.sourceContentDigest === undefined ||
                    source.manifest.contentDigest ===
                      request.sourceContentDigest)
                    ? source.entities
                    : undefined,
                ),
        repository.get(request.targetPackId, {
          onProgress: decodeProgress("target"),
        }),
      ]);
      if (target === undefined)
        throw new Error(
          `Installed target content pack ${request.targetPackId} was not found`,
        );
      const started = performance.now();
      const sourceAvailable = sourceEntities !== undefined;
      const result = previewProfileMigration(
        request.build,
        sourceEntities,
        target.entities,
        {
          onProgress: ({ evaluation, completed, total }) =>
            progress(evaluation, sourceAvailable, completed, total),
        },
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
