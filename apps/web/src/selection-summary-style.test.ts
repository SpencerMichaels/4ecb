import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  expect(start, `missing CSS rule ${selector}`).toBeGreaterThanOrEqual(0);
  const end = styles.indexOf("}", start);
  return styles.slice(start, end + 1);
}

describe("selection-summary detail-header styling", () => {
  it("shares the production card header borders, rhythm, and typography", () => {
    const card = rule(".candidate-detail");
    const tonedCard = rule('.candidate-detail[class*="tone-"]');
    const tonedHeader = rule('.candidate-detail[class*="tone-"] > header');
    const chip = rule(".selection-summary-item");
    const name = rule(".selection-summary-name");

    expect(card).toContain(
      "border-inline: var(--detail-card-header-border-inline)",
    );
    expect(tonedCard).toContain(
      "border-block-start: var(--detail-card-header-border-block-start-width)",
    );
    expect(tonedHeader).toContain(
      "border-block-end: var(--detail-card-header-border-block-end-width)",
    );
    expect(tonedHeader).toContain("padding: var(--detail-card-header-padding)");
    expect(chip).toContain(
      "border-inline: var(--detail-card-header-border-inline)",
    );
    expect(chip).toContain(
      "--detail-card-header-compact-border-block-start-width",
    );
    expect(chip).toContain(
      "border-block-end: var(--detail-card-header-border-block-end-width)",
    );
    expect(chip.match(/var\(--tone\)/gu)).toHaveLength(2);
    expect(chip).toContain(
      "line-height: var(--detail-card-header-line-height)",
    );
    expect(name).toContain("font-weight: 700");
    expect(name).toContain("text-decoration: none");
  });

  it("centers both icon families and preserves visible hover and focus states", () => {
    const icon = rule(".selection-summary-icon");
    const iconGlyphs = rule(
      ".selection-summary-icon > .icon,\n.selection-summary-icon > .action-type-icon",
    );
    const actionGlyph = rule(
      ".selection-summary-icon > .action-type-icon > span",
    );
    const interactiveName = rule(
      ".selection-summary-name:hover,\n.selection-summary-name:focus-visible",
    );

    expect(icon).toContain("align-items: center");
    expect(icon).toContain("align-self: center");
    expect(iconGlyphs).toContain("align-items: center");
    expect(iconGlyphs).toContain("align-self: center");
    expect(iconGlyphs).toContain(
      "height: var(--detail-card-header-compact-icon-size)",
    );
    expect(actionGlyph).toContain("font-size: 0.7rem");
    expect(actionGlyph).toContain("inset-block-start: 0.04rem");
    expect(actionGlyph).toContain("line-height: 1");
    expect(actionGlyph).toContain("position: relative");
    expect(interactiveName).toContain("text-decoration: underline");
    expect(styles).toMatch(
      /button:focus-visible,[\s\S]*?outline: 3px solid var\(--focus\)/,
    );
  });
});
