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

  it("gives Opportunity Action its own arrow icon, distinct from reactions", () => {
    const opportunity = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Opportunity Action" }),
    );
    expect(opportunity).toContain("lucide-redo-dot");
    expect(opportunity).not.toContain("↻");
    expect(opportunity).toContain('aria-label="Opportunity Action"');

    const reaction = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Immediate Reaction" }),
    );
    expect(reaction).toContain("↻");
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
    expect(free).toContain(`<span aria-hidden="true">○</span>`);
    expect(free).toContain('aria-label="Free Action"');

    const none = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "No Action" }),
    );
    expect(none).toContain("lucide-minus");
    expect(none).not.toContain("○");
    expect(none).toContain('aria-label="No Action"');
    expect(none).toContain('title="No Action"');
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
    expect(markup).toContain("●");
  });
});
