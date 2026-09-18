import { createContext, type ReactNode } from "react";

import {
  isUserFacingSpecific,
  type ContentEntity,
  type SpecificField,
} from "@4ecb/content-domain";

import { ActionTypeIcon } from "./ActionTypeIcon";
import { entityCurrencyCopper, formatCopperPrice } from "./equipment-ui";
import { Icon, type IconName } from "./Icon";
import { canonicalItemIcon } from "./item-icons";
import { Prose } from "./Prose";
import {
  classKeyAbilitiesSentence,
  contentSpecificValue,
  primaryDetailTypeLabel,
  splitLabeledDescription,
} from "./builder-ui";
import {
  entityTypeIcon,
  entityVisualTone,
  visualToneClass,
} from "./visual-language";

export const HideFlavortextContext = createContext(false);

export function entityCardSpecifics(
  entity: ContentEntity,
): readonly SpecificField[] {
  return entity.specifics.filter(
    (field) =>
      isUserFacingSpecific(field) &&
      !["short description", "source"].includes(
        field.name.trim().toLocaleLowerCase(),
      ),
  );
}

export function entityCardSource(entity: ContentEntity): string {
  return (
    entity.source ||
    contentSpecificValue(entity, "Source")?.trim() ||
    "Not specified"
  );
}

const ITEM_TYPES = new Set([
  "armor",
  "gear",
  "item set",
  "magic item",
  "ritual",
  "ritual scroll",
  "weapon",
]);

export function isItemEntity(entity: ContentEntity): boolean {
  return ITEM_TYPES.has(normalizedFieldName(entity.type));
}

function itemKind(entity: ContentEntity): string {
  const type = normalizedFieldName(entity.type);
  if (type === "magic item")
    return (
      contentSpecificValue(entity, "Magic Item Type")?.trim() || "Magic Item"
    );
  if (type === "ritual")
    return contentSpecificValue(entity, "type")?.trim() || "Ritual";
  return entity.type.trim() || "Item";
}

export function itemCardLabel(
  entity: ContentEntity,
  physicalBase?: ContentEntity,
): string {
  const authoredKind =
    physicalBase === undefined ? itemKind(entity) : itemKind(physicalBase);
  const kind = /\bslot item\s*$/iu.test(authoredKind) ? "Item" : authoredKind;
  const level = contentSpecificValue(entity, "Level")?.trim();
  return level ? `${kind} ${level}` : kind;
}

export function powerCardLabel(entity: ContentEntity): string {
  const usage = contentSpecificValue(entity, "Power Usage")?.trim();
  const powerType = contentSpecificValue(entity, "Power Type")
    ?.trim()
    .toLocaleLowerCase();
  const level = contentSpecificValue(entity, "Level")?.trim();
  return [usage, powerType, level].filter(Boolean).join(" ") || "Power";
}

export function itemCardIcon(
  entity: ContentEntity,
  physicalBase?: ContentEntity,
): IconName {
  return canonicalItemIcon(entity, physicalBase);
}

export function EntityCardLeadingIcon({
  entity,
  physicalBase,
}: {
  readonly entity: ContentEntity | undefined;
  readonly physicalBase?: ContentEntity | undefined;
}) {
  if (entity === undefined) return <Icon name="content" />;
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  if (isPower)
    return (
      <ActionTypeIcon
        decorative
        value={contentSpecificValue(entity, "Action Type")}
      />
    );
  return (
    <Icon
      name={
        isItemEntity(entity)
          ? itemCardIcon(entity, physicalBase)
          : entityTypeIcon(entity.type)
      }
    />
  );
}

