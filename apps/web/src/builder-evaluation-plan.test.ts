import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  characterWalletTextKey,
  type CharacterBuild,
} from "@4ecb/character-domain";

import {
  currentCandidateDetailLevels,
  evaluationDispatchOrder,
  planningCandidateDetailLevels,
  publishEvaluationResult,
  selectedCandidateDetailLevels,
  sameRulesInputs,
} from "./builder-evaluation-plan";

const build: CharacterBuild = {
  formatVersion: 2,
  known: [],
  effectiveLevel: 1,
  levels: [],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: { Strength: 14 },
  textStrings: { "Sneak Attack Die": "d8" },
};
const setText = (name: string, value: string) =>
  applyCharacterCommand(build, { kind: "set-text", name, value });

describe("rules-input comparison", () => {
  it("ignores free-text details and wallet amounts", () => {
    expect(
      sameRulesInputs(build, setText("NOTE_Personality Traits", "Gruff")),
    ).toBe(true);
    expect(
      sameRulesInputs(
        build,
        setText(characterWalletTextKey(1, "carried"), "5"),
      ),
    ).toBe(true);
  });

  it("notices text and build changes evaluation reads", () => {
    expect(sameRulesInputs(build, setText("Sneak Attack Die", "d6"))).toBe(
      false,
    );
    expect(
      sameRulesInputs(build, { ...build, baseAbilities: { Strength: 16 } }),
    ).toBe(false);
    expect(sameRulesInputs(build, { ...build, effectiveLevel: 2 })).toBe(false);
  });
});

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

  it.each(["shop", "equipment", "diagnostics", "house-rules"] as const)(
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

  it("dispatches only the shared planning request when every horizon coincides", () => {
    expect(evaluationDispatchOrder(8, 8, 8)).toEqual(["planning"]);
  });

  it("dispatches the visible current level before the hidden planning horizon", () => {
    expect(evaluationDispatchOrder(4, 4, 8)).toEqual(["current", "planning"]);
  });

  it("dispatches the visible selected level before the hidden planning horizon", () => {
    expect(evaluationDispatchOrder(8, 4, 8)).toEqual(["selected", "planning"]);
  });

  it("dispatches both visible horizons before planning when all three differ", () => {
    expect(evaluationDispatchOrder(3, 5, 10)).toEqual([
      "current",
      "selected",
      "planning",
    ]);
  });

  it("does not duplicate the selected horizon when it matches current", () => {
    expect(evaluationDispatchOrder(4, 4, 10)).toEqual(["current", "planning"]);
  });
});
