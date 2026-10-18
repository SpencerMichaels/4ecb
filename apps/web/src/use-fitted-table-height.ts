import { useLayoutEffect, type RefObject } from "react";

/** Below this width the level page stacks and tables keep their own height. */
const WIDE_LAYOUT = "(min-width: 60.01rem) and (min-height: 42rem)";
const BOTTOM_GAP_PX = 16;
const MIN_HEIGHT_PX = 256;

/**
 * Sizes the level page's selection tables to the window: the first table
 * ends at the bottom of the window (with the page scrolled to the top),
 * and any later tables in the tab use that same height. Published as
 * `--fitted-table-height` on the container for the stylesheet to apply.
 */
export function useFittedTableHeight(
  container: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const element = container.current;
    if (element === null) return;
    const wide = window.matchMedia(WIDE_LAYOUT);
    const fit = () => {
      const first = element.querySelector<HTMLElement>(
        ".selection-table-scroll",
      );
      if (!wide.matches || first === null) {
        element.style.removeProperty("--fitted-table-height");
        return;
      }
      // Measure from the document top so scrolling never changes the result.
      const top = first.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(
        MIN_HEIGHT_PX,
        Math.floor(window.innerHeight - top - BOTTOM_GAP_PX),
      );
      element.style.setProperty("--fitted-table-height", `${height}px`);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener("resize", fit);
    wide.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      wide.removeEventListener("change", fit);
    };
  });
}
