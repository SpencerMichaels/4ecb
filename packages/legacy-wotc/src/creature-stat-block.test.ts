import { describe, expect, it } from "vitest";

import {
  CREATURE_STAT_BLOCK_FIELD,
  readCreatureStatBlock,
} from "@4ecb/content-domain";

import { parseCreatureStatBlock } from "./creature-stat-block";
import { parseD20Rules } from "./parser";

// Synthetic creatures in the spellings the real mount `_Monster` fields use:
// double spaces after the size, "(standard;  At-Will)", "▪" or "•" before
// keywords, "◦", "?" or nothing between ability scores, a trailing space on
// most lines, ".." typos, labels inline after ";", Alignment before or after
// the scores, and a "Description:" paragraph.
const published = [
  "Moss Strider - Level 5 Brute ",
  "Large  natural beast (mount, reptile) - XP 200 ",
  "Initiative +4 Senses Perception +3; low-light vision ",
  "HP 70; Bloodied 35 ",
  "AC 25 (27 against opportunity attacks); Fortitude 18, Reflex 16, Will 15 ",
  "Immune poison; Resist 10 necrotic ",
  "Speed 6 (swamp walk), climb 4 ",
  "",
  "m Bite (standard;  At-Will) ▪ Poison",
  "+8 vs. AC; 1d10+4 damage. ",
  "",
  "M Tail Lash (standard; Recharge 5, or 6)",
  "Attack: Melee 2 (one creature); +6 vs. Reflex; Hit: 2d6 + 4 damage, and the target is",
  "knocked prone.",
  "",
  "Steady Back (while mounted by a friendly rider of 5th level or higher; at-will) • Mount",
  "The strider's rider gains a +1 bonus to saving throws..",
  "",
  "Marsh Born",
  "The strider ignores difficult terrain in swamps.",
  "",
  "Alignment Unaligned Languages - ",
  "Skills Stealth +9",
  "Str 19 (+6) ◦ Dex 14 (+4) ◦ Wis 12 (+3)",
  "Con 16 (+5) ◦ Int 2 (-2) ◦ Cha 7 (0)",
  "",
  "Description: Moss striders are synthetic.",
].join("\n");

const ownerRelative = [
  "Synthetic Charger - Large immortal beast (mount)",
  "   -   ",
  "Initiative equal to yours, Perception equal to yours",
  "",
  "HP your bloodied value",
  "",
  "Healing Surges none, but you can spend a healing surge for the steed if an effect allows it to spend one",
  "",
  "Defenses your defenses +2, not including any temporary bonuses or penalties",
  "",
  "Resist 10 Cold",
  "",
  "Saving throws +2",
  "",
  "Speed 8, fly 10",
  "",
  "Traits",
  "Bold Charge (mount): The steed's rider gains a +1 bonus to attack rolls.",
  "Sure Foot (mount) - The steed ignores difficult terrain.",
  "",
  "Standard Actions",
  "m Bite (At-Will)",
  "Attack: Melee 2 (one creature); your level + 5 vs. AC",
  "Hit: 2d8 + your Charisma modifier damage.",
  "",
  "C Frost Breath (cold, Encounter)",
  "Attack: Close blast 3 (creatures in the blast); your level + 3 vs. Reflex",
  "Hit: 2d8 + your Charisma modifier cold damage.",
  "Miss: Half damage.",
  "",
  "Minor Actions",
  "Second Breath (healing, Encounter)",
  "The steed regains hit points equal to your surge value.",
].join("\n");

