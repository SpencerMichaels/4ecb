import {
  isKnownRecordHolding,
  type BuildOccurrence,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  matchableName,
  nameMatchedIdentities,
  suffixedName,
} from "@4ecb/legacy-dnd4e";
import type {
  EngineDiagnostic,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";
import {
  candidateReason,
  isBuildPresetChoice,
  legacyChoiceSection,
  powerSwapPresentation,
  selectedCandidateDecision,
  selectedDefinitionId,
  type DeityAlignmentConstraint,
  type LegacyChoiceSection,
} from "./builder-ui";
import { inventoryDisplayName, missingInventoryElements } from "./equipment-ui";

export type BuilderIssueKind =
  | "unresolved"
  | "warning"
  | "error"
  | "house-rule"
  | "update"
  | "note"
  | "inactive";

export type BuilderIssueTarget =
  | { readonly kind: "abilities" }
  | { readonly kind: "content-update" }
  | { readonly kind: "settings" }
  | { readonly kind: "choice"; readonly choiceId: string }
  /** A level's Build section, for a slot that has no live choice. */
  | {
      readonly kind: "level-section";
      readonly level: number;
      readonly section: LegacyChoiceSection;
    }
  | { readonly kind: "inventory"; readonly entryId: string };

export interface BuilderIssue {
  readonly key: string;
  readonly kind: BuilderIssueKind;
  readonly title: string;
  readonly detail: string;
  readonly effect: string;
  readonly target?: BuilderIssueTarget;
  /**
   * A saved occurrence no choice owns (a homebrew skill grant, for example)
   * that the issue offers to remove from the character.
   */
  readonly removal?: { readonly occurrenceId: string };
}

export interface BuilderIssueGroups {
  readonly unresolved: readonly BuilderIssue[];
  readonly warnings: readonly BuilderIssue[];
  readonly errors: readonly BuilderIssue[];
  readonly houseRules: readonly BuilderIssue[];
  /** News, not problems: an available game-content update. */
  readonly updates: readonly BuilderIssue[];
  /** Not problems: how import read the file (records matched by name). */
  readonly notes: readonly BuilderIssue[];
  /** Not problems: saved picks whose slot a rule currently switches off. */
  readonly inactive: readonly BuilderIssue[];
}

function selectedOccurrence(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
) {
  return evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.selectedOccurrenceId,
  );
}

/** The content name, else the name saved with the occurrence (content the
 * active profile lacks), else the internal ID. */
function entityName(
  definitionId: string | undefined,
  byId: ReadonlyMap<string, ContentEntity>,
  savedName?: string,
): string | undefined {
  if (definitionId === undefined) return undefined;
  return (
    byId.get(definitionId.toLocaleLowerCase())?.name ??
    (savedName === undefined || savedName === "" ? definitionId : savedName)
  );
}

/**
 * Names saved with each build occurrence, by evaluated occurrence ID.
 * Inventory elements use the evaluator's `<entry>:definition:<index>` IDs.
 */
export function savedOccurrenceNames(
  build: CharacterBuild | undefined,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (build === undefined) return names;
  const visit = (occurrence: BuildOccurrence): void => {
    const name = occurrence.identity.name.trim();
    if (name !== "") names.set(occurrence.id, name);
    occurrence.children.forEach(visit);
  };
  for (const frame of build.levels) {
    visit(frame.root);
    if (frame.userEdit !== undefined) visit(frame.userEdit.root);
  }
  build.grabbag.forEach(visit);
  for (const alternate of build.alternates) visit(alternate.choice);
  for (const entry of build.inventory)
    entry.elements.forEach((element, index) => {
      const name = element.name.trim();
      if (name !== "") names.set(`${entry.id}:definition:${index}`, name);
      element.children?.forEach(visit);
    });
  return names;
}

/** Whether `id` is a saved non-root level or grab-bag occurrence, which the
 * `remove-occurrence` command can remove. */
function isRemovableOccurrence(
  build: CharacterBuild | undefined,
  id: string,
): boolean {
  if (build === undefined) return false;
  const visit = (occurrence: BuildOccurrence): boolean =>
    occurrence.id === id || occurrence.children.some(visit);
  return (
    build.levels.some((frame) => frame.root.children.some(visit)) ||
    build.grabbag.some(visit)
  );
}

