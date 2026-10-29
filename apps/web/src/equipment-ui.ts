import {
  augmentHosts,
  boundAugmentHolding,
  formatInventoryItemName,
  inventoryEntryWithQuantity,
  type BuildInventoryElement,
  type BuildInventoryEntry,
  type BuildOccurrence,
  type CharacterCommand,
  type EquipmentSlotAssignment,
  type EquipmentSlotId,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  legacyAcceptsAugment,
  legacyIsAugment,
  matchesCategory,
  parseCategoryExpression,
  itemChoiceSlots,
  RulesIndex,
  type ItemChoiceSlot,
} from "@4ecb/rules-engine";
import {
  contentReferenceFinder,
  inventoryAlternateSlot,
  inventoryDefinitionIds,
  inventoryForcedTwoHanded,
  inventoryPackageGroups,
  inventoryPackagePair,
  inventoryIsVersatile,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  inventoryUnwieldableReason,
  inventoryWieldsTwoHanded,
  isAuthoredShield,
  legacyLoadoutHints,
  loadoutContext,
  loadoutRingSlotCount,
  packageSplit,
  plainHoldingOf,
  resolveLoadoutAssignments,
  RING_SLOT_IDS,
  type InventoryPackageGroup,
  type InventoryPackagePair,
  type LoadoutContext,
  type LoadoutSlotContext,
} from "@4ecb/sheet-model";

import { contentSpecificValue, itemChoiceLabel } from "./builder-ui";
import {
  isLegacyEnchantment,
  isValidLoot,
  lootFinder,
  transformedLootBase,
  type LootValidityOptions,
} from "./loot-validity";
import type { IconName } from "./Icon";
import { LOADOUT_SLOT_ICONS } from "./item-icons";

// The loadout-slot resolver lives in the rules engine so the evaluator, the
// builder and the sheet share it (D101); re-exported for builder callers.
export {
  inventoryDefinitionIds,
  inventoryForcedTwoHanded,
  inventoryIsVersatile,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  inventoryUnwieldableReason,
  inventoryWieldsTwoHanded,
  legacyLoadoutHints,
  loadoutContext,
  resolveLoadoutAssignments,
};
export type {
  LegacyLoadoutHints,
  LoadoutContext,
  LoadoutSlotContext,
  ResolvedLoadoutAssignments,
} from "@4ecb/sheet-model";

export const SHOP_ITEM_TYPES = [
  "Armor",
  "Gear",
  "Magic Item",
  "Weapon",
] as const;

export const IMPLEMENT_LOADOUT_PROFICIENCY_IDS = {
  symbol: "ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_(HOLY_SYMBOL)",
  "ki-focus": "ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_(KI_FOCUSES)",
} as const;

export interface LoadoutSlotPresentation {
  readonly id: EquipmentSlotId;
  readonly label: string;
  readonly icon: IconName;
  readonly requiredActiveDefinitionId?: string;
  /** A third or fourth ring slot, offered only to a character with that
   * many ring slots (the native "Ring Slots" stat). */
  readonly extraRingSlot?: true;
}

export interface LoadoutSlotColumn {
  readonly id: "body" | "held";
  readonly label: string;
  readonly slots: readonly LoadoutSlotPresentation[];
}

export const LOADOUT_SLOT_COLUMNS: readonly LoadoutSlotColumn[] = [
  {
    id: "body",
    label: "Body slots",
    slots: [
      { id: "head", label: "Head", icon: LOADOUT_SLOT_ICONS.head },
      { id: "neck", label: "Neck", icon: LOADOUT_SLOT_ICONS.neck },
      { id: "body", label: "Body", icon: LOADOUT_SLOT_ICONS.body },
      { id: "arms", label: "Arms", icon: LOADOUT_SLOT_ICONS.arms },
      { id: "hands", label: "Hands", icon: LOADOUT_SLOT_ICONS.hands },
      { id: "waist", label: "Waist", icon: LOADOUT_SLOT_ICONS.waist },
      { id: "feet", label: "Feet", icon: LOADOUT_SLOT_ICONS.feet },
    ],
  },
  {
    id: "held",
    label: "Held and other slots",
    slots: [
      {
        id: "main-hand",
        label: "Main hand",
        icon: LOADOUT_SLOT_ICONS["main-hand"],
      },
      {
        id: "off-hand",
        label: "Off hand",
        icon: LOADOUT_SLOT_ICONS["off-hand"],
      },
      {
        id: "symbol",
        label: "Holy symbol",
        icon: LOADOUT_SLOT_ICONS.symbol,
        requiredActiveDefinitionId: IMPLEMENT_LOADOUT_PROFICIENCY_IDS.symbol,
      },
      {
        id: "ki-focus",
        label: "Ki focus",
        icon: LOADOUT_SLOT_ICONS["ki-focus"],
        requiredActiveDefinitionId:
          IMPLEMENT_LOADOUT_PROFICIENCY_IDS["ki-focus"],
      },
      { id: "ring-1", label: "Ring 1", icon: LOADOUT_SLOT_ICONS["ring-1"] },
      { id: "ring-2", label: "Ring 2", icon: LOADOUT_SLOT_ICONS["ring-2"] },
      {
        id: "ring-3",
        label: "Ring 3",
        icon: LOADOUT_SLOT_ICONS["ring-3"],
        extraRingSlot: true,
      },
      {
        id: "ring-4",
        label: "Ring 4",
        icon: LOADOUT_SLOT_ICONS["ring-4"],
        extraRingSlot: true,
      },
      { id: "tattoo", label: "Tattoo", icon: LOADOUT_SLOT_ICONS.tattoo },
    ],
  },
];

const CONDITIONAL_LOADOUT_SLOTS: readonly LoadoutSlotPresentation[] = [
  { id: "companion", label: "Companion", icon: LOADOUT_SLOT_ICONS.companion },
  { id: "familiar", label: "Familiar", icon: LOADOUT_SLOT_ICONS.familiar },
  { id: "mount", label: "Mount", icon: LOADOUT_SLOT_ICONS.mount },
];

/** Shared builder/print ordering, including conditional held/companion slots. */
export const ORDERED_LOADOUT_SLOTS = [
  ...LOADOUT_SLOT_COLUMNS.flatMap((column) => column.slots),
  ...CONDITIONAL_LOADOUT_SLOTS,
];

/**
 * The loadout's slot context with the character's ring slots settled: the
 * evaluated "Ring Slots" stat, widened to any ring slot a holding already
 * occupies, so the Equipment tab offers and lists exactly those slots.
 * Undefined before the character is evaluated (two ring slots).
 */
export function loadoutSlotContextWithRings(
  slotContext: LoadoutSlotContext | undefined,
  inventory: readonly BuildInventoryEntry[],
): LoadoutSlotContext | undefined {
  return slotContext === undefined
    ? undefined
    : {
        ...slotContext,
        ringSlots: loadoutRingSlotCount(slotContext, inventory),
      };
}

