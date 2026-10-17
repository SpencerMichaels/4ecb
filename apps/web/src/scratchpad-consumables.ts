import type { CharacterSheetModel } from "@4ecb/sheet-model";
import { CONSUMABLE_KINDS } from "./equipment-ui";
import { printItemPower } from "./print-item-presentation";
import { itemCategoryIcon } from "./item-icons";
import type { IconName } from "./Icon";

export interface ScratchpadConsumable {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly boxes: boolean;
  readonly icon: IconName;
}
export const CONSUMABLE_BOX_LIMIT = 5;
/** All owned consumables, regardless of equipment or the item-card checkbox. */
export function scratchpadConsumables(
  model: CharacterSheetModel,
): readonly ScratchpadConsumable[] {
  const kinds = new Set<string>([
    ...CONSUMABLE_KINDS,
    "ammunition",
    "ritual scroll",
  ]);
  const items = (model.overview?.inventory ?? []).flatMap((item, index) => {
    const consumable =
      item.category === "consumables" ||
      item.category === "ammunition" ||
      kinds.has(item.itemType?.trim().toLowerCase() ?? "") ||
      kinds.has(item.baseItemType?.trim().toLowerCase() ?? "") ||
      item.fields.some(
        (field) =>
          /^(?:magic item type|gear category|category)$/i.test(
            field.label.trim(),
          ) && kinds.has(field.value.trim().toLowerCase()),
      ) ||
      item.fields.some((field) => {
        const power = printItemPower(field);
        return (
          power !== undefined &&
          (power.usage === "Consumable" ||
            /\(\s*consumable(?:\s*[*•·)]|$)/i.test(field.label) ||
            /^\s*consumable\s*\(/i.test(field.value) ||
            /^\s*(?:(?:utility|attack)\s+)?power\s*\(\s*consumable(?:\s*[*•·)]|$)/i.test(
              field.value,
            ))
        );
      });
    const field = (...labels: string[]) =>
      item.fields.find((field) =>
        labels.some(
          (label) => label.toLowerCase() === field.label.trim().toLowerCase(),
        ),
      )?.value;
    return item.quantity > 0 && consumable
      ? [
          {
            id: `consumable:${index}`,
            name: item.name,
            quantity: item.quantity,
            boxes:
              Number.isSafeInteger(item.quantity) &&
              item.quantity <= CONSUMABLE_BOX_LIMIT,
            icon: itemCategoryIcon({
              type: item.itemType,
              identityType: item.baseItemType,
              armorType: field("Armor Type"),
              magicItemType: field("Magic Item Type"),
              itemSlot: field("Item Slot"),
              gearCategory: field("Gear Category", "Category"),
            }),
          },
        ]
      : [];
  });
  const shortName = (name: string) =>
    name
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim() || name;
  const variants = new Map<string, Set<string>>();
  for (const item of items) {
    const key = shortName(item.name).toLocaleLowerCase();
    const names = variants.get(key) ?? new Set<string>();
    names.add(item.name.trim().toLocaleLowerCase());
    variants.set(key, names);
  }
  return items
    .map((item) => ({
      ...item,
      name:
        variants.get(shortName(item.name).toLocaleLowerCase())!.size > 1
          ? item.name
          : shortName(item.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
