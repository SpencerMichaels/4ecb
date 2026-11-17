import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  ABILITY_SCORE_NAMES,
  assessAbilityPointBuy,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";
import { classifyPowerEntity, type PowerCardTone } from "@4ecb/sheet-model";

import { abilityAbbreviation } from "./ability-abbreviations";
import type { BuilderIssueTarget } from "./builder-diagnostics";
import {
  abilityScoreAdjustment,
  accordionPicksSummary,
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
  legacyChoiceSection,
  replacementPickNames,
  replacementPickSummary,
  selectedDefinitionId,
  selectedOccurrence,
  type LegacyChoiceSection,
  type LevelChoicePresentation,
} from "./builder-ui";
import type { ChoiceAccordionStatus } from "./ChoiceAccordionItem";

/**
 * The build overview (D113): every choice the character has made, one
 * section per level, built from the same evaluated choices, units, titles
 * and folded summaries as the Build tab (never re-derived). Each row also
 * carries its category (the kind of thing it picks), a power's usage, and
 * what the character still holds from it, so the tab can regroup by slot
 * category (D113 amendment, 2026-11-16).
 */
export type BuildOverviewGroupKind =
  "character" | "ability-scores" | "skills" | "feats" | "powers" | "other";

/** A power row's usage, from its card classification (`classifyPowerEntity`'s
 *  tone): the Powers band's sub-groups. */
export type BuildOverviewPowerUsage = Extract<
  PowerCardTone,
  "at-will" | "encounter" | "daily" | "utility"
>;

/** What a row still gives the character, for the slot grouping. */
export interface BuildOverviewHeld {
  /** The folded picks the character still has (undefined: none chosen). */
  readonly picks: string | undefined;
  /** "replaced Cleave at L4" when the row is a retrain or swap. */
  readonly note?: string;
}

