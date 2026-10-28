import { traceCondition } from "./condition-trace";
import { EXCEPTION_IDS } from "./exceptions";
import { legacySlotMatches } from "./item-fields";
import type { LegacyLoadoutState } from "./loadout-slots";

/**
 * One equipped record as the wearing/not-wearing selectors see it (native
 * HasLoot/LootCheck). `categories` holds the record's categories by ID and
 * name (Two-Handed, Heavy Blade, Polearm), its name, and its overlay-resolved
 * category fields (one entry per Group); `properties` its Properties list.
 */
export interface EquippedItem {
  /** The holding (inventory entry). */
  readonly id: string;
  /** The record's ID. */
  readonly definitionId?: string;
  readonly name: string;
  readonly type: string;
  readonly categories: readonly string[];
  readonly properties: readonly string[];
  /** The record's overlay-resolved Group list. */
  readonly groups?: readonly string[];
  readonly slot?: string;
  /** Native ItemSlot of the holding's base (`legacyItemSlot`): the Item
   *  Slot as this character fills it (Ambidextrous makes "one-hand"
   *  "off-hand"; a staff is "off-hand"). */
  readonly itemSlot?: string;
  /** Native IsDoubleWeapon of the base (a staff read as the Quarterstaff). */
  readonly doubleWeapon?: boolean;
  /** Native WieldingDefensive's weapon test: the base (a staff read as the
   *  Quarterstaff) is a weapon with the Defensive property that the
   *  character is proficient with (native IsProficient). */
  readonly defensiveWeapon?: boolean;
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
    default:
      return (
        categories.has(value) ||
        properties.has(value) ||
        item.name.toLocaleLowerCase() === value ||
        item.id.toLocaleLowerCase() === value
      );
  }
}

const ITEM_SLOT_KEY = (item: EquippedItem) =>
  (item.itemSlot ?? item.slot ?? "").trim().toLocaleLowerCase();

/** Equipped base records of the holdings (native CharLoot base elements). */
function bases(state: EquipmentState): EquippedItem[] {
  return state.items.filter((item) => item.quantity > 0 && item.base !== false);
}

/**
 * Native IsDualWielding (D20Workspace.cs, DWSlotEquipped `-Module-.cs`
 * ~18860): a non-armor holding whose ItemSlot is "off-hand" and another
 * whose ItemSlot is "one-hand" (or more than one off-hand item), or a
 * double weapon (a staff counts as the Quarterstaff) as the only hand item.
 * Two one-handed weapons are not dual-wielding unless Ambidextrous makes
 * one-handed weapons off-hand ones.
 */
export function legacyIsDualWielding(state: EquipmentState): boolean {
  const held = bases(state).filter(
    (item) => item.type.trim().toLocaleLowerCase() !== "armor",
  );
  const offHand = held
    .filter((item) => ITEM_SLOT_KEY(item) === "off-hand")
    .reduce((sum, item) => sum + item.quantity, 0);
  if (
    offHand > 0 &&
    (offHand > 1 || held.some((item) => ITEM_SLOT_KEY(item) === "one-hand"))
  )
    return true;
  return (
    bases(state).some((item) => item.doubleWeapon === true) &&
    onlyOneHandItem(state)
  );
}

/** Whether any of a weapon's groups is in the comma list (native
 *  ListContainsOneOf/ListContains, ignoring case). */
function groupInList(item: EquippedItem, list: readonly string[]): boolean {
  if (list.includes("*")) return true;
  return (item.groups ?? []).some((group) =>
    list.includes(group.trim().toLocaleLowerCase()),
  );
}

/**
 * Native DualWieldingConditional (`-Module-.cs` ~19300) for
 * `DUAL-WIELDING:<operand>`: dual-wielding, and then for an empty operand
 * nothing more; for `off-hand` every equipped weapon has the off-hand
 * property; for `rapier-blade` a rapier and another weapon that is an
 * off-hand light blade; otherwise every equipped weapon has a Group in the
 * operand's comma list (so "heavy blade,light blade" is met by two light
 * blades too).
 */
function dualWieldingConditional(
  state: EquipmentState,
  operand: string,
): boolean {
  if (!legacyIsDualWielding(state)) return false;
  if (operand.length === 0) return true;
  const weapons = bases(state).filter(
    (item) => item.type.trim().toLocaleLowerCase() === "weapon",
  );
  const offHandProperty = (item: EquippedItem) =>
    item.properties.some((property) => /off-hand/iu.test(property));
  if (operand === "off-hand") return weapons.every(offHandProperty);
  if (operand === "rapier-blade") {
    const rapier = (item: EquippedItem) =>
      [EXCEPTION_IDS.rapier, EXCEPTION_IDS.largeRapier].some((id) =>
        (item.definitionId ?? "")
          .toLocaleLowerCase()
          .includes(id.toLocaleLowerCase()),
      );
    return (
      weapons.some(rapier) &&
      weapons.some(
        (item) =>
          !rapier(item) &&
          offHandProperty(item) &&
          (item.groups ?? []).some((group) => /light blade/iu.test(group)),
      )
    );
  }
  const list = selectorTerms(operand).map((term) => term.toLocaleLowerCase());
  return weapons.every((item) => groupInList(item, list));
}

/**
 * Native WieldingDefensive (`-Module-.cs` ~19206): dual-wielding with a
 * Defensive weapon the character is proficient with (a staff read as the
 * Quarterstaff).
 */
function wieldingDefensive(state: EquipmentState): boolean {
  return (
    legacyIsDualWielding(state) &&
    bases(state).some((item) => item.defensiveWeapon === true)
  );
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

/** Prefixes `matchesEquipmentSelector` dispatches on. */
const ITEM_SELECTOR_PREFIXES = new Set([
  "armor",
  "weapon",
  "implement",
  "slot",
  "only-weapon",
  "versatile",
]);

/**
 * Which matcher branch a `wearing`/`not-wearing` operand takes: `any`
 * (`*`), `name` (no colon: a category, property, record name or ID), a
 * prefix the matcher knows, `dual-wielding`/`dual-shield`, or
 * `unrecognized` (a prefix nothing handles, matched as a whole name).
 */
export function equipmentSelectorBranch(selector: string): string {
  const value = selector.trim().toLocaleLowerCase();
  if (value === "*") return "any";
  if (value.startsWith("dual-wielding:")) return "dual-wielding";
  if (value === "defensive:") return "defensive";
  if (
    value === "dual-shields" ||
    value === "dual-shielding:" ||
    value === "dual-shield:"
  )
    return "dual-shield";
  const colon = value.indexOf(":");
  if (colon < 0) return "name";
  const prefix = value.slice(0, colon);
  return ITEM_SELECTOR_PREFIXES.has(prefix) ? prefix : "unrecognized";
}

/** Native HasLoot: whether the equipped holdings meet a `wearing` operand.
 *  Reports each decision to the opt-in condition trace. */
export function equipmentPredicate(
  state: EquipmentState,
  selector: string,
): boolean {
  return traceCondition(
    "selector",
    selector,
    untracedEquipmentPredicate(state, selector),
  );
}

function untracedEquipmentPredicate(
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
  if (value.startsWith("dual-wielding:"))
    return dualWieldingConditional(
      state,
      value.slice("dual-wielding:".length).trim(),
    );
  if (value === "defensive:") return wieldingDefensive(state);
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
