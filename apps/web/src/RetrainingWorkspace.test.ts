import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";
import { describe, expect, it } from "vitest";

import { levelRetrain, retrainingCategories } from "./RetrainingWorkspace";

describe("level retrain summary", () => {
  const byId = new Map<string, ContentEntity>([
    [
      "acrobatics",
      { id: "Acrobatics", name: "Acrobatics", type: "Skill" } as ContentEntity,
    ],
    [
      "athletics",
      { id: "Athletics", name: "Athletics", type: "Skill" } as ContentEntity,
    ],
  ]);
  const choice = {
    id: "retrain-4",
    level: 4,
    type: "Replacement",
    optional: true,
    selectedOccurrenceId: "new",
    candidates: [],
  } as unknown as EvaluatedChoice;

  it("names what was given up and what replaced it, by kind", () => {
    const evaluation = {
      occurrences: [
        { id: "old", definitionId: "Acrobatics" },
        { id: "new", definitionId: "Athletics", replacesId: "old" },
      ],
    } as unknown as EvaluatedCharacter;
    expect(levelRetrain([choice], evaluation, byId)).toMatchObject({
      category: "skill",
      from: "Acrobatics",
      to: "Athletics",
    });
  });

  it("is undefined for a level without a retrain", () => {
    const evaluation = { occurrences: [] } as unknown as EvaluatedCharacter;
    expect(
      levelRetrain(
        [
          {
            ...choice,
            selectedOccurrenceId: undefined,
          } as unknown as EvaluatedChoice,
        ],
        evaluation,
        byId,
      ),
    ).toBeUndefined();
  });
});

describe("beast companion retraining", () => {
  it("is one of the level's retraining options for a character with a beast", () => {
    const companionChoice = {
      type: "Companion",
    } as unknown as EvaluatedChoice;
    expect(
      retrainingCategories({
        choices: [companionChoice],
      } as unknown as EvaluatedCharacter),
    ).toEqual(["skill", "feat", "power", "companion"]);
    expect(
      retrainingCategories({ choices: [] } as unknown as EvaluatedCharacter),
    ).toEqual(["skill", "feat", "power"]);
  });

  it("summarizes a beast swap as a companion retrain", () => {
    const evaluation = {
      occurrences: [
        { id: "old", definitionId: "Wolf" },
        { id: "new", definitionId: "Bear", replacesId: "old" },
      ],
    } as unknown as EvaluatedCharacter;
    expect(
      levelRetrain(
        [
          {
            id: "retrain-5",
            level: 5,
            type: "Replacement",
            optional: true,
            selectedOccurrenceId: "new",
            candidates: [],
          } as unknown as EvaluatedChoice,
        ],
        evaluation,
        byIdForBeasts,
      ),
    ).toMatchObject({ category: "companion", from: "Wolf", to: "Bear" });
  });
});

const byIdForBeasts = new Map<string, ContentEntity>([
  ["wolf", { id: "Wolf", name: "Wolf", type: "Companion" } as ContentEntity],
  ["bear", { id: "Bear", name: "Bear", type: "Companion" } as ContentEntity],
]);
