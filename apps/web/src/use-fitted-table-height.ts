import { useLayoutEffect, type RefObject } from "react";

/** Below this width the level page stacks and tables keep their own height. */
const WIDE_LAYOUT = "(min-width: 60.01rem) and (min-height: 30rem)";
const BOTTOM_GAP_PX = 16;
const MIN_HEIGHT_PX = 256;

/**
 * Sizes the level page's selection tables to the view: the first table ends
 * at the bottom of the level page's scroller, or of the window when the page
 * scrolls (either scrolled to the top),
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
        block.parentElement.querySelectorAll(".selection-table-scroll")
          .length === 1
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
    wide.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      wide.removeEventListener("change", fit);
    };
  });
}
