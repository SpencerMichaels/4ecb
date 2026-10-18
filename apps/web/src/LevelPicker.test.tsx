import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LevelPicker } from "./LevelPicker";

describe("LevelPicker", () => {
  it("renders the Level heading as its trigger until opened", () => {
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
    // The "Level N" heading is the trigger; the plan opens as a modal.
    expect(markup).toContain('<h3 class="level-picker-heading">');
    expect(markup).toContain("<span>Level 7</span>");
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-label="Level 7, change level"');
    expect(markup).not.toContain("<dialog");
  });
});
