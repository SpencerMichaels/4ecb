import type { ReactNode } from "react";

import {
  displayPrerequisites,
  isUserFacingSpecific,
  type ContentEntity,
  type SpecificField,
} from "@4ecb/content-domain";
import { classifyPowerEntity } from "@4ecb/sheet-model";

import { ActionTypeIcon } from "./ActionTypeIcon";
import { Icon, type IconName } from "./Icon";
import { canonicalItemIcon } from "./item-icons";
import { Prose } from "./Prose";
import {
  classKeyAbilitiesSentence,
  contentSpecificValue,
  primaryDetailTypeLabel,
  splitLabeledDescription,
} from "./builder-ui";
import { entityTypeIcon } from "./visual-language";

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
  "superior implement",
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

/** The item-kind portion of `itemCardLabel`, without the trailing level —
 * for callers (like the Shop acquisition dialog's base-item page heading)
 * that want to name the kind of thing being chosen, not a specific level. */
export function itemKindLabel(
  entity: ContentEntity,
  physicalBase?: ContentEntity,
): string {
  const authoredKind =
    physicalBase === undefined ? itemKind(entity) : itemKind(physicalBase);
  return /\bslot item\s*$/iu.test(authoredKind) ? "Item" : authoredKind;
}

export function itemCardLabel(
  entity: ContentEntity,
  physicalBase?: ContentEntity,
): string {
  const kind = itemKindLabel(entity, physicalBase);
  const level = contentSpecificValue(entity, "Level")?.trim();
  return level ? `${kind} ${level}` : kind;
}

export function powerCardLabel(entity: ContentEntity): string {
  return classifyPowerEntity(entity).compactLabel;
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
  kindLabel,
  headingId,
  headingLevel = 4,
  physicalBase,
  subheading,
}: {
  readonly entity: ContentEntity;
  readonly kindLabel?: string;
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
          {kindLabel ??
            (isItem
              ? itemCardLabel(entity, physicalBase)
              : isPower
                ? powerCardLabel(entity)
                : primaryDetailTypeLabel(entity))}
        </span>
      </div>
      {subheading === undefined ? null : (
        <div className="primary-detail-subheading entity-card-subheading">
          {subheading}
        </div>
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
  // One labelled line per field ("Level: 1"), like a power card's rule
  // lines; a prose field's text starts on the line below its label.
  return (
    <dl className="candidate-fields">
      {fields.map((field) => (
        <div key={`${field.ordinal}-${field.name}`}>
          <dt>{field.name || "Detail"}</dt>
          <dd className={isProseSpecific(field) ? undefined : "preserve-lines"}>
            <SpecificValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A card's prerequisites as one line: authored lines (or `<br>`s) joined
 * by "; ", the way the books separate them ("21st level; fey origin"). */
export function prerequisiteLine(value: string): string {
  return value
    .split(/\r\n?|\n|<br\s*\/?>/iu)
    .map((part) => part.trim().replace(/;$/u, "").trim())
    .filter(Boolean)
    .join("; ");
}

/** Whether `text` contains `name` as whole words, ignoring case. */
function namesWord(text: string, name: string): boolean {
  const escaped = name.trim().replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return (
    escaped !== "" &&
    new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(
      text,
    )
  );
}

/** "Also known as: Deva": the other names a record is known by (D116), a
 * campaign's renamed record's stock name, labelled like the prerequisite
 * line. Shown first, so a player looking for the old name sees it at once. */
export function EntityAliases({ entity }: { readonly entity: ContentEntity }) {
  const aliases = entity.aliases ?? [];
  return aliases.length === 0 ? null : (
    <p className="entity-card-aliases">
      <strong>Also known as:</strong> {aliases.join(", ")}
    </p>
  );
}

/** "Prerequisite: Hexblade", labelled like a power card's rule lines; a
 * requirement met only through a counts-as alternate says what met it
 * ("Must worship Moradin — met through Torag"). A renamed record the line
 * names shows by its current name ("Prerequisite: Fetchling", D116). */
export function EntityPrerequisites({
  entity,
  metThrough = [],
  renamedLines,
}: {
  readonly entity: ContentEntity;
  /** Names of the owned elements whose counts-as alternates meet it. */
  readonly metThrough?: readonly string[];
  /** The evaluation's `prerequisiteLines`. */
  readonly renamedLines?: Readonly<Record<string, string>> | undefined;
}) {
  // The authored print line only, with renamed records' current names.
  const line = prerequisiteLine(
    entity.printPrerequisites?.trim()
      ? (displayPrerequisites(entity, renamedLines) ?? "")
      : "",
  );
  // A granter the line already names adds nothing: the campaign's Asmodeus
  // meets "Must worship Asmodeus" through the stock Asmodeus it counts as.
  const shown = metThrough.filter((name) => !namesWord(line, name));
  return line === "" ? null : (
    <p className="entity-card-prerequisites">
      <strong>Prerequisite:</strong> {line}
      {shown.length === 0 ? null : (
        <span className="entity-card-prerequisites-met">
          {` — met through ${shown.join(", ")}`}
        </span>
      )}
    </p>
  );
}

/** Body of a detail card for entities other than powers and items, which use
 * the shared printed card format (`PowerCard`/`ItemCard`, D079). */
export function EntityCardBody({
  entity,
  hideFlavortext,
  beforeNarrative,
  afterNarrative,
  afterFields,
  renderDescription,
  showSource = true,
  prerequisiteMetThrough,
  prerequisiteLines,
}: {
  readonly entity: ContentEntity;
  readonly prerequisiteMetThrough?: readonly string[];
  /** The evaluation's `prerequisiteLines` (renamed records, D116). */
  readonly prerequisiteLines?: Readonly<Record<string, string>> | undefined;
  readonly hideFlavortext: boolean;
  readonly beforeNarrative?: ReactNode;
  readonly afterNarrative?: ReactNode;
  readonly afterFields?: ReactNode;
  readonly renderDescription?: (description: string) => ReactNode;
  readonly showSource?: boolean;
}) {
  const fields = entityCardSpecifics(entity);
  return (
    <>
      <EntityAliases entity={entity} />
      {beforeNarrative}
      {entity.flavor === undefined || hideFlavortext ? null : (
        <p className="candidate-flavor entity-card-flavor">{entity.flavor}</p>
      )}
      {/* The book order: flavor, prerequisites, then the text, so a lead-in
          ("You gain the following benefits:") ends right above the
          benefits it introduces. */}
      <EntityPrerequisites
        entity={entity}
        renamedLines={prerequisiteLines}
        {...(prerequisiteMetThrough === undefined
          ? {}
          : { metThrough: prerequisiteMetThrough })}
      />
      {entity.description.length === 0
        ? null
        : (renderDescription?.(entity.description) ?? (
            <Prose value={entity.description} />
          ))}
      {afterNarrative}
      <DefaultSpecifics entity={entity} fields={fields} />
      {afterFields}
      {showSource ? (
        <p className="detail-source-note">Source: {entityCardSource(entity)}</p>
      ) : null}
    </>
  );
}
