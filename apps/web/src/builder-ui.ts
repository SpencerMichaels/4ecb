import type { CharacterBuild, CharacterCommand } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { findBuildChildIndex } from "@4ecb/rules-engine";
import type {
  CandidateDecision,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";

import { createLevelFrame } from "./new-character";

export function choiceLevel(choice: EvaluatedChoice): number {
  return choice.level;
}

export function choicesAtLevel(
  level: number,
  evaluation: EvaluatedCharacter | undefined,
): readonly EvaluatedChoice[] {
  return (
    evaluation?.choices.filter(
      (choice) =>
        choiceLevel(choice) === level &&
        evaluation.occurrences.find(
          (occurrence) => occurrence.id === choice.providerOccurrenceId,
        )?.kind !== "inventory",
    ) ?? []
  );
}

export function isUnresolvedChoice(choice: EvaluatedChoice): boolean {
  return !choice.optional && choice.selectedOccurrenceId === undefined;
}

export function isOptionalRetrainingChoice(choice: EvaluatedChoice): boolean {
  return (
    choice.type === "Replacement" &&
    choice.optional &&
    (choice.name === undefined || choice.name.trim() === "")
  );
}

export function isCharacterDetailChoice(choice: EvaluatedChoice): boolean {
  return ["gender", "alignment", "deity"].includes(
    choice.type.trim().toLocaleLowerCase(),
  );
}

export function choicePresentationLabel(label: string): string {
  const concise = label.trim().replace(/^Choose\s+/i, "");
  const power = /^Power\s+(At-Will|Encounter|Daily|Utility)(?:\s+\d+)?$/i.exec(
    concise,
  );
  if (power !== null) {
    const usage = power[1]!.toLocaleLowerCase();
    const displayUsage =
      usage === "at-will"
        ? "At-Will"
        : `${usage[0]!.toLocaleUpperCase()}${usage.slice(1)}`;
    return `${displayUsage} Power`;
  }
  if (/^Ability Increase(?:\s*\(Level\s+\d+\))?$/i.test(concise))
    return "Ability Score Increase";
  return concise.replace(/\s+Choice$/i, "");
}

export function identityChoiceLabel(type: string): string | undefined {
  return ["class", "hybrid class", "race"].includes(
    type.trim().toLocaleLowerCase(),
  )
    ? choicePresentationLabel(type)
    : undefined;
}

export function selectedChoiceHasWarning(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
): boolean {
  const selected =
    choice.selectedOccurrenceId === undefined
      ? undefined
      : evaluation.occurrences.find(
          (occurrence) => occurrence.id === choice.selectedOccurrenceId,
        );
  if (selected === undefined) return false;
  if (selected.legality === "houserule") return true;
  const decisions =
    choice.type === "Replacement"
      ? ((choice.replacementOptions ?? []).find(
          (option) => option.replacesOccurrenceId === selected.replacesId,
        )?.candidates ?? [])
      : choice.candidates;
  return decisions.some(
    (candidate) =>
      candidate.definitionId === selected.definitionId && !candidate.eligible,
  );
}

export function planningHorizonCommand(
  build: CharacterBuild,
  targetLevel: number,
  entities: readonly ContentEntity[],
  occurrenceId: (level: number) => string,
): CharacterCommand | undefined {
  if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 30)
    throw new Error("Planning horizons must be integers from 1 through 30");
  if (targetLevel <= build.levels.length) return undefined;
  return {
    kind: "batch",
    commands: [
      ...Array.from(
        { length: targetLevel - build.levels.length },
        (_, index) => {
          const level = build.levels.length + index + 1;
          return {
            kind: "add-level" as const,
            frame: createLevelFrame(level, entities, occurrenceId(level)),
          };
        },
      ),
      { kind: "set-effective-level", level: build.effectiveLevel },
    ],
  };
}

export function candidateReason(reasons: readonly string[]): string {
  if (reasons.length === 0) return "Available";
  const labels: Readonly<Record<string, string>> = {
    category: "Does not match this choice category",
    prerequisite: "Does not meet prerequisites",
    self: "A feature cannot select itself",
  };
  return reasons.map((reason) => labels[reason] ?? reason).join("; ");
}

export function isCandidateVisible(
  candidate: CandidateDecision,
  showAll: boolean,
  selectedDefinitionId?: string,
): boolean {
  if (candidate.reasons.includes("category")) return false;
  return (
    showAll ||
    candidate.eligible ||
    candidate.definitionId === selectedDefinitionId
  );
}

export interface CandidatePresentationOption {
  readonly candidate: CandidateDecision;
  readonly label: string;
}

export interface CandidatePresentationGroup {
  readonly key: string;
  readonly label: string;
  readonly parameterLabel?: string;
  readonly options: readonly CandidatePresentationOption[];
}

