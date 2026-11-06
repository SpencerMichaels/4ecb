// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DotList } from "./DotList";
import {
  LINE_START_CLASS,
  lineStartFlags,
  markLineStarts,
  type ItemLines,
} from "./line-starts";

const line = (top: number, height = 10): ItemLines => ({
  first: { top, bottom: top + height },
  last: { top, bottom: top + height },
});

/** Stubs each child's line fragments; `layout` sees the current marks. */
function list(
  count: number,
  layout: (marked: readonly boolean[]) => readonly ItemLines[],
): HTMLElement {
  const element = document.createElement("span");
  element.getClientRects = () =>
    [{ top: 0, bottom: 10 }] as unknown as DOMRectList;
  const cells = Array.from({ length: count }, () =>
    element.appendChild(document.createElement("span")),
  );
  cells.forEach((cell, index) => {
    cell.getClientRects = () => {
      const lines = layout(
        cells.map((value) => value.classList.contains(LINE_START_CLASS)),
      )[index]!;
      return [lines.first, lines.last] as unknown as DOMRectList;
    };
  });
  return element;
}

const marks = (element: Element) =>
  [...element.children].map((cell) =>
    cell.classList.contains(LINE_START_CLASS),
  );

describe("line starts of a separated list", () => {
  it("marks only the items that begin a later line", () => {
    expect(
      lineStartFlags([line(10), line(10), line(22), line(22), line(34)]),
    ).toEqual([false, false, true, false, true]);
    // A taller or offset item on the same line is not a new line.
    expect(lineStartFlags([line(10), line(12, 14), line(10.5)])).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("compares with the previous item's last line when it wraps itself", () => {
    const wrapped: ItemLines = {
      first: { top: 10, bottom: 20 },
      last: { top: 22, bottom: 32 },
    };
    // Continues on the wrapped item's second line, then starts a third.
    expect(lineStartFlags([wrapped, line(22), line(34)])).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("measures with separators restored and re-marks after one hides", () => {
    // "A · B" on line 1; "· C · D" wraps. Hiding C's separator lets D move
    // up beside it — still not a line start; nothing else changes.
    const element = list(4, (marked) =>
      marked[2]
        ? [line(0), line(0), line(12), line(12)]
        : [line(0), line(0), line(12), line(24)],
    );
    element.children[3]!.classList.add(LINE_START_CLASS);
    markLineStarts([element]);
    expect(marks(element)).toEqual([false, false, true, false]);
  });

  it("leaves a list without layout unchanged", () => {
    const element = list(2, () => [line(0), line(12)]);
    element.getClientRects = () => [] as unknown as DOMRectList;
    markLineStarts([element]);
    expect(marks(element)).toEqual([false, false]);
  });
});

describe("DotList", () => {
  it("renders spaced items without empty ones, and nothing when empty", () => {
    expect(
      renderToStaticMarkup(
        <DotList items={["Ranger", undefined, "", "Level 1"]} />,
      ),
    ).toBe(
      '<span class="dot-list"><span class="dot-list-item">Ranger</span> <span class="dot-list-item">Level 1</span></span>',
    );
    expect(renderToStaticMarkup(<DotList items={[undefined, ""]} />)).toBe("");
  });

  it("marks its line starts when mounted", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<DotList items={["A", "B"]} />));
    expect(container.querySelector(".dot-list")).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });
});
