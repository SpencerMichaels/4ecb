/**
 * The builder evaluates presentation-scoped requests (`builderEvaluationPlan`):
 * full candidate lists only for the levels and editors a tab shows. A scoped
 * request that leaves out data a visible editor needs shows as an empty
 * table, as every Build-tab power swap's "New power" step did until the
 * engine listed a level's own swap gains with its level (e0633d5d). This
 * module says what each tab shows and checks that the editor's scoped
 * evaluations give those editors (and every evaluation-derived view) what
 * the exhaustive, unscoped evaluation gives them. It is shared by the public
 * guard test (`builder-scoped-requests.test.ts`) and the private sweep
 * (`pnpm audit:scoped-requests`).
 */
import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  projectBuildForEvaluation,
  type CandidateDecision,
  type EvaluatedCharacter,
  type EvaluatedChoice,
  type EvaluationInput,
} from "@4ecb/rules-engine";

import { builderIssueGroups } from "./builder-diagnostics";
import {
  builderEvaluationPlan,
  builderRequestBuild,
  type BuilderEvaluationState,
  type EvaluationHorizonRole,
} from "./builder-evaluation-plan";
import { buildOverview } from "./build-overview";
import {
  buildTabChoices,
  choicesAtLevel,
  isCharacterDetailChoice,
  retrainingChoicesByLevel,
} from "./builder-ui";
import type { BuilderWorkspaceTab } from "./routes";

/** What a shown choice's editor lists. */
export type ShownChoiceList =
  /** Its candidate table. */
  | "candidates"
  /** Its replacement targets (step 1), without their gains. */
  | "targets"
  /** Its targets and each target's gains (step 2). */
  | "replacement-gains";

export interface ShownChoice {
  readonly choice: EvaluatedChoice;
  readonly list: ShownChoiceList;
  /** The evaluation the editor reads it from. */
  readonly role: EvaluationHorizonRole;
}

/** The evaluations an editor state publishes, by the role it reads. */
export interface BuilderEvaluations {
  readonly current: EvaluatedCharacter;
  readonly selected: EvaluatedCharacter;
  readonly planning: EvaluatedCharacter;
}

/**
 * The choices a tab shows with an option list, from the evaluations the
 * editor gives it: the Build tab's level rows (a replacement row lists its
 * targets and their gains; level 1's racial ability bonus is read from the
 * selected-level evaluation), the Details tab's gender, alignment and deity
 * at every level, and the Retraining tab's targets at every reached level,
 * with gains for the retrain whose editor is open. Inventory, Loadout, Shop,
 * Overview and the issue pages show no evaluated option list (item-owned
 * choices list content, `itemChoicePages`), only views derived from the
 * evaluations, which `scopedRequestGaps` compares whole.
 */
export function shownChoices(
  workspace: BuilderWorkspaceTab,
  evaluations: BuilderEvaluations,
  state: Pick<
    BuilderEvaluationState,
    "selectedLevel" | "currentLevel" | "expandedReplacementChoiceId"
  >,
): readonly ShownChoice[] {
  const { planning, selected } = evaluations;
  const replacementList = (choice: EvaluatedChoice): ShownChoiceList =>
    choice.replacementOptions === undefined
      ? "candidates"
      : "replacement-gains";
  switch (workspace) {
    case "build": {
      const rows = buildTabChoices(
        choicesAtLevel(state.selectedLevel, planning),
      ).map((choice): ShownChoice => ({
        choice,
        list: replacementList(choice),
        role: "planning",
      }));
      const raceAbility =
        state.selectedLevel === 1
          ? choicesAtLevel(1, selected)
              .filter(
                (choice) =>
                  choice.type.trim().toLocaleLowerCase() ===
                  "race ability bonus",
              )
              .slice(0, 1)
              .map((choice): ShownChoice => ({
                choice,
                list: "candidates",
                role: "selected",
              }))
          : [];
      return [...rows, ...raceAbility];
    }
    case "details":
      return planning.choices.filter(isCharacterDetailChoice).map((choice) => ({
        choice,
        list: "candidates",
        role: "planning",
      }));
    case "retraining":
      return [
        ...retrainingChoicesByLevel(planning, state.currentLevel).values(),
      ]
        .flat()
        .map((choice) => ({
          choice,
          list:
            choice.id === state.expandedReplacementChoiceId
              ? "replacement-gains"
              : "targets",
          role: "planning",
        }));
    default:
      return [];
  }
}