export function EntityCardHeader({
  entity,
  headingId,
  headingLevel = 4,
  physicalBase,
  subheading,
}: {
  readonly entity: ContentEntity;
  readonly headingId?: string;
  readonly headingLevel?: 2 | 3 | 4 | 5;
  readonly physicalBase?: ContentEntity | undefined;
  readonly subheading?: ReactNode;
}) {
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  const isItem = isItemEntity(entity);
  const headingContent = entity.name;
  const heading =
    headingLevel === 2 ? (
      <h2 id={headingId}>{headingContent}</h2>
    ) : headingLevel === 3 ? (
      <h3 id={headingId}>{headingContent}</h3>
    ) : headingLevel === 5 ? (
      <h5 id={headingId}>{headingContent}</h5>
    ) : (
      <h4 id={headingId}>{headingContent}</h4>
    );
  return (
    <>
      <div className="detail-heading-row">
        <div className="entity-card-heading-main">
          <EntityCardLeadingIcon entity={entity} physicalBase={physicalBase} />
          {heading}
        </div>
        <span className="eyebrow entity-kind">
          {isItem
            ? itemCardLabel(entity, physicalBase)
            : isPower
              ? powerCardLabel(entity)
              : primaryDetailTypeLabel(entity)}
        </span>
      </div>
      {subheading === undefined ? null : (
        <div className="primary-detail-subheading">{subheading}</div>
      )}
    </>
  );
}

function normalizedFieldName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

const PROSE_FIELD_NAMES = new Set([
  "benefit",
  "class features",
  "common knowledge",
  "creating",
  "description",
  "full text",
  "physical qualities",
  "playing",
  "rules item",
  "supplemental",
]);

export function isProseSpecific(field: SpecificField): boolean {
  const value = field.value.replace(/\r\n?/gu, "\n");
  const hasTabularColumns = value
    .split("\n")
    .some((line) => /\S[^\n]*\t[^\n]*\S/u.test(line.trimStart()));
  if (hasTabularColumns || /<\/?table>/iu.test(value)) return false;
  return (
    PROSE_FIELD_NAMES.has(normalizedFieldName(field.name)) ||
    value.includes("\n") ||
    (value.trim().length >= 160 && /[.!?](?:\s|$)/u.test(value))
  );
}

function isStructuredProseSpecific(field: SpecificField): boolean {
  return (
    PROSE_FIELD_NAMES.has(normalizedFieldName(field.name)) &&
    isProseSpecific(field)
  );
}

function SpecificValue({ field }: { readonly field: SpecificField }) {
  return isProseSpecific(field) ? <Prose value={field.value} /> : field.value;
}

const CLASS_FIELD_GROUPS: readonly {
  readonly heading: string;
  readonly fieldNames: readonly string[];
}[] = [
  {
    heading: "Role & Power Source",
    fieldNames: ["Role", "Power Source", "Key Abilities"],
  },
  {
    heading: "Starting Statistics",
    fieldNames: [
      "Hit Points at 1st Level",
      "Hit Points per Level Gained",
      "Healing Surges",
      "Bonus to Defense",
    ],
  },
  {
    heading: "Proficiencies & Training",
    fieldNames: [
      "Armor Proficiencies",
      "Weapon Proficiencies",
      "Implements",
      "Implement",
      "Trained Skills",
      "Class Skills",
      "Secondary Abilities",
    ],
  },
  {
    heading: "Class Features & Build",
    fieldNames: [
      "Class Features",
      "Build Options",
      "Hybrid Talent Options",
      "Trait Package",
      "Powers",
      "Power Name",
    ],
  },
  {
    heading: "Flavor",
    fieldNames: ["Creating", "Supplemental"],
  },
];

export interface ClassSpecificGroup {
  readonly heading: string;
  readonly fields: readonly SpecificField[];
}

export function isClassEntity(entity: ContentEntity): boolean {
  const type = normalizedFieldName(entity.type);
  return type === "class" || type === "hybrid class";
}

