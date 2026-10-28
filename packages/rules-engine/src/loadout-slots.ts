import type {
  BuildInventoryElement,
  EquipmentSlotAssignment,
  EquipmentSlotId,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  equipmentName,
  legacyHolySymbolSlotCandidate,
  legacyIsStaff,
  legacyItemSlot,
  legacyUnwieldableReason,
  type LootSlotContext,
} from "./item-fields";

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
 * a hand as the main-hand weapon), `_INTERNAL_VersatileUsedTwoHanded` and
 * `_INTERNAL_EquippedSymbol`.
 */
export interface LegacyLoadoutHints {
  readonly mainHandWeapon?: string;
  readonly versatileUsedTwoHanded?: boolean;
  /** `_INTERNAL_EquippedSymbol`: the name of the holding in the holy symbol
   * slot (native HolySymbolLootSlot; not an equip count). */
  readonly equippedSymbol?: string;
}

/**
 * The character facts native ItemSlot reads (Small size, Oversized, One
 * Size Larger, Ambidextrous), as the evaluator found them
 * (`EvaluatedCharacter.loadoutSlotContext`, D102), and the evaluated
 * "Ring Slots" stat native SlotManip reads.
 */
export type LoadoutSlotContext = Omit<LootSlotContext, "mainHandWeapon"> & {
  /** Native SlotManip's `GetCharStat("Ring Slots")`: Level 1 gives 2,
   * Many-Fingered Gloves and the Mummified Hand one more each. */
  readonly ringSlots?: number;
};

/** The ring slots, in order; the loadout offers as many as the character has. */
export const RING_SLOT_IDS = ["ring-1", "ring-2", "ring-3", "ring-4"] as const;

/** Rings a character wears without the evaluated stat (Level 1's two). */
const DEFAULT_RING_SLOTS = 2;

function ringSlotIndex(slot: EquipmentSlotId): number {
  return (RING_SLOT_IDS as readonly EquipmentSlotId[]).indexOf(slot);
}

/**
 * How many ring slots the loadout offers. Native SlotManip
 * (`-Module-.cs` ~20254) lets a character wear as many rings as its "Ring
 * Slots" stat: equipping a ring conflicts only with the equipped rings past
 * the first `Ring Slots - 1`. The model has four ring slots (no content
 * grants more than 2 + 1 + 1). Given the holdings, a ring slot a holding is
 * already placed in stays offered after the stat drops, as native leaves
 * such a ring equipped until it is moved.
 */
export function loadoutRingSlotCount(
  context: LoadoutSlotContext | undefined,
  inventory: readonly Pick<LoadoutHolding, "equippedSlots">[] = [],
): number {
  const stat = context?.ringSlots ?? DEFAULT_RING_SLOTS;
  const placed = inventory.flatMap((entry) =>
    (entry.equippedSlots ?? []).map(({ slot }) => ringSlotIndex(slot) + 1),
  );
  return Math.min(
    RING_SLOT_IDS.length,
    Math.max(0, Math.trunc(stat), ...placed),
  );
}

/** The slots without the ring slots past the character's ring count. */
function withinRingSlots(
  slots: readonly EquipmentSlotId[],
  context: LoadoutSlotContext | undefined,
): readonly EquipmentSlotId[] {
  const count = loadoutRingSlotCount(context);
  return slots.filter((slot) => ringSlotIndex(slot) < count);
}

/**
 * Everything the resolver reads beyond the holdings: the imported legacy
 * hints and, once the character is evaluated, its size facts. Without the
 * size facts a holding fills the hands its record names.
 */
export interface LoadoutContext extends LegacyLoadoutHints {
  readonly slotContext?: LoadoutSlotContext;
}

