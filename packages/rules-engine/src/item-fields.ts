import type { ContentEntity } from "@4ecb/content-domain";

import type { FieldOverlay } from "./evaluator";
import { EXCEPTION_IDS, EXCEPTION_NAMES } from "./exceptions";

/**
 * Item (loot) field resolution, as native C_RulesElementField reads a record:
 * the character's `modify` overlays first, then the record's own field. One
 * implementation for the evaluator, power rows, equipment predicates and the
 * printed item cards.
 */

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function rawField(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

/** Native ProcessModify's targets that are not a record name. */
const CONTEXT_TARGETS = new Set(["this", "baseitem"]);

/**
 * Whether a `modify` overlay applies to this record. Native ProcessModify
 * resolves the target with FindRulesElement (name or ID, qualified by type)
 * whether or not the character owns it, so an inventory weapon matches an
 * overlay naming it as well as one that resolved to an owned definition. A
 * weapon modify also modifies its "Large <name>" record. `BaseItem` (the
 * holding's base while its enchantment executes) is resolved when the
 * overlay is made, into `targetDefinitionIds`.
 */
export function overlayTargets(
  overlay: FieldOverlay,
  entity: ContentEntity,
): boolean {
  if (overlay.targetDefinitionIds.some((id) => key(id) === key(entity.id)))
    return true;
  if (overlay.targetName === undefined) return false;
  const name = key(overlay.targetName);
  if (CONTEXT_TARGETS.has(name)) return false;
  if (
    overlay.targetType !== undefined &&
    key(overlay.targetType) !== key(entity.type)
  )
    return false;
  return (
    name === key(entity.name) ||
    name === key(entity.id) ||
    (key(entity.type) === "weapon" && `large ${name}` === key(entity.name))
  );
}

/**
 * Native IncreaseDamageDie (one-handed table): 1d4 → 1d6 → 1d8 → 1d10 →
 * 1d12 → 2d6 → 2d8 → 2d10, and 2d4 → 1d10. A bare "d8" counts as 1d8, each
 * side of "1d6/1d4" steps separately, and any other value is unchanged.
 */
export function increaseDamageDie(die: string, steps = 1): string {
  let value = die;
  for (let step = 0; step < steps; step += 1) value = increaseOnce(value);
  return value;
}

const ONE_HANDED_DICE = [
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
  "2d6",
  "2d8",
  "2d10",
] as const;

function increaseOnce(die: string): string {
  if (die.includes("/"))
    return die
      .split("/")
      .map((part) => increaseOnce(part))
      .join("/");
  if (die === "" || die.startsWith("-")) return die;
  const normalized = key(die);
  const index = ONE_HANDED_DICE.findIndex(
    (entry) =>
      entry === normalized ||
      (normalized.startsWith("d") && entry.slice(1) === normalized),
  );
  if (index >= 0) return ONE_HANDED_DICE[index + 1] ?? die;
  return normalized === "2d4" ? "1d10" : die;
}

/** One overlay applied to a field's current value (native CalcModifiedValue). */
function modifiedValue(
  current: string | undefined,
  overlay: FieldOverlay,
): string | undefined {
  let value = current;
  if (overlay.value !== undefined) value = overlay.value;
  if (overlay.listAddition !== undefined)
    value = [value, overlay.listAddition].filter(Boolean).join(", ");
  if (overlay.dieIncrease !== undefined)
    value = increaseDamageDie(value ?? "", Number(overlay.dieIncrease) || 1);
  return value;
}

/** A record's field after every `modify` overlay that targets it. */
export function overlaidField(
  entity: ContentEntity,
  name: string,
  overlays: readonly FieldOverlay[],
): string | undefined {
  let value = rawField(entity, name);
  for (const overlay of overlays)
    if (key(overlay.field) === key(name) && overlayTargets(overlay, entity))
      value = modifiedValue(value, overlay);
  return value;
}

/** Every field of a record after the overlays that target it. */
export function overlaidFields(
  entity: ContentEntity,
  overlays: readonly FieldOverlay[],
): Readonly<Record<string, string>> {
  const fields: Record<string, string> = Object.fromEntries(
    entity.specifics.map((specific) => [specific.name, specific.value]),
  );
  for (const overlay of overlays) {
    if (!overlayTargets(overlay, entity)) continue;
    const existingName =
      Object.keys(fields).find((name) => key(name) === key(overlay.field)) ??
      overlay.field;
    const value = modifiedValue(fields[existingName], overlay);
    if (value !== undefined) fields[existingName] = value;
  }
  return fields;
}

const overlaidEntityCache = new WeakMap<
  readonly FieldOverlay[],
  Map<ContentEntity, ContentEntity>
>();

/**
 * The record as the character's workspace sees it: the same entity with its
 * specifics replaced by the overlaid values (fields an overlay adds come
 * last). Returns the entity itself when no overlay targets it.
 */
export function overlaidEntity(
  entity: ContentEntity,
  overlays: readonly FieldOverlay[],
): ContentEntity {
  if (!overlays.some((overlay) => overlayTargets(overlay, entity)))
    return entity;
  let cache = overlaidEntityCache.get(overlays);
  if (cache === undefined) {
    cache = new Map();
    overlaidEntityCache.set(overlays, cache);
  }
  const cached = cache.get(entity);
  if (cached !== undefined) return cached;
  const fields = overlaidFields(entity, overlays);
  const used = new Set<string>();
  const specifics = entity.specifics.map((specific) => {
    used.add(key(specific.name));
    const value = fields[specific.name];
    return value === undefined || value === specific.value
      ? specific
      : { ...specific, value };
  });
  let ordinal = Math.max(-1, ...entity.specifics.map((s) => s.ordinal));
  for (const [name, value] of Object.entries(fields)) {
    if (used.has(key(name))) continue;
    ordinal += 1;
    specifics.push({ name, value, extraAttributes: [], ordinal });
  }
  const result = { ...entity, specifics };
  cache.set(entity, result);
  return result;
}

/** Native IsStaff for an item's base record. */
export function legacyIsStaff(entity: ContentEntity): boolean {
  switch (key(entity.type)) {
    case "magic item":
      return key(rawField(entity, "Magic Item Type") ?? "") === "staff";
    case "weapon":
      return key(entity.id) === key(EXCEPTION_IDS.quarterstaff);
    case "superior implement":
      return key(rawField(entity, "Group") ?? "") === "staff";
    default:
      return [
        EXCEPTION_NAMES.staffImplement,
        EXCEPTION_NAMES.staffImplementAlternate,
      ].some((name) => key(name) === key(entity.name));
  }
}

/** Record types that are loot (inventory) records. */
const ITEM_TYPES = new Set([
  "weapon",
  "armor",
  "magic item",
  "superior implement",
  "implement",
  "gear",
]);

export function isItemRecord(entity: ContentEntity): boolean {
  return ITEM_TYPES.has(key(entity.type));
}

/**
 * The entities with every loot record an overlay targets replaced by its
 * overlaid copy (see `overlaidEntity`); the same array when none is.
 * Non-item records keep their authored fields, since power and feature
 * overlays are applied where those fields are read.
 */
export function withOverlaidItems(
  entities: readonly ContentEntity[],
  overlays: readonly FieldOverlay[],
): readonly ContentEntity[] {
  const targets = new Set<string>();
  for (const overlay of overlays) {
    for (const id of overlay.targetDefinitionIds) targets.add(key(id));
    if (overlay.targetName === undefined) continue;
    const name = key(overlay.targetName);
    if (CONTEXT_TARGETS.has(name)) continue;
    targets.add(name);
    targets.add(`large ${name}`);
  }
  if (targets.size === 0) return entities;
  let changed = false;
  const result = entities.map((entity) => {
    if (
      !isItemRecord(entity) ||
      (!targets.has(key(entity.id)) && !targets.has(key(entity.name)))
    )
      return entity;
    const overlaid = overlaidEntity(entity, overlays);
    changed ||= overlaid !== entity;
    return overlaid;
  });
  return changed ? result : entities;
}
