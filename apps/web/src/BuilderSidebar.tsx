import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Icon } from "./Icon";

/**
 * Below this width the character sidebar no longer fits beside the builder
 * workspace (D080): it collapses to a rail and opens as an overlay. The
 * stylesheet's `@media (max-width: 63rem)` block must use the same value.
 */
export const BUILDER_SIDEBAR_RAIL_QUERY = "(max-width: 63rem)";

function subscribeRail(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(BUILDER_SIDEBAR_RAIL_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function railLayout(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(BUILDER_SIDEBAR_RAIL_QUERY).matches
  );
}

/** A target inside a dialog (e.g. the portrait editor) handles its own Esc. */
function insideDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("dialog, [role='dialog'], [role='alertdialog']") !== null
  );
}

/**
 * The builder's character sidebar. Wide windows show it docked beside the
 * workspace. Narrow ones turn it into a drawer: parked off-screen to the
 * left with only its right-edge strip (a chevron button) showing, it slides
 * out over the workspace when the strip is clicked, the strip travelling
 * with it as its right edge. The open drawer is a non-modal disclosure, not
 * a dialog: the page behind it stays usable, and Esc, a click outside or
 * the strip closes it.
 */
export function BuilderSidebar({ children }: { readonly children: ReactNode }) {
  const rail = useSyncExternalStore(subscribeRail, railLayout, () => false);
  const [open, setOpen] = useState(false);
  const overlay = rail && open;
  const panelId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (overlay) panel.current?.focus({ preventScroll: true });
  }, [overlay]);

  // Widening the window docks the sidebar again; it reopens closed.
  useEffect(() => {
    if (!rail) setOpen(false);
  }, [rail]);

  useEffect(() => {
    if (!overlay) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (insideDialog(event.target)) return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    // A click outside closes the drawer and leaves focus where it lands.
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (frame.current?.contains(target) === true) return;
      if (insideDialog(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", closeWithEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeWithEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [overlay]);

  return (
    <div className="builder-sidebar-frame" ref={frame}>
      <div
        className={`builder-sidebar-drawer${overlay ? " builder-sidebar-drawer-open" : ""}`}
      >
        <aside
          aria-label="Character"
          className="builder-sidebar"
          id={panelId}
          ref={panel}
          tabIndex={-1}
        >
          {children}
        </aside>
        {/* The drawer's right edge: one full-height button with a chevron
            (">" closed, "<" open). CSS shows it only in the narrow layout,
            where it is always present. */}
        <button
          aria-controls={panelId}
          aria-expanded={overlay}
          aria-label="Character sidebar"
          className="builder-sidebar-rail"
          title={overlay ? "Hide character sidebar" : "Show character sidebar"}
          type="button"
          ref={toggle}
          onClick={() => {
            // Closing from the strip keeps focus on it (Safari doesn't
            // focus a clicked button on its own).
            if (overlay) toggle.current?.focus();
            setOpen(!overlay);
          }}
        >
          <Icon name="chevron" />
        </button>
      </div>
    </div>
  );
}
