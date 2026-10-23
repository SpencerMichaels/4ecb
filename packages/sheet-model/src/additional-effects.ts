import type { SheetAdditionalEffect } from "./index";

interface RollBonus {
  readonly value: string;
  readonly target: "attack" | "damage";
  /** " rolls" or "" (the authored wording, kept as written). */
  readonly rolls: string;
  /** "whenever you are adjacent to a wall", or "" */
  readonly condition: string;
  /** " - Back to the Wall." / " (Back to the Wall)." / "." / "" */
  readonly suffix: string;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "+1 to attack rolls whenever … - Source." as its parts, when the effect
 *  is one plain attack or damage bonus naming its own provider. */
function rollBonus(effect: SheetAdditionalEffect): RollBonus | undefined {
  const provider = effect.provider?.trim();
  if (!provider) return undefined;
  const text = effect.text.trim();
  const suffix =
    new RegExp(
      `(?: - ${escape(provider)}| \\(${escape(provider)}\\))\\.?$`,
      "i",
    ).exec(text)?.[0] ?? (text.endsWith(".") ? "." : "");
  const core = text.slice(0, text.length - suffix.length).trim();
  const match =
    /^([+-]\d+(?:d\d+)?(?:\s*[+-]\s*\d+)?)\s+to\s+(attack|damage)( rolls?)?(?:\s+(.*))?$/i.exec(
      core,
    );
  if (match === null) return undefined;
  return {
    value: match[1]!,
    target: match[2]!.toLocaleLowerCase() as RollBonus["target"],
    rolls: match[3] ?? "",
    condition: (match[4] ?? "").trim(),
    suffix,
  };
}

/**
 * One line per source for a paired attack and damage bonus. A feature such
 * as Back to the Wall contributes "+1 to attack rolls …" and "+1 to damage
 * rolls …" separately under the same condition; the card reads them as
 * "+1 to attack and damage rolls …" (or "+1 to attack rolls and +2 to damage
 * rolls …" when the values differ). Only exactly one attack and one damage
 * bonus from the same provider, condition, wording and provenance kind are
 * paired; everything else stays as it was, in order.
 */
export function mergeAdditionalEffects(
  effects: readonly SheetAdditionalEffect[],
): SheetAdditionalEffect[] {
  const parsed = effects.map(rollBonus);
  const groups = new Map<string, number[]>();
  parsed.forEach((bonus, index) => {
    if (bonus === undefined) return;
    const effect = effects[index]!;
    const groupKey = [
      effect.provider?.trim().toLocaleLowerCase(),
      bonus.condition.toLocaleLowerCase(),
      bonus.rolls.toLocaleLowerCase(),
      bonus.suffix.toLocaleLowerCase(),
      effect.source,
      effect.cardOnly === true,
    ].join("\0");
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), index]);
  });
  const merged = new Map<number, SheetAdditionalEffect>();
  const dropped = new Set<number>();
  for (const indexes of groups.values()) {
    if (indexes.length !== 2) continue;
    const [first, second] = indexes as [number, number];
    const attack = [first, second].find(
      (index) => parsed[index]!.target === "attack",
    );
    const damage = [first, second].find(
      (index) => parsed[index]!.target === "damage",
    );
    if (attack === undefined || damage === undefined) continue;
    const a = parsed[attack]!;
    const d = parsed[damage]!;
    const bonuses =
      a.value === d.value
        ? `${a.value} to attack and damage${a.rolls}`
        : `${a.value} to attack${a.rolls} and ${d.value} to damage${d.rolls}`;
    merged.set(first, {
      ...effects[first]!,
      text: `${bonuses}${a.condition === "" ? "" : ` ${a.condition}`}${a.suffix}`,
    });
    dropped.add(second);
  }
  return effects.flatMap((effect, index) =>
    dropped.has(index) ? [] : [merged.get(index) ?? effect],
  );
}
