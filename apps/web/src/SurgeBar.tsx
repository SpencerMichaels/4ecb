import { useLayoutEffect, useRef, useState } from "react";
import { surgeTrackColumns, surgeTrackRows } from "./scratchpad-layout";

export function SurgeBar({ count }: { count: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(20);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const row = element.querySelector<HTMLElement>(".ov-surge-row");
      const segment = element.querySelector<HTMLElement>(".ov-surge-segment");
      if (!row || !segment) return;
      const width = row.getBoundingClientRect().width;
      const height = segment.getBoundingClientRect().height;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      if (width > 0 && height > 0)
        setColumns(surgeTrackColumns(width, height, gap));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [count]);
  const total = /^\d+$/.test(count) ? Number(count) : undefined;
  const rows = total === undefined ? [] : surgeTrackRows(total, columns);
  return (
    <div
      className="ov-surge-track"
      ref={ref}
      aria-label={
        total === undefined ? `Surges: ${count}` : `${total} healing surges`
      }
    >
      {total === undefined ? (
        <span>{count}</span>
      ) : total === 0 ? (
        <span>0</span>
      ) : (
        rows.map((row, rowIndex) => (
          <div
            className="ov-surge-row"
            style={{
              gridTemplateColumns: `repeat(${Math.min(columns, total)}, minmax(0, 1fr))`,
            }}
            key={rowIndex}
          >
            {row.map((remaining) => (
              <div className="ov-surge-segment" key={remaining}>
                <small className="ov-surge-label">{remaining}</small>
              </div>
            ))}
          </div>
        ))
      )}
      {total !== undefined && total > 100 ? (
        <p className="sp-caption">
          {total - 100} additional surges; first 100 segments shown.
        </p>
      ) : null}
    </div>
  );
}