function parentheticalName(
  name: string,
): { readonly base: string; readonly variant: string } | undefined {
  const open = name.indexOf(" (");
  return open <= 0 || !name.endsWith(")")
    ? undefined
    : { base: name.slice(0, open), variant: name.slice(open + 2, -1) };
}

export function groupParameterizedCandidates(
  candidates: readonly CandidateDecision[],
  nameFor: (definitionId: string) => string,
  minimumFamilySize = 4,
): readonly CandidatePresentationGroup[] {
  const parsed = candidates.map((candidate) => ({
    candidate,
    name: nameFor(candidate.definitionId),
    parsed: parentheticalName(nameFor(candidate.definitionId)),
  }));
  const familyCounts = new Map<string, number>();
  for (const item of parsed)
    if (item.parsed !== undefined)
      familyCounts.set(
        item.parsed.base,
        (familyCounts.get(item.parsed.base) ?? 0) + 1,
      );
  const groups: CandidatePresentationGroup[] = [];
  const familyGroups = new Map<string, number>();
  for (const item of parsed) {
    const family =
      item.parsed !== undefined &&
      (familyCounts.get(item.parsed.base) ?? 0) >= minimumFamilySize
        ? item.parsed
        : undefined;
    if (family === undefined) {
      groups.push({
        key: `candidate:${item.candidate.definitionId}`,
        label: item.name,
        options: [{ candidate: item.candidate, label: item.name }],
      });
      continue;
    }
    const existing = familyGroups.get(family.base);
    if (existing === undefined) {
      familyGroups.set(family.base, groups.length);
      groups.push({
        key: `family:${family.base}`,
        label: family.base,
        parameterLabel:
          family.base === "Weapon Proficiency"
            ? "Weapon type"
            : family.base === "Superior Implement Training"
              ? "Implement type"
              : "Option",
        options: [{ candidate: item.candidate, label: family.variant }],
      });
    } else {
      const group = groups[existing]!;
      groups[existing] = {
        ...group,
        options: [
          ...group.options,
          { candidate: item.candidate, label: family.variant },
        ],
      };
    }
  }
  return groups;
}

export function groupBackgroundChoiceCandidates(
  candidates: readonly CandidateDecision[],
  nameFor: (definitionId: string) => string,
): readonly CandidatePresentationGroup[] {
  const definitions = [
    {
      key: "skill-plus-two",
      label: "+2 to a skill",
      parameterLabel: "Skill",
      match: (name: string) => /^\+2 to /i.test(name),
      optionLabel: (name: string) => name.replace(/^\+2 to /i, ""),
    },
    {
      key: "class-skill",
      label: "Add a class skill",
      parameterLabel: "Skill",
      match: (name: string) => / class skill$/i.test(name),
      optionLabel: (name: string) => name.replace(/ class skill$/i, ""),
    },
    {
      key: "language",
      label: "Language",
      parameterLabel: "Language",
      match: (name: string) => /^Learn /i.test(name),
      optionLabel: (name: string) => name.replace(/^Learn /i, ""),
    },
    {
      key: "benefit",
      label: "Background benefit",
      parameterLabel: "Benefit",
      match: (name: string) => / Benefit$/i.test(name),
      optionLabel: (name: string) => name.replace(/ Benefit$/i, ""),
    },
  ] as const;
  const groups = new Map<string, CandidatePresentationGroup>();
  for (const candidate of candidates) {
    const name = nameFor(candidate.definitionId);
    const definition = definitions.find(({ match }) => match(name)) ?? {
      key: "other",
      label: "Other",
      parameterLabel: "Option",
      optionLabel: (value: string) => value,
    };
    const option = { candidate, label: definition.optionLabel(name) };
    const existing = groups.get(definition.key);
    groups.set(
      definition.key,
      existing === undefined
        ? {
            key: `background:${definition.key}`,
            label: definition.label,
            parameterLabel: definition.parameterLabel,
            options: [option],
          }
        : { ...existing, options: [...existing.options, option] },
    );
  }
  return [...groups.values()];
}

export interface GroupedLevelChoices {
  readonly backgrounds: readonly EvaluatedChoice[];
  readonly skillTraining: readonly EvaluatedChoice[];
  readonly ordinary: readonly EvaluatedChoice[];
}

export type LegacyChoiceSection =
  | "Class"
  | "Race"
  | "Background"
  | "Ability Scores"
  | "Skills"
  | "Powers"
  | "Spellbook"
  | "Feats"
  | "Character Details"
  | "Other";

