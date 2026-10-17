import type { CharacterSheetModel } from "@4ecb/sheet-model";
import { CONSUMABLE_KINDS } from "./equipment-ui";
import { printItemPower } from "./print-item-presentation";

export interface ScratchpadConsumable {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly circles: boolean;
}
export const CONSUMABLE_CIRCLE_LIMIT = 5;
/** All owned consumables, regardless of equipment or the item-card checkbox. */
export function scratchpadConsumables(
  model: CharacterSheetModel,
): readonly ScratchpadConsumable[] {
  const kinds = new Set<string>([
    ...CONSUMABLE_KINDS,
    "ammunition",
    "ritual scroll",
  ]);
  return (model.overview?.inventory ?? [])
    .flatMap((item, index) => {
      const consumable =
        item.category === "consumables" ||
        item.category === "ammunition" ||
        kinds.has(item.itemType?.trim().toLowerCase() ?? "") ||
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
      return item.quantity > 0 && consumable
        ? [
            {
              id: `consumable:${index}`,
              name: item.name,
              quantity: item.quantity,
              circles:
                Number.isSafeInteger(item.quantity) &&
                item.quantity <= CONSUMABLE_CIRCLE_LIMIT,
            },
          ]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
