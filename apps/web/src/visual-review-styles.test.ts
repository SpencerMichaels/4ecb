import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

/*
 * The CSS that decides former visual-review checklist items
 * (docs/visual-review-checklist.md): the facts the owner no longer checks by
 * eye. Text, order and numbers on the same surfaces are checked by
 * `pnpm review:verify` against the review characters.
 */

/** The declarations of the rule whose selector list is exactly `selector`
 *  (whitespace-insensitive). */
function declarations(selector: string): string {
  const squash = (value: string) => value.replace(/\s+/g, " ").trim();
  const wanted = squash(selector);
  for (const match of appStyles.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = squash(match[1]!.replace(/\/\*[\s\S]*?\*\//g, ""));
    if (selectors === wanted) return squash(match[2]!);
  }
  throw new Error(`No rule for ${selector}`);
}

describe("visual-review facts decided by CSS", () => {
  it("sets the Rituals tab's counter semi-bold under the free-ritual text", () => {
    expect(declarations(".rituals-allowance-count")).toContain(
      "font-weight: 600",
    );
  });

  it("mutes ritual source lines and the Learn-free dialog's detail", () => {
    expect(
      declarations(
        ".ritual-allowance-option-detail, .rituals-allowance-source, .rituals-known-source",
      ),
    ).toContain("color: var(--muted)");
  });

  it("sets the Known table's empty groups in muted italics", () => {
    const empty = declarations(".rituals-empty-row td");
    expect(empty).toContain("font-style: italic");
    expect(empty).toContain("color: var(--muted)");
  });

  it("prints an item set card in the item card's orange", () => {
    expect(declarations(".print-item-card")).toContain("--card-color: #ff8c00");
  });

  it("fades a set's locked benefits to 60% once the count is known", () => {
    expect(
      declarations(
        ".print-item-set-card:not(.is-count-unknown) .print-item-set-benefit:not(.is-active)",
      ),
    ).toContain("opacity: 0.6");
    expect(declarations(".print-item-set-note")).toContain(
      "font-style: italic",
    );
  });

  it("keeps a lone panel card at printed proportions and sizes stacked cards to content", () => {
    expect(declarations(".print-reference-card.is-panel")).toContain(
      "aspect-ratio: 2.47 / 3.405",
    );
    const stacked = [...appStyles.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
      ([, selector]) =>
        selector!.includes(".candidate-detail-stack:has(") &&
        selector!.includes(":nth-child(n + 2)"),
    );
    expect(stacked?.[2]).toContain("aspect-ratio: auto");
  });

  it("hides the Sections menu copies field's spin arrows", () => {
    expect(declarations(".sheet-sections-copies > input")).toContain(
      "appearance: textfield",
    );
    expect(
      declarations(
        ".sheet-sections-copies > input::-webkit-inner-spin-button, .sheet-sections-copies > input::-webkit-outer-spin-button",
      ),
    ).toContain("-webkit-appearance: none");
  });
});
