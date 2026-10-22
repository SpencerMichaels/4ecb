import { useContext, type ReactNode } from "react";

import type { SheetItemSetCard } from "@4ecb/sheet-model";

import { HideFlavortextContext } from "./HideFlavortextContext";
import { Icon } from "./Icon";
import {
  CardPanelSubheading,
  CardText,
  type CardLayout,
  type CardPanelProps,
} from "./PowerCard";
import { usePrintCardFit } from "./use-print-card-fit";

const piecesLabel = (count: number) =>
  `${count} ${count === 1 ? "piece" : "pieces"}`;

/**
 * The item set card (legacy CharTracker `PowerCardItemSetInfo`): the item
 * card's orange frame, the set's piece count, and its benefits by the pieces
 * they need, the unlocked ones marked active. One format for the printed
 * deck (after the set's item cards) and the builder's item detail pane.
 */
export function ItemSetCard({
  card,
  layout = "print",
  panel = {},
}: {
  readonly card: SheetItemSetCard;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
}) {
  const cardRef = usePrintCardFit(layout === "print");
  const hideFlavortext = useContext(HideFlavortextContext);
  const isPanel = layout === "panel";
  // A group set whose party count is unset: a blank to write the count in,
  // and every benefit listed without marking any inactive.
  const countUnknown = card.group && card.partyPieces === undefined;
  const stats: { label: string; value: ReactNode }[] = [
    card.group
      ? {
          label: "Party pieces",
          value: countUnknown ? (
            <span className="print-write-in">
              <span className="visually-hidden">Not entered</span>
            </span>
          ) : (
            String(card.partyPieces)
          ),
        }
      : { label: "Pieces", value: String(card.pieces) },
    ...(card.tier === undefined || card.group
      ? []
      : [{ label: "Tier", value: card.tier }]),
  ];
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
      className={`print-reference-card print-item-card print-item-set-card${countUnknown ? " is-count-unknown" : ""}${isPanel ? " is-panel" : ""}`}
    >
      <header>
        <h3>
          <Icon name="layers" />
          <span
            {...(panel.headingId === undefined ? {} : { id: panel.headingId })}
          >
            {card.name}
          </span>
        </h3>
        {panel.headerAction}
      </header>
      {/* Panel only, like a power's flavor: the set's own introduction. */}
      {!isPanel || card.description === undefined || hideFlavortext ? null : (
        <p className="print-card-flavor">{card.description}</p>
      )}
      <CardPanelSubheading subheading={panel.subheading} />
      <div className="print-item-subheader">
        <dl className="print-item-stats">
          <div className="print-item-stat-row">
            {stats.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </div>
        </dl>
      </div>
      <div className="print-card-body print-item-body">
        {card.group ? (
          <p className="print-item-set-note">
            Counts the set&apos;s pieces you and your allies wield.
          </p>
        ) : null}
        {card.benefits.length === 0 ? (
          <p className="print-item-set-note">This set lists no benefits.</p>
        ) : (
          card.benefits.map((benefit) => (
            <section
              className={`print-item-set-benefit${benefit.active ? " is-active" : ""}`}
              key={benefit.id}
            >
              <div className="print-item-rule-text">
                <strong>
                  {benefit.active ? <Icon name="check" /> : null}
                  {piecesLabel(benefit.pieceCount)}
                  {benefit.active ? " (active)" : ""}:{" "}
                </strong>
                <CardText
                  value={benefit.text}
                  textPresentation={panel.textPresentation}
                />
              </div>
            </section>
          ))
        )}
      </div>
      <footer className="print-item-footer">
        <span />
        {panel.source === undefined ? null : (
          <span className="print-card-source">{panel.source}</span>
        )}
      </footer>
      {panel.afterBody}
      <div className="print-card-type">
        <span>Item Set</span>
        <span>{card.group ? "Group" : ""}</span>
      </div>
    </article>
  );
}
