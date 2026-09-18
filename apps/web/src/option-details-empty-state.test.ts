import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const characterEditor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("empty option details card", () => {
  it("uses one neutral card header and the click-to-inspect guidance", () => {
    const emptyState = characterEditor.slice(
      characterEditor.indexOf('aria-labelledby="option-details-heading"'),
      characterEditor.indexOf("const referenceIndex = candidateReferenceIndex"),
    );

    expect(emptyState).toContain(
      'className="candidate-detail candidate-detail-empty tone-neutral"',
    );
    expect(emptyState).toContain(
      '<h4 id="option-details-heading">Option Details</h4>',
    );
    expect(emptyState).toContain("<p>Click an option to inspect it here</p>");
    expect(emptyState.match(/<header>/g)).toHaveLength(1);
    expect(emptyState).not.toContain('className="eyebrow"');
    expect(emptyState).not.toContain("keyboard or pointer");
  });

  it("keeps comfortable body spacing beneath the shared card header", () => {
    expect(styles).toMatch(
      /\.candidate-detail-empty > p\s*\{[^}]*line-height: 1\.5[^}]*margin-bottom: 0/,
    );
  });
});
