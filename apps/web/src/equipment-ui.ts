import {
  formatInventoryItemName,
  type BuildInventoryEntry,
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

function familyCompatibility(entity: ContentEntity): string {
  return ["Magic Item Type", "Item Slot", "Armor", "Weapon"]
    .map(
      (name) => contentSpecificValue(entity, name)?.toLocaleLowerCase() ?? "",
    )
    .join("\0");
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
  const authoredKind = contentSpecificValue(
    enchantment,
    "Magic Item Type",
  )?.toLocaleLowerCase();
  const enchantmentTarget = contentSpecificValue(
    enchantment,
    "_IsEnchant",
  )?.toLocaleLowerCase();
  const kind =
    authoredKind === "armor" || authoredKind === "weapon"
      ? authoredKind
      : enchantmentTarget === "shield"
        ? "armor"
        : undefined;
  if (kind !== "armor" && kind !== "weapon") return [];
  const allowedText = (
    contentSpecificValue(enchantment, kind === "armor" ? "Armor" : "Weapon") ??
    (enchantmentTarget === "shield" ? "Shield" : "")
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
