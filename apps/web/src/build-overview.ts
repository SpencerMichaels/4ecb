import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  ABILITY_SCORE_NAMES,
  assessAbilityPointBuy,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";
import { classifyPowerEntity } from "@4ecb/sheet-model";

import { abilityAbbreviation } from "./ability-abbreviations";
import type { BuilderIssueTarget } from "./builder-diagnostics";
import {
  abilityScoreAdjustment,
  choicesAtLevel,
  contextualChoiceTitle,
  isAbilityIncreaseChoiceType,
  isBuildPresetChoice,
  isCharacterDetailChoice,
  isOptionalRetrainingChoice,
  isRequiredClassDeityChoice,
  isUnresolvedChoice,
  levelChoiceSections,
  presentationUnit,
  presentationUnitPicks,
  presentationUnitStatus,
  presentationUnitTitle,
  presentLevelChoices,
  primaryLevelBuildChoices,
  replacementPickSummary,
  selectedDefinitionId,
  type LegacyChoiceSection,
  type LevelChoicePresentation,
} from "./builder-ui";
import type { ChoiceAccordionStatus } from "./ChoiceAccordionItem";

/**
 * The build overview (D113): every choice the character has made, one
 * section per level, built from the same evaluated choices, units, titles
 * and folded summaries as the Build tab (never re-derived).
 */
export type BuildOverviewGroupKind = "character" | "feats" | "powers" | "other";

export interface BuildOverviewRow {
  /** Stable within the level: the unit's first choice id, or a fixed key. */
  readonly key: string;
  /** The slot, as its Build-tab heading reads ("Race", "Feat"…). */
  readonly title: string;
  /** The folded picks, or undefined when nothing is picked. */
  readonly picks: string | undefined;
  readonly status: ChoiceAccordionStatus | undefined;
  /** Where activating the row lands (an issue Review's target). */
  readonly target: BuilderIssueTarget;
}

export interface BuildOverviewGroup {
  readonly kind: BuildOverviewGroupKind;
  readonly title: string;
  readonly rows: readonly BuildOverviewRow[];
}

export interface BuildOverviewLevel {
  readonly level: number;
  /** Only the groups with rows, in BUILD_OVERVIEW_GROUPS order. */
  readonly groups: readonly BuildOverviewGroup[];
}

export const BUILD_OVERVIEW_GROUPS: readonly {
  readonly kind: BuildOverviewGroupKind;
  readonly title: string;
}[] = [
  { kind: "character", title: "Character" },
  { kind: "feats", title: "Feats" },
  { kind: "powers", title: "Powers" },
  { kind: "other", title: "Other" },
];

function groupKind(section: LegacyChoiceSection): BuildOverviewGroupKind {
  switch (section) {
    case "Class":
    case "Race":
    case "Background":
    case "Theme":
      return "character";
    case "Feats":
      return "feats";
    case "Powers":
    case "Spellbook":
      return "powers";
    default:
      return "other";
  }
}

/** Order inside Other: the Build tab's section order, then the choices that
 *  live on the Details and Retraining tabs. */
const OTHER_ORDER: readonly string[] = [
  "Ability Scores",
  "Companion",
  "Skills",
  "Other",
  "Character Details",
  "Retraining",
];

const POWER_TONE_ORDER = ["at-will", "encounter", "daily", "utility"];

/** At-will, encounter, daily, then utility, from the power classification of
 *  the unit's picks (else its offered powers). */
function powerRank(
  unit: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): number {
  const entities = unit.flatMap((choice) => {
    const picked = selectedDefinitionId(choice, evaluation);
    const ids =
      picked === undefined
        ? choice.candidates
            .filter((candidate) => !candidate.reasons.includes("category"))
            .map((candidate) => candidate.definitionId)
        : [picked];
    return ids.flatMap((id) => byId.get(id.toLocaleLowerCase()) ?? []);
  });
  const ranks = entities.flatMap((entity) => {
    if (entity.type.trim().toLocaleLowerCase() !== "power") return [];
    const rank = POWER_TONE_ORDER.indexOf(classifyPowerEntity(entity).tone);
    return rank < 0 ? [] : [rank];
  });
  return ranks.length === 0 ? POWER_TONE_ORDER.length : Math.min(...ranks);
}

