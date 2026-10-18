import { useLayoutEffect, useRef } from "react";

import {
  preferredPrintCardTextSize,
  printCardFontSizes,
  wrappedRowStarts,
} from "./print-card-fit";

/** Shrinks a fixed-size printed card's text until it fits. Panel cards in the
 * builder are fluid and pass `enabled: false`. */
export function usePrintCardFit(enabled = true) {
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = cardRef.current;
    const body = element?.querySelector<HTMLElement>(".print-card-body");
    if (!enabled || element === null || body === undefined || body === null)
      return;
    const fit = () => {
      // Hidden print cards have no measurable geometry. ResizeObserver reruns
      // this when the preview or print media makes them visible.
      if (element.clientHeight === 0 || element.getClientRects().length === 0)
        return;
      const preferred = preferredPrintCardTextSize(
        getComputedStyle(element)
          .getPropertyValue("--preferred-print-card-text-size")
          .trim(),
      );
      element.style.setProperty("--print-card-text-size", `${preferred}pt`);
      let fits = false;
      for (const size of printCardFontSizes(preferred)) {
        element.style.setProperty("--print-card-body-size", `${size}pt`);
        element.classList.toggle("is-compact", size <= 7 && size > 6.5);
        element.classList.toggle("is-condensed", size <= 6.5);
        // Restore intrinsic sizing before sharing the widest first cell between
        // the action/range and primary attack/target rows. Never measure the
        // previously assigned width, which would prevent shrinking on refit.
        element.style.removeProperty("--print-card-header-first-column");
        const firstHeaderCells = [
          element.querySelector<HTMLElement>(
            ".print-card-action-band > span:first-child",
          ),
          element.querySelector<HTMLElement>(
            ".print-card-combat-band:not(.is-secondary) > div:first-child",
          ),
        ].filter((cell): cell is HTMLElement => cell !== null);
        if (firstHeaderCells.length > 0)
          element.style.setProperty(
            "--print-card-header-first-column",
            `${Math.max(...firstHeaderCells.map((cell) => cell.getBoundingClientRect().width))}px`,
          );
        for (const row of element.querySelectorAll<HTMLElement>(
          ".print-card-combat-band.is-secondary, .print-item-stat-row",
        )) {
          const cells = [...row.children];
          // Measure the natural layout with separators restored each time.
          cells.forEach((cell) => cell.classList.remove("starts-wrapped-row"));
          const starts = wrappedRowStarts(
            cells.map((cell) => cell.getBoundingClientRect().top),
          );
          cells.forEach((cell, index) =>
            cell.classList.toggle("starts-wrapped-row", starts[index] === true),
          );
        }
        if (
          body.clientHeight > 0 &&
          body.scrollHeight <= body.clientHeight + 1 &&
          body.scrollWidth <= body.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1 &&
          element.scrollWidth <= element.clientWidth + 1 &&
          [
            ...element.querySelectorAll<HTMLElement>(
              ".print-card-action-band > span, .print-card-combat-band > div",
            ),
          ].every((cell) => cell.scrollWidth <= cell.clientWidth + 1)
        ) {
          fits = true;
          break;
        }
      }
      element.dataset.fitOverflow = String(!fits);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    window.addEventListener("beforeprint", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", fit);
    };
  });
  return cardRef;
}