export function visibleLoadoutSlotColumns(
  activeDefinitionIds: readonly string[],
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  slotContext?: LoadoutSlotContext,
): readonly LoadoutSlotColumn[] {
  const activeDefinitions = new Set(activeDefinitionIds);
  const ringSlots = loadoutRingSlotCount(slotContext, inventory);
  return LOADOUT_SLOT_COLUMNS.map((column) => {
    const slots: LoadoutSlotPresentation[] = column.slots.filter(
      ({ id, requiredActiveDefinitionId, extraRingSlot }) =>
        (requiredActiveDefinitionId === undefined ||
          activeDefinitions.has(requiredActiveDefinitionId)) &&
        (extraRingSlot !== true ||
          (RING_SLOT_IDS as readonly string[]).indexOf(id) < ringSlots),
    );
    if (column.id === "held") {
      slots.push(
        ...CONDITIONAL_LOADOUT_SLOTS.filter(({ id }) =>
          inventory.some((entry) =>
            inventorySlotCandidates(entry, byId).includes(id),
          ),
        ),
      );
    }
    return { ...column, slots };
  });
}

export type PracticeKind =
  "ritual" | "alchemical-formula" | "martial-practice" | "scroll";

export interface MagicItemFamily {
  readonly key: string;
  readonly label: string;
  readonly entities: readonly ContentEntity[];
}

export type ShopBrowseId =
  | "all"
  | "adventuring-gear"
  | "ammunition"
  | "armor-shields"
  | "armor-enchantments"
  | "companions-mounts"
  | "consumables"
  | "implement-enchantments"
  | "implements"
  | "special-items"
  | "weapons"
  | "weapon-enchantments"
  | "wondrous-items"
  | "worn-items"
  | "rituals"
  | "alchemical-formulas"
  | "martial-practices";

export const SHOP_BROWSE_CATEGORIES: readonly {
  readonly id: ShopBrowseId;
  readonly label: string;
}[] = [
  { id: "all", label: "All items" },
  { id: "adventuring-gear", label: "Adventuring gear" },
  { id: "ammunition", label: "Ammunition" },
  { id: "armor-shields", label: "Armor & shields" },
  { id: "armor-enchantments", label: "Armor & shield enchantments" },
  { id: "companions-mounts", label: "Companion, familiar & mount" },
  { id: "consumables", label: "Consumables" },
  { id: "implement-enchantments", label: "Implement enchantments" },
  { id: "implements", label: "Implements" },
  { id: "special-items", label: "Special items" },
  { id: "weapons", label: "Weapons" },
  { id: "weapon-enchantments", label: "Weapon enchantments" },
  { id: "wondrous-items", label: "Wondrous items" },
  { id: "worn-items", label: "Worn items" },
];

/** The learning catalogs, in the Rituals tab rather than Shop. */
export const RITUAL_BROWSE_CATEGORIES: readonly {
  readonly id: ShopBrowseId;
  readonly label: string;
}[] = [
  { id: "rituals", label: "Rituals" },
  { id: "alchemical-formulas", label: "Alchemical formulas" },
  { id: "martial-practices", label: "Martial practices" },
];

export type InventoryCategoryId =
  | "adventuring-gear"
  | "ammunition"
  | "armor-shields"
  | "companions-mounts"
  | "consumables"
  | "implements"
  | "special-items"
  | "weapons"
  | "wondrous-items"
  | "worn-items"
  | "miscellaneous";

export interface InventoryCategoryPresentation {
  readonly id: InventoryCategoryId;
  readonly label: string;
  readonly initiallyExpanded: boolean;
}

export const INVENTORY_CATEGORIES: readonly InventoryCategoryPresentation[] = [
  {
    id: "adventuring-gear",
    label: "Adventuring gear",
    initiallyExpanded: true,
  },
  { id: "ammunition", label: "Ammunition", initiallyExpanded: true },
  {
    id: "armor-shields",
    label: "Armor & shields",
    initiallyExpanded: true,
  },
  {
    id: "companions-mounts",
    label: "Companion, familiar & mount",
    initiallyExpanded: true,
  },
  { id: "consumables", label: "Consumables", initiallyExpanded: true },
  { id: "implements", label: "Implements", initiallyExpanded: true },
  { id: "special-items", label: "Special items", initiallyExpanded: true },
  { id: "weapons", label: "Weapons", initiallyExpanded: true },
  { id: "wondrous-items", label: "Wondrous items", initiallyExpanded: true },
  { id: "worn-items", label: "Worn items", initiallyExpanded: true },
  { id: "miscellaneous", label: "Miscellaneous", initiallyExpanded: false },
];

export interface InventoryCategoryGroup {
  readonly category: InventoryCategoryPresentation;
  readonly entries: readonly BuildInventoryEntry[];
}

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

const IMPLEMENT_KINDS = [
  "staff",
  "rod",
  "orb",
  "wand",
  "totem",
  "holy symbol",
  "ki focus",
  "tome",
  "superior implement",
] as const;

export const CONSUMABLE_KINDS = [
  "alchemical",
  "alchemical item",
  "potion",
  "elixir",
  "consumable",
  "other consumable",
  "reagent",
  "soulfang",
  "whetstone",
  "whetstones",
  "component",
  "food",
  "drink",
] as const;

/**
 * Legacy D20Workspace.RulesElementIsBoon: a Magic Item Type containing one
 * of these words, or equal to one of the exact types below, is a boon (the
 * legacy BOONS category). `pnpm audit:legacy-special-cases` checks both
 * lists against the decompiled legacy engine.
 */
export const LEGACY_BOON_TYPE_WORDS = ["boon", "training"] as const;
export const LEGACY_BOON_TYPES = [
  "psionic talent",
  "echo of power",
  "elemental gift",
  "glory boon",
  "martial training",
  "primal blessing",
  "templar brand",
  "veiled alliance mystery",
  "wanderer's secret",
  "secret of the way",
  "battle scars",
] as const;

/** Whether a Magic Item Type is a legacy boon (case-insensitive). */
export function isLegacyBoonType(magicItemType: string | undefined): boolean {
  const type = normalized(magicItemType);
  return (
    LEGACY_BOON_TYPE_WORDS.some((word) => type.includes(word)) ||
    LEGACY_BOON_TYPES.some((boon) => type === boon)
  );
}

/** Non-boon rewards that also belong with the special items. */
const REWARD_KINDS = [
  "alternative reward",
  "gift",
  "blessing",
  "talent",
  "secret",
  "mystery",
  "brand",
] as const;

const MUNDANE_IMPLEMENT_IDS = new Set([
  "id_fmp_gear_3",
  "id_fmp_gear_12",
  "id_fmp_gear_13",
  "id_fmp_gear_14",
  "id_fmp_gear_27",
  "id_fmp_gear_87",
  "id_fmp_gear_101",
  "id_fmp_gear_115",
]);

/**
 * Classifies one durable holding by authored role evidence. Every repeated
 * specific and every resolved component participates; names and flavor never
 * do. A composed physical base wins over a generic enchantment category.
 */
