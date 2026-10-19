import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionTypeIcon } from "./ActionTypeIcon";

describe("ActionTypeIcon", () => {
  it("renders trending-up for interrupts while preserving the authored label", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Immediate Interrupt" }),
    );

    expect(markup).toContain('aria-label="Immediate Interrupt"');
    expect(markup).toContain('title="Immediate Interrupt"');
    expect(markup).toContain("lucide-trending-up");
    expect(markup).not.toContain("↯");
  });

  it("gives Opportunity Action and Immediate Reaction distinct arrow icons", () => {
    const opportunity = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Opportunity Action" }),
    );
    expect(opportunity).toContain("lucide-redo-dot");
    expect(opportunity).not.toContain("↻");
    expect(opportunity).toContain('aria-label="Opportunity Action"');

    const reaction = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Immediate Reaction" }),
    );
    expect(reaction).toContain("lucide-redo-2");
    expect(reaction).not.toContain("↻");
    expect(reaction).not.toContain("lucide-redo-dot");
  });

  it("renders no element for missing or blank action types", () => {
    for (const value of [undefined, "", " \t\n "]) {
      const markup = renderToStaticMarkup(
        createElement(ActionTypeIcon, { value }),
      );
      expect(markup).toBe("");
    }
  });

  it("distinguishes No Action from Free Action", () => {
    const free = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Free Action" }),
    );
    expect(free).toContain("lucide-circle");
    expect(free).toContain('aria-label="Free Action"');

    const none = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "No Action" }),
    );
    expect(none).toContain("lucide-minus");
    expect(none).not.toContain("lucide-circle");
    expect(none).toContain('aria-label="No Action"');
    expect(none).toContain('title="No Action"');
  });

  it("draws the action symbols with Lucide icons rather than font glyphs", () => {
    for (const [value, icon] of [
      ["Standard Action", "lucide-circle"],
      ["Minor Action", "lucide-chart-pie"],
      ["Move Action", "lucide-chevron-right"],
      ["Free Action", "lucide-circle"],
    ] as const) {
      const markup = renderToStaticMarkup(
        createElement(ActionTypeIcon, { value }),
      );
      expect(markup).toContain(icon);
      expect(markup).not.toMatch(/[●◔≫○]/u);
    }
    // Standard is the free circle, filled by CSS.
    expect(
      renderToStaticMarkup(
        createElement(ActionTypeIcon, { value: "Standard Action" }),
      ),
    ).toContain("is-standard-action");
    expect(
      renderToStaticMarkup(
        createElement(ActionTypeIcon, { value: "Free Action" }),
      ),
    ).not.toContain("is-standard-action");
  });

  it("can render decoratively while retaining its hover title", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionTypeIcon, {
        decorative: true,
        value: "Standard Action",
      }),
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('title="Standard Action"');
    expect(markup).not.toContain("aria-label");
    expect(markup).toContain("is-standard-action");
  });
});
