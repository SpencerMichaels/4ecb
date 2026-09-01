import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { previewProfileMigration } from "./profile-migration";

function rule(value: string): RuleStatement {
  return {
    name: "statadd",
    attributes: [
      { name: "name", value: "Migration score" },
      { name: "value", value },
    ],
    text: "",
    children: [],
    ordinal: 0,
  };
}

function entity(id: string, value: string): ContentEntity {
  return {
    id,
    name: id,
    type: "Feat",
    source: "Synthetic migration fixture",
    sources: ["Synthetic migration fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [rule(value)],
    description: "",
    extensions: [],
    provenance: { sourceKey: "migration", sourceOrdinal: 0 },
  };
}

const build: CharacterBuild = {
  formatVersion: 1,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "root",
        identity: { definitionId: "LEVEL", name: "1", type: "Level" },
        acquiredLevel: 1,
        legality: "rules-legal",
        unresolved: false,
        children: [
          {
            id: "selected",
            identity: {
              definitionId: "SELECTED",
              name: "Selected",
              type: "Feat",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        ],
      },
    },
  ],
  grabbag: [],
  inventory: [
    {
      id: "item",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [{ definitionId: "MISSING", name: "Missing", type: "Gear" }],
      overrides: {},
      legality: "rules-legal",
    },
  ],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

describe("content profile migration preview", () => {
  it("reports missing and changed references plus evaluated value differences", () => {
    const preview = previewProfileMigration(
      build,
      [
        entity("LEVEL", "+1"),
        entity("SELECTED", "+1"),
        entity("MISSING", "+1"),
      ],
      [entity("LEVEL", "+1"), entity("SELECTED", "+4")],
    );

    expect(preview.sourceAvailable).toBe(true);
    expect(preview.referencedDefinitionCount).toBe(3);
    expect(preview.missingDefinitionIds).toEqual(["MISSING"]);
    expect(preview.changedDefinitionIds).toEqual(["SELECTED"]);
    expect(preview.statChanges).toContainEqual({
      name: "Migration score",
      before: 2,
      after: 5,
    });
    expect(preview.source).toBeDefined();
    expect(preview.target).toMatchObject({ converged: true });
  });

  it("keeps adoption evidence explicit when the old profile is unavailable", () => {
    const preview = previewProfileMigration(build, undefined, [
      entity("LEVEL", "+1"),
    ]);
    expect(preview.sourceAvailable).toBe(false);
    expect(preview.source).toBeUndefined();
    expect(preview.changedDefinitionIds).toEqual([]);
    expect(preview.missingDefinitionIds).toEqual(["MISSING", "SELECTED"]);
  });
});
