interface LevelVariant {
  readonly level: number;
  readonly text: string;
  readonly kind: "line" | "damage-increase";
}

const LEVEL_LINE = /^\s*Level\s+(\d+):\s*(.+?)\s*$/gim;
const DAMAGE_INCREASE =
  /\bIncrease damage to\s+(.+?)\s+at\s+(\d+)(?:st|nd|rd|th)\s+level\.?/gi;
const BONUS_DAMAGE_INCREASE =
  /(?:\bIncrease\s+)?to\s+[+-]?\d+\s+bonus\s+and\s+(.+?\bdamage)\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/gi;
const BONUS_DAMAGE_INCREASE_CHAIN =
  /\bIncrease\s+to\s+[+-]?\d+\s+bonus\s+and\s+.+?\bdamage\s+at\s+\d+(?:st|nd|rd|th)\s+level(?:\s*,?\s*and\s+to\s+[+-]?\d+\s+bonus\s+and\s+.+?\bdamage\s+at\s+\d+(?:st|nd|rd|th)\s+level)*\.?/gi;
const DAMAGE_EXPRESSION =
  /\b(?:\d+\s*\[W\]|\d+d\d+)(?:\s*\+\s*[^,.;]+?)?\s+damage\b/i;

function cleanRemovedVariants(value: string): string {
  return value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Select the authored tier that applies at the character's current level.
 * Unknown prose stays intact; only confirmed conventions used by the legacy
 * corpus are reduced.
 */
export function powerTextAtLevel(value: string, level: number): string {
  if (!Number.isFinite(level) || level < 1) return value;

  const bonusDamageChains = [...value.matchAll(BONUS_DAMAGE_INCREASE_CHAIN)];
  const variants: LevelVariant[] = [
    ...[...value.matchAll(LEVEL_LINE)].flatMap((match) =>
      match[1] === undefined || match[2] === undefined
        ? []
        : [
            {
              level: Number(match[1]),
              text: match[2].trim(),
              kind: "line" as const,
            },
          ],
    ),
    ...[...value.matchAll(DAMAGE_INCREASE)].flatMap((match) =>
      match[1] === undefined || match[2] === undefined
        ? []
        : [
            {
              level: Number(match[2]),
              text: match[1].trim(),
              kind: "damage-increase" as const,
            },
          ],
    ),
    ...bonusDamageChains.flatMap((chain) =>
      [...chain[0].matchAll(BONUS_DAMAGE_INCREASE)].flatMap((match) =>
        match[1] === undefined || match[2] === undefined
          ? []
          : [
              {
                level: Number(match[2]),
                text: match[1].trim(),
                kind: "damage-increase" as const,
              },
            ],
      ),
    ),
  ];
  if (variants.length === 0) return value;

  const base = cleanRemovedVariants(
    value
      .replace(LEVEL_LINE, "")
      .replace(DAMAGE_INCREASE, "")
      .replace(BONUS_DAMAGE_INCREASE_CHAIN, ""),
  );
  const selected = variants
    .filter((variant) => variant.level <= level)
    .sort((left, right) => right.level - left.level)[0];
  if (selected === undefined) return base;

  const selectedDamage =
    selected.text.match(/^(.+?\bdamage\b)/i)?.[1] ??
    (selected.kind === "damage-increase"
      ? `${selected.text.replace(/[.]+$/, "")} damage`
      : undefined);
  if (selectedDamage !== undefined && DAMAGE_EXPRESSION.test(base))
    return cleanRemovedVariants(
      base.replace(DAMAGE_EXPRESSION, selectedDamage),
    );

  // A Level N line without a safely replaceable damage phrase is authored as
  // a complete alternative. Damage-increase prose is left alone if it cannot
  // be applied without guessing where the replacement belongs.
  return selected.kind === "line" ? selected.text : value;
}
