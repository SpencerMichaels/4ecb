import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = styles.match(
    new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`),
  )?.[1];

  expect(declarations).toBeDefined();
  return declarations ?? "";
}

const editor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);
const equipment = readFileSync(
  new URL("./EquipmentWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("builder character sidebar layout", () => {
  it("shows unboxed, Play-card colored groups and funds on every tab", () => {
    const panel = declarationsFor(".builder-sidebar-panel");
    expect(panel).not.toContain("border");
    expect(panel).not.toContain("background");
    expect(styles).not.toMatch(
      /\.builder-sidebar-panel \.stat-group\s*\{[^}]*--stat-tint:\s*color-mix\(in srgb, var\(--surface-subtle\)/,
    );
    expect(editor).toContain("{equipmentWallet !== undefined ? (");
    expect(editor).not.toContain("showsWallet");
    // Funds are one stat group: five coin tiles plus an actions tile.
    expect(equipment).toContain(
      'className="stat-group stat-tone-wealth funds-pane"',
    );
    expect(equipment).toContain('className="stat-tile funds-pane-actions"');
    // The actions tile is top right (after PP and GP), untinted, centered.
    expect(
      equipment.indexOf("CURRENCY_DENOMINATIONS.slice(0, 2)"),
    ).toBeLessThan(equipment.indexOf("funds-pane-actions"));
    expect(equipment.indexOf("funds-pane-actions")).toBeLessThan(
      equipment.indexOf("CURRENCY_DENOMINATIONS.slice(2)"),
    );
    // The top-right cell is a quick-adjust field shaped like a coin tile.
    expect(
      declarationsFor(".builder-sidebar .funds-pane .funds-pane-actions"),
    ).toContain("padding: 0");
    const field = declarationsFor(".funds-adjust-form input");
    expect(field).toContain("background: var(--stat-tint)");
    expect(field).toContain("border-radius: 0");
    expect(field).toContain("font-size: 1em");
    // Coin tiles are centered like the other stats and editable edge to edge.
    expect(
      declarationsFor(".builder-sidebar .funds-pane .stat-tile"),
    ).toContain("align-items: center");
    expect(styles).toMatch(
      /\.funds-coin-value,\s*\.funds-coin-input\s*\{[^}]*block-size: calc\(1em \* 1\.15\);[^}]*inline-size: 100%;/,
    );
    // Editing or focusing a coin tile borders the whole cell, like quick adjust.
    expect(styles).toMatch(
      /\.funds-coin-tile:has\(\.funds-coin-input\),\s*\.funds-coin-tile:has\(\.funds-coin-value:focus-visible\)\s*\{[^}]*box-shadow: inset 0 0 0 2px var\(--funds-focus\)/,
    );
    expect(styles).not.toContain(".funds-coin-tile:focus-within");
    // Highlights use a brighter version of the wealth group gold.
    expect(declarationsFor(".funds-pane")).toContain("--funds-focus: #c9971c");
    expect(declarationsFor(".funds-adjust-form input:focus-visible")).toContain(
      "var(--funds-focus)",
    );
    expect(equipment).toContain('toLocaleString("en-US")');
    // Full currency names, with "Diamond" for astral diamonds.
    for (const name of ["Copper", "Silver", "Gold", "Platinum", "Diamond"])
      expect(equipment).toContain(`label: "${name}"`);
    expect(equipment).toContain("<dt>{DENOMINATION_NAMES[denomination]}</dt>");
    expect(equipment).not.toContain("Astral diamond");
    expect(styles).not.toContain(
      "text-overflow: ellipsis;\n}\n\n.inventory-wallet",
    );
  });

  it("puts a sticky character sidebar beside every builder workspace", () => {
    expect(declarationsFor(".builder-layout")).toContain(
      "grid-template-columns: var(--builder-sidebar-width) minmax(0, 1fr)",
    );
    expect(declarationsFor(".builder-sidebar")).toContain("position: sticky");
    expect(declarationsFor(".builder-sidebar-identity")).toContain(
      "align-items: center",
    );
    expect(declarationsFor(".builder-character-name input")).toContain(
      "inline-size: 100%",
    );
    expect(styles).not.toContain(".builder-header-stat");
    expect(declarationsFor(".builder-tabs-bar")).not.toContain("border-top");
  });

  it("arranges stats like the printed Play-data card", () => {
    expect(declarationsFor(".builder-character-stat-row")).toContain(
      "grid-template-columns: 1fr 1fr 2.2fr",
    );
    expect(
      declarationsFor(
        ".builder-sidebar-panel .stat-tiles-compact .stat-tile dd",
      ),
    ).toContain("font-size: 1.4em");
  });

  it("keeps detail panes one card wide and folds the sidebar on narrow windows", () => {
    expect(declarationsFor(".level-choice-workspace")).toContain(
      "grid-template-columns: minmax(0, 1fr) var(--panel-card-width)",
    );
    expect(styles).toMatch(
      /@media \(max-width: 63rem\)[\s\S]*?\.builder-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.builder-tabs-bar\s*\{[^}]*flex-direction: column/,
    );
  });

  it("scrolls long detail panes inside the window", () => {
    const pane = declarationsFor(".shared-choice-detail");
    expect(pane).toContain("max-height: calc(100dvh - 2rem)");
    expect(pane).toContain("overflow-y: auto");
    expect(pane).toContain("position: sticky");
    // Card title bands and type bars stay put while the body scrolls.
    expect(styles).toMatch(
      /\.shared-choice-detail\s*:is\([^)]*\)\s*> :is\(header, \.reference-card-title\)\s*\{[^}]*position: sticky;[^}]*top: -4px;/,
    );
    expect(styles).toMatch(
      /\.shared-choice-detail\s*:is\([^)]*\)\s*> \.print-card-type\s*\{[^}]*bottom: -4px;[^}]*position: sticky;/,
    );
  });

  it("keeps the expanded top-level navigation compact", () => {
    expect(
      declarationsFor(".builder-tabs :is(button, .builder-tab)"),
    ).toContain("padding: 0.65rem");
  });
});

describe("builder ability tiles", () => {
  it("right-aligns single-digit scores in a two-digit slot", () => {
    const lead = declarationsFor(
      ".builder-character-abilities .stat-tiles-compact .stat-tile-lead",
    );
    expect(lead).toContain("min-inline-size: 2ch");
    expect(lead).toContain("text-align: right");
    expect(lead).toContain("font-variant-numeric: tabular-nums");
  });
});

describe("builder tab bar rule and level heading", () => {
  it("runs the tab rule under the whole bar and drops the Level heading line", () => {
    const bar = declarationsFor(".builder-tabs-bar");
    expect(bar).toContain("border-bottom: 1px solid var(--border)");
    expect(declarationsFor(".builder-tabs")).not.toContain("border-bottom");
    expect(declarationsFor(".level-choice-tab-bar h3")).not.toContain(
      "border-top",
    );
  });
});

describe("selection table names", () => {
  it("underline only the hovered name's text, not the whole cell", () => {
    expect(styles).toMatch(
      /\.selection-table-scroll td button:hover:not\(:disabled\),\s*\.selection-table-scroll td button:focus-visible\s*\{[^}]*box-shadow: none;[^}]*text-decoration: underline;/,
    );
  });
});

describe("level heading segment", () => {
  it("makes the whole Level segment the clickable, highlighted trigger", () => {
    expect(declarationsFor(".level-choice-tab-bar h3")).not.toContain(
      "padding",
    );
    expect(
      declarationsFor(".level-choice-tab-bar .level-picker-trigger"),
    ).toContain("padding: 0.55rem 0.85rem");
  });
});

describe("level section tab hover", () => {
  it("keeps the tab divider uncolored on hover", () => {
    expect(
      declarationsFor(
        '.level-choice-tabs button:not(:disabled):not([aria-disabled="true"]):hover',
      ),
    ).toContain("border-right-color: var(--border)");
  });
});
