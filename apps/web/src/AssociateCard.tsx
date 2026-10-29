import type { SheetAssociateCard } from "@4ecb/sheet-model";

import {
  CreatureAbilityTiles,
  CreatureEntrySection,
  creatureDefenseTiles,
  creatureHitPointTiles,
  creatureNotes,
  signedNumber,
} from "./CreatureCard";
import { Icon } from "./Icon";
import {
  CardPanelSubheading,
  type CardLayout,
  type CardPanelProps,
} from "./PowerCard";
import { StatGroup } from "./StatTiles";
import { usePrintCardFit } from "./use-print-card-fit";

/**
 * An associate's card (D107), in the companion cards' frame: one format for
 * the printed deck and the builder. Every number comes from the evaluated
 * associate; the text is its stat block's.
 */
export function AssociateCard({
  card,
  layout = "print",
  panel = {},
}: {
  readonly card: SheetAssociateCard;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
}) {
  const cardRef = usePrintCardFit(layout === "print");
  const isPanel = layout === "panel";
  const identity = [
    card.level === undefined ? undefined : `Level ${card.level}`,
    card.identity,
  ]
    .filter(Boolean)
    .join(" ");
  const notes = creatureNotes(card);
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
      className={`print-reference-card print-play-card print-familiar-card print-associate-card${isPanel ? " is-panel" : ""}`}
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
              {card.name}
            </span>
          </h3>
          {identity === "" ? null : (
            <p className="print-play-identity">{identity}</p>
          )}
        </div>
        {panel.headerAction}
      </header>
      <CardPanelSubheading subheading={panel.subheading} />
      <div className="print-card-body print-play-body">
        <StatGroup
          label="Defenses"
          tone="defenses"
          values={creatureDefenseTiles(card.defenses)}
        />
        <StatGroup
          label="Health"
          tone="health"
          values={[
            ...creatureHitPointTiles(card),
            ...(card.initiative === undefined
              ? []
              : [{ label: "Init", value: signedNumber(card.initiative) }]),
            ...(card.perception === undefined
              ? []
              : [{ label: "Perc", value: signedNumber(card.perception) }]),
          ]}
        />
        {card.abilities === undefined ? null : (
          <CreatureAbilityTiles abilities={card.abilities} />
        )}
        <p className="print-play-note">
          <strong>Speed</strong> {card.speed || "—"}
          {card.senses === undefined ? null : ` · ${card.senses}`}
        </p>
        {notes.map((note) => (
          <p className="print-play-note" key={note}>
            {note}
          </p>
        ))}
        {card.traits.map((entry, index) => (
          <CreatureEntrySection entry={entry} key={`trait-${index}`} />
        ))}
        {card.powers.map((entry, index) => (
          <CreatureEntrySection entry={entry} key={`power-${index}`} />
        ))}
        {(card.other ?? []).map((line) => (
          <p className="print-play-note" key={line}>
            {line}
          </p>
        ))}
      </div>
      {panel.source === undefined ? null : (
        <footer className="print-item-footer">
          <span className="print-card-source">{panel.source}</span>
        </footer>
      )}
      {panel.afterBody}
      <div className="print-card-type">
        <span>{card.role ?? "Associate"}</span>
      </div>
    </article>
  );
}
