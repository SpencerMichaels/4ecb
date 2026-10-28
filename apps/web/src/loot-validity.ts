/**
 * Legacy loot validity: which base item an enchantment can be bought on,
 * which magic items become a base plus enchantment when bought, and which
 * items can be held without an enchantment at all. Mirrors the native
 * D20Workspace.IsValidLoot / IsEnchantment and the ?A0x0bed2cbe helpers
 * (IsValidWeapon, ValidateShield, TransformLoot) of the D20RulesEngine.
 */
import type { ContentEntity } from "@4ecb/content-domain";
import { EXCEPTION_IDS } from "@4ecb/rules-engine";

import { contentSpecificValue } from "./builder-ui";

function field(entity: ContentEntity, name: string): string {
  return contentSpecificValue(entity, name)?.trim() ?? "";
}

function lower(value: string): string {
  return value.toLocaleLowerCase();
}

function type(entity: ContentEntity): string {
  return lower(entity.type.trim());
}

/** The text before the first " (" (native stristr(" (") truncation). */
function beforeParenthetical(value: string): string {
  const index = value.indexOf(" (");
  return index < 0 ? value : value.slice(0, index);
}

/**
 * Native ListContains: `item` occurs in the comma-separated `list` as a
 * whole entry (case-insensitive); a list of exactly "any" holds everything.
 * Like native, only the first occurrence is checked.
 */
export function legacyListContains(list: string, item: string): boolean {
  if (lower(list) === "any") return true;
  // Native stristr finds an empty item at the start of an empty list, so an
  // item with no Armor field "fits" an armor with no Armor Category (barding);
  // no record means that, so an empty entry matches nothing.
  if (item === "") return false;
  const start = lower(list).indexOf(lower(item));
  if (start < 0) return false;
  let after = start + item.length;
  while (after < list.length && /\s/u.test(list[after]!)) after += 1;
  if (after < list.length && list[after] !== ",") return false;
  let before = start;
  if (before > 0) before -= 1;
  while (before > 0 && /\s/u.test(list[before]!)) before -= 1;
  return !(before > 0 && list[before] !== ",");
}

/** Native ListContainsOneOf: some comma entry of `hasList` is in `list`. */
export function legacyListContainsOneOf(
  list: string,
  hasList: string,
): boolean {
  return hasList
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .some((value) => legacyListContains(list, value));
}

const LOOT_TYPES = new Set([
  "armor",
  "weapon",
  "magic item",
  "superior implement",
  "ritual",
  "gear",
]);

/**
 * Native FindRulesElement: a record by internal ID or name
 * (case-insensitive), optionally of one type.
 */
export type LootFinder = (
  idOrName: string,
  type?: string,
) => ContentEntity | undefined;

const finderCache = new WeakMap<readonly ContentEntity[], LootFinder>();

export function lootFinder(entities: readonly ContentEntity[]): LootFinder {
  const cached = finderCache.get(entities);
  if (cached !== undefined) return cached;
  const byKey = new Map<string, ContentEntity[]>();
  const add = (key: string, entity: ContentEntity) => {
    const list = byKey.get(lower(key.trim()));
    if (list === undefined) byKey.set(lower(key.trim()), [entity]);
    else if (!list.includes(entity)) list.push(entity);
  };
  for (const entity of entities) {
    add(entity.id, entity);
    add(entity.name, entity);
  }
  const finder: LootFinder = (idOrName, wanted) =>
    byKey
      .get(lower(idOrName.trim()))
      ?.find((entity) => wanted === undefined || type(entity) === wanted);
  finderCache.set(entities, finder);
  return finder;
}

function isMagicItem(entity: ContentEntity): boolean {
  return type(entity) === "magic item";
}

/** Native ?A0x0bed2cbe.IsShield: Armor Type or _IsEnchant "Shield". */
function isShield(entity: ContentEntity): boolean {
  return (
    lower(field(entity, "Armor Type")) === "shield" ||
    lower(field(entity, "_IsEnchant")) === "shield"
  );
}

/**
 * Native D20Workspace.IsEnchantment: an Armor or Weapon magic item, or a
 * shield Arms Slot Item. Such an item is bought on a base item, never alone.
 */
export function isLegacyEnchantment(entity: ContentEntity): boolean {
  if (!isMagicItem(entity)) return false;
  const magicType = lower(field(entity, "Magic Item Type"));
  return (
    magicType === "armor" ||
    magicType === "weapon" ||
    (magicType === "arms slot item" && isShield(entity))
  );
}

/** Native D20RulesEngine.IsRanged. */
function isRanged(base: ContentEntity): boolean {
  return (
    lower(field(base, "Weapon Category")).includes("ranged") ||
    field(base, "Range") !== ""
  );
}

