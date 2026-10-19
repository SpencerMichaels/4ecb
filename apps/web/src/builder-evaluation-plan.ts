import {
  isRulesInertTextKey,
  type CharacterBuild,
} from "@4ecb/character-domain";

import type { BuilderWorkspaceTab } from "./routes";

/**
 * True when two builds give rules evaluation the same input: they differ at
 * most in wallet amounts and free-text details/notes, which evaluation never
 * reads. Lets a text edit skip the evaluation round trip entirely.
 */
export function sameRulesInputs(
  previous: CharacterBuild,
  next: CharacterBuild,
): boolean {
  if (previous === next) return true;
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === "textStrings") continue;
    if (
      previous[key as keyof CharacterBuild] !==
      next[key as keyof CharacterBuild]
    )
      return false;
  }
  const textKeys = new Set([
    ...Object.keys(previous.textStrings),
    ...Object.keys(next.textStrings),
  ]);
  for (const key of textKeys)
    if (
      !isRulesInertTextKey(key) &&
      previous.textStrings[key] !== next.textStrings[key]
    )
      return false;
  return true;
}

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
  if (workspace === "build" || workspace === "retraining")
    return [selectedLevel];
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

export type EvaluationHorizonRole = "current" | "selected" | "planning";

/**
 * The rules worker processes requests in arrival order and evaluates each one
 * synchronously to completion, so a request dispatched first finishes first.
 * Lists which horizons need their own distinct evaluation request, ordered so
 * the visible current- and selected-level results are always dispatched
 * before the hidden planning evaluation the user is not looking at.
 */
export function evaluationDispatchOrder(
  currentLevel: number,
  selectedLevel: number,
  planningHorizon: number,
): readonly EvaluationHorizonRole[] {
  const roles: EvaluationHorizonRole[] = [];
  if (currentLevel !== planningHorizon) roles.push("current");
  if (selectedLevel !== planningHorizon && selectedLevel !== currentLevel)
    roles.push("selected");
  roles.push("planning");
  return roles;
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