const legacySectionOrder: readonly LegacyChoiceSection[] = [
  "Class",
  "Race",
  "Background",
  "Ability Scores",
  "Skills",
  "Powers",
  "Spellbook",
  "Feats",
  "Character Details",
  "Other",
];

/**
 * Recreate the legacy builder's familiar wizard-pane order while retaining
 * the rules engine's exact choices. This is deliberately a presentation-only
 * classification: no choice is merged or re-parented.
 */
export function legacyChoiceSection(
  choice: EvaluatedChoice,
): LegacyChoiceSection {
  const type = choice.type.trim().toLocaleLowerCase();
  if (
    [
      "class",
      "hybrid class",
      "class build",
      "class feature",
      "trait package",
      "proficiency",
      "god fragment",
      "magic item",
      "paragon path",
      "epic destiny",
    ].includes(type)
  )
    return "Class";
  if (
    type === "race" ||
    type === "racial trait" ||
    type === "race ability bonus" ||
    type === "language"
  )
    return "Race";
  if (type === "background" || type === "background choice" || type === "theme")
    return "Background";
  if (type.includes("ability score") || type.startsWith("ability increase"))
    return "Ability Scores";
  if (type === "skill" || type === "skill training") return "Skills";
  if (type === "spellbook") return "Spellbook";
  if (type === "power" || type.startsWith("power ")) return "Powers";
  if (type === "feat") return "Feats";
  if (["gender", "alignment", "deity"].includes(type))
    return "Character Details";
  return "Other";
}

export interface LegacyChoiceSectionGroup {
  readonly section: LegacyChoiceSection;
  readonly choices: readonly EvaluatedChoice[];
}

function legacyChoiceTypeRank(choice: EvaluatedChoice): number {
  const type = choice.type.trim().toLocaleLowerCase();
  const description = `${type} ${choice.name ?? ""}`.toLocaleLowerCase();
  const exactOrder = [
    "class",
    "hybrid class",
    "class build",
    "class feature",
    "trait package",
    "proficiency",
    "god fragment",
    "magic item",
    "paragon path",
    "epic destiny",
    "race",
    "racial trait",
    "race ability bonus",
    "language",
    "background",
    "background choice",
    "theme",
    "gender",
    "alignment",
    "deity",
  ];
  const rank = exactOrder.indexOf(type);
  if (rank >= 0) return rank;
  if (description.includes("at-will")) return 100;
  if (description.includes("encounter")) return 101;
  if (description.includes("daily")) return 102;
  if (description.includes("utility")) return 103;
  if (type === "power") return 100;
  return 50;
}

export function groupChoicesByLegacyWorkflow(
  choices: readonly EvaluatedChoice[],
): readonly LegacyChoiceSectionGroup[] {
  const grouped = new Map<LegacyChoiceSection, EvaluatedChoice[]>();
  for (const choice of choices) {
    const section = legacyChoiceSection(choice);
    grouped.set(section, [...(grouped.get(section) ?? []), choice]);
  }
  return legacySectionOrder.flatMap((section) => {
    const sectionChoices = grouped.get(section);
    return sectionChoices === undefined
      ? []
      : [
          {
            section,
            choices: sectionChoices
              .map((choice, index) => ({ choice, index }))
              .sort(
                (left, right) =>
                  legacyChoiceTypeRank(left.choice) -
                    legacyChoiceTypeRank(right.choice) ||
                  left.index - right.index,
              )
              .map(({ choice }) => choice),
          },
        ];
  });
}

/**
 * Keep rules-engine choices exact while presenting choices created by the
 * preceding selection as one progressive decision. For example, a feat that
 * grants a mastery choice and that mastery's power replacement should read as
 * one flow rather than three unrelated cards.
 */
export function groupDependentChoiceFlows(
  choices: readonly EvaluatedChoice[],
): readonly (readonly EvaluatedChoice[])[] {
  const choiceBySelectedOccurrence = new Map(
    choices.flatMap((choice) =>
      choice.selectedOccurrenceId === undefined
        ? []
        : [[choice.selectedOccurrenceId, choice] as const],
    ),
  );
  const children = new Map<string, EvaluatedChoice[]>();
  const roots: EvaluatedChoice[] = [];
  for (const choice of choices) {
    const parent = choiceBySelectedOccurrence.get(choice.providerOccurrenceId);
    if (parent === undefined || parent.id === choice.id) roots.push(choice);
    else children.set(parent.id, [...(children.get(parent.id) ?? []), choice]);
  }
  const visited = new Set<string>();
  const collect = (root: EvaluatedChoice): EvaluatedChoice[] => {
    if (visited.has(root.id)) return [];
    visited.add(root.id);
    return [
      root,
      ...(children.get(root.id) ?? []).flatMap((child) => collect(child)),
    ];
  };
  const flows = roots.map(collect).filter((flow) => flow.length > 0);
  for (const choice of choices)
    if (!visited.has(choice.id)) flows.push(collect(choice));
  return flows;
}

