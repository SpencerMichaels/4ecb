import type {
  BuildInventoryElement,
  EquipmentSlotAssignment,
  EquipmentSlotId,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { equipmentName } from "./item-fields";

/**
 * The single loadout-slot resolver shared by the evaluator, the builder's
 * Loadout editor and the sheet: which slots a holding can occupy, and which
 * slots each equipped holding occupies once legacy `equip-count` holdings
 * (no recorded slots) are projected into the modern slot model (D101).
 */
type ItemElements = {
  readonly elements: readonly Pick<BuildInventoryElement, "definitionId">[];
};

export interface LoadoutHolding extends ItemElements {
  readonly id: string;
  readonly quantity: number;
  readonly equippedQuantity: number;
  /** Exact modern slots; missing on an imported legacy equip count. */
  readonly equippedSlots?: readonly EquipmentSlotAssignment[];
  /** The holding's custom name (legacy CharLootName). */
  readonly name?: string;
  /** Legacy loot attributes; `_AlternateSlot` places an imported holding
   * without exact slots in its record's alternate slot. */
  readonly overrides?: Readonly<Record<string, string>>;
  /** A versatile weapon wielded in two hands (undefined: no modern
   * choice, so an imported holding follows the legacy text string). */
  readonly wieldedTwoHanded?: boolean;
}

/**
 * The legacy character text strings that place imported holdings without
 * exact slots: `_INTERNAL_MainHandWeapon` (the item native last equipped in
 * a hand as the main-hand weapon) and `_INTERNAL_VersatileUsedTwoHanded`.
 */
export interface LegacyLoadoutHints {
  readonly mainHandWeapon?: string;
  readonly versatileUsedTwoHanded?: boolean;
}

export interface ResolvedLoadoutAssignments {
  readonly assignmentsByEntry: ReadonlyMap<
    string,
    readonly EquipmentSlotAssignment[]
  >;
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function specific(entity: ContentEntity, name: string): string | undefined {
  const wanted = key(name);
  const value = entity.specifics.find(
    (field) => key(field.name) === wanted,
  )?.value;
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function textValue(
  textStrings: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  return Object.entries(textStrings).find(
    ([textName]) => key(textName) === key(name),
  )?.[1];
}

/** The loadout hints an imported character's text strings carry. */
export function legacyLoadoutHints(
  textStrings: Readonly<Record<string, string>> | undefined,
): LegacyLoadoutHints {
  if (textStrings === undefined) return {};
  const mainHandWeapon = textValue(textStrings, "_INTERNAL_MainHandWeapon");
  const versatile = textValue(textStrings, "_INTERNAL_VersatileUsedTwoHanded");
  return {
    ...(mainHandWeapon === undefined || mainHandWeapon.trim() === ""
      ? {}
      : { mainHandWeapon }),
    // Native _wtoi(text) != 0.
    ...((Number.parseInt(versatile ?? "", 10) || 0) !== 0
      ? { versatileUsedTwoHanded: true }
      : {}),
  };
}

/** Legacy IsShield: an armor whose Armor Type names a shield. */
export function isAuthoredShield(entity: ContentEntity): boolean {
  return (
    key(entity.type) === "armor" &&
    key(specific(entity, "Armor Type") ?? "").includes("shield")
  );
}

/** Lowercased content IDs of a holding's base/enchantment elements. */
export function inventoryDefinitionIds<Item extends ItemElements>(
  entry: Item,
): readonly string[] {
  return entry.elements.flatMap(({ definitionId }) =>
    definitionId === undefined ? [] : [definitionId.toLocaleLowerCase()],
  );
}

function definitionsOf(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  return inventoryDefinitionIds(entry).flatMap((id) => {
    const entity = byId.get(id);
    return entity === undefined ? [] : [entity];
  });
}

/** Authored slot words and the modern slots they name. */
const SLOT_WORDS = [
  ["body", "body"],
  ["head", "head"],
  ["neck", "neck"],
  ["arms", "arms"],
  ["hands", "hands"],
  ["ring", "ring-1"],
  ["ring", "ring-2"],
  ["waist", "waist"],
  ["feet", "feet"],
  ["holy symbol", "symbol"],
  ["symbol", "symbol"],
  ["ki focus", "ki-focus"],
  ["tattoo", "tattoo"],
  ["companion", "companion"],
  ["familiar", "familiar"],
  ["mount", "mount"],
] as const;

/**
 * The modern slot a holding's base record names as its `_AlternateSlot`
 * (native CharLootItemSlot offers it beside the Item Slot): Wrist Razors on
 * the arms, a spiked gauntlet on the hands.
 */
export function inventoryAlternateSlot<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
): EquipmentSlotId | undefined {
  const base = definitionsOf(entry, byId)[0];
  const alternate = key(
    base === undefined ? "" : (specific(base, "_AlternateSlot") ?? ""),
  );
  if (alternate === "") return undefined;
  return SLOT_WORDS.find(([word]) => alternate === word)?.[1];
}

/** The modern slots a holding may occupy, from its authored content. */
export function inventorySlotCandidates<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly EquipmentSlotId[] {
  const alternate = inventoryAlternateSlot(entry, byId);
  const authored = authoredSlotCandidates(entry, byId);
  return alternate === undefined || authored.includes(alternate)
    ? authored
    : [...authored, alternate];
}

function authoredSlotCandidates(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly EquipmentSlotId[] {
  const definitions = definitionsOf(entry, byId);
  const item = definitions[0];
  const armor = definitions.find(
    (definition) => key(definition.type) === "armor",
  );
  const slots = definitions
    .flatMap((definition) => [
      specific(definition, "Item Slot") ?? "",
      specific(definition, "Magic Item Type") ?? "",
    ])
    .join("\n")
    .toLocaleLowerCase();
  const candidates: EquipmentSlotId[] = [];
  if (armor !== undefined && isAuthoredShield(armor)) {
    return ["off-hand"];
  }
  if (
    slots.includes("two-hand") ||
    slots.includes("off-hand") ||
    slots.includes("one-hand")
  ) {
    candidates.push("main-hand", "off-hand");
  }
  if (slots.includes("head and neck")) candidates.push("head", "neck");
  if (key(item?.type ?? "") === "weapon") {
    return ["main-hand", "off-hand"];
  }
  if (armor !== undefined) return ["body"];
  return [
    ...new Set(
      candidates.concat(
        SLOT_WORDS.filter(([needle]) => slots.includes(needle)).map(
          ([, slot]) => slot,
        ),
      ),
    ),
  ];
}

function inventoryWeapon(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
): ContentEntity | undefined {
  return definitionsOf(entry, byId).find(
    (entity) => key(entity.type) === "weapon",
  );
}

/** Whether the holding's weapon has the versatile property. */
export function inventoryIsVersatile<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
): boolean {
  const weapon = inventoryWeapon(entry, byId);
  return (
    weapon !== undefined &&
    /versatile/iu.test(specific(weapon, "Properties") ?? "")
  );
}

/**
 * A versatile weapon the character wields in two hands: the holding's own
 * choice, or, for an imported holding without exact slots and no modern
 * choice, legacy `_INTERNAL_VersatileUsedTwoHanded` (native applies it to
 * every versatile weapon).
 */
export function inventoryWieldsTwoHanded<
  Item extends ItemElements &
    Pick<LoadoutHolding, "wieldedTwoHanded" | "equippedSlots">,
>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LegacyLoadoutHints = {},
): boolean {
  if (!inventoryIsVersatile(entry, byId)) return false;
  return (
    entry.wieldedTwoHanded ??
    (entry.equippedSlots === undefined && hints.versatileUsedTwoHanded === true)
  );
}

/** True when the holding fills both hand slots: a two-handed weapon, or a
 * versatile one wielded two-handed. */
export function inventoryRequiresBothHands<
  Item extends ItemElements &
    Pick<LoadoutHolding, "wieldedTwoHanded" | "equippedSlots">,
>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LegacyLoadoutHints = {},
): boolean {
  const item = inventoryWeapon(entry, byId);
  if (item === undefined) return false;
  return (
    key(specific(item, "Item Slot") ?? "").includes("two-hand") ||
    key(specific(item, "Hands Required") ?? "").includes("two-handed") ||
    inventoryWieldsTwoHanded(entry, byId, hints)
  );
}

