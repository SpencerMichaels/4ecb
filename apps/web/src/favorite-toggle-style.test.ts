import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

const styles = appStyles;

describe("favorite toggle styling", () => {
  it("does not underline the card's favorite star on hover", () => {
    const hoverRule = styles.match(
      /:is\(\.print-reference-card, \.reference-card-title\)\s*\.card-favorite-toggle:not\(:disabled\):hover\s*\{([^}]*)\}/,
    )?.[1];

    expect(hoverRule).toContain("box-shadow: none");
  });

  it("tints favorite rows in the selection tables", () => {
    expect(styles).toMatch(
      /\.selection-table-scroll tbody tr\.selection-row-favorite\s*\{[^}]*background:/,
    );
  });
});