/** One way a scoped evaluation fails a tab. */
export interface ScopedRequestGap {
  readonly workspace: BuilderWorkspaceTab;
  readonly selectedLevel: number;
  /** "candidates", "targets", "replacement-gains", "overview", "issues",
   *  "choices" (the choice list itself) or "evaluation" (totals). */
  readonly kind: string;
  readonly choiceId?: string;
  readonly choiceType?: string;
  readonly detail: string;
}

/** A candidate as an option table shows it. Scoped lists leave out the
 *  category mismatches the editor hides (`isCandidateVisible`). */
function listedCandidates(
  candidates: readonly CandidateDecision[],
): ReadonlyMap<string, string> {
  return new Map(
    candidates
      .filter(({ reasons }) => !reasons.includes("category"))
      .map((candidate) => [
        candidate.definitionId.toLocaleLowerCase(),
        JSON.stringify([
          candidate.eligible,
          candidate.rulesLegal,
          candidate.sourceEntitled,
          [...candidate.reasons].sort(),
        ]),
      ]),
  );
}

function compareCandidates(
  scoped: readonly CandidateDecision[],
  exhaustive: readonly CandidateDecision[],
): string | undefined {
  const got = listedCandidates(scoped);
  const want = listedCandidates(exhaustive);
  const missing = [...want.keys()].filter((id) => !got.has(id));
  const extra = [...got.keys()].filter((id) => !want.has(id));
  const changed = [...want.keys()].filter(
    (id) => got.has(id) && got.get(id) !== want.get(id),
  );
  if (missing.length + extra.length + changed.length === 0) return undefined;
  const sample = (ids: readonly string[]) =>
    ids.slice(0, 3).join(", ") + (ids.length > 3 ? ", …" : "");
  return [
    missing.length === 0
      ? undefined
      : `${missing.length} of ${want.size} missing (${sample(missing)})`,
    extra.length === 0 ? undefined : `${extra.length} extra (${sample(extra)})`,
    changed.length === 0
      ? undefined
      : `${changed.length} differ (${sample(changed)}: ${got.get(changed[0]!)} vs ${want.get(changed[0]!)})`,
  ]
    .filter((part) => part !== undefined)
    .join("; ");
}

function choiceGaps(
  shown: ShownChoice,
  exhaustive: EvaluatedCharacter,
): readonly Omit<ScopedRequestGap, "workspace" | "selectedLevel">[] {
  const { choice, list } = shown;
  const base = { choiceId: choice.id, choiceType: choice.type };
  const want = exhaustive.choices.find(({ id }) => id === choice.id);
  if (want === undefined)
    return [{ ...base, kind: "choices", detail: "absent unscoped" }];
  if (list === "candidates") {
    const detail = compareCandidates(choice.candidates, want.candidates);
    return detail === undefined ? [] : [{ ...base, kind: list, detail }];
  }
  const gaps: Omit<ScopedRequestGap, "workspace" | "selectedLevel">[] = [];
  const targets = (value: EvaluatedChoice) =>
    (value.replacementOptions ?? [])
      .map(({ replacesOccurrenceId, targetReasons }) =>
        JSON.stringify([replacesOccurrenceId, targetReasons ?? []]),
      )
      .sort()
      .join(" ");
  if (targets(choice) !== targets(want))
    gaps.push({
      ...base,
      kind: "targets",
      detail: `${choice.replacementOptions?.length ?? 0} targets vs ${want.replacementOptions?.length ?? 0}`,
    });
  if (list === "replacement-gains")
    for (const option of want.replacementOptions ?? []) {
      const scoped = choice.replacementOptions?.find(
        ({ replacesOccurrenceId }) =>
          replacesOccurrenceId === option.replacesOccurrenceId,
      );
      if (scoped === undefined) continue;
      const detail = compareCandidates(scoped.candidates, option.candidates);
      if (detail !== undefined)
        gaps.push({
          ...base,
          kind: "replacement-gains",
          detail: `${option.definitionId}: ${detail}`,
        });
    }
  return gaps;
}

/** What evaluation decides beyond option lists: a scoped request may list
 *  fewer options, never change these. */
function evaluationFacts(evaluation: EvaluatedCharacter): string {
  return JSON.stringify({
    choices: evaluation.choices
      .map(({ id, selectedOccurrenceId }) => [id, selectedOccurrenceId ?? ""])
      .sort(),
    occurrences: evaluation.occurrences.map(({ id }) => id).sort(),
    diagnostics: evaluation.diagnostics
      .map((diagnostic) => JSON.stringify(diagnostic))
      .sort(),
    stats: evaluation.stats,
  });
}

export interface ScopedRequestCheck {
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly state: BuilderEvaluationState;
  /** Evaluates one input (memoize it: unscoped inputs repeat). */
  readonly evaluate: (input: EvaluationInput) => EvaluatedCharacter;
}

