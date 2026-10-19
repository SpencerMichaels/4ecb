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
import {
  toggleCandidateFavorite,
  useCandidateFavorites,
} from "./candidate-favorites";
import { candidateReferenceIndex } from "./CandidateSelectionTable";
import {
  EntityCardBody,
  EntityCardLeadingIcon,
  entityCardSource,
  isItemEntity,
} from "./EntityCard";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ShowEntitySourceContext } from "./ShowEntitySourceContext";
import { Icon } from "./Icon";
import { ProseBlocks, proseBlocks } from "./Prose";
import {
  StructuredEntityBody,
  structuredEntityKind,
} from "./StructuredEntityBody";

export function CandidateDetail({
  candidate,
  entity,
  byId,
  favoritable = false,
}: {
  readonly candidate: CandidateDecision | undefined;
  readonly entity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  /** The option came from a selection table: offer the favorite star. */
  readonly favoritable?: boolean;
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
        favoritable={favoritable}
        references={referenceIndex}
      />
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
              // Under its theme a power needs no "Theme power" label, and its
              // level is on the card's own type bar.
              <CandidateDetailCard entity={power} key={power.id} />
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

/** Favorites a table option from its card, once its text has been read. */
function FavoriteToggle({ entity }: { readonly entity: ContentEntity }) {
  const favorite = useCandidateFavorites().has(entity.id.toLocaleLowerCase());
  return (
    <button
      aria-label={`${favorite ? "Remove" : "Add"} ${entity.name} ${favorite ? "from" : "to"} favorites`}
      aria-pressed={favorite}
      className="card-favorite-toggle"
      title={favorite ? "Remove favorite" : "Add favorite"}
      type="button"
      onClick={() => toggleCandidateFavorite(entity.id)}
    >
      <Icon name="favorite" />
    </button>
  );
}

export function CandidateDetailCard({
  candidate,
  entity,
  relationship,
  favoritable = false,
  references,
}: {
  readonly candidate?: CandidateDecision;
  readonly entity: ContentEntity;
  readonly relationship?: string;
  readonly favoritable?: boolean;
  /** Content by id and name; lets race/class cards list their traits and
   * features inside the card (StructuredEntityBody). */
  readonly references?: ReadonlyMap<string, ContentEntity>;
}) {
  const hideFlavortext = useContext(HideFlavortextContext);
  const showSource = useContext(ShowEntitySourceContext);
  const headingSuffix = relationship === undefined ? "" : "-granted";
  const headingId = `candidate-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}${headingSuffix}`;
  const isThemeCandidate =
    candidate !== undefined &&
    entity.type.trim().toLocaleLowerCase() === "theme";
  const isPower = entity.type.trim().toLocaleLowerCase() === "power";
  const structuredKind = structuredEntityKind(entity);
  const isUnavailable = candidate !== undefined && !candidate.eligible;
  // Only the option being inspected, not cards for what it grants.
  // Only an option picked from a table (not a card it grants, nor a button
  // choice like Gender) can be favorited.
  const headerAction =
    candidate === undefined ||
    relationship !== undefined ||
    !favoritable ? undefined : (
      <FavoriteToggle entity={entity} />
    );
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
            headerAction={headerAction}
          />
        ) : (
          <BuilderItemCard
            name={entity.name}
            entities={[entity]}
            headingSuffix={headingSuffix}
            subheading={subheading}
            headerAction={headerAction}
          />
        )}
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
          {headerAction}
        </header>
        {subheading === undefined ? null : (
          <div className="reference-card-subheading">{subheading}</div>
        )}
        <div className="reference-card-body">
          {structuredKind !== undefined && references !== undefined ? (
            <StructuredEntityBody
              entity={entity}
              hideFlavortext={hideFlavortext}
              kind={structuredKind}
              references={references}
            />
          ) : (
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
          )}
        </div>
        {showSource ? (
          <footer className="reference-card-source">
            Source: {entityCardSource(entity)}
          </footer>
        ) : null}
        <div className="print-card-type">
          <span>{primaryDetailTypeLabel(entity)}</span>
        </div>
      </aside>
    </div>
  );
}