/** Group positional slots emitted by one select rule without merging them. */
export function groupRepeatedChoiceSlots(
  choices: readonly EvaluatedChoice[],
): readonly (readonly EvaluatedChoice[])[] {
  const groups = new Map<string, EvaluatedChoice[]>();
  for (const choice of choices) {
    const key = [
      choice.level,
      choice.providerOccurrenceId,
      choice.ruleOrdinal,
      choice.type,
      choice.name,
    ].join("\0");
    groups.set(key, [...(groups.get(key) ?? []), choice]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function groupLevelChoices(
  choices: readonly EvaluatedChoice[],
): GroupedLevelChoices {
  const backgrounds: EvaluatedChoice[] = [];
  const skillTraining: EvaluatedChoice[] = [];
  const ordinary: EvaluatedChoice[] = [];
  for (const choice of choices) {
    const type = choice.type.trim().toLocaleLowerCase();
    if (type === "background") backgrounds.push(choice);
    else if (type === "skill training") skillTraining.push(choice);
    else ordinary.push(choice);
  }
  return { backgrounds, skillTraining, ordinary };
}

export function selectedDefinitionId(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
): string | undefined {
  if (choice.selectedOccurrenceId === undefined) return undefined;
  return evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.selectedOccurrenceId,
  )?.definitionId;
}

export function choiceForRepeatedCandidate(
  choices: readonly EvaluatedChoice[],
  occupiedChoiceIds: ReadonlySet<string>,
  definitionId: string,
  showAll: boolean,
  replaceFilledSingleChoice = false,
): EvaluatedChoice | undefined {
  const available = choices.find(
    (choice) =>
      !occupiedChoiceIds.has(choice.id) &&
      choice.candidates.some(
        (candidate) =>
          candidate.definitionId === definitionId &&
          isCandidateVisible(candidate, showAll),
      ),
  );
  if (available !== undefined) return available;
  if (!replaceFilledSingleChoice || choices.length !== 1) return undefined;
  const choice = choices[0]!;
  return choice.candidates.some(
    (candidate) =>
      candidate.definitionId === definitionId &&
      isCandidateVisible(candidate, showAll),
  )
    ? choice
    : undefined;
}

export interface RepeatedCandidateScope {
  readonly key: string;
  readonly choices: readonly EvaluatedChoice[];
  readonly candidateIds: readonly string[];
}

export function groupRepeatedCandidateScopes(
  choices: readonly EvaluatedChoice[],
): readonly RepeatedCandidateScope[] {
  const groups = new Map<string, RepeatedCandidateScope>();
  for (const choice of choices) {
    const candidateIds = [
      ...new Set(
        choice.candidates
          .filter((candidate) => !candidate.reasons.includes("category"))
          .map((candidate) => candidate.definitionId),
      ),
    ];
    const signature = `${choice.providerOccurrenceId}\0${[...candidateIds]
      .sort((left, right) => left.localeCompare(right))
      .join("\0")}`;
    const existing = groups.get(signature);
    groups.set(
      signature,
      existing === undefined
        ? { key: signature, choices: [choice], candidateIds }
        : { ...existing, choices: [...existing.choices, choice] },
    );
  }
  return [...groups.values()];
}

export function unresolveEvaluatedChoiceCommand(
  build: CharacterBuild,
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
  entities: readonly ContentEntity[],
  occurrenceId: string,
): CharacterCommand | undefined {
  const visit = (
    occurrence: CharacterBuild["levels"][number]["root"],
  ): CharacterBuild["levels"][number]["root"] | undefined =>
    occurrence.id === choice.providerOccurrenceId
      ? occurrence
      : occurrence.children.map(visit).find((value) => value !== undefined);
  const provider = [
    ...build.levels.map((frame) => frame.root),
    ...build.grabbag,
  ]
    .map(visit)
    .find((value) => value !== undefined);
  if (provider === undefined) return undefined;
  const evaluatedProvider = evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  const providerEntity = entities.find(
    (entity) =>
      entity.id.toLocaleLowerCase() ===
      evaluatedProvider?.definitionId.toLocaleLowerCase(),
  );
  return {
    kind: "choose",
    parentId: provider.id,
    index: findBuildChildIndex(
      provider,
      providerEntity,
      choice.ruleOrdinal,
      choice.index,
    ),
    occurrence: {
      id: occurrenceId,
      identity: { name: "", type: "" },
      acquiredLevel: provider.acquiredLevel,
      legality: "rules-legal",
      children: [],
      unresolved: true,
    },
  };
}
