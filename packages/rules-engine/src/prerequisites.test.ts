import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { evaluatePrerequisite } from "./prerequisites";

const owned = [
  { id: "CLASS", name: "Avenger", type: "Class" },
  { id: "SOURCE", name: "Divine", type: "Power Source" },
  { id: "TRAINING", name: "Athletics", type: "Skill Training" },
  { id: "MULTI", name: "Multiclass", type: "Multiclass" },
  {
    id: "PROFICIENCY",
    name: "Weapon Proficiency (Longsword)",
    type: "Proficiency",
  },
  {
    id: "DEITY",
    name: "Ioun",
    type: "Deity",
    categories: [],
    specifics: [
      {
        name: "Domains",
        value: "Arcana, Knowledge, Skill",
        extraAttributes: [],
        ordinal: 0,
      },
    ],
  },
] as unknown as ContentEntity[];
const context = {
  owned,
  level: 8,
  abilities: { Strength: 13, Wisdom: 16 },
};

describe("legacy prerequisites", () => {
  it("evaluates ability, level, training, source, identity, and boolean clauses", () => {
    expect(
      evaluatePrerequisite(
        "Str 13, Wis 13; ~MULTICLASS or Unlimited Multiclass; !Wizard",
        context,
      ).status,
    ).toBe("satisfied");
    expect(evaluatePrerequisite("Trained in Athletics", context).status).toBe(
      "satisfied",
    );
    expect(evaluatePrerequisite("Any divine class", context).status).toBe(
      "satisfied",
    );
    expect(evaluatePrerequisite("Level 11", context).status).toBe("failed");
  });

  it("distinguishes native markers and unknown prose", () => {
    expect(evaluatePrerequisite("~HUMAN", context).status).toBe("satisfied");
    expect(
      evaluatePrerequisite("must have crossed the silver sea", context).status,
    ).toBe("unverified");
  });

  it("fails an absent prerequisite that names a known definition", () => {
    const arcaneAdmixture = {
      id: "ARCANE_ADMIXTURE_II",
      name: "Arcane Admixture II",
      type: "Feat",
    } as ContentEntity;
    expect(
      evaluatePrerequisite("Arcane Admixture II", {
        ...context,
        knownTokens: new Set(["arcane admixture ii"]),
      }).status,
    ).toBe("failed");
    expect(
      evaluatePrerequisite("Arcane Admixture II", {
        ...context,
        owned: [...owned, arcaneAdmixture],
        knownTokens: new Set(["arcane admixture ii"]),
      }).status,
    ).toBe("satisfied");
  });

  it("covers level, tier, class, training, proficiency, and deity prose", () => {
    expect(evaluatePrerequisite("8th level", context).status).toBe("satisfied");
    expect(evaluatePrerequisite("Paragon Tier", context).status).toBe("failed");
    expect(evaluatePrerequisite("Avenger class", context).status).toBe(
      "satisfied",
    );
    expect(
      evaluatePrerequisite("You must have training in Athletics.", context)
        .status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("proficiency with longsword", context).status,
    ).toBe("satisfied");
    expect(evaluatePrerequisite("must worship Ioun", context).status).toBe(
      "satisfied",
    );
    expect(
      evaluatePrerequisite("must worship a deity of the skill domain", context)
        .status,
    ).toBe("satisfied");
    expect(evaluatePrerequisite("Unselectable", context).status).toBe("failed");
  });

  it("evaluates bracketed feat references by their definition name", () => {
    const prerequisite = "Blood Thirst [Multiclass Vampire] feat";
    expect(evaluatePrerequisite(prerequisite, context).status).toBe("failed");
    expect(
      evaluatePrerequisite(prerequisite, {
        ...context,
        owned: [
          ...owned,
          { id: "BLOOD_THIRST", name: "Blood Thirst", type: "Feat" },
        ] as ContentEntity[],
      }).status,
    ).toBe("satisfied");
  });

  it("treats comma-delimited lists ending in or as alternatives", () => {
    const prerequisite =
      "ID_FMP_POWER_917, ID_FMP_POWER_4368, or ID_FMP_POWER_10591";
    const knownTokens = new Set([
      "id fmp power 917",
      "id fmp power 4368",
      "id fmp power 10591",
    ]);
    expect(
      evaluatePrerequisite(prerequisite, {
        ...context,
        knownTokens,
        ownedTokens: new Set(["id fmp power 4368"]),
      }).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite(prerequisite, {
        ...context,
        knownTokens,
        ownedTokens: new Set(),
      }).status,
    ).toBe("failed");
  });
});
