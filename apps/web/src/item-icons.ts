import type { EquipmentSlotId } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { contentSpecificValue } from "./builder-ui";
import type { IconName } from "./Icon";

export const LOADOUT_SLOT_ICONS: Readonly<Record<EquipmentSlotId, IconName>> = {
  head: "hard-hat",
  neck: "medal",
  body: "shirt",
  arms: "arms",
  hands: "hand",
  waist: "square-star",
  feet: "footprints",
  "main-hand": "sword",
  "off-hand": "shield",
  symbol: "church",
  "ki-focus": "focus",
  "ring-1": "gem",
  "ring-2": "gem",
  tattoo: "stamp",
  companion: "paw-print",
  familiar: "paw-print",
  mount: "paw-print",
};

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

/**
 * Resolves the canonical item icon used by loadout slots, detail cards, and
 * selection chips. For composed magic items, the physical base identity wins
 * over the enchantment's generic magic-item category.
 */
export function canonicalItemIcon(
  entity: ContentEntity,
  physicalBase?: ContentEntity,
): IconName {
  const identity = physicalBase ?? entity;
  return itemCategoryIcon({
    type: entity.type,
    identityType: identity.type,
    armorType: contentSpecificValue(identity, "Armor Type"),
    magicItemType: contentSpecificValue(entity, "Magic Item Type"),
    itemSlot: contentSpecificValue(entity, "Item Slot"),
    gearCategory:
      contentSpecificValue(entity, "Gear Category") ??
      contentSpecificValue(entity, "Category"),
    ritualType: contentSpecificValue(entity, "type"),
  });
}

/** Shared metadata mapping for content entities and renderer-neutral sheet cards. */
export function itemCategoryIcon(metadata: {
  readonly type?: string | undefined;
  readonly identityType?: string | undefined;
  readonly armorType?: string | undefined;
  readonly magicItemType?: string | undefined;
  readonly itemSlot?: string | undefined;
  readonly gearCategory?: string | undefined;
  readonly ritualType?: string | undefined;
}): IconName {
  const identityType = normalized(metadata.identityType ?? metadata.type);
  if (
    identityType === "armor" &&
    normalized(metadata.armorType).includes("shield")
  )
    return LOADOUT_SLOT_ICONS["off-hand"];
  if (identityType === "weapon") return LOADOUT_SLOT_ICONS["main-hand"];
  if (identityType === "armor") return LOADOUT_SLOT_ICONS.body;

  const type = normalized(metadata.type);
  const kind =
    type === "magic item"
      ? normalized(metadata.magicItemType) || "magic item"
      : type === "ritual"
        ? normalized(metadata.ritualType) || "ritual"
        : type;
  const slot = normalized(metadata.itemSlot);
  const value = `${kind} ${slot}`;

  if (value.includes("artifact") || value.includes("dragonshard")) return "gem";
  if (kind === "weapon") return LOADOUT_SLOT_ICONS["main-hand"];
  if (kind === "armor") return LOADOUT_SLOT_ICONS.body;
  if (
    kind.includes("ammunition") ||
    normalized(metadata.gearCategory) === "ammunition"
  )
    return "bow-arrow";
  if (type === "gear") return "item";
  if (type === "item set") return "layers";
  if (type === "ritual scroll") return "details";
  if (kind.includes("martial practice")) return "dumbbell";
  if (kind.includes("alchemical") || kind.includes("formula"))
    return "flask-conical";
  if (type === "ritual") return "book";
  if (kind.includes("alternative reward")) return "award";
  if (/boon|gift|blessing/u.test(kind)) return "gift";
  if (kind.includes("echo of power")) return "waves";
  if (kind.includes("grandmaster training")) return "skill";
  if (/secret|mystery/u.test(kind)) return "key-round";
  if (kind.includes("soulfang")) return "bone";
  if (kind.includes("templar brand")) return "stamp";
  if (kind.includes("arms slot")) return LOADOUT_SLOT_ICONS.arms;
  if (kind.includes("feet")) return LOADOUT_SLOT_ICONS.feet;
  if (kind.includes("hands")) return LOADOUT_SLOT_ICONS.hands;
  if (kind.includes("head")) return LOADOUT_SLOT_ICONS.head;
  if (kind.includes("neck")) return LOADOUT_SLOT_ICONS.neck;
  if (kind.includes("waist")) return LOADOUT_SLOT_ICONS.waist;
  if (kind === "ring" || slot.includes("ring"))
    return LOADOUT_SLOT_ICONS["ring-1"];
  if (/companion|familiar|mount/u.test(value))
    return LOADOUT_SLOT_ICONS.companion;
  if (kind.includes("holy symbol")) return LOADOUT_SLOT_ICONS.symbol;
  if (kind.includes("ki focus")) return LOADOUT_SLOT_ICONS["ki-focus"];
  if (kind.includes("tattoo")) return LOADOUT_SLOT_ICONS.tattoo;
  if (kind === "orb") return "orbit";
  if (/rod|staff|totem|wand/u.test(kind)) return "wand-sparkles";
  if (kind === "tome") return "book-marked";
  if (/consumable/u.test(kind)) return "package-open";
  if (/elixir|potion/u.test(kind)) return "flask-round";
  if (kind.includes("reagent")) return "test-tube";
  if (kind.includes("whetstone")) return "anvil";
  if (/intelligent item|psionic talent/u.test(kind)) return "brain";
  return "feat";
}
