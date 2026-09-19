import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const workspace = readFileSync(
  new URL("./EquipmentWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("loadout interaction and geometry", () => {
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

  it("pairs every equipment tab label with its requested icon", () => {
    for (const [id, label, icon] of [
      ["loadout", "Loadout", "sword"],
      ["inventory", "Inventory", "handbag"],
      ["shop", "Shop", "shopping-cart"],
      ["practices", "Rituals & Practices", "scroll-text"],
    ] as const)
      expect(workspace).toMatch(
        new RegExp(
          `id: "${id}",[\\s\\S]*?label: "${label}",[\\s\\S]*?icon: "${icon}"`,
          "u",
        ),
      );
    expect(workspace).toContain("<Icon name={item.icon} />");
  });

  it("inspects committed and currently focused loadout items", () => {
    const loadout = workspace.slice(
      workspace.indexOf('{tab === "loadout"'),
      workspace.indexOf(': tab === "inventory"'),
    );

    expect(loadout).toMatch(
      /onFocus=\{\(\) => \{[\s\S]*?if \(assigned !== undefined\)[\s\S]*?inspectInventory\(assigned\)/,
    );
    expect(loadout).toMatch(
      /onChange=\{\(event\) => \{[\s\S]*?const entry = inventory\.find[\s\S]*?if \(entry !== undefined\) inspectInventory\(entry\)/,
    );
  });

  it("does not pretend native popup highlighting is a portable selection event", () => {
    const loadout = workspace.slice(
      workspace.indexOf('{tab === "loadout"'),
      workspace.indexOf(': tab === "inventory"'),
    );

    expect(loadout).not.toContain("onInput=");
    expect(loadout).not.toContain("onKeyDown=");
  });
});
