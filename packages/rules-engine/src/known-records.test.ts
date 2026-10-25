import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { projectBuildForEvaluation } from "./build-projection";
import { evaluateCharacter } from "./evaluator";
import { freeRitualAllowanceTexts, knownRecords } from "./known-records";

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
    provenance: { sourceKey: "known-records-test", sourceOrdinal: 0 },
  };
}

const content = [
  entity("L1", "1", "Level"),
  entity("L2", "2", "Level"),
  entity("CLASS", "Synthetic Druid", "Class", [
    rule("statadd", { name: "FREEBEE:RITUAL_GIFT", value: "+1" }, 0),
    rule("statadd", { name: "FREEBEE:GEAR_BOOK", value: "+1" }, 1),
    rule(
      "textstring",
      {
        name: "Free Rituals",
        value: "* As a druid you have been given the Gifted Rite.",
      },
      2,
    ),
  ]),
  entity("DOUBLE", "Duplicitous Feature", "Class Feature", [
    rule("grant", { name: "RITUAL_FORMULA", type: "Ritual" }, 0),
    rule("grant", { name: "RITUAL_FORMULA", type: "Ritual" }, 1),
  ]),
  entity("RITUAL_GIFT", "Gifted Rite", "Ritual"),
  entity("RITUAL_FORMULA", "Granted Formula", "Ritual"),
  entity("RITUAL_LEARNED", "Learned Rite", "Ritual"),
  entity("RITUAL_LATER", "Later Rite", "Ritual"),
  entity("GEAR_BOOK", "Ritual Book", "Gear"),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

const occurrence = (
  id: string,
  definitionId: string,
  type: string,
  children: CharacterBuild["grabbag"] = [],
) => ({
  id,
  identity: { definitionId, name: lookup(definitionId)!.name, type },
  acquiredLevel: 1,
  legality: "rules-legal" as const,
  children,
  unresolved: false,
});

const build: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: occurrence("l1", "L1", "Level", [
        occurrence("class", "CLASS", "Class"),
        occurrence("feature", "DOUBLE", "Class Feature"),
      ]),
    },
  ],
  grabbag: [],
  inventory: [],
  known: [
    {
      id: "stored-gift",
      acquiredLevel: 1,
      element: {
        definitionId: "RITUAL_GIFT",
        name: "Gifted Rite",
        type: "Ritual",
      },
      acquisition: "free",
    },
    {
      id: "learned",
      acquiredLevel: 1,
      element: {
        definitionId: "RITUAL_LEARNED",
        name: "Learned Rite",
        type: "Ritual",
      },
      acquisition: "bought",
    },
    {
      id: "later",
      acquiredLevel: 2,
      element: {
        definitionId: "RITUAL_LATER",
        name: "Later Rite",
        type: "Ritual",
      },
      acquisition: "free",
    },
  ],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

describe("known records", () => {
  const evaluation = evaluateCharacter(
    projectBuildForEvaluation(build, content),
    content,
  );

  it("lists learned and granted records once, with the grant as source", () => {
    expect(
      knownRecords(build, evaluation, lookup).map(({ element, source }) => ({
        id: element.definitionId,
        source,
      })),
    ).toEqual([
      {
        id: "RITUAL_FORMULA",
        source: {
          kind: "granted",
          provider: "Duplicitous Feature",
          via: "grant",
        },
      },
      {
        id: "RITUAL_GIFT",
        source: {
          kind: "granted",
          provider: "Synthetic Druid",
          via: "freebee",
          storedEntryId: "stored-gift",
        },
      },
      {
        id: "RITUAL_LEARNED",
        source: {
          kind: "learned",
          entryId: "learned",
          acquisition: "bought",
          acquiredLevel: 1,
        },
      },
    ]);
  });

  it("keeps a stored copy known when its grant disappears", () => {
    const withoutClass: CharacterBuild = {
      ...build,
      levels: [
        {
          level: 1,
          root: occurrence("l1", "L1", "Level"),
        },
      ],
    };
    const records = knownRecords(
      withoutClass,
      evaluateCharacter(
        projectBuildForEvaluation(withoutClass, content),
        content,
      ),
      lookup,
    );
    expect(
      records.map(({ element, source }) => [element.definitionId, source.kind]),
    ).toEqual([
      ["RITUAL_GIFT", "learned"],
      ["RITUAL_LEARNED", "learned"],
    ]);
  });

  it("shows the free-ritual allowance text without enforcing it", () => {
    expect(freeRitualAllowanceTexts(evaluation)).toEqual([
      {
        text: "As a druid you have been given the Gifted Rite.",
        provider: "Synthetic Druid",
        providerId: "CLASS",
      },
    ]);
  });
});
