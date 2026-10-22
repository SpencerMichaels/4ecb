import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { projectBuildForEvaluation } from "./build-projection";
import { evaluateCharacter } from "./evaluator";
import { pendingFreebeeItems } from "./freebees";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      name: key,
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
  rules: readonly RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "freebees-test", sourceOrdinal: 0 },
  };
}

const content = [
  entity("L1", "1", "Level"),
  entity("L2", "2", "Level"),
  entity("CLASS", "Synthetic Caster", "Class", [
    rule("statadd", { name: "FREEBEE:GEAR_BOOK", value: "+1" }, 0),
    rule("statadd", { name: "FREEBEE:RITUAL_GIFT", value: "+1" }, 1),
    rule("statadd", { name: "FREEBEE:ASSOCIATE_PET", value: "+1" }, 2),
    rule("statadd", { name: "FREEBEE:MISSING", value: "+1" }, 3),
    rule(
      "statadd",
      { name: "FREEBEE:ITEM_DOSE", value: "+1", requires: "2 level" },
      4,
    ),
  ]),
  entity("FEAT", "Synthetic Feat", "Feat", [
    rule("statadd", { name: "FREEBEE:GEAR_BOOK", value: "+1" }, 0),
  ]),
  entity("GEAR_BOOK", "Ritual Book", "Gear"),
  entity("RITUAL_GIFT", "Gifted Rite", "Ritual"),
  entity("ASSOCIATE_PET", "Pet", "Associate"),
  entity("ITEM_DOSE", "Poison Dose", "Magic Item"),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

const occurrence = (
  id: string,
  definitionId: string,
  type: string,
  acquiredLevel: number,
  children: CharacterBuild["grabbag"] = [],
) => ({
  id,
  identity: { definitionId, name: lookup(definitionId)!.name, type },
  acquiredLevel,
  legality: "rules-legal" as const,
  children,
  unresolved: false,
});

const build: CharacterBuild = {
  formatVersion: 2,
  effectiveLevel: 2,
  levels: [
    {
      level: 1,
      root: occurrence("l1", "L1", "Level", 1, [
        occurrence("class", "CLASS", "Class", 1),
      ]),
    },
    {
      level: 2,
      root: occurrence("l2", "L2", "Level", 2, [
        occurrence("feat", "FEAT", "Feat", 2),
      ]),
    },
  ],
  grabbag: [],
  inventory: [],
  known: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

const evaluate = (value: CharacterBuild) =>
  evaluateCharacter(projectBuildForEvaluation(value, content), content);

describe("FREEBEE items", () => {
  it("lists each physical gift once with its provider level", () => {
    const pending = pendingFreebeeItems(build, evaluate(build), lookup);
    expect(
      pending.map(({ marker, acquiredLevel, owned }) => ({
        marker,
        acquiredLevel,
        owned,
      })),
    ).toEqual([
      { marker: "GEAR_BOOK", acquiredLevel: 1, owned: false },
      { marker: "ITEM_DOSE", acquiredLevel: 1, owned: false },
    ]);
    expect(pending[0]!.provider).toBe("Synthetic Caster");
  });

  it("gives level-gated gifts only from their level", () => {
    const levelOne = { ...build, effectiveLevel: 1 };
    expect(
      pendingFreebeeItems(levelOne, evaluate(levelOne), lookup).map(
        ({ marker }) => marker,
      ),
    ).toEqual(["GEAR_BOOK"]);
  });

  it("skips given markers and only marks a gift already owned", () => {
    const marked: CharacterBuild = {
      ...build,
      textStrings: { item_dose: "Given" },
      inventory: [
        {
          id: "owned-book",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 0,
          elements: [
            { definitionId: "gear_book", name: "Ritual Book", type: "Gear" },
          ],
          overrides: {},
          legality: "rules-legal",
        },
      ],
    };
    expect(
      pendingFreebeeItems(marked, evaluate(marked), lookup).map(
        ({ marker, owned }) => ({ marker, owned }),
      ),
    ).toEqual([{ marker: "GEAR_BOOK", owned: true }]);
  });
});
