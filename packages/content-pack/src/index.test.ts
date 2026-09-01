import { describe, expect, it } from "vitest";

import type { ParsedContentSource } from "@4ecb/content-domain";

import {
  buildContentPack,
  contentPackIdentityErrors,
  decodeContentPack,
  decodeContentPackBytes,
  diffContentPacks,
  encodeContentPack,
  encodeContentPackBytes,
  validateContentPack,
} from "./index";

const source: ParsedContentSource = {
  gameSystem: "D&D4E",
  sourceKey: "sample.xml",
  entities: [
    {
      id: "ID_TEST_1",
      name: "Example",
      type: "Feat",
      source: "Synthetic",
      sources: ["Synthetic"],
      attributes: [],
      categories: [],
      specifics: [],
      rules: [],
      description: "Example text",
      extensions: [],
      content: [],
      provenance: { sourceKey: "sample.xml", sourceOrdinal: 0 },
    },
  ],
  rejected: [],
  rawTopLevel: [],
  diagnostics: [],
  accounting: {
    topLevelRecords: 1,
    acceptedRecords: 1,
    warnedRecords: 0,
    rejectedRecords: 0,
    rawTopLevelElements: 0,
  },
};

describe("content pack", () => {
  it("builds deterministically and verifies its digest", async () => {
    const first = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    const second = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    expect(encodeContentPack(first)).toBe(encodeContentPack(second));
    expect((await validateContentPack(first)).valid).toBe(true);
  });

  it("decodes and summarizes changes", async () => {
    const before = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    const decoded = decodeContentPack(encodeContentPack(before));
    expect(decoded.manifest.contentDigest).toBe(before.manifest.contentDigest);

    const after = await buildContentPack(
      {
        ...source,
        entities: [],
        accounting: {
          ...source.accounting,
          topLevelRecords: 0,
          acceptedRecords: 0,
        },
      },
      { packId: "synthetic", name: "Synthetic" },
    );
    expect(diffContentPacks(before, after)).toMatchObject({
      added: [],
      removed: ["ID_TEST_1"],
      changed: [],
      unchangedCount: 0,
    });
  });

  it("rejects unsafe or oversized profile identity fields", async () => {
    expect(contentPackIdentityErrors("../private", "Local rules")).toHaveLength(
      1,
    );
    expect(contentPackIdentityErrors("valid-id", " bad\nname ")).toHaveLength(
      1,
    );
    await expect(
      buildContentPack(source, { packId: "bad id", name: "Synthetic" }),
    ).rejects.toThrow("Invalid content pack identity");

    const valid = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    const invalid = {
      ...valid,
      manifest: { ...valid.manifest, packId: "x".repeat(65) },
    };
    await expect(validateContentPack(invalid)).resolves.toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.stringContaining("packId")]),
    });
  });

  it("bounds compressed and decoded bytes before JSON parsing", async () => {
    const expanded = "x".repeat(2_048);
    const compressed = await new Response(
      new Blob([expanded]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    expect(compressed.byteLength).toBeLessThan(128);
    await expect(
      decodeContentPackBytes(compressed, {
        maxEncodedBytes: 128,
        maxDecodedBytes: 1_024,
      }),
    ).rejects.toThrow("Decoded content pack exceeds");
    await expect(
      decodeContentPackBytes(new ArrayBuffer(129), {
        maxEncodedBytes: 128,
        maxDecodedBytes: 1_024,
      }),
    ).rejects.toThrow("input-size limit");
  });

  it("bounds generated pack encoding before compression", async () => {
    const pack = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    expect(() => encodeContentPackBytes(pack, 32)).toThrow(
      "decoded-size limit",
    );
  });

  it("rejects malformed nested content before validation or storage", async () => {
    const pack = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    const malformed = {
      ...pack,
      entities: [
        {
          ...pack.entities[0],
          rules: [{ name: "incomplete attacker-controlled rule" }],
        },
      ],
    };
    expect(() => decodeContentPack(JSON.stringify(malformed))).toThrow(
      "valid records",
    );
  });

  it("rejects content nodes nested beyond the decoder depth limit", async () => {
    const pack = await buildContentPack(source, {
      packId: "synthetic",
      name: "Synthetic",
    });
    let node: unknown = { kind: "text", value: "bottom" };
    for (let depth = 0; depth < 102; depth += 1)
      node = {
        kind: "element",
        name: "deep",
        attributes: [],
        children: [node],
      };
    expect(() =>
      decodeContentPack(
        JSON.stringify({
          ...pack,
          rawTopLevel: [node],
        }),
      ),
    ).toThrow("raw top-level nodes");
  });
});
