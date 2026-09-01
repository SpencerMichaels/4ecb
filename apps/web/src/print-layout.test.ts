import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const letterStyles = readFileSync(
  new URL("../public/print-letter.css", import.meta.url),
  "utf8",
);
const a4Styles = readFileSync(
  new URL("../public/print-a4.css", import.meta.url),
  "utf8",
);

describe("print layout contract", () => {
  it("defines Letter and A4 pages with a non-clipping three-column card grid", () => {
    expect(styles).toMatch(/@page\s*\{[\s\S]*?size:\s*letter/);
    expect(styles).toMatch(/@page\s+a4sheet\s*\{[\s\S]*?size:\s*A4/);
    expect(letterStyles).toMatch(/@page\s*\{[\s\S]*?size:\s*letter/);
    expect(a4Styles).toMatch(/@page\s*\{[\s\S]*?size:\s*A4/);
    expect(styles).toMatch(
      /@media\s+print[\s\S]*?\.paper-a4\s*\{[\s\S]*?page:\s*a4sheet/,
    );
    expect(styles).toMatch(
      /@media\s+print[\s\S]*?\.card-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/,
    );
    expect(styles).toMatch(/\.sheet-card\s*\{[\s\S]*?break-inside:\s*avoid/);
    expect(styles).not.toMatch(
      /@media\s+print[\s\S]*?\.sheet-card\s*\{[^}]*max-height:/,
    );
  });
});
