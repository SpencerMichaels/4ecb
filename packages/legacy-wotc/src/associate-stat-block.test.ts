import { describe, expect, it } from "vitest";

import {
  ASSOCIATE_STAT_BLOCK_FIELD,
  readAssociateStatBlock,
} from "@4ecb/content-domain";

import {
  parseAssociateDamage,
  parseAssociateStatBlock,
} from "./associate-stat-block";
import { parseD20Rules } from "./parser";

// Synthetic creatures, written in the spellings the real Associate records
// use: two tab-separated columns, "F" for the usage bullet, power-icon
// letters, "Level 21:" damage steps and ability lines with "*" or tabs.
const beastCompanion = [
  "TRAINED MOSS HOUND\t\tFey Beast Companion",
  "Medium fey beast",
  "HP your bloodied value\t\t\t\tInitiative equal to yours",
  "Defenses (Add your level to each defense)",
  "AC 14, Fortitude 12, Reflex 13, Will 11\t\tPerception equal to yours +2",
  "Speed  6 , climb 4 \t\tlow-light vision",
  "TRAITS",
  "Mossy Pack (zone)  Aura 1",
  "Allies in the aura gain a +1 power bonus to Stealth checks.",
  "STANDARD",
  "Mossy Bite (poison)  At-Will",
  "Attack: Melee 1 (one creature); your level + 5 vs. AC",
  "Hit: 1d8 + one-half your level damage, and the target is slowed until the end of your next turn.",
  "\tLevel 21: 2d8 + one-half your level damage.",
  "Str 14 * Dex 18 * Wis 12",
  "Con 16 * Int 2 * Cha 6",
].join("\n");

const summonedCreature = [
  "EMBER SPIRIT\t\tSummoned Creature",
  "Large elemental magical beast (fire)",
  "",
  "HP your bloodied value; Healing Surges none, but you can expend a healing surge for the spirit if an effect allows it to spend one",
  "Defenses your defenses + 2, not including any temporary bonuses or penalties; Vulnerable 5 cold",
  "Speed land 6 , fly 4 (hover; altitude limit 1)",
  "",
  "TRAITS",
  "O Smoldering Aura 2",
  "The aura is lightly obscured.",
  "",
  "Brittle Embers",
  "Whenever the spirit takes cold damage, it is slowed until the end of your next turn.",
  "",
  "STANDARD",
  "M Standard Action (fire)  F At-Will",
  "Attack: Melee 2 (one creature); your level + 7 vs. Reflex",
  "Hit: 2d8 + your Wisdom modifier fire damage, and ongoing 5 fire damage (save ends).",
  "",
  "MINOR",
  "Minor Action F At-Will (1/round) ",
  "Effect: The spirit either walks, shifts, runs, stands up, squeezes, or crawls.",
  "Instinctive Effect",
  "If you haven't given the spirit any commands by the end of your turn, it attacks an adjacent enemy.",
  "",
  "Resist",
  "Resist: fire 10",
].join("\n");

