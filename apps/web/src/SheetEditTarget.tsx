import {
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

/** Keys that toggle a focused target: Enter/Space, or the Menu key/Shift+F10
 *  that would raise a context menu (the right-click equivalent). */
const togglesTarget = (event: ReactKeyboardEvent) =>
  event.key === "Enter" ||
  event.key === " " ||
  event.key === "ContextMenu" ||
  (event.key === "F10" && event.shiftKey);

/**
 * An Edit-mode overlay over one sheet card (D099). It never
 * changes what it covers: it is absolutely positioned by its container's CSS,
 * screen-only, and never inside measured probe copies. Like the legacy
 * builder's card "Hide", a right-click hides or shows what it covers; there
 * is no menu and no visible button (owner, 2026-10-25). Keyboard users focus
 * the overlay and press Enter, Space, the Menu key or Shift+F10. A plain
 * click does nothing, leaving it free for dragging cards later.
 */
export function SheetEditTarget({
  className,
  style,
  name,
  hidden = false,
  onToggle,
  children,
}: {
  readonly className: string;
  readonly style?: CSSProperties;
  /** What the overlay covers, for its accessible name ("Hide Arc Strike"). */
  readonly name: string;
  /** Hidden from print, still shown dimmed in Edit mode. */
  readonly hidden?: boolean;
  readonly onToggle: () => void;
  readonly children?: ReactNode;
}) {
  const targetRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const target = targetRef.current;
    // Should a toggle re-render this overlay away, fall back to its
    // neighbour so keyboard focus stays on the sheet.
    const focused = target !== null && document.activeElement === target;
    const controls = [
      ...document.querySelectorAll<HTMLElement>(".sheet-edit-target"),
    ];
    const index = target === null ? -1 : controls.indexOf(target);
    const fallback = controls[index + 1] ?? controls[index - 1];
    onToggle();
    if (!focused) return;
    window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus();
      else if (fallback?.isConnected) fallback.focus();
    });
  };

  return (
    <div
      aria-label={`${hidden ? "Show" : "Hide"} ${name}`}
      aria-pressed={hidden}
      className={`sheet-edit-target ${className}`}
      data-hidden={hidden || undefined}
      ref={targetRef}
      role="button"
      style={style}
      tabIndex={0}
      onContextMenu={(event: ReactMouseEvent) => {
        event.preventDefault();
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !togglesTarget(event))
          return;
        event.preventDefault();
        toggle();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Whether the browser is printing. `beforeprint` runs before print layout
 * and the state flips synchronously there, so Edit mode's hidden-card
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
