import { Icon } from "./Icon";

export interface SelectionSummaryItem {
  readonly id: string;
  readonly label: string;
}

export function selectionSummaryLabel(
  items: readonly SelectionSummaryItem[],
  selectionLimit?: number,
): string {
  if (items.length === 0) return "No selection";
  const names = items.map(({ label }) => label).join(" and ");
  return items.length === 1 && selectionLimit === 2
    ? `Selected: ${names} (1 of 2)`
    : `Selected: ${names}`;
}

export function SelectionSummary({
  items,
  selectionLimit,
  onInspect,
  onLocate,
}: {
  readonly items: readonly SelectionSummaryItem[];
  readonly selectionLimit?: number;
  readonly onInspect: (id: string) => void;
  readonly onLocate: (id: string) => void;
}) {
  if (items.length === 0)
    return (
      <div
        className="selection-summary selection-summary-empty"
        aria-live="polite"
      >
        <span className="selection-summary-label">Current selection</span>
        <span>No selection</span>
      </div>
    );

  return (
    <div className="selection-summary" aria-live="polite">
      <span className="selection-summary-label">Current selection</span>
      {items.map((item, index) => (
        <span className="selection-summary-item" key={item.id}>
          {index > 0 ? " and " : null}
          <button
            className="selection-summary-name"
            type="button"
            onClick={() => onInspect(item.id)}
          >
            {item.label}
          </button>
          <button
            aria-label={`Locate ${item.label} in the table`}
            className="selection-summary-locate"
            title={`Locate ${item.label} in the table`}
            type="button"
            onClick={() => onLocate(item.id)}
          >
            <Icon name="focus" />
          </button>
        </span>
      ))}
      {items.length === 1 && selectionLimit === 2 ? (
        <span> (1 of 2)</span>
      ) : null}
    </div>
  );
}
