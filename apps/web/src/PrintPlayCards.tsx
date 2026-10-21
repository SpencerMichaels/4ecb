import type { ReactNode } from "react";
import type { CharacterPortrait } from "@4ecb/character-domain";
import type { CharacterSheetModel } from "@4ecb/sheet-model";

import { PlayDataStats } from "./PlayDataStats";
import { playData } from "./play-data";

export type PlayCardKind = "play-character" | "play-skills";

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
  const identity = (label: string) =>
    model.identity.find((entry) => entry.label === label)?.value.trim() ?? "";
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
      <PlayDataStats data={playData(model)} />
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
