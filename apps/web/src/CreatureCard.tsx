import {
  creatureCardTitle,
  creatureCardTypeLabel,
  type SheetCreatureCard,
  type SheetCreatureEntry,
} from "@4ecb/sheet-model";

import { abilityAbbreviation } from "./ability-abbreviations";
import { Icon } from "./Icon";
import {
  CardPanelSubheading,
  type CardLayout,
  type CardPanelProps,
} from "./PowerCard";
import { proseBlocks, ProseBlocks } from "./Prose";
import { StatGroup } from "./StatTiles";
import { usePrintCardFit } from "./use-print-card-fit";

export const signedNumber = (value: number) =>
  value >= 0 ? `+${value}` : String(value);

/** A stat-block entry: an associate's (D107) or a creature's (D110) trait or
 *  power, with its numbers already worked out. */
export type CreatureBlockEntry = SheetCreatureEntry;

const ATTACK_KIND_LABELS: Readonly<
  Record<NonNullable<SheetCreatureEntry["attackKind"]>, string>
> = {
  "basic-melee": "Melee basic attack",
  melee: "Melee",
  ranged: "Ranged",
  close: "Close",
  area: "Area",
};

/** "Blinking Bite (teleportation)", "Dust and Smoke · Aura 1". */
function entryHeading(entry: CreatureBlockEntry): string {
  const name =
    entry.keywords === undefined
      ? entry.name
      : `${entry.name} (${entry.keywords})`;
  return entry.aura === undefined ? name : `${name} · Aura ${entry.aura}`;
}

/** The entry's attack icon, action and usage, leaving out an action its name
 *  states ("Standard Action"). */
