import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { evaluatePowers } from "./powers";
import type { EvaluatedStat } from "./stats";

function entity(
  id: string,
  type: string,
  specifics: Record<string, string>,
): ContentEntity {
  return {
    id,
    name: id,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const stats: Record<string, EvaluatedStat> = {
  Strength: { name: "Strength", value: 16, contributions: [] },
  "Strength modifier": {
    name: "Strength modifier",
    value: 3,
    contributions: [],
  },
};
const strike = entity("STRIKE", "Power", {
  Keywords: "Weapon",
  "Attack Type": "Melee weapon",
  Attack: "Strength vs. AC",
  Hit: "1[W] + Strength modifier damage.",
});
const blast = entity("BLAST", "Power", {
  "Attack Type": "Close burst 1",
  Attack: "Strength vs. Reflex",
  Hit: "1d6 + Strength modifier damage.",
});
const longsword = entity("LONGSWORD", "Weapon", {
  Damage: "1d8",
  "Proficiency Bonus": "3",
  "Weapon Category": "Military Melee",
});
const entities = [strike, blast, longsword];
const run = (onlyDefinitionIds?: readonly string[]) =>
  evaluatePowers({
    level: 1,
    activeDefinitionIds: ["STRIKE", "BLAST"],
    entities,
    inventory: [
      {
        id: "sword",
        definitionIds: ["LONGSWORD"],
        quantity: 1,
        equippedQuantity: 1,
        acquiredLevel: 1,
      },
    ],
    stats,
    overlays: [],
    ...(onlyDefinitionIds === undefined ? {} : { onlyDefinitionIds }),
  });

describe("evaluating only some powers", () => {
  it("evaluates just those, as the full evaluation does", () => {
    const full = run();
    const alone = run(["blast"]);
    expect(full.map(({ definitionId }) => definitionId)).toEqual([
      "STRIKE",
      "BLAST",
    ]);
    expect(alone).toEqual(
      full.filter(({ definitionId }) => definitionId === "BLAST"),
    );
    // The per-content lookups are reused: a second call gives the same.
    expect(run(["STRIKE"])).toEqual(
      full.filter(({ definitionId }) => definitionId === "STRIKE"),
    );
  });
});
