import { useContext } from "react";

import type { SheetBeastCompanionCard } from "@4ecb/sheet-model";

import { abilityAbbreviation } from "./ability-abbreviations";
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

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

/** "1d8+3" as cards print damage: no spaces around the plus. */
const damageText = (damage: string) => damage.replace(/\s*\+\s*/g, "+");

/** The card's title: the beast's name, then its appearance or category. */
export function beastCompanionTitle(card: SheetBeastCompanionCard): string {
  const detail = card.appearance ?? card.category;
  return detail.toLocaleLowerCase() === card.name.toLocaleLowerCase()
    ? card.name
    : `${card.name} — ${detail}`;
}

/**
 * The beast companion card (legacy Companion panel, docs/companion-card-
 * proposal.md), in the Play data card's frame: one format for the printed
 * deck and the builder's companion detail pane. Every number comes from the
 * evaluated beast companion statistics.
 */
export function BeastCompanionCard({
  card,
  layout = "print",
  panel = {},
}: {
  readonly card: SheetBeastCompanionCard;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
}) {
  const cardRef = usePrintCardFit(layout === "print");
  const hideFlavortext = useContext(HideFlavortextContext);
  const isPanel = layout === "panel";
  const title = beastCompanionTitle(card);
  const identity = [
    [`Level ${card.level}`, card.size, "beast"].filter(Boolean).join(" "),
    // The title names the category unless an appearance replaces it.
    card.appearance === undefined ? undefined : card.category,
  ]
    .filter(Boolean)
    .join(" · ");
  const trained = card.skills.filter((skill) => skill.trained);
  const otherSkills = card.skills.filter((skill) => !skill.trained);
  const skillList = (skills: typeof card.skills) =>
    skills.map((skill) => `${skill.name} ${signed(skill.total)}`).join(", ");
  const defensesLine = [
    card.savingThrows === undefined
      ? undefined
      : `${signed(card.savingThrows)} to saving throws`,
    card.resistances === undefined
      ? undefined
      : `Resist ${card.resistances
          .map((resistance) => `${resistance.value} ${resistance.type}`)
          .join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
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
      className={`print-reference-card print-play-card print-familiar-card print-beast-card${isPanel ? " is-panel" : ""}`}
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
              {title}
            </span>
          </h3>
          <p className="print-play-identity">{identity}</p>
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
              ...(card.hitPointsFromMasterBloodied
                ? { title: "Your bloodied value" }
                : {}),
            },
            { label: "Bloodied", value: String(card.bloodied) },
            { label: "Surge", value: String(card.healingSurgeValue) },
            card.sharesHealingSurges || card.healingSurges === undefined
              ? {
                  label: "Surges",
                  value: "Yours",
                  title: "Shares your healing surges",
                }
              : { label: "Surges", value: String(card.healingSurges) },
          ]}
        />
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
        <p className="print-play-note">
          <strong>Speed</strong> {card.speed ?? "—"} · {card.vision} vision
        </p>
        <p className="print-play-note print-beast-attack">
          <strong>{card.attack.name}</strong> {signed(card.attack.attackBonus)}{" "}
          vs {card.attack.defense} · {damageText(card.attack.damage)} damage
        </p>
        {defensesLine === "" ? null : (
          <p className="print-play-note">{defensesLine}</p>
        )}
        {trained.length === 0 ? null : (
          <p className="print-play-note">
            <strong>Trained</strong> {skillList(trained)}
          </p>
        )}
        {otherSkills.length === 0 ? null : (
          <p className="print-play-note">
            <strong>Skills</strong> {skillList(otherSkills)}
          </p>
        )}
        {card.notes.length === 0 ? null : (
          <section className="print-familiar-section print-beast-notes">
            <h4>Situational</h4>
            {card.notes.map((note) => (
              <p key={note.provenanceId}>
                {note.text}{" "}
                <span className="print-beast-note-source">({note.source})</span>
              </p>
            ))}
          </section>
        )}
        {card.traits.map((trait) => (
          <section className="print-familiar-section" key={trait.label}>
            <h4>{trait.label}</h4>
            <CardText
              value={trait.text}
              textPresentation={panel.textPresentation}
            />
          </section>
        ))}
        <p className="print-play-note print-familiar-rules">{card.commands}</p>
        {card.description === undefined || hideFlavortext ? null : (
          <p className="print-familiar-description">{card.description}</p>
        )}
      </div>
      {panel.source === undefined ? null : (
        <footer className="print-item-footer">
          <span className="print-card-source">{panel.source}</span>
        </footer>
      )}
      {panel.afterBody}
      <div className="print-card-type">
        <span>Beast Companion</span>
      </div>
    </article>
  );
}
