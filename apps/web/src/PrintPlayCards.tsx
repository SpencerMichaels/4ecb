import type { ReactNode } from "react";
import type { CharacterPortrait } from "@4ecb/character-domain";
import type { CharacterSheetModel, SheetValue } from "@4ecb/sheet-model";

import { StatGroup } from "./StatTiles";
import { defensiveBonusText, isSavingThrowTrait } from "./defensive-text";

export type PlayCardKind = "play-character" | "play-skills";

const find = (values: readonly SheetValue[], label: string) =>
  values.find((value) => value.label.toLowerCase() === label.toLowerCase())
    ?.value ?? "—";

const signed = (value: string) =>
  /^\d/.test(value.trim()) ? `+${value.trim()}` : value.trim() || "—";

function PlayCardFrame({
  title,
  className = "",
  children,
}: {
  readonly title?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <article className={`print-reference-card print-play-card ${className}`}>
      {title === undefined ? null : <header>{title}</header>}
      <div className="print-play-body">{children}</div>
      <div className="print-card-type">
        <span>Play data</span>
      </div>
    </article>
  );
}

/** Legacy "Play Data" character card: core numbers for use at the table. */
export function PrintCharacterCard({
  model,
  name,
  portrait,
}: {
  readonly model: CharacterSheetModel;
  readonly name: string;
  readonly portrait: CharacterPortrait | undefined;
}) {
  const overview = model.overview;
  const identity = (label: string) =>
    model.identity.find((entry) => entry.label === label)?.value.trim() ?? "";
  const traits = overview?.defensiveTraits ?? [];
  const saves = [
    /^[+-]?0?$/.test(overview?.saves.trim() ?? "")
      ? ""
      : overview?.saves.trim(),
    ...traits.filter(isSavingThrowTrait).map(defensiveBonusText),
  ]
    .filter(Boolean)
    .join("; ");
  // Group by kind and drop the repeated word: "Resistances 5 fire, 7 cold".
  const defenseGroups = [
    ["Resistances", /^Resist\s+/i],
    ["Vulnerabilities", /^Vulnerable\s+/i],
    ["Immunities", /^Immune(?:\s+to)?\s+/i],
  ] as const;
  const defenseTexts = traits
    .filter((trait) => !isSavingThrowTrait(trait))
    .map(defensiveBonusText);
  const defenseLines = defenseGroups.map(
    ([label, prefix]) =>
      [
        label,
        defenseTexts
          .filter((text) => prefix.test(text))
          .map((text) => text.replace(prefix, ""))
          .join(", "),
      ] as const,
  );
  const otherDefenses = defenseTexts
    .filter((text) => !defenseGroups.some(([, prefix]) => prefix.test(text)))
    .join("; ");
  const summary = [identity("Race"), identity("Class"), identity("Level")]
    .filter(Boolean)
    .join(" ");
  return (
    <PlayCardFrame
      className="print-play-character"
      title={
        <>
          {portrait ? (
            <img
              className="print-play-portrait"
              src={portrait.renderedDataUrl}
              alt={`${name} portrait`}
            />
          ) : null}
          <div className="print-play-heading">
            <h3>
              <span>{name}</span>
            </h3>
            {summary ? <p className="print-play-identity">{summary}</p> : null}
          </div>
        </>
      }
    >
      <StatGroup
        label="Ability scores"
        tone="abilities"
        compact
        values={(overview?.abilities ?? []).map((ability) => ({
          lead: ability.score || "—",
          label: ability.name.slice(0, 3).toUpperCase(),
          value: ability.modifier || "—",
        }))}
      />
      <StatGroup
        label="Defenses"
        tone="defenses"
        values={[
          { label: "AC", value: find(model.defenses, "AC") },
          { label: "Fort", value: find(model.defenses, "Fortitude") },
          { label: "Ref", value: find(model.defenses, "Reflex") },
          { label: "Will", value: find(model.defenses, "Will") },
        ]}
      />
      <StatGroup
        label="Health"
        tone="health"
        values={[
          {
            label: "Max HP",
            value: find(model.resources, "Hit Points"),
          },
          { label: "Bloodied", value: overview?.bloodied || "—" },
          { label: "Surges", value: find(model.resources, "Healing Surges") },
          {
            label: "Surge HP",
            value: find(model.resources, "Healing Surge Value"),
          },
        ]}
      />
      <div className="print-play-row">
        <StatGroup
          label="Initiative"
          tone="movement"
          values={[
            {
              label: "Init",
              value: signed(find(model.resources, "Initiative")),
            },
          ]}
        />
        <StatGroup
          label="Speed"
          tone="movement"
          values={[{ label: "Speed", value: find(model.resources, "Speed") }]}
        />
        <StatGroup
          label="Passive senses"
          tone="abilities"
          values={[
            {
              label: "Pass. Insight",
              value: find(model.senses, "Passive Insight"),
            },
            {
              label: "Pass. Perc.",
              value: find(model.senses, "Passive Perception"),
            },
          ]}
        />
      </div>
      {[
        ["Senses", overview?.vision ?? ""],
        ["Saves", saves],
        ...defenseLines,
        ["Other", otherDefenses],
      ]
        .filter(([, text]) => text)
        .map(([label, text]) => (
          <p className="print-play-note" key={label}>
            <strong>{label}</strong> {text}
          </p>
        ))}
    </PlayCardFrame>
  );
}

/** Legacy "Play Data" skills card: every skill with its bonus and ability. */
export function PrintSkillsCard({
  model,
}: {
  readonly model: CharacterSheetModel;
}) {
  const skills = model.overview?.skills ?? [];
  return (
    <PlayCardFrame className="print-play-skills-card">
      <table className="print-play-skills" aria-label="Skills">
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col">Ability</th>
            <th scope="col">Bonus</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((skill) => (
            <tr key={skill.name}>
              <th scope="row">
                {skill.name}
                {skill.trained ? (
                  <sup className="print-play-trained" aria-label="Trained">
                    T
                  </sup>
                ) : null}
              </th>
              <td className="print-play-skill-ability">{skill.ability}</td>
              <td className="print-play-skill-bonus">{skill.bonus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {skills.some((skill) => skill.trained) ? (
        <p className="print-play-trained-key">
          <sup className="print-play-trained">T</sup> Trained
        </p>
      ) : null}
    </PlayCardFrame>
  );
}
