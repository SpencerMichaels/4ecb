import { describe, expect, it } from "vitest";

import {
  ABILITY_SCORE_NAMES,
  assessAbilityPointBuy,
  pointBuyCostToRaise,
} from "./ability-scores";

const scores = (values: readonly number[]) =>
  Object.fromEntries(
    ABILITY_SCORE_NAMES.map((ability, index) => [ability, values[index]!]),
  );

describe("legacy ability score point buy", () => {
  it("starts with 22 points and accepts the standard array", () => {
    expect(assessAbilityPointBuy(scores([8, 10, 10, 10, 10, 10]))).toEqual({
      complete: false,
      legal: false,
      spent: 0,
      remaining: 22,
    });
    expect(assessAbilityPointBuy(scores([16, 14, 13, 12, 11, 10]))).toEqual({
      complete: true,
      legal: true,
      spent: 22,
      remaining: 0,
    });
  });

  it("uses the legacy escalating raise costs", () => {
    expect(
      Array.from({ length: 10 }, (_, index) => pointBuyCostToRaise(index + 8)),
    ).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 3, 4]);
    expect(pointBuyCostToRaise(18)).toBeUndefined();
  });

  it("distinguishes unfinished point buy from house-ruled scores", () => {
    expect(
      assessAbilityPointBuy(scores([18, 18, 10, 10, 10, 10])),
    ).toMatchObject({
      complete: true,
      legal: false,
      remaining: -12,
    });
    expect(assessAbilityPointBuy(scores([8, 9, 18, 12, 10, 10]))).toEqual({
      complete: true,
      legal: false,
      reason: "multiple-low-scores",
    });
    expect(assessAbilityPointBuy(scores([20, 10, 10, 10, 10, 10]))).toEqual({
      complete: true,
      legal: false,
      reason: "range",
    });
  });
});
