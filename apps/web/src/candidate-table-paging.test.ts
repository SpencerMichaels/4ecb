import { describe, expect, it } from "vitest";

import {
  CANDIDATE_PAGE_SIZE,
  candidatePageForRow,
  candidatePageWindow,
  candidateSectionOnPage,
} from "./candidate-table-paging";

describe("candidate table paging", () => {
  it("never mounts more than 200 result rows", () => {
    expect(CANDIDATE_PAGE_SIZE).toBe(200);
    for (const total of [0, 1, 199, 200, 201, 420, 3708]) {
      const pageCount = candidatePageWindow(total, 0).pageCount;
      let covered = 0;
      for (let page = 0; page < pageCount; page += 1) {
        const window = candidatePageWindow(total, page);
        expect(window.end - window.start).toBeLessThanOrEqual(200);
        expect(window.start).toBe(covered);
        covered = window.end;
      }
      // Every result row is reachable on exactly one page.
      expect(covered).toBe(total);
    }
  });

  it("keeps empty, short, and exactly-200 sets on one page", () => {
    expect(candidatePageWindow(0, 0)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      end: 0,
    });
    expect(candidatePageWindow(12, 0).pageCount).toBe(1);
    expect(candidatePageWindow(200, 0)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      end: 200,
    });
    expect(candidatePageWindow(201, 1)).toEqual({
      page: 1,
      pageCount: 2,
      start: 200,
      end: 201,
    });
  });

  it("clamps stale pages after the result set shrinks", () => {
    expect(candidatePageWindow(3708, 18).page).toBe(18);
    expect(candidatePageWindow(150, 18)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      end: 150,
    });
    expect(candidatePageWindow(420, -3).page).toBe(0);
  });

  it("opens on the page containing a selected row outside the first window", () => {
    expect(candidatePageForRow(-1)).toBe(0);
    expect(candidatePageForRow(0)).toBe(0);
    expect(candidatePageForRow(199)).toBe(0);
    expect(candidatePageForRow(200)).toBe(1);
    expect(candidatePageForRow(3707)).toBe(18);
  });

  it("repeats a section header on every page its rows reach", () => {
    const total = 420;
    const first = candidatePageWindow(total, 0);
    const second = candidatePageWindow(total, 1);
    const third = candidatePageWindow(total, 2);
    const spanning = { start: 150, end: 260 };
    expect(candidateSectionOnPage(spanning, first, total)).toBe(true);
    expect(candidateSectionOnPage(spanning, second, total)).toBe(true);
    expect(candidateSectionOnPage(spanning, third, total)).toBe(false);
  });

  it("shows collapsed sections once, where their rows would begin", () => {
    const total = 400;
    const first = candidatePageWindow(total, 0);
    const second = candidatePageWindow(total, 1);
    const atBoundary = { start: 200, end: 200 };
    expect(candidateSectionOnPage(atBoundary, first, total)).toBe(false);
    expect(candidateSectionOnPage(atBoundary, second, total)).toBe(true);
    const trailing = { start: 400, end: 400 };
    expect(candidateSectionOnPage(trailing, first, total)).toBe(false);
    expect(candidateSectionOnPage(trailing, second, total)).toBe(true);
    const allCollapsed = candidatePageWindow(0, 0);
    expect(candidateSectionOnPage({ start: 0, end: 0 }, allCollapsed, 0)).toBe(
      true,
    );
  });
});
