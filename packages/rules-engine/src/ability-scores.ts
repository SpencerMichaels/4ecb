export const ABILITY_SCORE_NAMES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

export const ABILITY_POINT_BUY_BUDGET = 22;

const POINT_BUY_COSTS: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
  16: 11,
  17: 14,
  18: 18,
};

export type AbilityScoreName = (typeof ABILITY_SCORE_NAMES)[number];

export interface AbilityPointBuyAssessment {
  readonly complete: boolean;
  readonly legal: boolean;
  readonly spent?: number;
  readonly remaining?: number;
  readonly reason?: "missing" | "range" | "multiple-low-scores";
}

/** Mirrors D20RulesEngine's AbilityCost/TotalCost/LegalAbilityScores path. */
export function assessAbilityPointBuy(
  scores: Readonly<Record<string, number>>,
): AbilityPointBuyAssessment {
  const values = ABILITY_SCORE_NAMES.map((ability) => scores[ability]);
  if (values.some((value) => value === undefined))
    return { complete: false, legal: false, reason: "missing" };
  if (
    values.some(
      (value) =>
        value === undefined ||
        !Number.isInteger(value) ||
        POINT_BUY_COSTS[value] === undefined,
    )
  )
    return { complete: true, legal: false, reason: "range" };
  const definedValues = values as number[];
  if (definedValues.filter((value) => value < 10).length > 1)
    return {
      complete: true,
      legal: false,
      reason: "multiple-low-scores",
    };
  const spent =
    definedValues.reduce(
      (total, value) => total + (POINT_BUY_COSTS[value] ?? 0),
      0,
    ) - 10;
  const remaining = ABILITY_POINT_BUY_BUDGET - spent;
  return {
    complete: remaining <= 0,
    legal: remaining === 0,
    spent,
    remaining,
  };
}

export function pointBuyCostToRaise(score: number): number | undefined {
  const current = POINT_BUY_COSTS[score];
  const next = POINT_BUY_COSTS[score + 1];
  return current === undefined || next === undefined
    ? undefined
    : next - current;
}
