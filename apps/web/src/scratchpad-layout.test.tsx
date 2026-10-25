import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  paginateTracking,
  surgeTrackRows,
  surgeTrackColumns,
  type TrackingMeasurements,
} from "./scratchpad-layout";
import { SurgeBar } from "./SurgeBar";

const measurements = (
  encounter: number[],
  daily: number[],
): TrackingMeasurements => ({
  encounter,
  daily,
  encounterOverhead: 10,
  dailyOverhead: 10,
  gap: 5,
});
describe("scratchpad measured tracking layout", () => {
  it("uses distinct muted health tints and a matching gold surge bar", () => {
    const styles = readFileSync(
      new URL("./sheet-overview.css", import.meta.url),
      "utf8",
    );
    for (const [selector, color] of [
      [".ov-scratch-defenses", "#f0f1f2"],
      [".ov-scratch-health-values > div", "#e8f1e8"],
      [".ov-scratch-health-values > div:nth-child(2)", "#f5e7e9"],
      [".ov-scratch-health-values > div:nth-child(3)", "#f5edda"],
      [".ov-scratch-health-values > div:nth-child(4)", "#e7edf7"],
      [".ov-scratch-surges", "#f5edda"],
    ]) {
      const rule = styles.slice(styles.indexOf(`${selector} {`)).split("}")[0];
      expect(rule).toContain(`background: ${color}`);
    }
  });
  it("keeps skull and action-point marks close together", () => {
    const styles = readFileSync(
      new URL("./sheet-overview.css", import.meta.url),
      "utf8",
    );
    const rule = styles.match(
      /\.sp-death-saves > span,\s*\.ov-action-point-count > span\s*\{([^}]+)\}/,
    )?.[1];
    expect(rule).toContain("gap: 0.04in");
  });
  it("places daily tracking beside encounters without container queries", () => {
    const styles = readFileSync(
      new URL("./sheet-overview.css", import.meta.url),
      "utf8",
    );
    // Firefox's print layout ignores @container, stacking dailies off the page.
    expect(styles).not.toContain("@container");
    expect(styles).toMatch(
      /\n\.ov-tracking-panels\.has-both\s*\{\s*grid-template-columns: minmax\(0, 1\.5fr\) minmax\(0, 1fr\);/,
    );
  });
  it("top-aligns shared-use tracking boxes to the group heading", () => {
    const styles = readFileSync(
      new URL("./sheet-overview.css", import.meta.url),
      "utf8",
    );
    const rule = styles.match(
      /\.ov-power-trackers \.sp-usage-table \.ov-shared-usage td\s*\{([^}]+)\}/,
    )?.[1];
    expect(rule).toContain("vertical-align: top");
    expect(rule).toContain("padding-top: 0.06in");
  });
  it("stacks consumables below dailies independently of encounter height", () => {
    const m = {
      ...measurements([20, 20, 20, 20], [20]),
      consumables: [20],
      consumableOverhead: 10,
      sideBySide: true,
    };
    expect(paginateTracking(m, m, 90, 500, 20)).toEqual([
      {
        encounterStart: 0,
        encounterEnd: 4,
        dailyStart: 0,
        dailyEnd: 1,
        consumableStart: 0,
        consumableEnd: 1,
      },
    ]);
  });
  it("preserves consumable rows exactly once through dense continuations", () => {
    const m = {
      ...measurements(Array(20).fill(30), Array(10).fill(30)),
      consumables: Array(17).fill(25),
      consumableOverhead: 10,
      sideBySide: true,
    };
    const pages = paginateTracking(m, m, 150, 300, 20);
    expect(
      pages.flatMap((page) =>
        Array.from(
          { length: page.consumableEnd! - page.consumableStart! },
          (_, i) => page.consumableStart! + i,
        ),
      ),
    ).toEqual(Array.from({ length: 17 }, (_, i) => i));
    const oversized = {
      ...measurements([], []),
      consumables: [1000],
      consumableOverhead: 10,
    };
    expect(
      paginateTracking(oversized, oversized, 50, 100, 20)[1],
    ).toMatchObject({ consumableStart: 0, consumableEnd: 1, oversized: true });
  });
  it("shares vertical space between side-by-side encounter and daily panes", () => {
    const m = { ...measurements([20, 20, 20], [20, 20, 20]), sideBySide: true };
    expect(paginateTracking(m, m, 70, 500, 20)).toEqual([
      { encounterStart: 0, encounterEnd: 3, dailyStart: 0, dailyEnd: 3 },
    ]);
    expect(paginateTracking(m, m, 60, 70, 20)).toEqual([
      { encounterStart: 0, encounterEnd: 1, dailyStart: 0, dailyEnd: 1 },
      { encounterStart: 1, encounterEnd: 3, dailyStart: 1, dailyEnd: 3 },
    ]);
  });
  it("uses all available space, reserving a caption only for actual overflow", () => {
    const m = measurements([20, 20], [20, 20]);
    expect(paginateTracking(m, m, 105, 500, 20)).toEqual([
      { encounterStart: 0, encounterEnd: 2, dailyStart: 0, dailyEnd: 2 },
    ]);
    const small = paginateTracking(m, m, 90, 500, 20);
    expect(small).toHaveLength(2);
    expect(small[0]).toEqual({
      encounterStart: 0,
      encounterEnd: 1,
      dailyStart: 0,
      dailyEnd: 1,
    });
    expect(small[1]).toEqual({
      encounterStart: 1,
      encounterEnd: 2,
      dailyStart: 1,
      dailyEnd: 2,
    });
  });
  it("retains every row exactly once, with opportunities for both lists on page one", () => {
    const m = measurements(Array(24).fill(30), Array(13).fill(30));
    const pages = paginateTracking(m, m, 220, 500, 20);
    expect(pages[0]!.encounterEnd).toBeGreaterThan(0);
    expect(pages[0]!.dailyEnd).toBeGreaterThan(0);
    const indices = (kind: "encounter" | "daily") =>
      pages.flatMap((p) =>
        Array.from(
          { length: p[`${kind}End`] - p[`${kind}Start`] },
          (_, i) => p[`${kind}Start`] + i,
        ),
      );
    expect(indices("encounter")).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
    expect(indices("daily")).toEqual(Array.from({ length: 13 }, (_, i) => i));
  });
  it("measures continuation rows at their wider width without splitting a group", () => {
    const first = measurements([150, 150], [25]);
    const next = measurements([70, 70], [25]);
    expect(paginateTracking(first, next, 100, 160, 20)).toEqual([
      { encounterStart: 0, encounterEnd: 0, dailyStart: 0, dailyEnd: 1 },
      { encounterStart: 0, encounterEnd: 2, dailyStart: 1, dailyEnd: 1 },
    ]);
  });
  it("retains oversized custom groups explicitly rather than looping or discarding them", () => {
    const m = measurements([1000], []);
    const pages = paginateTracking(m, m, 100, 500, 20);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({
      encounterStart: 0,
      encounterEnd: 1,
      oversized: true,
    });
  });
  it("has no continuation for empty lists", () => {
    const m = measurements([], []);
    expect(paginateTracking(m, m, 0, 500, 20)).toEqual([
      { encounterStart: 0, encounterEnd: 0, dailyStart: 0, dailyEnd: 0 },
    ]);
  });
});
describe("segmented surge bar", () => {
  it("wraps before boxes become narrower than their height, accounting for gaps", () => {
    expect(surgeTrackColumns(219, 21, 1)).toBe(10);
    expect(surgeTrackColumns(218, 21, 1)).toBe(9);
    const columns = surgeTrackColumns(400, 21.12, 1);
    expect(columns).toBe(18);
    for (const total of [20, 25]) {
      const rows = surgeTrackRows(total, columns);
      expect(rows.map((row) => row.length)).toEqual([
        Math.ceil(total / 2),
        Math.floor(total / 2),
      ]);
      expect(rows.flat()).toEqual(
        Array.from({ length: total }, (_, i) => total - i),
      );
    }
  });
  it("starts balanced rows at 18 surges and keeps odd overflow left-aligned in equal-width slots", () => {
    expect(surgeTrackRows(17, 18).map((row) => row.length)).toEqual([17]);
    for (const [total, sizes] of [
      [18, [9, 9]],
      [19, [10, 9]],
      [20, [10, 10]],
      [25, [13, 12]],
      [37, [13, 12, 12]],
    ] as const) {
      const rows = surgeTrackRows(total, 18);
      expect(rows.map((row) => row.length)).toEqual(sizes);
      expect(rows.flat()).toEqual(
        Array.from({ length: total }, (_, i) => total - i),
      );
    }
    const html = renderToStaticMarkup(<SurgeBar count="19" />);
    expect(
      html.match(/grid-template-columns:repeat\(10, minmax\(0, 1fr\)\)/g),
    ).toHaveLength(2);
  });
  it("keeps all surge bars uninterrupted, with numbers providing grouping", () => {
    for (const count of ["6", "9", "10", "13"])
      expect(renderToStaticMarkup(<SurgeBar count={count} />)).not.toContain(
        "ov-surge-group",
      );
  });
  it("keeps 13 surges on one track and numbers every box", () => {
    const html = renderToStaticMarkup(<SurgeBar count="13" />);
    expect(html.match(/class="ov-surge-segment/g)).toHaveLength(13);
    expect(html.match(/class="ov-surge-row"/g)).toHaveLength(1);
    expect(
      [...html.matchAll(/class="ov-surge-label[^\"]*">(\d+)<\/small>/g)].map(
        (m) => Number(m[1]),
      ),
    ).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
  it("numbers each box for short bars", () => {
    const html = renderToStaticMarkup(<SurgeBar count="3" />);
    expect(
      [...html.matchAll(/class="ov-surge-label[^\"]*">(\d+)<\/small>/g)].map(
        (m) => Number(m[1]),
      ),
    ).toEqual([3, 2, 1]);
  });
  it("makes deliberate aligned tracks when the minimum segment size requires it", () => {
    expect(surgeTrackRows(13, 8)).toEqual([
      [13, 12, 11, 10, 9, 8, 7],
      [6, 5, 4, 3, 2, 1],
    ]);
    expect(surgeTrackRows(0, 20)).toEqual([]);
  });
  it("preserves unknown and unusually large values without fabricating segments", () => {
    expect(renderToStaticMarkup(<SurgeBar count="—" />)).not.toContain(
      "ov-surge-segment",
    );
    const large = renderToStaticMarkup(<SurgeBar count="120" />);
    expect(large.match(/class="ov-surge-segment/g)).toHaveLength(100);
    expect(large).toContain("20 additional surges");
  });
});
