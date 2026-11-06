// Helpers shared by content packs and campaign documents; not exported from
// the package entry point.

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface LimitedReadOptions {
  /** Lower-case document label for error messages, e.g. "content pack". */
  readonly label: string;
  readonly maxEncodedBytes: number;
  readonly maxDecodedBytes: number;
  readonly onProgress?: (progress: {
    readonly completed: number;
    readonly total: number;
  }) => void;
}

/**
 * Reads optionally gzipped bytes (identified by the `1f 8b` magic) into UTF-8
 * text, refusing input or output past the limits before anything is parsed.
 */
export async function readLimitedText(
  value: ArrayBuffer,
  options: LimitedReadOptions,
): Promise<string> {
  const { label, maxEncodedBytes, maxDecodedBytes } = options;
  const capitalized = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  if (value.byteLength > maxEncodedBytes)
    throw new Error(
      `${capitalized} exceeds the ${maxEncodedBytes.toLocaleString()} byte input-size limit`,
    );

  const bytes = new Uint8Array(value);
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  let consumedBytes = 0;
  const source = new Blob([value]).stream().pipeThrough(
    new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(chunk, controller) {
        consumedBytes += chunk.byteLength;
        options.onProgress?.({
          completed: consumedBytes,
          total: value.byteLength,
        });
        controller.enqueue(chunk);
      },
    }),
  );
  const stream = gzip
    ? source.pipeThrough(new DecompressionStream("gzip"))
    : source;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let decodedBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      decodedBytes += result.value.byteLength;
      if (decodedBytes > maxDecodedBytes) {
        await reader.cancel();
        throw new Error(
          `Decoded ${label} exceeds the ${maxDecodedBytes.toLocaleString()} byte limit`,
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const decoded = new Uint8Array(decodedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    decoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(decoded);
}