/** The evaluations the editor publishes for a state, as `CharacterEditorPage`
 *  requests them. */
export function builderEvaluations(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
  state: BuilderEvaluationState,
  evaluate: (input: EvaluationInput) => EvaluatedCharacter,
  scoped = true,
): BuilderEvaluations {
  const plan = builderEvaluationPlan(state);
  const byRole = new Map<EvaluationHorizonRole, EvaluatedCharacter>();
  for (const request of plan.requests) {
    const input = projectBuildForEvaluation(
      builderRequestBuild(build, request),
      entities,
    );
    byRole.set(
      request.role,
      evaluate(
        scoped
          ? {
              ...input,
              candidateDetailLevels: request.candidateDetailLevels,
              ...(request.candidateDetailReplacementChoiceIds === undefined
                ? {}
                : {
                    candidateDetailReplacementChoiceIds:
                      request.candidateDetailReplacementChoiceIds,
                  }),
              includePowers: false,
            }
          : { ...input, includePowers: false },
      ),
    );
  }
  const planning = byRole.get("planning")!;
  return {
    planning,
    current: byRole.get(plan.current) ?? planning,
    selected: byRole.get(plan.selected) ?? planning,
  };
}

/**
 * Where the editor's scoped evaluations for `state` give a tab less (or
 * other) than the unscoped evaluation of the same horizons: a shown
 * choice's option list, replacement targets or gains, the Overview, the
 * issue pages, or any non-presentation fact.
 */
export function scopedRequestGaps(
  check: ScopedRequestCheck,
): readonly ScopedRequestGap[] {
  const { build, entities, byId, state, evaluate } = check;
  const scoped = builderEvaluations(build, entities, state, evaluate);
  const exhaustive = builderEvaluations(
    build,
    entities,
    state,
    evaluate,
    false,
  );
  const where = {
    workspace: state.workspace,
    selectedLevel: state.selectedLevel,
  };
  const gaps: ScopedRequestGap[] = [];
  for (const role of ["current", "selected", "planning"] as const)
    if (evaluationFacts(scoped[role]) !== evaluationFacts(exhaustive[role]))
      gaps.push({ ...where, kind: "evaluation", detail: `${role} differs` });
  for (const shown of shownChoices(state.workspace, scoped, state))
    for (const gap of choiceGaps(shown, exhaustive[shown.role]))
      gaps.push({ ...where, ...gap });
  if (state.workspace === "overview") {
    const rows = (evaluation: EvaluatedCharacter) =>
      buildOverview(evaluation, build, byId).flatMap(({ level, groups }) =>
        groups.flatMap(({ title: group, rows: groupRows }) =>
          groupRows.map(
            (row, position) =>
              [
                `L${level} ${group} #${position + 1}`,
                JSON.stringify(row),
              ] as const,
          ),
        ),
      );
    const got = new Map(rows(scoped.planning));
    const want = rows(exhaustive.planning);
    for (const [at, row] of want)
      if (got.get(at) !== row)
        gaps.push({
          ...where,
          kind: "overview",
          detail: `${at}: ${got.get(at) ?? "missing"} vs ${row}`,
        });
    if (got.size !== want.length)
      gaps.push({
        ...where,
        kind: "overview",
        detail: `${got.size} rows vs ${want.length}`,
      });
  }
  // Every tab's status badges and issue pages read the planning evaluation.
  const issues = (evaluation: EvaluatedCharacter) =>
    builderIssueGroups({
      evaluation,
      byId,
      effectiveLevel: build.effectiveLevel,
      planningHorizon: state.planningHorizon,
      abilityScoresIncomplete: false,
      abilityScoresHouseRuled: false,
      build,
    });
  const got = issues(scoped.planning);
  const want = issues(exhaustive.planning);
  for (const group of Object.keys(want) as (keyof typeof want)[]) {
    const gotKeys = new Map(got[group].map((issue) => [issue.key, issue]));
    for (const issue of want[group]) {
      const other = gotKeys.get(issue.key);
      if (JSON.stringify(other) !== JSON.stringify(issue))
        gaps.push({
          ...where,
          kind: "issues",
          detail: `${group} ${issue.key}: ${other === undefined ? "missing" : `"${other.title} / ${other.detail}" vs "${issue.title} / ${issue.detail}"`}`,
        });
    }
    if (got[group].length !== want[group].length)
      gaps.push({
        ...where,
        kind: "issues",
        detail: `${group}: ${got[group].length} vs ${want[group].length}`,
      });
  }
  return gaps;
}
