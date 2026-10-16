import { Icon } from "./Icon";
import type { ConsumableTracker } from "./print-item-presentation";

/** One shared physical-stock tracker, independent of the item's power count. */
export function PrintConsumableTracker({
  tracker,
}: {
  tracker: ConsumableTracker;
}) {
  return (
    <div
      className="print-consumable-tracker"
      aria-label="Consumables remaining"
    >
      <span>Remaining</span>
      {tracker.mode === "circles" ? (
        <span
          className="print-consumable-circles"
          aria-label={`${tracker.quantity} copies`}
        >
          {Array.from({ length: tracker.quantity ?? 0 }, (_, index) => (
            <Icon key={index} name="circle" />
          ))}
        </span>
      ) : (
        <span className="print-consumable-count">
          <span
            className="print-consumable-count-box"
            aria-label="Write remaining count"
          />
          {tracker.quantity === undefined ? null : (
            <span>/ {tracker.quantity}</span>
          )}
        </span>
      )}
    </div>
  );
}
