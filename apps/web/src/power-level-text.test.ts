import { describe, expect, it } from "vitest";

import { powerTextAtLevel } from "./power-level-text";

describe("powerTextAtLevel", () => {
  const tieredHit =
    "1[W] + ability modifier damage, and either you shift 4 squares, or each ally can shift 2 squares. " +
    "Increase damage to 2[W] + ability modifier at 11th level. " +
    "Increase damage to 3[W] + ability modifier at 21st level.";

  it("removes future damage tiers while preserving the rest of the hit effect", () => {
    expect(powerTextAtLevel(tieredHit, 8)).toBe(
      "1[W] + ability modifier damage, and either you shift 4 squares, or each ally can shift 2 squares.",
    );
    expect(powerTextAtLevel(tieredHit, 11)).toBe(
      "2[W] + ability modifier damage, and either you shift 4 squares, or each ally can shift 2 squares.",
    );
    expect(powerTextAtLevel(tieredHit, 24)).toBe(
      "3[W] + ability modifier damage, and either you shift 4 squares, or each ally can shift 2 squares.",
    );
  });

  it("selects the highest applicable Level N alternative", () => {
    const value =
      "1d8 + Wisdom modifier damage, and the target is slowed.\n" +
      "Level 11: 2d8 + Wisdom modifier damage.\n" +
      "Level 21: 3d8 + Wisdom modifier damage.";
    expect(powerTextAtLevel(value, 18)).toBe(
      "2d8 + Wisdom modifier damage, and the target is slowed.",
    );
  });

  it("reduces Dragon Breath-style bonus and damage progressions", () => {
    const value =
      "1d6 + Constitution modifier (+2) damage. " +
      "Increase to +4 bonus and 2d6 + Constitution modifier (+2) damage at 11th level, " +
      "and to +6 bonus and 3d6 + Constitution modifier (+2) damage at 21st level.";
    expect(powerTextAtLevel(value, 8)).toBe(
      "1d6 + Constitution modifier (+2) damage.",
    );
    expect(powerTextAtLevel(value, 11)).toBe(
      "2d6 + Constitution modifier (+2) damage.",
    );
    expect(powerTextAtLevel(value, 24)).toBe(
      "3d6 + Constitution modifier (+2) damage.",
    );
  });

  it("uses complete non-damage alternatives and leaves unknown prose alone", () => {
    expect(
      powerTextAtLevel("Shift 1 square.\nLevel 11: Shift 2 squares.", 12),
    ).toBe("Shift 2 squares.");
    expect(powerTextAtLevel("The target is dazed (save ends).", 30)).toBe(
      "The target is dazed (save ends).",
    );
  });
});