export interface BuildOverviewRow {
  /** Stable within the overview: the unit's first choice id, or a fixed key. */
  readonly key: string;
  readonly level: number;
  /** The row's category: what kind of thing the slot picks. */
  readonly kind: BuildOverviewGroupKind;
  /** A power row's usage (set exactly when `kind` is "powers"). */
  readonly usage?: BuildOverviewPowerUsage;
  /** The slot, as its Build-tab heading reads ("Race", "Feat"…). */
  readonly title: string;
  /** The folded picks, or undefined when nothing is picked. */
  readonly picks: string | undefined;
  readonly status: ChoiceAccordionStatus | undefined;
  /** Where activating the row lands (an issue Review's target). */
  readonly target: BuilderIssueTarget;
  /**
   * What the character has now from this row: its picks without the ones a
   * later retrain or swap traded away, or that came by a retrain or swap
   * (those show on the replacement's own row); undefined when it holds none
   * of what it picked.
   */
  readonly held: BuildOverviewHeld | undefined;
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

/** The categories, in the order a level lists them and the slot
 *  grouping's bands run. */
export const BUILD_OVERVIEW_GROUPS: readonly {
  readonly kind: BuildOverviewGroupKind;
  readonly title: string;
}[] = [
  { kind: "character", title: "Character" },
  { kind: "ability-scores", title: "Ability Scores" },
  { kind: "skills", title: "Skills" },
  { kind: "feats", title: "Feats" },
  { kind: "powers", title: "Powers" },
  { kind: "other", title: "Features & Other" },
];

/** The Powers band's sub-groups, in the order they and a level's powers
 *  run. */
export const BUILD_OVERVIEW_POWER_USAGES: readonly {
  readonly usage: BuildOverviewPowerUsage;
  readonly title: string;
}[] = [
  { usage: "at-will", title: "At-Will" },
  { usage: "encounter", title: "Encounter" },
  { usage: "daily", title: "Daily" },
  { usage: "utility", title: "Utility" },
];

const POWER_USAGES = BUILD_OVERVIEW_POWER_USAGES.map(({ usage }) => usage);

function sectionKind(section: LegacyChoiceSection): BuildOverviewGroupKind {
  switch (section) {
    case "Class":
    case "Race":
    case "Background":
    case "Theme":
    case "Character Details":
      return "character";
    case "Ability Scores":
      return "ability-scores";
    case "Skills":
      return "skills";
    case "Feats":
      return "feats";
    case "Powers":
    case "Spellbook":
      return "powers";
    default:
      return "other";
  }
}

/** A row's category and, for a power, its usage. */
interface RowKind {
  readonly kind: BuildOverviewGroupKind;
  readonly usage?: BuildOverviewPowerUsage;
}

const OTHER: RowKind = { kind: "other" };

/** A power's usage from its card classification (sheet-model's
 *  `classifyPowerEntity`); undefined for a feature or unknown usage. */
function powerUsage(
  entity: ContentEntity,
): BuildOverviewPowerUsage | undefined {
  const tone = classifyPowerEntity(entity).tone;
  return POWER_USAGES.find((usage) => usage === tone);
}

/** A power's category: Powers by usage; a feature or unknown usage is
 *  Other. */
function powerKind(entity: ContentEntity): RowKind {
  const usage = powerUsage(entity);
  return usage === undefined ? OTHER : { kind: "powers", usage };
}

/** The records a unit picked, else (nothing picked) the ones it offers. */
function unitEntities(
  unit: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  return unit.flatMap((choice) => {
    const picked = selectedDefinitionId(choice, evaluation);
    const ids =
      picked === undefined
        ? choice.candidates
            .filter((candidate) => !candidate.reasons.includes("category"))
            .map((candidate) => candidate.definitionId)
        : [picked];
    return ids.flatMap((id) => byId.get(id.toLocaleLowerCase()) ?? []);
  });
}

/** A power slot's usage: the first of at-will, encounter, daily and
 *  utility among its picks (else its offered powers); Other when none. */
function powerUnitKind(
  unit: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): RowKind {
  const ranks = unitEntities(unit, evaluation, byId).flatMap((entity) => {
    if (entity.type.trim().toLocaleLowerCase() !== "power") return [];
    const usage = powerUsage(entity);
    return usage === undefined ? [] : [POWER_USAGES.indexOf(usage)];
  });
  return ranks.length === 0
    ? OTHER
    : { kind: "powers", usage: POWER_USAGES[Math.min(...ranks)]! };
}

/** A retrain's category: the one of the kind of record it picked, as a
 *  choice of that type would be (a power by usage, a theme Character). */
function retrainKind(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): RowKind {
  const picked = selectedDefinitionId(choice, evaluation);
  const entity =
    picked === undefined ? undefined : byId.get(picked.toLocaleLowerCase());
  if (entity === undefined) return OTHER;
  const kind = sectionKind(legacyChoiceSection({ type: entity.type }));
  return kind === "powers" ? powerKind(entity) : { kind };
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

/** Which selections the character still holds and which came by a
 *  replacement, computed once per overview. */
interface HeldContext {
  /** Picks a later replacement traded away (the evaluation's
   *  `replacedSelections`). */
  readonly tradedAway: ReadonlySet<string>;
  /** Picks a reached level's replacement (retrain or swap) made. The
   *  evaluator also reports one as the pick of the slot it replaced into,
   *  which then leaves it to the replacement's own row. */
  readonly replacementPicks: ReadonlySet<string>;
}

function heldContext(
  evaluation: EvaluatedCharacter,
  effectiveLevel: number,
): HeldContext {
  return {
    tradedAway: new Set(
      (evaluation.replacedSelections ?? []).map(({ id }) => id),
    ),
    replacementPicks: new Set(
      evaluation.choices.flatMap((choice) =>
        choice.type === "Replacement" &&
        choice.level <= effectiveLevel &&
        choice.selectedOccurrenceId !== undefined
          ? [choice.selectedOccurrenceId]
          : [],
      ),
    ),
  };
}

/**
 * The unit's folded picks as the character holds them now (the Build tab's
 * folding, over fewer picks): a pick a later replacement traded away, or
 * one that came by a replacement, is left out; a replacement reads as its
 * new pick, noted "replaced X at LN". Undefined when the unit picked
 * something but holds none of it.
 */
function heldPicks(
  unit: readonly EvaluatedChoice[],
  presentation: LevelChoicePresentation,
  picks: string | undefined,
  context: Context,
): BuildOverviewHeld | undefined {
  const { level, evaluation, byId, build, held } = context;
  if (picks === undefined) return { picks };
  const affected = unit.some((choice) => {
    const id = choice.selectedOccurrenceId;
    return (
      id !== undefined &&
      (choice.type === "Replacement" ||
        held.tradedAway.has(id) ||
        held.replacementPicks.has(id))
    );
  });
  if (!affected) return { picks };
  const replaced: string[] = [];
  const summary = accordionPicksSummary(
    unit,
    presentation,
    (choice) => {
      const selected = selectedOccurrence(choice, evaluation);
      if (selected === undefined || held.tradedAway.has(selected.id))
        return undefined;
      if (choice.type === "Replacement") {
        const names = replacementPickNames(choice, evaluation, byId, build);
        if (names?.from !== undefined) replaced.push(names.from);
        return names?.to;
      }
      if (held.replacementPicks.has(selected.id)) return undefined;
      return (
        byId.get(selected.definitionId.toLocaleLowerCase())?.name ??
        selected.definitionId
      );
    },
    (choice) => contextualChoiceTitle(choice, evaluation, byId),
  );
  if (summary === undefined) return undefined;
  return replaced.length === 0
    ? { picks: summary }
    : { picks: summary, note: `replaced ${replaced.join(", ")} at L${level}` };
}

interface Context {
  readonly level: number;
  readonly evaluation: EvaluatedCharacter;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly build: CharacterBuild;
  readonly held: HeldContext;
}

function unitRow(
  unit: readonly EvaluatedChoice[],
  section: LegacyChoiceSection,
  presentation: LevelChoicePresentation,
  context: Context,
): BuildOverviewRow {
  const { level, evaluation, byId, build } = context;
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
  const kind = sectionKind(section);
  return {
    key: unit[0]!.id,
    level,
    ...(kind === "powers"
      ? powerUnitKind(unit, evaluation, byId)
      : // A swap the level or a feat offers is filed by what it picks.
        unit.length === 1 && unit[0]!.type === "Replacement"
        ? unit[0]!.selectedOccurrenceId === undefined
          ? powerUnitKind(unit, evaluation, byId)
          : retrainKind(unit[0]!, evaluation, byId)
        : { kind }),
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
    held: abilityBonuses
      ? { picks }
      : heldPicks(unit, presentation, picks, context),
  };
}

/** Level 1's point-buy scores: "STR 10, CON 14, …". */
function baseAbilitiesRow(build: CharacterBuild): BuildOverviewRow {
  const assessment = assessAbilityPointBuy(build.baseAbilities);
  const scores = ABILITY_SCORE_NAMES.flatMap((ability) => {
    const score = build.baseAbilities[ability];
    return score === undefined
      ? []
      : [`${abilityAbbreviation(ability)} ${score}`];
  });
  const picks = scores.length === 0 ? undefined : scores.join(", ");
  return {
    key: "base-abilities",
    level: 1,
    kind: "ability-scores",
    title: "Ability Scores",
    picks,
    status: !assessment.complete
      ? "unresolved"
      : !assessment.legal
        ? "house-rule"
        : "complete",
    target: { kind: "abilities" },
    held: { picks },
  };
}

function levelRows(context: Context): readonly BuildOverviewRow[] {
  const { level, evaluation, byId, build } = context;
  const choices = choicesAtLevel(level, evaluation);
  const rows: BuildOverviewRow[] = [];
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
      key: preset.id,
      level,
      kind: "character",
      title: contextualChoiceTitle(preset, evaluation, byId),
      picks,
      status: presentationUnitStatus(
        [preset],
        evaluation,
        build.effectiveLevel,
        picks,
      ),
      target: { kind: "level-section", level, section: "Class" },
      held: { picks },
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
          context,
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
      context,
    );
    if (row.picks === undefined && choice.optional) continue;
    rows.push(row);
  }
  // A used retrain; an unused one is no decision.
  for (const choice of choices.filter(isOptionalRetrainingChoice)) {
    const picks = replacementPickSummary(choice, evaluation, byId, build);
    if (picks === undefined) continue;
    rows.push({
      key: choice.id,
      level,
      ...retrainKind(choice, evaluation, byId),
      title: "Retraining",
      picks,
      status: presentationUnitStatus(
        [choice],
        evaluation,
        build.effectiveLevel,
        picks,
      ),
      target: { kind: "choice", choiceId: choice.id },
      held: heldPicks([choice], presentLevelChoices([choice]), picks, context),
    });
  }
  return rows;
}

