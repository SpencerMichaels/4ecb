import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

describe("Unavailable label styles", () => {
  it("leaves no rule for the old bare reason text", () => {
    expect(appStyles).not.toMatch(/\.selection-table-scroll td small\s*\{/);
    expect(appStyles).not.toMatch(
      /\.compact-choice-options > button small\s*\{/,
    );
    expect(appStyles).toMatch(/\.unavailable-note\s*\{[^}]*display: flex/);
    expect(appStyles).toMatch(
      /\.candidate-unavailable\s*\{[^}]*background: var\(--warning-soft\)[^}]*color: var\(--warning\)/,
    );
  });
});
