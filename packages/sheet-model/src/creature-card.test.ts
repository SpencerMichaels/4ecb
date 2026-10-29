import {
  ASSOCIATE_STAT_BLOCK_VERSION,
  CREATURE_STAT_BLOCK_FIELD,
  CREATURE_STAT_BLOCK_VERSION,
  type ContentEntity,
  type CreatureStatBlock,
} from "@4ecb/content-domain";
import type { CharacterOccurrence, EvaluatedStat } from "@4ecb/rules-engine";
import { describe, expect, it } from "vitest";

import { sheetCardDeck } from "./card-deck";
import {
  creatureCardText,
  creatureRecord,
  sheetCreatureCard,
  type SheetCreatureCard,
} from "./creature-card";
import { buildSheetModel, sheetItemCard } from "./index";
import { withSheetOverview } from "./overview";
import { applySheetLayout, sheetLayoutCardKey } from "./sheet-layout";

function gear(
  id: string,
  name: string,
  specifics: Readonly<Record<string, string>>,
  description = "",
): ContentEntity {
  return {
    id,
    name,
    type: "Gear",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([field, value], ordinal) => ({
      name: field,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description,
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const stat = (name: string, value: number): EvaluatedStat => ({
  name,
  value,
  contributions: [],
});

// Spelled like the content's mount records: Category "Mount", the published
// stat block in `_Monster`, parsed at pack build into `_Creature Stat Block`.
const PONY_MONSTER = [
  "Test Pony - Level 2 Brute",
  "Medium  natural beast (mount) - XP 125",
  "Initiative +2 Senses Perception +6",
  "HP 40; Bloodied 20",
  "AC 14; Fortitude 15, Reflex 13, Will 12",
  "Speed 7",
  "",
  "m Nip (standard, at-will) ",
  "+5 vs. AC; 1d6+3 damage.",
  "",
  "Steady (while mounted by a friendly rider of 2nd level or higher; at-will) ▪ Mount",
  "The pony's rider gains a +1 bonus to saving throws.",
  "",
  "Alignment Unaligned Languages -",
  "Str 16 (+4) ◆ Dex 13 (+2) ◆ Wis 12 (+2)",
  "Con 15 (+3) ◆ Int 2 (-3) ◆ Cha 8 (0)",
].join("\n");
const PONY_BLOCK: CreatureStatBlock = {
  version: CREATURE_STAT_BLOCK_VERSION,
  kind: "fixed",
  name: "Test Pony",
  level: 2,
  role: "Brute",
  xp: 125,
  size: "Medium",
  creatureType: "natural beast (mount)",
  initiative: 2,
  perception: 6,
  hitPoints: 40,
  bloodied: 20,
  defenses: { ac: 14, fortitude: 15, reflex: 13, will: 12 },
  speed: "7",
  entries: [
    {
      name: "Nip",
      attackKind: "basic-melee",
      usage: "standard, at-will",
      lines: [{ text: "+5 vs. AC; 1d6+3 damage." }],
    },
    {
      name: "Steady",
      usage:
        "while mounted by a friendly rider of 2nd level or higher; at-will",
      keywords: "Mount",
      lines: [{ text: "The pony's rider gains a +1 bonus to saving throws." }],
    },
    {
      name: "Quick Trot",
      usage: "move; encounter",
      lines: [{ text: "The pony shifts 2 squares." }],
    },
  ],
  alignment: "Unaligned",
  skills: "Endurance +9",
  abilities: {
    Strength: { score: 16, modifier: 4 },
    Constitution: { score: 15, modifier: 3 },
    Dexterity: { score: 13, modifier: 2 },
    Intelligence: { score: 2, modifier: -3 },
    Wisdom: { score: 12, modifier: 2 },
    Charisma: { score: 8, modifier: 0 },
  },
};
const LOAD_TABLE =
  "<table>Normal Load\tHeavy Load\tMax.Drag\n200 lb.\t400 lb.\t1,000 lb.</table>";
const pony = gear(
  "ID_TEST_PONY",
  "Test Pony",
  {
    Category: "Mount",
    Gold: "75",
    _Monster: PONY_MONSTER,
    [CREATURE_STAT_BLOCK_FIELD]: JSON.stringify(PONY_BLOCK),
  },
  LOAD_TABLE,
);

// An owner-relative block (the Celestial steeds): its description repeats
// the block's body.
const STEED_MONSTER = [
  "Test Steed - Large immortal beast (mount)",
  "   -   ",
  "Initiative equal to yours, Perception equal to yours",
  "",
  "HP your bloodied value",
  "",
  "Speed 8, fly 10",
  "",
  "Traits",
  "Steady Wings (mount): The steed's rider gains a +1 bonus to attack rolls.",
  "",
  "Standard Actions",
  "m Bite (At-Will)",
  "Attack: Melee 2 (one creature); your level + 5 vs. AC",
].join("\r\n");
const STEED_BLOCK: CreatureStatBlock = {
  version: CREATURE_STAT_BLOCK_VERSION,
  kind: "master",
  name: "Test Steed",
  block: {
    version: ASSOCIATE_STAT_BLOCK_VERSION,
    size: "Large",
    creatureType: "immortal beast (mount)",
    hitPoints: { kind: "master-bloodied" },
    healingSurges:
      "none, but you can spend a healing surge for the steed if an effect allows it to spend one",
    defenses: {
      kind: "master",
      bonus: { ac: 2, fortitude: 2, reflex: 2, will: 2 },
    },
    defensesNote: "not including any temporary bonuses or penalties",
    initiative: { bonus: 0 },
    perception: { bonus: 0 },
    speed: "8, fly 10",
    traits: [
      {
        name: "Steady Wings",
        keywords: "mount",
        lines: [
          { text: "The steed's rider gains a +1 bonus to attack rolls." },
        ],
      },
    ],
    powers: [
      {
        name: "Bite",
        action: "Standard",
        usage: "At-Will",
        lines: [
          {
            label: "Attack",
            text: "Melee 2 (one creature); your level + 5 vs. AC",
            attack: {
              range: "Melee 2 (one creature)",
              bonus: { kind: "level", plus: 5 },
              defense: "AC",
            },
          },
        ],
      },
    ],
  },
};
const steed = gear(
  "ID_TEST_STEED",
  "Test Steed",
  {
    Category: "Mount",
    _Monster: STEED_MONSTER,
    [CREATURE_STAT_BLOCK_FIELD]: JSON.stringify(STEED_BLOCK),
  },
  [
    "Initiative equal to yours, Perception equal to yours",
    "HP your bloodied value",
    "Speed 8, fly 10",
    "Traits: Steady Wings (mount): The steed's rider gains a +1 bonus to attack rolls.",
    "Standard Actions",
    "m Bite (At-Will)",
    "Attack: Melee 2 (one creature); your level + 5 vs. AC",
  ].join("\n"),
);

const ownerStats = {
  "Hit Points": stat("Hit Points", 82),
  AC: stat("AC", 25),
  "Fortitude Defense": stat("Fortitude Defense", 22),
  "Reflex Defense": stat("Reflex Defense", 21),
  "Will Defense": stat("Will Defense", 23),
  Initiative: stat("Initiative", 7),
  Perception: stat("Perception", 12),
};

function mountCard(entity: ContentEntity, holdingId = "holding-1") {
  const record = creatureRecord([entity])!;
  return sheetCreatureCard({
    ...record,
    origin: { kind: "mount", holdingId },
    stats: ownerStats,
    level: 12,
  });
}

describe("creature card (D110)", () => {
  it("prints a published block's own numbers, traits apart from actions", () => {
    const card = mountCard(pony);
    expect(card).toMatchObject({
      kind: "creature",
      id: "ID_TEST_PONY",
      origin: { kind: "mount", holdingId: "holding-1" },
      name: "Test Pony",
      level: 2,
      role: "Brute",
      identity: "Medium natural beast (mount)",
      defenses: { ac: 14, fortitude: 15, reflex: 13, will: 12 },
      hitPoints: 40,
      bloodied: 20,
      initiative: 2,
      perception: 6,
      speed: "7",
      skills: "Endurance +9",
      description: LOAD_TABLE,
    });
    expect(card.abilities?.[0]).toEqual({
      name: "Strength",
      score: 16,
      modifier: 4,
    });
    // A rider trait is passive; the basic attack and a move power act.
    expect(card.traits.map(({ name }) => name)).toEqual(["Steady"]);
    expect(card.actions.map(({ name }) => name)).toEqual(["Nip", "Quick Trot"]);
    expect(card.actions[0]?.attackKind).toBe("basic-melee");
    expect(card.actions[0]?.lines[0]?.text).toBe("+5 vs. AC; 1d6+3 damage.");
  });

  it("works out an owner-relative block from the owner's stats", () => {
    const card = mountCard(steed);
    expect(card).toMatchObject({
      hitPoints: 41,
      hitPointsFrom: "Your bloodied value",
      bloodied: 20,
      defenses: { ac: 27, fortitude: 24, reflex: 23, will: 25 },
      defensesNote:
        "Your defenses, not including any temporary bonuses or penalties",
      initiative: 7,
      perception: 12,
      healingSurges:
        "None, but you can spend a healing surge for the steed if an effect allows it to spend one",
    });
    expect(card.traits.map(({ name }) => name)).toEqual(["Steady Wings"]);
    expect(card.actions[0]?.lines[0]?.text).toBe(
      "Melee 2 (one creature); +17 vs. AC",
    );
    // The description only repeats the block: no surface shows it twice.
    expect(card.description).toBeUndefined();
    expect(creatureCardText(card)).toContain("Steady Wings");
  });

  it("leaves the item card its price and load, not the stat block", () => {
    const ponyItem = sheetItemCard({ name: "Test Pony", entities: [pony] });
    expect(ponyItem.description).toBe(LOAD_TABLE);
    const labels = ponyItem.fields.map(({ label }) => label);
    expect(labels).not.toContain("_Monster");
    expect(labels).not.toContain(CREATURE_STAT_BLOCK_FIELD);
    expect(
      sheetItemCard({ name: "Test Steed", entities: [steed] }).description,
    ).toBeUndefined();
  });

  it("has no creature for a mount without a stat block (Crodlu)", () => {
    const crodlu = gear(
      "ID_TEST_CRODLU",
      "Test Crodlu",
      { Category: "Mount", Gold: "225" },
      "A large, flightless drake.",
    );
    expect(creatureRecord([crodlu])).toBeUndefined();
    expect(
      sheetItemCard({ name: "Test Crodlu", entities: [crodlu] }).description,
    ).toBe("A large, flightless drake.");
  });

  it("keys a mount's card by its holding in the companions run", () => {
    const deck = sheetCardDeck({
      powers: [],
      items: [],
      companions: [mountCard(pony, "h-pony"), mountCard(steed, "h-steed")],
    });
    expect(
      deck.filter(({ group }) => group === "companions").map(({ key }) => key),
    ).toEqual(["creature:mount:h-pony", "creature:mount:h-steed"]);
  });
});

describe("split creature cards", () => {
  const model = {
    powers: [],
    items: [],
    companions: [mountCard(pony, "h-pony"), mountCard(steed, "h-steed")],
  };
  const parts = (cards: readonly { readonly card: unknown }[]) =>
    cards.map(({ card }) => {
      const creature = card as SheetCreatureCard;
      return `${creature.name}:${creature.part ?? "whole"}`;
    });

  it("prints one whole card unless measured as overflowing", () => {
    expect(parts(applySheetLayout(model, undefined).deck.slice(2))).toEqual([
      "Test Pony:whole",
      "Test Steed:whole",
    ]);
  });

  it("prints a split creature as stats then actions, under one layout key", () => {
    const resolved = applySheetLayout(model, undefined, {
      splitCreatures: new Set(["creature:mount:h-steed"]),
    });
    expect(parts(resolved.deck.slice(2))).toEqual([
      "Test Pony:whole",
      "Test Steed:stats",
      "Test Steed:actions",
    ]);
    const actions = resolved.cards.at(-1)!;
    expect(actions.key).toBe("creature:mount:h-steed:actions");
    expect(sheetLayoutCardKey(actions)).toBe("creature:mount:h-steed");
    // The stored order never holds the halves apart.
    expect(resolved.defaultCardOrder).not.toContain(actions.key);
  });

  it("hides and moves the pair together", () => {
    const split = new Set(["creature:mount:h-steed"]);
    const hidden = applySheetLayout(
      model,
      { version: 1, hiddenCards: ["creature:mount:h-steed"] },
      { splitCreatures: split },
    );
    expect(parts(hidden.deck.slice(2))).toEqual(["Test Pony:whole"]);
    expect(
      hidden.cards.filter(({ shown }) => !shown).map(({ key }) => key),
    ).toEqual(["creature:mount:h-steed", "creature:mount:h-steed:actions"]);
    const moved = applySheetLayout(
      model,
      {
        version: 1,
        cardOrder: [
          "play:character",
          "play:skills",
          "creature:mount:h-steed",
          "creature:mount:h-pony",
        ],
      },
      { splitCreatures: split },
    );
    expect(parts(moved.deck.slice(2))).toEqual([
      "Test Steed:stats",
      "Test Steed:actions",
      "Test Pony:whole",
    ]);
  });
});

describe("creature card page-1 reminders", () => {
  it("drops the reminders of the features that only give the creature", () => {
    const summoner = {
      ...gear("class:summoner", "Steed Caller", {}),
      type: "Class Feature",
      description: "Gain a steed; it is an ally of you and your allies.",
      specifics: [
        {
          name: "Short Description",
          value: "Gain a steed; it is an ally of you and your allies.",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const entities = [summoner, steed];
    const selections = [
      { id: summoner.id, name: summoner.name, type: summoner.type },
    ];
    const occurrences: CharacterOccurrence[] = [
      {
        id: "occ:summoner",
        definitionId: summoner.id,
        acquiredLevel: 1,
        kind: "choice",
      },
    ];
    const base = buildSheetModel(
      {
        details: { name: "Caller", Level: "12" },
        abilities: {},
        stats: {},
        selectedRules: selections,
        levelCount: 12,
        source: "legacy-cache",
        textStrings: {},
        loot: [],
        powers: [],
      },
      entities,
    );
    const reminders = (companions: typeof base.companions) =>
      withSheetOverview(
        { ...base, companions },
        {
          level: 12,
          stats: {},
          evaluatedStats: {},
          occurrences,
          selections,
          content: entities,
          inventory: [],
        },
      ).overview!.reminders.map(({ label }) => label);
    expect(reminders([])).toContain("Steed Caller");
    const record = creatureRecord([steed])!;
    const card = sheetCreatureCard({
      ...record,
      origin: { kind: "mount" },
      stats: ownerStats,
      level: 12,
      provenanceIds: ["occ:summoner"],
    });
    expect(reminders([card])).not.toContain("Steed Caller");
  });
});
