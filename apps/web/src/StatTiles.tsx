import "./stat-tiles.css";

export interface StatTileValue {
  readonly label: string;
  readonly value: string;
  readonly title?: string;
  /** Value shown before the label at the value size, e.g. an ability score. */
  readonly lead?: string;
}

export type StatTone =
  "defenses" | "health" | "movement" | "abilities" | "wealth";

/** Labeled numeric tiles shared by the printed summary band and the builder. */
export function StatGroup({
  label,
  tone,
  values,
  className,
  heading,
  compact = false,
}: {
  readonly label: string;
  readonly tone: StatTone;
  readonly values: readonly StatTileValue[];
  readonly className?: string;
  /** Visible caption inside the group, e.g. "Carried". */
  readonly heading?: string;
  readonly compact?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={["stat-group", `stat-tone-${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {heading === undefined ? null : (
        <h4 className="stat-group-heading">{heading}</h4>
      )}
      <dl className={compact ? "stat-tiles stat-tiles-compact" : "stat-tiles"}>
        {values.map((value) => (
          <div className="stat-tile" key={value.label}>
            <dt>
              {value.lead === undefined ? (
                value.label
              ) : (
                <>
                  <span className="stat-tile-lead">{value.lead}</span>
                  <span className="stat-tile-label">{value.label}</span>
                </>
              )}
            </dt>
            <dd {...(value.title === undefined ? {} : { title: value.title })}>
              {value.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
