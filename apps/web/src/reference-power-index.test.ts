import { describe, expect, it } from "vitest";
import { referencePowerRows } from "./reference-power-index";
import type { SheetCard } from "@4ecb/sheet-model";
import { buildSheetModel } from "@4ecb/sheet-model";
const power: SheetCard = {
  kind: "power",
  name: "Two steps",
  actionType: "Standard Action",
  fields: [
    { label: "Level", value: "7" },
    { label: "Attack Type", value: "Melee weapon" },
    { label: "Target", value: "One creature" },
    { label: "Attack", value: "Strength +2 vs. AC" },
    {
      label: "Hit",
      value:
        "2[W] + Strength modifier damage and make a secondary attack against the target.",
    },
    { label: "Secondary Attack", value: "Dexterity vs. Reflex" },
    {
      label: "Hit",
      value: "1[W] + Dexterity modifier fire damage and the target is dazed.",
    },
  ],
};
describe("reference power index", () => {
  it("retains legacy range, target and level without changing authored card fields", () => {
    const model = buildSheetModel({
      details: { name: "Fixture" },
      abilities: {},
      stats: {},
      selectedRules: [],
      textStrings: {},
      loot: [],
      levelCount: 1,
      source: "legacy-cache",
      powers: [
        {
          name: "Legacy power",
          level: "3",
          attackType: "Ranged 10",
          target: "One creature",
          weapons: [],
        },
      ],
    });
    const card = model.powers[0]!;
    expect(card.fields).toEqual([]);
    const row = referencePowerRows(card)[0]!;
    expect(row[1]).toBe("3");
    expect(row.slice(3, 5)).toEqual(["Ranged 10", "One creature"]);
  });
  it("keeps range and target separate, formulas compact, and secondary targets unspecified", () => {
    const rows = referencePowerRows(power);
    expect(rows[0]).toEqual([
      "Two steps · Attack 1",
      "7",
      "Standard Action",
      "Melee weapon",
      "One creature",
      "STR+2 vs AC",
      "2[W]+STR",
    ]);
    expect(rows[1]).toEqual([
      "Attack 2",
      "",
      "",
      "",
      "",
      "DEX vs Ref",
      "1[W]+DEX",
    ]);
  });
  it("does not invent attack/damage for utility powers or use cached equipment totals", () => {
    expect(
      referencePowerRows({ kind: "power", name: "Aid", fields: [] })[0]?.slice(
        5,
      ),
    ).toEqual(["", ""]);
    expect(
      referencePowerRows({
        ...power,
        attack: "+17 vs AC",
        damage: "2d10+8",
      })[0]?.slice(5),
    ).toEqual(["STR+2 vs AC", "2[W]+STR"]);
  });
  it("leaves unfamiliar damage prose on the card rather than swallowing its riders", () => {
    const card = {
      ...power,
      fields: power.fields.map((field) =>
        field.label === "Hit"
          ? {
              ...field,
              value: "2[W] and the target takes ongoing fire damage.",
            }
          : field,
      ),
    };
    expect(referencePowerRows(card)[0]?.at(-1)).toBe("See card");
  });
});