/**
 * A lone power slot whose Build-tab heading is the bare "Power" reads as its
 * pick's card type instead ("Encounter Utility power"), so the level's
 * powers say which kind each is; every other title is the Build tab's.
 */
function powerSlotTitle(
  title: string,
  unit: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  if (unit.length !== 1 || title !== "Power") return title;
  const picked = selectedDefinitionId(unit[0]!, evaluation);
  const entity =
    picked === undefined ? undefined : byId.get(picked.toLocaleLowerCase());
  if (entity?.type.trim().toLocaleLowerCase() !== "power") return title;
  const classification = classifyPowerEntity(entity);
  return classification.feature ? title : classification.typeLabel;
}

/** "+1 STR, +1 CHA" for a level's ability increases; undefined when none is
 *  picked. */
function abilityIncreasePicks(
  unit: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): string | undefined {
  const picks = unit.flatMap((choice) => {
    const id = selectedDefinitionId(choice, evaluation);
    if (id === undefined) return [];
    const entity = byId.get(id.toLocaleLowerCase());
    const increases = ABILITY_SCORE_NAMES.flatMap((ability) => {
      const value = abilityScoreAdjustment(entity, ability);
      return value === 0
        ? []
        : [`${value > 0 ? "+" : ""}${value} ${abilityAbbreviation(ability)}`];
    });
    return increases.length > 0 ? increases : [entity?.name ?? id];
  });
  return picks.length === 0 ? undefined : picks.join(", ");
}

function choiceTarget(
  unit: readonly EvaluatedChoice[],
  effectiveLevel: number,
): BuilderIssueTarget {
  const open = unit.find(
    (choice) => choice.level <= effectiveLevel && isUnresolvedChoice(choice),
  );
  return { kind: "choice", choiceId: (open ?? unit[0]!).id };
}

interface RankedRow {
  readonly row: BuildOverviewRow;
  readonly kind: BuildOverviewGroupKind;
  /** Sort key inside the group; ties keep the Build tab's order. */
  readonly rank: number;
}

function unitRow(
  unit: readonly EvaluatedChoice[],
  section: LegacyChoiceSection,
  presentation: LevelChoicePresentation,
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
  build: CharacterBuild,
): RankedRow {
  const abilityIncreases = unit.every((choice) =>
    isAbilityIncreaseChoiceType(choice.type),
  );
  const abilityBonuses =
    abilityIncreases ||
    unit.every(
      (choice) =>
        choice.type.trim().toLocaleLowerCase() === "race ability bonus",
    );
  const picks = abilityBonuses
    ? abilityIncreasePicks(unit, evaluation, byId)
    : presentationUnitPicks(unit, presentation, evaluation, byId, build);
  const kind = groupKind(section);
  return {
    kind,
    rank:
      kind === "powers"
        ? powerRank(unit, evaluation, byId)
        : kind === "other"
          ? OTHER_ORDER.indexOf(section)
          : 0,
    row: {
      key: unit[0]!.id,
      title: abilityIncreases
        ? "Ability Increases"
        : powerSlotTitle(
            presentationUnitTitle(unit, presentation, evaluation, byId),
            unit,
            evaluation,
            byId,
          ),
      picks,
      status: presentationUnitStatus(
        unit,
        evaluation,
        build.effectiveLevel,
        picks,
      ),
      target: choiceTarget(unit, build.effectiveLevel),
    },
  };
}

/** Level 1's point-buy scores: "STR 10, CON 14, …". */
function baseAbilitiesRow(build: CharacterBuild): RankedRow {
  const assessment = assessAbilityPointBuy(build.baseAbilities);
  const scores = ABILITY_SCORE_NAMES.flatMap((ability) => {
    const score = build.baseAbilities[ability];
    return score === undefined
      ? []
      : [`${abilityAbbreviation(ability)} ${score}`];
  });
  return {
    kind: "other",
    rank: OTHER_ORDER.indexOf("Ability Scores") - 0.5,
    row: {
      key: "base-abilities",
      title: "Ability Scores",
      picks: scores.length === 0 ? undefined : scores.join(", "),
      status: !assessment.complete
        ? "unresolved"
        : !assessment.legal
          ? "house-rule"
          : "complete",
      target: { kind: "abilities" },
    },
  };
}

