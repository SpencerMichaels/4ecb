import { useEffect, useId, useRef, useState } from "react";

import { Icon, type IconName } from "./Icon";

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
}: {
  readonly icon: IconName;
  /** The trigger's accessible name and tooltip. */
  readonly label: string;
  readonly menuLabel: string;
  readonly triggerClassName: string;
  readonly items: readonly ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLElement>(".action-menu-options button:not(:disabled)")
      ?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  return (
    <div className="action-menu" ref={root}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={label}
        className={triggerClassName}
        ref={trigger}
        title={label}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name={icon} />
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
