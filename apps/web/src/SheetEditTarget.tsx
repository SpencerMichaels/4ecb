import {
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
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

/** `order` with `entry` moved to just before `before` (or to the end). */
export function movedBefore<Entry>(
  order: readonly Entry[],
  entry: Entry,
  before: Entry | undefined,
): Entry[] {
  const rest = order.filter((other) => other !== entry);
  const index = before === undefined ? rest.length : rest.indexOf(before);
  return [...rest.slice(0, index), entry, ...rest.slice(index)];
}

/** Dragging one overlay onto another to move what it covers (D099). */
export interface SheetEditDrag {
  /** This overlay's card is the one being dragged. */
  readonly dragging: boolean;
  /** A drag of ours is in progress, so this overlay accepts drops. */
  readonly accepting: boolean;
  /** Where a drop would land, marked by a rule on that edge. */
  readonly dropEdge?: "before" | "after";
  /** The element drawn under the pointer while dragging. */
  readonly image?: (target: HTMLElement) => Element | null | undefined;
  readonly onStart: () => void;
  /** The pointer is over this overlay's leading or trailing half. */
  readonly onOver: (after: boolean) => void;
  readonly onLeave: () => void;
  readonly onDrop: (after: boolean) => void;
  readonly onEnd: () => void;
}

/** Whether the pointer is over the trailing (right) half of the target. */
const afterMiddle = (event: ReactDragEvent<HTMLElement>) => {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX > box.left + box.width / 2;
};

/**
 * An Edit-mode overlay over one sheet card (D099). It never
 * changes what it covers: it is absolutely positioned by its container's CSS,
 * screen-only, and never inside measured probe copies. Like the legacy
 * builder's card "Hide", a right-click hides or shows what it covers; there
 * is no menu and no visible button (owner, 2026-10-25). Keyboard users focus
 * the overlay and press Enter, Space, the Menu key or Shift+F10. A plain
 * click does nothing; pressing and dragging the overlay onto another moves
 * the card there (`drag`, mouse only: no keyboard or touch equivalent yet).
 */
export function SheetEditTarget({
  className,
  style,
  name,
  hidden = false,
  onToggle,
  drag,
  dataKey,
  children,
}: {
  readonly className: string;
  readonly style?: CSSProperties;
  /** What the overlay covers, for its accessible name ("Hide Arc Strike"). */
  readonly name: string;
  /** Hidden from print, still shown dimmed in Edit mode. */
  readonly hidden?: boolean;
  readonly onToggle: () => void;
  readonly drag?: SheetEditDrag;
  /** Identifies what the overlay covers (`data-key`). */
  readonly dataKey?: string;
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
      data-dragging={drag?.dragging || undefined}
      data-drop={drag?.dropEdge}
      data-hidden={hidden || undefined}
      data-key={dataKey}
      draggable={drag === undefined ? undefined : true}
      ref={targetRef}
      role="button"
      style={style}
      tabIndex={0}
      onDragStart={(event) => {
        if (drag === undefined) return;
        drag.onStart();
        if (!event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", name);
        const image = drag.image?.(event.currentTarget);
        if (image) {
          const box = event.currentTarget.getBoundingClientRect();
          event.dataTransfer.setDragImage(
            image,
            event.clientX - box.left,
            event.clientY - box.top,
          );
        }
      }}
      onDragOver={(event) => {
        if (!drag?.accepting) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        drag.onOver(afterMiddle(event));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          drag?.onLeave();
      }}
      onDrop={(event) => {
        if (!drag?.accepting) return;
        event.preventDefault();
        drag.onDrop(afterMiddle(event));
      }}
      onDragEnd={() => drag?.onEnd()}
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
