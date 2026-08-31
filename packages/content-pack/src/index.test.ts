import { describe, expect, it } from "vitest";

import type { ParsedContentSource } from "@4ecb/content-domain";

import {
  buildContentPack,
  decodeContentPack,
  diffContentPacks,
  encodeContentPack,
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
});
