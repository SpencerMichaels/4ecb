import type { CSSProperties } from "react";

import { ONE_LINE_FIT_CLASS } from "./one-line-fit";
import "./stat-tiles.css";

export interface StatTileValue {
  readonly label: string;
  readonly value: string;
  readonly title?: string;
  /** Value shown before the label at the value size, e.g. an ability score. */
  readonly lead?: string;
  /** Text value that shrinks to stay on one line (`one-line-fit.ts`), e.g. a
   *  familiar's speed, instead of wrapping inside its tile. */
  readonly oneLine?: boolean;
  /** A count that can outgrow its tile, e.g. a coin count: its value
   *  shrinks with its length (`statValueFit`) instead of wrapping. */
  readonly fit?: boolean;
}

/** On a tile whose value shrinks with its length to stay on one line. */
export const STAT_TILE_FIT_CLASS = "stat-tile-fit";
/** On the element holding that value's text, inside the tile. */
export const STAT_VALUE_FIT_CLASS = "stat-value-fit";

/**
 * The tile style for a value that shrinks with its length (`text`), sized
 * by the tile's own width in pure CSS (stat-tiles.css), so a 7-digit coin
 * count stays on one line in print and on screen without measuring.
 */
export function statValueFit(text: string): CSSProperties {
  // A digit group separator is about half a digit wide.
  const separators = text.replace(/[^,.]/g, "").length;
  return {
    "--stat-value-chars": String(Math.max(1, text.length - separators / 2)),
  } as CSSProperties;
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
          <div
            className={
              value.fit === true
                ? `stat-tile ${STAT_TILE_FIT_CLASS}`
                : "stat-tile"
            }
            key={value.label}
            {...(value.fit === true
              ? { style: statValueFit(value.value) }
              : {})}
          >
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
            <dd
              {...(value.title === undefined ? {} : { title: value.title })}
              {...(value.oneLine === true
                ? { className: ONE_LINE_FIT_CLASS }
                : {})}
            >
              {value.fit === true ? (
                <span className={STAT_VALUE_FIT_CLASS}>{value.value}</span>
              ) : (
                value.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
