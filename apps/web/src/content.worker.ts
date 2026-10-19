/// <reference lib="webworker" />

import {
  decodeAndValidateContentPackForStorage,
  storeAlreadyValidatedContentPack,
} from "@4ecb/browser-storage/validated-pack-storage";

import type {
  ContentImportRequest,
  ImportPackResponse,
} from "./worker-messages";

const worker = self as DedicatedWorkerGlobalScope;

function respond(message: ImportPackResponse): void {
  worker.postMessage(message);
}

worker.onmessage = (event: MessageEvent<ContentImportRequest>) => {
  void importPack(event.data.buffer);
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
    respond({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
