import {
  formatInventoryItemName,
  type BuildInventoryEntry,
  type CharacterCommand,
  type EquipmentSlotAssignment,
  type EquipmentSlotId,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { contentSpecificValue } from "./builder-ui";
import type { IconName } from "./Icon";
import { isAuthoredShield, LOADOUT_SLOT_ICONS } from "./item-icons";

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
      { id: "tattoo", label: "Tattoo", icon: LOADOUT_SLOT_ICONS.tattoo },
    ],
  },
];

const CONDITIONAL_LOADOUT_SLOTS: readonly LoadoutSlotPresentation[] = [
  { id: "companion", label: "Companion", icon: LOADOUT_SLOT_ICONS.companion },
  { id: "familiar", label: "Familiar", icon: LOADOUT_SLOT_ICONS.familiar },
  { id: "mount", label: "Mount", icon: LOADOUT_SLOT_ICONS.mount },
];

export function visibleLoadoutSlotColumns(
  activeDefinitionIds: readonly string[],
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): readonly LoadoutSlotColumn[] {
  const activeDefinitions = new Set(activeDefinitionIds);
  return LOADOUT_SLOT_COLUMNS.map((column) => {
    const slots: LoadoutSlotPresentation[] = column.slots.filter(
      ({ requiredActiveDefinitionId }) =>
        requiredActiveDefinitionId === undefined ||
        activeDefinitions.has(requiredActiveDefinitionId),
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
  { id: "alchemical-formulas", label: "Alchemical formulas" },
  { id: "ammunition", label: "Ammunition" },
  { id: "armor-shields", label: "Armor & shields" },
  { id: "armor-enchantments", label: "Armor & shield enchantments" },
  { id: "companions-mounts", label: "Companion, familiar & mount" },
  { id: "consumables", label: "Consumables" },
  { id: "implement-enchantments", label: "Implement enchantments" },
  { id: "implements", label: "Implements" },
  { id: "martial-practices", label: "Martial practices" },
  { id: "rituals", label: "Rituals" },
  { id: "special-items", label: "Special items" },
  { id: "weapons", label: "Weapons" },
  { id: "weapon-enchantments", label: "Weapon enchantments" },
  { id: "wondrous-items", label: "Wondrous items" },
  { id: "worn-items", label: "Worn items" },
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

const CONSUMABLE_KINDS = [
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

const REWARD_KINDS = [
  "alternative reward",
  "divine boon",
  "legendary boon",
  "other boon",
  "boon",
  "gift",
  "blessing",
  "grandmaster training",
  "training",
  "talent",
  "secret",
  "mystery",
  "templar brand",
  "brand",
  "elemental gift",
  "sorcerer-king's boon",
  "primal blessing",
  "psionic talent",
  "fey magic gift (boon)",
  "glory boon",
  "veiled alliance mystery",
  "secret of the way",
  "wanderer's secret",
  "echo of power",
  "iggwilv's boon",
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
  entry: BuildInventoryEntry,
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
  "arms slot item",
  "feet slot item",
  "hands slot item",
  "head slot item",
  "neck slot item",
  "ring",
  "tattoo",
  "waist slot item",
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
  const gearCategory = normalized(
    contentSpecificValue(entity, "Gear Category") ??
      contentSpecificValue(entity, "Category"),
  );
  const enchant = normalized(contentSpecificValue(entity, "_IsEnchant"));
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
    if (IMPLEMENT_KINDS.some((kind) => magicType === kind))
      return "implement-enchantments";
    if (SHOP_WORN_TYPES.has(magicType)) return "worn-items";
    if (magicType.includes("wondrous")) return "wondrous-items";
    if (
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
      (kind) => type.includes(kind) || magicType.includes(kind),
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
  if (slot === undefined || slot === "") return undefined;
  const normalizedSlot = normalized(slot);
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
  const candidates =
    category === "weapons" || category === "weapon-enchantments"
      ? ["Group", "Weapon Category", "Weapon"]
      : category === "armor-shields" || category === "armor-enchantments"
        ? ["Armor Type", "Armor Category", "Armor"]
        : category === "implements" || category === "implement-enchantments"
          ? ["Implement Type", "Group", "Magic Item Type"]
          : ["Magic Item Type", "Gear Category", "Type"];
  return candidates
    .map((name) => contentSpecificValue(entity, name)?.split(",")[0]?.trim())
    .find((value) => value !== undefined && value !== "");
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

export function inventoryDefinitionIds(
  entry: BuildInventoryEntry,
): readonly string[] {
  return entry.elements.flatMap(({ definitionId }) =>
    definitionId === undefined ? [] : [definitionId.toLocaleLowerCase()],
  );
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
    };
  });
  return formatInventoryItemName(elements, entry.name);
}

export function inventorySlotCandidates(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly string[] {
  const definitions = inventoryDefinitionIds(entry).flatMap((id) => {
    const entity = byId.get(id);
    return entity === undefined ? [] : [entity];
  });
  const item = definitions[0];
  const armor = definitions.find(
    (definition) => definition.type.toLocaleLowerCase() === "armor",
  );
  const slots = definitions
    .flatMap((definition) => [
      contentSpecificValue(definition, "Item Slot") ?? "",
      contentSpecificValue(definition, "Magic Item Type") ?? "",
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
  if (item?.type.toLocaleLowerCase() === "weapon") {
    const hands =
      contentSpecificValue(item, "Hands Required")?.toLocaleLowerCase() ?? "";
    if (hands.includes("two-handed")) return ["main-hand", "off-hand"];
    if (
      (contentSpecificValue(item, "Properties") ?? "")
        .toLocaleLowerCase()
        .includes("off-hand")
    )
      return ["main-hand", "off-hand"];
    return ["main-hand", "off-hand"];
  }
  if (armor !== undefined) return ["body"];
  const mappings = [
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
  return [
    ...new Set(
      candidates.concat(
        mappings
          .filter(([needle]) => slots.includes(needle))
          .map(([, slot]) => slot),
      ),
    ),
  ];
}

export function inventoryRequiresBothHands(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): boolean {
  const item = inventoryDefinitionIds(entry)
    .map((id) => byId.get(id))
    .find((entity) => entity?.type.toLocaleLowerCase() === "weapon");
  if (item === undefined) return false;
  return (
    (contentSpecificValue(item, "Item Slot") ?? "")
      .toLocaleLowerCase()
      .includes("two-hand") ||
    (contentSpecificValue(item, "Hands Required") ?? "")
      .toLocaleLowerCase()
      .includes("two-handed")
  );
}

export interface ResolvedLoadoutAssignments {
  readonly assignmentsByEntry: ReadonlyMap<
    string,
    readonly EquipmentSlotAssignment[]
  >;
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
 * presentation and the next loadout edit. The legacy format records how many
 * copies are equipped but not which hand/ring slot they occupy. Explicit
 * modern assignments always win; unambiguous remaining positions are filled
 * deterministically without changing the durable build until the user edits
 * the loadout.
 */
export function resolveLoadoutAssignments(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
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

  for (const entry of inventory) {
    if (
      entry.equippedSlots !== undefined ||
      entry.equippedQuantity <= 0 ||
      entry.quantity <= 0
    )
      continue;
    const candidates = new Set(
      inventorySlotCandidates(entry, byId) as readonly EquipmentSlotId[],
    );
    const tentative: EquipmentSlotAssignment[] = [];
    const tentativelyOccupied = new Set(occupied);
    let complete = true;

    for (
      let quantityIndex = 0;
      quantityIndex < entry.equippedQuantity;
      quantityIndex += 1
    ) {
      if (inventoryRequiresBothHands(entry, byId)) {
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
      const slot = inferredSlotPriority.find(
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

export function loadoutChangeCommand(
  inventory: readonly BuildInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  entryId: string | undefined,
  slots: readonly EquipmentSlotId[],
  currentEntryId?: string,
  currentSlots: readonly EquipmentSlotId[] = slots,
): CharacterCommand | undefined {
  const loadout = resolveLoadoutAssignments(inventory, byId);
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
  const retained = assignmentsFor(entry.id).filter(
    (assignment) => !slots.includes(assignment.slot),
  );
  const used = new Set(retained.map(({ quantityIndex }) => quantityIndex));
  const pairedHands = slots.includes("main-hand") && slots.includes("off-hand");
  const quantityIndex = pairedHands
    ? 0
    : Array.from({ length: entry.quantity }, (_, index) => index).find(
        (index) => !used.has(index),
      );
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
): InventoryLoadoutToggle {
  const entry = inventory.find(({ id }) => id === entryId);
  if (entry === undefined) return { kind: "unavailable" };
  const loadout = resolveLoadoutAssignments(inventory, byId);
  const assignments = loadout.assignmentsByEntry.get(entryId);
  if (assignments !== undefined && assignments.length > 0)
    return {
      kind: "unequip",
      slots: [...new Set(assignments.map(({ slot }) => slot))],
    };
  if (entry.equippedQuantity > 0) return { kind: "ambiguous" };

  const candidates = new Set(
    inventorySlotCandidates(entry, byId) as readonly EquipmentSlotId[],
  );
  const occupied = new Set(
    [...loadout.assignmentsByEntry.entries()]
      .filter(([candidateId]) => candidateId !== entryId)
      .flatMap(([, candidateAssignments]) =>
        candidateAssignments.map(({ slot }) => slot),
      ),
  );
  if (inventoryRequiresBothHands(entry, byId)) {
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

  const suitable = visibleSlots.filter((slot) => candidates.has(slot));
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

export function compatibleBaseItems(
  enchantment: ContentEntity,
  catalog: readonly ContentEntity[],
): readonly ContentEntity[] {
  const authoredKind =
    contentSpecificValue(enchantment, "Magic Item Type")?.toLocaleLowerCase() ??
    "";
  const enchantmentTarget = contentSpecificValue(
    enchantment,
    "_IsEnchant",
  )?.toLocaleLowerCase();
  const implementTypes = IMPLEMENT_KINDS.filter(
    (implement) =>
      authoredKind === implement ||
      authoredKind.split(/\s*[,;]\s*/u).includes(implement),
  );
  const kind =
    authoredKind === "armor" || authoredKind === "weapon"
      ? authoredKind
      : enchantmentTarget === "shield"
        ? "armor"
        : implementTypes.length > 0
          ? "superior implement"
          : undefined;
  if (kind === undefined) return [];
  const allowedText = (
    kind === "superior implement"
      ? (contentSpecificValue(enchantment, "Implement Type") ?? authoredKind)
      : (contentSpecificValue(
          enchantment,
          kind === "armor" ? "Armor" : "Weapon",
        ) ?? (enchantmentTarget === "shield" ? "Shield" : ""))
  ).replace(/\s+\(.*$/, "");
  const allowed = allowedText
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  const enhancement = Number(
    enchantment.name.match(/\+(\d+)$/)?.[1] ??
      contentSpecificValue(enchantment, "Enhancement")?.match(
        /\+?(\d+)/,
      )?.[1] ??
      0,
  );
  return catalog
    .filter((entity) => entity.type.trim().toLocaleLowerCase() === kind)
    .filter((entity) => {
      const minimum = Number(
        contentSpecificValue(entity, "Minimum Enhancement Bonus") ?? 0,
      );
      if (Number.isFinite(minimum) && minimum > enhancement) return false;
      if (allowed.length === 0 || allowed.includes("any")) return true;
      const name = entity.name.toLocaleLowerCase();
      if (kind === "superior implement") {
        const implementType = normalized(
          contentSpecificValue(entity, "Implement Type") ??
            contentSpecificValue(entity, "Group") ??
            contentSpecificValue(entity, "Type"),
        );
        return allowed.some(
          (value) =>
            value === "implement" ||
            value === "any" ||
            implementType === value ||
            name === value ||
            name.endsWith(` ${value}`),
        );
      }
      if (kind === "armor") {
        const category = contentSpecificValue(
          entity,
          "Armor Category",
        )?.toLocaleLowerCase();
        const armorType = contentSpecificValue(
          entity,
          "Armor Type",
        )?.toLocaleLowerCase();
        return allowed.some(
          (value) =>
            value === category || value === armorType || value === name,
        );
      }
      const category =
        contentSpecificValue(entity, "Weapon Category")?.toLocaleLowerCase() ??
        "";
      const groups = (contentSpecificValue(entity, "Group") ?? "")
        .split(",")
        .map((value) => value.trim().toLocaleLowerCase());
      const hands =
        contentSpecificValue(entity, "Hands Required")?.toLocaleLowerCase() ??
        "";
      const range = contentSpecificValue(entity, "Range") ?? "";
      const properties =
        contentSpecificValue(entity, "Properties")?.toLocaleLowerCase() ?? "";
      return allowed.some(
        (value) =>
          value === name ||
          value === category ||
          groups.includes(value) ||
          (value === "any melee" && category.includes("melee")) ||
          (value === "any melee except reach" &&
            category.includes("melee") &&
            !properties.includes("reach")) ||
          (value.startsWith("any one-handed melee") &&
            category.includes("melee") &&
            hands === "one-handed") ||
          (value === "any one-handed weapon" && hands === "one-handed") ||
          (value === "any ranged" &&
            (category.includes("ranged") || range.trim() !== "")) ||
          (value === "any thrown" && properties.includes("thrown")) ||
          (value === "one-handed" && hands.includes("one-handed")) ||
          (value === "two-handed" && hands.includes("two-handed")),
      );
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function inventoryEntryForEntity(
  entity: ContentEntity,
  acquiredLevel: number,
  base?: ContentEntity,
): BuildInventoryEntry {
  return {
    id: `web:loot:${crypto.randomUUID()}`,
    acquiredLevel,
    quantity: 1,
    equippedQuantity: 0,
    elements: [base, entity]
      .filter((value): value is ContentEntity => value !== undefined)
      .map(({ id, name, type }) => ({ definitionId: id, name, type })),
    overrides: {},
    legality: "rules-legal",
  };
}
