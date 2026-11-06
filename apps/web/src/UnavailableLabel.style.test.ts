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
});
