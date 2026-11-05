import { describe, expect, it } from "vitest";

import type { RuleStatement } from "@4ecb/content-domain";

import {
  choiceHeading,
  choiceName,
  choiceSubjectFromCandidates,
} from "./choice-wording";

function rule(name: string, attributes: Record<string, string>): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal: 0,
  };
}

/** A candidate spelled as the content spells it (ID, name, rules). */
function option(name: string, rules: RuleStatement[] = []) {
  return {
    id: `ID_INTERNAL_CLASS_FEATURE_${name.toUpperCase().replaceAll(" ", "_")}`,
    name,
    rules,
  };
}

const classFeature = { type: "Class Feature" };

describe("choice wording", () => {
  it("names a choice whose options differ only by a damage type", () => {
    // Armor of Adaptable Resistance +1's options, as the pack spells them.
    const candidates = ["Acid", "Cold", "Fire", "Force", "Thunder"].map(
      (damage) =>
        option(`Armor of Adaptable Resistance +1 (${damage})`, [
          rule("statadd", {
            name: `resist:${damage.toLowerCase()}`,
            value: "+5",
            type: "resist",
          }),
        ]),
    );
    expect(choiceSubjectFromCandidates(candidates)).toBe("Damage Type");
    expect(choiceName(classFeature, candidates)).toBe("Damage Type");
    expect(choiceHeading(classFeature, candidates)).toBe(
      "Choose a damage type",
    );
    // Names split at whole words: "(Fire)" and "(Force)" share "(", not "(F".
    expect(
      choiceSubjectFromCandidates([
        option("Gear (Fire)"),
        option("Gear (Force)"),
      ]),
    ).toBe("Damage Type");
    // A bare damage-type name counts too (Astral Vibrance's options).
    expect(
      choiceSubjectFromCandidates([
        option("Lightning"),
        option("Radiant"),
        option("Thunder"),
      ]),
    ).toBe("Damage Type");
  });

  it("names a choice whose options differ only by an ability or a defense", () => {
    expect(
      choiceHeading(
        { type: "Racial Trait" },
        ["Strength", "Constitution", "Dexterity"].map((ability) =>
          option(`Powerful Breath ${ability}`),
        ),
      ),
    ).toBe("Choose an ability score");
    expect(
      choiceHeading(
        classFeature,
        ["Fortitude", "Will"].map((defense) =>
          option(`Hybrid Warlord ${defense}`),
        ),
      ),
    ).toBe("Choose a defense");
  });

  it("names a choice whose every option grants one power", () => {
    // Harper Pin (heroic tier)'s options each grant a single power.
    const candidates = [
      ["Lliira's grace", "ID_MSR_POWER_LLIIRAS_GRACE"],
      ["Tymora's luck", "ID_MSR_POWER_TYMORAS_LUCK"],
    ].map(([name, power]) =>
      option(`Harper Pin (heroic tier) (${name})`, [
        rule("grant", { name: power!, type: "Power" }),
      ]),
    );
    expect(choiceName(classFeature, candidates)).toBe("Power");
    expect(choiceHeading(classFeature, candidates)).toBe("Choose a power");
  });

  it('falls back to "Option" when the options share nothing clear', () => {
    const mixed = [
      option("Battlefront Shooter", [
        rule("grant", { name: "ID_FMP_POWER_1", type: "Power" }),
      ]),
      option("Two-Blade Style", [rule("statadd", { name: "AC", value: "+1" })]),
    ];
    expect(choiceSubjectFromCandidates(mixed)).toBeUndefined();
    expect(choiceName(classFeature, mixed)).toBe("Option");
    expect(choiceHeading(classFeature, mixed)).toBe("Choose an option");
    // Grants of an internal type never name a choice.
    expect(
      choiceSubjectFromCandidates([
        option("Storm Domain", [
          rule("grant", { name: "ID_A", type: "Class Feature" }),
        ]),
        option("Sun Domain", [
          rule("grant", { name: "ID_B", type: "Class Feature" }),
        ]),
      ]),
    ).toBeUndefined();
    // One candidate shares nothing with anything.
    expect(
      choiceName(classFeature, [option("Armor of Resistance +1 (Fire)")]),
    ).toBe("Option");
    expect(choiceName(classFeature)).toBe("Option");
  });

  it("keeps an authored label and a player-facing type", () => {
    const damage = [option("Gear (Acid)"), option("Gear (Fire)")];
    const labeled = { type: "Class Feature", label: "Choose Resistance Type" };
    expect(choiceName(labeled, damage)).toBe("Resistance Type");
    expect(choiceHeading(labeled, damage)).toBe("Choose Resistance Type");
    expect(
      choiceHeading({ type: "Class Feature", label: "Elemental Specialty" }),
    ).toBe("Choose Elemental Specialty");
    // A player-facing type is the name, whatever its candidates share.
    expect(choiceName({ type: "Race Ability Bonus" }, damage)).toBe(
      "Race Ability Bonus",
    );
    expect(choiceHeading({ type: "Language" })).toBe("Choose a language");
    expect(choiceHeading({ type: "Utility Power" })).toBe(
      "Choose a utility power",
    );
    expect(choiceHeading({ type: "Encounter Power" })).toBe(
      "Choose an encounter power",
    );
  });
});
