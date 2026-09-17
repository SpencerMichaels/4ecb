import { createContext, type ReactNode } from "react";

import {
  isUserFacingSpecific,
  type ContentEntity,
  type SpecificField,
} from "@4ecb/content-domain";

import { ActionTypeIcon } from "./ActionTypeIcon";
import { contentSpecificValue, primaryDetailTypeLabel } from "./builder-ui";

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

function DefaultSpecifics({ fields }: { fields: readonly SpecificField[] }) {
  if (fields.length === 0) return null;
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
  renderSpecifics,
}: {
  readonly entity: ContentEntity;
  readonly hideFlavortext: boolean;
  readonly beforeNarrative?: ReactNode;
  readonly afterNarrative?: ReactNode;
  readonly afterFields?: ReactNode;
  readonly renderDescription?: (description: string) => ReactNode;
  readonly renderSpecifics?: (fields: readonly SpecificField[]) => ReactNode;
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
      {renderSpecifics === undefined ? (
        <DefaultSpecifics fields={fields} />
      ) : (
        renderSpecifics(fields)
      )}
      {afterFields}
      <p className="detail-source-note">Source: {entityCardSource(entity)}</p>
    </>
  );
}