/** The holding's name as native CharLootName gives it. */
export function inventoryHoldingName(
  entry: Pick<LoadoutHolding, "name" | "elements">,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  return entry.name ?? equipmentName(definitionsOf(entry, byId));
}

/** The base record's Item Slot, lowercased. */
function baseItemSlot(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  const base = definitionsOf(entry, byId)[0];
  return key(base === undefined ? "" : (specific(base, "Item Slot") ?? ""));
}

/** An imported holding carrying the legacy `_AlternateSlot` loot flag. */
function legacyAlternateFlag(entry: LoadoutHolding): boolean {
  const value = Object.entries(entry.overrides ?? {}).find(
    ([name]) => key(name) === "_alternateslot",
  )?.[1];
  return value !== undefined && /^(1|true)$/iu.test(value.trim());
}

const inferredSlotPriority: readonly EquipmentSlotId[] = [
  "body",
  "head",
  "neck",
  "arms",
  "hands",
  "waist",
  "feet",
  "symbol",
  "ki-focus",
  "tattoo",
  "companion",
  "familiar",
  "mount",
  "ring-1",
  "ring-2",
  "main-hand",
  "off-hand",
];

/**
 * Projects legacy `equip-count` holdings into the modern slot model for
 * evaluation, presentation and the next loadout edit. The legacy format
 * records how many copies are equipped but not which hand/ring slot they
 * occupy. Explicit modern assignments always win; unambiguous remaining
 * positions are filled deterministically without changing the durable
 * build until the user edits the loadout. Imported holdings land where
 * native CharLootSlot puts them: one flagged `_AlternateSlot` in its
 * alternate slot, a versatile weapon used two-handed in both hands, a
 * one-handed item in the main hand, else the `_INTERNAL_MainHandWeapon`
 * item, and any other off-hand item in the off hand.
 */
