/**
 * The one shrink-to-fit mechanism for short text that should stay on one
 * line: the page-1 character name, and a companion card's speed and senses
 * (owner, 2026-11-06: "should shrink rather than wrap"). Inside a card,
 * `usePrintCardFit` fits every marked element at each fitted text size, in
 * print and in the builder pane.
 */

/** Marks an element whose text shrinks to stay on one line (`fitOneLineTexts`). */
export const ONE_LINE_FIT_CLASS = "one-line-fit";
/** Set when even the floor size does not fit, so the text may wrap. */
export const ONE_LINE_WRAPPED_CLASS = "is-wrapped";
/** Set instead of wrapping on an element with `data-fit-overflow="ellipsis"`. */
export const ONE_LINE_TRUNCATED_CLASS = "is-truncated";
/** The print floor for card text, 6pt, in CSS pixels. */
export const MIN_ONE_LINE_FIT_PX = 8;

const PX_PER_PT = 96 / 72;

/**
 * The floor named by an element's `data-fit-min` ("7pt", "9px", or "0.5em"
 * of its stylesheet size), else `fallback` pixels. Never above `preferred`.
 */
export function oneLineFitFloor(
  value: string | undefined,
  preferred: number,
  fallback = MIN_ONE_LINE_FIT_PX,
): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px|pt|em)\s*$/.exec(value ?? "");
  const amount = Number(match?.[1]);
  const floor =
    match === null
      ? fallback
      : match[2] === "pt"
        ? amount * PX_PER_PT
        : match[2] === "em"
          ? amount * preferred
          : amount;
  return Math.min(floor, preferred);
}

/**
 * The largest size, between `minimum` and `preferred`, whose measured width
 * fits `available` (a quarter-unit binary search); `minimum` when none does.
 */
export function fittingOneLineSize(
  measure: (size: number) => number,
  available: number,
  preferred: number,
  minimum: number,
): number {
  if (measure(preferred) <= available) return preferred;
  let low = minimum;
  let high = preferred;
  while (high - low > 0.25) {
    const size = (low + high) / 2;
    if (measure(size) <= available) low = size;
    else high = size;
  }
  return low;
}

/**
 * Shrinks one marked element's font, from its stylesheet size down to its
 * floor (`data-fit-min`, default the 6pt print floor), until its unwrapped
 * text fits its width. At the floor it wraps, or with
 * `data-fit-overflow="ellipsis"` truncates. Elements without layout are left
 * unchanged.
 */
export function fitOneLineText(element: HTMLElement): void {
  element.style.removeProperty("font-size");
  element.classList.remove(ONE_LINE_WRAPPED_CLASS, ONE_LINE_TRUNCATED_CLASS);
  if (element.getClientRects().length === 0) return;
  // Overflow, not width: a shrink-wrapped inline-block's own width changes
  // with its text, up to its max-width.
  const overflow = () => element.scrollWidth - element.clientWidth;
  const fits = () => overflow() <= 1;
  if (fits()) return;
  const preferred = Number.parseFloat(getComputedStyle(element).fontSize);
  if (!Number.isFinite(preferred)) return;
  const size = fittingOneLineSize(
    (size) => {
      element.style.fontSize = `${size}px`;
      return overflow();
    },
    1,
    preferred,
    oneLineFitFloor(element.dataset.fitMin, preferred),
  );
  element.style.fontSize = `${size}px`;
  if (!fits())
    element.classList.add(
      element.dataset.fitOverflow === "ellipsis"
        ? ONE_LINE_TRUNCATED_CLASS
        : ONE_LINE_WRAPPED_CLASS,
    );
}

/** Fits every marked element inside `root`. */
export function fitOneLineTexts(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>(
    `.${ONE_LINE_FIT_CLASS}`,
  ))
    fitOneLineText(element);
}
