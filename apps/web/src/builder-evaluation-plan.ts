import {
  isRulesInertTextKey,
  type CharacterBuild,
} from "@4ecb/character-domain";
import { projectBuildForLegacyExport } from "@4ecb/legacy-dnd4e";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { isCharacterDetailChoice } from "./builder-ui";
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
 * synchronously to completion, so a request dispatched first finishes first
 * (requests a later edit superseded are dropped from its queue unstarted).
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

/** What the editor's evaluation requests depend on. */
export interface BuilderEvaluationState {
  readonly workspace: BuilderWorkspaceTab;
  /** The build's effective level. */
  readonly currentLevel: number;
  /** The level the Build or Retraining tab shows. */
  readonly selectedLevel: number;
  /** `planningEvaluationHorizon(build, selectedLevel)`. */
  readonly planningHorizon: number;
  /** `characterDetailLevels` of the last planning evaluation. */
  readonly characterDetailLevels: readonly number[];
  /** The retraining choice whose editor is open (its gains are listed). */
  readonly expandedReplacementChoiceId?: string | undefined;
}

/** One evaluation the editor asks the rules worker for (beside the build's
 *  own input and `includePowers: false`). */
export interface BuilderEvaluationRequest {
  readonly role: EvaluationHorizonRole;
  /** The evaluated build's effective level. */
  readonly level: number;
  readonly candidateDetailLevels: readonly number[];
  readonly candidateDetailReplacementChoiceIds?: readonly string[];
}

/**
 * The editor's evaluation requests for one state, in dispatch order, and
 * which request each of its evaluations reads: `current` (the sidebar,
 * Inventory, Loadout and Shop), `selected` (the Build tab's level-local
 * controls) and `planning` (every tab's choices, Overview and the issues).
 * A horizon with no request of its own reads the one it coincides with.
 * The single source for `CharacterEditorPage` and the scoped-request checks
 * (`builder-scoped-requests.test.ts`, `audit:scoped-requests`).
 */
export interface BuilderEvaluationPlan {
  readonly requests: readonly BuilderEvaluationRequest[];
  readonly current: EvaluationHorizonRole;
  readonly selected: EvaluationHorizonRole;
}

export function builderEvaluationPlan(
  state: BuilderEvaluationState,
): BuilderEvaluationPlan {
  const {
    workspace,
    currentLevel,
    selectedLevel,
    planningHorizon,
    characterDetailLevels,
    expandedReplacementChoiceId,
  } = state;
  const order = evaluationDispatchOrder(
    currentLevel,
    selectedLevel,
    planningHorizon,
  );
  const requests = order.map((role): BuilderEvaluationRequest => {
    switch (role) {
      case "current":
        return {
          role,
          level: currentLevel,
          candidateDetailLevels: currentCandidateDetailLevels(
            workspace,
            currentLevel,
            selectedLevel,
          ),
        };
      case "selected":
        return {
          role,
          level: selectedLevel,
          candidateDetailLevels: selectedCandidateDetailLevels(
            workspace,
            selectedLevel,
          ),
        };
      case "planning":
        return {
          role,
          level: planningHorizon,
          candidateDetailLevels: planningCandidateDetailLevels(
            workspace,
            selectedLevel,
            characterDetailLevels,
          ),
          candidateDetailReplacementChoiceIds:
            expandedReplacementChoiceId === undefined
              ? []
              : [expandedReplacementChoiceId],
        };
    }
  });
  const current: EvaluationHorizonRole = order.includes("current")
    ? "current"
    : "planning";
  const selected: EvaluationHorizonRole = order.includes("selected")
    ? "selected"
    : selectedLevel === currentLevel
      ? current
      : "planning";
  return { requests, current, selected };
}

/** The build a request evaluates: the current horizon as legacy export
 *  projects it (no future choices), the others at their level. */
export function builderRequestBuild(
  build: CharacterBuild,
  request: BuilderEvaluationRequest,
): CharacterBuild {
  return request.role === "current"
    ? projectBuildForLegacyExport(build)
    : { ...build, effectiveLevel: request.level };
}

/** The levels holding a Details-tab choice (gender, alignment, deity). */
export function characterDetailLevels(
  evaluation: EvaluatedCharacter | undefined,
): readonly number[] {
  return uniqueLevels(
    (evaluation?.choices ?? [])
      .filter(isCharacterDetailChoice)
      .map((choice) => choice.level),
  );
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
