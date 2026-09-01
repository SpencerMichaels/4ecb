import {
  buildContentPack,
  encodeContentPackBytes,
  type ContentPack,
} from "@4ecb/content-pack";
import { parseD20Rules } from "@4ecb/legacy-wotc";

export interface LegacyRulesImportOptions {
  readonly sourceKey: string;
  readonly packId: string;
  readonly name: string;
}

export async function buildPackFromLegacyRules(
  buffer: ArrayBuffer,
  options: LegacyRulesImportOptions,
  onParsed?: () => void,
): Promise<ContentPack> {
  const source = parseD20Rules(
    new TextDecoder().decode(buffer).replace(/^\uFEFF/, ""),
    options.sourceKey,
  );
  onParsed?.();
  return buildContentPack(source, {
    packId: options.packId,
    name: options.name,
  });
}

export async function encodeCompressedPack(
  pack: ContentPack,
): Promise<ArrayBuffer> {
  const bytes = encodeContentPackBytes(pack);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Response(
    new Blob([buffer]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
}
