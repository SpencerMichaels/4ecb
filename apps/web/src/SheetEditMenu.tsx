import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";

export interface SheetEditMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
}

const VIEWPORT_MARGIN_PX = 8;

/** Whether a key press asks for the context menu (Menu key or Shift+F10). */
const opensContextMenu = (event: ReactKeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

/**
 * An Edit-mode overlay over one sheet card or section (D099). It never
 * changes what it covers: it is absolutely positioned by its container's CSS,
 * screen-only, and never inside measured probe copies. Like the legacy
 * builder, its menu opens on right-click; keyboard users focus the overlay
 * and press the Menu key or Shift+F10. There is no visible button.
 */
export function SheetEditTarget({
  className,
  style,
  menuLabel,
  hidden = false,
  items,
  children,
}: {
  readonly className: string;
  readonly style?: CSSProperties;
  /** The accessible name of the overlay and its menu. */
  readonly menuLabel: string;
  /** Hidden from print but revealed by "Show hidden": dimmed and marked. */
  readonly hidden?: boolean;
  readonly items: readonly SheetEditMenuItem[];
  readonly children?: ReactNode;
}) {
  const menuId = useId();
  const targetRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const open = menu !== undefined;

  const openAt = useCallback((x: number, y: number) => {
    setMenu((current) => current ?? { x, y });
  }, []);
  // From the keyboard: at the overlay's top-right corner.
  const openFromTarget = useCallback(() => {
    const rect = targetRef.current?.getBoundingClientRect();
    openAt(rect?.right ?? 0, rect?.top ?? 0);
  }, [openAt]);
  const close = useCallback((restoreFocus: boolean) => {
    setMenu(undefined);
    if (restoreFocus) targetRef.current?.focus();
  }, []);

  // Keep the menu inside the viewport, and focus its first item.
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (menu === undefined || element === null) return;
    const { width, height } = element.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN_PX;
    const maxTop = window.innerHeight - height - VIEWPORT_MARGIN_PX;
    element.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(menu.x - width, maxLeft))}px`;
    element.style.top = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(menu.y, maxTop))}px`;
    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  // Clicking elsewhere, scrolling or resizing closes the menu.
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      )
        return;
      close(false);
    };
    const dismiss = () => close(false);
    document.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, close]);

  const onContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    if (open) return;
    // A keyboard-raised context menu has no pointer position.
    if (event.clientX === 0 && event.clientY === 0) openFromTarget();
    else openAt(event.clientX, event.clientY);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const menuItems = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const index = menuItems.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) =>
      menuItems[(next + menuItems.length) % menuItems.length]?.focus();
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(menuItems.length - 1);
        break;
    }
  };

  const select = (item: SheetEditMenuItem) => {
    const target = targetRef.current;
    // The choice may remove this overlay (hiding with "Show hidden" off), so
    // remember the neighbouring overlay to keep keyboard focus on the sheet.
    const controls = [
      ...document.querySelectorAll<HTMLElement>(".sheet-edit-target"),
    ];
    const index = target === null ? -1 : controls.indexOf(target);
    const fallback = controls[index + 1] ?? controls[index - 1];
    setMenu(undefined);
    item.onSelect();
    window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus();
      else if (fallback?.isConnected) fallback.focus();
    });
  };

  return (
    <div
      aria-controls={open ? menuId : undefined}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={menuLabel}
      className={`sheet-edit-target ${className}`}
      data-hidden={hidden || undefined}
      ref={targetRef}
      role="button"
      style={style}
      tabIndex={0}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !opensContextMenu(event))
          return;
        event.preventDefault();
        openFromTarget();
      }}
    >
      {hidden ? <span className="sheet-edit-hidden-marker">Hidden</span> : null}
      {children}
      {/* In the body: clear of the paper's overflow and colour overrides. */}
      {open
        ? createPortal(
            <ul
              aria-label={menuLabel}
              className="sheet-edit-menu"
              id={menuId}
              ref={menuRef}
              role="menu"
              onKeyDown={onMenuKeyDown}
            >
              {items.map((item) => (
                <li key={item.label} role="none">
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                    onClick={() => select(item)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Whether the browser is printing. `beforeprint` runs before print layout
 * and the state flips synchronously there, so Edit mode's "Show hidden"
 * reveal and its overlays are gone from every printout.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return printing;
}
