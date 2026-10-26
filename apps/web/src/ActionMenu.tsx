import { useCallback, useId, useRef, useState } from "react";

import { Icon, type IconName } from "./Icon";
import { useDismissiblePopover } from "./use-dismissible-popover";

export interface ActionMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
}

/**
 * An icon button that opens a small list of actions below it (Export in the
 * library, Change level in the builder). It closes on a pick, on Escape (back
 * to the trigger) and on any click outside it.
 */
export function ActionMenu({
  icon,
  label,
  menuLabel,
  triggerClassName,
  items,
  busyLabel,
  visibleLabel,
}: {
  readonly icon: IconName;
  /** The trigger's accessible name and tooltip. */
  readonly label: string;
  readonly menuLabel: string;
  readonly triggerClassName: string;
  readonly items: readonly ActionMenuItem[];
  /** Set while a picked action is still working (a slow export): the trigger
   *  spins, says so, and ignores clicks until it is done. */
  readonly busyLabel?: string;
  /** A short word shown beside (or under) the icon; the full action stays
   *  the accessible name and tooltip. */
  readonly visibleLabel?: string;
}) {
  const busy = busyLabel !== undefined;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismissiblePopover({
    open,
    close,
    root,
    trigger,
    focusSelector: ".action-menu-options button:not(:disabled)",
  });

  return (
    <div className="action-menu" ref={root}>
      <button
        aria-controls={menuId}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        aria-expanded={open}
        aria-label={busyLabel ?? label}
        className={triggerClassName}
        ref={trigger}
        title={busyLabel ?? label}
        type="button"
        onClick={() => {
          if (!busy) setOpen((current) => !current);
        }}
      >
        {busy ? (
          <span aria-hidden="true" className="icon loading-spinner" />
        ) : (
          <Icon name={icon} />
        )}
        {visibleLabel === undefined ? null : (
          <span className="action-menu-label">{visibleLabel}</span>
        )}
      </button>
      {open ? (
        <div aria-label={menuLabel} className="action-menu-options" id={menuId}>
          {items.map((item) => (
            <button
              disabled={item.disabled}
              key={item.label}
              title={item.title}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
