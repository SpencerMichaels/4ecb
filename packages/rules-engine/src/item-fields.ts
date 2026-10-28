import { formatInventoryItemName } from "@4ecb/character-domain";
import { legacyListContains, type ContentEntity } from "@4ecb/content-domain";

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

/**
 * One overlay applied to a field's current value (native CalcModifiedValue):
 * a list-addition, else a die-increase, else the value. A list-addition the
 * field already contains (ListContains, so also any field that is "any")
 * leaves it unchanged, as native ProcessModify skips the Modify.
 */
export function modifiedFieldValue(
  current: string | undefined,
  overlay: FieldOverlay,
): string | undefined {
  if (overlay.listAddition !== undefined)
    return legacyListContains(current ?? "", overlay.listAddition)
      ? current
      : [current, overlay.listAddition].filter(Boolean).join(", ");
  if (overlay.dieIncrease !== undefined)
    return increaseDamageDie(current ?? "", Number(overlay.dieIncrease) || 1);
  return overlay.value ?? current;
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
      value = modifiedFieldValue(value, overlay);
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
    const value = modifiedFieldValue(fields[existingName], overlay);
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

/** Legacy IsDoubleWeapon. */
export function legacyIsDoubleWeapon(
  weapon: ContentEntity | undefined,
): boolean {
  if (weapon === undefined) return false;
  return (
    (key(rawField(weapon, "Hands Required") ?? "") === "two-handed" &&
      /off-hand/iu.test(rawField(weapon, "Properties") ?? "")) ||
    (rawField(weapon, "_Secondary End")?.trim() ?? "") !== ""
  );
}

/** The character's item name, composed exactly as the inventory and sheet
 * name it (e.g. "Aversion Quickbeam Staff +2"), never a joined part list. */
export function equipmentName(parts: readonly ContentEntity[]): string {
  return formatInventoryItemName(
    parts.map((part) => ({
      name: part.name,
      type: part.type,
      magicItemType: rawField(part, "Magic Item Type"),
    })),
  );
}

/** The character facts native ItemSlot and CharLootSlot read. */
export interface LootSlotContext {
  /** HasNamedRulesElement "Small" (Size). */
  readonly small: boolean;
  /** "Oversized" (Internal). */
  readonly oversized: boolean;
  /** "One Size Larger" (Internal). */
  readonly oneSizeLarger: boolean;
  /** "Ambidextrous" (Internal). */
  readonly ambidextrous: boolean;
  /** Native _INTERNAL_MainHandWeapon: the name of the item alone in the
   * main hand, from the resolved loadout (`legacyLoadoutState`, D101). */
  readonly mainHandWeapon?: string;
}

/**
 * Native ItemSlot (`-Module-.cs` ~19019): the base record's Item Slot as
 * the character fills it. A staff is held off-hand; a Small character (not
 * One Size Larger) cannot hold a non-small two-handed weapon and holds a
 * non-small versatile one in two hands; a Large weapon needs Oversized or
 * One Size Larger, which also lets a two-handed weapon be held in one hand;
 * Ambidextrous makes a one-handed item an off-hand one.
 */
export function legacyItemSlot(
  base: ContentEntity,
  context: LootSlotContext,
): string {
  let slot = rawField(base, "Item Slot") ?? "";
  const staff = legacyIsStaff(base);
  if (staff) return "off-hand";
  const weapon = key(base.type) === "weapon";
  const smallItem =
    /small/iu.test(rawField(base, "Properties") ?? "") || !weapon;
  let oneSizeLarger = context.oneSizeLarger;
  let small = context.small;
  if (small && oneSizeLarger) {
    oneSizeLarger = false;
    small = false;
  }
  if (small && smallItem) small = false;
  if (small) {
    if (key(slot) === "two-hands") return "";
    if (/versatile/iu.test(rawField(base, "Properties") ?? ""))
      slot = "two-hands";
  }
  if (legacyIsLargeWeapon(base)) {
    if (!legacyCanUseLargeWeapons(context)) return "";
  } else if (key(slot) === "two-hands" && oneSizeLarger) slot = "one-hand";
  if (key(slot) === "one-hand" && context.ambidextrous) slot = "off-hand";
  return slot;
}

/**
 * The size facts native ItemSlot, CharLootSlot, CanUseLargeWeapons and
 * SmallWithNonSmallWeapon read, from the character's owned records.
 */
export function legacyLootSlotContext(
  owned: readonly ContentEntity[],
): LootSlotContext {
  const owns = (type: string, name: string) =>
    owned.some(
      (entity) => key(entity.type) === type && key(entity.name) === key(name),
    );
  return {
    small: owns("size", EXCEPTION_NAMES.smallSize),
    oversized: owns("internal", EXCEPTION_NAMES.oversized),
    oneSizeLarger: owns("internal", EXCEPTION_NAMES.oneSizeLarger),
    ambidextrous: owns("internal", EXCEPTION_NAMES.ambidextrous),
  };
}

/** Native IsLargeWeapon (`-Module-.cs` ~19006): a weapon whose Size is Large. */
export function legacyIsLargeWeapon(base: ContentEntity): boolean {
  return (
    key(base.type) === "weapon" && key(rawField(base, "Size") ?? "") === "large"
  );
}

/**
 * Native CanUseLargeWeapons (`-Module-.cs` ~18929): Oversized, or One Size
 * Larger when not Small. Without it a Large weapon has no slot (ItemSlot)
 * and no proficiency (IsProficient).
 */
export function legacyCanUseLargeWeapons(
  context: Pick<LootSlotContext, "small" | "oversized" | "oneSizeLarger">,
): boolean {
  return context.oversized || (context.oneSizeLarger && !context.small);
}

/**
 * Why native ItemSlot leaves a weapon with no slot, so native ValidateEquip
 * refuses to equip it: "large" for a Large weapon the character can't use
 * (CanUseLargeWeapons), "small" for a non-small two-handed weapon held by a
 * Small character. Undefined when the weapon fits a slot (D102).
 */
export function legacyUnwieldableReason(
  base: ContentEntity,
  context: LootSlotContext,
): "small" | "large" | undefined {
  if (key(base.type) !== "weapon" || legacyIsStaff(base)) return undefined;
  if ((rawField(base, "Item Slot") ?? "").trim() === "") return undefined;
  if (legacyItemSlot(base, context) !== "") return undefined;
  return legacyIsLargeWeapon(base) && !legacyCanUseLargeWeapons(context)
    ? "large"
    : "small";
}

/** One equipped holding as native CharLootSlot sees it. */
export interface LootSlotHolding {
  /** The holding's base record (CharLoot base). */
  readonly base: ContentEntity;
  /** CharLootName: the holding's custom or composed name. */
  readonly name: string;
  readonly equippedQuantity: number;
  /** Native loot `_AlternateSlot`: worn in the base's alternate slot (the
   * loadout places it there, D101). */
  readonly alternate: boolean;
  /** Native _INTERNAL_VersatileUsedTwoHanded for this holding: a versatile
   * weapon the loadout holds in both hands (D101). */
  readonly twoHanded?: boolean;
}

/**
 * Native CharLootSlot (`-Module-.cs` ~19151) for each equipped holding, the
 * slot HasLoot's `SLOT:` selector compares: "Two-hands" for a double weapon,
 * the record's `_AlternateSlot` (wrist razors on the arms) when the holding
 * is worn there, "Main hand, off hand" for two equipped (not rings),
 * "Two-hands" for a versatile weapon used two-handed, "Main hand" for a
 * one-handed item (or the off-hand item named as the main-hand weapon when
 * no one-handed item is equipped), "Off hand" for an off-hand item, else the
 * ItemSlot.
 */
export function legacyLootSlots(
  holdings: readonly LootSlotHolding[],
  context: LootSlotContext,
): string[] {
  const itemSlots = holdings.map((holding) =>
    legacyItemSlot(holding.base, context),
  );
  // Native SlotEquipped("one-hand"): a one-handed item, or two of an
  // off-hand one.
  const oneHandEquipped = holdings.some(
    (holding, index) =>
      holding.equippedQuantity >= 1 &&
      (key(itemSlots[index] ?? "") === "one-hand" ||
        (key(itemSlots[index] ?? "") === "off-hand" &&
          holding.equippedQuantity > 1)),
  );
  return holdings.map((holding, index) => {
    if (legacyIsDoubleWeapon(holding.base)) return "Two-hands";
    if (holding.equippedQuantity <= 0) return itemSlots[index] ?? "";
    if (holding.alternate)
      return rawField(holding.base, "_AlternateSlot") ?? "";
    let slot = itemSlots[index] ?? "";
    if (holding.equippedQuantity === 2 && key(slot) !== "ring")
      return "Main hand, off hand";
    if (
      /versatile/iu.test(rawField(holding.base, "Properties") ?? "") &&
      holding.twoHanded === true &&
      !legacySmallWithNonSmallWeapon(holding.base, context)
    )
      return "Two-hands";
    if (key(slot) === "one-hand") return "Main hand";
    if (
      !oneHandEquipped &&
      context.mainHandWeapon !== undefined &&
      context.mainHandWeapon === holding.name
    )
      slot = "Main hand";
    if (key(slot) === "off-hand") return "Off hand";
    return slot;
  });
}

/** Native SmallWithNonSmallWeapon. */
function legacySmallWithNonSmallWeapon(
  weapon: ContentEntity,
  context: LootSlotContext,
): boolean {
  return (
    context.small &&
    !context.oneSizeLarger &&
    !/small/iu.test(rawField(weapon, "Properties") ?? "")
  );
}

/**
 * Native HasLoot `SLOT:<slot>` (`-Module-.cs` ~19418): an equipped holding
 * whose CharLootSlot is the slot (string-table equality, which ignores
 * case); `off hand`/`off-hand` is also met by two equipped of one item or a
 * two-handed one.
 */
export function legacySlotMatches(lootSlot: string, slot: string): boolean {
  if (key(lootSlot) === key(slot)) return true;
  return (
    (key(slot) === "off-hand" || key(slot) === "off hand") &&
    (key(lootSlot) === "main hand, off hand" || key(lootSlot) === "two-hands")
  );
}

/** Native IsKiFocus (D20RulesEngine): the Ki Focus gear, or a magic item
 * whose Magic Item Type is Ki Focus. */
export function legacyIsKiFocus(entity: ContentEntity | undefined): boolean {
  if (entity === undefined) return false;
  if (key(entity.id) === key(EXCEPTION_IDS.kiFocusGear)) return true;
  return (
    key(entity.type) === "magic item" &&
    key(rawField(entity, "Magic Item Type") ?? "") === "ki focus"
  );
}

const IMPLEMENT_MAGIC_ITEM_TYPES = new Set([
  "rod",
  "staff",
  "wand",
  "orb",
  "totem",
  "tome",
  "holy symbol",
  "ki focus",
]);

const IMPLEMENT_GEAR_NAMES = new Set(["holy symbol", "totem", "ki focus"]);

/**
 * Native ImplementType: a magic item's implement Magic Item Type, a gear
 * record named "Implement, <kind>", "<kind> Implement", Holy Symbol, Totem
 * or Ki Focus, or a superior implement's WeaponEquiv record name, else its
 * Group (possibly empty, which still makes it an implement).
 */
export function legacyImplementType(
  entity: ContentEntity,
  weaponEquiv: (entity: ContentEntity) => ContentEntity | undefined,
): string | undefined {
  switch (key(entity.type)) {
    case "magic item": {
      const type = rawField(entity, "Magic Item Type")?.trim() ?? "";
      return IMPLEMENT_MAGIC_ITEM_TYPES.has(key(type)) ? type : undefined;
    }
    case "gear": {
      const name = entity.name.trim();
      const prefixed = /^implement, (.*)$/iu.exec(name)?.[1];
      if (prefixed !== undefined) return prefixed;
      const suffixed = /^(.+) implement$/iu.exec(name)?.[1];
      if (suffixed !== undefined) return suffixed;
      return IMPLEMENT_GEAR_NAMES.has(key(name)) ? name : undefined;
    }
    case "superior implement":
      return weaponEquiv(entity)?.name ?? rawField(entity, "Group") ?? "";
    default:
      return undefined;
  }
}

/**
 * The item fields naming the classes an item is an implement for:
 * `_ImplementForClass` and its alias `_ImplementAsClass`, read identically
 * (same value grammar, both honored when both are present).
 *
 * Deliberate D091 difference from legacy: native LootImplement,
 * IsSpecialImplement and the implement-proficiency check read only
 * `_ImplementForClass`. The official content's only `_ImplementAsClass`
 * writer is the Avernian Knight's Melee Implement ("You can use any melee
 * weapon as a warlock implement"), whose Internal list-adds the Warlock class
 * to 74 melee weapons, so in the legacy builder the feature did nothing.
 * Reading the alias makes it work, and covers homebrew that uses it.
 */
export const IMPLEMENT_CLASS_FIELDS = [
  "_ImplementForClass",
  "_ImplementAsClass",
] as const;

/**
 * Native LootImplement for a loot's base and enchantment: what it is an
 * implement as ("Staff", "Ki Focuses", ImplementType, the base's or else the
 * enchantment's `_ImplementEquiv`), or, for an `_ImplementForClass` (or alias
 * `_ImplementAsClass`) item, "instrument" (a bard's) or "Implement".
 * Undefined when it is no implement. BuildKeywordSet names its
 * "<value> implement" channels from it.
 */
export function legacyLootImplement(
  base: ContentEntity | undefined,
  enchant: ContentEntity | undefined,
  resolve: {
    readonly weaponEquiv: (entity: ContentEntity) => ContentEntity | undefined;
    readonly record: (reference: string) => ContentEntity | undefined;
  },
): string | undefined {
  if (base === undefined) return undefined;
  if (legacyIsStaff(base)) return "Staff";
  if (legacyIsKiFocus(base)) return "Ki Focuses";
  const type = legacyImplementType(base, resolve.weaponEquiv);
  if (type !== undefined) return type;
  const equivalent =
    rawField(base, "_ImplementEquiv")?.trim() ||
    (enchant === undefined
      ? ""
      : (rawField(enchant, "_ImplementEquiv")?.trim() ?? ""));
  if (equivalent !== "") return equivalent;
  // Native IsSpecialImplement: the base's `_ImplementForClass` value names a
  // record (FindRulesElement on the whole value, so a list or qualified
  // value such as "Druid,Shaman" or "warlock(dwarf)" is not special here;
  // implement eligibility reads those through powers.ts implementScopes).
  // The alias is checked the same way, after `_ImplementForClass`.
  const special = IMPLEMENT_CLASS_FIELDS.map((name) => {
    const value = rawField(base, name)?.trim() ?? "";
    return value === "" ? undefined : resolve.record(value);
  }).find((record) => record !== undefined);
  if (special === undefined) return undefined;
  return key(special.name) === key(EXCEPTION_NAMES.bardClass)
    ? "instrument"
    : "Implement";
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
