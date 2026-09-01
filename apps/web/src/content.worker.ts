/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import {
  decodeContentPackBytes,
  validateContentPack,
} from "@4ecb/content-pack";

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
    const pack = await decodeContentPackBytes(buffer);
    respond({ type: "progress", phase: "validating" });
    const validation = await validateContentPack(pack);
    if (!validation.valid) {
      throw new Error(
        `Pack validation failed: ${validation.errors.join("; ")}`,
      );
    }
    respond({ type: "progress", phase: "storing" });
    const manifest = await new ContentPackRepository().installEncoded(buffer);
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
    respond({ type: "progress", phase: "validating" });
    const validation = await validateContentPack(pack);
    if (!validation.valid)
      throw new Error(
        `Generated pack validation failed: ${validation.errors.join("; ")}`,
      );
    const encoded = await encodeCompressedPack(pack);
    respond({ type: "progress", phase: "storing" });
    const manifest = await new ContentPackRepository().installEncoded(encoded);
    respond({ type: "complete", manifest });
  } catch (error: unknown) {
    respond({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
