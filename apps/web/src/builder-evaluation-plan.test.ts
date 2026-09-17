import { describe, expect, it } from "vitest";

import {
  currentCandidateDetailLevels,
  planningCandidateDetailLevels,
  publishEvaluationResult,
  selectedCandidateDetailLevels,
} from "./builder-evaluation-plan";

describe("builder evaluation planning", () => {
  it("requests full candidates only for the visible Build level", () => {
    expect(planningCandidateDetailLevels("build", 8, [1, 4])).toEqual([8]);
    expect(currentCandidateDetailLevels("build", 8, 8)).toEqual([8]);
    expect(currentCandidateDetailLevels("build", 8, 4)).toEqual([]);
    expect(selectedCandidateDetailLevels("build", 4)).toEqual([4]);
  });

  it("requests character-detail candidates only on the Details workspace", () => {
    expect(planningCandidateDetailLevels("details", 8, [4, 1, 4])).toEqual([
      1, 4, 8,
    ]);
    expect(selectedCandidateDetailLevels("details", 8)).toEqual([]);
    expect(currentCandidateDetailLevels("details", 8, 8)).toEqual([]);
  });

  it.each(["overview", "equipment", "diagnostics"] as const)(
    "omits selectable candidate expansion on %s",
    (workspace) => {
      expect(planningCandidateDetailLevels(workspace, 8, [1, 4])).toEqual([]);
      expect(selectedCandidateDetailLevels(workspace, 8)).toEqual([]);
      expect(currentCandidateDetailLevels(workspace, 8, 8)).toEqual([]);
    },
  );

  it("publishes a finished horizon without waiting for sibling work", async () => {
    let finishCurrent!: (value: string) => void;
    let finishPlanning!: (value: string) => void;
    const current = new Promise<string>((resolve) => {
      finishCurrent = resolve;
    });
    const planning = new Promise<string>((resolve) => {
      finishPlanning = resolve;
    });
    const published: string[] = [];
    const currentPublished = publishEvaluationResult(
      current,
      () => true,
      (value) => published.push(value),
    );
    const planningPublished = publishEvaluationResult(
      planning,
      () => true,
      (value) => published.push(value),
    );

    finishPlanning("planning");
    await planningPublished;
    expect(published).toEqual(["planning"]);

    finishCurrent("current");
    await currentPublished;
    expect(published).toEqual(["planning", "current"]);
  });

  it("does not publish a stale evaluation", async () => {
    const published: string[] = [];
    await publishEvaluationResult(
      Promise.resolve("stale"),
      () => false,
      (value) => published.push(value),
    );
    expect(published).toEqual([]);
  });
});
