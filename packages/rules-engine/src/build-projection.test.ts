import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { projectBuildForEvaluation } from "./build-projection";
import { evaluateCharacter } from "./evaluator";

function statement(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  rules: RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

describe("build projection", () => {
  it("maps serialized child slots to rule ordinals and avoids duplicate grants", () => {
    const content = [
      entity("LEVEL", "1", "Level", [
        statement("statadd", { name: "Strength", value: "+1" }, 0),
        statement("grant", { name: "FEATURE", type: "Feature" }, 1),
        statement("select", { type: "Feat", number: "1" }, 2),
      ]),
      entity("FEATURE", "Feature", "Feature"),
      entity("FEAT", "Feat", "Feat"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [
              {
                id: "feature",
                identity: {
                  definitionId: "FEATURE",
                  name: "Feature",
                  type: "Feature",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                unresolved: false,
                children: [],
              },
              {
                id: "feat",
                identity: { definitionId: "FEAT", name: "Feat", type: "Feat" },
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
      inventory: [],
      alternates: [],
      baseAbilities: { Strength: 10 },
      textStrings: {},
    };
    const projected = projectBuildForEvaluation(build, content);
    expect(projected.occurrences).toEqual([
      expect.objectContaining({ id: "level", kind: "root" }),
      expect.objectContaining({
        id: "feature",
        kind: "grant",
        ruleOrdinal: 1,
      }),
      expect.objectContaining({ id: "feat", kind: "choice", ruleOrdinal: 2 }),
    ]);
    const evaluated = evaluateCharacter(projected, content);
    expect(evaluated.occurrences.map(({ id }) => id)).toEqual([
      "level",
      "feature",
      "feat",
    ]);
    expect(evaluated.complete).toBe(true);
  });
});
