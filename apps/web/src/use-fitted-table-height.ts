import { useLayoutEffect, type RefObject } from "react";

/** Shorter windows keep the tables' own height. */
const TALL_LAYOUT = "(min-height: 30rem)";
const BOTTOM_GAP_PX = 16;
const MIN_HEIGHT_PX = 256;

/**
 * Sizes a builder tab's tables to the view: the first table ends at the
 * bottom of the container when it is its own scroller, or of the window when
 * the page scrolls (either scrolled to the top), and any later tables in the
 * tab use that same height. Published as `--fitted-table-height` on the
 * container for the stylesheet to apply. The level page's selection tables
 * use it, and so do the Inventory and Shop tables (`.equipment-table-scroll`
 * in `.equipment-primary`).
 */
export function useFittedTableHeight(
  container: RefObject<HTMLElement | null>,
  tableSelector = ".selection-table-scroll",
): void {
  useLayoutEffect(() => {
    const element = container.current;
    // Nothing to fit without layout (a test DOM has no matchMedia).
    if (
      element === null ||
      typeof window.matchMedia !== "function" ||
      typeof ResizeObserver === "undefined"
    )
      return;
    const tall = window.matchMedia(TALL_LAYOUT);
    // The table stacks above its detail pane when the tab is narrow
    // (a container query, 14-responsive.css); then tables keep their own
    // height. The stylesheet flags the side-by-side layout.
    const split = () =>
      getComputedStyle(element).getPropertyValue("--builder-split").trim() ===
      "1";
    const fit = () => {
      const first = element.querySelector<HTMLElement>(tableSelector);
      if (!tall.matches || !split() || first === null) {
        element.style.removeProperty("--fitted-table-height");
        return;
      }
      // When the level page is its own scroller (the viewport-pinned
      // builder), fit to its bottom; otherwise fit to the window's. Measure
      // from the scroller's top so scrolling never changes the result.
      const style = getComputedStyle(element);
      const scrolls = style.overflowY === "auto";
      const firstRect = first.getBoundingClientRect();
      // Leave room for what trails the table inside its own block (its pager,
      // the panel's padding and border): the block is the outermost ancestor
      // holding no other table. A lone table's block is the whole tab, so the
      // page itself never scrolls; with several, the first block just fits.
      let block: HTMLElement = first;
      while (
        block.parentElement !== null &&
        block.parentElement !== element &&
        block.parentElement.querySelectorAll(tableSelector).length === 1
      )
        block = block.parentElement;
      const below =
        block.getBoundingClientRect().bottom -
        firstRect.bottom +
        (block === element.lastElementChild
          ? parseFloat(getComputedStyle(block).marginBottom)
          : 0);
      const height = Math.max(
        MIN_HEIGHT_PX,
        Math.floor(
          scrolls
            ? element.clientHeight -
                (firstRect.top -
                  element.getBoundingClientRect().top +
                  element.scrollTop) -
                parseFloat(style.paddingBottom) -
                below
            : window.innerHeight -
                (firstRect.top + window.scrollY) -
                BOTTOM_GAP_PX,
        ),
      );
      element.style.setProperty("--fitted-table-height", `${height}px`);
    };
    // Refit when the page resizes or anything inside it does (a heading or
    // the filters panel appearing, sections expanding, a pager): the pinned
    // page keeps its own size, so watching it alone misses those. Applying
    // the fit resizes the content once more and then settles.
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    window.addEventListener("resize", fit);
    tall.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      tall.removeEventListener("change", fit);
    };
  });
}