describe("parseCreatureStatBlock", () => {
  it("parses a published monster block into its printed numbers", () => {
    const { block, issues } = parseCreatureStatBlock(published);
    expect(issues).toEqual([]);
    expect(block).toMatchObject({
      kind: "fixed",
      name: "Moss Strider",
      level: 5,
      role: "Brute",
      xp: 200,
      size: "Large",
      creatureType: "natural beast (mount, reptile)",
      initiative: 4,
      perception: 3,
      senses: "low-light vision",
      hitPoints: 70,
      bloodied: 35,
      defenses: { ac: 25, fortitude: 18, reflex: 16, will: 15 },
      defensesNote: "AC 27 against opportunity attacks",
      defenseTraits: ["Immune poison", "Resist 10 necrotic"],
      speed: "6 (swamp walk), climb 4",
      alignment: "Unaligned",
      skills: "Stealth +9",
      description: "Moss striders are synthetic.",
    });
    expect(block).not.toHaveProperty("languages");
    if (block?.kind !== "fixed") throw new Error("expected a fixed block");
    expect(block.abilities.Strength).toEqual({ score: 19, modifier: 6 });
    expect(block.abilities.Charisma).toEqual({ score: 7, modifier: 0 });
    expect(block.abilities.Intelligence).toEqual({ score: 2, modifier: -2 });
    expect(block.entries).toEqual([
      {
        name: "Bite",
        attackKind: "basic-melee",
        usage: "standard; At-Will",
        keywords: "Poison",
        lines: [{ text: "+8 vs. AC; 1d10+4 damage." }],
      },
      {
        name: "Tail Lash",
        attackKind: "melee",
        usage: "standard; Recharge 5, or 6",
        lines: [
          { label: "Attack", text: "Melee 2 (one creature); +6 vs. Reflex" },
          {
            label: "Hit",
            text: "2d6 + 4 damage, and the target is knocked prone.",
          },
        ],
      },
      {
        name: "Steady Back",
        usage:
          "while mounted by a friendly rider of 5th level or higher; at-will",
        keywords: "Mount",
        lines: [
          { text: "The strider's rider gains a +1 bonus to saving throws." },
        ],
      },
      {
        name: "Marsh Born",
        lines: [{ text: "The strider ignores difficult terrain in swamps." }],
      },
    ]);
  });

  it("reads ability scores with any separator and Alignment after them", () => {
    const pet = [
      "Tiny Lizard - Level 1 Minion Skirmisher",
      "Tiny  natural beast - XP 25",
      "Initiative +5 Senses Perception +6; Darkvision",
      "HP 1; a missed attack never damages a minion.",
      "AC 15; Fortitude 10, Reflex 13, Will 11",
      "Speed 4, climb 4",
      "",
      "Lizard's Eye",
      "While within 10 squares of the lizard, the lizard's master gains ",
      "a +2 bonus to Perception checks.",
      "",
      "Skills Perception + 7",
      "Str 4 (-3) ? Dex 17 (+3) ? Wis 12 (+1)",
      "Con 11 (+0) Int 2 (-4) Cha 9 (+1) ",
      "Alignment Unaligned Languages - ",
    ].join("\n");
    const { block, issues } = parseCreatureStatBlock(pet);
    expect(issues).toEqual([]);
    expect(block).toMatchObject({
      role: "Minion Skirmisher",
      hitPoints: 1,
      hitPointsNote: "a missed attack never damages a minion.",
      senses: "Darkvision",
      skills: "Perception + 7",
      alignment: "Unaligned",
      entries: [
        {
          name: "Lizard's Eye",
          lines: [
            {
              text: "While within 10 squares of the lizard, the lizard's master gains a +2 bonus to Perception checks.",
            },
          ],
        },
      ],
    });
    expect(block).not.toHaveProperty("bloodied");
    if (block?.kind !== "fixed") throw new Error("expected a fixed block");
    expect(block.abilities.Dexterity).toEqual({ score: 17, modifier: 3 });
    expect(block.abilities.Constitution).toEqual({ score: 11, modifier: 0 });
  });

  it("reports a second size and type line but keeps the block", () => {
    const doubled = published.replace(
      "Large  natural beast (mount, reptile) - XP 200 ",
      "Large  natural beast (mount, reptile) - XP 200 \nTiny  natural beast - XP 25",
    );
    const { block, issues } = parseCreatureStatBlock(doubled);
    expect(issues).toEqual([
      "second size and type line: Tiny natural beast - XP 25",
    ]);
    expect(block).toMatchObject({ size: "Large" });
  });

  it("reports a block missing its core statistics and stores none", () => {
    const { block, issues } = parseCreatureStatBlock(
      published.replace("HP 70; Bloodied 35 \n", ""),
    );
    expect(block).toBeUndefined();
    expect(issues).toContain("no hit points line");
  });

  it("parses an owner-relative block as an associate stat block", () => {
    const { block, issues } = parseCreatureStatBlock(ownerRelative);
    expect(issues).toEqual([]);
    if (block?.kind !== "master") throw new Error("expected a master block");
    expect(block.name).toBe("Synthetic Charger");
    expect(block.block).toMatchObject({
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
      defenseTraits: ["Resist 10 Cold", "Saving throws +2"],
      initiative: { bonus: 0 },
      perception: { bonus: 0 },
      speed: "8, fly 10",
    });
    expect(
      block.block.traits.map(({ name, keywords, lines }) => ({
        name,
        keywords,
        text: lines.map((line) => line.text),
      })),
    ).toEqual([
      {
        name: "Bold Charge",
        keywords: "mount",
        text: ["The steed's rider gains a +1 bonus to attack rolls."],
      },
      {
        name: "Sure Foot",
        keywords: "mount",
        text: ["The steed ignores difficult terrain."],
      },
    ]);
    expect(
      block.block.powers.map(({ name, keywords, usage, action }) => ({
        name,
        keywords,
        usage,
        action,
      })),
    ).toEqual([
      {
        name: "Bite",
        keywords: undefined,
        usage: "At-Will",
        action: "Standard",
      },
      {
        name: "Frost Breath",
        keywords: "cold",
        usage: "Encounter",
        action: "Standard",
      },
      {
        name: "Second Breath",
        keywords: "healing",
        usage: "Encounter",
        action: "Minor",
      },
    ]);
    expect(block.block.powers[1]?.lines[1]).toMatchObject({
      label: "Hit",
      damage: {
        terms: [
          { kind: "dice", dice: "2d8" },
          { kind: "ability", abilities: ["Charisma"] },
        ],
        damageType: "cold",
      },
    });
  });
});

