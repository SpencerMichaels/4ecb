import type { CharacterBuild, CharacterCommand } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
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