/** Groups every authored Class field once, retaining unknown fields in Other. */
export function groupClassSpecifics(
  fields: readonly SpecificField[],
): readonly ClassSpecificGroup[] {
  const claimed = new Set<SpecificField>();
  const groups = CLASS_FIELD_GROUPS.map(({ heading, fieldNames }) => {
    const groupFields = fieldNames.flatMap((name) => {
      const normalizedName = normalizedFieldName(name);
      const matches = fields.filter(
        (field) =>
          !claimed.has(field) &&
          normalizedFieldName(field.name) === normalizedName,
      );
      for (const field of matches) claimed.add(field);
      return matches;
    });
    return { heading, fields: groupFields };
  }).filter((group) => group.fields.length > 0);
  const other = fields.filter((field) => !claimed.has(field));
  return other.length === 0
    ? groups
    : [...groups, { heading: "Other", fields: other }];
}

function ClassFieldEntries({
  entity,
  fields,
  heading,
}: {
  readonly entity: ContentEntity;
  readonly fields: readonly SpecificField[];
  readonly heading: string;
}) {
  const mergedImplementFields = fields.filter((field) =>
    ["implements", "implement"].includes(normalizedFieldName(field.name)),
  );
  const rest = fields.filter((field) => !mergedImplementFields.includes(field));
  let keyAbilitiesRendered = false;

  return (
    <>
      {mergedImplementFields.length === 0 ? null : (
        <div>
          <dt>Implements</dt>
          {mergedImplementFields.map((field) => (
            <dd
              className={isProseSpecific(field) ? undefined : "preserve-lines"}
              key={`${field.ordinal}-${field.name}`}
            >
              <SpecificValue field={field} />
            </dd>
          ))}
        </div>
      )}
      {rest.map((field) => {
        const fieldName = normalizedFieldName(field.name);
        const labeled =
          heading === "Role & Power Source" &&
          (fieldName === "role" || fieldName === "power source")
            ? splitLabeledDescription(field.value)
            : undefined;
        const keyAbilities =
          fieldName === "key abilities" && !keyAbilitiesRendered
            ? classKeyAbilitiesSentence(entity)
            : undefined;
        if (fieldName === "key abilities") keyAbilitiesRendered = true;
        return (
          <div key={`${field.ordinal}-${field.name}`}>
            <dt>{field.name || "Unnamed field"}</dt>
            <dd
              className={isProseSpecific(field) ? undefined : "preserve-lines"}
            >
              {labeled === undefined ? (
                keyAbilities === undefined ? (
                  <SpecificValue field={field} />
                ) : (
                  keyAbilities
                )
              ) : (
                <>
                  {labeled.label === undefined ? null : (
                    <strong>{labeled.label}.</strong>
                  )}
                  {labeled.description === undefined
                    ? null
                    : labeled.label === undefined
                      ? labeled.description
                      : ` ${labeled.description}`}
                </>
              )}
            </dd>
          </div>
        );
      })}
    </>
  );
}

function ClassSpecifics({
  entity,
  fields,
}: {
  readonly entity: ContentEntity;
  readonly fields: readonly SpecificField[];
}) {
  return groupClassSpecifics(fields).map((group) => (
    <section key={group.heading}>
      <h3>{group.heading}</h3>
      <dl className="field-list">
        <ClassFieldEntries
          entity={entity}
          fields={group.fields}
          heading={group.heading}
        />
      </dl>
    </section>
  ));
}

