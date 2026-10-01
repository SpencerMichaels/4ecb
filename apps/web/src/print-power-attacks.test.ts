import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import { fallbackPrintAttacks, groupedPrintRules } from "./print-power-attacks";

const card: SheetCard = {
  id: "synthetic-two-phase",
  kind: "power",
  name: "Synthetic two-phase power",
  fields: [
    { label: "Target", value: "One creature" },
    { label: "Primary Attack", value: "Strength vs. Reflex (off-hand weapon)" },
    { label: "Hit", value: "1[W] damage. Make the secondary attack." },
    { label: " Secondary Attack", value: "Dexterity +2 vs. AC (main weapon)" },
    { label: " Hit", value: "2[W] + Dexterity modifier damage." },
  ],
};

describe("printed authored attack phases", () => {
  it("retains both headers and both Hit blocks with only a cached primary total", () => {
    const attacks = fallbackPrintAttacks(card, {
      id: "weapon",
      equipmentName: "Synthetic blade",
      equipped: true,
      attack: "+9 vs Reflex",
      ability: "Strength",
      powerBonus: 0,
    });
    expect(attacks).toMatchObject([
      {
        ordinal: 1,
        ability: "Strength",
        attack: "+9 vs Reflex",
        target: "One creature",
      },
      { ordinal: 2, ability: "Dexterity", powerBonus: 2, attack: "— vs AC" },
    ]);
    expect(attacks[1]?.target).toBeUndefined();
    const grouped = groupedPrintRules(card.fields);
    expect(grouped.attacks.get(1)).toEqual([card.fields[2]]);
    expect(grouped.attacks.get(2)).toEqual([card.fields[4]]);
  });
  it("keeps generic Attack fields within an explicit secondary section", () => {
    const fields = [
      ...card.fields.slice(0, 3),
      { label: "Secondary Attack", value: "." },
      { label: "Secondary Target", value: "Another creature" },
      { label: "Attack", value: "Wisdom vs. Will" },
      { label: "Hit", value: "The target is dazed." },
    ];
    const grouped = groupedPrintRules(fields);
    expect(grouped.attacks.get(1)).toEqual([card.fields[2]]);
    expect(grouped.attacks.get(2)).toEqual([fields[4], fields[6]]);
    expect(fallbackPrintAttacks({ ...card, fields }, undefined)).toMatchObject([
      { ordinal: 1, ability: "Strength", attack: "— vs Reflex" },
      {
        ordinal: 2,
        ability: "Wisdom",
        attack: "— vs Will",
        target: "Another creature",
      },
    ]);
  });
  it("does not fabricate attacks for an attackless power", () => {
    expect(
      fallbackPrintAttacks(
        { ...card, fields: [{ label: "Effect", value: "Shift 1 square." }] },
        undefined,
      ),
    ).toEqual([]);
  });
});
