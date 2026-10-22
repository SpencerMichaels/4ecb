import { Fragment, useContext, useState } from "react";

import type { CandidateDecision } from "@4ecb/rules-engine";
import type { ContentEntity } from "@4ecb/content-domain";
import { isFamiliarEntity } from "@4ecb/sheet-model";

import {
  candidateReason,
  primaryDetailTypeLabel,
  themePowerGroups,
} from "./builder-ui";
import {
  BuilderBeastCompanionCard,
  BuilderCardContext,
  BuilderFamiliarCard,
  BuilderItemCard,
  BuilderPowerCard,
} from "./BuilderCards";
import {
  toggleCandidateFavorite,
  useCandidateFavorites,
} from "./candidate-favorites";
import { candidateReferenceIndex } from "./CandidateSelectionTable";
import { DeityDomains } from "./DeityDomains";
import {
  detailStackEntries,
  detailStackSectionHeading,
  entriesForParagonPath,
  detailStackSections,
  optionBenefitEntry,
  type DetailStackEntry,
  type DetailStackSection,
} from "./detail-stack";
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
  const { characterLevel, paragonPathId } = useContext(BuilderCardContext);
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
  // Everything the option will eventually give (a paragon path's features
  // and powers, a pact's class features, a deity's domains, a choice's
  // options…), each shown once, so it can be judged before it is picked.
  const benefits = entriesForParagonPath(
    detailStackEntries(
      entity,
      referenceIndex,
      themePowers.flatMap((group) => group.powers.map((power) => power.id)),
    ),
    paragonPathId,
  );
  // Benefits granted at different levels (a pact's, a theme's, a paragon
  // path's…) fold into one section per level, theme powers included, and
  // what only one paragon path gets into one per path: only the
  // character's, once it has taken one.
  const levelSections = detailStackSections(
    [
      ...benefits,
      ...themePowers.flatMap((group) =>
        group.powers.map((power) => optionBenefitEntry(entity, power)),
      ),
    ],
    { paragonPathId },
  );
  if (levelSections.length > 0)
    return (
      <div className="candidate-detail-stack">
        <CandidateDetailCard
          candidate={candidate}
          entity={entity}
          favoritable={favoritable}
          references={referenceIndex}
        />
        <section
          aria-label={`${entity.name} benefits`}
          className="candidate-detail-benefits is-by-level"
        >
          {levelSections.map((section) => {
            // Levels the pane is viewing or past start open.
            const open = section.level <= characterLevel;
            return (
              <DetailLevelSection
                defaultOpen={open}
                key={`${entity.id}:${detailSectionKey(section)}:${String(open)}`}
                ownerId={entity.id}
                section={section}
              />
            );
          })}
        </section>
      </div>
    );
  return (
    <div className="candidate-detail-stack">
      <CandidateDetailCard
        candidate={candidate}
        entity={entity}
        favoritable={favoritable}
        references={referenceIndex}
      />
      {benefits.length === 0 ? null : (
        <section
          aria-label={`${entity.name} benefits`}
          className="candidate-detail-benefits"
        >
          {benefits.map((entry) => (
            <DetailStackCard entry={entry} key={entry.entity.id} />
          ))}
        </section>
      )}
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

function DetailStackCard({ entry }: { readonly entry: DetailStackEntry }) {
  return (
    <CandidateDetailCard
      entity={entry.entity}
      {...(entry.relationship === undefined
        ? {}
        : { relationship: entry.relationship })}
    />
  );
}

const detailSectionKey = (section: DetailStackSection) =>
  section.path === undefined
    ? `level-${String(section.level)}`
    : `path-${section.path.id}`;

/** One level's benefits (or one paragon path's, by level), each followed
 * by what it offers, folded behind a heading that counts the cards; the
 * benefits' names stay listed under it while folded. */
function DetailLevelSection({
  defaultOpen,
  ownerId,
  section,
}: {
  readonly defaultOpen: boolean;
  readonly ownerId: string;
  readonly section: DetailStackSection;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = detailStackSectionHeading(section);
  const cardsId = `candidate-${`${ownerId}-${detailSectionKey(section)}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  const titleId = `${cardsId}-title`;
  const namesId = `${cardsId}-benefits`;
  return (
    <div className={`detail-level-section${open ? " is-open" : ""}`}>
      <h3 className="detail-level-heading">
        {/* Named by its title and count alone; while folded, the list of
            benefits in it (part of the toggle) describes it. */}
        <button
          aria-controls={cardsId}
          aria-expanded={open}
          aria-labelledby={titleId}
          type="button"
          onClick={() => setOpen((current) => !current)}
          {...(open ? {} : { "aria-describedby": namesId })}
        >
          <Icon name="chevron" />
          <span className="detail-level-summary" id={titleId}>
            <span className="detail-level-title">{heading.label}</span>{" "}
            <span className="detail-level-count">
              <span aria-hidden="true">·</span>
              <span className="visually-hidden">:</span> {heading.count}
            </span>
          </span>
          {open ? null : (
            <span className="detail-level-benefits" id={namesId}>
              {heading.names.map((name, index) => (
                <span
                  className="detail-level-benefit"
                  key={`${String(index)}:${name}`}
                >
                  {name}
                </span>
              ))}
            </span>
          )}
        </button>
      </h3>
      <div className="detail-level-cards" hidden={!open} id={cardsId}>
        {section.path === undefined
          ? section.entries.map((entry) => (
              <DetailStackCard entry={entry} key={entry.entity.id} />
            ))
          : // A path's benefits under plain level headings, not folds.
            section.levels.map((group) => (
              <Fragment key={group.level}>
                <h4 className="detail-level-subheading">Level {group.level}</h4>
                {group.entries.map((entry) => (
                  <DetailStackCard entry={entry} key={entry.entity.id} />
                ))}
              </Fragment>
            ))}
      </div>
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
  const builderCards = useContext(BuilderCardContext);
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
  const beastCard = builderCards.beastCardFor(entity);
  if (beastCard !== undefined)
    return (
      <div className="candidate-card-panel">
        <BuilderBeastCompanionCard
          card={beastCard}
          entity={entity}
          headingSuffix={headingSuffix}
          subheading={subheading}
          headerAction={headerAction}
        />
      </div>
    );
  if (isFamiliarEntity(entity))
    return (
      <div className="candidate-card-panel">
        <BuilderFamiliarCard
          entity={entity}
          headingSuffix={headingSuffix}
          subheading={subheading}
          headerAction={headerAction}
        />
      </div>
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
              beforeNarrative={
                <DeityDomains entity={entity} references={references} />
              }
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