/**
 * The overview of levels 1 to the character's level from the evaluation the
 * editor already holds (its planning evaluation covers every one of them).
 * A level's rows run by category, then in the Build tab's order; a level
 * without choices has no groups.
 */
export function buildOverview(
  evaluation: EvaluatedCharacter,
  build: CharacterBuild,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly BuildOverviewLevel[] {
  const held = heldContext(evaluation, build.effectiveLevel);
  const levels: BuildOverviewLevel[] = [];
  for (let level = 1; level <= build.effectiveLevel; level += 1) {
    // Empty optional slots of one title read once ("Background — none
    // chosen", not again for the background's own sub-choice).
    const emptyOptional = new Set<string>();
    const rows = levelRows({ level, evaluation, byId, build, held }).filter(
      (row) => {
        if (row.picks !== undefined || row.status !== undefined) return true;
        if (emptyOptional.has(row.title)) return false;
        emptyOptional.add(row.title);
        return true;
      },
    );
    levels.push({
      level,
      groups: BUILD_OVERVIEW_GROUPS.flatMap(({ kind, title }) => {
        const groupRows =
          kind === "powers"
            ? // A level's powers run by usage, then in the Build tab's order.
              POWER_USAGES.flatMap((usage) =>
                rows.filter((row) => row.kind === kind && row.usage === usage),
              )
            : rows.filter((row) => row.kind === kind);
        return groupRows.length === 0 ? [] : [{ kind, title, rows: groupRows }];
      }),
    });
  }
  return levels;
}

/** The Overview's sortable columns; sorting by one groups by it (by Slot:
 *  by the slot's category). */
export type BuildOverviewSortColumn = "level" | "slot";

export interface BuildOverviewSort {
  readonly column: BuildOverviewSortColumn;
  readonly direction: "ascending" | "descending";
}

/** By level, first level first: the build's own order. */
export const DEFAULT_BUILD_OVERVIEW_SORT: BuildOverviewSort = {
  column: "level",
  direction: "ascending",
};

/** A header click: the active column flips direction; the other column
 *  starts ascending. */
export function nextBuildOverviewSort(
  current: BuildOverviewSort,
  column: BuildOverviewSortColumn,
): BuildOverviewSort {
  return {
    column,
    direction:
      current.column === column && current.direction === "ascending"
        ? "descending"
        : "ascending",
  };
}

export interface BuildOverviewBandRow {
  readonly row: BuildOverviewRow;
  /** The picks this grouping shows: the row's history by level, what the
   *  character holds now by slot. */
  readonly picks: string | undefined;
  readonly note?: string;
}

/** A run of a band's rows, under a sub-heading when titled (the Powers
 *  band's usages). */
export interface BuildOverviewBandSection {
  /** Unique across the bands ("level:3", "slot:powers:daily"). */
  readonly key: string;
  readonly title: string | undefined;
  readonly rows: readonly BuildOverviewBandRow[];
}

export interface BuildOverviewBand {
  /** Unique across both groupings ("level:3", "slot:feats"). */
  readonly key: string;
  readonly title: string;
  /** One untitled section, except a Powers band with rows: a titled
   *  section per usage that has rows. */
  readonly sections: readonly BuildOverviewBandSection[];
}

/**
 * The Overview's bands for a sort. By level: a band per level, its rows in
 * the overview's order, every row (the full history, retrains included). By
 * slot: a band per category, every category listed, its rows by level and
 * showing only what the character has now (a traded-away pick has no row;
 * its replacement's row notes what it replaced); the Powers band runs in
 * usage sub-groups (At-Will, Encounter, Daily, Utility), each by level. The
 * direction orders the bands.
 */
export function buildOverviewBands(
  levels: readonly BuildOverviewLevel[],
  sort: BuildOverviewSort,
): readonly BuildOverviewBand[] {
  const bands: BuildOverviewBand[] =
    sort.column === "level"
      ? levels.map(({ level, groups }) => {
          const key = `level:${level}`;
          return {
            key,
            title: `Level ${level}`,
            sections: [
              {
                key,
                title: undefined,
                rows: groups.flatMap((group) =>
                  group.rows.map((row) => ({ row, picks: row.picks })),
                ),
              },
            ],
          };
        })
      : BUILD_OVERVIEW_GROUPS.map(({ kind, title }) => {
          const key = `slot:${kind}`;
          // Levels are already in order, so this keeps the build order.
          const rows = levels.flatMap(({ groups }) =>
            groups.flatMap((group) =>
              group.kind !== kind ? [] : group.rows.flatMap(heldBandRow),
            ),
          );
          return {
            key,
            title,
            sections:
              kind !== "powers" || rows.length === 0
                ? [{ key, title: undefined, rows }]
                : BUILD_OVERVIEW_POWER_USAGES.flatMap(
                    ({ usage, title: usageTitle }) => {
                      const usageRows = rows.filter(
                        ({ row }) => row.usage === usage,
                      );
                      return usageRows.length === 0
                        ? []
                        : [
                            {
                              key: `${key}:${usage}`,
                              title: usageTitle,
                              rows: usageRows,
                            },
                          ];
                    },
                  ),
          };
        });
  return sort.direction === "ascending" ? bands : bands.reverse();
}

/** A row as the slot grouping shows it: what the character holds now. */
function heldBandRow(row: BuildOverviewRow): readonly BuildOverviewBandRow[] {
  return row.held === undefined
    ? []
    : [
        {
          row,
          picks: row.held.picks,
          ...(row.held.note === undefined ? {} : { note: row.held.note }),
        },
      ];
}

export const BUILD_OVERVIEW_SORT_STORAGE_KEY = "4ecb.buildOverviewSort.v1";

/** The remembered grouping (as the library remembers its sort; a stored
 *  "category" is the slot grouping's earlier name); anything unreadable
 *  falls back to by level. */
export function readBuildOverviewSort(
  storage?: Pick<Storage, "getItem">,
): BuildOverviewSort {
  try {
    const raw = (storage ?? window.localStorage).getItem(
      BUILD_OVERVIEW_SORT_STORAGE_KEY,
    );
    if (raw === null) return DEFAULT_BUILD_OVERVIEW_SORT;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null)
      return DEFAULT_BUILD_OVERVIEW_SORT;
    const { column, direction } = value as Record<string, unknown>;
    if (direction !== "ascending" && direction !== "descending")
      return DEFAULT_BUILD_OVERVIEW_SORT;
    if (column === "level" || column === "slot") return { column, direction };
    return column === "category"
      ? { column: "slot", direction }
      : DEFAULT_BUILD_OVERVIEW_SORT;
  } catch {
    return DEFAULT_BUILD_OVERVIEW_SORT;
  }
}

export function writeBuildOverviewSort(
  sort: BuildOverviewSort,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? window.localStorage).setItem(
      BUILD_OVERVIEW_SORT_STORAGE_KEY,
      JSON.stringify(sort),
    );
  } catch {
    // Remembering the grouping is a convenience; blocked storage forgets it.
  }
}
