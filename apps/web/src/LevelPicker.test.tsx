import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LevelPicker } from "./LevelPicker";

describe("LevelPicker", () => {
  it("shows the viewed level and its status on one collapsed button", () => {
    const markup = renderToStaticMarkup(
      createElement(LevelPicker, {
        tiers: [
          { id: "heroic", label: "Heroic", firstLevel: 1, lastLevel: 10 },
        ],
        entries: [
          { level: 7, status: "incomplete", statusLabel: "1 unresolved" },
        ],
        selectedLevel: 7,
        onSelect: () => undefined,
      }),
    );
    expect(markup).toContain("Level 7");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("level-rail-incomplete");
    expect(markup).toContain('title="Level 7: 1 unresolved"');
    // The tier grid only renders once opened.
    expect(markup).not.toContain('aria-label="Level plan"');
  });
});