describe("associate stat block parser", () => {
  it("reads a level-scaled companion's stat block", () => {
    const { block, issues } = parseAssociateStatBlock(beastCompanion);
    expect(issues).toEqual([]);
    expect(block).toMatchObject({
      role: "Fey Beast Companion",
      size: "Medium",
      creatureType: "fey beast",
      hitPoints: { kind: "master-bloodied" },
      defenses: {
        kind: "level",
        base: { ac: 14, fortitude: 12, reflex: 13, will: 11 },
      },
      initiative: { bonus: 0 },
      perception: { bonus: 2 },
      speed: "6, climb 4",
      senses: "low-light vision",
      abilities: {
        Strength: 14,
        Constitution: 16,
        Dexterity: 18,
        Intelligence: 2,
        Wisdom: 12,
        Charisma: 6,
      },
    });
    expect(block?.traits).toEqual([
      {
        name: "Mossy Pack",
        keywords: "zone",
        aura: 1,
        lines: [
          {
            text: "Allies in the aura gain a +1 power bonus to Stealth checks.",
          },
        ],
      },
    ]);
    const [bite] = block?.powers ?? [];
    expect(bite).toMatchObject({
      name: "Mossy Bite",
      keywords: "poison",
      usage: "At-Will",
      action: "Standard",
    });
    expect(bite?.lines[0]?.attack).toEqual({
      range: "Melee 1 (one creature)",
      bonus: { kind: "level", plus: 5 },
      defense: "AC",
    });
    expect(bite?.lines[1]).toMatchObject({
      label: "Hit",
      damage: {
        terms: [{ kind: "dice", dice: "1d8" }, { kind: "half-level" }],
      },
      rest: ", and the target is slowed until the end of your next turn.",
      steps: [
        {
          level: 21,
          damage: {
            terms: [{ kind: "dice", dice: "2d8" }, { kind: "half-level" }],
          },
        },
      ],
    });
  });

  it("reads a summoned creature that uses its master's defenses", () => {
    const { block, issues } = parseAssociateStatBlock(summonedCreature);
    expect(issues).toEqual([]);
    expect(block).toMatchObject({
      role: "Summoned Creature",
      size: "Large",
      creatureType: "elemental magical beast (fire)",
      healingSurges:
        "none, but you can expend a healing surge for the spirit if an effect allows it to spend one",
      defenses: {
        kind: "master",
        bonus: { ac: 2, fortitude: 2, reflex: 2, will: 2 },
      },
      defensesNote: "not including any temporary bonuses or penalties",
      defenseTraits: ["Vulnerable 5 cold", "Resist 10 fire"],
      speed: "6, fly 4 (hover; altitude limit 1)",
    });
    expect(block?.traits.map(({ name, aura }) => [name, aura])).toEqual([
      ["Smoldering", 2],
      ["Brittle Embers", undefined],
      ["Instinctive Effect", undefined],
    ]);
    expect(
      block?.powers.map(({ name, keywords, usage, action }) => [
        name,
        keywords,
        usage,
        action,
      ]),
    ).toEqual([
      ["Standard Action", "fire", "At-Will", "Standard"],
      ["Minor Action", undefined, "At-Will (1/round)", "Minor"],
    ]);
    expect(block?.powers[0]?.lines[1]?.damage).toEqual({
      terms: [
        { kind: "dice", dice: "2d8" },
        { kind: "ability", abilities: ["Wisdom"] },
      ],
      damageType: "fire",
    });
  });

  it("reads the other hit-point and defense forms", () => {
    const companion = parseAssociateStatBlock(
      [
        "GLINT MOTE\t\tElemental Companion",
        "Small elemental humanoid (air)",
        "HP 1; a missed attack never damages the companion",
        "Defenses your defenses (+2 to AC and Reflex), not including any temporary bonuses or penalties",
        "Speed land 4 (earth walk)\t\ttremorsense",
        "TRAITS",
        "Passive Benefit: Glimmer",
        "You gain a +2 power bonus to Perception checks.",
      ].join("\n"),
    );
    expect(companion.issues).toEqual([]);
    expect(companion.block).toMatchObject({
      hitPoints: { kind: "fixed", value: 1 },
      hitPointsNote: "a missed attack never damages the companion",
      defenses: {
        kind: "master",
        bonus: { ac: 2, fortitude: 0, reflex: 2, will: 0 },
      },
      speed: "4 (earth walk)",
      senses: "tremorsense",
    });
    expect(companion.block?.traits[0]?.name).toBe("Passive Benefit: Glimmer");

    const fixed = parseAssociateStatBlock(
      [
        "BONE SENTRY\t\tLevel 9 Summoned Creature",
        "Medium shadow animate, undead",
        "HP 30; Healing Surges none",
        "Defenses AC 23, Fortitude 21, Reflex 20, Will 19 ",
        "Speed 6",
        "STANDARD • At-Will",
        "Attack: Melee 1 (one creature); +14 vs. AC",
        "Hit: 2d6 + 8 damage.",
      ].join("\n"),
    );
    expect(fixed.issues).toEqual([]);
    expect(fixed.block).toMatchObject({
      level: 9,
      role: "Summoned Creature",
      hitPoints: { kind: "fixed", value: 30 },
      defenses: {
        kind: "fixed",
        values: { ac: 23, fortitude: 21, reflex: 20, will: 19 },
      },
    });
    expect(fixed.block?.powers[0]).toMatchObject({
      name: "Standard Action",
      usage: "At-Will",
      lines: [
        { attack: { bonus: { kind: "fixed", value: 14 }, defense: "AC" } },
        {
          damage: {
            terms: [
              { kind: "dice", dice: "2d6" },
              { kind: "flat", value: 8 },
            ],
          },
        },
      ],
    });

    const trailing = parseAssociateStatBlock(
      [
        "IMP FRIEND\t\t",
        "Tiny elemental humanoid (devil)",
        "HP your healing surge value\t\t\t\tInitiative equal to yours",
        "AC 13, Fortitude 10, Reflex 12, Will 14 (add your level to each defense)\t\tPerception equal to yours + 1",
        "Speed 6, fly 6 (altitude limit 1);  Low-light vision",
        "Str: 6\tDex: 18\tWis: 12",
        "Con: 10\tInt: 12\tCha: 15",
        "Alignment: Evil  Languages: Common",
      ].join("\n"),
    );
    expect(trailing.issues).toEqual([]);
    expect(trailing.block).toMatchObject({
      hitPoints: { kind: "master-surge-value" },
      defenses: { kind: "level", base: { ac: 13, will: 14 } },
      perception: { bonus: 1 },
      senses: "Low-light vision",
      other: ["Alignment: Evil Languages: Common"],
    });
    expect(trailing.block?.role).toBeUndefined();
  });

  it("parses each damage term the stat blocks use", () => {
    expect(
      parseAssociateDamage("2d6 + your Strength or Charisma modifier damage.")
        ?.damage,
    ).toEqual({
      terms: [
        { kind: "dice", dice: "2d6" },
        { kind: "ability", abilities: ["Strength", "Charisma"] },
      ],
    });
    expect(
      parseAssociateDamage(
        "1d6 + your highest ability modifier lightning and thunder damage",
      )?.damage,
    ).toEqual({
      terms: [{ kind: "dice", dice: "1d6" }, { kind: "highest-ability" }],
      damageType: "lightning and thunder",
    });
    expect(
      parseAssociateDamage("2d6 + your level damage, and more.")?.damage.terms,
    ).toEqual([{ kind: "dice", dice: "2d6" }, { kind: "level" }]);
    expect(parseAssociateDamage("Ongoing 15 fire damage (save ends).")).toBe(
      undefined,
    );
  });

  it("reports the lines it cannot place", () => {
    const { issues } = parseAssociateStatBlock(
      [
        "MURK\t\tSummoned Creature",
        "Small natural beast",
        "HP your bloodied value",
        "Defenses your defenses",
        "Speed 5",
        "Mood swings",
        "STANDARD",
        "Bite F At-Will",
        "Attack: Melee 1 (one creature); your level + 5 vs. AC",
        "Hit: 1d6 + your cunning damage.",
        "Level 21: + your Wisdom modifier damage.",
      ].join("\n"),
    );
    expect(issues).toEqual([
      "stat line not understood: Mood swings",
      "hit damage not understood: Hit: 1d6 + your cunning damage.",
      "level step not understood: Level 21: + your Wisdom modifier damage.",
    ]);
    expect(parseAssociateStatBlock("NOTHING\nTiny thing").block).toBe(
      undefined,
    );
  });
});

