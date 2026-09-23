import type { ContentEntity } from "@4ecb/content-domain";
import type {
  EngineDiagnostic,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";
import { candidateReason, isBuildPresetChoice } from "./builder-ui";

export type BuilderIssueKind =
  "unresolved" | "warning" | "error" | "house-rule";

export type BuilderIssueTarget =
  | { readonly kind: "abilities" }
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
}

function selectedOccurrence(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
) {
  return evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.selectedOccurrenceId,
  );
}

function selectedCandidate(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
) {
  const selected = selectedOccurrence(choice, evaluation);
  if (selected === undefined) return undefined;
  const candidates =
    choice.type === "Replacement"
      ? ((choice.replacementOptions ?? []).find(
          (option) => option.replacesOccurrenceId === selected.replacesId,
        )?.candidates ?? [])
      : choice.candidates;
  return candidates.find(
    (candidate) => candidate.definitionId === selected.definitionId,
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
    return { unresolved: [], warnings: [], errors: [], houseRules: [] };

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
  const selectedIneligibleIssues = evaluation.choices.flatMap((choice) => {
    if (
      choice.level > planningHorizon ||
      choice.selectedOccurrenceId === undefined ||
      houseRuleOccurrenceIds.has(choice.selectedOccurrenceId) ||
      diagnosedErrorOccurrenceIds.has(choice.selectedOccurrenceId)
    )
      return [];
    const candidate = selectedCandidate(choice, evaluation);
    if (candidate === undefined || candidate.eligible) return [];
    const unverified =
      candidate.reasons.length === 1 &&
      candidate.reasons[0] === "prerequisite-unverified";
    if (
      unverified &&
      diagnosedUnverifiedOccurrenceIds.has(choice.selectedOccurrenceId)
    )
      return [];
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
  });

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
    houseRules: deduplicate(houseRules),
  };
}
