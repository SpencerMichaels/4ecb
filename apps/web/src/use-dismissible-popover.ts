import { useEffect, type RefObject } from "react";

/**
 * The behaviour shared by the app's small anchored popovers (ActionMenu, the
 * sheet's Pages menu): while open, focus moves to the first enabled control
 * matching `focusSelector`; Escape closes and returns focus to the trigger;
 * a pointer press outside `root`, or Tab moving focus out of it, closes.
 */
export function useDismissiblePopover({
  open,
  close,
  root,
  trigger,
  focusSelector,
}: {
  readonly open: boolean;
  readonly close: () => void;
  readonly root: RefObject<HTMLElement | null>;
  readonly trigger: RefObject<HTMLElement | null>;
  readonly focusSelector: string;
}) {
  useEffect(() => {
    if (!open) return;
    const container = root.current;
    container?.querySelector<HTMLElement>(focusSelector)?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (!container?.contains(event.target as Node)) close();
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      trigger.current?.focus();
    };
    const dismissOnFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !container?.contains(next)) close();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    container?.addEventListener("focusout", dismissOnFocusOut);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
      container?.removeEventListener("focusout", dismissOnFocusOut);
    };
  }, [open, close, root, trigger, focusSelector]);
}