describe("the import's creature stat block field", () => {
  const xml = (monster: string) =>
    `<D20Rules game-system="D&amp;D4E"><RulesElement internal-id="ID_TEST_MOUNT" name="Moss Strider" type="Gear" source="Synthetic"><specific name="Category"> Mount </specific><specific name="_Monster"> ${monster} </specific></RulesElement></D20Rules>`;
  const escape = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  it("stores the parse on the record for the sheet to read back", () => {
    const parsed = parseD20Rules(xml(escape(published)), "test.xml");
    const entity = parsed.entities.find(({ id }) => id === "ID_TEST_MOUNT")!;
    expect(
      entity.specifics.some(({ name }) => name === CREATURE_STAT_BLOCK_FIELD),
    ).toBe(true);
    expect(readCreatureStatBlock(entity.specifics)).toMatchObject({
      kind: "fixed",
      name: "Moss Strider",
      hitPoints: 70,
    });
    expect(
      parsed.diagnostics.filter(
        ({ code }) => code === "mount.stat-block-unparsed",
      ),
    ).toEqual([]);
  });

  it("reads an owner-relative block back with its associate stat block", () => {
    const parsed = parseD20Rules(xml(escape(ownerRelative)), "test.xml");
    const entity = parsed.entities.find(({ id }) => id === "ID_TEST_MOUNT")!;
    expect(readCreatureStatBlock(entity.specifics)).toMatchObject({
      kind: "master",
      block: { hitPoints: { kind: "master-bloodied" } },
    });
  });

  it("raises a diagnostic for each line it cannot place", () => {
    const parsed = parseD20Rules(
      xml(escape(published.replace("Speed 6", "Gait 6"))),
      "test.xml",
    );
    expect(
      parsed.diagnostics
        .filter(({ code }) => code === "mount.stat-block-unparsed")
        .map(({ message }) => message),
    ).toEqual([
      "Mount stat block: stat line not understood: Gait 6 (swamp walk), climb 4",
      "Mount stat block: no speed line",
    ]);
  });

  it("ignores a stored field of another version", () => {
    expect(
      readCreatureStatBlock([
        {
          name: CREATURE_STAT_BLOCK_FIELD,
          value: JSON.stringify({ version: 0, kind: "fixed", name: "Old" }),
        },
      ]),
    ).toBeUndefined();
  });
});