/** The loadout context of a build's text strings and evaluated size facts. */
export function loadoutContext(
  textStrings: Readonly<Record<string, string>> | undefined,
  slotContext: LoadoutSlotContext | undefined,
): LoadoutContext {
  return {
    ...legacyLoadoutHints(textStrings),
    ...(slotContext === undefined ? {} : { slotContext }),
  };
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
  const equippedSymbol = textValue(
    textStrings,
    "_INTERNAL_EquippedSymbol",
  )?.trim();
  return {
    ...(mainHandWeapon === undefined || mainHandWeapon.trim() === ""
      ? {}
      : { mainHandWeapon }),
    ...(equippedSymbol === undefined || equippedSymbol === ""
      ? {}
      : { equippedSymbol }),
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
  ["ring", "ring-3"],
  ["ring", "ring-4"],
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

/**
 * The modern slots a holding may occupy, from its authored content and, for
 * a ring, the character's ring slots (`slotContext.ringSlots`; two without
 * it).
 */
export function inventorySlotCandidates<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  slotContext?: LoadoutSlotContext,
): readonly EquipmentSlotId[] {
  const alternate = inventoryAlternateSlot(entry, byId);
  const authored = authoredSlotCandidates(entry, byId, slotContext);
  return alternate === undefined || authored.includes(alternate)
    ? authored
    : [...authored, alternate];
}

function authoredSlotCandidates(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
  slotContext: LoadoutSlotContext | undefined,
): readonly EquipmentSlotId[] {
  return withinRingSlots(authoredSlots(entry, byId), slotContext);
}

function authoredSlots(
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
  const symbol =
    item !== undefined &&
    legacyHolySymbolSlotCandidate(item, (entity) => {
      const equivalent = specific(entity, "WeaponEquiv");
      return equivalent === undefined ? undefined : byId.get(key(equivalent));
    });
  if (key(item?.type ?? "") === "weapon") {
    return symbol
      ? ["main-hand", "off-hand", "symbol"]
      : ["main-hand", "off-hand"];
  }
  if (symbol) candidates.push("symbol");
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

/**
 * The hands native ItemSlot gives the holding's weapon for this character's
 * size ("two-hands", "one-hand", ...): a Small character holds a non-small
 * versatile weapon in two hands, One Size Larger holds a two-handed weapon
 * in one. Undefined without size facts, for a staff (native holds it
 * off-hand, which the loadout leaves to the record) or for a weapon the
 * character can't wield at all, which the loadout places as authored (and
 * the builder raises as a character issue). Ambidextrous only renames a
 * one-handed item's slot, so it is ignored here.
 */
function sizedHandSlot(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
  slotContext: LoadoutSlotContext | undefined,
): string | undefined {
  const weapon = inventoryWeapon(entry, byId);
  if (slotContext === undefined || weapon === undefined) return undefined;
  if (legacyIsStaff(weapon)) return undefined;
  const slot = key(
    legacyItemSlot(weapon, { ...slotContext, ambidextrous: false }),
  );
  return slot === "" ? undefined : slot;
}

/**
 * Why the character can't wield the holding's weapon (native ItemSlot gives
 * it no slot and native ValidateEquip refuses to equip it): "small" for a
 * non-small two-handed weapon held by a Small character, "large" for a
 * Large weapon without Oversized or One Size Larger. The builder still
 * places it as authored and raises a character issue (D102).
 */
export function inventoryUnwieldableReason<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  slotContext: LoadoutSlotContext | undefined,
): "small" | "large" | undefined {
  const weapon = inventoryWeapon(entry, byId);
  if (slotContext === undefined || weapon === undefined) return undefined;
  return legacyUnwieldableReason(weapon, slotContext);
}

/**
 * A versatile weapon the character's size forces into both hands (a Small
 * character with a non-small versatile weapon): there is no one-handed
 * choice to make.
 */
export function inventoryForcedTwoHanded<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  context: LoadoutContext = {},
): boolean {
  return (
    inventoryIsVersatile(entry, byId) &&
    sizedHandSlot(entry, byId, context.slotContext) === "two-hands"
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
 * A versatile weapon the character wields in two hands: forced by the
 * character's size, the holding's own choice, or, for an imported holding
 * without exact slots and no modern choice, legacy
 * `_INTERNAL_VersatileUsedTwoHanded` (native applies it to every versatile
 * weapon).
 */
export function inventoryWieldsTwoHanded<
  Item extends ItemElements &
    Pick<LoadoutHolding, "wieldedTwoHanded" | "equippedSlots">,
>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LoadoutContext = {},
): boolean {
  if (!inventoryIsVersatile(entry, byId)) return false;
  if (inventoryForcedTwoHanded(entry, byId, hints)) return true;
  return (
    entry.wieldedTwoHanded ??
    (entry.equippedSlots === undefined && hints.versatileUsedTwoHanded === true)
  );
}

/** True when the holding fills both hand slots: a two-handed weapon (as
 * native ItemSlot sizes it for the character, D102), or a versatile one
 * wielded two-handed. */
export function inventoryRequiresBothHands<
  Item extends ItemElements &
    Pick<LoadoutHolding, "wieldedTwoHanded" | "equippedSlots">,
>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LoadoutContext = {},
): boolean {
  const item = inventoryWeapon(entry, byId);
  if (item === undefined) return false;
  const sized = sizedHandSlot(entry, byId, hints.slotContext);
  if (sized !== undefined)
    return (
      sized === "two-hands" || inventoryWieldsTwoHanded(entry, byId, hints)
    );
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
  // No "symbol": native CharLootSlot puts an equip count in a hand, and
  // the holy symbol slot holds only the `_INTERNAL_EquippedSymbol` item.
  "ki-focus",
  "tattoo",
  "companion",
  "familiar",
  "mount",
  ...RING_SLOT_IDS,
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
 * item, and any other off-hand item in the off hand. The holy symbol slot is
 * not an equip count: it holds the `_INTERNAL_EquippedSymbol` holding
 * (native HolySymbolLootSlot matches it by name), equipped in a hand or not.
 */
export function resolveLoadoutAssignments(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LoadoutContext = {},
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
  // A weapon placed in one hand that needs both (a Small character's
  // longsword, placed before the loadout knew the character's size, D102)
  // also fills the other hand when nothing else holds it.
  for (const entry of inventory) {
    const placed = assignmentsByEntry.get(entry.id);
    if (placed === undefined || !inventoryRequiresBothHands(entry, byId, hints))
      continue;
    const extended = [...placed];
    for (const { slot, quantityIndex } of placed) {
      if (slot !== "main-hand" && slot !== "off-hand") continue;
      const other = slot === "main-hand" ? "off-hand" : "main-hand";
      if (
        occupied.has(other) ||
        placed.some(
          (assignment) =>
            assignment.slot === other &&
            assignment.quantityIndex === quantityIndex,
        )
      )
        continue;
      extended.push({ slot: other, quantityIndex });
      occupied.add(other);
    }
    if (extended.length !== placed.length)
      assignmentsByEntry.set(entry.id, extended);
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
        ? authoredSlotCandidates(entry, byId, hints.slotContext)
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

  // The imported `_INTERNAL_EquippedSymbol` holding wears its first copy in
  // the holy symbol slot, beside any hand it is equipped in.
  const symbolId = occupied.has("symbol")
    ? undefined
    : importedEquippedSymbol(inventory, byId, hints)?.id;
  if (symbolId !== undefined)
    assignmentsByEntry.set(symbolId, [
      ...(assignmentsByEntry.get(symbolId) ?? []),
      { slot: "symbol", quantityIndex: 0 },
    ]);

  return { assignmentsByEntry };
}

/**
 * The imported holding native's `_INTERNAL_EquippedSymbol` names (by
 * CharLootName, as HolySymbolLootSlot and comes_before compare), when no
 * holding has exact slots in the holy symbol slot.
 */
function importedEquippedSymbol(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LoadoutContext,
): LoadoutHolding | undefined {
  if (hints.equippedSymbol === undefined) return undefined;
  if (
    inventory.some((entry) =>
      entry.equippedSlots?.some(({ slot }) => slot === "symbol"),
    )
  )
    return undefined;
  return inventory.find(
    (entry) =>
      entry.equippedSlots === undefined &&
      entry.quantity > 0 &&
      inventoryHoldingName(entry, byId) === hints.equippedSymbol,
  );
}

/**
 * The holding worn in the holy symbol slot: one placed there, else the
 * imported `_INTERNAL_EquippedSymbol` holding. Native keeps it out of the
 * equip count (HolySymbolLootSlot only sets the text string).
 */
export function inventoryWornSymbolEntryId(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LoadoutContext = {},
): string | undefined {
  return (
    inventory.find(
      (entry) =>
        entry.quantity > 0 &&
        entry.equippedSlots?.some(({ slot }) => slot === "symbol"),
    )?.id ?? importedEquippedSymbol(inventory, byId, hints)?.id
  );
}

/**
 * Native equip count of a holding: its copies in a slot other than the holy
 * symbol slot (which native keeps as a text string, not an equip count).
 * An imported holding without exact slots keeps its equip count.
 */
export function legacyEquipCount(
  entry: Pick<LoadoutHolding, "equippedQuantity" | "equippedSlots">,
): number {
  if (entry.equippedSlots === undefined) return entry.equippedQuantity;
  return new Set(
    entry.equippedSlots
      .filter(({ slot }) => slot !== "symbol")
      .map(({ quantityIndex }) => quantityIndex),
  ).size;
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
  /** The holding in the holy symbol slot and its CharLootName (native
   * `_INTERNAL_EquippedSymbol`, which comes_before counts as equipped). */
  readonly symbolEntryId?: string;
  readonly equippedSymbol?: string;
}

export function legacyLoadoutState(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
  hints: LoadoutContext = {},
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
  const symbolEntryId = [...assignmentsByEntry].find(([, assignments]) =>
    assignments.some(({ slot }) => slot === "symbol"),
  )?.[0];
  return {
    assignmentsByEntry,
    ...(mainHandWeapon === undefined ? {} : { mainHandWeapon }),
    alternateEntryIds,
    twoHandedEntryIds,
    ...(symbolEntryId === undefined
      ? {}
      : {
          symbolEntryId,
          equippedSymbol: inventoryHoldingName(
            inventory.find(({ id }) => id === symbolEntryId)!,
            byId,
          ),
        }),
  };
}
