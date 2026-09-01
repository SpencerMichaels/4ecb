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
});
