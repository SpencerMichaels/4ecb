import type { CharacterRecord } from "@4ecb/character-domain";

import { PORTRAIT_RENDER_SIZE } from "./portrait-image";

/**
 * Sharing a character by a 6-digit code (D122): the sharing device uploads
 * the character's native package (the .4ecb export, gzip'd) to the
 * same-origin share relay and shows the code it gets back; the receiving
 * device downloads it once by that code and imports it like a .4ecb file.
 * This module is the transport only (compression, requests, error
 * mapping); the dialogs and the import flow live elsewhere.
 */

/** The relay's limit on one shared package, after compression. */
export const SHARE_MAX_BYTES = 8 * 1024 * 1024;
/** The most a received package may expand to (the .4ecb import limit). */
export const SHARE_MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
export const SHARE_CODE_LENGTH = 6;
const SHARE_ENDPOINT = "/api/share";

export type ShareFailureKind =
  /** The browser reports no network connection. */
  | "offline"
  /** runtime-config.json doesn't turn sharing on for this server, or the
   *  relay says it's off (503 `disabled`). */
  | "disabled"
  /** The relay didn't answer as one (missing, down, or unreachable). */
  | "unavailable"
  | "too-large"
  | "ip-limit"
  | "server-full"
  | "not-found"
  | "too-many-attempts"
  | "invalid-code"
  | "invalid-package";

export class ShareError extends Error {
  readonly kind: ShareFailureKind;
  constructor(kind: ShareFailureKind) {
    super(shareFailureMessage(kind));
    this.name = "ShareError";
    this.kind = kind;
  }
}

/** What the player reads for each failure: what happened and what to do. */
export function shareFailureMessage(kind: ShareFailureKind): string {
  switch (kind) {
    case "offline":
      return "You're offline. Connect to the internet to share or receive a character.";
    case "disabled":
      return "Sharing by code isn't turned on for this server. Export the character as a .4ecb file instead, and import that file on the other device.";
    case "unavailable":
      return "The sharing service couldn't be reached. Try again in a moment; if it keeps failing, export the character as a .4ecb file instead.";
    case "too-large":
      return "This character is too large to share by code, even without its portrait's original image. Export it as a .4ecb file instead.";
    case "ip-limit":
      return "Too many characters are being shared from your network right now. Wait for those codes to expire (10 minutes at most), then try again.";
    case "server-full":
      return "The server is sharing too many characters right now. Try again in a few minutes.";
    case "not-found":
      return "No character is waiting under that code. Check the digits: a code works once and expires after 10 minutes, so you may need to ask for a new one.";
    case "too-many-attempts":
      return "Too many wrong codes were tried from your network. Wait a minute, then try again.";
    case "invalid-code":
      return "Enter the 6-digit code shown on the sharing device.";
    case "invalid-package":
      return "What was shared under that code isn't a character this app can read. Ask for it to be shared again.";
  }
}

/** The code as typed or pasted, without spaces and dashes ("123 456",
 *  "123-456"). Other characters are kept, so a wrong one stays visible. */
export function normalizeShareCode(input: string): string {
  return input.replace(/[\s-]+/g, "");
}

export function isShareCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** "123456" as "123 456", easier to read aloud and copy by eye. */
export function formatShareCode(code: string): string {
  return isShareCode(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** "9:05" for the time left until `expiresAt`; "0:00" once it passed. */
export function shareCountdownText(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The character without its portrait's original image, for a share that
 * would otherwise be too large: the rendered square portrait becomes the
 * source, fully cropped, so the record still validates and shows the same
 * portrait (re-cropping on the other device works from the rendering).
 */
export function withoutPortraitSource(
  character: CharacterRecord,
): CharacterRecord {
  const { portrait } = character;
  if (portrait === undefined) return character;
  return {
    ...character,
    portrait: {
      sourceDataUrl: portrait.renderedDataUrl,
      sourceWidth: PORTRAIT_RENDER_SIZE,
      sourceHeight: PORTRAIT_RENDER_SIZE,
      crop: { x: 0.5, y: 0.5, size: 1 },
      renderedDataUrl: portrait.renderedDataUrl,
    },
  };
}

async function streamBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new ShareError("invalid-package");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** A native character package as gzip'd JSON. */
export async function packSharedCharacter(value: unknown): Promise<Uint8Array> {
  const json = new Blob([JSON.stringify(value)]);
  return streamBytes(
    json.stream().pipeThrough(new CompressionStream("gzip")),
    Number.POSITIVE_INFINITY,
  );
}

/** A received package back as its JSON value, refusing anything that
 *  isn't gzip'd JSON or expands past the import limit. */
export async function unpackSharedCharacter(
  bytes: Uint8Array,
): Promise<unknown> {
  let text: string;
  try {
    const unpacked = await streamBytes(
      new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
      SHARE_MAX_UNPACKED_BYTES,
    );
    text = new TextDecoder("utf-8", { fatal: true }).decode(unpacked);
    return JSON.parse(text) as unknown;
  } catch {
    throw new ShareError("invalid-package");
  }
}

type Fetch = typeof fetch;

async function relayError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as unknown;
    return typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : undefined;
  } catch {
    return undefined;
  }
}

async function request(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, { credentials: "same-origin", ...init });
  } catch (reason: unknown) {
    if (reason instanceof DOMException && reason.name === "AbortError")
      throw reason;
    throw new ShareError("unavailable");
  }
}

