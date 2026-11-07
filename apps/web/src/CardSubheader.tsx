import type { ReactNode } from "react";

export interface CardSubheaderField {
  readonly label: string;
  readonly value: string;
}

/**
 * A card's subheader: its short labelled fields under the title, one line
 * per row, "·" between a row's fields. Item cards (stats) and rituals use
 * it, and so do deity cards (Alignment · Pantheon, Domains, Counts as).
 * `undivided` lines read as one block, without rules between them (the
 * ritual and deity subheaders). `extra` adds rows after the fields (an
 * item's weapon properties).
 */
export function CardSubheader({
  rows,
  undivided = false,
  labelFor = (field) => field.label,
  extra,
}: {
  readonly rows: readonly (readonly CardSubheaderField[])[];
  readonly undivided?: boolean;
  /** A row's display label for a field (the item card's short "Prof"). */
  readonly labelFor?: (
    field: CardSubheaderField,
    row: readonly CardSubheaderField[],
  ) => string;
  readonly extra?: ReactNode;
}) {
  return (
    <div className="print-item-subheader">
      <dl className={`print-item-stats${undivided ? " is-undivided" : ""}`}>
        {rows.map((row, rowIndex) => (
          <div className="print-item-stat-row" key={rowIndex}>
            {row.map((field) => (
              <div key={field.label}>
                <dt>{labelFor(field, row)}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </div>
        ))}
        {extra}
      </dl>
    </div>
  );
}
