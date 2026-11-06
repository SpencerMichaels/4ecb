import { useLayoutEffect, useRef } from "react";

import { markLineStarts } from "./line-starts";
import {
  preferredPrintCardTextSize,
  printCardFontSizes,
} from "./print-card-fit";

/**
 * Aligns the action/range and primary attack/target bands on one shared first
 * column, and marks the items that begin a wrapped line of every "·" list on
 * the card (secondary attack bands, item stat rows, DotLists) so they drop
 * their leading separator — at each fitted text size, before measuring.
 */
function layoutCardBands(element: HTMLElement) {
  // Restore intrinsic sizing before sharing the widest first cell. Never
  // measure the previously assigned width, which would prevent shrinking.
  element.style.removeProperty("--print-card-header-first-column");
  const firstHeaderCells = [
    // The movement technique's band at the card's foot has its own columns.
    element.querySelector<HTMLElement>(
      ".print-card-action-band:not(.print-card-technique-band) > span:first-child",
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
  markLineStarts(
    element.querySelectorAll(
      ".print-card-combat-band.is-secondary, .print-item-stat-row, .dot-list",
    ),
  );
}

/** Shrinks a fixed-size printed card's text until it fits. Fluid panel cards
 * (`fit: false`) keep their text size and only lay out their bands. `onFit`
 * hears whether a printed card fits at the minimum text size (a measuring
 * copy's report, D110). */
export function usePrintCardFit(fit = true, onFit?: (fits: boolean) => void) {
  const cardRef = useRef<HTMLElement>(null);
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;
  useLayoutEffect(() => {
    const element = cardRef.current;
    const body = element?.querySelector<HTMLElement>(".print-card-body");
    if (element === null || body === undefined || body === null) return;
    if (!fit) {
      const layout = () => {
        if (element.getClientRects().length > 0) layoutCardBands(element);
      };
      const observer = new ResizeObserver(layout);
      observer.observe(element);
      layout();
      return () => observer.disconnect();
    }
    const fitCard = () => {
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
        layoutCardBands(element);
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
      onFitRef.current?.(fits);
    };
    const observer = new ResizeObserver(fitCard);
    observer.observe(body);
    window.addEventListener("beforeprint", fitCard);
    fitCard();
    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", fitCard);
    };
  });
  return cardRef;
}
