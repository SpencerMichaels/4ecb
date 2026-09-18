import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectionSummary, selectionSummaryLabel } from "./SelectionSummary";

describe("SelectionSummary", () => {
  it("formats empty, single, and two-slot selection states", () => {
    expect(selectionSummaryLabel([])).toBe("No selection");
    expect(selectionSummaryLabel([{ id: "one", label: "Cleave" }])).toBe(
      "Selected: Cleave",
    );
    expect(selectionSummaryLabel([{ id: "one", label: "Cleave" }], 2)).toBe(
      "Selected: Cleave (1 of 2)",
    );
    expect(
      selectionSummaryLabel(
        [
          { id: "one", label: "Cleave" },
          { id: "two", label: "Reaping Strike" },
        ],
        2,
      ),
    ).toBe("Selected: Cleave and Reaping Strike");
  });

  it("uses a plural heading and visible conjunction spacing for two selections", () => {
    const twoSelectionMarkup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [
          { id: "one", label: "Cleave" },
          { id: "two", label: "Reaping Strike" },
        ],
        selectionLimit: 2,
        onInspect: () => undefined,
        onLocate: () => undefined,
      }),
    );

    expect(twoSelectionMarkup).toContain("Current selections");
    expect(twoSelectionMarkup).toContain("<span>and\u00a0</span>");
    expect(twoSelectionMarkup).toContain('class="selection-summary-name"');
    expect(twoSelectionMarkup).toContain(">Cleave</button>");
    expect(twoSelectionMarkup).toContain("Reaping Strike</button>");
    expect(twoSelectionMarkup).toContain(
      'aria-label="Locate Cleave in the table"',
    );
    expect(twoSelectionMarkup).toContain('class="selection-summary-locate"');
    expect(twoSelectionMarkup).not.toContain("Locate</button>");
  });

  it("retains the singular heading for one selection", () => {
    const markup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [{ id: "one", label: "Cleave" }],
        onInspect: () => undefined,
        onLocate: () => undefined,
      }),
    );

    expect(markup).toContain("Current selection");
    expect(markup).not.toContain("Current selections");
  });

  it("renders an attached neutral empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [],
        onInspect: () => undefined,
        onLocate: () => undefined,
      }),
    );

    expect(markup).toContain("selection-summary-empty");
    expect(markup).toContain("Current selection");
    expect(markup).not.toContain("Current selections");
    expect(markup).toContain("No selection");
  });

  it("does not render when its candidate table has no vertical overflow", () => {
    const markup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [{ id: "one", label: "Cleave" }],
        visible: false,
        onInspect: () => undefined,
        onLocate: () => undefined,
      }),
    );

    expect(markup).toBe("");
  });
});
