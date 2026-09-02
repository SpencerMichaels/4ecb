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

export interface GroupedLevelChoices {
  readonly backgrounds: readonly EvaluatedChoice[];
  readonly skillTraining: readonly EvaluatedChoice[];
  readonly ordinary: readonly EvaluatedChoice[];
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

export function choiceForSkillCandidate(
  choices: readonly EvaluatedChoice[],
  occupiedChoiceIds: ReadonlySet<string>,
  definitionId: string,
  showAll: boolean,
): EvaluatedChoice | undefined {
  return choices.find(
    (choice) =>
      !occupiedChoiceIds.has(choice.id) &&
      choice.candidates.some(
        (candidate) =>
          candidate.definitionId === definitionId &&
          isCandidateVisible(candidate, showAll),
      ),
  );
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
