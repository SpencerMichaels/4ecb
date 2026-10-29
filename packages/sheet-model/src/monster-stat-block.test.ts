import type { ContentEntity } from "@4ecb/content-domain";
import { describe, expect, it } from "vitest";

import { sheetItemCard } from ".";

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

// Spelled like the content's mount records: Category "Mount", the published
// stat block in `_Monster` (a double space in the type line, "◆" separators).
const PONY_BLOCK = [
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

describe("mount stat block (legacy MonsterDisplay.Build)", () => {
  it("splits a mount's _Monster block into a header band and sections", () => {
    const pony = gear(
      "ID_TEST_PONY",
      "Test Pony",
      {
        "Full Text": `Test Pony\nCategory: Mount\nPrice: 30 gp\n\n${PONY_BLOCK}`,
        Gold: "30",
        Category: "Mount",
        _Monster: PONY_BLOCK,
      },
      "<table>Normal Load\tHeavy Load\tMax.Drag\n200 lb.\t400 lb.\t1,000 lb.</table>",
    );
    const card = sheetItemCard({ name: "Test Pony", entities: [pony] });
    expect(card.statBlock).toEqual({
      header: [
        { left: "Test Pony", right: "Level 2 Brute" },
        { left: "Medium  natural beast (mount)", right: "XP 125" },
      ],
      sections: [
        {
          kind: "statistics",
          lines: [
            "Initiative +2 Senses Perception +6",
            "HP 40; Bloodied 20",
            "AC 14; Fortitude 15, Reflex 13, Will 12",
            "Speed 7",
          ],
        },
        {
          kind: "entry",
          title: "m Nip (standard, at-will)",
          lines: ["+5 vs. AC; 1d6+3 damage."],
        },
        {
          kind: "entry",
          title:
            "Steady (while mounted by a friendly rider of 2nd level or higher; at-will) ▪ Mount",
          lines: ["The pony's rider gains a +1 bonus to saving throws."],
        },
        {
          kind: "abilities",
          lines: [
            "Alignment Unaligned Languages -",
            "Str 16 (+4) ◆ Dex 13 (+2) ◆ Wis 12 (+2)",
            "Con 15 (+3) ◆ Int 2 (-3) ◆ Cha 8 (0)",
          ],
        },
      ],
    });
    // The load table stays the card's description; the internal field never
    // becomes a card field.
    expect(card.description).toMatch(/^<table>/u);
    expect(card.fields.map((field) => field.label)).not.toContain("_Monster");
  });

  it("flags a description that repeats the block's body, in the newer heading style", () => {
    const block = [
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
    const steed = gear(
      "ID_TEST_STEED",
      "Test Steed",
      { Category: "Mount", _Monster: block },
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
    const statBlock = sheetItemCard({
      name: "Test Steed",
      entities: [steed],
    }).statBlock;
    // A blank " - " header line adds no row.
    expect(statBlock?.header).toEqual([
      { left: "Test Steed", right: "Large immortal beast (mount)" },
    ]);
    expect(statBlock?.sections.map((section) => section.title)).toEqual([
      undefined,
      "HP your bloodied value",
      "Speed 8, fly 10",
      "Traits",
      "Standard Actions",
    ]);
    expect(statBlock?.sections.at(-1)?.lines).toEqual([
      "m Bite (At-Will)",
      "Attack: Melee 2 (one creature); your level + 5 vs. AC",
    ]);
    expect(statBlock?.repeatsDescription).toBe(true);
  });

  it("has no stat block for a mount without _Monster (Crodlu)", () => {
    const crodlu = gear(
      "ID_TEST_CRODLU",
      "Test Crodlu",
      { Category: "Mount", Gold: "225" },
      "A large, flightless drake.",
    );
    const card = sheetItemCard({ name: "Test Crodlu", entities: [crodlu] });
    expect(card.statBlock).toBeUndefined();
    expect(card.description).toBe("A large, flightless drake.");
    expect(
      sheetItemCard({
        name: "Test Crodlu",
        entities: [gear("ID_TEST_EMPTY", "Empty", { _Monster: "  " })],
      }).statBlock,
    ).toBeUndefined();
  });
});
