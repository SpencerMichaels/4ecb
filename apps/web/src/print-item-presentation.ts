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
  const titleTier = card.name.match(/\s*\((heroic|paragon|epic)\s+tier\)/i);
  const tier = lastField("Tier") ?? titleTier?.[1];
  const name = titleTier
    ? card.name
        .replace(titleTier[0], "")
        .replace(/\s{2,}/g, " ")
        .trim()
    : card.name;
  const proficiency = field("Proficiency Bonus", "Proficient");
  const critical = lastField("Critical");
  const criticalFormula = critical
    ?.trim()
    .match(/^(\+?\d+d\d+)(?:\s+damage)?\.?$/i)?.[1];
  const allStats = [
    ["Damage", field("Damage")],
    ["Proficiency", proficiency?.trim().replace(/^(\d+)$/, "+$1")],
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
    tier
      ? sentenceCase(
          /tier$/i.test(tier.trim())
            ? tier.toLowerCase()
            : `${tier.toLowerCase()} tier`,
        )
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const excluded = new Set([
    "level",
    "tier",
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
  const precedesPowers = (entry: SheetValue) =>
    /^(?:prerequisites?|requirements?)$/i.test(entry.label.trim());
  const rules = bodyFields.some((entry) => printItemPower(entry) !== undefined)
    ? [
        ...bodyFields.filter(
          (entry) =>
            printItemPower(entry) === undefined && precedesPowers(entry),
        ),
        ...bodyFields.filter((entry) => printItemPower(entry) !== undefined),
        ...bodyFields.filter(
          (entry) =>
            printItemPower(entry) === undefined && !precedesPowers(entry),
        ),
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
    name,
    tier,
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
export function printItemPower(field: SheetValue):
  | {
      readonly title: string;
      readonly text: string;
      readonly usage?: string;
      readonly keywords?: string;
      readonly actionType?: string;
    }
  | undefined {
  if (!/^(?:power|utility power|attack power)\b/i.test(field.label.trim()))
    return undefined;
  const actionPattern =
    "No Action|Immediate Interrupt|Immediate Reaction|Opportunity|Standard|Move|Minor|Free";
  const actionStart = new RegExp(
    `^\\s*(${actionPattern})(?:\\s+Action)?\\s*(?:\\.\\s*|$)`,
    "i",
  );
  const labelParts = field.label
    .trim()
    .replace(/^(?:(?:utility|attack)\s+)?power\b/i, "");
  const labelAction = labelParts.match(
    new RegExp(`:\\s*(${actionPattern})(?:\\s+Action)?\\.?\\s*$`, "i"),
  );
  const labelMetadata = labelParts.replace(/:\s*.*$/, "");
  const valuePrefix = field.value.match(
    /^\s*(?:(?:Utility|Attack)\s+)?Power\s*\(([^)]+)\)\s*:\s*/i,
  );
  const consumable = field.value.match(
    new RegExp(
      `^\\s*Consumable\\s*\\((${actionPattern})(?:\\s+Action)?\\)[ \\t]*(?::\\s*|\\.?[ \\t]*\\r?\\n[ \\t]*|$)`,
      "i",
    ),
  );
  let text = field.value.slice(
    valuePrefix?.[0].length ?? consumable?.[0].length ?? 0,
  );
  const action = text.match(actionStart);
  const actionType = action?.[1] ?? consumable?.[1] ?? labelAction?.[1];
  const metadata =
    valuePrefix?.[1] ?? (consumable ? "Consumable" : labelMetadata);
  const tokens = metadata
    .replace(/[()]/g, "")
    .split(/\s*[*•·]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const frequency = tokens.find((part) =>
    /^(?:at[- ]will|encounter|daily|consumable)$/i.test(part),
  );
  if (!frequency || !actionType)
    return { title: field.label.trim(), text: field.value };
  const usage = /^at[- ]will$/i.test(frequency)
    ? "At-Will"
    : frequency[0]!.toUpperCase() + frequency.slice(1).toLowerCase();
  const keywords = tokens.filter((part) => part !== frequency).join(", ");
  const displayAction = actionType
    .split(" ")
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  if (action) text = text.slice(action[0].length);
  return {
    title: `${usage}${keywords ? ` • ${keywords}` : ""} • ${displayAction}`,
    usage,
    ...(keywords ? { keywords } : {}),
    actionType: displayAction,
    text,
  };
}

/** Separate only explicit authored rule labels at sentence/line boundaries.
 * In particular Augment remains a clause of its power, not a passive Property. */
export function printItemPowerClauses(text: string): readonly SheetValue[] {
  const tables = [...text.matchAll(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)];
  const labels = [
    ...text.matchAll(
      /(?:^|[.!?]\s+|\n\s*)(Trigger|Effect|Attack|Hit|Miss|Special|Requirements?|Prerequisites?|Target|Sustain (?:Minor|Move|Standard)|Augment \d+)\s*:\s*/gi,
    ),
  ].filter(
    (match) =>
      !tables.some(
        (table) =>
          match.index >= table.index &&
          match.index < table.index + table[0].length,
      ),
  );
  if (labels.length === 0) return [{ label: "", value: text }];
  const clauses: SheetValue[] = [];
  let start = 0;
  let label = "";
  for (const match of labels) {
    const labelOffset = match.index + match[0].indexOf(match[1]!);
    const value = text.slice(start, labelOffset).trim();
    if (value) clauses.push({ label, value });
    label = match[1]!;
    start = match.index + match[0].length;
  }
  clauses.push({ label, value: text.slice(start).trim() });
  return clauses;
}
