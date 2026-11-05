import { describe, expect, it } from "vitest";

import {
  contentCache,
  contentCacheBuildCounts,
  contentEntitiesById,
  scanCountingContent,
  type ContentEntity,
} from "./index";

const entity = (id: string): ContentEntity => ({
  id,
  name: id,
  type: "Feat",
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
});

describe("per-content caches", () => {
  it("build once per content array, by identity", () => {
    const names = contentCache("test-names", (entities) =>
      entities.map((record) => record.name),
    );
    const content = [entity("A"), entity("B")];
    expect(names(content)).toBe(names(content));
    expect(contentCacheBuildCounts().get("test-names")).toBe(1);
    // A new array is new content, even with equal records.
    names([...content]);
    expect(contentCacheBuildCounts().get("test-names")).toBe(2);
  });

  it("find records by trimmed, lower-cased id", () => {
    const content = [entity("ID_A"), entity("ID_B")];
    expect(contentEntitiesById(content).get("id_b")).toBe(content[1]);
  });

  it("count whole-content scans, never indexed reads", () => {
    const { content, scans } = scanCountingContent([entity("A"), entity("B")]);
    expect(content[1]?.id).toBe("B");
    expect(content.length).toBe(2);
    expect(scans()).toBe(0);
    content.map((record) => record.id);
    void [...content];
    expect(scans()).toBe(2);
  });
});
