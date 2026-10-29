/**
 * Native hybrid power-pick rules (D20RulesEngine `-Module-.cs`): DisallowClass
 * (~17220, applied by D20Choice::UpdateArrays ~17432 and explained by
 * LegalExplanation ~17305 as "Must choose power from second hybrid class."),
 * CheckHybridPower (~16690, read by D20Choice::CheckReplaceElem ~16838) and
 * RulesElement::IsPsionicClass (~31319).
 *
 * PHB3 p136 ("Gaining Additional Powers"): if a hybrid has at least two
 * powers in the same category (at-will attack, encounter attack, daily
 * attack, utility), at least one must come from each hybrid class, also after
 * retraining or a power swap.
 */
import type { ContentEntity } from "@4ecb/content-domain";

import { isPsionicClass } from "./exceptions";

/**
 * Native `powerChoiceNames` with the parallel `powerUsage`/`powerType`
 * tables (decoded from D20RulesEngine.dll's static data): a select whose name
 * starts with one of these prefixes, followed by its level, is a hybrid
 * power slot. A missing usage matches any Power Usage.
 */
const HYBRID_POWER_SLOTS: readonly {
  readonly prefix: string;
  readonly usage?: string;
  readonly type: string;
}[] = [
  { prefix: "Power At-Will ", usage: "At-Will", type: "Attack" },
  { prefix: "Power Encounter ", usage: "Encounter", type: "Attack" },
  { prefix: "Power Utility ", type: "Utility" },
  { prefix: "Power Daily ", usage: "Daily", type: "Attack" },
  { prefix: "Hybrid Encounter ", usage: "Encounter", type: "Attack" },
  { prefix: "Hybrid At-Will/Encounter ", usage: "Encounter", type: "Attack" },
];

export interface HybridPowerSlot {
  readonly usage?: string;
  readonly type: string;
  /** The level the slot's name carries (native `_wtoi` after the prefix). */
  readonly level: number;
}

