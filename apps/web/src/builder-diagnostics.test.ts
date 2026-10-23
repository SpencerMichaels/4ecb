import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type BuildInventoryEntry,
  type BuildOccurrence,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";
import type { DeityAlignmentConstraint } from "./builder-ui";
import {
  builderIssueGroups,
  contentNotInstalledIssue,
  contentUpdateIssue,
  deityAlignmentIssue,
  evaluationFailedIssue,
  missingHoldingContentIssues,
  savedOccurrenceNames,
  withCharacterIssues,
} from "./builder-diagnostics";

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

  it("lists an equipped item's unmet requirement as a house rule", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        legal: false,
        diagnostics: [
          {
            severity: "warning",
            code: "item.requirement-unmet",
            message: "Synthetic Ki Focus +1: Must be able to use Ki Focuses.",
          },
        ],
      }),
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.houseRules).toHaveLength(1);
    expect(result.houseRules[0]?.detail).toBe(
      "Synthetic Ki Focus +1: Must be able to use Ki Focuses.",
    );
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

  it("reports a redundant class-skill benefit as a house rule, not an error", () => {
    const result = builderIssueGroups({
      ...common,
      evaluation: evaluation({
        occurrences: [
          {
            id: "selected",
            definitionId: "religion-class-skill",
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
            ruleOrdinal: 0,
            index: 0,
            type: "Background Choice",
            optional: false,
            selectedOccurrenceId: "selected",
            candidates: [
              {
                definitionId: "religion-class-skill",
                eligible: false,
                sourceEntitled: true,
                rulesLegal: false,
                activeDefinition: true,
                activeOccurrenceIds: ["selected"],
                providerOccurrenceIds: ["provider"],
                reasons: ["already-class-skill"],
              },
            ],
          },
        ],
      }),
    });

    expect(result.errors).toHaveLength(0);
    expect(result.houseRules).toEqual([
      expect.objectContaining({
        key: "selected-redundant:choice-1:selected",
        kind: "house-rule",
        target: { kind: "choice", choiceId: "choice-1" },
      }),
    ]);
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

describe("character issues outside rules evaluation", () => {
  it("raises available content updates as a reviewable warning", () => {
    const issue = contentUpdateIssue("Ingi");
    // News, not a problem: it has its own badge, never counted as a warning.
    expect(issue).toMatchObject({
      kind: "update",
      title: "Game content has been updated",
      target: { kind: "content-update" },
    });
    expect(issue.detail).toContain("Ingi still uses the older version");
    expect(contentUpdateIssue("").detail).toContain("This character");

    const groups = withCharacterIssues(
      {
        unresolved: [],
        warnings: [],
        errors: [],
        houseRules: [],
        updates: [],
      },
      [issue],
    );
    expect(groups.updates).toEqual([issue]);
    expect(groups.warnings).toEqual([]);
    expect(groups.unresolved).toEqual([]);
  });
});

describe("deity alignment", () => {
  const alignmentChoice = {
    id: "alignment-choice",
    type: "Alignment",
    selectedOccurrenceId: "alignment",
  } as unknown as EvaluatedChoice;
  const constraint = {
    classNames: ["Paladin"],
    deityName: "Pelor",
    alignmentName: "Good",
    alignmentChoice,
  } as unknown as DeityAlignmentConstraint;
  // No candidate list: tabs other than Details evaluate without one.
  const byId = new Map(
    [
      { id: "GOOD", name: "Good" },
      { id: "UNALIGNED", name: "Unaligned" },
    ].map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  ) as unknown as ReadonlyMap<string, ContentEntity>;
  const chosen = (definitionId: string) =>
    evaluation({
      occurrences: [
        { id: "alignment", definitionId },
      ] as unknown as EvaluatedCharacter["occurrences"],
    });

  it("marks an alignment that differs from the deity's as a house rule", () => {
    expect(
      deityAlignmentIssue(constraint, chosen("UNALIGNED"), byId),
    ).toMatchObject({
      key: "house-rule:deity-alignment",
      kind: "house-rule",
      detail:
        "As a Paladin, your alignment should match your deity's. Pelor is Good.",
      target: { kind: "choice", choiceId: "alignment-choice" },
    });
  });

  it("raises nothing for a matching or unchosen alignment", () => {
    expect(
      deityAlignmentIssue(constraint, chosen("GOOD"), byId),
    ).toBeUndefined();
    expect(deityAlignmentIssue(constraint, evaluation(), byId)).toBeUndefined();
  });
  it("raises missing content and failed evaluation as errors, not banners", () => {
    expect(contentNotInstalledIssue("Ingi", true)).toMatchObject({
      kind: "error",
      title: "Game content isn't installed",
      target: { kind: "content-update" },
    });
    expect(contentNotInstalledIssue("Ingi", false).target).toEqual({
      kind: "settings",
    });
    const failed = evaluationFailedIssue("Worker crashed");
    expect(failed).toMatchObject({ kind: "error", detail: "Worker crashed" });
    const groups = withCharacterIssues(
      {
        unresolved: [],
        warnings: [],
        errors: [],
        houseRules: [],
        updates: [],
      },
      [failed],
    );
    expect(groups.errors).toEqual([failed]);
  });
});

describe("missing-content issues", () => {
  const occurrence = (
    id: string,
    definitionId: string,
    name: string,
    children: BuildOccurrence[] = [],
  ): BuildOccurrence => ({
    id,
    identity: { definitionId, name, type: "Skill" },
    acquiredLevel: 1,
    legality: "rules-legal",
    children,
    unresolved: false,
  });
  const holding = (
    id: string,
    equippedQuantity: number,
    elements: BuildInventoryEntry["elements"],
  ): BuildInventoryEntry => ({
    id,
    acquiredLevel: 1,
    quantity: 1,
    equippedQuantity,
    elements,
    overrides: {},
    legality: "rules-legal",
  });
  const build: CharacterBuild = {
    formatVersion: 2,
    known: [],
    effectiveLevel: 1,
    levels: [
      {
        level: 1,
        root: occurrence("level-1", "ID_LEVEL_1", "1", [
          occurrence("skill-rules", "ID_SKILL_RULES", "Skill Rules", [
            occurrence("homebrew-skill", "ID_HOMEBREW_SKILL", "Cooking"),
          ]),
          occurrence("deity", "ID_HOMEBREW_DEITY", "Aeros"),
        ]),
      },
    ],
    grabbag: [],
    inventory: [
      holding("shield", 1, [
        { definitionId: "ID_HOMEBREW_SHIELD", name: "Buckler", type: "Armor" },
      ]),
      holding("charm", 0, [
        {
          definitionId: "ID_HOMEBREW_CHARM",
          name: "Lucky Charm",
          type: "Magic Item",
        },
      ]),
      holding("rope", 0, [
        { definitionId: "ID_ROPE", name: "Rope", type: "Gear" },
      ]),
    ],
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  };
  const known: ContentEntity = {
    id: "ID_ROPE",
    name: "Rope",
    type: "Gear",
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "diagnostics-test", sourceOrdinal: 0 },
  };
  const byId = new Map([["id_rope", known]]);
  const missing = (occurrenceId: string, definitionId: string) => ({
    severity: "error" as const,
    code: "occurrence.missing-definition",
    message: `Missing content definition ${definitionId}`,
    occurrenceId,
  });
  const evaluated = evaluation({
    occurrences: [
      {
        id: "homebrew-skill",
        definitionId: "ID_HOMEBREW_SKILL",
        acquiredLevel: 1,
        parentId: "skill-rules",
        kind: "grant",
      },
      {
        id: "deity",
        definitionId: "ID_HOMEBREW_DEITY",
        acquiredLevel: 1,
        parentId: "level-1",
        kind: "choice",
      },
      {
        id: "shield:definition:0",
        definitionId: "ID_HOMEBREW_SHIELD",
        acquiredLevel: 1,
        kind: "inventory",
      },
    ],
    choices: [
      {
        id: "deity-choice",
        level: 1,
        providerOccurrenceId: "level-1",
        ruleOrdinal: 0,
        index: 0,
        type: "Deity",
        optional: true,
        selectedOccurrenceId: "deity",
        candidates: [],
      },
    ],
    diagnostics: [
      missing("homebrew-skill", "ID_HOMEBREW_SKILL"),
      missing("deity", "ID_HOMEBREW_DEITY"),
      missing("shield:definition:0", "ID_HOMEBREW_SHIELD"),
    ],
  });

  it("titles missing definitions by their saved names, not internal IDs", () => {
    const { errors } = builderIssueGroups({
      ...common,
      byId,
      evaluation: evaluated,
      build,
    });
    expect(errors.map(({ title }) => title)).toEqual([
      "Cooking",
      "Aeros — level 1 Deity",
    ]);
    expect(errors[0]?.detail).toBe(
      "Cooking isn't in the game content in use (ID_HOMEBREW_SKILL).",
    );
  });

  it("falls back to the internal ID when no name was saved", () => {
    const { errors } = builderIssueGroups({
      ...common,
      evaluation: evaluated,
    });
    expect(errors.map(({ title }) => title)).toContain("ID_HOMEBREW_SKILL");
  });

  it("offers Remove only for saved occurrences no choice owns", () => {
    const { errors } = builderIssueGroups({
      ...common,
      byId,
      evaluation: evaluated,
      build,
    });
    const skill = errors.find(({ title }) => title === "Cooking");
    const deity = errors.find(({ title }) => title.startsWith("Aeros"));
    expect(skill?.removal).toEqual({ occurrenceId: "homebrew-skill" });
    expect(skill?.target).toBeUndefined();
    expect(deity?.removal).toBeUndefined();
    expect(deity?.target).toEqual({ kind: "choice", choiceId: "deity-choice" });

    const removed = applyCharacterCommand(build, {
      kind: "remove-occurrence",
      occurrenceId: skill!.removal!.occurrenceId,
    });
    expect(savedOccurrenceNames(removed).has("homebrew-skill")).toBe(false);
    expect(savedOccurrenceNames(removed).get("deity")).toBe("Aeros");
  });

  it("raises one issue per holding with missing content, equipped or not", () => {
    const issues = missingHoldingContentIssues(build, byId);
    expect(issues).toEqual([
      expect.objectContaining({
        key: "inventory:missing-content:shield",
        kind: "error",
        title: "Buckler",
        detail: "Buckler isn't in the game content in use.",
        target: { kind: "inventory", entryId: "shield" },
      }),
      expect.objectContaining({
        key: "inventory:missing-content:charm",
        kind: "warning",
        title: "Lucky Charm",
      }),
    ]);
    // The equipped holding's engine diagnostic folds into its holding issue.
    const groups = withCharacterIssues(
      builderIssueGroups({
        ...common,
        byId,
        evaluation: evaluated,
        build,
      }),
      issues,
    );
    expect(
      groups.errors.filter(({ title }) => title === "Buckler"),
    ).toHaveLength(1);
    expect(groups.warnings.map(({ title }) => title)).toEqual(["Lucky Charm"]);
  });
});
