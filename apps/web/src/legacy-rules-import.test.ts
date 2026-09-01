import { readFile } from "node:fs/promises";

import { decodeContentPack } from "@4ecb/content-pack";
import { describe, expect, it } from "vitest";

import {
  buildPackFromLegacyRules,
  encodeCompressedPack,
} from "./legacy-rules-import";

describe("legacy rules onboarding", () => {
  it("builds a deterministic validated portable pack in browser-compatible APIs", async () => {
    const bytes = await readFile("fixtures/content/synthetic.dnd40.xml");
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const options = {
      sourceKey: "synthetic.dnd40.xml",
      packId: "browser-synthetic",
      name: "Browser synthetic",
    };
    const first = await buildPackFromLegacyRules(buffer, options);
    const second = await buildPackFromLegacyRules(buffer, options);

    expect(first.manifest).toMatchObject({
      packId: "browser-synthetic",
      recordCount: 3,
      gameSystem: "D&D4E",
    });
    expect(first.manifest.contentDigest).toBe(second.manifest.contentDigest);

    const compressed = await encodeCompressedPack(first);
    const decoded = decodeContentPack(
      await new Response(
        new Blob([compressed])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
      ).text(),
    );
    expect(decoded.manifest.contentDigest).toBe(first.manifest.contentDigest);
  });
});
