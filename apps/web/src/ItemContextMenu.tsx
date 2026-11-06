import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

/**
 * One item action. The same list builds the item's right-click menu and the
 * buttons in its detail pane (`ItemActionButtons`), so the two can't drift:
 * right-click is a shortcut, never the only way in.
 */
export interface ItemContextMenuItem {
  readonly label: string;
  /** Unique within the menu; defaults to the label. */
  readonly key?: string;
  /** A checkable action's state; undefined for a plain command. */
  readonly checked?: boolean;
  /**
   * Why the action can't be taken (the content offers nothing to choose):
   * the action stays in the menu and the pane, shown but inert.
   */
  readonly disabledReason?: string;
  readonly onSelect: () => void;
}

/** Where a right-click (or the Menu key) opened an item's menu. */
export interface ItemContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly items: readonly ItemContextMenuItem[];
}

/**
 * The menu state for a `contextmenu` event on an item, or undefined when the
 * item has no actions (the browser's own menu then opens). The Menu key and
 * Shift+F10 fire `contextmenu` with no pointer position, so the menu then
 * opens at the item.
 */
export function itemContextMenuAt(
  event: ReactMouseEvent<HTMLElement>,
  label: string,
  items: readonly ItemContextMenuItem[],
): ItemContextMenuState | undefined {
  if (items.length === 0) return undefined;
  event.preventDefault();
  event.stopPropagation();
  const box = event.currentTarget.getBoundingClientRect();
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  return {
    x: fromKeyboard ? box.left : event.clientX,
    y: fromKeyboard ? box.bottom : event.clientY,
    label,
    items,
  };
}

/**
 * A per-item right-click menu, as the legacy builder offered item actions:
 * a shortcut for the buttons in the item's detail pane. Choosing an item, Escape, or a press outside
 * closes it; focus starts on the first item and returns to the opener.
 */
export function ItemContextMenu({
  menu,
  onClose,
}: {
  readonly menu: ItemContextMenuState;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.querySelector<HTMLElement>("[role^='menuitem']")?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target))
        return;
      onClose();
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
      window.removeEventListener("blur", onClose);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [onClose]);
  return (
    <div
      aria-label={menu.label}
      className="item-context-menu"
      ref={ref}
      role="menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.items.map((item) => (
        <button
          aria-checked={item.checked}
          aria-disabled={item.disabledReason === undefined ? undefined : true}
          key={item.key ?? item.label}
          role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          title={item.disabledReason}
          type="button"
          onClick={() => {
            if (item.disabledReason !== undefined) return;
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The selected item's actions as buttons in its detail pane, from the same
 * list as its right-click menu: a checkable action is a toggle button
 * (`aria-pressed`); an inert one stays present, its reason as the title.
 */
export function ItemActionButtons({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly ItemContextMenuItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div aria-label={label} className="item-detail-actions" role="group">
      {items.map((item) => (
        <button
          aria-disabled={item.disabledReason === undefined ? undefined : true}
          aria-pressed={item.checked}
          key={item.key ?? item.label}
          title={item.disabledReason}
          type="button"
          onClick={() => {
            if (item.disabledReason !== undefined) return;
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
