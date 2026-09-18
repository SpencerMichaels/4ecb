import { describe, expect, it } from "vitest";

import {
  explicitlyInspectCandidate,
  firstSelectedCandidateId,
  initializeCandidateInspection,
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

  it("lets only the first table initialize a shared details pane", () => {
    const state = {
      initializationClaimed: false,
      explicitlyInspected: false,
    };
    const inspections: Array<string | undefined> = [];

    initializeCandidateInspection(state, undefined, (option) =>
      inspections.push(option),
    );
    initializeCandidateInspection(state, "later-table-selection", (option) =>
      inspections.push(option),
    );

    expect(inspections).toEqual([undefined]);
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

  it("positions the selected row beneath the sticky header", () => {
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
});
