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
  it("indents the free-ritual lines under their heading", () => {
    expect(declarations(".rituals-allowance-count")).toContain(
      "padding-inline-start: 1rem",
    );
  });

  it("mutes the free-ritual provider and the Learn-free dialog's detail", () => {
    expect(
      declarations(
        ".ritual-allowance-option-detail, .rituals-allowance-source",
      ),
    ).toContain("color: var(--muted)");
  });

  it("hangs a dialog option's text beside its radio, in a dialog wide enough for a psion's options", () => {
    const choice = declarations(".dialog-choice");
    expect(choice).toContain("display: grid");
    expect(choice).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(declarations(".ritual-allowance-dialog")).toContain(
      "width: min(34rem, calc(100vw - 2rem))",
    );
  });

  it("sizes the Inventory's known-group counts like their titles", () => {
    // Known groups share the item categories' label: the count inherits
    // the title's size, not the small generic count.
    expect(
      declarations(
        ".inventory-table .inventory-category-row .table-section-count",
      ),
    ).toContain("font-size: inherit");
  });

  it("sets the Inventory's no-items line in muted italics", () => {
    const empty = declarations(".inventory-table .inventory-empty-row td");
    expect(empty).toContain("font-style: italic");
    expect(empty).toContain("color: var(--muted)");
  });

  it("prints an item set card in the item card's orange", () => {
    expect(declarations(".print-item-card")).toContain("--card-color: #ff8c00");
  });

  it("gives builder panel cards the softened power tones and printed cards the vivid ones (D124)", () => {
    expect(declarations(".print-power-card.usage-encounter")).toContain(
      "--card-color: #8b0000",
    );
    expect(
      declarations(".print-power-card.is-panel.usage-encounter"),
    ).toContain("--card-color: var(--power-encounter)");
    expect(declarations(".print-power-card.is-panel.utility-power")).toContain(
      "--card-color: var(--power-utility)",
    );
    expect(declarations(".print-item-card.is-panel")).toContain(
      "--card-color: var(--power-item)",
    );
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

  it("draws the library's selected row bar, square count tag and role placeholder", () => {
    expect(
      declarations(
        ".library-table tbody tr.selection-row-selected > td:first-child",
      ),
    ).toContain("box-shadow: inset 6px 0 var(--selected)");
    expect(declarations(".page-action-count")).toContain("border-radius: 2px");
    const wait = declarations(".library-detail-role-wait");
    expect(wait).toContain("width: 9rem");
    expect(wait).toContain("background: rgb(255 255 255 / 25%)");
    expect(declarations(".library-detail-portrait")).toContain(
      "--portrait-border-width: 3px",
    );
    expect(
      declarations(".character-portrait, .portrait-placeholder"),
    ).toContain(
      "border: var(--portrait-border-width, 2px) solid var(--border-strong)",
    );
  });

  it("moves the library pane's actions to its right side once the pane is stacked and wide", () => {
    expect(declarations(".library-detail")).toContain(
      "container: library-detail / inline-size",
    );
    const wide = appStyles
      .replace(/\s+/g, " ")
      .match(
        /@container library-detail \(min-width: 36rem\) \{(.*?\}.*?\})\s*\}/,
      )?.[1];
    expect(wide).toContain("grid-template-columns: minmax(0, 1fr) 16.5rem");
    expect(wide).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });

  it("puts a familiar card's HP and Speed tiles on one row, Speed three times wider", () => {
    // Must outrank `.print-card-body > div:not(…):not(…)` (0,3,1), which
    // flows a card body's direct divs inline and would stack the tiles.
    const row = declarations(
      ".print-familiar-card .print-card-body > div.print-familiar-row",
    );
    expect(row).toContain("display: grid");
    expect(row).toContain("grid-template-columns: 1fr 3fr");
    expect(
      declarations(
        ".print-familiar-card .print-card-body > div.print-familiar-row::after",
      ),
    ).toContain("content: none");
  });

  it("puts a creature card's defense and hit point tiles on one row", () => {
    const row = declarations(
      ".print-creature-card .print-card-body > div.print-creature-vitals",
    );
    expect(row).toContain("display: grid");
    expect(row).toContain("grid-template-columns: 2fr 1fr");
    expect(
      declarations(
        ".print-creature-card .print-card-body > div.print-creature-vitals::after",
      ),
    ).toContain("content: none");
  });

  it("sets each paragraph of a familiar or beast section on its own line", () => {
    // Outranks `.print-card-body .prose-blocks, … .prose-paragraph` (0,2,0),
    // whose inline flow ran the Cat's two benefits together.
    expect(
      declarations(
        ".print-familiar-card .print-familiar-section .prose-blocks",
      ),
    ).toContain("display: grid");
    expect(
      declarations(
        ".print-familiar-card .print-familiar-section .prose-paragraph",
      ),
    ).toContain("display: block");
  });

  it("sizes a familiar card's notes and tiles from its body text size", () => {
    expect(declarations(".print-familiar-card .print-play-note")).toContain(
      "font-size: var(--print-card-body-size, 8pt)",
    );
    expect(
      declarations(".print-familiar-card .print-play-body .stat-group"),
    ).toContain("font-size: calc(var(--print-card-body-size, 8pt) * 0.75)");
  });

  it("tints panel cards' stat tiles over the dark card paper in dark theme", () => {
    for (const root of [
      ':root[data-theme="dark"]',
      ":root:not([data-theme])",
    ]) {
      const group = declarations(
        `${root} .print-reference-card.is-panel .stat-group`,
      );
      expect(group).toContain(
        "--stat-tint: color-mix(in srgb, var(--stat-hue) 24%, var(--card-paper))",
      );
      expect(group).toContain(
        "--stat-edge: color-mix(in srgb, var(--stat-hue) 60%, var(--card-paper))",
      );
      expect(
        declarations(`${root} .print-reference-card.is-panel .stat-tile dd`),
      ).toContain("color: var(--card-ink)");
    }
  });

  it("tones dark-theme panel card fills to D124's chroma cap under white titles", () => {
    for (const root of [
      ':root[data-theme="dark"]',
      ":root:not([data-theme])",
    ]) {
      for (const [selector, color] of [
        [".print-reference-card.is-panel", "#2d6644"],
        [".print-power-card.is-panel.usage-encounter", "#853c3b"],
        [".print-power-card.is-panel.usage-daily", "#6b7280"],
        [".print-power-card.is-panel.usage-feature", "#74538f"],
        [".print-power-card.is-panel.utility-power", "#40518d"],
        [".print-item-card.is-panel", "#a06b31"],
      ] as const)
        expect(declarations(`${root} ${selector}`)).toContain(
          `--card-color: ${color}`,
        );
      expect(
        declarations(
          `${root} .print-item-card.is-panel > header, ${root} .print-item-card.is-panel .print-card-type`,
        ),
      ).toContain("color: #fff");
    }
  });

  it("sizes the Party pieces box about five characters wide beside its label", () => {
    expect(declarations(".item-set-party-pieces input")).toContain(
      "width: 5em",
    );
    expect(declarations(".item-set-party-pieces label")).toContain(
      "display: flex",
    );
    expect(declarations(".item-set-party-pieces-hint")).toContain(
      "color: var(--muted)",
    );
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

  it("insets panel item stat rows like the panel's other bands", () => {
    const band = declarations(
      ".print-reference-card.is-panel .print-card-keyword-band, .print-reference-card.is-panel .print-card-action-band > span, .print-reference-card.is-panel .print-card-combat-band:not(.is-secondary) > div",
    );
    expect(band).toContain("padding: 0.25rem 0.55rem");
    expect(
      declarations(".print-reference-card.is-panel .print-item-stat-row"),
    ).toContain("padding: 0.25rem 0.55rem");
  });
});
