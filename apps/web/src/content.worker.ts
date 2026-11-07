/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import {
  decodeAndValidateContentPackForStorage,
  storeAlreadyValidatedContentPack,
} from "@4ecb/browser-storage/validated-pack-storage";
import {
  campaignRemovedRecordCounts,
  type CampaignDocument,
} from "@4ecb/content-pack";

import type {
  CampaignRemovedRecordsResponse,
  ContentWorkerRequest,
  ImportPackResponse,
  MaterializeCampaignProfileResponse,
  MaterializeProfileResponse,
} from "./worker-messages";

// Heavy pack work (decode, validate, compose, encode, store) runs here so the
// page never freezes on a large pack.

const worker = self as DedicatedWorkerGlobalScope;

function respond(
  message:
    | CampaignRemovedRecordsResponse
    | ImportPackResponse
    | MaterializeCampaignProfileResponse
    | MaterializeProfileResponse,
): void {
  worker.postMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

worker.onmessage = (event: MessageEvent<ContentWorkerRequest>) => {
  const request = event.data;
  if (request.type === "materialize-campaign-profile")
    void materializeCampaignProfile(request.baseLayerPackIds, request.campaign);
  else if (request.type === "campaign-removed-records")
    void countCampaignRemovedRecords(
      request.baseLayerPackIds,
      request.campaign,
    );
  else if (request.type === "materialize-profile")
    void materializeProfile(
      request.profileId,
      request.name,
      request.layerPackIds,
    );
  else void importPack(request.buffer);
};

async function importPack(buffer: ArrayBuffer): Promise<void> {
  try {
    respond({ type: "progress", phase: "decoding" });
    const validated = await decodeAndValidateContentPackForStorage(
      buffer,
      "Pack validation failed",
      () => respond({ type: "progress", phase: "validating" }),
    );
    respond({ type: "progress", phase: "storing" });
    const manifest = await storeAlreadyValidatedContentPack(validated);
    respond({ type: "complete", manifest });
  } catch (error: unknown) {
    respond({ type: "error", message: errorMessage(error) });
  }
}

async function materializeCampaignProfile(
  baseLayerPackIds: readonly string[],
  campaign: CampaignDocument,
): Promise<void> {
  try {
    const definition =
      await new ContentPackRepository().materializeCampaignProfile(
        baseLayerPackIds,
        campaign,
      );
    respond({ type: "campaign-profile", definition });
  } catch (error: unknown) {
    respond({ type: "error", message: errorMessage(error) });
  }
}

async function materializeProfile(
  profileId: string,
  name: string,
  layerPackIds: readonly string[],
): Promise<void> {
  try {
    const definition = await new ContentPackRepository().materializeProfile(
      profileId,
      name,
      layerPackIds,
    );
    respond({ type: "profile", definition });
  } catch (error: unknown) {
    respond({ type: "error", message: errorMessage(error) });
  }
}

async function countCampaignRemovedRecords(
  baseLayerPackIds: readonly string[],
  campaign: CampaignDocument,
): Promise<void> {
  try {
    const repository = new ContentPackRepository();
    const layers = [];
    for (const packId of baseLayerPackIds) {
      const pack = await repository.get(packId);
      if (pack === undefined)
        throw new Error(`Missing content profile layer ${packId}`);
      layers.push(pack.entities);
    }
    respond({
      type: "campaign-removed-records",
      counts: campaignRemovedRecordCounts(layers, campaign),
    });
  } catch (error: unknown) {
    respond({ type: "error", message: errorMessage(error) });
  }
}
