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

/**
 * A companion's bonus to one of its statistics: the character's `ALLY.`,
 * `COMPANION.` and kind-specific (`FAMILIAR.`) stats, summed as legacy
 * `CompanionStatBlock.GetCompanionStat` does.
 */
export function companionStatBonus(
  stats: Readonly<Record<string, EvaluatedStat>>,
  kind: "FAMILIAR",
  stat: string,
): number {
  return ["ALLY", "COMPANION", kind].reduce(
    (total, prefix) => total + (numericStat(stats, `${prefix}.${stat}`) ?? 0),
    0,
  );
}

/**
 * A familiar's speed: its authored base speed plus companion speed bonuses
 * (legacy `FamiliarBlock.Speed`). A base that is not a whole number is shown
 * as authored, without bonuses, as legacy does.
 */
export function familiarSpeed(
  baseSpeed: string | undefined,
  stats: Readonly<Record<string, EvaluatedStat>>,
): string | undefined {
  const base = baseSpeed?.trim();
  if (base === undefined || base === "") return undefined;
  if (!/^[+-]?\d+$/.test(base)) return base;
  return String(Number(base) + companionStatBonus(stats, "FAMILIAR", "Speed"));
}

export interface FamiliarDefenses {
  readonly ac: number | undefined;
  readonly fortitude: number | undefined;
  readonly reflex: number | undefined;
  readonly will: number | undefined;
}

/**
 * A familiar uses its master's defenses (Arcane Power, "Familiar Attributes"),
 * plus companion bonuses to that defense such as Vigorous Familiar's +1 AC.
 */
export function familiarDefenses(
  stats: Readonly<Record<string, EvaluatedStat>>,
): FamiliarDefenses {
  const defense = (stat: string, alias: string) => {
    const own = numericStat(stats, stat) ?? numericStat(stats, alias);
    return own === undefined
      ? undefined
      : own + companionStatBonus(stats, "FAMILIAR", stat);
  };
  return {
    ac: defense("AC", "Armor Class"),
    fortitude: defense("Fortitude Defense", "Fortitude"),
    reflex: defense("Reflex Defense", "Reflex"),
    will: defense("Will Defense", "Will"),
  };
}

/** A familiar has 1 hit point (Arcane Power, "Familiar Attributes"). */
export const FAMILIAR_HIT_POINTS = 1;
