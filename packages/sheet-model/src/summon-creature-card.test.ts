import {
  ASSOCIATE_STAT_BLOCK_VERSION,
  CREATURE_STAT_BLOCK_FIELD,
  CREATURE_STAT_BLOCK_VERSION,
  type ContentEntity,
  type CreatureStatBlock,
} from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedStat } from "@4ecb/rules-engine";
import { describe, expect, it } from "vitest";

import { sheetCardDeck } from "./card-deck";
import {
  creatureCardTypeLabel,
  sheetCreatureCardKeyBase,
  summonCreatureFieldNames,
  type SheetCreatureCard,
} from "./creature-card";
import { buildEvaluatedSheetModel } from "./index";

const stat = (name: string, value: number): EvaluatedStat => ({
  name,
  value,
  contributions: [],
});

// Spelled like a Player's Handbook 2 summon: the Effect summons the
// creature, the indented fields are its commands, the augment's fields
// follow "Augment". The import stores the creature with the fields it
// shows (legacy-wotc summon-creature.ts).
const HERON_BLOCK: CreatureStatBlock = {
  version: CREATURE_STAT_BLOCK_VERSION,
  kind: "master",
  name: "Glass Heron",
  block: {
    version: ASSOCIATE_STAT_BLOCK_VERSION,
    role: "Summoned Creature",
    size: "Medium",
    creatureType: "glass heron",
    hitPoints: { kind: "master-bloodied" },
    defenses: {
      kind: "master",
      bonus: { ac: 4, fortitude: 2, reflex: 2, will: 2 },
    },
    defensesNote: "not including any temporary bonuses or penalties",
    speed: "6, fly 8 (hover)",
    traits: [
      {
        name: "Instinctive Effect",
        lines: [{ text: "It attacks the nearest enemy." }],
      },
    ],
    powers: [
      {
        name: "Standard Action",
        action: "Standard",
        lines: [
          {
            text: "Melee 1; Intelligence vs. Reflex; 1d8 + Intelligence modifier cold damage.",
          },
        ],
      },
    ],
  },
  powerFields: [" Standard action", "Instinctive Effect"],
};

const heron: ContentEntity = {
  id: "ID_TEST_SUMMON_HERON",
  name: "Summon Glass Heron",
  type: "Power",
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: Object.entries({
    "Power Usage": "Daily",
    Keywords: "Arcane, Implement, Summoning",
    "Action Type": "Minor Action",
    "Attack Type": "Ranged 5",
    Effect:
      "You summon a Medium glass heron in an unoccupied square within range.",
    " Standard action":
      "Melee 1; Intelligence vs. Reflex; 1d8 + Intelligence modifier cold damage.",
    "Instinctive Effect": "It attacks the nearest enemy.",
    Augment: "2",
    " Effect": "As above, and the heron has fly 10.",
    [CREATURE_STAT_BLOCK_FIELD]: JSON.stringify(HERON_BLOCK),
  }).map(([name, value], ordinal) => ({
    name,
    value,
    extraAttributes: [],
    ordinal,
  })),
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
};

const evaluation: EvaluatedCharacter = {
  level: 10,
  converged: true,
  iterations: 1,
  complete: true,
  legal: true,
  occurrences: [
    {
      id: "occ:heron",
      definitionId: heron.id,
      acquiredLevel: 9,
      kind: "choice",
    },
  ],
  activeDefinitionIds: [heron.id],
  activeDefinitions: [],
  choices: [],
  stats: {
    "Hit Points": stat("Hit Points", 70),
    AC: stat("AC", 24),
    "Fortitude Defense": stat("Fortitude Defense", 20),
    "Reflex Defense": stat("Reflex Defense", 22),
    "Will Defense": stat("Will Defense", 21),
    "Intelligence modifier": stat("Intelligence modifier", 5),
    "SUMMON.AC": stat("SUMMON.AC", 1),
  },
  textStrings: {},
  overlays: [],
  powers: [
    {
      definitionId: heron.id,
      name: heron.name,
      usage: "Daily",
      actionType: "Minor Action",
      keywords: ["Arcane", "Implement", "Summoning"],
      recoveries: [],
      variants: [],
      unsupported: [],
    },
  ],
  suggestions: [],
  diagnostics: [],
};

function model() {
  return buildEvaluatedSheetModel(
    {
      details: {},
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [],
      textStrings: {},
      levelCount: 10,
      source: "legacy-cache",
    },
    {
      formatVersion: 3,
      known: [],
      effectiveLevel: 10,
      levels: [],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    },
    evaluation,
    [heron],
  );
}

