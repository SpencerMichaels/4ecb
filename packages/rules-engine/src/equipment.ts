import { legacySlotMatches } from "./item-fields";
import type { LegacyLoadoutState } from "./loadout-slots";

/**
 * One equipped record as the wearing/not-wearing selectors see it (native
 * HasLoot/LootCheck). `categories` holds the record's categories by ID and
 * name (Two-Handed, Heavy Blade, Polearm), its name, and its overlay-resolved
 * category fields (one entry per Group); `properties` its Properties list.
 */
export interface EquippedItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly categories: readonly string[];
  readonly properties: readonly string[];
  readonly slot?: string;
  /** Native CharLootSlot of the holding (base rows only), which `SLOT:`
   * selectors compare: "Main hand", "Off hand", "Two-hands", "Arms"... */
  readonly lootSlot?: string;
  readonly hands?: number;
  readonly quantity: number;
  /** The holding's base record (CharLoot base), not its enchantment. */
  readonly base?: boolean;
  /** Native IsStaff: a Quarterstaff, staff implement or magic staff. */
  readonly staff?: boolean;
  /**
   * Native WeaponEquiv: a superior implement that is also a weapon (an
   * Accurate dagger is a Dagger); its categories include that weapon's.
   */
  readonly weaponEquivalent?: boolean;
}

export interface EquipmentState {
  readonly items: readonly EquippedItem[];
  /** The resolved loadout the hand slots and powers read (D101). */
  readonly loadout?: LegacyLoadoutState;
}

function normalized(values: readonly string[]): Set<string> {
  return new Set(
    values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean),
  );
}

function selectorTerms(operand: string): readonly string[] {
  return operand
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function matchesTerms(
  categories: ReadonlySet<string>,
  properties: ReadonlySet<string>,
  operand: string,
): boolean {
  return selectorTerms(operand).every((term) => {
    const negated = term.startsWith("!");
    const value = negated ? term.slice(1) : term;
    const match = categories.has(value) || properties.has(value);
    return negated ? !match : match;
  });
}

export function matchesEquipmentSelector(
  item: EquippedItem,
  selector: string,
): boolean {
  const value = selector.trim().toLocaleLowerCase();
  const categories = normalized([item.type, ...item.categories]);
  const properties = normalized(item.properties);
  if (value === "*") return true;
  const colon = value.indexOf(":");
  const prefix = colon < 0 ? "" : value.slice(0, colon);
  const operand = colon < 0 ? value : value.slice(colon + 1);
  // Native LootCheck: a "staff" category is met by any IsStaff record (a
  // Quarterstaff for implement:staff) before the record type is checked.
  if (
    operand.trim() === "staff" &&
    item.staff === true &&
    (prefix === "weapon" || prefix === "implement" || prefix === "only-weapon")
  )
    return true;
  switch (prefix) {
    case "armor":
      return (
        item.type.toLocaleLowerCase() === "armor" &&
        (operand.length === 0 ||
          operand === "*" ||
          matchesTerms(categories, properties, operand))
      );
    case "weapon":
      return (
        (item.type.toLocaleLowerCase() === "weapon" ||
          item.weaponEquivalent === true) &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "implement":
      return (
        categories.has("implement") &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "slot":
      // Native HasLoot SLOT: compares each holding's CharLootSlot.
      if (item.base === false) return false;
      return operand.length === 0
        ? item.slot !== undefined
        : legacySlotMatches(item.lootSlot ?? item.slot ?? "", operand);
    case "only-weapon":
      return (
        (item.type.toLocaleLowerCase() === "weapon" ||
          item.weaponEquivalent === true) &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "versatile":
      return (
        properties.has("versatile") &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "defensive":
      return properties.has("defensive");
    default:
      return (
        categories.has(value) ||
        properties.has(value) ||
        item.name.toLocaleLowerCase() === value ||
        item.id.toLocaleLowerCase() === value
      );
  }
}

const HAND_SLOTS = new Set(["two-hands", "one-hand", "off-hand"]);

/**
 * Native CheckOnlyWeapon: at most one equipped holding whose base fills a
 * hand slot (Two-hands, One-hand, Off-hand); a second weapon, or an off-hand
 * implement, means the weapon is not the only one (two of the same holding
 * are still one). A record without an Item Slot counts when it is a weapon.
 */
function onlyOneHandItem(state: EquipmentState): boolean {
  const held = new Set(
    state.items
      .filter(
        (item) =>
          item.quantity > 0 &&
          item.base !== false &&
          (item.slot === undefined
            ? item.type.toLocaleLowerCase() === "weapon"
            : HAND_SLOTS.has(item.slot.trim().toLocaleLowerCase())),
      )
      .map((item) => item.id),
  );
  return held.size <= 1;
}

export function equipmentPredicate(
  state: EquipmentState,
  selector: string,
): boolean {
  const value = selector.trim().toLocaleLowerCase();
  if (value.startsWith("only-weapon:"))
    return (
      onlyOneHandItem(state) &&
      state.items.some(
        (item) => item.quantity > 0 && matchesEquipmentSelector(item, value),
      )
    );
  if (value.startsWith("dual-wielding:")) {
    const operand = value.slice("dual-wielding:".length);
    const weapons = state.items
      .filter(
        (item) =>
          item.quantity > 0 && item.type.toLocaleLowerCase() === "weapon",
      )
      .flatMap((item) => Array.from({ length: item.quantity }, () => item));
    const terms = selectorTerms(operand);
    if (terms.length === 0) return weapons.length >= 2;
    if (terms.length === 1)
      return (
        weapons.filter((item) =>
          matchesEquipmentSelector(item, `weapon:${terms[0]}`),
        ).length >= 2
      );
    const assign = (
      remaining: readonly EquippedItem[],
      index: number,
    ): boolean => {
      if (index >= terms.length) return true;
      const term = terms[index];
      if (term === undefined) return true;
      return remaining.some(
        (item, itemIndex) =>
          matchesEquipmentSelector(item, `weapon:${term}`) &&
          assign(
            remaining.filter(
              (_, candidateIndex) => candidateIndex !== itemIndex,
            ),
            index + 1,
          ),
      );
    };
    return assign(weapons, 0);
  }
  if (
    value === "dual-shields" ||
    value === "dual-shielding:" ||
    value === "dual-shield:"
  )
    return (
      state.items
        .filter((item) => normalized(item.categories).has("shield"))
        .reduce((sum, item) => sum + item.quantity, 0) >= 2
    );
  return state.items.some(
    (item) => item.quantity > 0 && matchesEquipmentSelector(item, selector),
  );
}
