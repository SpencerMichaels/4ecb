import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import {
  fallbackPrintAttacks,
  groupedPrintRules,
  printAttackHeader,
  printSustainActions,
  withAuthoredPrintTargets,
} from "./print-power-attacks";

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
  it("projects distinct sustain action labels without changing the body clauses", () => {
    const fields = [
      { label: " Sustain Minor ", value: "The effect persists." },
      { label: "Sustain minor", value: "Another clause." },
      { label: "Sustain Move", value: "Move it." },
      { label: "Sustain Standard", value: "Continue." },
      { label: "Effect", value: "You can sustain this as a minor action." },
    ];
    expect(printSustainActions(fields)).toEqual(["Minor", "Move", "Standard"]);
    expect(fields[0]?.value).toBe("The effect persists.");
    expect(printSustainActions([])).toEqual([]);
  });
  it("never carries a variant's primary target into an unspecified secondary header", () => {
    const fields = card.fields.map((field, index) =>
      index === 2
        ? {
            ...field,
            value: "1[W] damage. Make a secondary attack against the target.",
          }
        : field,
    );
    const phases = fallbackPrintAttacks({ ...card, fields }, undefined).map(
      (attack) => ({ ...attack, target: "One creature" }),
    );
    const headers = withAuthoredPrintTargets({ ...card, fields }, phases);
    expect(headers[0]?.target).toBe("One creature");
    expect(headers[1]?.target).toBeUndefined();
    expect(groupedPrintRules(fields, headers).attacks.get(1)).toContainEqual(
      fields[2],
    );
    const explicit = {
      ...card,
      fields: [
        ...fields.slice(0, 4),
        { label: "Secondary Target", value: "Another creature" },
        ...fields.slice(4),
      ],
    };
    expect(withAuthoredPrintTargets(explicit, phases)[1]?.target).toBe(
      "Another creature",
    );
  });
  it.each([
    ["Strength", 0, "+12 vs AC", "+12 · STR vs AC", "STR vs AC"],
    ["Dexterity", 2, "+14 vs Reflex", "+14 · DEX+2 vs Ref", "DEX+2 vs Ref"],
    ["Wisdom", -1, "+8 vs Fortitude", "+8 · WIS-1 vs Fort", "WIS-1 vs Fort"],
    ["Charisma", 0, "— vs Will", "— · CHA vs Will", "CHA vs Will"],
  ] as const)(
    "formats %s headers with or without the equipped bonus",
    (ability, powerBonus, attack, shown, hidden) => {
      const phase = { id: "phase", ordinal: 2, ability, powerBonus, attack };
      expect(printAttackHeader(phase, true)).toBe(shown);
      expect(printAttackHeader(phase, false)).toBe(hidden);
    },
  );
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
  it("omits target prose only when the matching phase header displays it", () => {
    const target = "One creature other than the primary target";
    const fields = [
      ...card.fields.slice(0, 3),
      { label: "Secondary Target", value: target },
      ...card.fields.slice(3),
    ];
    const headers = fallbackPrintAttacks({ ...card, fields }, undefined);
    const grouped = groupedPrintRules(fields, headers);
    expect(grouped.leading).toEqual([]);
    expect(grouped.attacks.get(1)).toEqual([card.fields[2]]);
    expect(grouped.attacks.get(2)).toEqual([card.fields[4]]);
    for (const secondary of [undefined, "A different target description"]) {
      const changed = headers.map((header) => {
        const updated = { ...header };
        if (header.ordinal === 2) {
          if (secondary === undefined) delete updated.target;
          else updated.target = secondary;
        }
        return updated;
      });
      expect(groupedPrintRules(fields, changed).attacks.get(1)).toContainEqual(
        fields[3],
      );
    }
  });
});
