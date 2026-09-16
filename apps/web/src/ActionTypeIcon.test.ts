import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionTypeIcon } from "./ActionTypeIcon";

describe("ActionTypeIcon", () => {
  it("renders the Unicode symbol while preserving the exact authored label", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: "Immediate Interrupt" }),
    );

    expect(markup).toContain('aria-label="Immediate Interrupt"');
    expect(markup).toContain('title="Immediate Interrupt"');
    expect(markup).toContain('<span aria-hidden="true">↯</span>');
    expect(markup).not.toContain("<svg");
  });

  it("labels an absent action type without exposing the fallback glyph", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionTypeIcon, { value: undefined }),
    );

    expect(markup).toContain('aria-label="Action not specified"');
    expect(markup).toContain('title="Action not specified"');
    expect(markup).toContain('<span aria-hidden="true">–</span>');
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
