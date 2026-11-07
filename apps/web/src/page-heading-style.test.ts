import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

describe("page heading layout", () => {
  it("keeps the close control beside the title at every width", () => {
    // The heading is a single flex row; the title block shrinks and wraps.
    expect(appStyles).toMatch(
      /\.page-heading \{[^}]*display: flex;[^}]*justify-content: space-between;/,
    );
    expect(appStyles).toMatch(
      /\.page-heading > :first-child \{[^}]*min-width: 0;/,
    );
    // No narrow-screen rule turns it into a stacking grid.
    expect(appStyles).not.toMatch(/\.page-heading \{[^}]*display: grid;/);
  });
});
