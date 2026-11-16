import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import {
  bandShowsAttackLine,
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
    ["Strength", 0, "+12 vs AC", "STR vs AC"],
    ["Dexterity", 2, "+14 vs Reflex", "DEX+2 vs Ref"],
    ["Wisdom", -1, "+8 vs Fortitude", "WIS-1 vs Fort"],
    ["Charisma", 0, "— vs Will", "CHA vs Will"],
  ] as const)(
    "formats %s headers without the equipped bonus (D085)",
    (ability, powerBonus, attack, header) => {
      const phase = { id: "phase", ordinal: 2, ability, powerBonus, attack };
      expect(printAttackHeader(phase)).toBe(header);
    },
  );
  it("heads a beast companion's attack with its own attack line", () => {
    expect(
      printAttackHeader({
        id: "beast",
        ordinal: 1,
        ability: "Beast",
        powerBonus: 0,
        attack: "+12 vs Reflex",
        attacker: "beast",
      }),
    ).toBe("Beast +12 vs Ref");
  });
  it("heads a summoned creature's attack with your level and its bonus", () => {
    expect(
      printAttackHeader({
        id: "summoned",
        ordinal: 1,
        ability: "Level",
        powerBonus: 5,
        attack: "+30 vs Will",
      }),
    ).toBe("Level+5 vs Will");
  });
  it("heads an unresolved attack with a dash, never UNKNOWN", () => {
    expect(
      printAttackHeader({
        id: "unresolved",
        ordinal: 1,
        ability: "Unknown",
        powerBonus: 0,
        attack: "+12 vs Will",
      }),
    ).toBe("— vs Will");
  });
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
    // Each attack line names its weapon, which the band does not show.
    const grouped = groupedPrintRules(card.fields, attacks);
    expect(grouped.attacks.get(1)).toEqual(card.fields.slice(1, 3));
    expect(grouped.attacks.get(2)).toEqual(card.fields.slice(3, 5));
  });
  it("keeps generic Attack fields within an explicit secondary section", () => {
    const fields = [
      ...card.fields.slice(0, 3),
      { label: "Secondary Attack", value: "." },
      { label: "Secondary Target", value: "Another creature" },
      { label: "Attack", value: "Wisdom vs. Will" },
      { label: "Hit", value: "The target is dazed." },
    ];
    const grouped = groupedPrintRules(
      fields,
      fallbackPrintAttacks({ ...card, fields }, undefined),
    );
    expect(grouped.attacks.get(1)).toEqual(card.fields.slice(1, 3));
    // The bare "." heading and the bands' target and attack lines drop.
    expect(grouped.attacks.get(2)).toEqual([fields[6]]);
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
    expect(grouped.attacks.get(1)).toEqual(card.fields.slice(1, 3));
    expect(grouped.attacks.get(2)).toEqual(card.fields.slice(3, 5));
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

describe("power target rule lines", () => {
  it("drops a target its band shows despite the sheet's value annotations", () => {
    const fields = [
      {
        label: "Target",
        value: "One ally within Wisdom modifier (+4) squares",
      },
      { label: "Attack", value: "Wisdom vs. Will" },
    ];
    const headers = fallbackPrintAttacks(
      {
        kind: "power",
        name: "Synthetic Shift",
        fields: [
          { label: "Target", value: "One ally within Wisdom modifier squares" },
          fields[1]!,
        ],
      },
      undefined,
    );
    const grouped = groupedPrintRules(fields, headers);
    expect(grouped.leading).toEqual([]);
    expect(grouped.attacks.get(1)).toEqual([]);
  });

  it("keeps every target of a power without an attack roll", () => {
    const fields = [
      { label: "Target", value: "You or one ally in burst" },
      { label: "Effect", value: "The target regains hit points." },
    ];
    expect(groupedPrintRules(fields, []).leading).toEqual(fields);
  });
});

describe("attack lines the band can't show", () => {
  it("keeps an attack line's rest beyond its ability and defense", () => {
    const fields = [
      { label: "Attack", value: "Strength vs. AC, two attacks" },
      { label: "Hit", value: "1[W] damage per attack." },
    ];
    const headers = fallbackPrintAttacks(
      { kind: "power", name: "Synthetic Flurry", fields },
      undefined,
    );
    expect(groupedPrintRules(fields, headers).attacks.get(1)).toEqual(fields);
  });

  it("drops an attack line the band shows, at the card's level", () => {
    expect(bandShowsAttackLine("Strength vs. AC", 1)).toBe(true);
    expect(bandShowsAttackLine("Wisdom + 2 vs. Will", 1)).toBe(true);
    expect(bandShowsAttackLine("Charisma (+4) vs. Reflex", 1)).toBe(true);
    expect(bandShowsAttackLine("Intelligence vs. Fortitude, Reflex", 1)).toBe(
      false,
    );
    const tiers =
      "Constitution + 2 vs. AC\nLevel 11: Constitution + 4 vs. AC\nLevel 21: Constitution + 6 vs. AC";
    expect(bandShowsAttackLine(tiers, 15)).toBe(true);
    expect(bandShowsAttackLine(tiers, 0)).toBe(false);
  });

  it("prints the fields of an attack with no defense, which has no band", () => {
    const fields = [
      { label: "Target", value: "One creature" },
      { label: "Attack", value: "Strength" },
      { label: "Hit", value: "3[W] + Strength modifier damage." },
      { label: "Miss", value: "Half damage." },
    ];
    const headers = fallbackPrintAttacks(
      { kind: "power", name: "Synthetic Rage", fields },
      undefined,
    );
    expect(headers).toEqual([]);
    expect(groupedPrintRules(fields, headers).leading).toEqual(fields);
  });
});

describe("abbreviated authored attack lines", () => {
  it("heads a builder card's abbreviated attack with its ability", () => {
    const [attack] = fallbackPrintAttacks(
      {
        kind: "power",
        name: "Synthetic Storm",
        fields: [{ label: "Attack", value: "CON + 2 vs. Fortitude" }],
      },
      undefined,
    );
    expect(attack).toMatchObject({ ability: "CON", powerBonus: 2 });
    expect(printAttackHeader(attack!)).toBe("CON+2 vs Fort");
  });
});

describe("follow-up attack lines", () => {
  it("starts a new phase for a second attack line in the same phase", () => {
    const fields = [
      { label: "Target", value: "One creature" },
      { label: "Attack", value: "Intelligence vs. AC" },
      { label: "Hit", value: "2[W] damage. Make the following attack." },
      { label: " Attack", value: "Intelligence vs. Fortitude" },
      { label: " Hit", value: "The target is dazed." },
    ];
    const headers = fallbackPrintAttacks(
      { kind: "power", name: "Synthetic Follow-up", fields },
      undefined,
    );
    expect(headers.map(printAttackHeader)).toEqual([
      "INT vs AC",
      "INT vs Fort",
    ]);
    const grouped = groupedPrintRules(fields, headers);
    expect(grouped.attacks.get(1)).toEqual([fields[2]]);
    expect(grouped.attacks.get(2)).toEqual([fields[4]]);
  });
});
