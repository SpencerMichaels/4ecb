import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionTypeIcon } from "./ActionTypeIcon";

describe("ActionTypeIcon", () => {
  it("renders octagon-minus for interrupts while preserving the authored label", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Immediate Interrupt" }),
    );

    expect(markup).toContain('aria-label="Immediate Interrupt"');
    expect(markup).toContain('title="Immediate Interrupt"');
    expect(markup).toContain("lucide-octagon-minus");
    expect(markup).not.toContain("↯");
  });

  it("renders no element for missing or blank action types", () => {
    for (const value of [undefined, "", " \t\n "]) {
      const markup = renderToStaticMarkup(
        createElement(ActionTypeIcon, { value }),
      );
      expect(markup).toBe("");
    }
  });

  it("presents authored No Action like Free Action", () => {
    for (const value of ["No Action", "Free Action"]) {
      const markup = renderToStaticMarkup(
        createElement(ActionTypeIcon, { value }),
      );
      expect(markup).toContain(`<span aria-hidden="true">○</span>`);
      expect(markup).toContain(`aria-label="${value}"`);
      expect(markup).toContain(`title="${value}"`);
    }
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
