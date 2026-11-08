import { describe, expect, it, vi } from "vitest";

import type { CharacterRecord } from "@4ecb/character-domain";

import {
  downloadSharedCharacter,
  formatShareCode,
  isShareCode,
  normalizeShareCode,
  packSharedCharacter,
  receiveSharedCharacter,
  SHARE_MAX_BYTES,
  shareBlocker,
  shareCharacter,
  shareCountdownText,
  ShareError,
  unpackSharedCharacter,
  uploadSharedCharacter,
  withoutPortraitSource,
} from "./character-share";

function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (reason: unknown) {
    if (reason instanceof ShareError) return reason.kind;
    throw reason;
  }
  throw new Error("expected a ShareError");
}

/** Bytes that gzip barely shrinks, so a package can exceed the limit. */
function randomText(length: number): string {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 65536)
    crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
  let binary = "";
  for (let offset = 0; offset < length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

describe("share codes", () => {
  it("accepts pasted codes with spaces and dashes", () => {
    expect(normalizeShareCode(" 123 456 ")).toBe("123456");
    expect(normalizeShareCode("123-456")).toBe("123456");
    expect(isShareCode(normalizeShareCode("123-456"))).toBe(true);
    expect(isShareCode("12345")).toBe(false);
    expect(isShareCode("12345a")).toBe(false);
    expect(normalizeShareCode("12a456")).toBe("12a456");
  });

  it("groups the code and counts down to its expiry", () => {
    expect(formatShareCode("123456")).toBe("123 456");
    expect(shareCountdownText(10 * 60_000, 0)).toBe("10:00");
    expect(shareCountdownText(65_500, 0)).toBe("1:06");
    expect(shareCountdownText(0, 5000)).toBe("0:00");
  });

  it("says why sharing can't start", () => {
    expect(shareBlocker(true, false)).toBe("offline");
    expect(shareBlocker(false, true)).toBe("disabled");
    expect(shareBlocker(undefined, true)).toBe("disabled");
    expect(shareBlocker(true, true)).toBeUndefined();
  });
});

describe("share packages", () => {
  it("round-trips a package through gzip", async () => {
    const value = { format: "4ecb-character-backup", characters: [{ a: 1 }] };
    const packed = await packSharedCharacter(value);
    expect([...packed.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    await expect(unpackSharedCharacter(packed)).resolves.toEqual(value);
  });

  it("refuses bytes that aren't gzip'd JSON", async () => {
    expect(
      await failure(unpackSharedCharacter(new TextEncoder().encode("{}"))),
    ).toBe("invalid-package");
  });

  it("keeps the rendered portrait as a valid full-crop source", () => {
    const character = {
      id: "a",
      portrait: {
        sourceDataUrl: "data:image/png;base64,SOURCE",
        sourceWidth: 3000,
        sourceHeight: 2000,
        crop: { x: 0.3, y: 0.5, size: 0.4 },
        renderedDataUrl: "data:image/webp;base64,RENDERED",
      },
    } as unknown as CharacterRecord;
    expect(withoutPortraitSource(character).portrait).toEqual({
      sourceDataUrl: "data:image/webp;base64,RENDERED",
      sourceWidth: 512,
      sourceHeight: 512,
      crop: { x: 0.5, y: 0.5, size: 1 },
      renderedDataUrl: "data:image/webp;base64,RENDERED",
    });
    const plain = { id: "b" } as unknown as CharacterRecord;
    expect(withoutPortraitSource(plain)).toBe(plain);
  });
});

describe("uploading", () => {
  it("posts the bytes and counts down on the relay's clock", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json(
          201,
          { code: "123456", expiresAt: "2026-01-01T00:10:00.000Z" },
          { Date: "Thu, 01 Jan 2026 00:00:00 GMT" },
        ),
      );
    const share = await uploadSharedCharacter(new Uint8Array([1, 2, 3]), {
      fetchImpl,
      now: () => 5_000,
    });
    expect(share).toEqual({ code: "123456", expiresAt: 5_000 + 600_000 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/share");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      credentials: "same-origin",
    });
  });

  it("maps each relay refusal", async () => {
    const upload = (response: Response) =>
      failure(
        uploadSharedCharacter(new Uint8Array([1]), {
          fetchImpl: () => Promise.resolve(response),
        }),
      );
    expect(await upload(json(413, { error: "too-large" }))).toBe("too-large");
    expect(await upload(json(429, { error: "ip-limit" }))).toBe("ip-limit");
    expect(await upload(json(429, { error: "server-full" }))).toBe(
      "server-full",
    );
    expect(await upload(new Response("", { status: 503 }))).toBe("unavailable");
    expect(await upload(json(503, { error: "unavailable" }))).toBe(
      "unavailable",
    );
    expect(await upload(json(503, { error: "disabled" }))).toBe("disabled");
    expect(await upload(new Response("", { status: 405 }))).toBe("unavailable");
    expect(await upload(new Response("<html>", { status: 404 }))).toBe(
      "unavailable",
    );
    expect(await upload(json(201, { code: "12" }))).toBe("unavailable");
    expect(
      await failure(
        uploadSharedCharacter(new Uint8Array([1]), {
          fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")),
        }),
      ),
    ).toBe("unavailable");
  });

  it("refuses a package over the limit without sending it", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      await failure(
        uploadSharedCharacter(new Uint8Array(SHARE_MAX_BYTES + 1), {
          fetchImpl,
        }),
      ),
    ).toBe("too-large");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("sharing a character", () => {
  const ok = () =>
    Promise.resolve(
      json(201, { code: "654321", expiresAt: "2026-01-01T00:10:00.000Z" }),
    );

  it("sends the whole package when it fits", async () => {
    const exportPackage = vi.fn(() => Promise.resolve({ small: true }));
    await expect(
      shareCharacter(exportPackage, { fetchImpl: ok }),
    ).resolves.toMatchObject({ code: "654321" });
    expect(exportPackage).toHaveBeenCalledTimes(1);
    expect(exportPackage).toHaveBeenCalledWith();
  });

  it("retries without the portrait's original image when too large", async () => {
    const big = randomText(SHARE_MAX_BYTES);
    const exportPackage = vi.fn((prepare?: unknown) =>
      Promise.resolve(prepare === undefined ? { big } : { small: true }),
    );
    const fetchImpl = vi.fn<typeof fetch>(ok);
    await expect(
      shareCharacter(exportPackage, { fetchImpl }),
    ).resolves.toMatchObject({ code: "654321" });
    expect(exportPackage).toHaveBeenLastCalledWith(withoutPortraitSource);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries smaller when the relay says too large", async () => {
    const exportPackage = vi.fn(() => Promise.resolve({ small: true }));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(413, { error: "too-large" }))
      .mockImplementationOnce(ok);
    await shareCharacter(exportPackage, { fetchImpl });
    expect(exportPackage).toHaveBeenLastCalledWith(withoutPortraitSource);
  });

  it("gives up as too large when even the smaller package is", async () => {
    const big = randomText(SHARE_MAX_BYTES);
    const fetchImpl = vi.fn<typeof fetch>(ok);
    expect(
      await failure(
        shareCharacter(() => Promise.resolve({ big }), { fetchImpl }),
      ),
    ).toBe("too-large");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("receiving", () => {
  it("downloads and unpacks the shared package", async () => {
    const value = { format: "4ecb-character-backup" };
    const packed = await packSharedCharacter(value);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(packed as BodyInit, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    await expect(
      receiveSharedCharacter("123456", { fetchImpl }),
    ).resolves.toEqual(value);
    expect(fetchImpl.mock.calls[0]![0]).toBe("/api/share/123456");
  });

  it("maps each relay refusal", async () => {
    const download = (response: Response) =>
      failure(
        downloadSharedCharacter("123456", {
          fetchImpl: () => Promise.resolve(response),
        }),
      );
    expect(await download(json(404, { error: "not-found" }))).toBe("not-found");
    expect(await download(new Response("nope", { status: 404 }))).toBe(
      "unavailable",
    );
    expect(await download(json(429, { error: "too-many-attempts" }))).toBe(
      "too-many-attempts",
    );
    expect(await download(json(400, { error: "malformed-code" }))).toBe(
      "invalid-code",
    );
    expect(await download(json(503, { error: "disabled" }))).toBe("disabled");
    expect(await download(new Response("", { status: 503 }))).toBe(
      "unavailable",
    );
    expect(
      await download(
        new Response("<!doctype html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    ).toBe("unavailable");
  });

  it("checks the code before asking", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await failure(downloadSharedCharacter("12345", { fetchImpl }))).toBe(
      "invalid-code",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
