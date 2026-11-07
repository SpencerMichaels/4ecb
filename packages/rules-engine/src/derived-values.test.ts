import { describe, expect, it } from "vitest";

import {
  abilityModifier,
  bloodiedValue,
  evaluatedHealingSurgeValue,
  familiarDefenses,
  familiarSpeed,
  halfLevel,
  healingSurgeValue,
  levelTier,
  MAGIC_ITEM_MILESTONE_USES,
  magicItemDailyUses,
  noteValueAmount,
  noteValueText,
  ritualCostPercent,
} from "./derived-values";

describe("shared derived values", () => {
  it("rounds ability modifiers, half level and bloodied down", () => {
    expect([
      abilityModifier(18),
      abilityModifier(9),
      abilityModifier(8),
      abilityModifier(1),
      abilityModifier(0),
    ]).toEqual([4, -1, -1, -5, 0]);
    expect([halfLevel(7), halfLevel(8)]).toEqual([3, 4]);
    expect(bloodiedValue(67)).toBe(33);
    expect(bloodiedValue(undefined)).toBeUndefined();
  });
});

describe("healing surge value", () => {
  it("is a quarter of max hit points plus the additive bonus stat", () => {
    expect(healingSurgeValue(67, 1)).toBe(17);
    expect(healingSurgeValue(68, undefined)).toBe(17);
    expect(healingSurgeValue(undefined, 2)).toBeUndefined();
    expect(
      evaluatedHealingSurgeValue({
        "hit points": { name: "Hit Points", value: 67, contributions: [] },
        "Healing Surge Value": {
          name: "Healing Surge Value",
          value: 1,
          contributions: [],
        },
      }),
    ).toBe(17);
  });
});

describe("ritual cost percent", () => {
  it("divides 100 by the Ritual Cost Modifier plus one, as legacy LootCost does", () => {
    const stats = (value: number) => ({
      "Ritual Cost Modifier": {
        name: "Ritual Cost Modifier",
        value,
        contributions: [],
      },
    });
    expect(ritualCostPercent({})).toBe(100);
    expect(ritualCostPercent(stats(1))).toBe(50);
    expect(ritualCostPercent(stats(2))).toBe(33);
    expect(ritualCostPercent(stats(-1))).toBe(100);
  });
});

describe("familiar statistics", () => {
  const stat = (name: string, value: number) =>
    [name, { name, value, contributions: [] }] as const;
  const stats = Object.fromEntries([
    stat("AC", 18),
    stat("Fortitude Defense", 14),
    stat("Reflex Defense", 16),
    stat("Will Defense", 17),
    stat("FAMILIAR.AC", 1),
    stat("ally.ac", 1),
    stat("FAMILIAR.Speed", 2),
    stat("COMPANION.Speed", 1),
  ]);

  it("uses the master's defenses plus companion bonuses", () => {
    expect(familiarDefenses(stats)).toEqual({
      ac: 20,
      fortitude: 14,
      reflex: 16,
      will: 17,
    });
    expect(familiarDefenses({})).toEqual({
      ac: undefined,
      fortitude: undefined,
      reflex: undefined,
      will: undefined,
    });
  });

  it("adds companion speed bonuses to a whole-number base speed", () => {
    expect(familiarSpeed(" 4 ", stats)).toBe("7");
    expect(familiarSpeed("4", {})).toBe("4");
    expect(familiarSpeed("see text", stats)).toBe("see text");
    expect(familiarSpeed(undefined, stats)).toBeUndefined();
  });
});

describe("feature note values (D112)", () => {
  const stats = Object.fromEntries(
    (
      [
        ["Constitution", 16],
        ["Dexterity", 18],
        ["Intelligence", 13],
      ] as const
    ).flatMap(([ability, score]) => [
      [ability, { name: ability, value: score, contributions: [] }],
      [
        `${ability} modifier`,
        {
          name: `${ability} modifier`,
          value: abilityModifier(score),
          contributions: [],
        },
      ],
    ]),
  );
  const flat = (value: number) => ({ kind: "flat", value }) as const;
  const dex = { kind: "ability", abilities: ["Dexterity"] } as const;

  it("allows one magic item daily use per tier plus four milestone uses", () => {
    expect([1, 10, 11, 20, 21, 30].map(magicItemDailyUses)).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
    expect(MAGIC_ITEM_MILESTONE_USES).toBe(4);
  });
  it("picks the tier, multiplies per tier and adds the modifiers", () => {
    expect([levelTier(10), levelTier(11), levelTier(21)]).toEqual([0, 1, 2]);
    const tiered = {
      terms: [{ kind: "tier", values: [flat(1), flat(2), flat(3)] }],
      signed: true,
    } as const;
    expect(
      [5, 12, 25].map((level) => noteValueText(tiered, level, {})),
    ).toEqual(["+1", "+2", "+3"]);
    const perTier = {
      terms: [
        { kind: "per-tier", value: { kind: "dice", count: 1, die: "[W]" } },
      ],
      signed: false,
    } as const;
    expect(noteValueText(perTier, 15, {})).toBe("2[W]");
    const sum = {
      terms: [
        { kind: "dice", count: 2, die: "d10" },
        dex,
        { kind: "half-level" },
      ],
      signed: false,
    } as const;
    expect(noteValueText(sum, 7, stats)).toBe("2d10 + 7");
    // "Con or Int modifier": the higher score's.
    expect(
      noteValueText(
        {
          terms: [
            {
              kind: "ability",
              abilities: ["Intelligence", "Constitution"],
            },
          ],
          signed: true,
        },
        1,
        stats,
      ),
    ).toBe("+3");
  });

  it("takes the level step in force, replacing or adding", () => {
    const replaced = {
      terms: [flat(2), dex],
      steps: [
        { level: 21, terms: [flat(6), dex], add: false },
        { level: 11, terms: [flat(4), dex], add: false },
      ],
      signed: false,
    } as const;
    expect(
      [10, 11, 21].map((level) => noteValueText(replaced, level, stats)),
    ).toEqual(["6", "8", "10"]);
    const added = {
      terms: [{ kind: "ability", abilities: ["Constitution"] }],
      steps: [{ level: 11, terms: [flat(5)], add: true }],
      signed: false,
    } as const;
    expect(noteValueText(added, 11, stats)).toBe("8");
    // A plain amount (no dice), for the 0-or-less rule.
    expect(noteValueAmount(added, 1, stats)).toBe(3);
    expect(
      noteValueAmount(
        { terms: [{ kind: "dice", count: 1, die: "d6" }], signed: false },
        1,
        stats,
      ),
    ).toBeUndefined();
  });
});
