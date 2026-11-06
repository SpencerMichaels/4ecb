import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

/** Every rule as [selectors (comments dropped, whitespace squashed), body]. */
const rules = [...appStyles.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(
  ([, selector, body]) =>
    [
      selector!
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Commas outside parentheses: `:is(th, td)` stays one selector.
        .split(/,(?![^(]*\))/)
        .map((part) => part.replace(/\s+/g, " ").trim()),
      body!,
    ] as const,
);
const ruleIndex = (selector: string) =>
  rules.findIndex(([selectors]) => selectors.includes(selector));

const TABLES = [
  ".selection-table-scroll", // candidate tables and the library
  ".equipment-table-scroll", // Inventory and Shop
  ".retraining-levels",
];

describe("table row stripes", () => {
  it("are one shared rule for every builder and library table", () => {
    const base = rules[ruleIndex(".equipment-table-scroll tbody tr")];
    const stripe =
      rules[ruleIndex(".equipment-table-scroll tbody tr:nth-child(even)")];
    for (const table of TABLES) {
      expect(base?.[0]).toContain(`${table} tbody tr`);
      expect(stripe?.[0]).toContain(`${table} tbody tr:nth-child(even)`);
    }
    expect(base?.[0]).toContain(".build-overview-group > li");
    expect(stripe?.[0]).toContain(".build-overview-group > li.is-striped");
    expect(base?.[1]).toMatch(/background: var\(--surface\);/);
    expect(stripe?.[1]).toMatch(/background: var\(--surface-subtle\);/);
    // No builder or library table keeps a stripe rule of its own (sheet
    // and card tables are print surfaces, outside this rule).
    expect(
      rules.filter(([selectors]) =>
        selectors.some(
          (selector) =>
            TABLES.some((table) => selector.includes(table)) &&
            /tr:nth-child\((even|odd|2n)/.test(selector),
        ),
      ),
    ).toHaveLength(1);
  });

  it("let selected rows and the hover tint show over the stripes", () => {
    const stripe = ruleIndex(
      ".equipment-table-scroll tbody tr:nth-child(even)",
    );
    // Same specificity as the stripe, declared later: the selection wins.
    for (const selected of [
      ".shop-table tbody tr.is-selected",
      ".retraining-levels tbody tr.is-selected",
      ".selection-table-scroll tbody tr.selection-row-selected",
    ]) {
      const index = ruleIndex(selected);
      expect(index, selected).toBeGreaterThan(stripe);
      expect(rules[index]?.[1], selected).toMatch(/background: var\(--/);
    }
    // Hover tints the cells with a background-image, over either stripe.
    for (const hover of [
      ".equipment-table-scroll tbody tr.table-clickable-row:hover > :is(th, td)",
      ".retraining-levels tbody tr.table-clickable-row:hover > td",
      ".build-overview-row:hover",
    ])
      expect(
        rules.some(
          ([selectors, body]) =>
            selectors.includes(hover) && /background-image:/.test(body),
        ),
        hover,
      ).toBe(true);
  });
});
