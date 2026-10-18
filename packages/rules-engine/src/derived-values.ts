import type { EvaluatedStat } from "./stats";

/** 4E ability modifier: (score − 10) / 2, rounded down. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Half the character level, rounded down. */
export function halfLevel(level: number): number {
  return Math.floor(level / 2);
}

/** Bloodied value: half of maximum hit points (legacy PanelModelHitPoints). */
export function bloodiedValue(
  hitPoints: number | undefined,
): number | undefined {
  return hitPoints === undefined ? undefined : Math.floor(hitPoints / 2);
}

/**
 * Healing surge value shown on sheets: a quarter of maximum hit points plus the
 * native "Healing Surge Value" stat, which is an additive bonus rather than the
 * total (legacy PanelModelHitPoints.Update and SecondWindCard).
 */
export function healingSurgeValue(
  hitPoints: number | undefined,
  bonus: number | undefined,
): number | undefined {
  return hitPoints === undefined
    ? undefined
    : Math.floor(hitPoints / 4) + (bonus ?? 0);
}

function numericStat(
  stats: Readonly<Record<string, EvaluatedStat>>,
  name: string,
): number | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  const stat = Object.entries(stats).find(
    ([candidate]) => candidate.trim().toLocaleLowerCase() === wanted,
  )?.[1];
  const value = Number(stat?.value);
  return stat === undefined || !Number.isFinite(value) ? undefined : value;
}

export function evaluatedHealingSurgeValue(
  stats: Readonly<Record<string, EvaluatedStat>>,
): number | undefined {
  return healingSurgeValue(
    numericStat(stats, "Hit Points"),
    numericStat(stats, "Healing Surge Value"),
  );
}
