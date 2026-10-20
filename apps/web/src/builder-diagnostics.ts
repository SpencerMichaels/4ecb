import type { ContentEntity } from "@4ecb/content-domain";
import type {
  EngineDiagnostic,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";
import {
  candidateReason,
  isBuildPresetChoice,
  selectedCandidateDecision,
  selectedDefinitionId,
  type DeityAlignmentConstraint,
} from "./builder-ui";

export type BuilderIssueKind =
  "unresolved" | "warning" | "error" | "house-rule" | "update";

export type BuilderIssueTarget =
  | { readonly kind: "abilities" }
  | { readonly kind: "content-update" }
  | { readonly kind: "settings" }
  | { readonly kind: "choice"; readonly choiceId: string };

export interface BuilderIssue {
  readonly key: string;
  readonly kind: BuilderIssueKind;
  readonly title: string;
  readonly detail: string;
  readonly effect: string;
  readonly target?: BuilderIssueTarget;
}

export interface BuilderIssueGroups {
  readonly unresolved: readonly BuilderIssue[];
  readonly warnings: readonly BuilderIssue[];
  readonly errors: readonly BuilderIssue[];
  readonly houseRules: readonly BuilderIssue[];
  /** News, not problems: an available game-content update. */
  readonly updates: readonly BuilderIssue[];
}

function selectedOccurrence(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
) {
  return evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.selectedOccurrenceId,
  );
}

function entityName(
  definitionId: string | undefined,
  byId: ReadonlyMap<string, ContentEntity>,
): string | undefined {
  if (definitionId === undefined) return undefined;
  return byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId;
}

function choiceLabel(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  const selected = selectedOccurrence(choice, evaluation);
  const selectedName = entityName(selected?.definitionId, byId);
  return selectedName === undefined
    ? `Level ${choice.level} ${choice.name ?? choice.type}`
    : `${selectedName} — level ${choice.level} ${choice.name ?? choice.type}`;
}

function choiceForDiagnostic(
  diagnostic: EngineDiagnostic,
  evaluation: EvaluatedCharacter,
): EvaluatedChoice | undefined {
  if (diagnostic.occurrenceId === undefined) return undefined;
  return evaluation.choices.find(
    (choice) =>
      choice.selectedOccurrenceId === diagnostic.occurrenceId ||
      (choice.providerOccurrenceId === diagnostic.occurrenceId &&
        (diagnostic.ruleOrdinal === undefined ||
          choice.ruleOrdinal === diagnostic.ruleOrdinal)),
  );
}

function diagnosticEffect(diagnostic: EngineDiagnostic): string {
  switch (diagnostic.code) {
    case "rule.unknown":
      return "The source rule is preserved for compatibility, but its mechanical effect is not calculated.";
    case "prerequisite.unverified":
      return "The selection remains active, but its rules legality cannot be confirmed automatically.";
    case "prerequisite.failed":
    case "choice.ineligible":
    case "occurrence.source-unentitled":
      return "The selection remains present, but the character is not rules-legal until the issue is resolved.";
    case "occurrence.missing-definition":
      return "The saved selection is preserved, but its mechanical benefits cannot be calculated without the missing definition.";
    case "grant.missing-target":
      return "The missing granted feature is not active, so its mechanical benefits are absent.";
    case "engine.non-convergent":
      return "Calculated character values may be incomplete or unreliable.";
    default:
      return diagnostic.severity === "error"
        ? "The character cannot be evaluated reliably until this issue is resolved."
        : "The character remains usable, but this rule requires review.";
  }
}

function deduplicate(issues: readonly BuilderIssue[]): BuilderIssue[] {
  const byKey = new Map<string, BuilderIssue>();
  for (const issue of issues)
    if (!byKey.has(issue.key)) byKey.set(issue.key, issue);
  return [...byKey.values()];
}

/** Character issues not produced by rules evaluation, raised through the
 * same diagnostics, header badges and Diagnostics tab as evaluated ones. */
export function contentUpdateIssue(characterTitle: string): BuilderIssue {
  return {
    key: "content:update-available",
    kind: "update",
    title: "Game content has been updated",
    detail: `${characterTitle || "This character"} still uses the older version of the game content.`,
    effect:
      "Rules, powers and items stay as they were until you review and apply the update.",
    target: { kind: "content-update" },
  };
}

