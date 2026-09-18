import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("favorite toggle styling", () => {
  it("does not underline the add favorite button on hover", () => {
    const hoverRule = styles.match(
      /\.selection-table-scroll td \.selection-favorite-toggle:hover:not\(:disabled\)\s*\{([^}]*)\}/,
    )?.[1];

    expect(hoverRule).toContain("box-shadow: none");
    expect(hoverRule).toContain("text-decoration: none");
  });
});
