import { describe, expect, it } from "vitest";

import type { EvaluatedCharacter } from "@4ecb/rules-engine";
import { builderIssueGroups } from "./builder-diagnostics";

function evaluation(
  overrides: Partial<EvaluatedCharacter> = {},
): EvaluatedCharacter {
  return {
    level: 1,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [],
    activeDefinitionIds: [],
    activeDefinitions: [],
    choices: [],
    stats: {},
    textStrings: {},
    overlays: [],
    powers: [],
    suggestions: [],
    diagnostics: [],
    ...overrides,
  };
}

const common = {
  byId: new Map(),
  effectiveLevel: 1,
  planningHorizon: 1,
  abilityScoresIncomplete: false,
  abilityScoresHouseRuled: false,
};

describe("builder issue groups", () => {
  it("lists required choices only as unresolved and deduplicates choice.required", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        choices: [
          {
            id: "choice-1",
            level: 1,
            providerOccurrenceId: "provider",
            ruleOrdinal: 2,
            index: 0,
            type: "Feat",
            optional: false,
            candidates: [],
          },
        ],
        diagnostics: [
          {
            severity: "error",
            code: "choice.required",
            message: "Required Feat choice is unresolved.",
            occurrenceId: "provider",
            ruleOrdinal: 2,
          },
        ],
      }),
    });

    expect(result.unresolved).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("separates house rules from evaluation warnings and errors", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [
          {
            id: "selected",
            definitionId: "feat",
            acquiredLevel: 1,
            kind: "choice",
            legality: "houserule",
          },
        ],
        choices: [
          {
            id: "choice-1",
            level: 1,
            providerOccurrenceId: "provider",
            ruleOrdinal: 2,
            index: 0,
            type: "Feat",
            optional: false,
            selectedOccurrenceId: "selected",
            candidates: [],
          },
        ],
        diagnostics: [
          {
            severity: "warning",
            code: "occurrence.houserule",
            message: "Feat is marked as a house rule.",
            occurrenceId: "selected",
          },
          {
            severity: "error",
            code: "choice.ineligible",
            message: "The selected Feat is not eligible.",
            occurrenceId: "selected",
          },
          {
            severity: "warning",
            code: "rule.unknown",
            message: "Unknown rule was preserved but not evaluated.",
          },
          {
            severity: "error",
            code: "engine.non-convergent",
            message: "Rule topology did not converge.",
          },
        ],
      }),
    });

    expect(result.houseRules).toHaveLength(1);
    expect(result.warnings.map((issue) => issue.detail)).toEqual([
      "Unknown rule was preserved but not evaluated.",
    ]);
    expect(result.errors.map((issue) => issue.detail)).toEqual([
      "Rule topology did not converge.",
    ]);
  });

  it("puts ability-score states in their exact categories", () => {
    const incomplete = builderIssueGroups({
      ...common,
      evaluation: evaluation(),
      abilityScoresIncomplete: true,
    });
    expect(incomplete.unresolved.map((issue) => issue.key)).toEqual([
      "abilities:incomplete",
    ]);
    expect(incomplete.houseRules).toHaveLength(0);

    const houseRuled = builderIssueGroups({
      ...common,
      evaluation: evaluation(),
      abilityScoresHouseRuled: true,
    });
    expect(houseRuled.houseRules.map((issue) => issue.key)).toEqual([
      "abilities:house-rule",
    ]);
    expect(houseRuled.warnings).toHaveLength(0);
  });

  it("deduplicates identical diagnostics before counting and display", () => {
    const duplicate = {
      severity: "warning" as const,
      code: "rule.unknown",
      message: "Unknown rule was preserved but not evaluated.",
      occurrenceId: "owner",
      ruleOrdinal: 4,
    };
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({ diagnostics: [duplicate, duplicate] }),
    });

    expect(result.warnings).toHaveLength(1);
  });

  it("reports an ineligible selected choice even when the evaluator emitted no diagnostic", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [
          {
            id: "selected",
            definitionId: "feat",
            acquiredLevel: 1,
            kind: "choice",
            legality: "rules-legal",
          },
        ],
        choices: [
          {
            id: "choice-1",
            level: 1,
            providerOccurrenceId: "provider",
            ruleOrdinal: 2,
            index: 0,
            type: "Feat",
            optional: false,
            selectedOccurrenceId: "selected",
            candidates: [
              {
                definitionId: "feat",
                eligible: false,
                sourceEntitled: true,
                rulesLegal: false,
                activeDefinition: true,
                activeOccurrenceIds: ["selected"],
                providerOccurrenceIds: ["provider"],
                reasons: ["prerequisite"],
              },
            ],
          },
        ],
      }),
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        key: "selected-ineligible:choice-1:selected",
        detail: "This selection is not eligible: Does not meet prerequisites.",
        target: { kind: "choice", choiceId: "choice-1" },
      }),
    ]);
    expect(result.warnings).toHaveLength(0);
    expect(result.houseRules).toHaveLength(0);
  });

  it("uses the selected replacement target's candidates when checking eligibility", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [
          {
            id: "replacement",
            definitionId: "new-feat",
            acquiredLevel: 1,
            kind: "choice",
            legality: "rules-legal",
            replacesId: "old-feat",
          },
        ],
        choices: [
          {
            id: "replacement-choice",
            level: 1,
            providerOccurrenceId: "provider",
            ruleOrdinal: 3,
            index: 0,
            type: "Replacement",
            optional: true,
            selectedOccurrenceId: "replacement",
            candidates: [
              {
                definitionId: "old-feat",
                eligible: true,
                sourceEntitled: true,
                rulesLegal: true,
                activeDefinition: false,
                activeOccurrenceIds: [],
                providerOccurrenceIds: [],
                reasons: [],
              },
            ],
            replacementOptions: [
              {
                replacesOccurrenceId: "old-feat",
                definitionId: "old-feat",
                candidates: [
                  {
                    definitionId: "new-feat",
                    eligible: false,
                    sourceEntitled: true,
                    rulesLegal: false,
                    activeDefinition: true,
                    activeOccurrenceIds: ["replacement"],
                    providerOccurrenceIds: ["provider"],
                    reasons: ["duplicate"],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        key: "selected-ineligible:replacement-choice:replacement",
        detail:
          "This selection is not eligible: Already selected in another slot.",
        target: { kind: "choice", choiceId: "replacement-choice" },
      }),
    ]);
  });

  it("keeps an explicitly house-ruled ineligible selection out of errors", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [
          {
            id: "selected",
            definitionId: "feat",
            acquiredLevel: 1,
            kind: "choice",
            legality: "houserule",
          },
        ],
        choices: [
          {
            id: "choice-1",
            level: 1,
            providerOccurrenceId: "provider",
            ruleOrdinal: 2,
            index: 0,
            type: "Feat",
            optional: false,
            selectedOccurrenceId: "selected",
            candidates: [
              {
                definitionId: "feat",
                eligible: false,
                sourceEntitled: true,
                rulesLegal: false,
                activeDefinition: true,
                activeOccurrenceIds: ["selected"],
                providerOccurrenceIds: ["provider"],
                reasons: ["prerequisite"],
              },
            ],
          },
        ],
      }),
    });

    expect(result.errors).toHaveLength(0);
    expect(result.houseRules).toHaveLength(1);
  });

  it("treats a solely unverified prerequisite as a warning without duplicating its diagnostic", () => {
    const selectedChoice = {
      id: "choice-1",
      level: 1,
      providerOccurrenceId: "provider",
      ruleOrdinal: 2,
      index: 0,
      type: "Feat",
      optional: false,
      selectedOccurrenceId: "selected",
      candidates: [
        {
          definitionId: "feat",
          eligible: false,
          sourceEntitled: true,
          rulesLegal: false,
          activeDefinition: true,
          activeOccurrenceIds: ["selected"],
          providerOccurrenceIds: ["provider"],
          reasons: ["prerequisite-unverified"],
        },
      ],
    } as const;
    const selectedOccurrence = {
      id: "selected",
      definitionId: "feat",
      acquiredLevel: 1,
      kind: "choice" as const,
      legality: "rules-legal" as const,
    };
    const synthesized = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [selectedOccurrence],
        choices: [selectedChoice],
      }),
    });

    expect(synthesized.warnings).toEqual([
      expect.objectContaining({
        key: "selected-ineligible:choice-1:selected",
        effect:
          "The selection remains active, but its rules legality cannot be confirmed automatically.",
      }),
    ]);
    expect(synthesized.errors).toHaveLength(0);

    const diagnosed = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [selectedOccurrence],
        choices: [selectedChoice],
        diagnostics: [
          {
            severity: "warning",
            code: "prerequisite.unverified",
            message: "The selected Feat prerequisite could not be verified.",
            occurrenceId: "selected",
            ruleOrdinal: 2,
          },
        ],
      }),
    });

    expect(diagnosed.warnings).toHaveLength(1);
    expect(diagnosed.warnings[0]?.detail).toBe(
      "The selected Feat prerequisite could not be verified.",
    );
    expect(diagnosed.errors).toHaveLength(0);
  });

  it("preserves house rules with missing or out-of-horizon levels and orphaned diagnostics", () => {
    const result = builderIssueGroups({
      ...common,
      planningHorizon: 1,
      evaluation: evaluation({
        occurrences: [
          {
            id: "future-house-rule",
            definitionId: "future-feat",
            acquiredLevel: 20,
            kind: "choice",
            legality: "houserule",
          },
          {
            id: "level-less-house-rule",
            definitionId: "legacy-feat",
            kind: "choice",
            legality: "houserule",
          } as unknown as EvaluatedCharacter["occurrences"][number],
        ],
        diagnostics: [
          {
            severity: "warning",
            code: "occurrence.houserule",
            message: "Future feat is marked as a house rule.",
            occurrenceId: "future-house-rule",
          },
          {
            severity: "warning",
            code: "occurrence.houserule",
            message: "An imported selection is marked as a house rule.",
            occurrenceId: "missing-house-rule",
          },
        ],
      }),
    });

    expect(result.houseRules).toHaveLength(3);
    expect(result.houseRules.map((issue) => issue.key)).toEqual([
      "house-rule:future-house-rule",
      "house-rule:level-less-house-rule",
      "house-rule-diagnostic:missing-house-rule:An imported selection is marked as a house rule.",
    ]);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
