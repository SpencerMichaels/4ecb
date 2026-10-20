import { describe, expect, it } from "vitest";
import { buildContentPack, encodeContentPackBytes } from "@4ecb/content-pack";
import type { ParsedContentSource } from "@4ecb/content-domain";
import {
  downloadAdvertisedPack,
  parseRuntimeContentConfig,
  shouldActivateAdvertisedContent,
} from "./runtime-content";

const source: ParsedContentSource = {
  gameSystem: "D&D4E",
  sourceKey: "fixture",
  entities: [],
  rejected: [],
  rawTopLevel: [],
  diagnostics: [],
  accounting: {
    topLevelRecords: 0,
    acceptedRecords: 0,
    warnedRecords: 0,
    rejectedRecords: 0,
    rawTopLevelElements: 0,
  },
};

describe("runtime content", () => {
  it("accepts immutable advertised identities and rejects insecure URLs", () => {
    const digest = "a".repeat(64);
    expect(
      parseRuntimeContentConfig({
        contentPacks: [
          { packId: "base", contentDigest: digest, url: "/packs/base.4ecp" },
        ],
      }).contentPacks[0]?.url,
    ).toContain("/packs/base.4ecp");
    expect(() =>
      parseRuntimeContentConfig({
        contentPacks: [
          {
            packId: "base",
            contentDigest: digest,
            url: "http://elsewhere.test/base.4ecp",
          },
        ],
      }),
    ).toThrow("same-origin");
  });

  it("downloads, validates, and pins the advertised digest", async () => {
    const pack = await buildContentPack(source, {
      packId: "base",
      name: "Base",
    });
    const bytes = encodeContentPackBytes(pack);
    let requestInit: RequestInit | undefined;
    const result = await downloadAdvertisedPack(
      {
        packId: "base",
        contentDigest: pack.manifest.contentDigest,
        url: "https://example.test/base.4ecp",
      },
      () => undefined,
      async (_input, init) => {
        requestInit = init;
        return new Response(bytes.buffer as ArrayBuffer);
      },
    );
    expect(requestInit).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(result.pack.manifest.contentDigest).toBe(
      pack.manifest.contentDigest,
    );
    await expect(
      downloadAdvertisedPack(
        {
          packId: "base",
          contentDigest: "f".repeat(64),
          url: "https://example.test/base.4ecp",
        },
        () => undefined,
        async () => new Response(bytes.buffer as ArrayBuffer),
      ),
    ).rejects.toThrow("does not match");
  });

  it("rejects an oversized declared download before reading", async () => {
    await expect(
      downloadAdvertisedPack(
        {
          packId: "base",
          contentDigest: "f".repeat(64),
          url: "https://example.test/base.4ecp",
        },
        () => undefined,
        async () =>
          new Response(new Uint8Array(), {
            headers: { "content-length": String(129 * 1024 * 1024) },
          }),
      ),
    ).rejects.toThrow("128 MiB");
  });

  it("follows a newly advertised server pack unless the user added their own", () => {
    const old = { packId: "server-old", contentDigest: "a", url: "/old.4ecp" };
    const next = { packId: "server-new", contentDigest: "b", url: "/new.4ecp" };
    const origins: Record<string, string> = {
      "server-old": "server",
      "server-new": "server",
      homebrew: "personal",
    };
    const originOf = (packId: string) => origins[packId];
    const layers = (...packs: { packId: string; contentDigest: string }[]) => ({
      layers: packs.map(({ packId, contentDigest }) => ({
        packId,
        contentDigest,
      })),
    });
    // No content yet: start on the server's.
    expect(shouldActivateAdvertisedContent(undefined, [next], originOf)).toBe(
      true,
    );
    // The server moved on: follow it.
    expect(shouldActivateAdvertisedContent(layers(old), [next], originOf)).toBe(
      true,
    );
    // Already on it: nothing to do.
    expect(
      shouldActivateAdvertisedContent(layers(next), [next], originOf),
    ).toBe(false);
    // The user layered their own pack on top: leave their content alone.
    expect(
      shouldActivateAdvertisedContent(
        layers(old, { packId: "homebrew", contentDigest: "c" }),
        [next],
        originOf,
      ),
    ).toBe(false);
    // Nothing advertised: never switch.
    expect(shouldActivateAdvertisedContent(layers(old), [], originOf)).toBe(
      false,
    );
  });
});
