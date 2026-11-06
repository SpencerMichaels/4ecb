import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";

import { observeLineStarts } from "./line-starts";

/**
 * A "·"-separated inline list ("Ranger · Level 1", "Body · 50 lb · 1,000
 * gp"). The separators are CSS, and an item that wraps to the start of a
 * line drops its separator (`line-starts.ts`). Empty items are skipped; an
 * empty list renders nothing.
 */
export function DotList({
  items,
  className,
}: {
  readonly items: readonly ReactNode[];
  readonly className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = items.filter(
    (item) =>
      item !== undefined && item !== null && item !== false && item !== "",
  );
  const empty = shown.length === 0;
  useLayoutEffect(() => {
    const list = ref.current;
    return list === null ? undefined : observeLineStarts(list);
  }, [empty]);
  if (empty) return null;
  return (
    <span
      ref={ref}
      className={className === undefined ? "dot-list" : `dot-list ${className}`}
    >
      {shown.map((item, index) => (
        // The plain space between items is the line-break opportunity, so a
        // wrapped item carries its own (CSS) separator to the new line.
        <Fragment key={index}>
          {index === 0 ? null : " "}
          <span className="dot-list-item">{item}</span>
        </Fragment>
      ))}
    </span>
  );
}
