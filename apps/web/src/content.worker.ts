/// <reference lib="webworker" />

import {
  decodeAndValidateContentPackForStorage,
  storeAlreadyValidatedContentPack,
} from "@4ecb/browser-storage/validated-pack-storage";

import {
  buildPackFromLegacyRules,
  encodeCompressedPack,
} from "./legacy-rules-import";
import type {
  ContentImportRequest,
  ImportLegacyRulesRequest,
  ImportPackResponse,
} from "./worker-messages";

const worker = self as DedicatedWorkerGlobalScope;

function respond(message: ImportPackResponse): void {
  worker.postMessage(message);
}

worker.onmessage = (event: MessageEvent<ContentImportRequest>) => {
  void (event.data.type === "import-pack"
    ? importPack(event.data.buffer)
    : importLegacyRules(event.data));
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

async function importLegacyRules(
  request: ImportLegacyRulesRequest,
): Promise<void> {
  try {
    respond({ type: "progress", phase: "parsing-rules" });
    const pack = await buildPackFromLegacyRules(
      request.buffer,
      {
        sourceKey: request.sourceKey,
        packId: request.packId,
        name: request.name,
      },
      () => respond({ type: "progress", phase: "building-pack" }),
    );
    const encoded = await encodeCompressedPack(pack);
    const validated = await decodeAndValidateContentPackForStorage(
      encoded,
      "Generated pack validation failed",
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
