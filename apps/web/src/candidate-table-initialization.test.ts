import { describe, expect, it } from "vitest";

import {
  explicitlyInspectCandidate,
  firstSelectedCandidateId,
  initializeCandidateInspection,
  initialCandidateScrollStep,
  initialCandidateScrollTarget,
  initialCandidateScrollTop,
} from "./candidate-table-initialization";

describe("candidate table initialization", () => {
  it("uses the first selection in the established choice order", () => {
    expect(
      firstSelectedCandidateId(
        new Set(["background-second", "background-fourth"]),
      ),
    ).toBe("background-second");
    expect(firstSelectedCandidateId(new Set())).toBeUndefined();
  });

  it("lets the first table with a selection initialize a shared details pane", () => {
    const state = {
      initializationClaimed: false,
      explicitlyInspected: false,
    };
    const inspections: Array<string | undefined> = [];
    const inspect = (option: string | undefined) => inspections.push(option);

    initializeCandidateInspection(state, undefined, inspect);
    initializeCandidateInspection(state, "later-table-selection", inspect);
    initializeCandidateInspection(state, "third-table-selection", inspect);
    initializeCandidateInspection(state, undefined, inspect);

    expect(inspections).toEqual([undefined, "later-table-selection"]);
  });

  it("never overwrites an explicit inspection with initialization", () => {
    const state = {
      initializationClaimed: false,
      explicitlyInspected: false,
    };
    const inspections: Array<string | undefined> = [];

    explicitlyInspectCandidate(state, "user-choice", (option) =>
      inspections.push(option),
    );
    initializeCandidateInspection(state, "saved-selection", (option) =>
      inspections.push(option),
    );

    expect(inspections).toEqual(["user-choice"]);
  });

  it("positions the selected row beneath the column header", () => {
    expect(
      initialCandidateScrollTop({
        currentScrollTop: 120,
        viewportTop: 200,
        rowTop: 470,
        stickyHeaderHeight: 36,
      }),
    ).toBe(354);
  });

  it("does not request a negative scroll offset for a row near the top", () => {
    expect(
      initialCandidateScrollTop({
        currentScrollTop: 0,
        viewportTop: 200,
        rowTop: 215,
        stickyHeaderHeight: 36,
      }),
    ).toBe(0);
  });

  it("aims at the topmost displayed selection, not the first one picked", () => {
    expect(
      initialCandidateScrollTarget(
        ["a", undefined, "later-pick", "b", "first-pick"],
        new Set(["first-pick", "later-pick"]),
      ),
    ).toBe("later-pick");
    // Not displayed (yet): fall back to the choice order.
    expect(initialCandidateScrollTarget(["a"], new Set(["first-pick"]))).toBe(
      "first-pick",
    );
    expect(initialCandidateScrollTarget(["a"], new Set())).toBeUndefined();
  });

  it("waits for candidates and layout before settling the pre-scroll", () => {
    const ready = {
      candidateCount: 40,
      viewportHeight: 480,
      canWaitForLayout: true,
      targetId: "pick",
      targetRowMounted: true,
    };
    expect(initialCandidateScrollStep(ready)).toBe("scroll");
    // Hidden or zero-height at mount, or candidates not arrived: retry later
    // instead of measuring a wrong position and never trying again.
    expect(initialCandidateScrollStep({ ...ready, viewportHeight: 0 })).toBe(
      "wait",
    );
    expect(initialCandidateScrollStep({ ...ready, candidateCount: 0 })).toBe(
      "wait",
    );
    // Without a way to hear about layout, measure what there is once.
    expect(
      initialCandidateScrollStep({
        ...ready,
        viewportHeight: 0,
        canWaitForLayout: false,
      }),
    ).toBe("scroll");
    // Nothing to scroll to: settle, so a later pick never scrolls the table.
    expect(initialCandidateScrollStep({ ...ready, targetId: undefined })).toBe(
      "settle",
    );
    expect(
      initialCandidateScrollStep({ ...ready, targetRowMounted: false }),
    ).toBe("settle");
  });

  it("goes as high as it can for a row near the end of the list", () => {
    expect(
      initialCandidateScrollTop({
        currentScrollTop: 0,
        viewportTop: 100,
        rowTop: 2100,
        stickyHeaderHeight: 60,
        maxScrollTop: 1500,
      }),
    ).toBe(1500);
    expect(
      initialCandidateScrollTop({
        currentScrollTop: 0,
        viewportTop: 100,
        rowTop: 400,
        stickyHeaderHeight: 60,
        maxScrollTop: -5,
      }),
    ).toBe(0);
  });
});