export interface UploadedShare {
  readonly code: string;
  /** When the code stops working, on this device's clock. */
  readonly expiresAt: number;
}

/** Uploads a packed character; the relay answers with its code. */
export async function uploadSharedCharacter(
  bytes: Uint8Array,
  {
    fetchImpl = fetch,
    signal,
    now = Date.now,
  }: {
    readonly fetchImpl?: Fetch;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
  } = {},
): Promise<UploadedShare> {
  if (bytes.byteLength > SHARE_MAX_BYTES) throw new ShareError("too-large");
  const response = await request(fetchImpl, SHARE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes as BodyInit,
    ...(signal === undefined ? {} : { signal }),
  });
  if (response.status === 201 || response.status === 200) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ShareError("unavailable");
    }
    const { code, expiresAt } = (body ?? {}) as Record<string, unknown>;
    const expiry = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
    if (typeof code !== "string" || !isShareCode(code) || Number.isNaN(expiry))
      throw new ShareError("unavailable");
    // The relay's clock may differ from this one: count down the time the
    // relay gives the code, from its own Date header when it sends one.
    const serverNow = Date.parse(response.headers.get("Date") ?? "");
    return {
      code,
      expiresAt: Number.isNaN(serverNow)
        ? expiry
        : now() + Math.max(0, expiry - serverNow),
    };
  }
  const error = await relayError(response);
  if (response.status === 413) throw new ShareError("too-large");
  if (response.status === 429)
    throw new ShareError(error === "server-full" ? "server-full" : "ip-limit");
  throw new ShareError(error === "disabled" ? "disabled" : "unavailable");
}

/** Downloads (and so uses up) the package shared under `code`. */
export async function downloadSharedCharacter(
  code: string,
  {
    fetchImpl = fetch,
    signal,
  }: { readonly fetchImpl?: Fetch; readonly signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  if (!isShareCode(code)) throw new ShareError("invalid-code");
  const response = await request(fetchImpl, `${SHARE_ENDPOINT}/${code}`, {
    method: "GET",
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  if (response.ok) {
    // A host without the relay may answer every path with the app's page.
    if (/text\/html/i.test(response.headers.get("Content-Type") ?? ""))
      throw new ShareError("unavailable");
    if (response.body === null) throw new ShareError("invalid-package");
    return streamBytes(response.body, SHARE_MAX_BYTES);
  }
  const error = await relayError(response);
  if (response.status === 404)
    throw new ShareError(error === "not-found" ? "not-found" : "unavailable");
  if (response.status === 429) throw new ShareError("too-many-attempts");
  if (response.status === 400) throw new ShareError("invalid-code");
  throw new ShareError(error === "disabled" ? "disabled" : "unavailable");
}

/**
 * Packs and uploads a character. `exportPackage` makes its native package,
 * with `prepare` applied to the record when given; a package over the
 * relay's limit is tried once more without the portrait's original image
 * (the usual reason for its size) before giving up as too large.
 */
export async function shareCharacter(
  exportPackage: (
    prepare?: (character: CharacterRecord) => CharacterRecord,
  ) => Promise<unknown>,
  options: Parameters<typeof uploadSharedCharacter>[1] = {},
): Promise<UploadedShare> {
  const full = await packSharedCharacter(await exportPackage());
  if (full.byteLength <= SHARE_MAX_BYTES)
    try {
      return await uploadSharedCharacter(full, options);
    } catch (reason: unknown) {
      if (!(reason instanceof ShareError && reason.kind === "too-large"))
        throw reason;
    }
  const smaller = await packSharedCharacter(
    await exportPackage(withoutPortraitSource),
  );
  return uploadSharedCharacter(smaller, options);
}

/** Downloads and unpacks the character shared under `code`. */
export async function receiveSharedCharacter(
  code: string,
  options: Parameters<typeof downloadSharedCharacter>[1] = {},
): Promise<unknown> {
  return unpackSharedCharacter(await downloadSharedCharacter(code, options));
}

/** Why sharing can't start right now, if it can't: checked when a dialog
 *  opens and again before each attempt. */
export function shareBlocker(
  enabled: boolean | undefined,
  online = globalThis.navigator?.onLine ?? true,
): ShareFailureKind | undefined {
  if (!online) return "offline";
  if (enabled !== true) return "disabled";
  return undefined;
}
