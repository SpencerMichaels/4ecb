import { StatGroup } from "./StatTiles";
import type { PlayData } from "./play-data";

/**
 * The Play data card's stat body: ability scores (compact 3 × 2, score
 * first), defenses, health, one Init | Speed | Passive senses row (1 : 1 :
 * 2.2), then the note lines. Rendered by the printed Play data card, which
 * sets its base font size (StatGroup is sized in em).
 */
export function PlayDataStats({ data }: { readonly data: PlayData }) {
  return (
    <>
      <StatGroup
        label="Ability scores"
        tone="abilities"
        compact
        values={data.abilities}
      />
      <StatGroup label="Defenses" tone="defenses" values={data.defenses} />
      <StatGroup label="Health" tone="health" values={data.health} />
      <div className="play-data-row">
        <StatGroup
          label="Initiative"
          tone="movement"
          values={data.initiative}
        />
        <StatGroup label="Speed" tone="movement" values={data.speed} />
        <StatGroup
          label="Passive senses"
          tone="abilities"
          values={data.passives}
        />
      </div>
      {data.notes.map(({ label, text }) => (
        <p className="play-data-note" key={label}>
          <strong>{label}</strong> {text}
        </p>
      ))}
    </>
  );
}
