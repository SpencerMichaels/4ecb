import { useContext, useState } from "react";

import type { CandidateDecision } from "@4ecb/rules-engine";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  candidateReason,
  grantedDetailEntities,
  themePowerGroups,
} from "./builder-ui";
import { candidateReferenceIndex } from "./CandidateSelectionTable";
import {
  EmbeddedPowerCard,
  EntityCardBody,
  EntityCardHeader,
} from "./EntityCard";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ProseBlocks, proseBlocks } from "./Prose";
import type { PowerCardPresentation } from "./PowerCardPresentation";
import { entityVisualTone, visualToneClass } from "./visual-language";

export function CandidateDetail({
  candidate,
  entity,
  byId,
  powerPresentationFor,
}: {
  readonly candidate: CandidateDecision | undefined;
  readonly entity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly powerPresentationFor?:
    | ((definitionId: string, name?: string) => PowerCardPresentation)
    | undefined;
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
      <CandidateDetailCard
        candidate={candidate}
        entity={entity}
        powerPresentation={powerPresentationFor?.(entity.id, entity.name)}
      />
      {grantedEntities.map((granted) => (
        <CandidateDetailCard
          key={granted.id}
          entity={granted}
          powerPresentation={powerPresentationFor?.(granted.id, granted.name)}
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
                powerPresentation={powerPresentationFor?.(power.id, power.name)}
                themePowerLevel={group.level ?? null}
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
  themePowerLevel,
  powerPresentation,
}: {
  readonly candidate?: CandidateDecision;
  readonly entity: ContentEntity;
  readonly relationship?: string;
  readonly themePowerLevel?: number | null;
  readonly powerPresentation?: PowerCardPresentation | undefined;
}) {
  const hideFlavortext = useContext(HideFlavortextContext);
  const headingId = `candidate-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}${relationship === undefined ? "" : "-granted"}`;
  const isThemeCandidate =
    candidate !== undefined &&
    entity.type.trim().toLocaleLowerCase() === "theme";
  const entityTone = entityVisualTone(entity);
  const tone = visualToneClass(entityTone);
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  const isEmbeddedPower =
    isPower && (relationship !== undefined || themePowerLevel !== undefined);
  const isUnavailable = candidate !== undefined && !candidate.eligible;
  if (isEmbeddedPower)
    return (
      <EmbeddedPowerCard
        entity={entity}
        hideFlavortext={hideFlavortext}
        powerPresentation={powerPresentation}
      />
    );
  const body = (
    <EntityCardBody
      entity={entity}
      hideFlavortext={hideFlavortext}
      powerPresentation={powerPresentation}
      beforeNarrative={
        candidate === undefined || candidate.eligible ? null : (
          <p className="candidate-reason">
            {candidateReason(candidate.reasons)}
          </p>
        )
      }
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
  );

  return (
    <aside
      aria-labelledby={headingId}
      className={`candidate-detail ${tone}${isPower ? " top-level-power-card" : ""}`}
      tabIndex={0}
    >
      <header className="primary-detail-heading entity-card-header">
        <EntityCardHeader
          entity={entity}
          headingId={headingId}
          subheading={
            relationship === undefined && !isUnavailable ? undefined : (
              <>
                {relationship === undefined ? null : (
                  <p className="candidate-relationship">{relationship}</p>
                )}
                {isUnavailable ? (
                  <span className="candidate-unavailable">Unavailable</span>
                ) : null}
              </>
            )
          }
        />
      </header>
      {body}
    </aside>
  );
}