function lower(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

/** Reads a record field (the evaluator passes one that applies `modify`
 *  overlays, as native C_RulesElementField does). */
export type FieldReader = (
  entity: ContentEntity,
  name: string,
) => string | undefined;

function field(entity: ContentEntity, name: string): string | undefined {
  const wanted = lower(name);
  return entity.specifics.find((specific) => lower(specific.name) === wanted)
    ?.value;
}

/** The hybrid power slot a select's name names, if any (first prefix wins). */
export function hybridPowerSlot(
  name: string | undefined,
): HybridPowerSlot | undefined {
  if (name === undefined) return undefined;
  const value = name.toLocaleLowerCase();
  const slot = HYBRID_POWER_SLOTS.find(({ prefix }) =>
    value.startsWith(prefix.toLocaleLowerCase()),
  );
  if (slot === undefined) return undefined;
  const level = Number.parseInt(name.slice(slot.prefix.length), 10);
  if (!Number.isFinite(level) || level === 0) return undefined;
  return {
    ...(slot.usage === undefined ? {} : { usage: slot.usage }),
    type: slot.type,
    level,
  };
}

/** A hybrid character's two hybrid classes and their base classes. */
export interface NativeHybridClasses {
  /** The Hybrid Class definitions, in ownership order. */
  readonly hybridClasses: readonly [ContentEntity, ContentEntity];
  /** Their `_BaseClass` records (native class-category entries 1 and 2). */
  readonly baseClasses: readonly [ContentEntity, ContentEntity];
}

/**
 * The hybrid classes DisallowClass and CheckHybridPower act on. Native
 * requires exactly two Hybrid Class elements and exactly three class
 * category entries (CategoryOpt::Build: the owned Class records, their
 * `_ParentClass` and each hybrid class's `_BaseClass`), i.e. the Hybrid
 * class plus the two base classes; any other shape is left unrestricted.
 */
export function nativeHybridClasses(
  owned: readonly ContentEntity[],
  find: (nameOrId: string, type?: string) => ContentEntity | undefined,
): NativeHybridClasses | undefined {
  const unique = (entities: readonly ContentEntity[]) => [
    ...new Map(entities.map((entity) => [lower(entity.id), entity])).values(),
  ];
  const hybridClasses = unique(
    owned.filter((entity) => lower(entity.type) === "hybrid class"),
  );
  if (hybridClasses.length !== 2) return undefined;
  const classEntries = new Set<string>();
  for (const entity of owned) {
    if (lower(entity.type) !== "class") continue;
    classEntries.add(lower(entity.id));
    const parent = field(entity, "_ParentClass")?.trim();
    if (parent) classEntries.add(lower(find(parent)?.id ?? parent));
  }
  const baseClasses: ContentEntity[] = [];
  for (const hybrid of hybridClasses) {
    const baseId = field(hybrid, "_BaseClass")?.trim();
    const base = baseId ? find(baseId) : undefined;
    if (base === undefined) continue;
    classEntries.add(lower(base.id));
    baseClasses.push(base);
  }
  const [first, second] = hybridClasses;
  const [firstBase, secondBase] = baseClasses;
  if (
    classEntries.size !== 3 ||
    first === undefined ||
    second === undefined ||
    firstBase === undefined ||
    secondBase === undefined
  )
    return undefined;
  return {
    hybridClasses: [first, second],
    baseClasses: [firstBase, secondBase],
  };
}

/** The base-class index (0 or 1) a power's `Class` field names. */
function powerClassIndex(
  power: ContentEntity,
  hybrid: NativeHybridClasses,
  find: (nameOrId: string, type?: string) => ContentEntity | undefined,
  readField: FieldReader,
): number | undefined {
  const classField = readField(power, "Class")?.trim();
  if (!classField) return undefined;
  const owner = find(classField);
  if (owner === undefined) return undefined;
  const index = hybrid.baseClasses.findIndex(
    (base) => lower(base.id) === lower(owner.id),
  );
  return index < 0 ? undefined : index;
}

/**
 * Native DisallowClass: the index (0 or 1) of the hybrid class a slot may no
 * longer take powers from, or undefined. `held` is what the character holds
 * at the slot's level, without the slot's own pick and without spellbook
 * picks. Each class "has" the slot's kind when it holds a power of the
 * slot's Power Usage (any, for utility) and Power Type; for an encounter
 * slot a psionic class (IsPsionicClass) always counts as having one, since
 * it takes augmentable at-wills instead (PHB3 "Psionic Augmentation and
 * Hybrid Characters"). When exactly one class has one, only the other
 * class's powers are legal.
 */
export function disallowedHybridClass(
  hybrid: NativeHybridClasses,
  slot: HybridPowerSlot,
  held: readonly ContentEntity[],
  find: (nameOrId: string, type?: string) => ContentEntity | undefined,
  readField: FieldReader = field,
): 0 | 1 | undefined {
  const has = [false, false];
  for (const power of held) {
    if (
      (slot.usage !== undefined &&
        lower(readField(power, "Power Usage")) !== lower(slot.usage)) ||
      lower(readField(power, "Power Type")) !== lower(slot.type)
    )
      continue;
    const index = powerClassIndex(power, hybrid, find, readField);
    if (index !== undefined) has[index] = true;
  }
  if (lower(slot.usage) === "encounter")
    hybrid.baseClasses.forEach((base, index) => {
      if (isPsionicClass(base)) has[index] = true;
    });
  if (!has[0] && !has[1]) return undefined;
  if (!has[0]) return 1;
  if (!has[1]) return 0;
  return undefined;
}

/**
 * Native CheckHybridPower: a replacement that is neither a retraining nor a
 * power swap (a multiclass swap, power-replace) may give up a power of a
 * hybrid class only while the character holds, at the replacement's level,
 * another power of that class with the same Power Type and Power Usage.
 */
export function hybridPowerReplaceable(
  hybrid: NativeHybridClasses,
  lost: ContentEntity,
  held: readonly ContentEntity[],
  find: (nameOrId: string, type?: string) => ContentEntity | undefined,
  readField: FieldReader = field,
): boolean {
  if (lower(lost.type) !== "power") return true;
  const index = powerClassIndex(lost, hybrid, find, readField);
  if (index === undefined) return true;
  return held.some(
    (power) =>
      lower(power.id) !== lower(lost.id) &&
      lower(power.type) === "power" &&
      powerClassIndex(power, hybrid, find, readField) === index &&
      lower(readField(power, "Power Type")) ===
        lower(readField(lost, "Power Type")) &&
      lower(readField(power, "Power Usage")) ===
        lower(readField(lost, "Power Usage")),
  );
}