export function resolveLoadoutAssignments(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LegacyLoadoutHints = {},
): ResolvedLoadoutAssignments {
  const assignmentsByEntry = new Map<
    string,
    readonly EquipmentSlotAssignment[]
  >();
  const occupied = new Set<EquipmentSlotId>();

  for (const entry of inventory) {
    if (entry.equippedSlots === undefined) continue;
    const assignments = [...entry.equippedSlots];
    assignmentsByEntry.set(entry.id, assignments);
    assignments.forEach(({ slot }) => occupied.add(slot));
  }

  const handRank = (entry: LoadoutHolding): number => {
    // Both-hands weapons first, then one-handed items (the named one
    // ahead of the rest, as native weapon rows put it first), then the
    // named off-hand item, then everything else.
    if (inventoryRequiresBothHands(entry, byId, hints)) return 0;
    if (baseItemSlot(entry, byId) === "one-hand") return named(entry) ? 1 : 2;
    return named(entry) ? 3 : 4;
  };
  const named = (entry: LoadoutHolding) =>
    hints.mainHandWeapon !== undefined &&
    inventoryHoldingName(entry, byId) === hints.mainHandWeapon;
  const unslotted = inventory
    .filter(
      (entry) =>
        entry.equippedSlots === undefined &&
        entry.equippedQuantity > 0 &&
        entry.quantity > 0,
    )
    .map((entry) => ({ entry, rank: handRank(entry) }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ entry }) => entry);

  for (const entry of unslotted) {
    const bothHands = inventoryRequiresBothHands(entry, byId, hints);
    // Imported, a holding is in its alternate slot only when its loot
    // carries the flag (native in_alt_slot), never by default.
    const alternate = legacyAlternateFlag(entry)
      ? inventoryAlternateSlot(entry, byId)
      : undefined;
    const candidates = new Set(
      alternate === undefined
        ? authoredSlotCandidates(entry, byId)
        : [alternate],
    );
    // Native CharLootSlot: an off-hand item is in the off hand unless it is
    // the named main-hand weapon.
    const itemSlot = baseItemSlot(entry, byId);
    const priority: readonly EquipmentSlotId[] = [
      ...(alternate === undefined ? [] : [alternate]),
      ...(itemSlot === "off-hand" && !named(entry)
        ? inferredSlotPriority.filter((slot) => slot !== "main-hand")
        : inferredSlotPriority),
      "main-hand",
    ];
    const tentative: EquipmentSlotAssignment[] = [];
    const tentativelyOccupied = new Set(occupied);
    let complete = true;

    for (
      let quantityIndex = 0;
      quantityIndex < entry.equippedQuantity;
      quantityIndex += 1
    ) {
      if (bothHands && alternate === undefined) {
        if (
          !candidates.has("main-hand") ||
          !candidates.has("off-hand") ||
          tentativelyOccupied.has("main-hand") ||
          tentativelyOccupied.has("off-hand")
        ) {
          complete = false;
          break;
        }
        tentative.push(
          { slot: "main-hand", quantityIndex },
          { slot: "off-hand", quantityIndex },
        );
        tentativelyOccupied.add("main-hand");
        tentativelyOccupied.add("off-hand");
        continue;
      }
      const slot = priority.find(
        (candidate) =>
          candidates.has(candidate) && !tentativelyOccupied.has(candidate),
      );
      if (slot === undefined) {
        complete = false;
        break;
      }
      tentative.push({ slot, quantityIndex });
      tentativelyOccupied.add(slot);
    }

    if (!complete) continue;
    assignmentsByEntry.set(entry.id, tentative);
    tentative.forEach(({ slot }) => occupied.add(slot));
  }

  return { assignmentsByEntry };
}

