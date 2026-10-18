import { describe, expect, it } from "vitest";

import {
  abilityModifier,
  bloodiedValue,
  evaluatedHealingSurgeValue,
  halfLevel,
  healingSurgeValue,
} from "./derived-values";

describe("shared derived values", () => {
  it("rounds ability modifiers, half level and bloodied down", () => {
    expect([
      abilityModifier(18),
      abilityModifier(9),
      abilityModifier(8),
    ]).toEqual([4, -1, -1]);
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
