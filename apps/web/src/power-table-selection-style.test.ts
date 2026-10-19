import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

const styles = appStyles;

function rule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  expect(start, `missing CSS rule ${selector}`).toBeGreaterThanOrEqual(0);
  const end = styles.indexOf("}", start);
  return styles.slice(start, end + 1);
}

describe("power candidate-table selection styling", () => {
  it("uses each power row's header tone without changing generic selection", () => {
    const genericSelection = rule(
      ".selection-table-scroll tbody tr.selection-row-selected",
    );
    const powerSelection = rule(
      ".candidate-selection-power\n  .selection-table-scroll\n  tbody\n  tr.selection-row-selected",
    );

    // Non-power rows take the blue accent tint of the choice cards (green
    // would read as an at-will power).
    expect(genericSelection).toContain("background: var(--selected-soft)");
    expect(powerSelection).toContain("background: var(--tone-soft)");
    expect(powerSelection).not.toContain("var(--success-soft)");
  });
});