function entryMeta(entry: CreatureBlockEntry): string {
  const action =
    entry.action === undefined ||
    entry.name.toLocaleLowerCase().includes(entry.action.toLocaleLowerCase())
      ? undefined
      : entry.action;
  return [
    entry.attackKind === undefined
      ? undefined
      : ATTACK_KIND_LABELS[entry.attackKind],
    action,
    entry.usage,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One trait or power of a stat block, as a section of its card. */
export function CreatureEntrySection({
  entry,
}: {
  readonly entry: CreatureBlockEntry;
}) {
  const meta = entryMeta(entry);
  return (
    <section className="print-familiar-section print-associate-entry">
      <h4>
        {entryHeading(entry)}
        {meta === "" ? null : (
          <span className="print-associate-usage"> {meta}</span>
        )}
      </h4>
      {entry.roll === undefined ? null : (
        <p className="print-creature-roll">
          <strong>Attack</strong> {entry.roll.attack}
          {entry.roll.damage === undefined ? null : (
            <>
              {" · "}
              <strong>Damage</strong> {entry.roll.damage}
            </>
          )}
        </p>
      )}
      {entry.lines.map((line, index) => (
        <p key={index}>
          {line.label === undefined ? null : <strong>{line.label}: </strong>}
          {line.text}
        </p>
      ))}
    </section>
  );
}

/** The ability tiles of a stat block: score, abbreviation, modifier. */
export function CreatureAbilityTiles({
  abilities,
}: {
  readonly abilities: NonNullable<SheetCreatureCard["abilities"]>;
}) {
  return (
    <StatGroup
      label="Abilities"
      tone="abilities"
      compact
      values={abilities.map((ability) => ({
        lead: String(ability.score),
        label: abilityAbbreviation(ability.name),
        value: signedNumber(ability.modifier),
      }))}
    />
  );
}

/** The defense tiles of a stat block. */
export function creatureDefenseTiles(defenses: SheetCreatureCard["defenses"]) {
  return [
    { label: "AC", value: String(defenses.ac) },
    { label: "Fort", value: String(defenses.fortitude) },
    { label: "Ref", value: String(defenses.reflex) },
    { label: "Will", value: String(defenses.will) },
  ];
}

/** The hit point tiles of a stat block, with what the hit points are when
 *  they are the owner's value. */
export function creatureHitPointTiles(
  card: Pick<SheetCreatureCard, "hitPoints" | "hitPointsFrom" | "bloodied">,
) {
  return [
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
  ];
}

/** The stat block's notes after its tiles, as printed. */
export function creatureNotes(
  card: Pick<
    SheetCreatureCard,
    "defensesNote" | "defenseTraits" | "hitPointsNote" | "healingSurges"
  >,
): string[] {
  return [
    card.defensesNote,
    card.defenseTraits?.join("; "),
    card.hitPointsNote,
    card.healingSurges === undefined
      ? undefined
      : `Healing surges: ${card.healingSurges}`,
  ].filter((note): note is string => note !== undefined && note !== "");
}

/**
 * A creature's card (D110), in the companion cards' frame: a mount's or a
 * summoned creature's (D111) stat block, one format for the printed deck and the
 * builder. A whole card shows everything; a creature too long for one
 * printed card prints as a `stats` card and an `actions` card (the deck
 * decides, by measuring the whole card at the minimum text size). The
 * printed card keeps only its description's tables (a load table); the
 * builder pane shows the whole description.
 */
export function CreatureCard({
  card,
  layout = "print",
  panel = {},
  onFit,
}: {
  readonly card: SheetCreatureCard;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
  /** A measuring copy's report: whether the card fits at the minimum
   *  text size. */
  readonly onFit?: (fits: boolean) => void;
}) {
  const cardRef = usePrintCardFit(layout === "print", onFit);
  const isPanel = layout === "panel";
  const showStats = card.part !== "actions";
  const showActions = card.part !== "stats";
  const identity = [
    card.level === undefined
      ? undefined
      : [`Level ${card.level}`, card.role].filter(Boolean).join(" "),
    card.identity,
  ]
    .filter(Boolean)
    .join(" · ");
  const movement = [
    card.initiative === undefined
      ? undefined
      : ["Initiative", signedNumber(card.initiative)],
    card.perception === undefined
      ? undefined
      : ["Perception", signedNumber(card.perception)],
    ["Speed", card.speed || "—"],
  ].filter((entry): entry is string[] => entry !== undefined);
  const notes = [
    ...creatureNotes(card),
    [
      card.skills === undefined ? undefined : `Skills ${card.skills}`,
      card.languages === undefined ? undefined : `Languages ${card.languages}`,
    ]
      .filter(Boolean)
      .join(" · "),
    ...(card.other ?? []),
  ].filter((note) => note !== "");
  const description =
    card.description === undefined || !showStats
      ? []
      : proseBlocks(card.description).filter(
          (block) => isPanel || block.kind === "table",
        );
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
      className={`print-reference-card print-play-card print-familiar-card print-creature-card${isPanel ? " is-panel" : ""}`}
      data-creature-part={card.part ?? "whole"}
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
              {creatureCardTitle(card)}
            </span>
          </h3>
          {identity === "" || !showStats ? null : (
            <p className="print-play-identity">{identity}</p>
          )}
        </div>
        {panel.headerAction}
      </header>
      <CardPanelSubheading subheading={panel.subheading} />
      <div className="print-card-body print-play-body">
        {showStats ? (
          <>
            <div className="print-creature-vitals">
              <StatGroup
                label="Defenses"
                tone="defenses"
                values={creatureDefenseTiles(card.defenses)}
              />
              <StatGroup
                label="Health"
                tone="health"
                values={creatureHitPointTiles(card)}
              />
            </div>
            {card.abilities === undefined ? null : (
              <CreatureAbilityTiles abilities={card.abilities} />
            )}
            <p className="print-creature-note">
              {movement.map(([label, value], index) => (
                <span key={label}>
                  {index === 0 ? null : " · "}
                  <strong>{label}</strong> {value}
                </span>
              ))}
              {card.senses === undefined ? null : ` · ${card.senses}`}
            </p>
            {notes.map((note) => (
              <p className="print-creature-note" key={note}>
                {note}
              </p>
            ))}
            {card.traits.map((entry, index) => (
              <CreatureEntrySection entry={entry} key={`trait-${index}`} />
            ))}
          </>
        ) : null}
        {showActions
          ? card.actions.map((entry, index) => (
              <CreatureEntrySection entry={entry} key={`action-${index}`} />
            ))
          : null}
        {description.length === 0 ? null : (
          <ProseBlocks
            blocks={description}
            className="print-creature-description"
          />
        )}
      </div>
      {panel.source === undefined ? null : (
        <footer className="print-item-footer">
          <span className="print-card-source">{panel.source}</span>
        </footer>
      )}
      {panel.afterBody}
      <div className="print-card-type">
        <span>{creatureCardTypeLabel(card)}</span>
      </div>
    </article>
  );
}
