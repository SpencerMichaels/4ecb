import { createContext, type ReactNode } from "react";

import {
  isUserFacingSpecific,
  type ContentEntity,
  type SpecificField,
} from "@4ecb/content-domain";

import { ActionTypeIcon } from "./ActionTypeIcon";
import {
  classKeyAbilitiesSentence,
  contentSpecificValue,
  primaryDetailTypeLabel,
  splitLabeledDescription,
} from "./builder-ui";

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
  const actionType = isPower
    ? contentSpecificValue(entity, "Action Type")
    : undefined;
  const attackType = isPower
    ? contentSpecificValue(entity, "Attack Type")
    : undefined;
  const headingContent = (
    <>
      {entity.name}
      {attackType === undefined ? null : (
        <span className="entity-card-attack-type">
          {` (${attackType.toLocaleLowerCase()})`}
        </span>
      )}
    </>
  );
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
          {heading}
        </div>
        <span className="eyebrow entity-kind">
          {primaryDetailTypeLabel(entity)}
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

export function EntityCardBody({
  entity,
  hideFlavortext,
  beforeNarrative,
  afterNarrative,
  afterFields,
  renderDescription,
}: {
  readonly entity: ContentEntity;
  readonly hideFlavortext: boolean;
  readonly beforeNarrative?: ReactNode;
  readonly afterNarrative?: ReactNode;
  readonly afterFields?: ReactNode;
  readonly renderDescription?: (description: string) => ReactNode;
}) {
  const fields = entityCardSpecifics(entity);
  return (
    <>
      {beforeNarrative}
      {entity.flavor === undefined || hideFlavortext ? null : (
        <p className="candidate-flavor">{entity.flavor}</p>
      )}
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
      <DefaultSpecifics entity={entity} fields={fields} />
      {afterFields}
      <p className="detail-source-note">Source: {entityCardSource(entity)}</p>
    </>
  );
}