describe("summoned creature card (D111)", () => {
  it("prints the summon power's creature with your hit points and defenses", () => {
    const sheet = model();
    const card = sheet.companions.find(
      (candidate): candidate is SheetCreatureCard =>
        candidate.kind === "creature",
    );
    expect(card).toMatchObject({
      name: "Glass Heron",
      origin: { kind: "summon", powerId: heron.id },
      identity: "Medium glass heron",
      hitPoints: 35,
      hitPointsFrom: "Your bloodied value",
      // Your defenses, the Effect's bonuses and the SUMMON. creature bonus.
      defenses: { ac: 29, fortitude: 22, reflex: 24, will: 23 },
      speed: "6, fly 8 (hover)",
      provenanceIds: ["occ:heron"],
    });
    // The power's usage joins the type bar (D111).
    expect(creatureCardTypeLabel(card!)).toBe("Summoned creature · Daily");
    expect(sheetCreatureCardKeyBase(card!)).toBe(
      "creature:summon:id_test_summon_heron",
    );
    // A command's text takes the power card's personalization.
    expect(card!.actions[0]?.lines[0]?.text).toBe(
      "Melee 1; Intelligence vs. Reflex; 1d8 + Intelligence modifier (+5) cold damage.",
    );
    expect(card!.traits.map(({ name }) => name)).toEqual([
      "Instinctive Effect",
    ]);
  });

  it("leaves the creature's fields off the power card and keeps the summoning", () => {
    const power = model().powers.find(({ name }) => name === heron.name);
    const labels = power?.fields.map(({ label }) => label) ?? [];
    expect(labels).toContain("Effect");
    expect(labels).toContain("Augment");
    expect(labels).toContain(" Effect");
    expect(labels).not.toContain(" Standard action");
    expect(labels).not.toContain("Instinctive Effect");
    expect([...summonCreatureFieldNames(heron)]).toEqual([
      " Standard action",
      "Instinctive Effect",
    ]);
  });

  it("deals the creature into the companions run under its own key", () => {
    const deck = sheetCardDeck(model());
    const keys = deck.map(({ key }) => key);
    expect(keys).toContain("creature:summon:id_test_summon_heron");
    expect(keys.indexOf("creature:summon:id_test_summon_heron")).toBeLessThan(
      keys.findIndex((key) => key.startsWith("power:")),
    );
  });
});

/** A Power record with these fields, in order. */
function power(
  id: string,
  name: string,
  fields: Record<string, string>,
): ContentEntity {
  return {
    ...heron,
    id,
    name,
    specifics: Object.entries(fields).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
  };
}

function modelOf(
  entity: ContentEntity,
  evaluated: EvaluatedCharacter["powers"][number],
) {
  return buildEvaluatedSheetModel(
    {
      details: {},
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [],
      textStrings: {},
      levelCount: 10,
      source: "legacy-cache",
    },
    {
      formatVersion: 3,
      known: [],
      effectiveLevel: 10,
      levels: [],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    },
    {
      ...evaluation,
      occurrences: [
        {
          id: "occ:summon",
          definitionId: entity.id,
          acquiredLevel: 9,
          kind: "choice",
        },
      ],
      activeDefinitionIds: [entity.id],
      powers: [evaluated],
    },
    [entity],
  );
}

const creatureOf = (sheet: ReturnType<typeof modelOf>) =>
  sheet.companions.find(
    (candidate): candidate is SheetCreatureCard =>
      candidate.kind === "creature",
  );

