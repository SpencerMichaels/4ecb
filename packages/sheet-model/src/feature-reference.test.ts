import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import { featureReferenceMetadata } from "./feature-reference";
const entity = (
  id: string,
  type: string,
  grants: readonly string[] = [],
): ContentEntity => ({
  id,
  name: id,
  type,
  source: "Not a character origin",
  sources: [],
  attributes: [],
  categories: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
  specifics: [],
  rules: grants.map((target, ordinal) => ({
    name: "grant",
    attributes: [{ name: "name", value: target }],
    children: [],
    text: "",
    ordinal,
  })),
});
describe("feature reference provenance", () => {
  it("classifies generic features by evaluated ancestry and preserves acquired levels", () => {
    const content = [
      entity("theme", "Theme"),
      entity("feature", "Class Feature"),
    ];
    const result = featureReferenceMetadata({
      content,
      selections: content.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
      })),
      occurrences: [
        { id: "root", definitionId: "theme", acquiredLevel: 1, kind: "root" },
        {
          id: "child",
          definitionId: "feature",
          acquiredLevel: 6,
          parentId: "root",
          kind: "grant",
        },
      ],
    });
    expect(result.get("feature")).toEqual({
      referenceGroup: "Theme",
      level: 6,
    });
  });
  it("counts explicit core grants as level one and does not give unknown feats a fake level", () => {
    const content = [
      entity("class", "Class", ["core"]),
      entity("core", "Class Feature"),
      entity("feat", "Feat"),
    ];
    const result = featureReferenceMetadata({
      content,
      selections: content.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
      })),
    });
    expect(result.get("core")).toEqual({
      referenceGroup: "Class Feature",
      level: 1,
    });
    expect(result.get("feat")).toEqual({ referenceGroup: "Feat" });
  });
  it("retains the earliest acquisition and guards cyclic ancestry", () => {
    const content = [entity("feat", "Feat")];
    const result = featureReferenceMetadata({
      content,
      selections: [],
      occurrences: [
        {
          id: "a",
          definitionId: "feat",
          parentId: "a",
          acquiredLevel: 8,
          kind: "grant",
        },
        { id: "b", definitionId: "feat", acquiredLevel: 2, kind: "choice" },
      ],
    });
    expect(result.get("feat")?.level).toBe(2);
  });
});
