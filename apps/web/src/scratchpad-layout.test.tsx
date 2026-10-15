import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  paginateTracking,
  surgeTrackRows,
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
  it("groups longer bars in fives but leaves fewer than ten surges uninterrupted", () => {
    for (const count of ["6", "9"])
      expect(renderToStaticMarkup(<SurgeBar count={count} />)).not.toContain(
        "ov-surge-group",
      );
    expect(
      renderToStaticMarkup(<SurgeBar count="10" />).match(/ov-surge-group/g),
    ).toHaveLength(1);
    expect(
      renderToStaticMarkup(<SurgeBar count="13" />).match(/ov-surge-group/g),
    ).toHaveLength(2);
  });
  it("keeps 13 surges on one track and labels remaining boundaries sparsely", () => {
    const html = renderToStaticMarkup(<SurgeBar count="13" />);
    expect(html.match(/class="ov-surge-segment/g)).toHaveLength(13);
    expect(html.match(/class="ov-surge-row"/g)).toHaveLength(1);
    expect(
      [...html.matchAll(/class="ov-surge-label[^\"]*">(\d+)<\/small>/g)].map(
        (m) => Number(m[1]),
      ),
    ).toEqual([13, 10, 5, 0]);
  });
  it("numbers every boundary for short bars", () => {
    const html = renderToStaticMarkup(<SurgeBar count="3" />);
    expect(
      [...html.matchAll(/class="ov-surge-label[^\"]*">(\d+)<\/small>/g)].map(
        (m) => Number(m[1]),
      ),
    ).toEqual([3, 2, 1, 0]);
  });
  it("makes deliberate aligned tracks when the minimum segment size requires it", () => {
    expect(surgeTrackRows(13, 8)).toEqual([
      [13, 12, 11, 10, 9, 8, 7, 6],
      [5, 4, 3, 2, 1],
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
