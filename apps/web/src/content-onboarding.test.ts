import { describe, expect, it } from "vitest";

import {
  classifyContentSource,
  discoverContentSources,
  supportsDirectoryPicker,
  type ContentDirectoryHandleLike,
  type ContentFileHandleLike,
} from "./content-onboarding";

function file(name: string): ContentFileHandleLike {
  return {
    kind: "file",
    name,
    getFile: () => Promise.reject(new Error("Discovery must not read files")),
  };
}

function directory(
  name: string,
  children: readonly (ContentDirectoryHandleLike | ContentFileHandleLike)[],
): ContentDirectoryHandleLike {
  return {
    kind: "directory",
    name,
    async *values() {
      yield* children;
    },
  };
}

describe("content onboarding", () => {
  it("classifies portable packs and recognized decrypted rules XML", () => {
    expect(classifyContentSource("private.4ecp")).toBe("portable-pack");
    expect(classifyContentSource("combined.dnd40.merged.xml")).toBe(
      "legacy-rules-xml",
    );
    expect(classifyContentSource("custom.dnd40.xml")).toBe("legacy-rules-xml");
    expect(classifyContentSource("custom.part")).toBeUndefined();
    expect(classifyContentSource("combined.dnd40.encrypted")).toBeUndefined();
  });

  it("finds supported sources without opening them and sorts paths", async () => {
    const root = directory("Legacy", [
      directory("CBLoader", [
        directory("Cache", [
          file("combined.dnd40.merged.xml"),
          file("combined.dnd40.encrypted"),
        ]),
      ]),
      file("portable.4ecp"),
      file("notes.txt"),
    ]);

    await expect(discoverContentSources(root)).resolves.toMatchObject([
      {
        kind: "legacy-rules-xml",
        relativePath: "Legacy/CBLoader/Cache/combined.dnd40.merged.xml",
      },
      { kind: "portable-pack", relativePath: "Legacy/portable.4ecp" },
    ]);
  });

  it("detects the progressive picker without making it a requirement", () => {
    expect(supportsDirectoryPicker({} as Window)).toBe(false);
    expect(
      supportsDirectoryPicker({
        showDirectoryPicker: () => undefined,
      } as unknown as Window),
    ).toBe(true);
  });

  it("stops an unexpectedly broad directory scan", async () => {
    const root = directory(
      "TooBroad",
      Array.from({ length: 2_001 }, (_, index) => file(`${index}.txt`)),
    );
    await expect(discoverContentSources(root)).rejects.toThrow(
      "scan stopped after 2,000 entries",
    );
  });
});