/** The content the character is pinned to isn't in this browser. When other
 * content is active, moving onto it is the fix; otherwise Settings is. */
export function contentNotInstalledIssue(
  characterTitle: string,
  canUpdate: boolean,
): BuilderIssue {
  return {
    key: "content:not-installed",
    kind: "error",
    title: "Game content isn't installed",
    detail: `The game content ${characterTitle || "this character"} uses isn't in this browser, so its choices can't be calculated. Its history stays editable.`,
    effect: canUpdate
      ? "Review moves it onto the game content in use."
      : "Import or turn on its game content in Settings.",
    target: canUpdate ? { kind: "content-update" } : { kind: "settings" },
  };
}

/** The rules worker failed; cleared by the next successful evaluation. */
export function evaluationFailedIssue(message: string): BuilderIssue {
  return {
    key: "rules:evaluation-failed",
    kind: "error",
    title: "Rules couldn't be calculated",
    detail: message,
    effect:
      "Values and choices may be missing or out of date until this is fixed.",
  };
}

/**
 * Classes bound to their deity's alignment (Paladin, Invoker…) may still pick
 * another one; a mismatch marks the character as house-ruled.
 */
export function deityAlignmentIssue(
  constraint: DeityAlignmentConstraint,
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): BuilderIssue | undefined {
  // Compared by name: the alignment candidate list is only evaluated on the
  // tab showing it, but this issue must hold on every tab.
  const selected = entityName(
    selectedDefinitionId(constraint.alignmentChoice, evaluation),
    byId,
  );
  if (
    selected === undefined ||
    selected.trim().toLocaleLowerCase() ===
      constraint.alignmentName.trim().toLocaleLowerCase()
  )
    return undefined;
  return {
    key: "house-rule:deity-alignment",
    kind: "house-rule",
    title: "Alignment",
    detail: `As a ${constraint.classNames.join(" and ")}, your alignment should match your deity's. ${constraint.deityName} is ${constraint.alignmentName}.`,
    effect:
      "The alignment remains active and is preserved on export, but the character is marked as using house rules.",
    target: { kind: "choice", choiceId: constraint.alignmentChoice.id },
  };
}

export function withCharacterIssues(
  groups: BuilderIssueGroups,
  issues: readonly BuilderIssue[],
): BuilderIssueGroups {
  return {
    unresolved: [
      ...groups.unresolved,
      ...issues.filter((issue) => issue.kind === "unresolved"),
    ],
    warnings: [
      ...issues.filter((issue) => issue.kind === "warning"),
      ...groups.warnings,
    ],
    errors: [
      ...issues.filter((issue) => issue.kind === "error"),
      ...groups.errors,
    ],
    houseRules: [
      ...groups.houseRules,
      ...issues.filter((issue) => issue.kind === "house-rule"),
    ],
    updates: [
      ...groups.updates,
      ...issues.filter((issue) => issue.kind === "update"),
    ],
  };
}

