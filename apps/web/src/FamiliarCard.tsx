import { useContext } from "react";

import {
  FAMILIAR_RULES_REMINDER,
  type SheetFamiliarCard,
} from "@4ecb/sheet-model";

import { DotList } from "./DotList";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { Icon } from "./Icon";
import {
  CardPanelSubheading,
  CardText,
  type CardLayout,
  type CardPanelProps,
} from "./PowerCard";
import { StatGroup } from "./StatTiles";
import { usePrintCardFit } from "./use-print-card-fit";

const shown = (value: number | undefined) =>
  value === undefined ? "—" : String(value);

/** The card's title; a split familiar's notes card names itself apart from
 *  its stats card ("Arcane Wisp — Notes", D110), never as a continuation. */
export function familiarCardTitle(card: SheetFamiliarCard): string {
  return card.part === "notes" ? `${card.name} — Notes` : card.name;
}

/**
 * The familiar card (legacy Familiar panel), in the Play data card's frame:
 * one format for the printed deck and the builder's familiar detail pane.
 * The printed card is mechanics only, as a beast's (owner, 2026-11-04:
 * "Same as beasts"); the builder pane shows the description as flavor text
 * under the header (D110).
 */
export function FamiliarCard({
  card,
  layout = "print",
  panel = {},
  onFit,
}: {
  readonly card: SheetFamiliarCard;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
  /** A measuring copy's report: whether the card fits at the minimum
   *  text size. */
  readonly onFit?: (fits: boolean) => void;
}) {
  const cardRef = usePrintCardFit(layout === "print", onFit);
  const hideFlavortext = useContext(HideFlavortextContext);
  const isPanel = layout === "panel";
  const showStats = card.part !== "notes";
  const showNotes = card.part !== "stats";
  const identity = [`${card.size} familiar`, card.tier];
  const sections = [
    ["Constant benefits", card.constantBenefits],
    ["Active benefits", card.activeBenefits],
    ["Quirks", card.quirks],
  ] as const;
  return (
    <article
      ref={cardRef}
      {...(isPanel
        ? {
            tabIndex: 0,
            ...(panel.headingId === undefined
              ? {}
              : { "aria-labelledby": panel.headingId }),
          }
        : {})}
      className={`print-reference-card print-play-card print-familiar-card${isPanel ? " is-panel" : ""}`}
      data-familiar-part={card.part ?? "whole"}
    >
      <header>
        <div className="print-play-heading">
          <h3>
            <Icon name="paw-print" />
            <span
              {...(panel.headingId === undefined
                ? {}
                : { id: panel.headingId })}
            >
              {familiarCardTitle(card)}
            </span>
          </h3>
          <p className="print-play-identity">
            <DotList items={identity} />
          </p>
        </div>
        {panel.headerAction}
      </header>
      {/* The builder pane's description is flavor text, as a power card's
          (owner, 2026-11-04); the printed card is mechanics only. */}
      {!isPanel || card.description === undefined || hideFlavortext ? null : (
        <p className="print-card-flavor">{card.description}</p>
      )}
      <CardPanelSubheading subheading={panel.subheading} />
      <div className="print-card-body print-play-body">
        {showStats ? (
          <>
            <StatGroup
              label="Defenses"
              tone="defenses"
              values={[
                { label: "AC", value: shown(card.defenses.ac) },
                { label: "Fort", value: shown(card.defenses.fortitude) },
                { label: "Ref", value: shown(card.defenses.reflex) },
                { label: "Will", value: shown(card.defenses.will) },
              ]}
            />
            <div className="print-familiar-row">
              <StatGroup
                label="Health"
                tone="health"
                values={[{ label: "HP", value: String(card.hitPoints) }]}
              />
              <StatGroup
                label="Speed"
                tone="movement"
                values={[{ label: "Speed", value: card.speed ?? "—" }]}
              />
            </div>
            {card.senses === undefined ? null : (
              <p className="print-play-note">
                <strong>Senses</strong> {card.senses}
              </p>
            )}
            <p className="print-play-note print-familiar-rules">
              {FAMILIAR_RULES_REMINDER}
            </p>
          </>
        ) : null}
        {sections.map(([label, value]) =>
          !showNotes || value === undefined ? null : (
            <section className="print-familiar-section" key={label}>
              <h4>{label}</h4>
              <CardText
                value={value}
                textPresentation={panel.textPresentation}
              />
            </section>
          ),
        )}
      </div>
      {panel.source === undefined ? null : (
        <footer className="print-item-footer">
          <span className="print-card-source">{panel.source}</span>
        </footer>
      )}
      {panel.afterBody}
      <div className="print-card-type">
        <span>Familiar</span>
      </div>
    </article>
  );
}
