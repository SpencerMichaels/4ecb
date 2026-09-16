import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KeyAbilityMarker } from "./KeyAbilityMarker";

describe("key ability marker", () => {
  it("names the decorative key for assistive technology", () => {
    const markup = renderToStaticMarkup(createElement(KeyAbilityMarker));

    expect(markup).toContain('title="Key ability for the selected class"');
    expect(markup).toContain('class="visually-hidden"');
    expect(markup).toContain("Key ability for the selected class");
    expect(markup).toContain('aria-hidden="true"');
  });
});