export function builderIssueGroups({
  evaluation,
  byId,
  effectiveLevel,
  planningHorizon,
  abilityScoresIncomplete,
  abilityScoresHouseRuled,
}: {
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly effectiveLevel: number;
  readonly planningHorizon: number;
  readonly abilityScoresIncomplete: boolean;
  readonly abilityScoresHouseRuled: boolean;
}): BuilderIssueGroups {
  if (evaluation === undefined)
    return {
      unresolved: [],
      warnings: [],
      errors: [],
      houseRules: [],
      updates: [],
    };

  const unresolved: BuilderIssue[] = evaluation.choices.flatMap((choice) =>
    choice.level <= effectiveLevel &&
    !choice.optional &&
    !isBuildPresetChoice(choice) &&
    choice.selectedOccurrenceId === undefined
      ? [
          {
            key: `choice:${choice.id}`,
            kind: "unresolved" as const,
            title: choiceLabel(choice, evaluation, byId),
            detail: "This required choice has not been selected.",
            effect:
              "The character is incomplete, and no benefits from this selection apply until it is resolved.",
            target: { kind: "choice" as const, choiceId: choice.id },
          },
        ]
      : [],
  );
  if (effectiveLevel >= 1 && abilityScoresIncomplete)
    unresolved.push({
      key: "abilities:incomplete",
      kind: "unresolved",
      title: "Level 1 ability scores",
      detail: "The required point-buy allocation is incomplete.",
      effect:
        "The character is incomplete, and calculations that depend on ability scores may change.",
      target: { kind: "abilities" },
    });

  const houseRuleOccurrenceIds = new Set(
    evaluation.occurrences
      .filter((occurrence) => occurrence.legality === "houserule")
      .map((occurrence) => occurrence.id),
  );
  const houseRules: BuilderIssue[] = evaluation.occurrences.flatMap(
    (occurrence) => {
      if (!houseRuleOccurrenceIds.has(occurrence.id)) return [];
      const choice = evaluation.choices.find(
        (candidate) => candidate.selectedOccurrenceId === occurrence.id,
      );
      return [
        {
          key: `house-rule:${occurrence.id}`,
          kind: "house-rule" as const,
          title:
            choice === undefined
              ? (entityName(occurrence.definitionId, byId) ?? "House rule")
              : choiceLabel(choice, evaluation, byId),
          detail: "This selection is explicitly marked as a house rule.",
          effect:
            "It remains active and is preserved on export, but the character is marked as using house rules.",
          ...(choice === undefined
            ? {}
            : {
                target: {
                  kind: "choice" as const,
                  choiceId: choice.id,
                },
              }),
        },
      ];
    },
  );
  for (const diagnostic of evaluation.diagnostics) {
    if (
      diagnostic.code !== "occurrence.houserule" ||
      (diagnostic.occurrenceId !== undefined &&
        houseRuleOccurrenceIds.has(diagnostic.occurrenceId))
    )
      continue;
    const occurrence = evaluation.occurrences.find(
      (candidate) => candidate.id === diagnostic.occurrenceId,
    );
    const choice =
      diagnostic.occurrenceId === undefined
        ? undefined
        : evaluation.choices.find(
            (candidate) =>
              candidate.selectedOccurrenceId === diagnostic.occurrenceId,
          );
    houseRules.push({
      key: [
        "house-rule-diagnostic",
        diagnostic.occurrenceId ?? "",
        diagnostic.message,
      ].join(":"),
      kind: "house-rule",
      title:
        choice === undefined
          ? (entityName(occurrence?.definitionId, byId) ?? "House rule")
          : choiceLabel(choice, evaluation, byId),
      detail: diagnostic.message,
      effect:
        "It remains active and is preserved on export, but the character is marked as using house rules.",
      ...(choice === undefined
        ? {}
        : {
            target: {
              kind: "choice" as const,
              choiceId: choice.id,
            },
          }),
    });
  }
  if (abilityScoresHouseRuled)
    houseRules.push({
      key: "abilities:house-rule",
      kind: "house-rule",
      title: "Level 1 ability scores",
      detail:
        "The completed ability scores are outside the standard point-buy rules.",
      effect:
        "The scores remain active and are preserved on export, but the character is marked as using house rules.",
      target: { kind: "abilities" },
    });

  const ignoredHouseRuleDiagnostics = new Set([
    "occurrence.houserule",
    "prerequisite.failed",
    "choice.ineligible",
  ]);
  const diagnosticIssues = evaluation.diagnostics.flatMap((diagnostic) => {
    if (
      diagnostic.code === "choice.required" ||
      diagnostic.code === "occurrence.houserule" ||
      (diagnostic.occurrenceId !== undefined &&
        houseRuleOccurrenceIds.has(diagnostic.occurrenceId) &&
        ignoredHouseRuleDiagnostics.has(diagnostic.code)) ||
      diagnostic.severity === "info"
    )
      return [];
    const choice = choiceForDiagnostic(diagnostic, evaluation);
    const occurrence = evaluation.occurrences.find(
      (candidate) => candidate.id === diagnostic.occurrenceId,
    );
    const subject =
      choice === undefined
        ? entityName(occurrence?.definitionId, byId)
        : choiceLabel(choice, evaluation, byId);
    return [
      {
        key: [
          diagnostic.severity,
          diagnostic.code,
          diagnostic.occurrenceId ?? "",
          diagnostic.ruleOrdinal ?? "",
          diagnostic.message,
        ].join(":"),
        kind: diagnostic.severity,
        title: subject ?? diagnostic.code,
        detail: diagnostic.message,
        effect: diagnosticEffect(diagnostic),
        ...(choice === undefined
          ? {}
          : {
              target: {
                kind: "choice" as const,
                choiceId: choice.id,
              },
            }),
      },
    ];
  });

  // The evaluator normally emits a diagnostic for an ineligible selected
  // candidate, but recoverable legacy selections and replacement choices can
  // lack one. Keep the issue model complete instead of silently dropping the
  // warning that the choice UI still shows for the same selection.
  const diagnosedErrorOccurrenceIds = new Set(
    evaluation.diagnostics.flatMap((diagnostic) =>
      diagnostic.severity === "error" &&
      diagnostic.occurrenceId !== undefined &&
      [
        "choice.ineligible",
        "occurrence.source-unentitled",
        "prerequisite.failed",
      ].includes(diagnostic.code)
        ? [diagnostic.occurrenceId]
        : [],
    ),
  );
  const diagnosedUnverifiedOccurrenceIds = new Set(
    evaluation.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "prerequisite.unverified" &&
      diagnostic.occurrenceId !== undefined
        ? [diagnostic.occurrenceId]
        : [],
    ),
  );
  const selectedIneligibleIssues = evaluation.choices.flatMap(
    (choice): BuilderIssue[] => {
      if (
        choice.level > planningHorizon ||
        choice.selectedOccurrenceId === undefined ||
        houseRuleOccurrenceIds.has(choice.selectedOccurrenceId) ||
        diagnosedErrorOccurrenceIds.has(choice.selectedOccurrenceId)
      )
        return [];
      const candidate = selectedCandidateDecision(choice, evaluation);
      if (candidate === undefined || candidate.eligible) return [];
      const unverified =
        candidate.reasons.length === 1 &&
        candidate.reasons[0] === "prerequisite-unverified";
      if (
        unverified &&
        diagnosedUnverifiedOccurrenceIds.has(choice.selectedOccurrenceId)
      )
        return [];
      // A benefit that adds a class skill the class already has does nothing;
      // offered only alongside illegal options, it counts as a house rule.
      if (candidate.reasons.every((reason) => reason === "already-class-skill"))
        return [
          {
            key: `selected-redundant:${choice.id}:${choice.selectedOccurrenceId}`,
            kind: "house-rule" as const,
            title: choiceLabel(choice, evaluation, byId),
            detail:
              "This skill is already a class skill, so this selection has no effect.",
            effect:
              "It remains active and is preserved on export, but the character is marked as using house rules.",
            target: { kind: "choice" as const, choiceId: choice.id },
          },
        ];
      return [
        {
          key: `selected-ineligible:${choice.id}:${choice.selectedOccurrenceId}`,
          kind: unverified ? ("warning" as const) : ("error" as const),
          title: choiceLabel(choice, evaluation, byId),
          detail: `This selection is not eligible: ${candidateReason(candidate.reasons)}.`,
          effect: unverified
            ? "The selection remains active, but its rules legality cannot be confirmed automatically."
            : "The selection remains present, but the character is not rules-legal until its eligibility is resolved or the selection is changed.",
          target: { kind: "choice" as const, choiceId: choice.id },
        },
      ];
    },
  );

  return {
    unresolved: deduplicate(unresolved),
    warnings: deduplicate([
      ...diagnosticIssues.filter((issue) => issue.kind === "warning"),
      ...selectedIneligibleIssues.filter((issue) => issue.kind === "warning"),
    ]),
    errors: deduplicate([
      ...diagnosticIssues.filter((issue) => issue.kind === "error"),
      ...selectedIneligibleIssues.filter((issue) => issue.kind === "error"),
    ]),
    houseRules: deduplicate([
      ...houseRules,
      ...selectedIneligibleIssues.filter(
        (issue) => issue.kind === "house-rule",
      ),
    ]),
    updates: [],
  };
}
