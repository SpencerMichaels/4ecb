import { describe, expect, it } from "vitest";

import { entityNames } from "./aliases";
import { countsAsRecords, countsAsSearchNames } from "./counts-as";
import type { ContentEntity, RuleStatement } from "./index";

function grant(name: string, type: string, ordinal = 0): RuleStatement {
  return {
    name: "grant",
    attributes: [
      { name: "name", value: name },
      { name: "type", value: type },
    ],
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
  aliases?: string[],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic fixture",
    sources: ["Synthetic fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
    ...(aliases === undefined ? {} : { aliases }),
  };
}

const torag = entity("ID_TORAG", "Torag", "Deity", [
  grant("ID_COUNTSASDEITY_MORADIN", "CountsAsDeity"),
  grant("ID_POWER_X", "Power", 1),
]);
const halfdrake = entity("ID_HALFDRAKE", "Halfdrake", "Race", [
  grant("ID_COUNTSASRACE_DRAGONBORN", "CountsAsRace"),
]);
const tongue = entity("ID_LANGUAGE_DRACONIC_OLD", "Old Draconic", "Language", [
  grant("ID_COUNTSASLANGUAGE_DRACONIC", "CountsAsLanguage"),
  // A repeat and a dangling grant add nothing.
  grant("ID_COUNTSASLANGUAGE_DRACONIC", "CountsAsLanguage", 1),
  grant("ID_COUNTSASLANGUAGE_MISSING", "CountsAsLanguage", 2),
]);
const asmodeus = entity("ID_CAMPAIGN_ASMODEUS", "Asmodeus", "Deity", [
  grant("ID_COUNTSASDEITY_ASMODEUS", "CountsAsDeity"),
]);
const records = [
  torag,
  entity(
    "ID_COUNTSASDEITY_MORADIN",
    "Moradin",
    "CountsAsDeity",
    [],
    ["Soul Forger"],
  ),
  halfdrake,
  entity("ID_COUNTSASRACE_DRAGONBORN", "Dragonborn", "CountsAsRace"),
  tongue,
  entity("ID_COUNTSASLANGUAGE_DRACONIC", "Draconic", "CountsAsLanguage"),
  asmodeus,
  entity("ID_COUNTSASDEITY_ASMODEUS", "Asmodeus", "CountsAsDeity"),
  entity("ID_POWER_X", "Power X", "Power"),
];
const byId = new Map(
  records.map((record) => [record.id.toLocaleLowerCase(), record]),
);
const lookup = (id: string) => byId.get(id.toLocaleLowerCase());

describe("counts-as grants", () => {
  it("reads every CountsAs* type from the record's grants, by ID", () => {
    expect(countsAsRecords(torag, lookup).map(({ name }) => name)).toEqual([
      "Moradin",
    ]);
    expect(countsAsRecords(halfdrake, lookup).map(({ name }) => name)).toEqual([
      "Dragonborn",
    ]);
    expect(countsAsRecords(tongue, lookup).map(({ name }) => name)).toEqual([
      "Draconic",
    ]);
    expect(countsAsRecords(torag, lookup, "CountsAsRace")).toEqual([]);
    expect(countsAsRecords(asmodeus, lookup)).toEqual([]);
  });

  it("gives search the counted-as names, aliases included", () => {
    expect(countsAsSearchNames(torag, byId)).toEqual([
      "Moradin",
      "Soul Forger",
    ]);
    expect(countsAsSearchNames(halfdrake, byId)).toEqual(["Dragonborn"]);
    expect(countsAsSearchNames(tongue, byId)).toEqual(["Draconic"]);
    // Cached per content map and record.
    expect(countsAsSearchNames(torag, byId)).toBe(
      countsAsSearchNames(torag, byId),
    );
  });

  it("never makes a counted-as name one of the record's own names", () => {
    // Rule name matching reads entityNames; counts-as keeps its own rule
    // semantics (alternates, stand-ins, "met through") in the rules engine.
    expect(entityNames(torag)).toEqual(["Torag"]);
    expect(entityNames(halfdrake)).toEqual(["Halfdrake"]);
  });
});
