import type { SheetAssociateCard } from "@4ecb/sheet-model";

import { abilityAbbreviation } from "./ability-abbreviations";
import { Icon } from "./Icon";
import {
  CardPanelSubheading,
  type CardLayout,
  type CardPanelProps,
} from "./PowerCard";
import { StatGroup } from "./StatTiles";
import { usePrintCardFit } from "./use-print-card-fit";

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

type Entry = SheetAssociateCard["powers"][number];

/** "Blinking Bite (teleportation)", "Dust and Smoke · Aura 1". */
function entryHeading(entry: Entry): string {
  const name =
    entry.keywords === undefined
      ? entry.name
      : `${entry.name} (${entry.keywords})`;
  return entry.aura === undefined ? name : `${name} · Aura ${entry.aura}`;
}

/** The power's action and usage, leaving out an action its name states
 *  ("Standard Action"). */
function entryMeta(entry: Entry): string {
  const action =
    entry.action === undefined ||
    entry.name.toLocaleLowerCase().includes(entry.action.toLocaleLowerCase())
      ? undefined
      : entry.action;
  return [action, entry.usage].filter(Boolean).join(" · ");
}

function EntrySection({ entry }: { readonly entry: Entry }) {
  const meta = entryMeta(entry);
  return (
    <section className="print-familiar-section print-associate-entry">
      <h4>
        {entryHeading(entry)}
        {meta === "" ? null : (
          <span className="print-associate-usage"> {meta}</span>
        )}
      </h4>
      {entry.lines.map((line, index) => (
        <p key={index}>
          {line.label === undefined ? null : <strong>{line.label}: </strong>}
          {line.text}
        </p>
      ))}
    </section>
  );
}

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
  const notes = [
    card.defensesNote,
    card.defenseTraits?.join("; "),
    card.hitPointsNote,
    card.healingSurges === undefined
      ? undefined
      : `Healing surges: ${card.healingSurges}`,
  ].filter((note): note is string => note !== undefined && note !== "");
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
          values={[
            { label: "AC", value: String(card.defenses.ac) },
            { label: "Fort", value: String(card.defenses.fortitude) },
            { label: "Ref", value: String(card.defenses.reflex) },
            { label: "Will", value: String(card.defenses.will) },
          ]}
        />
        <StatGroup
          label="Health"
          tone="health"
          values={[
            {
              label: "HP",
              value: String(card.hitPoints),
              ...(card.hitPointsFrom === undefined
                ? {}
                : { title: card.hitPointsFrom }),
            },
            ...(card.bloodied === undefined
              ? []
              : [{ label: "Bloodied", value: String(card.bloodied) }]),
            ...(card.initiative === undefined
              ? []
              : [{ label: "Init", value: signed(card.initiative) }]),
            ...(card.perception === undefined
              ? []
              : [{ label: "Perc", value: signed(card.perception) }]),
          ]}
        />
        {card.abilities === undefined ? null : (
          <StatGroup
            label="Abilities"
            tone="abilities"
            compact
            values={card.abilities.map((ability) => ({
              lead: String(ability.score),
              label: abilityAbbreviation(ability.name),
              value: signed(ability.modifier),
            }))}
          />
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
          <EntrySection entry={entry} key={`trait-${index}`} />
        ))}
        {card.powers.map((entry, index) => (
          <EntrySection entry={entry} key={`power-${index}`} />
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