export function inventoryCategory(
  entry: Pick<BuildInventoryEntry, "elements">,
  byId: ReadonlyMap<string, ContentEntity>,
): InventoryCategoryId | undefined {
  const definitions = inventoryDefinitionIds(entry).flatMap((id) => {
    const definition = byId.get(id);
    return definition === undefined ? [] : [definition];
  });
  const physicalBase = definitions[0];
  const savedTypes = entry.elements.map(({ type }) => normalized(type));

  const inventoryRole = (
    entity: ContentEntity,
  ): InventoryCategoryId | undefined => {
    if (isAuthoredShield(entity)) return "armor-shields";
    switch (shopBrowseCategory(entity)) {
      case "adventuring-gear":
      case "ammunition":
      case "armor-shields":
      case "companions-mounts":
      case "consumables":
      case "implements":
      case "special-items":
      case "weapons":
      case "wondrous-items":
      case "worn-items":
        return shopBrowseCategory(entity) as InventoryCategoryId;
      case "armor-enchantments":
        return "armor-shields";
      case "implement-enchantments":
        return "implements";
      case "weapon-enchantments":
        return "weapons";
      default:
        return undefined;
    }
  };
  const inventoryRoles = (
    entity: ContentEntity,
  ): readonly InventoryCategoryId[] =>
    [
      inventoryRole(entity),
      ...entity.specifics.map((specific) =>
        inventoryRole({ ...entity, specifics: [specific] }),
      ),
    ].filter((role): role is InventoryCategoryId => role !== undefined);

  // Learned Ritual records belong to the Practices model, never physical
  // Inventory. Quantity-bearing Ritual Scroll definitions remain consumables.
  if (
    definitions.some(({ type }) => normalized(type) === "ritual") ||
    savedTypes.includes("ritual")
  )
    return undefined;

  const priorityRole = definitions
    .flatMap(inventoryRoles)
    .find((role) => role === "consumables" || role === "ammunition");
  if (priorityRole !== undefined) return priorityRole;

  const physicalRole =
    physicalBase === undefined ? undefined : inventoryRole(physicalBase);
  if (physicalRole !== undefined) return physicalRole;

  const resolvedRole = definitions
    .flatMap(inventoryRoles)
    .find((role) => role !== undefined);
  if (resolvedRole !== undefined) return resolvedRole;

  if (savedTypes.includes("ritual scroll")) return "consumables";
  if (savedTypes.includes("ammunition")) return "ammunition";
  if (savedTypes.includes("weapon")) return "weapons";
  if (savedTypes.includes("armor")) return "armor-shields";
  if (savedTypes.includes("superior implement")) return "implements";
  return "miscellaneous";
}

/** Groups without sorting so each category retains durable Inventory order. */
export function groupInventoryByCategory(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): readonly InventoryCategoryGroup[] {
  const entries = new Map<InventoryCategoryId, BuildInventoryEntry[]>();
  for (const entry of inventory) {
    const category = inventoryCategory(entry, byId);
    if (category === undefined) continue;
    const group = entries.get(category) ?? [];
    group.push(entry);
    entries.set(category, group);
  }
  return INVENTORY_CATEGORIES.flatMap((category) => {
    const grouped = entries.get(category.id);
    return grouped === undefined ? [] : [{ category, entries: grouped }];
  });
}

export function practiceKind(entity: ContentEntity): PracticeKind | undefined {
  if (entity.type.trim().toLocaleLowerCase() === "ritual scroll")
    return "scroll";
  if (entity.type.trim().toLocaleLowerCase() !== "ritual") return undefined;
  const subtype = contentSpecificValue(entity, "type")?.toLocaleLowerCase();
  if (subtype === "alchemical formula") return "alchemical-formula";
  if (subtype === "martial practice") return "martial-practice";
  return "ritual";
}

export function entityCurrencyCopper(
  entity: ContentEntity,
): number | undefined {
  const numeric = (name: string): number => {
    const value = Number.parseFloat(
      contentSpecificValue(entity, name)?.replaceAll(",", "") ?? "0",
    );
    return Number.isFinite(value) ? value : 0;
  };
  const explicit =
    numeric("Copper") + numeric("Silver") * 10 + numeric("Gold") * 100;
  if (explicit > 0) return explicit;
  const market = contentSpecificValue(entity, "Market Price");
  if (market === undefined) return undefined;
  let total = 0;
  for (const match of market.matchAll(/([\d,.]+)\s*(ad|pp|gp|sp|cp)\b/gi)) {
    const value = Number.parseFloat(match[1]!.replaceAll(",", ""));
    const factor = { cp: 1, sp: 10, gp: 100, pp: 10_000, ad: 1_000_000 }[
      match[2]!.toLocaleLowerCase() as "cp" | "sp" | "gp" | "pp" | "ad"
    ];
    total += value * factor;
  }
  return total > 0 && Number.isFinite(total) ? total : undefined;
}

/**
 * What the character pays for `entity` (legacy D20Workspace.LootCost): its
 * authored price, with a ritual (not a formula or practice) at
 * `ritualCostPercent` percent of it.
 */
export function lootPriceCopper(
  entity: ContentEntity,
  ritualCostPercent = 100,
): number | undefined {
  const price = entityCurrencyCopper(entity);
  if (price === undefined || practiceKind(entity) !== "ritual") return price;
  // Native keeps fractional gold; the wallet counts whole copper.
  return Math.round((price * ritualCostPercent) / 100);
}

export function formatCopperPrice(copper: number | undefined): string {
  if (copper === undefined) return "Not priced";
  if (copper % 1_000_000 === 0) return `${copper / 1_000_000} ad`;
  if (copper % 10_000 === 0) return `${copper / 10_000} pp`;
  if (copper % 100 === 0) return `${copper / 100} gp`;
  if (copper % 10 === 0) return `${copper / 10} sp`;
  return `${copper} cp`;
}

const SALE_UNITS = [
  { value: 1_000_000, label: "ad" },
  { value: 10_000, label: "pp" },
  { value: 100, label: "gp" },
  { value: 10, label: "sp" },
  { value: 1, label: "cp" },
] as const;

function decimalInUnit(copper: number, unit: number): string {
  const whole = Math.floor(copper / unit);
  const remainder = copper % unit;
  if (remainder === 0) return String(whole);
  const decimals = String(unit).length - 1;
  return `${whole}.${String(remainder).padStart(decimals, "0").replace(/0+$/u, "")}`;
}

/** Formats all legacy sale choices in the largest unit exact at the 20% baseline. */
export function comparableSaleProceeds(
  priceCopper: number,
): readonly { readonly percentage: 20 | 50 | 100; readonly label: string }[] {
  const percentages = [100, 50, 20] as const;
  const proceeds = percentages.map((percentage) =>
    Math.floor((priceCopper * percentage) / 100),
  );
  const baseline = Math.floor((priceCopper * 20) / 100);
  const unit =
    SALE_UNITS.find(
      ({ value }) => baseline >= value && baseline % value === 0,
    ) ?? SALE_UNITS.at(-1)!;
  return percentages.map((percentage, index) => ({
    percentage,
    label: `${decimalInUnit(proceeds[index]!, unit.value)} ${unit.label}`,
  }));
}

