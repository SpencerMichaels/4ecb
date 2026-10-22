import {
  knownElementKey,
  type BuildKnownEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import type { EvaluatedCharacter } from "./evaluator";
import { grantedKnownRecords, type EntityLookup } from "./known-records";

/**
 * Free-ritual allowances: how many rituals, formulas or practices a class or
 * feat entitles the character to learn free, and how high they may be. The
 * published "Free Rituals" text says this in prose only, so the counts are
 * added as data (content corrections, D089) in one field per provider:
 *
 *   <specific name="_FreeRitualAllowance">KIND; STEP; STEP…[; from=ID|ID…]</specific>
 *
 * - KIND is the learned record's authored type: `Ritual`,
 *   `Alchemical Formula` or `Martial Practice`.
 * - STEP is `COUNT@LEVEL[,LEVEL…][<=MAX]`: COUNT more at each listed
 *   character level. MAX limits the record's level: a number, `step` (the
 *   step's level or lower, "of that level or lower") or `level` (the level
 *   it is learned at or lower, "of your level or lower"). Without it any
 *   level is allowed.
 * - `from=` restricts the allowance to the listed records (a choice of
 *   named rituals).
 *
 * Only learned "free" entries use an allowance: rituals the provider grants
 * outright are already excluded from its count ("given Animal Messenger, and
 * an additional free 1st-level ritual"). The allowance is shown, never
 * enforced.
 */

export const FREE_RITUAL_ALLOWANCE_FIELD = "_FreeRitualAllowance";

export type RitualAllowanceKind =
  "Ritual" | "Alchemical Formula" | "Martial Practice";

export type RitualAllowanceMax = number | "step" | "level";

export interface RitualAllowanceStep {
  readonly level: number;
  readonly count: number;
  readonly max?: RitualAllowanceMax;
}

export interface RitualAllowanceDefinition {
  readonly kind: RitualAllowanceKind;
  readonly steps: readonly RitualAllowanceStep[];
  /** Lower-cased record IDs the allowance is restricted to. */
  readonly from?: readonly string[];
}

export interface RitualAllowance extends RitualAllowanceDefinition {
  /** Stable key a learned entry records: the provider ID, plus `#N` for its later fields. */
  readonly key: string;
  readonly providerId: string;
  /** Display name of the provider ("Spellbook", "Druid"). */
  readonly provider: string;
}

/** Free slots left that share a level limit. */
export interface RitualAllowanceRemainder {
  readonly count: number;
  /** Highest record level allowed now; absent when unlimited. */
  readonly maxLevel?: number;
}

export interface RitualAllowanceStatus {
  readonly allowance: RitualAllowance;
  /** Free records the allowance gives at the evaluated level. */
  readonly total: number;
  readonly used: number;
  readonly remaining: number;
  readonly remainders: readonly RitualAllowanceRemainder[];
  /** Known entries counted against it. */
  readonly entryIds: readonly string[];
}

const KINDS: readonly RitualAllowanceKind[] = [
  "Ritual",
  "Alchemical Formula",
  "Martial Practice",
];

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

/** Parses one `_FreeRitualAllowance` value; undefined when malformed. */
export function parseRitualAllowance(
  value: string,
): RitualAllowanceDefinition | undefined {
  const parts = value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const kind = KINDS.find(
    (candidate) => key(candidate) === key(parts[0] ?? ""),
  );
  if (kind === undefined) return undefined;
  const steps: RitualAllowanceStep[] = [];
  let from: string[] | undefined;
  for (const part of parts.slice(1)) {
    const restriction = /^from\s*=\s*(.+)$/iu.exec(part);
    if (restriction !== null) {
      from = restriction[1]!
        .split("|")
        .map(key)
        .filter((id) => id !== "");
      if (from.length === 0) return undefined;
      continue;
    }
    const step =
      /^(\d+)\s*@\s*(\d+(?:\s*,\s*\d+)*)\s*(?:<=\s*(\d+|step|level))?$/iu.exec(
        part,
      );
    if (step === null) return undefined;
    const count = Number(step[1]);
    const maxText = step[3]?.toLocaleLowerCase();
    const max: RitualAllowanceMax | undefined =
      maxText === undefined
        ? undefined
        : maxText === "step" || maxText === "level"
          ? maxText
          : Number(maxText);
    for (const level of step[2]!.split(",").map(Number)) {
      if (level < 1 || level > 30 || count < 1) return undefined;
      steps.push({ level, count, ...(max === undefined ? {} : { max }) });
    }
  }
  if (steps.length === 0) return undefined;
  return {
    kind,
    steps: steps.sort((left, right) => left.level - right.level),
    ...(from === undefined ? {} : { from }),
  };
}

/** The allowances of the character's active elements, in activation order. */
export function ritualAllowances(
  evaluation: Pick<EvaluatedCharacter, "activeDefinitionIds">,
  entityById: EntityLookup,
): readonly RitualAllowance[] {
  const result: RitualAllowance[] = [];
  const seen = new Set<string>();
  for (const definitionId of evaluation.activeDefinitionIds) {
    const entity = entityById(definitionId);
    if (entity === undefined || seen.has(key(entity.id))) continue;
    seen.add(key(entity.id));
    entity.specifics
      .filter(({ name }) => key(name) === key(FREE_RITUAL_ALLOWANCE_FIELD))
      .forEach(({ value }, index) => {
        const definition = parseRitualAllowance(value);
        if (definition === undefined) return;
        result.push({
          ...definition,
          key: index === 0 ? entity.id : `${entity.id}#${index + 1}`,
          providerId: entity.id,
          provider: entity.name,
        });
      });
  }
  return result;
}

/** The authored kind of a Ritual record (no subtype reads as Ritual). */
export function learnedRecordKind(entity: ContentEntity): RitualAllowanceKind {
  const subtype = key(field(entity, "type") ?? "");
  return KINDS.find((kind) => key(kind) === subtype) ?? "Ritual";
}

function recordLevel(entity: ContentEntity): number | undefined {
  const level = Number.parseInt(field(entity, "Level") ?? "", 10);
  return Number.isFinite(level) ? level : undefined;
}

interface Slot {
  readonly stepLevel: number;
  readonly max?: RitualAllowanceMax;
}

function slotMax(slot: Slot, learnedAt: number): number | undefined {
  if (slot.max === undefined) return undefined;
  if (slot.max === "step") return slot.stepLevel;
  if (slot.max === "level") return learnedAt;
  return slot.max;
}

function fits(
  allowance: RitualAllowanceDefinition,
  slot: Slot,
  entity: ContentEntity | undefined,
  learnedAt: number,
): boolean {
  if (entity === undefined || slot.stepLevel > learnedAt) return false;
  if (learnedRecordKind(entity) !== allowance.kind) return false;
  if (allowance.from !== undefined && !allowance.from.includes(key(entity.id)))
    return false;
  const max = slotMax(slot, learnedAt);
  if (max === undefined) return true;
  const level = recordLevel(entity);
  return level !== undefined && level <= max;
}

/** Bipartite matching (augmenting paths); deterministic in input order. */
function match(
  entries: readonly number[],
  slots: number,
  compatible: (entry: number, slot: number) => boolean,
  owner: (number | undefined)[],
): void {
  const tryEntry = (entry: number, visited: Set<number>): boolean => {
    for (let slot = 0; slot < slots; slot += 1) {
      if (visited.has(slot) || !compatible(entry, slot)) continue;
      visited.add(slot);
      const current = owner[slot];
      if (current === undefined || tryEntry(current, visited)) {
        owner[slot] = entry;
        return true;
      }
    }
    return false;
  };
  for (const entry of entries) tryEntry(entry, new Set());
}

/**
 * How much of each allowance is used at the evaluated level. Entries that
 * name an allowance count against it; imported free entries, which can't
 * name one, are matched to any allowance they fit. Entries the evaluation
 * grants outright never count.
 */
export function ritualAllowanceStatuses(
  build: Pick<CharacterBuild, "known">,
  evaluation: Pick<
    EvaluatedCharacter,
    "activeDefinitionIds" | "level" | "occurrences" | "stats"
  >,
  entityById: EntityLookup,
  level: number = evaluation.level,
): readonly RitualAllowanceStatus[] {
  const allowances = ritualAllowances(evaluation, entityById);
  if (allowances.length === 0) return [];
  const granted = new Set(
    grantedKnownRecords(evaluation, entityById).map(({ definitionId }) =>
      key(definitionId),
    ),
  );
  const entries: BuildKnownEntry[] = build.known.filter(
    (entry) =>
      entry.acquisition === "free" &&
      entry.acquiredLevel <= level &&
      !granted.has(knownElementKey(entry.element)),
  );
  const entityOf = (entry: BuildKnownEntry) =>
    entry.element.definitionId === undefined
      ? undefined
      : entityById(entry.element.definitionId);
  // One slot per free record, across every allowance.
  const slots = allowances.flatMap((allowance, allowanceIndex) =>
    allowance.steps
      .filter((step) => step.level <= level)
      .flatMap((step) =>
        Array.from({ length: step.count }, () => ({
          allowanceIndex,
          stepLevel: step.level,
          ...(step.max === undefined ? {} : { max: step.max }),
        })),
      ),
  );
  const owner: (number | undefined)[] = slots.map(() => undefined);
  const named = (entry: BuildKnownEntry) =>
    allowances.findIndex(
      (allowance) =>
        entry.allowance !== undefined &&
        key(allowance.key) === key(entry.allowance),
    );
  const indexes = entries.map((_, index) => index);
  const compatible = (entry: number, slot: number) => {
    const target = slots[slot]!;
    const value = entries[entry]!;
    return fits(
      allowances[target.allowanceIndex]!,
      target,
      entityOf(value),
      value.acquiredLevel,
    );
  };
  // Named entries first, within their own allowance.
  match(
    indexes.filter((index) => named(entries[index]!) >= 0),
    slots.length,
    (entry, slot) =>
      slots[slot]!.allowanceIndex === named(entries[entry]!) &&
      compatible(entry, slot),
    owner,
  );
  // A named entry that no longer fits still uses one of its allowance's slots.
  const placed = () => new Set(owner.filter((value) => value !== undefined));
  for (const index of indexes) {
    const allowanceIndex = named(entries[index]!);
    if (allowanceIndex < 0 || placed().has(index)) continue;
    const slot = slots.findIndex(
      (candidate, slotIndex) =>
        candidate.allowanceIndex === allowanceIndex &&
        owner[slotIndex] === undefined,
    );
    if (slot >= 0) owner[slot] = index;
  }
  // Imported free entries are matched to whatever free slot they fit.
  const taken = placed();
  match(
    indexes.filter(
      (index) =>
        entries[index]!.allowance === undefined &&
        entries[index]!.legacyLoot !== undefined &&
        !taken.has(index),
    ),
    slots.length,
    (entry, slot) =>
      (owner[slot] === undefined || !taken.has(owner[slot]!)) &&
      compatible(entry, slot),
    owner,
  );

  return allowances.map((allowance, allowanceIndex) => {
    const own = slots.flatMap((slot, index) =>
      slot.allowanceIndex === allowanceIndex ? [index] : [],
    );
    const usedSlots = own.filter((index) => owner[index] !== undefined);
    const remainders = new Map<string, RitualAllowanceRemainder>();
    for (const index of own) {
      if (owner[index] !== undefined) continue;
      const maxLevel = slotMax(slots[index]!, level);
      const group = String(maxLevel);
      remainders.set(group, {
        count: (remainders.get(group)?.count ?? 0) + 1,
        ...(maxLevel === undefined ? {} : { maxLevel }),
      });
    }
    return {
      allowance,
      total: own.length,
      used: usedSlots.length,
      remaining: own.length - usedSlots.length,
      remainders: [...remainders.values()].sort(
        (left, right) =>
          (left.maxLevel ?? Number.POSITIVE_INFINITY) -
          (right.maxLevel ?? Number.POSITIVE_INFINITY),
      ),
      entryIds: usedSlots.map((index) => entries[owner[index]!]!.id),
    };
  });
}

/**
 * The allowances a record can be learned free from now: those with a free
 * slot it fits, learned at `learnedAt`.
 */
export function eligibleRitualAllowances(
  statuses: readonly RitualAllowanceStatus[],
  entity: ContentEntity,
  learnedAt: number,
): readonly RitualAllowance[] {
  return statuses.flatMap(({ allowance, remainders }) =>
    remainders.some(({ maxLevel }) =>
      fits(
        allowance,
        { stepLevel: 1, ...(maxLevel === undefined ? {} : { max: maxLevel }) },
        entity,
        learnedAt,
      ),
    )
      ? [allowance]
      : [],
  );
}
