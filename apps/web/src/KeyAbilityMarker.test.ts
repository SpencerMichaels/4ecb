import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  KeyAbilitiesSummary,
  KeyAbilityMarker,
  KeyAbilityName,
} from "./KeyAbilityMarker";

describe("key ability marker", () => {
  it("names the decorative key for assistive technology", () => {
    const markup = renderToStaticMarkup(createElement(KeyAbilityMarker));

    expect(markup).toContain('title="Key ability for the selected class"');
    expect(markup).toContain('class="visually-hidden"');
    expect(markup).toContain("Key ability for the selected class");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("lucide-key-round");
    expect(markup).not.toMatch(/[🔑🗝️]/u);
  });

  it("places the key immediately after the ability name", () => {
    const markup = renderToStaticMarkup(
      createElement(KeyAbilityName, { marked: true }, "Wisdom"),
    );

    expect(markup).toMatch(
      /class="key-ability-name"><span>Wisdom<\/span><span class="key-ability-marker"/,
    );
  });

  it("shares the class key-ability sentence presentation", () => {
    const sentence = "A Fighter's key abilities are Strength and Dexterity.";
    const markup = renderToStaticMarkup(
      createElement(KeyAbilitiesSummary, { sentence }),
    );

    expect(markup).toBe(
      '<p class="field-help class-key-abilities">A Fighter&#x27;s key abilities are Strength and Dexterity.</p>',
    );
    expect(renderToStaticMarkup(createElement(KeyAbilitiesSummary, {}))).toBe(
      "",
    );
  });
});
