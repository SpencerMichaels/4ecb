import type { ContentEntity } from "@4ecb/content-domain";

import { EntityCardLeadingIcon } from "./EntityCard";
import { Icon } from "./Icon";
import { entityVisualTone, visualToneClass } from "./visual-language";

export interface SelectionSummaryItem {
  readonly id: string;
  readonly label: string;
  readonly entity?: ContentEntity;
  readonly physicalBase?: ContentEntity | undefined;
}

export function SelectionSummary({
  items,
  visible = true,
  onInspect,
  onRemove,
}: {
  readonly items: readonly SelectionSummaryItem[];
  readonly visible?: boolean;
  readonly onInspect: (id: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  if (!visible) return null;

  if (items.length === 0)
    return (
      <div
        className="selection-summary selection-summary-empty"
        aria-live="polite"
      >
        <span>No selection</span>
      </div>
    );

  return (
    <div
      aria-label="Selected options"
      className="selection-summary"
      aria-live="polite"
    >
      {items.map((item) => (
        <span
          className={`selection-summary-item ${visualToneClass(
            item.entity === undefined
              ? "neutral"
              : entityVisualTone(item.entity),
          )}`}
          key={item.id}
        >
          <span aria-hidden="true" className="selection-summary-icon">
            <EntityCardLeadingIcon
              entity={item.entity}
              physicalBase={item.physicalBase}
            />
          </span>
          <button
            className="selection-summary-name"
            type="button"
            onClick={() => onInspect(item.id)}
          >
            {item.label}
          </button>
          <button
            aria-label={`Remove ${item.label}`}
            className="selection-summary-remove"
            title={`Remove ${item.label}`}
            type="button"
            onClick={() => onRemove(item.id)}
          >
            <Icon name="remove" />
          </button>
        </span>
      ))}
    </div>
  );
}
