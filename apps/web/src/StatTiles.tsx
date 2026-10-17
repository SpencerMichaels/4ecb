import "./stat-tiles.css";

export interface StatTileValue {
  readonly label: string;
  readonly value: string;
  readonly title?: string;
}

export type StatTone = "defenses" | "health" | "movement" | "abilities";

/** Labeled numeric tiles shared by the printed summary band and the builder. */
export function StatGroup({
  label,
  tone,
  values,
  className,
  compact = false,
}: {
  readonly label: string;
  readonly tone: StatTone;
  readonly values: readonly StatTileValue[];
  readonly className?: string;
  readonly compact?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={["stat-group", `stat-tone-${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      <dl className={compact ? "stat-tiles stat-tiles-compact" : "stat-tiles"}>
        {values.map((value) => (
          <div className="stat-tile" key={value.label}>
            <dt>{value.label}</dt>
            <dd {...(value.title === undefined ? {} : { title: value.title })}>
              {value.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
