import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  beastCompanionStatistics,
  type EvaluatedPower,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

import {
  BEAST_COMPANION_COMMANDS,
  SENTINEL_COMPANION_COMMANDS,
  sheetBeastCompanionCard,
} from "./beast-companion-card";

const fields: Record<string, string> = {
  Strength: "14",
  Constitution: "14",
  Dexterity: "14",
  Intelligence: "6",
  Wisdom: "14",
  Charisma: "6",
  "Attack Bonus": "4",
  Damage: "1d8",
  "Armor Class": "14",
  "Fortitude Defense": "12",
  "Reflex Defense": "12",
  "Will Defense": "13",
  "Hit Points at 1st Level": "14",
  "Hit Points per Level Gained": "8",
  Size: "Medium",
  Speed: "7",
  Attack: "Bite",
  "Ability Score": "Strength",
  "Combat Advantage": "The target is knocked prone.",
  Power: "",
};

function wolf(): ContentEntity {
  return {
    id: "WOLF",
    name: "Wolf",
    type: "Companion",
    source: "Test Book",
    sources: ["Test Book"],
    attributes: [],
    categories: [],
    specifics: Object.entries(fields).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [
      {
        name: "grant",
        attributes: [
          { name: "name", value: "BEAST_BASIC" },
          { name: "type", value: "Power" },
        ],
        text: "",
        children: [],
        ordinal: 0,
      },
    ],
    description: " A loyal hunter. ",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const stat = (
  name: string,
  value: number,
  contributions: EvaluatedStat["contributions"] = [],
) => [name, { name, value, contributions }] as const;

const stats = Object.fromEntries([
  stat("Companion.Strength", 16),
  stat("Companion.Constitution", 14),
  stat("Companion.Dexterity", 15),
  stat("Companion.Intelligence", 6),
  stat("Companion.Wisdom", 15),
  stat("Companion.Charisma", 6),
  stat("BEAST.Saving Throws", 2),
  stat("BEAST.AC", 0, [
    {
      id: "nimble",
      stat: "BEAST.AC",
      value: "+2",
      providerId: "own-nimble",
      providerName: "Nimble Companion",
      condition: "against opportunity attacks",
      applied: false,
      reason: "conditional",
    },
  ]),
]);

function beast(statsOverride = stats, level = 8) {
  return {
    occurrenceId: "own-WOLF",
    definitionId: "WOLF",
    name: "Wolf",
    statistics: beastCompanionStatistics({
      fields,
      stats: statsOverride,
      level,
      skills: [
        { name: "Perception", keyAbility: "Wisdom", trained: true },
        { name: "Stealth", keyAbility: "Dexterity", trained: false },
      ],
    }),
  };
}

describe("beast companion card", () => {
  it("shows the evaluated statistics with the player's name", () => {
    const card = sheetBeastCompanionCard(wolf(), beast(), {
      textStrings: {
        _COMPANION_NAME: "Ash",
        _COMPANION_APPEARANCE: "timber wolf",
      },
    });
    // The proposal's mockup: a level 8 wolf with Str+Dex at 4, Str+Wis at 8.
    expect(card).toMatchObject({
      kind: "beast",
      id: "WOLF",
      occurrenceId: "own-WOLF",
      name: "Ash",
      appearance: "timber wolf",
      category: "Wolf",
      level: 8,
      size: "Medium",
      speed: "7",
      vision: "Low-light",
      defenses: { ac: 22, fortitude: 20, reflex: 20, will: 21 },
      hitPoints: 78,
      bloodied: 39,
      healingSurgeValue: 19,
      healingSurges: 2,
      sharesHealingSurges: false,
      attack: { name: "Bite", attackBonus: 12, defense: "AC", damage: "1d8+3" },
      savingThrows: 2,
      skills: [{ name: "Perception", total: 11, trained: true }],
      notes: [
        {
          text: "+2 AC against opportunity attacks.",
          source: "Nimble Companion",
          provenanceId: "nimble",
        },
      ],
      traits: [
        { label: "Combat Advantage", text: "The target is knocked prone." },
      ],
      commands: BEAST_COMPANION_COMMANDS,
      description: "A loyal hunter.",
      source: "Test Book",
    });
    expect(card.abilities[0]).toEqual({
      name: "Strength",
      score: 16,
      modifier: 3,
    });
    expect(card).not.toHaveProperty("resistances");
  });

  it("falls back to the record name and reads the granted attack power", () => {
    const power: EvaluatedPower = {
      definitionId: "BEAST_BASIC",
      name: "Beast Melee Basic Attack",
      keywords: [],
      recoveries: [],
      unsupported: [],
      variants: [
        {
          id: "BEAST_BASIC:unarmed",
          equipmentName: "Unarmed",
          proficient: true,
          attacker: "beast",
          attackBonus: 13,
          defense: "AC",
          damage: "1d8+5",
          attackComponents: [],
          damageComponents: [],
          conditionalDamage: [],
        },
      ],
    };
    const card = sheetBeastCompanionCard(wolf(), beast(), {
      powers: [power],
    });
    expect(card.name).toBe("Wolf");
    expect(card).not.toHaveProperty("appearance");
    expect(card.attack).toEqual({
      name: "Bite",
      attackBonus: 13,
      defense: "AC",
      damage: "1d8+5",
    });
  });

  it("uses the sentinel's shared surges and command line", () => {
    const card = sheetBeastCompanionCard(
      wolf(),
      beast(
        Object.fromEntries([
          ...Object.entries(stats),
          stat("BEAST.Healing Surges", -2),
        ]),
      ),
    );
    expect(card.sharesHealingSurges).toBe(true);
    expect(card).not.toHaveProperty("healingSurges");
    expect(card.commands).toBe(SENTINEL_COMPANION_COMMANDS);
  });
});