describe("associate stat block at import", () => {
  const xml = (description: string) => `<?xml version="1.0" encoding="utf-8"?>
<D20Rules game-system="D&amp;D4E">
  <RulesElement internal-id="ID_TEST_ASSOCIATE" name="Moss Hound" type="Associate" source="Synthetic">
    <specific name="_Associated Power"> ID_TEST_POWER </specific>
${description}
  </RulesElement>
</D20Rules>`;

  it("stores the parsed block as a versioned field", () => {
    const parsed = parseD20Rules(xml(beastCompanion));
    const entity = parsed.entities[0]!;
    expect(parsed.diagnostics).toEqual([]);
    expect(entity.specifics.map(({ name }) => name)).toEqual([
      "_Associated Power",
      ASSOCIATE_STAT_BLOCK_FIELD,
    ]);
    expect(readAssociateStatBlock(entity.specifics)).toEqual(
      parseAssociateStatBlock(entity.description).block,
    );
  });

  it("turns unparsed lines into diagnostics", () => {
    const parsed = parseD20Rules(
      xml("MURK\t\tSummoned Creature\nSmall natural beast\nSpeed 5"),
    );
    expect(
      parsed.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "associate.stat-block-unparsed",
        "Associate stat block: no hit points line",
      ],
      [
        "associate.stat-block-unparsed",
        "Associate stat block: no defenses line",
      ],
    ]);
    expect(
      parsed.entities[0]?.specifics.some(
        ({ name }) => name === ASSOCIATE_STAT_BLOCK_FIELD,
      ),
    ).toBe(false);
  });
});