function familyCompatibility(entity: ContentEntity): string {
  return ["Magic Item Type", "Item Slot", "Armor", "Weapon", "Implement Type"]
    .map(
      (name) => contentSpecificValue(entity, name)?.toLocaleLowerCase() ?? "",
    )
    .join("\0");
}

const SHOP_WORN_TYPES = new Set([
  "arms slot",
  "arms slot item",
  "feet slot item",
  "hands slot item",
  "head slot item",
  "neck slot item",
  "ring",
  "tattoo",
  "waist slot item",
]);

const CANONICAL_SHOP_SUBTYPES = new Map([
  ["any melee", "Any melee"],
  ["any ranged", "Any ranged"],
  ["axes", "Axe"],
  ["hand crossbow", "Hand crossbow"],
  ["heavy blade", "Heavy blade"],
  ["heavy shields", "Heavy shield"],
  ["light blade", "Light blade"],
]);

/** Classifies catalog records from authored fields, never name fragments. */
export function shopBrowseCategory(
  entity: ContentEntity,
): ShopBrowseId | undefined {
  const practice = practiceKind(entity);
  if (practice === "ritual") return "rituals";
  if (practice === "alchemical-formula") return "alchemical-formulas";
  if (practice === "martial-practice") return "martial-practices";
  if (practice === "scroll") return "consumables";

  const type = normalized(entity.type);
  const magicType = normalized(contentSpecificValue(entity, "Magic Item Type"));
  const itemSlot = normalized(contentSpecificValue(entity, "Item Slot"));
  const gearCategory = normalized(
    contentSpecificValue(entity, "Gear Category") ??
      contentSpecificValue(entity, "Category"),
  );
  const enchant = normalized(contentSpecificValue(entity, "_IsEnchant"));
  const universalImplement =
    normalized(contentSpecificValue(entity, "_UniversalImplement")) === "true";
  if (type.startsWith("companion ability increase")) return undefined;
  if (type === "weapon") return "weapons";
  if (type === "armor") return "armor-shields";
  if (type === "superior implement") return "implements";
  if (
    type === "ammunition" ||
    magicType === "ammunition" ||
    gearCategory === "ammunition"
  )
    return "ammunition";
  if (CONSUMABLE_KINDS.some((kind) => gearCategory === kind))
    return "consumables";
  if (type === "magic item") {
    if (magicType === "weapon") return "weapon-enchantments";
    if (magicType === "armor" || enchant === "shield")
      return "armor-enchantments";
    if (universalImplement) return "implement-enchantments";
    if (IMPLEMENT_KINDS.some((kind) => magicType === kind))
      return "implement-enchantments";
    if (SHOP_WORN_TYPES.has(magicType)) return "worn-items";
    if (
      magicType.includes("wondrous") &&
      ["arms", "feet", "hands", "head", "neck", "ring", "tattoo", "waist"].some(
        (slot) => itemSlot.includes(slot),
      )
    )
      return "worn-items";
    if (magicType.includes("wondrous")) return "wondrous-items";
    if (
      magicType === "special" ||
      isLegacyBoonType(magicType) ||
      REWARD_KINDS.some((kind) => magicType === kind) ||
      ["artifact", "intelligent item", "item set", "augment"].some((kind) =>
        magicType.includes(kind),
      )
    )
      return "special-items";
    if (
      CONSUMABLE_KINDS.some((kind) => magicType === kind) ||
      ["potion", "scroll"].some((kind) => magicType.includes(kind))
    )
      return "consumables";
  }
  if (
    ["mount", "barding", "companion", "familiar"].some(
      (kind) =>
        type.includes(kind) ||
        magicType.includes(kind) ||
        gearCategory === kind,
    )
  )
    return "companions-mounts";
  if (MUNDANE_IMPLEMENT_IDS.has(entity.id.toLocaleLowerCase()))
    return "implements";
  if (type === "gear" || gearCategory !== "") return "adventuring-gear";
  return undefined;
}

export function shopDisplayName(entity: ContentEntity): string {
  const category = shopBrowseCategory(entity);
  if (category === "weapon-enchantments")
    return entity.name
      .replace(/^Weapon of /iu, "")
      .replace(/ Weapon(?= \+\d+$|$)/iu, "");
  if (category === "armor-enchantments")
    return entity.name
      .replace(/^(?:Armor|Shield) of /iu, "")
      .replace(/ (?:Armor|Shield)(?= \+\d+$|$)/iu, "");
  if (category === "implement-enchantments")
    return entity.name
      .replace(
        /^(?:Implement|Orb|Rod|Staff|Wand|Tome|Totem|Symbol|Ki Focus) of /iu,
        "",
      )
      .replace(
        / (?:Implement|Orb|Rod|Staff|Wand|Tome|Totem|Symbol|Ki Focus)(?= \+\d+$|$)/iu,
        "",
      );
  return entity.name;
}

export function shopItemLevel(entity: ContentEntity): number {
  const level = Number(contentSpecificValue(entity, "Level") ?? 0);
  return Number.isFinite(level) ? level : 0;
}

