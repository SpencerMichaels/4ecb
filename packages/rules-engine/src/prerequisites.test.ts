import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { evaluatePrerequisite } from "./prerequisites";

const owned = [
  { id: "CLASS", name: "Avenger", type: "Class" },
  { id: "SOURCE", name: "Divine", type: "Power Source" },
  { id: "TRAINING", name: "Athletics", type: "Skill Training" },
  { id: "MULTI", name: "Multiclass", type: "Multiclass" },
] as ContentEntity[];
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
      evaluatePrerequisite("must worship a deity of the skill domain", context)
        .status,
    ).toBe("unverified");
  });
});