function DefaultSpecifics({
  entity,
  fields,
}: {
  readonly entity: ContentEntity;
  readonly fields: readonly SpecificField[];
}) {
  if (fields.length === 0) return null;
  if (isClassEntity(entity))
    return <ClassSpecifics entity={entity} fields={fields} />;
  return (
    <section>
      <h5>Details</h5>
      <dl className="candidate-fields">
        {fields.map((field) => (
          <div key={`${field.ordinal}-${field.name}`}>
            <dt>{field.name || "Detail"}</dt>
            <dd
              className={isProseSpecific(field) ? undefined : "preserve-lines"}
            >
              <SpecificValue field={field} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const POWER_DESCRIPTOR_FIELDS = new Set([
  "action type",
  "attack type",
  "keywords",
  "target",
]);
const POWER_HEADER_FIELDS = new Set(["level", "power type", "power usage"]);
const ITEM_DESCRIPTOR_FIELDS = new Set([
  "armor",
  "critical",
  "damage",
  "enhancement",
  "group",
  "hands required",
  "item slot",
  "proficiency bonus",
  "properties",
  "rarity",
  "weapon",
  "weapon category",
  "weight",
]);
const ITEM_HEADER_FIELDS = new Set(["level", "magic item type", "type"]);
const ITEM_PRICE_FIELDS = new Set(["copper", "gold", "market price", "silver"]);

export interface ItemDescriptorFact {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
}

function itemDescriptorLabel(name: string): string {
  switch (normalizedFieldName(name)) {
    case "proficiency bonus":
      return "Proficiency";
    case "weapon category":
      return "Category";
    case "hands required":
      return "Hands";
    case "properties":
      return "Properties";
    case "item slot":
      return "Slot";
    default:
      return name || "Detail";
  }
}

function itemDescriptorValue(field: SpecificField): string {
  switch (normalizedFieldName(field.name)) {
    case "proficiency bonus":
      return signedBonus(field.value);
    case "critical":
      return withoutRedundantCriticalDamage(field.value);
    case "weapon category":
    case "hands required":
      return sentenceCaseValue(field.value);
    case "weight":
      return weaponWeight(field.value);
    default:
      return field.value;
  }
}

function specificValues(
  entity: ContentEntity,
  name: string,
): readonly string[] {
  const normalizedName = normalizedFieldName(name);
  return entity.specifics
    .filter((field) => normalizedFieldName(field.name) === normalizedName)
    .map((field) => field.value.trim())
    .filter(Boolean);
}

function withoutRedundantCriticalDamage(value: string): string {
  return value.replace(/\s+damage\s*$/iu, "").trim();
}

function signedBonus(value: string): string {
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/u.test(trimmed) ? `+${trimmed}` : trimmed;
}

function sentenceCaseValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.length === 0
    ? trimmed
    : `${trimmed[0]!.toLocaleUpperCase()}${trimmed.slice(1).toLocaleLowerCase()}`;
}

function weaponWeight(value: string): string {
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/u.test(trimmed) ? `${trimmed} lb.` : trimmed;
}

function descriptorFact(
  key: string,
  label: string,
  values: readonly string[],
): ItemDescriptorFact | undefined {
  const present = values.map((value) => value.trim()).filter(Boolean);
  return present.length === 0 ? undefined : { key, label, values: present };
}

function itemPriceLabel(entity: ContentEntity): string | undefined {
  for (const [name, suffix] of [
    ["Gold", "gp"],
    ["Silver", "sp"],
    ["Copper", "cp"],
  ] as const) {
    const authored = contentSpecificValue(entity, name)?.trim();
    if (authored === undefined || authored.length === 0) continue;
    const numeric = Number.parseFloat(authored.replaceAll(",", ""));
    return Number.isFinite(numeric)
      ? `${numeric.toLocaleString("en-US")} ${suffix}`
      : `${authored} ${suffix}`;
  }
  const market = contentSpecificValue(entity, "Market Price")?.trim();
  if (market) return market;
  const copper = entityCurrencyCopper(entity);
  return copper === undefined ? undefined : formatCopperPrice(copper);
}

function compactFacts(
  facts: readonly (ItemDescriptorFact | undefined)[],
): readonly ItemDescriptorFact[] {
  return facts.filter((fact): fact is ItemDescriptorFact => fact !== undefined);
}

function itemDescriptorRows(
  entity: ContentEntity,
  facts: readonly { key: string; label: string; value: string }[],
): readonly (readonly ItemDescriptorFact[])[] {
  const merged = new Map<string, ItemDescriptorFact>();
  for (const fact of facts) {
    const identity = normalizedFieldName(fact.label);
    const existing = merged.get(identity);
    merged.set(
      identity,
      existing === undefined
        ? { key: fact.key, label: fact.label, values: [fact.value] }
        : { ...existing, values: [...existing.values, fact.value] },
    );
  }
  const all = [...merged.values()];
  const take = (labels: readonly string[]) =>
    labels.flatMap((label) => {
      const found = merged.get(label);
      return found === undefined ? [] : [found];
    });
  const isWeapon = normalizedFieldName(itemKind(entity)) === "weapon";
  const claimed = new Set([
    "enhancement",
    "proficiency",
    "damage",
    "critical",
    "category",
    "hands",
    "group",
    "weight",
    "price",
    "rarity",
    "properties",
    "slot",
  ]);
  if (!isWeapon)
    return [
      take(["enhancement"]),
      take(["price", "slot", "rarity"]),
      all.filter((fact) => !claimed.has(normalizedFieldName(fact.label))),
    ].filter((row) => row.length > 0);
  return [
    take(["enhancement"]),
    take(["proficiency", "damage", "critical"]),
    take(["category", "hands", "group"]),
    take(["weight", "price", "rarity"]),
    take(["properties"]),
    all.filter((fact) => !claimed.has(normalizedFieldName(fact.label))),
  ].filter((row) => row.length > 0);
}

export function composedWeaponDescriptorRows(
  base: ContentEntity,
  enchantment: ContentEntity,
): readonly (readonly ItemDescriptorFact[])[] {
  const price = itemPriceLabel(enchantment);
  return [
    compactFacts([
      descriptorFact(
        "enhancement",
        "Enhancement",
        specificValues(enchantment, "Enhancement"),
      ),
    ]),
    compactFacts([
      descriptorFact(
        "proficiency",
        "Proficiency",
        specificValues(base, "Proficiency Bonus").map(signedBonus),
      ),
      descriptorFact("damage", "Damage", specificValues(base, "Damage")),
      descriptorFact(
        "critical",
        "Critical",
        specificValues(enchantment, "Critical").map(
          withoutRedundantCriticalDamage,
        ),
      ),
    ]),
    compactFacts([
      descriptorFact(
        "category",
        "Category",
        specificValues(base, "Weapon Category").map(sentenceCaseValue),
      ),
      descriptorFact(
        "hands",
        "Hands",
        specificValues(base, "Hands Required").map(sentenceCaseValue),
      ),
      descriptorFact("group", "Group", specificValues(base, "Group")),
    ]),
    compactFacts([
      descriptorFact(
        "weight",
        "Weight",
        specificValues(base, "Weight").map(weaponWeight),
      ),
      descriptorFact("price", "Price", price === undefined ? [] : [price]),
      descriptorFact("rarity", "Rarity", specificValues(enchantment, "Rarity")),
    ]),
    compactFacts([
      descriptorFact(
        "properties",
        "Properties",
        specificValues(base, "Properties"),
      ),
    ]),
  ].filter((row) => row.length > 0);
}

function displayItemSlot(value: string): string {
  return value.trim().replace(/^off[- ]hand$/iu, "Off hand");
}

function meaningfulArmorModifiers(
  values: readonly string[],
): readonly string[] {
  return values.filter(
    (value) => !new Set(["-", "—", "0", "+0"]).has(value.trim()),
  );
}

export function composedArmorDescriptorRows(
  base: ContentEntity,
  enchantment: ContentEntity,
): readonly (readonly ItemDescriptorFact[])[] {
  const price = itemPriceLabel(enchantment);
  return [
    compactFacts([
      descriptorFact(
        "enhancement",
        "Enhancement",
        specificValues(enchantment, "Enhancement"),
      ),
    ]),
    compactFacts([
      descriptorFact(
        "armor-bonus",
        "Armor bonus",
        specificValues(base, "Armor Bonus").map(signedBonus),
      ),
      descriptorFact(
        "check",
        "Check",
        meaningfulArmorModifiers(specificValues(base, "Check")),
      ),
      descriptorFact(
        "speed",
        "Speed",
        meaningfulArmorModifiers(specificValues(base, "Speed")),
      ),
    ]),
    compactFacts([
      descriptorFact(
        "category",
        "Category",
        specificValues(base, "Armor Category").map(sentenceCaseValue),
      ),
      descriptorFact(
        "type",
        "Type",
        specificValues(base, "Armor Type").map(sentenceCaseValue),
      ),
      descriptorFact(
        "slot",
        "Slot",
        specificValues(base, "Item Slot").map(displayItemSlot),
      ),
    ]),
    compactFacts([
      descriptorFact("price", "Price", price === undefined ? [] : [price]),
      descriptorFact(
        "weight",
        "Weight",
        specificValues(base, "Weight").map(weaponWeight),
      ),
      descriptorFact("rarity", "Rarity", specificValues(enchantment, "Rarity")),
    ]),
  ].filter((row) => row.length > 0);
}

function ItemDescriptorRows({
  rows,
}: {
  readonly rows: readonly (readonly ItemDescriptorFact[])[];
}) {
  if (rows.length === 0) return null;
  return (
    <dl className="item-card-descriptors">
      {rows.map((row, rowIndex) => (
        <div className="item-card-descriptor-row" key={rowIndex}>
          {row.map((fact) => (
            <div key={fact.key}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.values.map((value, valueIndex) => (
                  <span key={`${valueIndex}-${value}`}>{value}</span>
                ))}
              </dd>
            </div>
          ))}
        </div>
      ))}
    </dl>
  );
}

const COMPOSED_WEAPON_HIDDEN_FIELDS = new Set([
  "copper",
  "critical",
  "enhancement",
  "full text",
  "gold",
  "item slot",
  "level",
  "magic item type",
  "market price",
  "rarity",
  "silver",
  "weapon",
]);

const COMPOSED_ARMOR_HIDDEN_FIELDS = new Set([
  "armor",
  "copper",
  "enhancement",
  "full text",
  "gold",
  "item slot",
  "level",
  "magic item type",
  "market price",
  "rarity",
  "silver",
]);

function ComposedItemNarrative({
  enchantment,
  hideFlavortext,
  hiddenFields,
  descriptorRows,
  afterFields,
}: {
  readonly enchantment: ContentEntity;
  readonly hideFlavortext: boolean;
  readonly hiddenFields: ReadonlySet<string>;
  readonly descriptorRows: readonly (readonly ItemDescriptorFact[])[];
  readonly afterFields?: ReactNode;
}) {
  const clauses = enchantment.specifics.filter(
    (field) =>
      isUserFacingSpecific(field) &&
      !hiddenFields.has(normalizedFieldName(field.name)) &&
      normalizedFieldName(field.name) !== "source",
  );
  return (
    <>
      {enchantment.flavor === undefined || hideFlavortext ? null : (
        <p className="candidate-flavor composed-item-flavor">
          {enchantment.flavor}
        </p>
      )}
      <ItemDescriptorRows rows={descriptorRows} />
      {enchantment.description.length === 0 ? null : (
        <Prose value={enchantment.description} />
      )}
      {clauses.length === 0 ? null : (
        <dl className="entity-card-rules">
          {clauses.map((field) => (
            <div key={`${field.ordinal}-${field.name}`}>
              <dt>{field.name || "Detail"}</dt>
              <dd
                className={
                  isStructuredProseSpecific(field)
                    ? undefined
                    : "preserve-lines"
                }
              >
                {isStructuredProseSpecific(field) ? (
                  <Prose value={field.value} />
                ) : (
                  field.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {afterFields}
    </>
  );
}

export function ComposedWeaponCardBody({
  base,
  enchantment,
  hideFlavortext,
  afterFields,
}: {
  readonly base: ContentEntity;
  readonly enchantment: ContentEntity;
  readonly hideFlavortext: boolean;
  readonly afterFields?: ReactNode;
}) {
  return (
    <ComposedItemNarrative
      afterFields={afterFields}
      descriptorRows={composedWeaponDescriptorRows(base, enchantment)}
      enchantment={enchantment}
      hiddenFields={COMPOSED_WEAPON_HIDDEN_FIELDS}
      hideFlavortext={hideFlavortext}
    />
  );
}

export function ComposedArmorCardBody({
  base,
  enchantment,
  hideFlavortext,
  afterFields,
}: {
  readonly base: ContentEntity;
  readonly enchantment: ContentEntity;
  readonly hideFlavortext: boolean;
  readonly afterFields?: ReactNode;
}) {
  return (
    <ComposedItemNarrative
      afterFields={afterFields}
      descriptorRows={composedArmorDescriptorRows(base, enchantment)}
      enchantment={enchantment}
      hiddenFields={COMPOSED_ARMOR_HIDDEN_FIELDS}
      hideFlavortext={hideFlavortext}
    />
  );
}

function normalizedComparisonText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[^\p{L}\p{N}+\- ]/gu, "")
    .trim();
}

export function itemFullTextDuplicatesStructuredFields(
  fullText: SpecificField,
  fields: readonly SpecificField[],
): boolean {
  const haystack = normalizedComparisonText(fullText.value);
  const matches = fields.filter((field) => {
    const name = normalizedFieldName(field.name);
    if (
      field === fullText ||
      ITEM_HEADER_FIELDS.has(name) ||
      ITEM_PRICE_FIELDS.has(name) ||
      name === "source"
    )
      return false;
    const needle = normalizedComparisonText(field.value);
    return needle.length >= 2 && haystack.includes(needle);
  });
  return matches.length >= 2;
}

const POWER_COMBAT_CLAUSE =
  /^(?:(?:primary|secondary|tertiary)\s+)?(?:targets?|attacks?|hit|miss|effect)(?:\s+\([^)]*\))?$/u;

function powerRulePriority(field: SpecificField): number {
  const name = normalizedFieldName(field.name);
  if (/^(?:requirements?|prerequisites?)\b/u.test(name)) return 0;
  if (/^triggers?\b/u.test(name)) return 1;
  if (POWER_COMBAT_CLAUSE.test(name)) return 2;
  if (/^sustain(?:\s|$)/u.test(name)) return 4;
  if (/\baftereffect\b/u.test(name)) return 5;
  if (name === "special") return 6;
  return 3;
}

function powerDescriptorLabel(field: SpecificField): string {
  if (
    normalizedFieldName(field.name) === "attack type" &&
    normalizedFieldName(field.value) === "personal"
  )
    return "Range";
  return field.name || "Detail";
}

/**
 * Adapts the legacy card's explicit core fields and authored-order fallback.
 * Multiattack phases and duplicate outcomes stay in authored order; custom
 * clauses remain stable before the canonical Sustain/Aftereffect/Special tail.
 */
export function orderPowerRuleFields(
  fields: readonly SpecificField[],
): readonly SpecificField[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort(
      (left, right) =>
        powerRulePriority(left.field) - powerRulePriority(right.field) ||
        left.index - right.index,
    )
    .map(({ field }) => field);
}

function StructuredSpecifics({
  entity,
  fields,
}: {
  readonly entity: ContentEntity;
  readonly fields: readonly SpecificField[];
}) {
  const descriptors =
    entity.type.trim().toLocaleLowerCase() === "power"
      ? POWER_DESCRIPTOR_FIELDS
      : ITEM_DESCRIPTOR_FIELDS;
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  const visibleFields = fields.filter((field) => {
    const name = normalizedFieldName(field.name);
    if (isPower) return !POWER_HEADER_FIELDS.has(name);
    if (isItemEntity(entity)) {
      if (ITEM_HEADER_FIELDS.has(name) || ITEM_PRICE_FIELDS.has(name))
        return false;
      if (
        name === "item slot" &&
        normalizedFieldName(itemKind(entity)) === "weapon"
      )
        return false;
      if (
        name === "full text" &&
        itemFullTextDuplicatesStructuredFields(field, fields)
      )
        return false;
    }
    return true;
  });
  const authoredFacts = visibleFields.filter((field) =>
    descriptors.has(normalizedFieldName(field.name)),
  );
  const price = isItemEntity(entity) ? itemPriceLabel(entity) : undefined;
  const facts = [
    ...(price === undefined
      ? []
      : [{ key: "price", label: "Price", value: price }]),
    ...authoredFacts.map((field) => ({
      key: `${field.ordinal}-${field.name}`,
      label: isPower
        ? powerDescriptorLabel(field)
        : itemDescriptorLabel(field.name),
      value: isPower ? field.value : itemDescriptorValue(field),
    })),
  ];
  const authoredClauses = visibleFields.filter(
    (field) => !descriptors.has(normalizedFieldName(field.name)),
  );
  const clauses = isPower
    ? orderPowerRuleFields(authoredClauses)
    : authoredClauses;
  return (
    <>
      {facts.length === 0 ? null : isPower ? (
        <dl className="entity-card-descriptors">
          {facts.map((fact) => (
            <div key={fact.key}>
              <dt>{fact.label}</dt>
              <dd className="preserve-lines">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <ItemDescriptorRows rows={itemDescriptorRows(entity, facts)} />
      )}
      {clauses.length === 0 ? null : (
        <dl className="entity-card-rules">
          {clauses.map((field) => (
            <div key={`${field.ordinal}-${field.name}`}>
              <dt>{field.name || "Detail"}</dt>
              <dd
                className={
                  isStructuredProseSpecific(field)
                    ? undefined
                    : "preserve-lines"
                }
              >
                {isStructuredProseSpecific(field) ? (
                  <Prose value={field.value} />
                ) : (
                  field.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

export function EntityCardBody({
  entity,
  hideFlavortext,
  beforeNarrative,
  afterNarrative,
  afterFields,
  renderDescription,
  showSource = true,
}: {
  readonly entity: ContentEntity;
  readonly hideFlavortext: boolean;
  readonly beforeNarrative?: ReactNode;
  readonly afterNarrative?: ReactNode;
  readonly afterFields?: ReactNode;
  readonly renderDescription?: (description: string) => ReactNode;
  readonly showSource?: boolean;
}) {
  const fields = entityCardSpecifics(entity);
  const structured =
    entity.type.trim().toLocaleLowerCase() === "power" || isItemEntity(entity);
  return (
    <>
      {structured ? null : beforeNarrative}
      {entity.flavor === undefined || hideFlavortext ? null : (
        <p className="candidate-flavor">{entity.flavor}</p>
      )}
      {structured ? (
        <StructuredSpecifics entity={entity} fields={fields} />
      ) : null}
      {structured ? beforeNarrative : null}
      {entity.description.length === 0
        ? null
        : (renderDescription?.(entity.description) ?? (
            <Prose value={entity.description} />
          ))}
      {entity.printPrerequisites === undefined ? null : (
        <section>
          <h5>Prerequisites</h5>
          <Prose value={entity.printPrerequisites} />
        </section>
      )}
      {afterNarrative}
      {structured ? null : <DefaultSpecifics entity={entity} fields={fields} />}
      {afterFields}
      {showSource ? (
        <p className="detail-source-note">Source: {entityCardSource(entity)}</p>
      ) : null}
    </>
  );
}

export function EmbeddedPowerCard({
  entity,
  hideFlavortext,
}: {
  readonly entity: ContentEntity;
  readonly hideFlavortext: boolean;
}) {
  const headingId = `embedded-power-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <details
      aria-labelledby={headingId}
      className={`candidate-detail theme-power-card ${visualToneClass(entityVisualTone(entity))}`}
      open
    >
      <summary>
        <EntityCardHeader
          entity={entity}
          headingId={headingId}
          headingLevel={4}
        />
      </summary>
      <div className="theme-power-card-body">
        <EntityCardBody
          entity={entity}
          hideFlavortext={hideFlavortext}
          showSource={false}
        />
      </div>
    </details>
  );
}
