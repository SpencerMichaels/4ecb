import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

// The Deity table's optional Domains column (D042 amendment): shown only
// where the table has room, by a container query on the table itself.
describe("Deity table Domains column CSS", () => {
  const css = appStyles.replace(/\s+/g, " ");

  it("makes the deity table its own inline-size container", () => {
    expect(css).toContain(
      ".candidate-selection-deity { container: candidate-table / inline-size; }",
    );
  });

  it("collapses optional columns to no width when the table is narrow, never removing them", () => {
    const at = css.indexOf("@container candidate-table (max-width: 40rem) {");
    expect(at).toBeGreaterThanOrEqual(0);
    const block = css.slice(at, css.indexOf("} }", at) + 3);
    expect(block).toContain(
      ".candidate-selection-table .selection-table-scroll .selection-col-optional { padding-inline: 0; width: 0; }",
    );
    expect(block).toContain(
      ".candidate-selection-table .selection-table-scroll .selection-col-optional > * { display: none; }",
    );
    // The cells themselves stay, so the bands' colspan matches the columns.
    expect(css).not.toMatch(/\.selection-col-optional \{[^}]*display: none/);
    // Narrow beats the wide width (same or higher specificity, later).
    expect(
      css.indexOf(".selection-col-domains { width: 10rem; }"),
    ).toBeLessThan(at);
  });

  it("uses no media query for the column", () => {
    expect(css).not.toMatch(/@media[^{]*\{[^@]*selection-col-optional/);
  });
});