function levelRows(
  level: number,
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
  build: CharacterBuild,
): readonly RankedRow[] {
  const choices = choicesAtLevel(level, evaluation);
  const rows: RankedRow[] = [];
  // Build presets sit in the Class tab, ahead of its choices.
  for (const preset of choices.filter(isBuildPresetChoice)) {
    const picks = presentationUnitPicks(
      [preset],
      presentLevelChoices([preset]),
      evaluation,
      byId,
      build,
    );
    if (picks === undefined && preset.optional) continue;
    rows.push({
      kind: "character",
      rank: 0,
      row: {
        key: preset.id,
        title: contextualChoiceTitle(preset, evaluation, byId),
        picks,
        status: presentationUnitStatus(
          [preset],
          evaluation,
          build.effectiveLevel,
          picks,
        ),
        target: { kind: "level-section", level, section: "Class" },
      },
    });
  }
  const presentation = presentLevelChoices(primaryLevelBuildChoices(choices));
  const sections = levelChoiceSections(
    presentation.presentationChoices,
    choices.filter(isRequiredClassDeityChoice),
  );
  for (const { section, choices: sectionChoices } of sections) {
    if (section === "Ability Scores" && level === 1)
      rows.push(baseAbilitiesRow(build));
    for (const choice of sectionChoices)
      rows.push(
        unitRow(
          presentationUnit(choice, presentation),
          section,
          presentation,
          evaluation,
          byId,
          build,
        ),
      );
  }
  if (
    level === 1 &&
    !sections.some(({ section }) => section === "Ability Scores")
  )
    rows.push(baseAbilitiesRow(build));
  // The Details tab's choices (a required class deity is on the Class tab).
  for (const choice of choices.filter(
    (item) =>
      isCharacterDetailChoice(item) && !isRequiredClassDeityChoice(item),
  )) {
    const row = unitRow(
      [choice],
      "Character Details",
      presentLevelChoices([choice]),
      evaluation,
      byId,
      build,
    );
    if (row.row.picks === undefined && choice.optional) continue;
    rows.push(row);
  }
  // A used retrain; an unused one is no decision.
  for (const choice of choices.filter(isOptionalRetrainingChoice)) {
    const picks = replacementPickSummary(choice, evaluation, byId, build);
    if (picks === undefined) continue;
    rows.push({
      kind: "other",
      rank: OTHER_ORDER.indexOf("Retraining"),
      row: {
        key: choice.id,
        title: "Retraining",
        picks,
        status: presentationUnitStatus(
          [choice],
          evaluation,
          build.effectiveLevel,
          picks,
        ),
        target: { kind: "choice", choiceId: choice.id },
      },
    });
  }
  return rows;
}

/**
 * The overview of levels 1 to the character's level from the evaluation the
 * editor already holds (its planning evaluation covers every one of them).
 * A level without choices has no groups.
 */
export function buildOverview(
  evaluation: EvaluatedCharacter,
  build: CharacterBuild,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly BuildOverviewLevel[] {
  const levels: BuildOverviewLevel[] = [];
  for (let level = 1; level <= build.effectiveLevel; level += 1) {
    // Empty optional slots of one title read once ("Background — none
    // chosen", not again for the background's own sub-choice).
    const emptyOptional = new Set<string>();
    const rows = levelRows(level, evaluation, byId, build)
      .filter(({ row }) => {
        if (row.picks !== undefined || row.status !== undefined) return true;
        if (emptyOptional.has(row.title)) return false;
        emptyOptional.add(row.title);
        return true;
      })
      .map((entry, index) => ({ ...entry, index }))
      .sort(
        (left, right) => left.rank - right.rank || left.index - right.index,
      );
    levels.push({
      level,
      groups: BUILD_OVERVIEW_GROUPS.flatMap(({ kind, title }) => {
        const groupRows = rows
          .filter((entry) => entry.kind === kind)
          .map(({ row }) => row);
        return groupRows.length === 0 ? [] : [{ kind, title, rows: groupRows }];
      }),
    });
  }
  return levels;
}
