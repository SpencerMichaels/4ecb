import { useLayoutEffect, useRef, useState } from "react";
import { surgeTrackRows } from "./scratchpad-layout";

export function SurgeBar({ count }: { count: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(20);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      // Includes gaps: each markable segment stays at least roughly 4mm wide.
      if (width > 0) setColumns(Math.max(1, Math.floor(width / 18)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
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
            {row.map((remaining, index) => (
              <div
                className={`ov-surge-segment${index && (total - remaining) % 5 === 0 ? " ov-surge-group" : ""}`}
                key={remaining}
              >
                {total <= 10 ||
                remaining === total ||
                index === 0 ||
                remaining % 5 === 0 ? (
                  <small className="ov-surge-label">{remaining}</small>
                ) : null}
                {index === row.length - 1 ? (
                  <small className="ov-surge-label ov-surge-end">
                    {remaining - 1}
                  </small>
                ) : null}
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
