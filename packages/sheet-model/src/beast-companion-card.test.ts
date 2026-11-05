import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  beastCompanionStatistics,
  type EvaluatedPower,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

import {
  BEAST_COMPANION_COMMANDS,
  BEAST_NOTES_KEY_SUFFIX,
  SENTINEL_COMPANION_COMMANDS,
  sheetBeastCompanionCard,
  type SheetBeastCompanionCard,
} from "./beast-companion-card";
import { sheetCompanionCardKeyBase } from "./card-deck";
import { applySheetLayout, sheetLayoutCardKey } from "./sheet-layout";

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

  it("notes only situational bonuses aimed at the companion", () => {
    const conditional = (
      id: string,
      statName: string,
      condition: string,
      providerName: string,
    ) =>
      stat(statName, 0, [
        {
          id,
          stat: statName,
          value: "+1",
          providerId: `own-${id}`,
          providerName,
          condition,
          applied: false,
          reason: "conditional",
        },
      ]);
    const card = sheetBeastCompanionCard(
      wolf(),
      beast(
        Object.fromEntries([
          ...Object.entries(stats),
          conditional(
            "aura",
            "ALLY.AC",
            "to bloodied allies who can see and hear you",
            "Leader Aura",
          ),
          conditional(
            "quarry",
            "ALLY.attack rolls",
            "against your quarry",
            "Hunter's Bond",
          ),
          conditional(
            "named",
            "ALLY.Reflex Defense",
            "while your beast companion is adjacent to you",
            "Shared Guard",
          ),
          conditional(
            "companion",
            "COMPANION.Will Defense",
            "against charm attacks",
            "Steady Companion",
          ),
        ]),
      ),
      { abilityIncreaseIds: ["CAI_4_STR"] },
    );
    expect(card.notes.map((note) => note.source)).toEqual([
      "Nimble Companion",
      "Shared Guard",
      "Steady Companion",
    ]);
    expect(card.abilityIncreaseIds).toEqual(["CAI_4_STR"]);
  });

  it("lists the record's special rules, Manipulate Items included", () => {
    const entity = wolf();
    const card = sheetBeastCompanionCard(
      {
        ...entity,
        specifics: [
          ...entity.specifics,
          {
            name: "Manipulate Items",
            value: "Once per round it can pick up an item.",
            extraAttributes: [],
            ordinal: entity.specifics.length,
          },
        ],
      },
      beast(),
    );
    expect(card.traits).toEqual([
      { label: "Combat Advantage", text: "The target is knocked prone." },
      {
        label: "Manipulate Items",
        text: "Once per round it can pick up an item.",
      },
    ]);
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

describe("split beast companion cards (D110)", () => {
  const model = {
    powers: [],
    items: [],
    companions: [sheetBeastCompanionCard(wolf(), beast())],
  };
  const parts = (cards: readonly { readonly card: unknown }[]) =>
    cards
      .slice(2)
      .map(({ card }) => (card as SheetBeastCompanionCard).part ?? "whole");

  it("prints one whole card unless measured as overflowing", () => {
    expect(sheetCompanionCardKeyBase(model.companions[0]!)).toBe(
      "companion:wolf",
    );
    expect(parts(applySheetLayout(model, undefined).deck)).toEqual(["whole"]);
  });

  it("prints a split beast as stats then notes, under one layout key", () => {
    const split = new Set(["companion:wolf"]);
    const resolved = applySheetLayout(model, undefined, {
      splitCompanions: split,
    });
    expect(parts(resolved.deck)).toEqual(["stats", "notes"]);
    const notes = resolved.cards.at(-1)!;
    expect(notes.key).toBe(`companion:wolf${BEAST_NOTES_KEY_SUFFIX}`);
    expect(sheetLayoutCardKey(notes)).toBe("companion:wolf");
    expect(resolved.defaultCardOrder).not.toContain(notes.key);
    const hidden = applySheetLayout(
      model,
      { version: 1, hiddenCards: ["companion:wolf"] },
      { splitCompanions: split },
    );
    expect(parts(hidden.deck)).toEqual([]);
  });
});
