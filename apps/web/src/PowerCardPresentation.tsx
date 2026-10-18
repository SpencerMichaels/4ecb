import { Fragment, type ReactNode } from "react";

/**
 * Display-only transforms for power rules text on cards: ability-name
 * abbreviation for Build comparisons, weapon-dice expansion, and compact
 * ability values. Calculations stay in the rules engine and sheet model.
 */

const ABILITY_ABBREVIATIONS = [
  ["Strength", "STR"],
  ["Constitution", "CON"],
  ["Dexterity", "DEX"],
  ["Intelligence", "INT"],
  ["Wisdom", "WIS"],
  ["Charisma", "CHA"],
] as const;

export function abbreviatePowerAbilities(value: string): string {
  return ABILITY_ABBREVIATIONS.reduce(
    (result, [ability, abbreviation]) =>
      result.replace(
        new RegExp(`\\b(?:your\\s+)?${ability}(?:\\s+modifier)?\\b`, "giu"),
        abbreviation,
      ),
    value,
  );
}

export function expandWeaponDice(
  value: string,
  weaponDamage: string | undefined,
): string {
  const weapon = weaponDamage?.match(/^(\d+)d(\d+)$/iu);
  if (weapon?.[1] === undefined || weapon[2] === undefined) return value;
  return value.replace(
    /\b(\d+)?\[W\]/giu,
    (match, count: string | undefined) => {
      const multiplier = count === undefined ? 1 : Number(count);
      if (!Number.isFinite(multiplier)) return match;
      return `${Number(weapon[1]) * multiplier}d${weapon[2]}`;
    },
  );
}

const ABILITY_VALUE_PATTERN =
  /\b(?:your\s+)?(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\s+\(([+-]\d+)\)|\b(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+\(([+-]\d+)\)(?=\s+vs\.?\s)/giu;

export function renderPowerText(
  value: string,
  abbreviateAbilityValues: boolean,
): ReactNode {
  if (!abbreviateAbilityValues) return value;
  const matches = [...value.matchAll(ABILITY_VALUE_PATTERN)];
  if (matches.length === 0) return value;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, match] of matches.entries()) {
    const start = match.index;
    const ability = match[1] ?? match[3] ?? "Ability";
    const modifier = match[2] ?? match[4] ?? "";
    const preceding = value.slice(cursor, start);
    const followsAddition = /\+\s*$/u.test(preceding);
    const displayedPreceding =
      followsAddition && modifier.startsWith("-")
        ? preceding.replace(/\+\s*$/u, "- ")
        : preceding;
    const displayedModifier =
      followsAddition && /^[+-]/u.test(modifier) ? modifier.slice(1) : modifier;
    if (displayedPreceding.length > 0) nodes.push(displayedPreceding);
    nodes.push(
      <abbr
        className="power-value-abbreviation"
        key={`${start}-${index}`}
        title={`${ability} modifier`}
      >
        {displayedModifier}
      </abbr>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}