export function recommendedMagicItemVariant(
  family: MagicItemFamily,
  characterLevel: number,
): ContentEntity {
  const ordered = [...family.entities].sort(
    (left, right) =>
      shopItemLevel(left) - shopItemLevel(right) ||
      Number(left.name.match(/\+(\d+)$/u)?.[1] ?? 0) -
        Number(right.name.match(/\+(\d+)$/u)?.[1] ?? 0) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
  return (
    ordered
      .filter((entity) => shopItemLevel(entity) <= characterLevel)
      .at(-1) ?? ordered[0]!
  );
}

export function shopSlot(entity: ContentEntity): string | undefined {
  const category = shopBrowseCategory(entity);
  if (
    category === "weapons" ||
    category === "weapon-enchantments" ||
    category === "implements" ||
    category === "implement-enchantments"
  )
    return "Held";
  if (category === "armor-shields" || category === "armor-enchantments") {
    if (
      isAuthoredShield(entity) ||
      normalized(contentSpecificValue(entity, "_IsEnchant")) === "shield"
    )
      return "Held";
    return "Body";
  }
  const slot = contentSpecificValue(entity, "Item Slot")?.trim();
  const magicType = contentSpecificValue(entity, "Magic Item Type")?.trim();
  const normalizedSlot = normalized(
    slot === undefined || slot === "" ? magicType : slot,
  );
  if (normalizedSlot === "") return undefined;
  const mapped = [
    "Head",
    "Neck",
    "Arms",
    "Hands",
    "Waist",
    "Feet",
    "Tattoo",
    "Companion",
    "Familiar",
    "Mount",
  ].find((candidate) => normalizedSlot.includes(candidate.toLocaleLowerCase()));
  return mapped ?? (normalizedSlot.includes("ring") ? "Ring" : undefined);
}

export function shopSubtype(entity: ContentEntity): string | undefined {
  const category = shopBrowseCategory(entity);
  if (entity.type.trim().toLocaleLowerCase() === "ritual scroll")
    return "Scrolls";
  if (category === "ammunition") return "Ammunition";
  if (category === "wondrous-items" || category === "worn-items")
    return undefined;
  if (category === "companions-mounts") {
    const type = normalized(entity.type);
    if (type === "companion") return "Companion";
    if (type === "familiar") return "Familiar";
  }
  if (
    category === "implement-enchantments" &&
    normalized(contentSpecificValue(entity, "_UniversalImplement")) === "true"
  )
    return "Any implement";
  const candidates =
    category === "weapons" || category === "weapon-enchantments"
      ? ["Group", "Weapon Category", "Weapon"]
      : category === "armor-shields" || category === "armor-enchantments"
        ? ["Armor Type", "Armor Category", "Armor"]
        : category === "implements" || category === "implement-enchantments"
          ? ["Implement Type", "Group", "Magic Item Type"]
          : ["Magic Item Type", "Gear Category", "Category", "Type"];
  const subtype = candidates
    .map((name) => contentSpecificValue(entity, name)?.split(",")[0]?.trim())
    .find((value) => value !== undefined && value !== "");
  if (subtype === undefined) return undefined;
  const normalizedSubtype = normalized(subtype);
  if (category === "implement-enchantments" && normalizedSubtype === "any")
    return "Any implement";
  if (["consumable", "other consumable"].includes(normalizedSubtype))
    return "Other";
  if (normalizedSubtype === "whetstones") return "Whetstone";
  if (normalizedSubtype === "companion slot item") return "Companion item";
  if (normalizedSubtype === "familiar slot item") return "Familiar item";
  if (normalizedSubtype === "mount slot item") return "Mount item";
  const canonicalSubtype = CANONICAL_SHOP_SUBTYPES.get(normalizedSubtype);
  if (canonicalSubtype !== undefined) return canonicalSubtype;
  if (normalizedSubtype === "gear") return "Other";
  return subtype;
}

/** Exact authored item definitions produced by an alchemical formula. */
export function alchemicalFormulaItems(
  entity: ContentEntity,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  if (practiceKind(entity) !== "alchemical-formula") return [];
  return (contentSpecificValue(entity, "_RELATED_ITEMS") ?? "")
    .split(",")
    .map((id) => byId.get(id.trim().toLocaleLowerCase()))
    .filter((item): item is ContentEntity => item !== undefined)
    .sort(
      (left, right) =>
        shopItemLevel(left) - shopItemLevel(right) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
}

export function magicItemFamilyKey(entity: ContentEntity): string | undefined {
  if (entity.type.trim().toLocaleLowerCase() !== "magic item") return undefined;
  const match = entity.name.trim().match(/^(.*?)\s+\+(\d+)$/);
  if (match === null) return undefined;
  return `${match[1]!.trim().toLocaleLowerCase()}\0${familyCompatibility(entity)}`;
}

/**
 * Groups only complete sibling families. The caller supplies the complete
 * catalog so a query page never folds an incomplete family at a page/filter
 * boundary. Every returned member remains an exact selectable content record.
 */
export function groupMagicItemFamilies(
  visible: readonly ContentEntity[],
  catalog: readonly ContentEntity[],
): readonly MagicItemFamily[] {
  const completeFamilies = new Map<string, ContentEntity[]>();
  for (const entity of catalog) {
    const key = magicItemFamilyKey(entity);
    if (key === undefined) continue;
    const family = completeFamilies.get(key) ?? [];
    family.push(entity);
    completeFamilies.set(key, family);
  }
  const visibleByFamily = new Map<string, ContentEntity[]>();
  for (const entity of visible) {
    const key = magicItemFamilyKey(entity);
    if (key === undefined) continue;
    const members = visibleByFamily.get(key) ?? [];
    members.push(entity);
    visibleByFamily.set(key, members);
  }
  const emitted = new Set<string>();
  return visible.flatMap((entity) => {
    const key = magicItemFamilyKey(entity);
    const siblings = key === undefined ? undefined : completeFamilies.get(key);
    if (key === undefined || siblings === undefined || siblings.length < 2)
      return [{ key: entity.id, label: entity.name, entities: [entity] }];
    if (emitted.has(key)) return [];
    emitted.add(key);
    return [
      {
        key,
        label: entity.name.replace(/\s+\+\d+$/, ""),
        entities: [...(visibleByFamily.get(key) ?? [entity])].sort(
          (left, right) =>
            Number(left.name.match(/\+(\d+)$/)?.[1] ?? 0) -
            Number(right.name.match(/\+(\d+)$/)?.[1] ?? 0),
        ),
      },
    ];
  });
}

/**
 * The saved base/enchantment elements of `entry` whose definitions the
 * active content lacks (homebrew or uninstalled sources). Name-only legacy
 * elements never carried a definition, so they are not "missing".
 */
export function missingInventoryElements(
  entry: Pick<BuildInventoryEntry, "elements">,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly BuildInventoryElement[] {
  return entry.elements.filter(
    ({ definitionId }) =>
      definitionId !== undefined && !byId.has(definitionId.toLocaleLowerCase()),
  );
}

export interface ResolvedItemChoice {
  readonly name: string;
  /** The chosen candidate's own content entity, when its definition ID
   * resolves against `byId` — undefined for a name-only legacy import. */
  readonly entity: ContentEntity | undefined;
}

/** The item-owned choices resolved on `entry`'s last element (e.g. the Fire
 * damage type chosen for an Armor of Resistance), each with the chosen
 * entity looked up by definition ID when available. Saved loot children
 * also hold the item's grants (a pact blade's "WearingPactBlade" Category),
 * so only children of a type one of the item's `select` rules offers count;
 * an item whose definition is missing keeps every child but Categories,
 * which are internal records and never a player's choice. */
export function resolvedItemChoices(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly ResolvedItemChoice[] {
  const item = entry.elements.at(-1);
  const itemEntity =
    item?.definitionId === undefined
      ? undefined
      : byId.get(item.definitionId.toLocaleLowerCase());
  const choiceTypes =
    itemEntity === undefined
      ? undefined
      : new Set(
          itemChoiceSlots(itemEntity).map(({ type }) =>
            type.toLocaleLowerCase(),
          ),
        );
  const granted = new Set(
    (itemEntity?.rules ?? []).flatMap(({ name, attributes }) => {
      const target = attributes.find((attribute) => attribute.name === "name");
      return name === "grant" && target !== undefined
        ? [target.value.toLocaleLowerCase()]
        : [];
    }),
  );
  return (item?.children ?? []).flatMap((child) => {
    if (child.unresolved) return [];
    const definitionId = child.identity.definitionId;
    const entity =
      definitionId === undefined
        ? undefined
        : byId.get(definitionId.toLocaleLowerCase());
    const type = (entity?.type ?? child.identity.type).toLocaleLowerCase();
    if (
      choiceTypes === undefined ? type === "category" : !choiceTypes.has(type)
    )
      return [];
    if (
      granted.has(definitionId?.toLocaleLowerCase() ?? "") ||
      granted.has(child.identity.name.toLocaleLowerCase())
    )
      return [];
    const name = entity?.name ?? child.identity.name;
    return name.length === 0 ? [] : [{ name, entity }];
  });
}

export function inventoryDisplayName(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  const elements = entry.elements.map(({ definitionId, name, type }) => {
    const definition =
      definitionId === undefined
        ? undefined
        : byId.get(definitionId.toLocaleLowerCase());
    return {
      name: definition?.name ?? name,
      type: definition?.type ?? type,
      magicItemType:
        definition === undefined
          ? undefined
          : contentSpecificValue(definition, "Magic Item Type"),
    };
  });
  const base = formatInventoryItemName(elements, entry.name);
  // An item-owned choice (e.g. an Armor of Resistance damage type) is fixed
  // for the life of the item once made; show it as a parenthesized suffix
  // rather than a separate editor, matching "Name +X (Choice)".
  const resolvedChoices = resolvedItemChoices(entry, byId).map(({ name }) =>
    itemChoiceLabel(name),
  );
  return resolvedChoices.length === 0
    ? base
    : `${base} (${resolvedChoices.join(", ")})`;
}

export function loadoutChangeCommand(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  entryId: string | undefined,
  slots: readonly EquipmentSlotId[],
  currentEntryId?: string,
  currentSlots: readonly EquipmentSlotId[] = slots,
  hints: LoadoutContext = {},
): CharacterCommand | undefined {
  const loadout = resolveLoadoutAssignments(inventory, byId, hints);
  const assignmentsFor = (
    candidateEntryId: string,
  ): readonly EquipmentSlotAssignment[] =>
    loadout.assignmentsByEntry.get(candidateEntryId) ??
    inventory.find(({ id }) => id === candidateEntryId)?.equippedSlots ??
    [];
  const current =
    currentEntryId === undefined
      ? inventory.find((entry) =>
          assignmentsFor(entry.id).some((assignment) =>
            currentSlots.includes(assignment.slot),
          ),
        )
      : inventory.find(({ id }) => id === currentEntryId);
  const withoutCurrentSlots = (candidateEntryId: string) =>
    assignmentsFor(candidateEntryId).filter(
      (assignment) => !currentSlots.includes(assignment.slot),
    );

  if (entryId === undefined) {
    if (current === undefined) return undefined;
    return {
      kind: "equip-inventory",
      entryId: current.id,
      assignments: withoutCurrentSlots(current.id),
    };
  }
  const entry = inventory.find(({ id }) => id === entryId);
  if (entry === undefined) return undefined;
  let retained = assignmentsFor(entry.id).filter(
    (assignment) => !slots.includes(assignment.slot),
  );
  const used = new Set(retained.map(({ quantityIndex }) => quantityIndex));
  const pairedHands = slots.includes("main-hand") && slots.includes("off-hand");
  let quantityIndex = pairedHands
    ? 0
    : Array.from({ length: entry.quantity }, (_, index) => index).find(
        (index) => !used.has(index),
      );
  // Every copy is placed: move the last one (Wrist Razors from the off hand
  // to the arms) rather than refuse.
  if (quantityIndex === undefined && used.size > 0) {
    const moved = Math.max(...used);
    quantityIndex = moved;
    retained = retained.filter(
      (assignment) => assignment.quantityIndex !== moved,
    );
  }
  if (quantityIndex === undefined) return undefined;
  const assignments = [
    ...retained,
    ...slots.map((slot) => ({ slot, quantityIndex })),
  ];
  const commands: CharacterCommand[] = [];
  if (current !== undefined && current.id !== entryId)
    commands.push({
      kind: "equip-inventory",
      entryId: current.id,
      assignments: withoutCurrentSlots(current.id),
    });
  commands.push({ kind: "equip-inventory", entryId, assignments });
  return commands.length === 1 ? commands[0] : { kind: "batch", commands };
}

export type InventoryLoadoutToggle =
  | {
      readonly kind: "equip";
      readonly slots: readonly EquipmentSlotId[];
      readonly displaces: boolean;
    }
  | {
      readonly kind: "unequip";
      readonly slots: readonly EquipmentSlotId[];
    }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "unavailable" };

/** Resolves the deterministic Loadout action behind an Inventory double-click. */
export function inventoryLoadoutToggle(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  entryId: string,
  visibleSlots: readonly EquipmentSlotId[],
  hints: LoadoutContext = {},
): InventoryLoadoutToggle {
  const entry = inventory.find(({ id }) => id === entryId);
  if (entry === undefined) return { kind: "unavailable" };
  const loadout = resolveLoadoutAssignments(inventory, byId, hints);
  const assignments = loadout.assignmentsByEntry.get(entryId);
  if (assignments !== undefined && assignments.length > 0)
    return {
      kind: "unequip",
      slots: [...new Set(assignments.map(({ slot }) => slot))],
    };
  if (entry.equippedQuantity > 0) return { kind: "ambiguous" };

  const candidates = new Set(
    inventorySlotCandidates(
      entry,
      byId,
      loadoutSlotContextWithRings(hints.slotContext, inventory),
    ) as readonly EquipmentSlotId[],
  );
  const occupied = new Set(
    [...loadout.assignmentsByEntry.entries()]
      .filter(([candidateId]) => candidateId !== entryId)
      .flatMap(([, candidateAssignments]) =>
        candidateAssignments.map(({ slot }) => slot),
      ),
  );
  if (inventoryRequiresBothHands(entry, byId, hints)) {
    const slots = ["main-hand", "off-hand"] as const;
    if (
      !slots.every(
        (slot) => candidates.has(slot) && visibleSlots.includes(slot),
      )
    )
      return { kind: "unavailable" };
    return {
      kind: "equip",
      slots,
      displaces: slots.some((slot) => occupied.has(slot)),
    };
  }

  // An item's alternate slot (Wrist Razors' arms) is a choice made in
  // Loadout, never the double-click default.
  const alternate = inventoryAlternateSlot(entry, byId);
  const suitable = visibleSlots.filter(
    (slot) => candidates.has(slot) && slot !== alternate,
  );
  const slot = suitable.find((candidate) => !occupied.has(candidate));
  const chosen = slot ?? suitable[0];
  return chosen === undefined
    ? { kind: "unavailable" }
    : {
        kind: "equip",
        slots: [chosen],
        displaces: slot === undefined,
      };
}

export function itemProficiencyStatus(
  entity: ContentEntity,
  owned: readonly ContentEntity[],
): "proficient" | "unverified" {
  const type = entity.type.toLocaleLowerCase();
  if (type !== "weapon" && type !== "armor") return "proficient";
  const tokens = [
    entity.name,
    contentSpecificValue(
      entity,
      type === "weapon" ? "Group" : "Armor Category",
    ) ?? "",
    contentSpecificValue(
      entity,
      type === "weapon" ? "Weapon Category" : "Armor Type",
    ) ?? "",
  ].map((value) => value.toLocaleLowerCase());
  return owned.some(
    (candidate) =>
      /proficien/i.test(`${candidate.type} ${candidate.name}`) &&
      tokens.some(
        (token) =>
          token !== "" && candidate.name.toLocaleLowerCase().includes(token),
      ),
  )
    ? "proficient"
    : "unverified";
}

export function itemCanBeBought(entity: ContentEntity): boolean {
  const blocked = contentSpecificValue(
    entity,
    "_CannotBeBought",
  )?.toLocaleLowerCase();
  return (
    blocked !== "1" &&
    blocked !== "true" &&
    entityCurrencyCopper(entity) !== undefined
  );
}

const compatibleBaseCache = new WeakMap<
  readonly ContentEntity[],
  WeakMap<readonly ContentEntity[], Map<string, readonly ContentEntity[]>>
>();

/**
 * The base items `item` is bought on (legacy D20Workspace.IsValidLoot).
 * An enchantment (an Armor or Weapon magic item, or a shield Arms Slot
 * Item) or an implement magic item lists every valid base in `catalog`; any
 * other slotless magic item whose Weapon or Armor field names one record
 * becomes that base (legacy TransformLoot). `entities` resolves the records
 * a base refers to (Quarterstaff, WeaponEquiv, _Secondary End).
 */
export function compatibleBaseItems(
  item: ContentEntity,
  catalog: readonly ContentEntity[],
  entities: readonly ContentEntity[] = catalog,
): readonly ContentEntity[] {
  let byEntities = compatibleBaseCache.get(catalog);
  if (byEntities === undefined) {
    byEntities = new WeakMap();
    compatibleBaseCache.set(catalog, byEntities);
  }
  let results = byEntities.get(entities);
  if (results === undefined) {
    results = new Map();
    byEntities.set(entities, results);
  }
  const cached = results.get(item.id);
  if (cached !== undefined) return cached;
  const find = lootFinder(entities);
  let compatible: readonly ContentEntity[] = [];
  if (
    isLegacyEnchantment(item) ||
    shopBrowseCategory(item) === "implement-enchantments"
  ) {
    compatible = catalog
      .filter((base) => BASE_ITEM_TYPES.has(normalized(base.type)))
      // Barding is its own shop category in legacy (ArmorItem.CategoryName),
      // never a base the magic armor picker lists.
      .filter(
        (base) =>
          normalized(base.type) !== "armor" ||
          !normalized(base.name).includes("barding"),
      )
      .filter((base) => isValidLoot(base, item, find))
      .sort((left, right) => left.name.localeCompare(right.name));
  } else {
    // D091: native TransformLoot keeps a base the pair cannot use and then
    // refuses the item; the item is kept on its own instead.
    const base = transformedLootBase(item, find);
    if (base !== undefined && isValidLoot(base, item, find))
      compatible = [base];
  }
  results.set(item.id, compatible);
  return compatible;
}

const BASE_ITEM_TYPES = new Set(["weapon", "armor", "superior implement"]);

/**
 * Weapon enchantments that also fit a superior implement (a staff as a
 * Quarterstaff, a dagger as its WeaponEquiv) list with the implement
 * enchantments too (legacy EnchantmentItem.InitializeCategoryMembership,
 * which tests Accurate Staff and Accurate Dagger).
 */
export function shopAlsoImplementEnchantment(
  item: ContentEntity,
  catalog: readonly ContentEntity[],
  entities: readonly ContentEntity[] = catalog,
): boolean {
  return (
    shopBrowseCategory(item) === "weapon-enchantments" &&
    compatibleBaseItems(item, catalog, entities).some(
      (base) => normalized(base.type) === "superior implement",
    )
  );
}

/** Why the shop cannot add `item` (bought or given), if it cannot. */
export function shopAcquireBlockedReason(
  item: ContentEntity,
  catalog: readonly ContentEntity[],
  entities: readonly ContentEntity[],
  options: LootValidityOptions,
): string | undefined {
  if (isLegacyEnchantment(item))
    return compatibleBaseItems(item, catalog, entities).length === 0
      ? "No base item fits this enchantment."
      : undefined;
  if (
    normalized(item.type) === "armor" &&
    !isValidLoot(item, undefined, lootFinder(entities), options)
  )
    return "Masterwork armor comes with its enhancement: buy it as the base of a magic armor, or use Inherent Bonuses.";
  return undefined;
}

const itemChoiceIndexCache = new WeakMap<
  readonly ContentEntity[],
  RulesIndex
>();

function itemChoiceIndex(entities: readonly ContentEntity[]): RulesIndex {
  const cached = itemChoiceIndexCache.get(entities);
  if (cached !== undefined) return cached;
  const created = new RulesIndex(entities);
  itemChoiceIndexCache.set(entities, created);
  return created;
}

/** Entities eligible to fill an item-owned choice slot (for example an
 * Armor of Resistance damage type). Matches the same type + Category
 * expression the rules engine uses for an ordinary select rule's
 * candidates, so a broad type bucket (many corpus "Class Feature" records
 * share a type with only a Category expression narrowing them) does not
 * offer unrelated entities. These choices carry no prerequisite/legality
 * gate beyond that expression. */
export function itemChoiceCandidates(
  slot: ItemChoiceSlot,
  entities: readonly ContentEntity[],
  level = Number.POSITIVE_INFINITY,
): readonly ContentEntity[] {
  const index = itemChoiceIndex(entities);
  const typed = index.type(slot.type);
  const filtered =
    slot.category === undefined
      ? typed
      : typed.filter((candidate) =>
          matchesCategory(candidate, parseCategoryExpression(slot.category!), {
            owned: [],
            level,
            categoryAliases: index.categoryAliases,
            categoryValuesFor: (entity) => index.categoryValues(entity),
          }),
        );
  return [...filtered].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function inventoryEntryForEntity(
  entity: ContentEntity,
  acquiredLevel: number,
  base?: ContentEntity,
  /** Item-owned choice children (for example a chosen damage type) resolved
   * at purchase time and stored beneath `entity`'s own element. */
  itemChoiceChildren?: readonly BuildOccurrence[],
): BuildInventoryEntry {
  return {
    id: `web:loot:${crypto.randomUUID()}`,
    acquiredLevel,
    quantity: 1,
    equippedQuantity: 0,
    elements: [base, entity]
      .filter((value): value is ContentEntity => value !== undefined)
      .map(({ id, name, type }) => ({ definitionId: id, name, type }))
      .map((element, index, all) =>
        index === all.length - 1 &&
        itemChoiceChildren !== undefined &&
        itemChoiceChildren.length > 0
          ? { ...element, children: itemChoiceChildren }
          : element,
      ),
    overrides: {},
    legality: "rules-legal",
  };
}

/** The record a plain holding holds (no enchantment, custom name or choices). */
function plainHoldingRecord(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): ContentEntity | undefined {
  const element = entry.elements.length === 1 ? entry.elements[0] : undefined;
  return element?.definitionId === undefined ||
    entry.name !== undefined ||
    (element.children?.length ?? 0) > 0
    ? undefined
    : byId.get(element.definitionId.toLocaleLowerCase());
}

/**
 * The commands that leave a package pair's two holdings at `units` in all,
 * as legacy CharacterLootItem.PackageManipulation does: as many full
 * packages as fit, the rest as singles. A member not yet owned is created
 * at `acquiredLevel` (a put of quantity 0 adds nothing).
 */
function packageRebalanceCommands(
  pair: InventoryPackagePair,
  packHolding: BuildInventoryEntry | undefined,
  singleHolding: BuildInventoryEntry | undefined,
  units: number,
  acquiredLevel: number,
): CharacterCommand[] {
  const { packs, singles } = packageSplit(pair, units);
  const put = (
    holding: BuildInventoryEntry | undefined,
    entity: ContentEntity,
    quantity: number,
  ): CharacterCommand => ({
    kind: "put-inventory",
    entry: inventoryEntryWithQuantity(
      holding ?? inventoryEntryForEntity(entity, acquiredLevel),
      quantity,
    ),
  });
  return [
    put(packHolding, pair.pack, packs),
    put(singleHolding, pair.single, singles),
  ];
}

/**
 * The commands that add `entry` (bought at `priceCopper` each, or given at
 * 0) to `inventory`. Packaged gear (Arrows and Arrow, Journeybreads and
 * Journeybread: a `_RelatedElement` pair with different "count" lot sizes)
 * is rebalanced as legacy CharacterLootItem.PackageManipulation does: the
 * pair's total units become as many full packages as fit, with the rest
 * as single items.
 */
export function acquisitionCommands(
  inventory: readonly BuildInventoryEntry[],
  entry: BuildInventoryEntry,
  priceCopper: number,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly CharacterCommand[] {
  const purchase: CharacterCommand = {
    kind: "purchase-inventory",
    entry,
    priceCopper,
  };
  const added = plainHoldingRecord(entry, byId);
  const pair =
    added === undefined
      ? undefined
      : inventoryPackagePair(added, contentReferenceFinder(byId));
  if (added === undefined || pair === undefined) return [purchase];
  const packHolding = plainHoldingOf(inventory, pair.pack);
  const singleHolding = plainHoldingOf(inventory, pair.single);
  const units =
    (packHolding?.quantity ?? 0) * pair.packLot +
    (singleHolding?.quantity ?? 0) * pair.singleLot +
    entry.quantity * (added === pair.pack ? pair.packLot : pair.singleLot);
  // After the purchase the added record's holding is the owned one (the
  // purchase joins it) or the new entry.
  return [
    purchase,
    ...packageRebalanceCommands(
      pair,
      added === pair.pack ? (packHolding ?? entry) : packHolding,
      added === pair.single ? (singleHolding ?? entry) : singleHolding,
      units,
      entry.acquiredLevel,
    ),
  ];
}

/** The package pair a holding belongs to, as one inventory row. */
export function inventoryPackageGroupsFor(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): ReadonlyMap<string, InventoryPackageGroup> {
  return inventoryPackageGroups(
    inventory,
    (id) => byId.get(id.toLocaleLowerCase()),
    contentReferenceFinder(byId),
  );
}

/**
 * The commands that set a package row to `units` (its quantity control and
 * Remove): the pair rebalances, so removing one arrow while only packages
 * remain breaks a package.
 */
export function packageQuantityCommands(
  group: InventoryPackageGroup,
  units: number,
): readonly CharacterCommand[] {
  return packageRebalanceCommands(
    group.pair,
    group.packHolding,
    group.singleHolding,
    units,
    group.representative.acquiredLevel,
  );
}

/** A package row's sale unit: one single item, at the single's own price. */
export function packageSalePriceCopper(
  group: InventoryPackageGroup,
): number | undefined {
  return entityCurrencyCopper(group.pair.single);
}

/**
 * The commands that sell one unit (one arrow) of a package row at
 * `percentage` of the single item's price: a package breaks into singles
 * first when none are owned, then the rest rebalances.
 */
export function packageSaleCommands(
  group: InventoryPackageGroup,
  percentage: 20 | 50 | 100,
): readonly CharacterCommand[] {
  const priceCopper = packageSalePriceCopper(group);
  if (priceCopper === undefined || group.units < group.pair.singleLot)
    return [];
  const { pair, packHolding, singleHolding } = group;
  const units = group.units - pair.singleLot;
  // Hold the unit being sold as a single, sell it, then rebalance the rest.
  const single =
    singleHolding ??
    inventoryEntryForEntity(pair.single, group.representative.acquiredLevel);
  const { packs } = packageSplit(pair, units);
  const singlesBefore =
    Math.floor((units - packs * pair.packLot) / pair.singleLot) + 1;
  return [
    ...(packHolding === undefined
      ? []
      : [
          {
            kind: "put-inventory",
            entry: inventoryEntryWithQuantity(packHolding, packs),
          } satisfies CharacterCommand,
        ]),
    {
      kind: "put-inventory",
      entry: inventoryEntryWithQuantity(single, singlesBefore),
    },
    { kind: "sell-inventory", entryId: single.id, priceCopper, percentage },
  ];
}

function holdingParts(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): { base?: ContentEntity; enchantment?: ContentEntity } {
  const [baseId, enchantmentId] = inventoryDefinitionIds(entry);
  const base = baseId === undefined ? undefined : byId.get(baseId);
  const enchantment =
    enchantmentId === undefined ? undefined : byId.get(enchantmentId);
  return {
    ...(base === undefined ? {} : { base }),
    ...(enchantment === undefined ? {} : { enchantment }),
  };
}

/** Whether a holding is a dragonshard augment (native CharLootIsAugment). */
export function inventoryIsAugment(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): boolean {
  return legacyIsAugment(holdingParts(entry, byId).base);
}

/**
 * The owned holdings an augment can be attached to, in inventory order
 * (native IsMagicWeapon: magic weapons, staffs and enchanted superior
 * staffs or light blades).
 */
export function inventoryAugmentHosts(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): readonly BuildInventoryEntry[] {
  return inventory.filter((entry) => {
    if (entry.quantity <= 0) return false;
    const { base, enchantment } = holdingParts(entry, byId);
    return legacyAcceptsAugment(base, enchantment);
  });
}

/** The augment holding attached to `host`, if any. */
export function inventoryAttachedAugment(
  host: BuildInventoryEntry,
  inventory: readonly BuildInventoryEntry[],
): BuildInventoryEntry | undefined {
  return boundAugmentHolding(host, inventory, inventoryDefinitionIds);
}

/** The holdings `augment` is attached to, in inventory order. */
export function inventoryAugmentAttachedTo(
  augment: BuildInventoryEntry,
  inventory: readonly BuildInventoryEntry[],
): readonly BuildInventoryEntry[] {
  return augmentHosts(augment, inventory, inventoryDefinitionIds);
}
