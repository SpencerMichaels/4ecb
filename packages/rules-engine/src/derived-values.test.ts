import { describe, expect, it } from "vitest";

import {
  abilityModifier,
  bloodiedValue,
  evaluatedHealingSurgeValue,
  familiarDefenses,
  familiarSpeed,
  halfLevel,
  healingSurgeValue,
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
