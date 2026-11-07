import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const editor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);

describe("builder window title", () => {
  it("names the open character and restores the app title on leaving", () => {
    expect(editor).toMatch(
      /const windowTitle =\s*character === undefined\s*\? undefined\s*: characterDisplayName\(character\) \|\| "Unnamed character";/,
    );
    expect(editor).toMatch(
      /document\.title = windowTitle;\s*return \(\) => \{\s*document\.title = previous;/,
    );
  });
});
