import {
  decodeContentPackBytes,
  MAX_CONTENT_PACK_ENCODED_BYTES,
  validateContentPack,
  type ContentPack,
} from "@4ecb/content-pack";

export interface AdvertisedContentPack {
  readonly packId: string;
  readonly contentDigest: string;
  readonly url: string;
  readonly name?: string;
}

export interface RuntimeContentConfig {
  readonly contentPacks: readonly AdvertisedContentPack[];
}

export function parseRuntimeContentConfig(
  value: unknown,
  baseUrl = globalThis.location?.href ?? "https://localhost/",
): RuntimeContentConfig {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const candidates = record.contentPacks;
  if (candidates === undefined) return { contentPacks: [] };
  if (!Array.isArray(candidates))
    throw new Error("runtime contentPacks must be an array");
  const seen = new Set<string>();
  const contentPacks = candidates.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null)
      throw new Error("runtime content pack entry must be an object");
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.packId !== "string" ||
      typeof entry.contentDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.contentDigest) ||
      typeof entry.url !== "string"
    )
      throw new Error(
        "runtime content pack requires packId, same-origin URL, and SHA-256 contentDigest",
      );
    const url = new URL(entry.url, baseUrl);
    if (url.origin !== new URL(baseUrl).origin)
      throw new Error("runtime content pack URL must be same-origin");
    const identity = `${entry.packId}:${entry.contentDigest}`;
    if (seen.has(identity))
      throw new Error(`duplicate advertised content pack ${identity}`);
    seen.add(identity);
    return {
      packId: entry.packId,
      contentDigest: entry.contentDigest,
      url: url.href,
      ...(typeof entry.name === "string" ? { name: entry.name } : {}),
    };
  });
  return { contentPacks };
}

export async function downloadAdvertisedPack(
  advertised: AdvertisedContentPack,
  onProgress: (receivedBytes: number, totalBytes?: number) => void = () =>
    undefined,
  fetcher: typeof fetch = fetch,
): Promise<{ readonly bytes: ArrayBuffer; readonly pack: ContentPack }> {
  const response = await fetcher(advertised.url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Content download failed (${response.status})`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CONTENT_PACK_ENCODED_BYTES)
    throw new Error(
      "Advertised content pack exceeds the 128 MiB download limit",
    );
  if (response.body === null)
    throw new Error("Content download returned no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_CONTENT_PACK_ENCODED_BYTES) {
      await reader.cancel();
      throw new Error(
        "Advertised content pack exceeds the 128 MiB download limit",
      );
    }
    chunks.push(value);
    onProgress(received, Number.isFinite(declared) ? declared : undefined);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const pack = await decodeContentPackBytes(bytes.buffer);
  const validation = await validateContentPack(pack);
  if (!validation.valid)
    throw new Error(
      `Downloaded content pack is invalid: ${validation.errors.join("; ")}`,
    );
  if (
    pack.manifest.packId !== advertised.packId ||
    pack.manifest.contentDigest !== advertised.contentDigest
  )
    throw new Error(
      "Downloaded content pack identity or digest does not match runtime configuration",
    );
  return { bytes: bytes.buffer, pack };
}