/** Native ?A0x0bed2cbe.IsValidWeapon: the enchantment's Weapon field. */
export function isValidWeaponBase(
  base: ContentEntity,
  enchant: ContentEntity,
  find: LootFinder,
): boolean {
  if (!isMagicItem(enchant)) return false;
  const weapon = beforeParenthetical(field(enchant, "Weapon"));
  const allowed = lower(weapon);
  const category = lower(field(base, "Weapon Category"));
  const hands = lower(field(base, "Hands Required"));
  const properties = lower(field(base, "Properties"));
  if (allowed === "spiked gauntlets")
    return lower(base.name.trim()) === "spiked gauntlet";
  if (allowed === "any melee") return category.includes("melee");
  if (allowed === "any melee except reach weapons")
    return category.includes("melee") && !properties.includes("reach");
  if (
    allowed === "any one-handed melee weapon" ||
    allowed === "one-handed melee weapon" ||
    allowed === "any one-handed melee"
  )
    return category.includes("melee") && hands === "one-handed";
  if (allowed === "any one-handed weapon") return hands === "one-handed";
  if (allowed === "any ranged") return isRanged(base);
  if (allowed === "any thrown") return properties.includes("thrown");
  const secondaryId = field(base, "_Secondary End");
  const secondary =
    secondaryId === "" ? undefined : find(secondaryId, "weapon");
  return (
    legacyListContainsOneOf(weapon, field(base, "Group")) ||
    legacyListContains(weapon, base.name.trim()) ||
    (secondary !== undefined &&
      legacyListContainsOneOf(weapon, field(secondary, "Group")))
  );
}

/**
 * Native ?A0x0bed2cbe.ValidateShield: a shield takes an Arms Slot Item
 * named for shields.
 *
 * D091: native has no path for an Armor magic item that names shields in
 * its Armor field (Shield of Turathi Defiance: "Heavy Shields, Light
 * Shields"), so it can never be bought. Its Armor field states the shields it
 * fits, so such an item may also go on a shield its list names explicitly
 * (an "Any" list still never reaches a shield).
 */
function isValidShieldBase(
  base: ContentEntity,
  enchant: ContentEntity,
): boolean {
  const magicType = lower(field(enchant, "Magic Item Type"));
  if (magicType === "arms slot item")
    return lower(enchant.name).includes("shield");
  if (magicType !== "armor") return false;
  const armor = beforeParenthetical(field(enchant, "Armor"));
  return (
    lower(armor) !== "any" &&
    (legacyListContains(armor, field(base, "Armor Category")) ||
      legacyListContains(armor, base.name.trim()))
  );
}

function hasMinimumEnhancement(base: ContentEntity): boolean {
  const minimum = field(base, "Minimum Enhancement Bonus");
  return minimum !== "" && minimum !== "-";
}

/** Native _wtoi: the leading signed integer, else 0. */
function leadingInteger(value: string): number {
  return Number.parseInt(value.match(/^\s*[+-]?\d+/u)?.[0] ?? "0", 10);
}

export interface LootValidityOptions {
  /** The character has the Inherent Bonuses house rule. */
  readonly inherentBonuses?: boolean;
}

/**
 * Native D20Workspace.IsValidLoot: whether `base` (with `enchant`, when
 * given) is a holding the character can have.
 */
export function isValidLoot(
  base: ContentEntity,
  enchant: ContentEntity | undefined,
  find: LootFinder,
  options: LootValidityOptions = {},
): boolean {
  if (!LOOT_TYPES.has(type(base))) return false;
  if (enchant !== undefined && !LOOT_TYPES.has(type(enchant))) return false;
  if (enchant === undefined) {
    if (isMagicItem(base)) {
      const magicType = lower(field(base, "Magic Item Type"));
      return magicType !== "weapon" && magicType !== "armor";
    }
    // Masterwork armor is made with its enhancement; only the Inherent
    // Bonuses rule lets it go without one.
    if (type(base) === "armor" && hasMinimumEnhancement(base))
      return options.inherentBonuses === true;
    return true;
  }
  switch (type(base)) {
    case "weapon":
      return isValidWeaponBase(base, enchant, find);
    case "superior implement": {
      if (!isMagicItem(enchant)) return false;
      const group = lower(field(base, "Group"));
      if (lower(field(enchant, "Magic Item Type")) === group) return true;
      if (group === "staff") {
        const quarterstaff = find(EXCEPTION_IDS.quarterstaff);
        if (
          quarterstaff !== undefined &&
          isValidWeaponBase(quarterstaff, enchant, find)
        )
          return true;
      }
      const equivalentId = field(base, "WeaponEquiv");
      const equivalent =
        equivalentId === "" ? undefined : find(equivalentId, "weapon");
      return (
        equivalent !== undefined && isValidWeaponBase(equivalent, enchant, find)
      );
    }
    case "armor": {
      if (lower(field(base, "Armor Type")) === "shield")
        return isValidShieldBase(base, enchant);
      if (!isMagicItem(enchant)) return false;
      const armor = beforeParenthetical(field(enchant, "Armor"));
      if (
        !legacyListContains(armor, field(base, "Armor Category")) &&
        !legacyListContains(armor, base.name.trim())
      )
        return false;
      if (!hasMinimumEnhancement(base)) return true;
      return (
        leadingInteger(field(enchant, "Enhancement")) >=
        leadingInteger(field(base, "Minimum Enhancement Bonus"))
      );
    }
    default:
      return false;
  }
}

/**
 * Native ?A0x0bed2cbe.TransformLoot: a slotless magic item whose Weapon (or
 * else Armor) field names one weapon (armor) record is bought as that base
 * with the item as its enchantment.
 */
export function transformedLootBase(
  item: ContentEntity,
  find: LootFinder,
): ContentEntity | undefined {
  if (!isMagicItem(item)) return undefined;
  if (field(item, "Magic Item Type") === "") return undefined;
  if (field(item, "Item Slot") !== "") return undefined;
  const weapon = field(item, "Weapon");
  const armor = field(item, "Armor");
  return (
    (weapon === "" ? undefined : find(weapon, "weapon")) ??
    (armor === "" ? undefined : find(armor, "armor"))
  );
}
