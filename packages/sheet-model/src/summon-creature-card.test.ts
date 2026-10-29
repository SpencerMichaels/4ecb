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
    expect(creatureCardTypeLabel(card!)).toBe("Summoned creature");
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
