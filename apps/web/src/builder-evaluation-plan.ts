import type { BuilderWorkspaceTab } from "./routes";

function uniqueLevels(levels: readonly number[]): readonly number[] {
  return [...new Set(levels)].sort((left, right) => left - right);
}

/**
 * Full candidate lists are presentation data. Request them only for the
 * workspace that can currently offer those choices.
 */
export function planningCandidateDetailLevels(
  workspace: BuilderWorkspaceTab,
  selectedLevel: number,
  characterDetailLevels: readonly number[],
): readonly number[] {
  if (workspace === "build") return [selectedLevel];
  if (workspace === "details")
    return uniqueLevels([selectedLevel, ...characterDetailLevels]);
  return [];
}

/** A separate historical Build evaluation still backs level-local controls. */
export function selectedCandidateDetailLevels(
  workspace: BuilderWorkspaceTab,
  selectedLevel: number,
): readonly number[] {
  return workspace === "build" ? [selectedLevel] : [];
}

/** The current horizon can also be the visible historical Build horizon. */
export function currentCandidateDetailLevels(
  workspace: BuilderWorkspaceTab,
  currentLevel: number,
  selectedLevel: number,
): readonly number[] {
  return workspace === "build" && currentLevel === selectedLevel
    ? [selectedLevel]
    : [];
}

/** Publish each completed horizon without waiting for sibling evaluations. */
export async function publishEvaluationResult<Result>(
  request: Promise<Result>,
  isCurrent: () => boolean,
  publish: (result: Result) => void,
  onFirstPublished?: (result: Result) => void,
): Promise<Result> {
  const result = await request;
  if (isCurrent()) {
    publish(result);
    onFirstPublished?.(result);
  }
  return result;
}
