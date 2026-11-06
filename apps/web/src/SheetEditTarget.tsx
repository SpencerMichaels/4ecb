import {
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Icon } from "./Icon";

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
 * Edit mode's visible show/hide control (D099): a small eye at a card's
 * corner or a reminder row's end, eye when shown, eye-off when hidden. It
 * exists only while Edit mode is on (never in print or in measured probe
 * copies) and is positioned out of flow by its container's CSS, so it never
 * changes what it sits on. Right-click on the card or row remains a
 * shortcut for the same `onToggle`. Enter/Space press it; the Menu key and
 * Shift+F10 raise the browser's contextmenu event, which toggles it too.
 */
export function SheetEditToggle({
  className,
  style,
  name,
  hidden,
  onToggle,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** What the toggle covers, for its accessible name ("Hide Arc Strike"). */
  readonly name: string;
  readonly hidden: boolean;
  readonly onToggle: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const button = buttonRef.current;
    // Should a toggle re-render this control away, fall back to its
    // neighbour so keyboard focus stays on the sheet.
    const focused = button !== null && document.activeElement === button;
    const controls = [
      ...document.querySelectorAll<HTMLElement>(".sheet-edit-toggle"),
    ];
    const index = button === null ? -1 : controls.indexOf(button);
    const fallback = controls[index + 1] ?? controls[index - 1];
    onToggle();
    if (!focused) return;
    window.requestAnimationFrame(() => {
      if (button.isConnected) button.focus();
      else if (fallback?.isConnected) fallback.focus();
    });
  };

  return (
    <button
      aria-label={`${hidden ? "Show" : "Hide"} ${name}`}
      className={`sheet-edit-toggle print-excluded${className ? ` ${className}` : ""}`}
      data-hidden={hidden || undefined}
      draggable={false}
      ref={buttonRef}
      style={style}
      title={`${hidden ? "Show" : "Hide"} ${name}`}
      type="button"
      onClick={toggle}
      onContextMenu={(event: ReactMouseEvent) => {
        // Handled here so a row's own right-click does not toggle it twice.
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
    >
      <Icon name={hidden ? "eye-off" : "eye"} />
    </button>
  );
}

/**
 * An Edit-mode overlay over one sheet card (D099). It never changes what it
 * covers: it is absolutely positioned by its container's CSS, screen-only,
 * and never inside measured probe copies. A visible eye toggle
 * (`SheetEditToggle`) sits at the card's corner as a sibling of the overlay
 * in the same grid area, so pressing it can never start a drag; like the
 * legacy builder's card "Hide", a right-click on the card is a shortcut for
 * the same toggle (owner, 2026-11-06: no feature only behind right-click).
 * A plain click on the card does nothing; pressing and dragging the overlay
 * onto another moves the card there (`drag`, mouse only: no keyboard or
 * touch equivalent yet).
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
  /** What the overlay covers, for its toggle's name ("Hide Arc Strike"). */
  readonly name: string;
  /** Hidden from print, still shown dimmed in Edit mode. */
  readonly hidden?: boolean;
  readonly onToggle: () => void;
  readonly drag?: SheetEditDrag;
  /** Identifies what the overlay covers (`data-key`). */
  readonly dataKey?: string;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <div
        className={`sheet-edit-target ${className}`}
        data-dragging={drag?.dragging || undefined}
        data-drop={drag?.dropEdge}
        data-hidden={hidden || undefined}
        data-key={dataKey}
        data-name={name}
        draggable={drag === undefined ? undefined : true}
        style={style}
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
          onToggle();
        }}
      >
        {children}
      </div>
      <SheetEditToggle
        className="sheet-card-toggle"
        hidden={hidden}
        name={name}
        onToggle={onToggle}
        {...(style === undefined ? {} : { style })}
      />
    </>
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
