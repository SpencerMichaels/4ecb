// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { trailingContentHeight } from "./use-fitted-table-height";

/** Builds a DOM from markup and gives `data-top`/`data-bottom` elements a box. */
function layout(markup: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.append(container);
  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-bottom]",
  )) {
    const top = Number(element.dataset.top ?? 0);
    const bottom = Number(element.dataset.bottom);
    element.getBoundingClientRect = () =>
      ({
        top,
        bottom,
        height: bottom - top,
        width: 100,
        left: 0,
        right: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  return container;
}

const table = (container: HTMLElement, index = 0) =>
  container.querySelectorAll<HTMLElement>(".scroll")[index]!;

afterEach(() => {
  document.body.replaceChildren();
});

describe("trailingContentHeight", () => {
  it("leaves room for a pager that follows the scroller in the container (the Shop)", () => {
    const container = layout(`
      <div class="toolbar" data-top="0" data-bottom="40"></div>
      <div class="scroll" data-top="40" data-bottom="500"></div>
      <div class="pager" data-top="508" data-bottom="540"></div>
      <dialog></dialog>
    `);
    expect(trailingContentHeight(container, table(container), ".scroll")).toBe(
      40,
    );
  });

  it("counts the table's own block: its pager and padding (a selection table)", () => {
    const container = layout(`
      <section data-top="0" data-bottom="620">
        <div class="filters" data-top="0" data-bottom="60"></div>
        <div class="scroll" data-top="60" data-bottom="560"></div>
        <div class="pager" data-top="568" data-bottom="600"></div>
      </section>
    `);
    expect(trailingContentHeight(container, table(container), ".scroll")).toBe(
      60,
    );
  });

  it("adds the last content's bottom margin at the container's end", () => {
    const container = layout(`
      <div class="scroll" data-top="0" data-bottom="300"></div>
      <div class="pager" style="margin-bottom: 12px" data-top="300" data-bottom="330"></div>
    `);
    expect(trailingContentHeight(container, table(container), ".scroll")).toBe(
      42,
    );
  });

  it("stops at the next table, so with several only the first block fits", () => {
    const container = layout(`
      <div class="list">
        <div class="item" data-top="0" data-bottom="420">
          <div class="scroll" data-top="20" data-bottom="400"></div>
        </div>
        <h3 data-top="420" data-bottom="450"></h3>
        <div class="item" data-top="450" data-bottom="900">
          <div class="scroll" data-top="470" data-bottom="880"></div>
        </div>
        <div class="footer" data-top="900" data-bottom="1000"></div>
      </div>
      <div class="after" data-top="1000" data-bottom="1100"></div>
    `);
    expect(trailingContentHeight(container, table(container), ".scroll")).toBe(
      50,
    );
  });

  it("ignores content without a box (a closed dialog) and is zero when nothing follows", () => {
    const container = layout(`
      <div class="scroll" data-top="0" data-bottom="300"></div>
      <dialog></dialog>
    `);
    expect(trailingContentHeight(container, table(container), ".scroll")).toBe(
      0,
    );
  });
});
