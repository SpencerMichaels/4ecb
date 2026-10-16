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
    expect(row.slice(2, 4)).toEqual(["Ranged 10", "One creature"]);
  });
  it("keeps range and target separate, damage formulas compact, and unknown totals explicit", () => {
    const rows = referencePowerRows(power);
    expect(rows[0]).toEqual([
      "Two steps · Attack 1",
      "7",
      "Melee weapon",
      "One creature",
      "— vs AC",
      "2[W]+STR",
    ]);
    expect(rows[1]).toEqual(["Attack 2", "", "", "", "— vs Ref", "1[W]+DEX"]);
  });
  it("does not invent utility attacks and retains a supplied legacy primary total only for that phase", () => {
    expect(
      referencePowerRows({ kind: "power", name: "Aid", fields: [] })[0]?.slice(
        4,
      ),
    ).toEqual(["", ""]);
    expect(
      referencePowerRows({
        ...power,
        attack: "+17 vs AC",
        damage: "2d10+8",
      })[0]?.slice(4),
    ).toEqual(["+17 vs AC", "2d10+8"]);
    expect(referencePowerRows({ ...power, attack: "+17 vs AC" })[1]?.[4]).toBe(
      "— vs Ref",
    );
  });
  it("uses equipped main-hand totals per phase, including different secondary abilities", () => {
    const attack = (
      ordinal: number,
      ability: string,
      total: string,
      damage: string,
    ) => ({
      id: String(ordinal),
      ordinal,
      ability,
      powerBonus: 0,
      attack: total,
      damage,
      target: "One creature",
    });
    const main = {
      id: "main",
      equipmentName: "Equipped blade",
      equipped: true,
      hand: "main" as const,
      attacks: [
        attack(1, "Strength", "+14 vs AC", "2d8+5"),
        attack(2, "Dexterity", "+10 vs Reflex", "1d8+3"),
      ],
    };
    const card = {
      ...power,
      attack: "+99 vs AC",
      variants: [
        {
          ...main,
          id: "spare",
          equipped: false,
          attacks: [attack(1, "Strength", "+99 vs AC", "2d12+9")],
        },
        main,
      ],
    };
    const rows = referencePowerRows(card);
    expect(rows[0]?.slice(4)).toEqual(["+14 vs AC", "2d8+5"]);
    expect(rows[1]?.slice(3)).toEqual(["", "+10 vs Ref", "1d8+3"]);
    const offHand = {
      ...main,
      id: "off",
      hand: "off" as const,
      attacks: [attack(2, "Dexterity", "+16 vs Reflex", "1d6+5")],
    };
    const mixed = referencePowerRows({
      ...power,
      variants: [
        {
          ...main,
          attacks: [main.attacks[0]!, { ...main.attacks[1]!, eligible: false }],
        },
        offHand,
      ],
    });
    expect(mixed[1]?.slice(4)).toEqual(["+16 vs Ref", "1d6+5"]);
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
