/// <reference lib="webworker" />

import { ContentPackRepository } from "@4ecb/browser-storage";
import { decodeContentPack, validateContentPack } from "@4ecb/content-pack";

import type { ImportPackRequest, ImportPackResponse } from "./worker-messages";

const worker = self as DedicatedWorkerGlobalScope;

function respond(message: ImportPackResponse): void {
  worker.postMessage(message);
}

worker.onmessage = (event: MessageEvent<ImportPackRequest>) => {
  if (event.data.type !== "import-pack") return;
  void importPack(event.data.buffer);
};

async function importPack(buffer: ArrayBuffer): Promise<void> {
  try {
    respond({ type: "progress", phase: "decoding" });
    const bytes = new Uint8Array(buffer);
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const text = isGzip
      ? await new Response(
          new Blob([buffer])
            .stream()
            .pipeThrough(new DecompressionStream("gzip")),
        ).text()
      : new TextDecoder().decode(buffer);
    const pack = decodeContentPack(text);
    respond({ type: "progress", phase: "validating" });
    const validation = await validateContentPack(pack);
    if (!validation.valid) {
      throw new Error(
        `Pack validation failed: ${validation.errors.join("; ")}`,
      );
    }
    respond({ type: "progress", phase: "storing" });
    const manifest = await new ContentPackRepository().installEncoded(
      pack,
      buffer,
    );
    respond({ type: "complete", manifest });
  } catch (error: unknown) {
    respond({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
