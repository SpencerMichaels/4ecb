import type { LevelGain } from "./level-gains";

function GainItems({ gains }: { readonly gains: readonly LevelGain[] }) {
  return (
    <ul>
      {gains.map((gain) => (
        <li key={gain.occurrenceId}>
          <span className="level-gain-name">{gain.name}</span>{" "}
          <span className="level-gain-type">{gain.typeLabel}</span>
          {gain.note === undefined ? null : (
            <p className="level-gain-note">{gain.note}</p>
          )}
          {gain.children.length === 0 ? null : (
            <GainItems gains={gain.children} />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The features and powers a level grants on its own, under the Build tab's
 * "No choices need attention" state. Nothing renders when the level grants
 * nothing.
 */
export function LevelGainsList({
  gains,
}: {
  readonly gains: readonly LevelGain[];
}) {
  if (gains.length === 0) return null;
  return (
    <section aria-labelledby="level-gains-heading" className="level-gains">
      <h4 id="level-gains-heading">Gained at this level</h4>
      <GainItems gains={gains} />
    </section>
  );
}
