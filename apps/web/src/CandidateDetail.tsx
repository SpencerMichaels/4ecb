import { useContext, useState } from "react";

import type { CandidateDecision } from "@4ecb/rules-engine";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  candidateReason,
  primaryDetailTypeLabel,
  grantedDetailEntities,
  themePowerGroups,
} from "./builder-ui";
import { BuilderItemCard, BuilderPowerCard } from "./BuilderCards";
import { candidateReferenceIndex } from "./CandidateSelectionTable";
import {
  EntityCardBody,
  EntityCardLeadingIcon,
  entityCardSource,
  isItemEntity,
} from "./EntityCard";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ProseBlocks, proseBlocks } from "./Prose";

export function CandidateDetail({
  candidate,
  entity,
  byId,
}: {
  readonly candidate: CandidateDecision | undefined;
  readonly entity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
}) {
  if (candidate === undefined || entity === undefined)
    return (
      <aside
        aria-labelledby="option-details-heading"
        className="candidate-detail candidate-detail-empty tone-neutral"
      >
        <header>
          <h4 id="option-details-heading">Option Details</h4>
        </header>
        <p>Click an option to inspect it here</p>
      </aside>
    );

  const referenceIndex = candidateReferenceIndex(byId);
  const themePowers = themePowerGroups(entity, byId.values());
  const grantedEntities = grantedDetailEntities(entity, referenceIndex).filter(
    (granted) =>
      themePowers.length === 0 ||
      granted.type.trim().toLocaleLowerCase() !== "power",
  );
  return (
    <div className="candidate-detail-stack">
      <CandidateDetailCard candidate={candidate} entity={entity} />
      {grantedEntities.map((granted) => (
        <CandidateDetailCard
          key={granted.id}
          entity={granted}
          relationship={`Granted ${granted.type.toLocaleLowerCase()}`}
        />
      ))}
      {themePowers.length === 0 ? null : (
        <section
          aria-label={`${entity.name} powers`}
          className="theme-power-cards"
        >
          {themePowers.flatMap((group) =>
            group.powers.map((power) => (
              <CandidateDetailCard
                entity={power}
                key={power.id}
                relationship={
                  group.level === undefined
                    ? "Theme power"
                    : `Theme power · Level ${group.level}`
                }
              />
            )),
          )}
        </section>
      )}
    </div>
  );
}

function ThemeCandidateDescription({
  description,
  entityName,
  id,
}: {
  readonly description: string;
  readonly entityName: string;
  readonly id: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const blocks = proseBlocks(description);
  const visibleBlocks = expanded ? blocks : blocks.slice(0, 1);

  return (
    <div className="theme-candidate-description">
      <div id={id}>
        <ProseBlocks blocks={visibleBlocks} />
      </div>
      {blocks.length <= 1 ? null : (
        <button
          aria-controls={id}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} description for ${entityName}`}
          className="theme-description-toggle"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Less…" : "More…"}
        </button>
      )}
    </div>
  );
}

export function CandidateDetailCard({
  candidate,
  entity,
  relationship,
}: {
  readonly candidate?: CandidateDecision;
  readonly entity: ContentEntity;
  readonly relationship?: string;
}) {
  const hideFlavortext = useContext(HideFlavortextContext);
  const headingSuffix = relationship === undefined ? "" : "-granted";
  const headingId = `candidate-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}${headingSuffix}`;
  const isThemeCandidate =
    candidate !== undefined &&
    entity.type.trim().toLocaleLowerCase() === "theme";
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  const isUnavailable = candidate !== undefined && !candidate.eligible;
  const subheading =
    relationship === undefined && !isUnavailable ? undefined : (
      <>
        {relationship === undefined ? null : (
          <p className="candidate-relationship">{relationship}</p>
        )}
        {isUnavailable ? (
          <>
            <span className="candidate-unavailable">Unavailable</span>
            <p className="candidate-reason">
              {candidateReason(candidate.reasons)}
            </p>
          </>
        ) : null}
      </>
    );
  if (isPower || isItemEntity(entity))
    return (
      <div className="candidate-card-panel">
        {isPower ? (
          <BuilderPowerCard
            entity={entity}
            headingSuffix={headingSuffix}
            subheading={subheading}
          />
        ) : (
          <BuilderItemCard
            name={entity.name}
            entities={[entity]}
            headingSuffix={headingSuffix}
            subheading={subheading}
          />
        )}
        {relationship === undefined ? (
          <p className="detail-source-note">
            Source: {entityCardSource(entity)}
          </p>
        ) : null}
      </div>
    );
  // Other choices use the printed card's frame: a solid title band, card
  // border and type bar, around the familiar detail body (D079).
  return (
    <div className="candidate-card-panel">
      <aside
        aria-labelledby={headingId}
        className="candidate-detail reference-entity-card"
        tabIndex={0}
      >
        <header className="reference-card-title">
          <h3>
            <EntityCardLeadingIcon entity={entity} />
            <span id={headingId}>{entity.name}</span>
          </h3>
        </header>
        {subheading === undefined ? null : (
          <div className="reference-card-subheading">{subheading}</div>
        )}
        <div className="reference-card-body">
          <EntityCardBody
            entity={entity}
            hideFlavortext={hideFlavortext}
            showSource={false}
            {...(isThemeCandidate
              ? {
                  renderDescription: (description: string) => (
                    <ThemeCandidateDescription
                      key={entity.id}
                      description={description}
                      entityName={entity.name}
                      id={`${headingId}-description`}
                    />
                  ),
                }
              : {})}
          />
        </div>
        <div className="print-card-type">
          <span>{primaryDetailTypeLabel(entity)}</span>
        </div>
      </aside>
      {relationship === undefined ? (
        <p className="detail-source-note">Source: {entityCardSource(entity)}</p>
      ) : null}
    </div>
  );
}
