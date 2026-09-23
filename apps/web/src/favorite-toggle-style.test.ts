import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");

describe("favorite toggle styling", () => {
  it("does not underline the add favorite button on hover", () => {
    const hoverRule = styles.match(
      /\.selection-table-scroll td \.selection-favorite-toggle:hover:not\(:disabled\)\s*\{([^}]*)\}/,
    )?.[1];

    expect(hoverRule).toContain("box-shadow: none");
    expect(hoverRule).toContain("text-decoration: none");
  });
});
