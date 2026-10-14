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
  const critical = lastField("Critical");
  const criticalFormula = critical
    ?.trim()
    .match(/^(\+?\d+d\d+)(?:\s+damage)?\.?$/i)?.[1];
  const allStats = [
    ["Damage", field("Damage")],
    ["Proficiency", field("Proficiency Bonus", "Proficient")],
    ["Group", field("Group")],
    ["Range", field("Range")],
    ["AC bonus", field("Armor Bonus", "AC Bonus")],
    ["Check penalty", field("Check")],
    ["Speed penalty", field("Speed")],
    [
      "Enhancement",
      lastField("Enhancement")?.replace(
        /^(\+\d+)\s+(?:attack rolls and damage rolls|AC|Fortitude, Reflex, and Will)\.?$/i,
        "$1",
      ),
    ],
    ["Critical", criticalFormula],
    [
      "Category",
      field("Weapon Category", "Armor Category", "Gear Category", "Category"),
    ],
    ["Hands", field("Hands Required")],
    ["Armor type", field("Armor Type")],
    ["Rarity", lastField("Rarity")],
    ["Key ability", field("Key Ability")],
  ].flatMap(([label, value]) => (label && value ? [{ label, value }] : []));
  const magicType = lastField("Magic Item Type");
  const baseType = card.baseItemType ?? card.itemType;
  const isWeapon =
    baseType === "Weapon" || magicType?.toLowerCase() === "weapon";
  const isArmor = baseType === "Armor" || magicType?.toLowerCase() === "armor";
  const isImplement =
    /^(?:superior implement|implement|holy symbol|ki focus|orb|rod|staff|tome|totem|wand)$/i.test(
      magicType ?? card.itemType ?? "",
    );
  const meaningfulPenalty = (value: string) =>
    !["-", "—", "0", "+0"].includes(value.trim());
  const titleEnhancement = card.name.match(/\+(\d+)\b/)?.[1];
  const combatStats = allStats.filter(
    ({ label, value }) =>
      ![
        "Group",
        "Category",
        "Hands",
        "Armor type",
        "Rarity",
        "Key ability",
      ].includes(label) &&
      !(
        label === "Enhancement" &&
        (isWeapon ||
          (titleEnhancement !== undefined && value === `+${titleEnhancement}`))
      ) &&
      (!(label === "Check penalty" || label === "Speed penalty") ||
        meaningfulPenalty(value)),
  );
  const row = (...labels: string[]) =>
    labels.flatMap((label) =>
      combatStats.filter((stat) => stat.label === label),
    );
  const groupedRows = (
    isWeapon
      ? [row("Range", "Proficiency", "Damage", "Critical")]
      : isArmor
        ? [
            row("AC bonus", "Enhancement"),
            row("Check penalty", "Speed penalty"),
          ]
        : [
            row("Enhancement", "Critical"),
            row("Range", "Proficiency", "Damage"),
            row("AC bonus", "Check penalty", "Speed penalty"),
          ]
  ).filter((values) => values.length > 0);
  const remainingStats = combatStats.filter(
    (stat) => !groupedRows.some((values) => values.includes(stat)),
  );
  const statRows =
    remainingStats.length > 0 ? [...groupedRows, remainingStats] : groupedRows;
  const stats = statRows.flat();
  const kind =
    baseType === "Weapon" || baseType === "Armor"
      ? baseType
      : (magicType?.replace(/\s+slot item$/i, " item") ??
        card.itemType ??
        "Item");
  const lower = (value: string | undefined) => value?.trim().toLowerCase();
  const category = field(
    "Weapon Category",
    "Armor Category",
    "Gear Category",
    "Category",
  );
  const armorType = lower(field("Armor Type"));
  const armorCategory = lower(field("Armor Category"));
  const armorDescription = armorCategory?.includes("shield")
    ? armorCategory
    : armorType?.includes("shield")
      ? armorType
      : [
          armorType,
          armorCategory,
          armorCategory && !armorCategory.includes("armor")
            ? "armor"
            : undefined,
        ]
          .filter(Boolean)
          .join(" ");
  const primaryMetadata = [
    lower(lastField("Rarity")),
    ...(isWeapon
      ? [lower(field("Hands Required")), lower(field("Group"))]
      : isArmor
        ? [lower(field("Hands Required")), armorDescription]
        : [lower(field("Hands Required")), lower(category ?? kind)]),
  ]
    .filter(Boolean)
    .join(" ");
  const sentenceCase = (value: string) =>
    value ? value[0]!.toUpperCase() + value.slice(1) : value;
  const metadata = [
    sentenceCase(primaryMetadata),
    isWeapon && category ? sentenceCase(category.toLowerCase()) : undefined,
    !isWeapon && field("Group") ? `Group ${field("Group")}` : undefined,
    field("Key Ability") ? `Key ability ${field("Key Ability")}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const excluded = new Set([
    "level",
    "gold",
    "silver",
    "copper",
    "market price",
    "enhancement",
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
    "armor category",
    "gear category",
    "category",
    "rarity",
    "key ability",
    "internalonly",
    "weaponequiv",
    "enchantequiv",
    "granted powers",
  ]);
  if (criticalFormula) excluded.add("critical");
  const weaponProperties = card.fields.filter(
    (entry) =>
      baseType === "Weapon" &&
      entry.label.trim().toLowerCase() === "properties",
  );
  const bodyFields = card.fields.filter(
    (entry) =>
      !excluded.has(entry.label.trim().toLowerCase()) &&
      !weaponProperties.includes(entry),
  );
  const isProperty = (entry: SheetValue) =>
    /^(?:property|properties)$/i.test(entry.label.trim());
  const rules = bodyFields.some((entry) => printItemPower(entry) !== undefined)
    ? [
        ...bodyFields.filter(
          (entry) => printItemPower(entry) === undefined && !isProperty(entry),
        ),
        ...bodyFields.filter((entry) => printItemPower(entry) !== undefined),
        ...bodyFields.filter(isProperty),
      ]
    : bodyFields;
  const weight = field("Weight");
  const price =
    [
      [lastField("Gold"), "gp"],
      [lastField("Silver"), "sp"],
      [lastField("Copper"), "cp"],
    ]
      .flatMap(([value, unit]) =>
        value ? [/^[\d.,]+$/.test(value) ? `${value} ${unit}` : value] : [],
      )
      .join(" · ") || lastField("Market Price");
  const rawSlot = field("Item Slot");
  const slot =
    !isWeapon &&
    !isImplement &&
    /^(?:head|neck|body|arms|hands|waist|feet|rings?|ring[- ]?[12]|tattoo)$/i.test(
      rawSlot?.trim() ?? "",
    )
      ? rawSlot
      : undefined;
  const displayWeight = weight
    ? /^[\d.,]+$/.test(weight)
      ? `${weight} lb`
      : weight
    : undefined;
  return {
    stats,
    statRows,
    metadata,
    footerDetails: [slot, displayWeight, price].filter(Boolean).join(" · "),
    weaponProperties,
    rules,
    // Keep unstructured/custom mechanical prose when it has no structured
    // replacement, but never repeat an explicitly identified flavor passage.
    description:
      rules.length === 0 &&
      weaponProperties.length === 0 &&
      stats.every((stat) =>
        ["Category", "Rarity", "Key ability"].includes(stat.label),
      ) &&
      card.description !== card.flavor
        ? card.description
        : undefined,
    kind,
    level: lastField("Level"),
    slot,
    weight: displayWeight,
    price,
    icon: itemCategoryIcon({
      type: card.itemType,
      identityType: card.baseItemType,
      armorType: field("Armor Type"),
      magicItemType: magicType,
      itemSlot: field("Item Slot"),
      gearCategory: field("Gear Category", "Category"),
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
        usage: "Consumable",
        actionType: consumable[1],
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
        usage: "Consumable",
        actionType: action[1],
        text: field.value.slice(action[0].length),
      };
    return { title: field.label.trim(), text: field.value };
  }
  return {
    title: `${match[1]} · ${match[2]}`,
    usage: match[1],
    actionType: match[2],
    text: field.value.slice(match[0].length),
  };
}
