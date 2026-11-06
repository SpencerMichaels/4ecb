import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

describe("Unavailable label styles", () => {
  it("leaves no rule for a separate reason box or text", () => {
    expect(appStyles).not.toMatch(/\.selection-table-scroll td small\s*\{/);
    expect(appStyles).not.toMatch(
      /\.compact-choice-options > button small\s*\{/,
    );
    expect(appStyles).not.toMatch(/\.unavailable-note/);
    expect(appStyles).not.toMatch(/\.candidate-reason/);
    expect(appStyles).toMatch(
      /\.candidate-unavailable\s*\{[^}]*background: var\(--warning-soft\)[^}]*color: var\(--warning\)/,
    );
  });

  it("gives the illegal badge the danger tone, dark mode from tokens", () => {
    expect(appStyles).toMatch(
      /\.candidate-unavailable\.candidate-unavailable-illegal\s*\{[^}]*background: var\(--danger-soft\)[^}]*color: var\(--danger\)/,
    );
    // Both tokens are redefined for dark mode (the media query and the
    // explicit data-theme override), so the badge needs no dark rule.
    const darkBlocks = appStyles.match(
      /(?:prefers-color-scheme: dark|\[data-theme="dark"\])[\s\S]*?--danger-soft:\s*#[0-9a-f]+/gi,
    );
    expect(darkBlocks?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(appStyles).not.toMatch(
      /\.candidate-unavailable-(?:unavailable|unverified)\s*\{/,
    );
  });
});