describe("summoned creature commands (D111)", () => {
  // Legacy's row comes from the " Opportunity Attack" field; the engine
  // works out each command (rules-engine PowerCommand).
  const angel = power("ID_TEST_SUMMON_ANGEL", "Summon Glass Angel", {
    "Power Usage": "Daily",
    Keywords: "Divine, Implement, Summoning",
    "Action Type": "Minor Action",
    "Attack Type": "Ranged 5",
    Effect:
      "You summon a Medium glass angel in an unoccupied square within range.",
    " Opportunity Attack":
      "Melee 1; targets one creature; Wisdom vs. Reflex; 1d8 + Wisdom modifier damage.",
    [CREATURE_STAT_BLOCK_FIELD]: JSON.stringify({
      ...HERON_BLOCK,
      name: "Glass Angel",
      block: {
        ...HERON_BLOCK.block,
        traits: [],
        powers: [
          {
            name: "Opportunity Attack",
            action: "Opportunity",
            lines: [
              {
                text: "Melee 1; targets one creature; Wisdom vs. Reflex; 1d8 + Wisdom modifier damage.",
              },
            ],
            roll: {
              attack: "Wisdom vs. Reflex",
              hit: "1d8 + Wisdom modifier damage.",
              attackType: "Melee 1",
              target: "One creature",
            },
          },
        ],
      },
      powerFields: [" Opportunity Attack"],
    }),
  });
  const command = {
    id: "ID_TEST_SUMMON_ANGEL:command-0",
    ordinal: 0,
    entry: 0,
    attackStat: "Wisdom",
    powerBonus: 0,
    defense: "Reflex",
    attackBonus: 12,
    damage: "1d8+7",
    attackComponents: [],
    damageComponents: [],
  };
  const row = (
    id: string,
    equipped: boolean,
    commands: readonly (typeof command)[],
  ) => ({
    id,
    equipmentName: id,
    equipped,
    hand: "main" as const,
    proficient: true,
    attackStat: "Wisdom",
    defense: "Reflex",
    attackBonus: 12,
    attackComponents: [],
    damageComponents: [],
    conditionalDamage: [],
    commands,
  });
  const evaluated = {
    definitionId: angel.id,
    name: angel.name,
    usage: "Daily",
    actionType: "Minor Action",
    keywords: ["Divine", "Implement", "Summoning"],
    recoveries: [],
    variants: [
      row("staff", false, [{ ...command, attackBonus: 10, damage: "1d8+5" }]),
      row("rod", true, [command]),
    ],
    unsupported: [],
  };

  it("prints each command's row from the equipped implement on the creature card", () => {
    const card = creatureOf(modelOf(angel, evaluated));
    expect(card?.actions[0]?.roll).toEqual({
      attack: "+12 vs. Reflex",
      damage: "1d8+7",
    });
    expect(creatureCardTypeLabel(card!)).toBe("Summoned creature · Daily");
  });

  it("leaves the power card's attack band and weapon table to the creature", () => {
    const sheet = modelOf(angel, evaluated);
    const card = sheet.powers.find(({ name }) => name === angel.name);
    expect(card?.attack).toBeUndefined();
    expect(card?.damage).toBeUndefined();
    expect(card?.variants).toBeUndefined();
    // Its Effect still prints, so the card does.
    expect(card?.foldedIntoCreature).toBeUndefined();
    expect(sheetCardDeck(sheet).map(({ key }) => key)).toContain(
      "power:id_test_summon_angel",
    );
  });

  // A hexblade's pact creature: the summon power has only its stat fields;
  // its merged community attack card (legacy-wotc summon-community-cards)
  // keeps its stat-block lines, and the engine works out its row.
  const pact = power(
    "ID_TEST_PACT_POWERCARD_0",
    "Summoned Creature (Glass Well)",
    {
      "Power Usage": "Daily",
      Display: "",
      Keywords: "Arcane, Summoning",
      "Action Type": "",
      Creature: "Glass Handmaiden",
      "Hit Points": "Your bloodied value.",
      Defenses:
        "Your defenses + 2, not including any temporary bonuses or penalties.",
      Level: "9",
      [CREATURE_STAT_BLOCK_FIELD]: JSON.stringify({
        ...HERON_BLOCK,
        name: "Glass Handmaiden",
        block: {
          ...HERON_BLOCK.block,
          traits: [],
          powers: [
            {
              name: "Glass Handmaiden's Attack",
              action: "Standard",
              usage: "At-Will",
              lines: [
                { label: "Target", text: "One creature" },
                {
                  label: "Attack",
                  text: "Melee 1; your level + 5 vs. Reflex",
                  attack: {
                    range: "Melee 1",
                    bonus: { kind: "level", plus: 5 },
                    defense: "Reflex",
                  },
                },
                {
                  label: "Hit",
                  text: "2d8 + your Charisma modifier radiant damage, and the target is immobilized.",
                  damage: {
                    terms: [
                      { kind: "dice", dice: "2d8" },
                      { kind: "ability", abilities: ["Charisma"] },
                    ],
                    damageType: "radiant",
                  },
                  rest: ", and the target is immobilized.",
                },
              ],
              roll: {
                attack: "your level + 5 vs. Reflex",
                hit: "2d8 + your Charisma modifier radiant damage, and the target is immobilized.",
                attackType: "Melee 1",
                source: {
                  id: "ID_TEST_PACT_POWERCARD_2",
                  name: "Glass Handmaiden's Attack",
                },
              },
            },
          ],
        },
        powerFields: ["Creature", "Hit Points", "Defenses"],
        absorbed: ["ID_TEST_PACT_POWERCARD_2"],
      }),
    },
  );
  const pactEvaluated = {
    definitionId: pact.id,
    name: pact.name,
    usage: "Daily",
    keywords: ["Arcane", "Summoning"],
    recoveries: [],
    variants: [],
    commands: [
      {
        ...command,
        id: "ID_TEST_PACT_POWERCARD_0:command-0",
        attackStat: "Level",
        attackBonus: 16,
        damage: "2d8+10",
        damageType: "radiant",
      },
    ],
    unsupported: [],
  };

  it("puts the engine's numbers in a merged attack's stat-block lines", () => {
    const card = creatureOf(modelOf(pact, pactEvaluated));
    expect(
      card?.actions[0]?.lines.map(({ label, text }) => [label, text]),
    ).toEqual([
      ["Target", "One creature"],
      ["Attack", "Melee 1; +16 vs. Reflex"],
      ["Hit", "2d8+10 radiant damage, and the target is immobilized."],
    ]);
    expect(card?.actions[0]?.roll).toBeUndefined();
  });

  it("prints no card for a pact power its creature card carries whole", () => {
    const sheet = modelOf(pact, pactEvaluated);
    const card = sheet.powers.find(({ name }) => name === pact.name);
    expect(card?.foldedIntoCreature).toBe(true);
    const keys = sheetCardDeck(sheet).map(({ key }) => key);
    expect(keys).not.toContain("power:id_test_pact_powercard_0");
    expect(keys).toContain("creature:summon:id_test_pact_powercard_0");
  });
});