/**
 * What the resolved loadout tells the rules (D101): the holding alone in the
 * main hand (native `_INTERNAL_MainHandWeapon`), the holdings worn in their
 * alternate slot (native loot `_AlternateSlot`), and the versatile weapons
 * wielded two-handed (native `_INTERNAL_VersatileUsedTwoHanded`). An
 * imported equipped holding the resolver cannot place keeps its legacy
 * text-string state, so it stays rules-active as imported.
 */
export interface LegacyLoadoutState {
  readonly assignmentsByEntry: ResolvedLoadoutAssignments["assignmentsByEntry"];
  readonly mainHandWeapon?: string;
  readonly alternateEntryIds: ReadonlySet<string>;
  readonly twoHandedEntryIds: ReadonlySet<string>;
}

export function legacyLoadoutState(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LegacyLoadoutHints = {},
): LegacyLoadoutState {
  const { assignmentsByEntry } = resolveLoadoutAssignments(
    inventory,
    byId,
    hints,
  );
  const alternateEntryIds = new Set<string>();
  const twoHandedEntryIds = new Set<string>();
  let mainHandWeapon: string | undefined;
  for (const entry of inventory) {
    if (entry.equippedQuantity <= 0 || entry.quantity <= 0) continue;
    const assignments = assignmentsByEntry.get(entry.id);
    if (assignments === undefined) {
      // Unplaced imported holding: legacy state as stored.
      if (
        entry.equippedSlots === undefined &&
        inventoryWieldsTwoHanded(entry, byId, hints)
      )
        twoHandedEntryIds.add(entry.id);
      continue;
    }
    const alternate = inventoryAlternateSlot(entry, byId);
    if (
      alternate !== undefined &&
      assignments.some(({ slot }) => slot === alternate)
    )
      alternateEntryIds.add(entry.id);
    const copies = (slot: EquipmentSlotId) =>
      new Set(
        assignments
          .filter((assignment) => assignment.slot === slot)
          .map(({ quantityIndex }) => quantityIndex),
      );
    const main = copies("main-hand");
    const off = copies("off-hand");
    const bothHands = [...main].some((copy) => off.has(copy));
    if (bothHands && inventoryIsVersatile(entry, byId))
      twoHandedEntryIds.add(entry.id);
    if (
      mainHandWeapon === undefined &&
      [...main].some((copy) => !off.has(copy))
    )
      mainHandWeapon = inventoryHoldingName(entry, byId);
  }
  if (mainHandWeapon === undefined && hints.mainHandWeapon !== undefined) {
    const unplaced = inventory.some(
      (entry) =>
        entry.equippedQuantity > 0 &&
        entry.equippedSlots === undefined &&
        !assignmentsByEntry.has(entry.id) &&
        inventoryHoldingName(entry, byId) === hints.mainHandWeapon,
    );
    if (unplaced) mainHandWeapon = hints.mainHandWeapon;
  }
  return {
    assignmentsByEntry,
    ...(mainHandWeapon === undefined ? {} : { mainHandWeapon }),
    alternateEntryIds,
    twoHandedEntryIds,
  };
}
