import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatGroup, statValueFit } from "./StatTiles";
import { appStyles } from "./test-styles";

const statStyles = readFileSync(
  new URL("./stat-tiles.css", import.meta.url),
  "utf8",
);
const sheetStyles = readFileSync(
  new URL("./sheet-overview.css", import.meta.url),
  "utf8",
);

/** The declarations of the rule whose selector list is exactly `selector`. */
function declarations(css: string, selector: string): string {
  const squash = (value: string) => value.replace(/\s+/g, " ").trim();
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = squash(match[1]!.replace(/\/\*[\s\S]*?\*\//g, ""));
    if (selectors === squash(selector)) return squash(match[2]!);
  }
  throw new Error(`No rule for ${selector}`);
}

describe("stat tile values that shrink with their length", () => {
  it("marks a fit tile with its value's length and wraps the value", () => {
    const html = renderToStaticMarkup(
      <StatGroup
        label="Stored currency"
        tone="abilities"
        values={[
          { label: "GP", value: "1,250,000", fit: true },
          { label: "AD", value: "—", fit: true },
          { label: "AC", value: "24" },
        ]}
      />,
    );
    expect(html).toContain(
      '<div class="stat-tile stat-tile-fit" style="--stat-value-chars:8"><dt>GP</dt><dd><span class="stat-value-fit">1,250,000</span></dd></div>',
    );
    expect(html).toContain('style="--stat-value-chars:1"');
    // Other tiles are unchanged.
    expect(html).toContain('<div class="stat-tile"><dt>AC</dt><dd>24</dd>');
    expect(statValueFit("")).toEqual({ "--stat-value-chars": "1" });
    expect(statValueFit("17,689")).toEqual({ "--stat-value-chars": "5.5" });
  });

  it("sizes the value by the tile's width over its length, never wrapping", () => {
    expect(declarations(statStyles, ".stat-tile-fit")).toContain(
      "container-type: inline-size",
    );
    const value = declarations(statStyles, ".stat-tile-fit .stat-value-fit");
    expect(value).toContain(
      "font-size: min(1em, 100cqi / (var(--stat-value-chars, 1) * 0.6))",
    );
    expect(value).toContain("white-space: nowrap");
  });

  it("never breaks a coin count inside its tile, printed or in the builder", () => {
    // The printed Currency pane and the builder's funds tiles used to wrap
    // a long count ("17,68" / "9"); they shrink it instead.
    expect(sheetStyles).not.toContain(".ov-wallet-group .stat-tile dd");
    expect(
      declarations(appStyles, ".builder-sidebar .funds-pane .stat-tile dd"),
    ).not.toContain("overflow-wrap");
    const equipment = readFileSync(
      new URL("./EquipmentWorkspace.tsx", import.meta.url),
      "utf8",
    );
    expect(equipment).toContain(
      "className={`funds-coin-value ${STAT_VALUE_FIT_CLASS}`}",
    );
    expect(equipment).toContain(
      "className={`funds-coin-input ${STAT_VALUE_FIT_CLASS}`}",
    );
    const overview = readFileSync(
      new URL("./SheetOverview.tsx", import.meta.url),
      "utf8",
    );
    expect(overview).toMatch(/value: row\[column \+ 1\] \?\? "",\s*fit: true,/);
  });
});
