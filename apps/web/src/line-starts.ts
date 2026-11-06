/**
 * The one mechanism for "·"-separated lists that may wrap (card type bars and
 * footers, item stat rows, secondary attack bands, stat lines, page-1
 * strips): each item but the first carries a leading separator, and an item
 * that begins a new line gets `LINE_START_CLASS`, whose CSS hides it — the
 * line break is the separator (owner 2026-11-05).
 */
export const LINE_START_CLASS = "starts-wrapped-row";

/** The vertical extent of one line fragment of an item. */
export interface LineBox {
  readonly top: number;
  readonly bottom: number;
}

/** An item's first and last line fragments (equal for an unwrapped item). */
export interface ItemLines {
  readonly first: LineBox;
  readonly last: LineBox;
}

/** An item starts a line when its first fragment lies below the middle of
 * the previous item's last fragment; mixed font sizes on one line (a bold
 * label, a smaller value) never count as a new line. */
export function lineStartFlags(
  items: readonly ItemLines[],
): readonly boolean[] {
  return items.map((item, index) => {
    const previous = items[index - 1]?.last;
    return (
      previous !== undefined &&
      item.first.top >= (previous.top + previous.bottom) / 2
    );
  });
}

function itemLines(item: Element): ItemLines | undefined {
  const rects = item.getClientRects();
  const first = rects[0];
  const last = rects[rects.length - 1];
  return first === undefined || last === undefined
    ? undefined
    : { first, last };
}

/** Passes allowed for a hidden separator letting a later item move up a
 * line (and then need its own mark changed). */
const MAX_PASSES = 3;

/**
 * Marks the children of each list that begin a line. All lists are measured
 * before any is changed, so a whole card or page costs one layout per pass.
 * Lists without layout (display: none) are left unchanged.
 */
export function markLineStarts(lists: Iterable<Element>): void {
  const rows = [...lists]
    .filter((list) => list.getClientRects().length > 0)
    .map((list) => [...list.children]);
  if (rows.length === 0) return;
  // Measure the natural layout with every separator shown.
  for (const cells of rows)
    for (const cell of cells) cell.classList.remove(LINE_START_CLASS);
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const flags = rows.map((cells) => {
      const lines = cells.map(itemLines);
      return lines.every((line) => line !== undefined)
        ? lineStartFlags(lines as ItemLines[])
        : undefined;
    });
    let changed = false;
    rows.forEach((cells, row) => {
      const rowFlags = flags[row];
      if (rowFlags === undefined) return;
      cells.forEach((cell, index) => {
        const starts = rowFlags[index] === true;
        if (cell.classList.contains(LINE_START_CLASS) === starts) return;
        cell.classList.toggle(LINE_START_CLASS, starts);
        changed = true;
      });
    });
    if (!changed) return;
  }
}

/* Lists outside a fitted card (and panel cards) re-mark themselves through
   one shared observer, so every list that changed size in a frame is
   measured together, and once more before printing. */
const observed = new Set<Element>();
let observer: ResizeObserver | undefined;

function markAll() {
  markLineStarts(observed);
}

/** Keeps `list`'s line-start marks current; returns the cleanup. */
export function observeLineStarts(list: Element): () => void {
  if (typeof ResizeObserver === "undefined") {
    markLineStarts([list]);
    return () => undefined;
  }
  if (observer === undefined) {
    observer = new ResizeObserver((entries) =>
      markLineStarts(entries.map((entry) => entry.target)),
    );
    window.addEventListener("beforeprint", markAll);
    window.addEventListener("afterprint", markAll);
  }
  observed.add(list);
  observer.observe(list);
  return () => {
    observed.delete(list);
    observer?.unobserve(list);
  };
}
