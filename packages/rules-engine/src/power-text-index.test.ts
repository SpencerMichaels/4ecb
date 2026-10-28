import { describe, expect, it } from "vitest";

import {
  POWER_TEXT_FIELD,
  POWER_TEXT_VERSION,
  parsePowerText,
  powerAttackSlots,
  type ContentEntity,
  type PowerTextStore,
} from "@4ecb/content-domain";

import type { CharacterInventoryEntry } from "./evaluator";
import { evaluatePowers } from "./powers";
import type { EvaluatedStat } from "./stats";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string>,
): ContentEntity {
  return {
    id,
    name,
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

/** The record with a `_Power Text IR` field, as the pack build stores it. */
function withStore(
  power: ContentEntity,
  texts: PowerTextStore["texts"],
): ContentEntity {
  const store: PowerTextStore = {
    version: POWER_TEXT_VERSION,
    slots: powerAttackSlots(power.specifics),
    texts,
  };
  return {
    ...power,
    specifics: [
      ...power.specifics,
      {
        name: POWER_TEXT_FIELD,
        value: JSON.stringify(store),
        extraAttributes: [],
        ordinal: power.specifics.length,
      },
    ],
  };
}

const longsword = entity("ID_FMP_WEAPON_14", "Longsword", "Weapon", {
  Damage: "1d8",
  "Proficiency Bonus": "3",
  Group: "Heavy Blade",
  "Weapon Category": "Military Melee",
});

const strike = entity("ID_TEST_POWER_STRIKE", "Test Strike", "Power", {
  "Power Usage": "At-Will",
  Keywords: "Martial, Weapon",
  "Action Type": "Standard Action",
  "Attack Type": "Melee weapon",
  Target: "One creature",
  Attack: "Strength vs. AC",
  Hit: "1[W] + Strength modifier damage.\nLevel 21: 2[W] + Strength modifier damage.",
});

const holding: CharacterInventoryEntry = {
  id: "longsword",
  definitionIds: [longsword.id],
  quantity: 1,
  equippedQuantity: 1,
  acquiredLevel: 1,
};

const stats: Record<string, EvaluatedStat> = Object.fromEntries(
  [
    ["Strength", 18],
    ["Strength modifier", 4],
    ["Charisma", 14],
    ["Charisma modifier", 2],
  ].map(([name, value]) => [
    name,
    { name: name as string, value: value as number, contributions: [] },
  ]),
);

function variant(power: ContentEntity, level = 1) {
  return evaluatePowers({
    level,
    activeDefinitionIds: [power.id],
    inventory: [holding],
    stats,
    overlays: [],
    entities: [power, longsword],
  })[0]?.variants[0];
}

describe("the pack's parsed power text", () => {
  it("gives the same row as parsing the text", () => {
    const stored = withStore(strike, {
      "Strength vs. AC": parsePowerText("Strength vs. AC", { attack: true }),
      [field(strike, "Hit")]: parsePowerText(field(strike, "Hit"), {
        hit: true,
      }),
    });
    for (const level of [1, 21])
      expect(variant(stored, level)).toEqual(variant(strike, level));
    expect(variant(stored, 21)?.damage).toBe("2d8+4");
  });

  it("is what the engine reads: it does not parse stored text again", () => {
    // A stored attack line that names Charisma for the text "Strength vs.
    // AC" shows the engine took the stored reading.
    const stored = withStore(strike, {
      "Strength vs. AC": parsePowerText("Charisma vs. AC", { attack: true }),
    });
    expect(variant(stored)?.attackStat).toBe("Charisma");
    expect(variant(strike)?.attackStat).toBe("Strength");
  });
});

function field(power: ContentEntity, name: string): string {
  return power.specifics.find((specific) => specific.name === name)!.value;
}
