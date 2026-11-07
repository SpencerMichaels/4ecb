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

describe("library brand mark", () => {
  it("uses the app icon, not a text mark", async () => {
    const { readFileSync } = await import("node:fs");
    const library = readFileSync(
      new URL("./CharacterLibraryPage.tsx", import.meta.url),
      "utf8",
    );
    expect(library).toMatch(
      /<img\s+className="app-brand-mark"\s+src=\{`\$\{import\.meta\.env\.BASE_URL\}icon\.svg`\}/,
    );
    expect(library).not.toMatch(/app-brand-mark[^>]*>\s*4E/);
    expect(appStyles).toMatch(/\.app-brand-mark \{[^}]*inline-size: 2\.25rem;/);
  });
});
