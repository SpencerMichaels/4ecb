import type { SheetCard, SheetValue } from "@4ecb/sheet-model";
import { itemCategoryIcon } from "./item-icons";

export function printItemPresentation(card: SheetCard) {
  const find = (entries: readonly SheetValue[], names: string[]) =>
    entries.find((entry) =>
      names.some(
        (name) => name.toLowerCase() === entry.label.trim().toLowerCase(),
      ),
    )?.value;
  const field = (...names: string[]) => find(card.fields, names);
  const lastField = (...names: string[]) =>
    find([...card.fields].reverse(), names);
  const stats = [
    ["Damage", field("Damage")],
    ["Proficiency", field("Proficiency Bonus", "Proficient")],
    ["Group", field("Group")],
    ["Range", field("Range")],
    ["AC bonus", field("Armor Bonus", "AC Bonus")],
    ["Check penalty", field("Check")],
    ["Speed penalty", field("Speed")],
    ["Quantity", field("Quantity") === "1" ? undefined : field("Quantity")],
  ].flatMap(([label, value]) => (label && value ? [{ label, value }] : []));
  const magicType = lastField("Magic Item Type");
  const baseType = card.baseItemType ?? card.itemType;
  const kind =
    baseType === "Weapon" || baseType === "Armor"
      ? baseType
      : (magicType?.replace(/\s+slot item$/i, " item") ??
        card.itemType ??
        "Item");
  const excluded = new Set([
    "level",
    "gold",
    "magic item type",
    "type",
    "weapon",
    "armor",
    "item slot",
    "full text",
    "description",
    "short description",
    "flavor",
    "flavor text",
    "equipped",
    "count",
    "weight",
    "range",
    "damage",
    "quantity",
    "group",
    "proficiency bonus",
    "proficient",
    "weapon category",
    "hands required",
    "armor bonus",
    "ac bonus",
    "check",
    "speed",
    "armor type",
    "category",
    "rarity",
    "key ability",
    "internalonly",
    "weaponequiv",
    "enchantequiv",
    "granted powers",
  ]);
  const rules = card.fields.filter(
    (entry) => !excluded.has(entry.label.trim().toLowerCase()),
  );
  const weight = field("Weight");
  const price = lastField("Gold");
  return {
    stats,
    rules,
    // Keep unstructured/custom mechanical prose when it has no structured
    // replacement, but never repeat an explicitly identified flavor passage.
    description:
      rules.length === 0 &&
      stats.every((stat) => stat.label === "Quantity") &&
      card.description !== card.flavor
        ? card.description
        : undefined,
    kind,
    level: lastField("Level"),
    slot: field("Item Slot"),
    weight: weight
      ? /^[\d.,]+$/.test(weight)
        ? `${weight} lb`
        : weight
      : undefined,
    price: price
      ? /^[\d.,]+$/.test(price)
        ? `${price} gp`
        : price
      : undefined,
    icon: itemCategoryIcon({
      type: card.itemType,
      identityType: card.baseItemType,
      armorType: field("Armor Type"),
      magicItemType: magicType,
      itemSlot: field("Item Slot"),
    }),
  };
}

/** Only remove a recognized usage/action prefix; unknown authored prose stays intact. */
export function printItemPower(field: SheetValue) {
  if (!/^(?:power|utility power|attack power)\b/i.test(field.label.trim()))
    return undefined;
  const match = field.value.match(
    /^\s*Power\s*\(([^)]+)\)\s*:\s*(Standard|Move|Minor|Free|Immediate Interrupt|Immediate Reaction|Opportunity)(?:\s+Action)?\s*\.\s*/i,
  );
  if (!match) {
    const consumable = field.value.match(
      /^\s*Consumable\s*\((Standard|Move|Minor|Free|Immediate Interrupt|Immediate Reaction|Opportunity)(?:\s+Action)?\)\s*:\s*/i,
    );
    if (consumable)
      return {
        title: `Consumable · ${consumable[1]}`,
        text: field.value.slice(consumable[0].length),
      };
    const action = /\(Consumable\)/i.test(field.label)
      ? field.value.match(
          /^\s*(Standard|Move|Minor|Free|Immediate Interrupt|Immediate Reaction|Opportunity)\s+Action\s*\.\s*/i,
        )
      : undefined;
    if (action)
      return {
        title: `Consumable · ${action[1]}`,
        text: field.value.slice(action[0].length),
      };
    return { title: field.label.trim(), text: field.value };
  }
  return {
    title: `${match[1]} · ${match[2]}`,
    text: field.value.slice(match[0].length),
  };
}
