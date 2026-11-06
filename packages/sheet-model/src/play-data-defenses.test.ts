import { describe, expect, it } from "vitest";

import type { ConditionalModifier } from "./conditional-modifiers";
import type { DefensiveTrait } from "./defensive-traits";
import {
  CONDITIONAL_DEFENSES_POINTER,
  hasConditionalDefenses,
  playDataDefenseLine,
} from "./play-data-defenses";

const trait = (
  label: string,
  value: string,
  extra: Partial<DefensiveTrait> = {},
): DefensiveTrait => ({ label, value, source: "Synthetic", ...extra });

const defenseBonus = (target: string, text: string): ConditionalModifier => ({
  surface: "defenses",
  target,
  text,
  source: "Synthetic",
  provenanceId: `synthetic:${target}`,
});

describe("Play data card Defenses line (owner decision, 2026-11-05)", () => {
  it("shows the defenses that always apply, then points to page 1 for the rest", () => {
    // Natan: two resistance totals and conditional bonuses to all defenses.
    expect(
      playDataDefenseLine({
        saves: "+0",
        defensiveTraits: [
          trait("Resistance", "Necrotic 11"),
          trait("Resistance", "Radiant 11"),
        ],
        conditionalModifiers: [
          defenseBonus(
            "AC",
            "+1 to AC against attacks made by bloodied creatures",
          ),
          defenseBonus(
            "Will",
            "+1 to Will against attacks made by bloodied creatures",
          ),
        ],
      }),
    ).toBe(
      "Resist 11 necrotic, 11 radiant; conditional defenses in Conditional modifiers",
    );
  });

  it("groups each kind, adds the save total and drops conditional entries", () => {
    expect(
      playDataDefenseLine({
        saves: "+1",
        defensiveTraits: [
          trait("Resistance", "Fire 5"),
          trait("Resistance", "Fire 10 while bloodied", { conditional: true }),
          trait("Resistance", "Cold 7"),
          trait("Vulnerability", "Radiant 5"),
          trait("Saving throws", "+2 to saves against poison", {
            conditional: true,
          }),
          trait("Death saves", "+2 to death saves"),
        ],
        conditionalModifiers: [],
      }),
    ).toBe(
      "Resist 5 fire, 7 cold; Vulnerable 5 radiant; +1 to saves; +2 to death saves; conditional defenses in Conditional modifiers",
    );
  });

  it("has no pointer without conditional defenses", () => {
    const input = {
      saves: "+0",
      defensiveTraits: [trait("Resistance", "Poison 5")],
      // Initiative and speed bonuses are not defenses.
      conditionalModifiers: [
        {
          ...defenseBonus("Speed", "+2 to speed when charging"),
          surface: "speed" as const,
        },
      ],
    };
    expect(hasConditionalDefenses(input)).toBe(false);
    expect(playDataDefenseLine(input)).toBe("Resist 5 poison");
  });

  it("is only the pointer when every defense is conditional", () => {
    expect(
      playDataDefenseLine({
        saves: "",
        defensiveTraits: [
          trait("Saving throws", "+5 racial bonus to saves against illusions", {
            conditional: true,
          }),
        ],
        conditionalModifiers: [],
      }),
    ).toBe("Conditional defenses in Conditional modifiers");
  });

  it("leaves a feature's own defense clause to page 1", () => {
    const input = {
      saves: "+0",
      defensiveTraits: [
        trait(
          "Shifting Form",
          "While transformed, you are immune to disease.",
          { group: "Immunities", authored: true },
        ),
      ],
      conditionalModifiers: [],
    };
    expect(hasConditionalDefenses(input)).toBe(true);
    expect(playDataDefenseLine(input)).toBe(
      CONDITIONAL_DEFENSES_POINTER.replace(/^c/, "C"),
    );
  });

  it("is empty without any defenses beyond the scores", () => {
    expect(
      playDataDefenseLine({
        saves: "+0",
        defensiveTraits: [],
        conditionalModifiers: [],
      }),
    ).toBe("");
  });
});
