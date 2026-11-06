import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

// The selected holding's action buttons above its detail card: a toggle
// that is on shows it by more than color (a check), an inert one is muted.
describe("Item detail action buttons CSS", () => {
  const css = appStyles.replace(/\s+/g, " ");

  it("wraps the buttons in a row above the card", () => {
    expect(css).toMatch(/\.item-detail-actions \{[^}]*flex-wrap: wrap;/);
  });

  it("marks a toggle that is on with a check and an inert action as muted", () => {
    expect(css).toContain(
      '.item-detail-actions button[aria-pressed="true"]::before { content: "\\2713\\00a0"; }',
    );
    expect(css).toContain(
      '.item-detail-actions button[aria-disabled="true"] { color: var(--muted); }',
    );
  });
});