function choiceLabel(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
  savedNames: ReadonlyMap<string, string> = new Map(),
): string {
  const selected = selectedOccurrence(choice, evaluation);
  const selectedName = entityName(
    selected?.definitionId,
    byId,
    selected === undefined ? undefined : savedNames.get(selected.id),
  );
  const swap = powerSwapPresentation(choice, evaluation, byId);
  const kind =
    swap === undefined
      ? (choice.name ?? choice.type)
      : `${swap.kind} power swap`;
  return selectedName === undefined
    ? `Level ${choice.level} ${kind}`
    : `${selectedName} — level ${choice.level} ${kind}`;
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
 * Holdings whose base or enchantment definition the active content lacks
 * (homebrew, or a source that isn't installed). Equipped ones leave the
 * character's numbers incomplete, so they are errors like any equipped
 * missing definition; carried ones only warn.
 */
export function missingHoldingContentIssues(
  build: CharacterBuild,
  byId: ReadonlyMap<string, ContentEntity>,
): BuilderIssue[] {
  return build.inventory.flatMap((entry): BuilderIssue[] => {
    if (entry.quantity <= 0 || isKnownRecordHolding(entry)) return [];
    const missing = missingInventoryElements(entry, byId);
    if (missing.length === 0) return [];
    const equipped = entry.equippedQuantity > 0;
    const names = missing.map(
      ({ name, definitionId }) => name.trim() || definitionId,
    );
    return [
      {
        key: `inventory:missing-content:${entry.id}`,
        kind: equipped ? "error" : "warning",
        title: inventoryDisplayName(entry, byId),
        detail: `${names.join(" and ")} ${missing.length === 1 ? "isn't" : "aren't"} in the game content in use.`,
        effect: equipped
          ? "The item stays equipped and is preserved on export, but its effects aren't calculated."
          : "The item stays in the inventory and is preserved on export, but its effects can't be calculated.",
        target: { kind: "inventory", entryId: entry.id },
      },
    ];
  });
}

/**
 * Saved records an import pointed at a same-named content record because
 * the file's ID wasn't in the content (Settings: "Match missing content by
 * name"). Read from the build, so they stay listed after import.
 */
export function nameMatchedContentIssues(
  build: CharacterBuild,
  byId: ReadonlyMap<string, ContentEntity>,
): BuilderIssue[] {
  return nameMatchedIdentities(build).map((match) => {
    const name = byId.get(match.definitionId.toLocaleLowerCase())?.name;
    const sameName =
      name === undefined ||
      matchableName(name) === matchableName(match.savedName);
    const suffixed = suffixedName(match.savedName);
    const classSuffix =
      !sameName &&
      suffixed !== undefined &&
      matchableName(suffixed.name) === matchableName(name ?? "")
        ? suffixed.suffix
        : undefined;
    return {
      key: `import:matched:${match.savedId}`,
      kind: "note",
      title: `${name ?? match.savedName} (${match.type})`,
      detail: sameName
        ? `Your file saved it as ${match.savedId}, which the game content doesn't have, so it uses ${match.definitionId}, the one record with the same name and type.`
        : classSuffix !== undefined
          ? `Your file saved “${match.savedName}” as ${match.savedId}, which the game content doesn't have, so it uses ${match.definitionId}, the one record of that type named without your class (${classSuffix}).`
          : `Your file saved “${match.savedName}” as ${match.savedId}, which the game content doesn't have, so it uses ${match.definitionId}, which the matched record above it grants in its place.`,
      effect:
        "The character and its exports use the matched record. Check it's the one you meant.",
      ...(match.inventoryEntryId === undefined
        ? {}
        : {
            target: {
              kind: "inventory" as const,
              entryId: match.inventoryEntryId,
            },
          }),
    };
  });
}

/** "Power Encounter 3" reads as "level-3 encounter power slot". */
function slotPhrase(slotName: string | undefined, slotType: string): string {
  const power = /^power\s+(at-will|encounter|daily|utility)\s+(\d+)$/iu.exec(
    slotName?.trim() ?? "",
  );
  if (power !== null)
    return `level-${power[2]} ${power[1]?.toLocaleLowerCase()} power slot`;
  return slotName === undefined || slotName.trim() === ""
    ? `${slotType.trim().toLocaleLowerCase()} slot`
    : `“${slotName.trim()}” slot`;
}

/** A requires expression with each content ID shown as its record's name
 * ("ID_FMP_CLASS_2" reads "Cleric"). */
function readableRequires(
  requires: string,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  return requires
    .replace(
      /[A-Za-z][\w-]*_[\w-]+/gu,
      (token) => byId.get(token.toLocaleLowerCase())?.name ?? token,
    )
    .trim();
}

const PLUMBING_TYPES = new Set(["internal", "grants"]);

/**
 * Saved picks the evaluation holds dormant (D043): their slot's rule is
 * switched off for this character, by import or since (a content update,
 * a changed class). Each names the pick, its level and slot, and the record
 * that switches the slot off, with where that record comes from.
 */
export function dormantSelectionIssues(
  evaluation: EvaluatedCharacter | undefined,
  byId: ReadonlyMap<string, ContentEntity>,
  build?: CharacterBuild,
): BuilderIssue[] {
  if (evaluation?.dormantSelections === undefined) return [];
  const savedNames = savedOccurrenceNames(build);
  const occurrencesById = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const entityOf = (definitionId: string) =>
    byId.get(definitionId.toLocaleLowerCase());
  /** The nearest owner a player would recognise (Hunter, not its Grants). */
  const sourceName = (occurrenceId: string | undefined): string | undefined => {
    let current =
      occurrenceId === undefined
        ? undefined
        : occurrencesById.get(occurrenceId);
    while (current !== undefined) {
      const entity = entityOf(current.definitionId);
      if (
        entity !== undefined &&
        !PLUMBING_TYPES.has(entity.type.trim().toLocaleLowerCase()) &&
        entity.type.trim().toLocaleLowerCase() !== "level"
      )
        return entity.name;
      current =
        current.parentId === undefined
          ? undefined
          : occurrencesById.get(current.parentId);
    }
    return undefined;
  };
  return evaluation.dormantSelections.map((dormant) => {
    const { occurrence } = dormant;
    const entity = entityOf(occurrence.definitionId);
    const name =
      entityName(
        occurrence.definitionId,
        byId,
        savedNames.get(occurrence.id),
      ) ?? occurrence.definitionId;
    const blockers = [
      ...new Set(
        dormant.blockedBy.map((blocker) => {
          const blockerName =
            entityOf(blocker.definitionId)?.name ?? blocker.definitionId;
          const source = sourceName(blocker.parentId);
          return source === undefined
            ? blockerName
            : `${source}'s “${blockerName}”`;
        }),
      ),
    ];
    const reason =
      blockers.length === 0
        ? `it needs “${readableRequires(dormant.requires, byId)}”, which isn't met`
        : `${blockers.join(" and ")} ${blockers.length === 1 ? "switches" : "switch"} it off`;
    return {
      key: `inactive:${occurrence.id}`,
      kind: "inactive",
      title: entity === undefined ? name : `${name} (${entity.type})`,
      detail: `Saved at level ${occurrence.acquiredLevel} in the ${slotPhrase(dormant.slotName, dormant.slotType)}. This character doesn't have that slot: ${reason}.`,
      effect:
        "It stays saved and is kept on export, but adds nothing to the character. It comes back if the slot turns back on.",
      target: {
        kind: "level-section",
        level: occurrence.acquiredLevel,
        section: legacyChoiceSection({ type: dormant.slotType }),
      },
    };
  });
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
    notes: [
      ...groups.notes,
      ...issues.filter((issue) => issue.kind === "note"),
    ],
    inactive: [
      ...groups.inactive,
      ...issues.filter((issue) => issue.kind === "inactive"),
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
  build,
}: {
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly effectiveLevel: number;
  readonly planningHorizon: number;
  readonly abilityScoresIncomplete: boolean;
  readonly abilityScoresHouseRuled: boolean;
  /** The saved build: names for missing content and removable occurrences. */
  readonly build?: CharacterBuild;
}): BuilderIssueGroups {
  if (evaluation === undefined)
    return {
      unresolved: [],
      warnings: [],
      errors: [],
      houseRules: [],
      updates: [],
      notes: [],
      inactive: [],
    };
  const savedNames = savedOccurrenceNames(build);
  const label = (choice: EvaluatedChoice): string =>
    choiceLabel(choice, evaluation, byId, savedNames);
  const occurrenceName = (
    occurrence:
      { readonly id: string; readonly definitionId: string } | undefined,
  ): string | undefined =>
    occurrence === undefined
      ? undefined
      : entityName(
          occurrence.definitionId,
          byId,
          savedNames.get(occurrence.id),
        );

  const unresolved: BuilderIssue[] = evaluation.choices.flatMap((choice) =>
    choice.level <= effectiveLevel &&
    !choice.optional &&
    !isBuildPresetChoice(choice) &&
    choice.selectedOccurrenceId === undefined
      ? [
          {
            key: `choice:${choice.id}`,
            kind: "unresolved" as const,
            title: label(choice),
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
              ? (occurrenceName(occurrence) ?? "House rule")
              : label(choice),
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
          ? (occurrenceName(occurrence) ?? "House rule")
          : label(choice),
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
  // Legacy lists an equipped item whose Requirement is unmet as "custom
  // equipment" among the house rules.
  for (const diagnostic of evaluation.diagnostics)
    if (diagnostic.code === "item.requirement-unmet")
      houseRules.push({
        key: `house-rule:item-requirement:${diagnostic.message}`,
        kind: "house-rule",
        title: "Equipped item requirement",
        detail: diagnostic.message,
        effect:
          "The item stays equipped and its properties apply, but the character is marked as using house rules.",
      });
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
      diagnostic.code === "item.requirement-unmet" ||
      (diagnostic.occurrenceId !== undefined &&
        houseRuleOccurrenceIds.has(diagnostic.occurrenceId) &&
        ignoredHouseRuleDiagnostics.has(diagnostic.code)) ||
      diagnostic.severity === "info"
    )
      return [];
    // A saved child no slot holds is not any choice's selection; a choice it
    // provides itself is not what the warning is about.
    const unslotted = diagnostic.code === "occurrence.unslotted";
    const choice = unslotted
      ? undefined
      : choiceForDiagnostic(diagnostic, evaluation);
    const occurrence = evaluation.occurrences.find(
      (candidate) => candidate.id === diagnostic.occurrenceId,
    );
    const missingDefinition =
      diagnostic.code === "occurrence.missing-definition";
    // A holding's missing definitions are one character issue per holding
    // (missingHoldingContentIssues), equipped or not.
    if (
      missingDefinition &&
      build !== undefined &&
      occurrence?.kind === "inventory"
    )
      return [];
    const subject =
      choice === undefined ? occurrenceName(occurrence) : label(choice);
    const removable =
      (missingDefinition || unslotted) &&
      choice === undefined &&
      occurrence !== undefined &&
      isRemovableOccurrence(build, occurrence.id);
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
        detail:
          missingDefinition && occurrence !== undefined
            ? `${occurrenceName(occurrence) ?? occurrence.definitionId} isn't in the game content in use (${occurrence.definitionId}).`
            : diagnostic.message,
        effect: unslotted
          ? `It still applies and is kept on export.${removable ? " Remove it if it no longer belongs on the character." : ""}`
          : removable
            ? "The saved selection is preserved, but its mechanical benefits cannot be calculated without the missing definition. Remove it to drop it from the character and its exports."
            : diagnosticEffect(diagnostic),
        ...(removable ? { removal: { occurrenceId: occurrence.id } } : {}),
        ...(choice !== undefined
          ? {
              target: {
                kind: "choice" as const,
                choiceId: choice.id,
              },
            }
          : unslotted && occurrence !== undefined
            ? {
                target: {
                  kind: "level-section" as const,
                  level: occurrence.acquiredLevel,
                  section: legacyChoiceSection({
                    type:
                      byId.get(occurrence.definitionId.toLocaleLowerCase())
                        ?.type ?? "",
                  }),
                },
              }
            : {}),
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
            title: label(choice),
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
          title: label(choice),
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
    notes: [],
    inactive: [],
  };
}
