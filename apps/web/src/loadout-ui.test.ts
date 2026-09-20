import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const workspace = readFileSync(
  new URL("./EquipmentWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("loadout interaction and geometry", () => {
  it("shares the route-owned Shop category vocabulary", () => {
    expect(workspace).toContain('import type { ShopCategory } from "./routes"');
    expect(workspace).not.toContain("export type ShopCategory");
  });

  it("sizes the label track independently within each loadout stack", () => {
    const stackRule = styles.match(/\.loadout-stack\s*\{([^}]*)\}/)?.[1];
    const slotRule = styles.match(
      /\.loadout-grid \.loadout-slot\s*\{([^}]*)\}/,
    )?.[1];
    const selectRule = styles.match(/\.loadout-grid select\s*\{([^}]*)\}/)?.[1];

    expect(stackRule).toContain("column-gap: 0.5rem");
    expect(stackRule).toContain(
      "grid-template-columns: max-content minmax(0, 18rem)",
    );
    expect(slotRule).toContain("grid-column: 1 / -1");
    expect(slotRule).toContain("grid-template-columns: subgrid");
    expect(slotRule).not.toMatch(/grid-template-columns:\s*[\d.]+rem/u);
    expect(selectRule).toContain("max-inline-size: 18rem");
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.loadout-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
    );
  });

  it("swaps Inventory and Loadout in the main pane", () => {
    expect(workspace).toContain(
      "onClick={() => onLoadoutViewChange(!loadoutView)}",
    );
    expect(workspace).toContain(
      '<Icon name={loadoutView ? "handbag" : "sword"} />',
    );
    expect(workspace).toContain('{loadoutView ? "Inventory" : "Loadout"}');
    expect(workspace).toMatch(
      /<div className="equipment-summary-row">[\s\S]*?<button[\s\S]*?className="equipment-view-toggle"[\s\S]*?<section className="inventory-wallet"[\s\S]*?\{loadoutView \? \([\s\S]*?<LoadoutGrid/,
    );
    expect(styles).not.toContain(".equipment-toolbar");
    expect(workspace).toMatch(
      /<\/div>\s*<div className="shared-choice-detail">\s*<ItemDetail/,
    );
    expect(workspace).not.toContain("<dialog");
    expect(workspace).not.toContain("loadoutDialog");
    expect(workspace).not.toContain("showModal()");
  });

  it("inspects committed and currently focused loadout items", () => {
    const loadout = workspace.slice(
      workspace.indexOf("function LoadoutGrid"),
      workspace.indexOf("export function EquipmentWorkspace"),
    );

    expect(loadout).toMatch(
      /onFocus=\{\(\) => \{[\s\S]*?if \(assigned !== undefined\)[\s\S]*?onInspect\(assigned\)/,
    );
    expect(loadout).toMatch(
      /onChange=\{\(event\) => \{[\s\S]*?const entry = inventory\.find[\s\S]*?if \(entry !== undefined\) onInspect\(entry\)/,
    );
  });

  it("does not pretend native popup highlighting is a portable selection event", () => {
    const loadout = workspace.slice(
      workspace.indexOf("function LoadoutGrid"),
      workspace.indexOf("export function EquipmentWorkspace"),
    );

    expect(loadout).not.toContain("onInput=");
    expect(loadout).not.toContain("onKeyDown=");
  });

  it("mutes only loadout selects whose current value is Empty", () => {
    expect(workspace).toMatch(
      /className=\{[\s\S]*?assigned === undefined \? "is-empty" : undefined[\s\S]*?\}/,
    );
    const emptySelectRule = styles.match(
      /\.loadout-grid select\.is-empty\s*\{([^}]*)\}/,
    )?.[1];
    expect(emptySelectRule).toContain(
      "background: color-mix(in srgb, var(--surface-subtle) 82%, var(--surface))",
    );
    expect(emptySelectRule).toContain("border-color: var(--border)");
    expect(emptySelectRule).toContain("color: var(--muted)");
    expect(styles).toMatch(
      /\.loadout-grid select\.is-empty option:not\(\[value=""\]\)\s*\{[^}]*color: var\(--text\)/,
    );
  });

  it("keeps Inventory name decoration scoped and sale menus dismissible", () => {
    expect(styles).toMatch(
      /\.inventory-item-button:hover[^,]*\.inventory-item-name,[\s\S]*?text-decoration: underline/,
    );
    expect(styles).toMatch(
      /\.inventory-item-button:hover[\s\S]*?text-decoration: none/,
    );
    expect(workspace).toContain('placeholder="20pp, -15 gp, ..."');
    expect(workspace).toContain(
      'document.addEventListener("pointerdown", dismissOutside)',
    );
    expect(workspace).toContain('if (event.key !== "Escape") return');
    expect(workspace).toMatch(
      /aria-expanded=\{\s*openSaleId === entry\.id\s*\}/,
    );
  });

  it("renders accessible collapsible Inventory role sections", () => {
    expect(workspace).toContain("groupInventoryByCategory(inventory, byId)");
    expect(workspace).toContain('className="inventory-category-row"');
    expect(workspace).toContain("aria-expanded={expanded}");
    expect(workspace).toContain("aria-controls={sectionId}");
    expect(workspace).toContain("{entries.length} holding");
    expect(workspace).toContain("{entries.length}");
    expect(styles).toMatch(
      /\.inventory-table \.inventory-category-row[\s\S]*?background: var\(--brand-navy\)/,
    );
    expect(styles).toContain("--brand-navy: #1d3d5d");
    expect(styles).toMatch(
      /\.equipment-primary\s*\{[^}]*--equipment-mode-block-size: max\(44rem, calc\(200vh - 46rem\)\)/,
    );
    expect(styles).toMatch(
      /\.equipment-mode-content\s*\{[^}]*min-block-size: var\(--equipment-mode-block-size\)/,
    );
    expect(styles).toMatch(
      /\.inventory-table-scroll\s*\{[^}]*max-block-size: var\(--equipment-mode-block-size\)[^}]*overflow: auto/,
    );
    expect(styles).toMatch(/\.inventory-table\s*\{[^}]*font-size: 0\.78rem/);
    expect(styles).toMatch(
      /\.inventory-item-icon\s*\{[^}]*height: 1\.5rem;[^}]*width: 1\.5rem/,
    );
    expect(styles).toMatch(
      /\.inventory-item-icon \.icon\s*\{[^}]*height: 0\.9rem;[^}]*width: 0\.9rem/,
    );
    expect(styles).toMatch(
      /\.inventory-equipped-badge\s*\{[^}]*min-height: 0\.8rem;[^}]*min-width: 0\.8rem/,
    );
    expect(styles).toMatch(
      /\.inventory-equipped-badge \.icon\s*\{[^}]*height: 0\.5rem;[^}]*width: 0\.5rem/,
    );
    expect(styles).toMatch(
      /\.inventory-category-row[\s\S]*?button\[aria-expanded="true"\][\s\S]*?transform: rotate\(90deg\)/,
    );
  });
});
