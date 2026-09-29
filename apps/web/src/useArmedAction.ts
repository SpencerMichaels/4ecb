import { useEffect, useState } from "react";

/**
 * Click-to-arm, click-again-to-confirm state for a single destructive
 * action button — replaces a native confirm() dialog. Only one id can be
 * armed at a time; clicking outside the armed trigger (an element carrying
 * `data-{triggerAttribute}="<id>"`) or pressing Escape disarms it.
 */
export function useArmedAction(triggerAttribute: string): {
  readonly isArmed: (id: string) => boolean;
  readonly arm: (id: string) => void;
  readonly disarm: () => void;
} {
  const [armedId, setArmedId] = useState<string>();
  const selector = `[data-${triggerAttribute}]`;

  useEffect(() => {
    if (armedId === undefined) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(selector)?.getAttribute(`data-${triggerAttribute}`) ===
          armedId
      )
        return;
      setArmedId(undefined);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setArmedId(undefined);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [armedId, selector, triggerAttribute]);

  return {
    isArmed: (id: string) => armedId === id,
    arm: (id: string) => setArmedId(id),
    disarm: () => setArmedId(undefined),
  };
}
