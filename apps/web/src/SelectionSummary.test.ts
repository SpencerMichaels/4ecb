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

  it("uses selected names for details and neighboring icons for location", () => {
    const markup = renderToStaticMarkup(
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

    expect(markup).toContain("Current selection");
    expect(markup).toContain('class="selection-summary-name"');
    expect(markup).toContain(">Cleave</button>");
    expect(markup).toContain(" and ");
    expect(markup).toContain("Reaping Strike</button>");
    expect(markup).toContain('aria-label="Locate Cleave in the table"');
    expect(markup).toContain('class="selection-summary-locate"');
    expect(markup).not.toContain("Locate</button>");
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
    expect(markup).toContain("No selection");
  });
});
