import { createContext, type ReactNode } from "react";

import {
  isUserFacingSpecific,
  type ContentEntity,
  type SpecificField,
} from "@4ecb/content-domain";

import { ActionTypeIcon } from "./ActionTypeIcon";
import { entityCurrencyCopper, formatCopperPrice } from "./equipment-ui";
import { Icon, type IconName } from "./Icon";
import {
  classKeyAbilitiesSentence,
  contentSpecificValue,
  primaryDetailTypeLabel,
  splitLabeledDescription,
} from "./builder-ui";
import { entityVisualTone, visualToneClass } from "./visual-language";

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

export function itemCardLabel(entity: ContentEntity): string {
  const kind = itemKind(entity);
  const level = contentSpecificValue(entity, "Level")?.trim();
  const rarity = contentSpecificValue(entity, "Rarity")?.trim();
  return [level ? `${kind} ${level}` : kind, rarity]
    .filter(Boolean)
    .join(" · ");
}

export function powerCardLabel(entity: ContentEntity): string {
  const usage = contentSpecificValue(entity, "Power Usage")?.trim();
  const powerType = contentSpecificValue(entity, "Power Type")
    ?.trim()
    .toLocaleLowerCase();
  const level = contentSpecificValue(entity, "Level")?.trim();
  return [usage, powerType, level].filter(Boolean).join(" ") || "Power";
}

export function itemCardIcon(entity: ContentEntity): IconName {
  const type = normalizedFieldName(entity.type);
  const kind = normalizedFieldName(itemKind(entity));
  const slot = normalizedFieldName(
    contentSpecificValue(entity, "Item Slot") ?? "",
  );
  const value = `${kind} ${slot}`;
  if (value.includes("artifact") || value.includes("dragonshard")) return "gem";
  if (type === "weapon" || kind === "weapon") return "sword";
  if (type === "armor" || kind === "armor") return "shield";
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
  if (kind.includes("ammunition")) return "target";
  if (kind.includes("arms slot")) return "arms";
  if (kind.includes("feet")) return "footprints";
  if (kind.includes("hands")) return "hand";
  if (kind.includes("head")) return "crown";
  if (kind.includes("neck")) return "medal";
  if (kind.includes("waist")) return "badge";
  if (kind === "ring" || slot.includes("ring")) return "circle";
  if (/companion|familiar|mount/u.test(value)) return "paw-print";
  if (kind.includes("holy symbol")) return "sun";
  if (kind.includes("ki focus")) return "focus";
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

export function EntityCardHeader({
  entity,
  headingId,
  headingLevel = 4,
  subheading,
}: {
  readonly entity: ContentEntity;
  readonly headingId?: string;
  readonly headingLevel?: 2 | 3 | 4 | 5;
  readonly subheading?: ReactNode;
}) {
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  const isItem = isItemEntity(entity);
  const actionType = isPower
    ? contentSpecificValue(entity, "Action Type")
    : undefined;
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
          {isPower ? <ActionTypeIcon decorative value={actionType} /> : null}
          {isItem ? <Icon name={itemCardIcon(entity)} /> : null}
          {heading}
        </div>
        <span className="eyebrow entity-kind">
          {isItem
            ? itemCardLabel(entity)
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
              className="preserve-lines"
              key={`${field.ordinal}-${field.name}`}
            >
              {field.value}
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
            <dd className="preserve-lines">
              {labeled === undefined ? (
                (keyAbilities ?? field.value)
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
            <dd className="preserve-lines">{field.value}</dd>
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
  "proficiency bonus",
  "weapon",
  "weight",
]);
const ITEM_HEADER_FIELDS = new Set([
  "level",
  "magic item type",
  "rarity",
  "type",
]);
const ITEM_PRICE_FIELDS = new Set(["copper", "gold", "market price", "silver"]);

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
    if (isItemEntity(entity))
      return !ITEM_HEADER_FIELDS.has(name) && !ITEM_PRICE_FIELDS.has(name);
    return true;
  });
  const authoredFacts = visibleFields.filter((field) =>
    descriptors.has(normalizedFieldName(field.name)),
  );
  const price = isItemEntity(entity) ? entityCurrencyCopper(entity) : undefined;
  const facts = [
    ...(price === undefined
      ? []
      : [{ key: "price", label: "Price", value: formatCopperPrice(price) }]),
    ...authoredFacts.map((field) => ({
      key: `${field.ordinal}-${field.name}`,
      label: field.name || "Detail",
      value: field.value,
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
      {facts.length === 0 ? null : (
        <dl className="entity-card-descriptors">
          {facts.map((fact) => (
            <div key={fact.key}>
              <dt>{fact.label}</dt>
              <dd className="preserve-lines">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {clauses.length === 0 ? null : (
        <dl className="entity-card-rules">
          {clauses.map((field) => (
            <div key={`${field.ordinal}-${field.name}`}>
              <dt>{field.name || "Detail"}</dt>
              <dd className="preserve-lines">{field.value}</dd>
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
            <p className="preserve-lines">{entity.description}</p>
          ))}
      {entity.printPrerequisites === undefined ? null : (
        <section>
          <h5>Prerequisites</h5>
          <p className="preserve-lines">{entity.printPrerequisites}</p>
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
