import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { CharacterPortrait } from "@4ecb/character-domain";
import type { CharacterSheetModel } from "@4ecb/sheet-model";

import { fitOneLineText, ONE_LINE_FIT_CLASS } from "./one-line-fit";
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

/**
 * The Play data name stays on one line: it shrinks no smaller than the
 * identity line under it (owner, 2026-11-06), then truncates with an
 * ellipsis. The floor is read from the identity line's computed size.
 */
function useFittedPlayName(name: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const card = element?.closest<HTMLElement>(".print-reference-card");
    if (!element || !card) return;
    const fit = () => {
      const identity = element.parentElement?.querySelector(
        ".print-play-identity",
      );
      if (identity) {
        const floor = Number.parseFloat(getComputedStyle(identity).fontSize);
        if (floor > 0) element.dataset.fitMin = `${floor}px`;
      }
      fitOneLineText(element);
    };
    // Hidden print cards have no geometry: the observer refits once the
    // preview or print media shows them.
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    fit();
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) fit();
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [name]);
  return ref;
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
  const nameRef = useFittedPlayName(name);
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
            <h3
              className={ONE_LINE_FIT_CLASS}
              data-fit-overflow="ellipsis"
              ref={nameRef}
              title={name}
            >
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
