import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";
import { describe, expect, it } from "vitest";

import { levelRetrain } from "./RetrainingWorkspace";

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
