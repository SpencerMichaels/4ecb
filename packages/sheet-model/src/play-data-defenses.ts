import type { DefensiveTrait } from "./defensive-traits";
import type { ConditionalModifier } from "./conditional-modifiers";

/**
 * The Play data card's Defenses line (owner decision, 2026-11-05): only the
 * defenses that always apply (resistances, immunities, vulnerabilities,
 * save bonuses), then a pointer to page 1's Conditional modifiers pane when
 * the character has defenses that apply only in a situation. The pane
 * already lists every one of those with its value and source, so the card
 * never repeats them.
 */

/** Page 1's pane that lists conditional defenses (SheetOverview.tsx). */
export const CONDITIONAL_MODIFIERS_HEADING = "Conditional modifiers";

/** The card line's pointer to that pane. */
export const CONDITIONAL_DEFENSES_POINTER = `conditional defenses in ${CONDITIONAL_MODIFIERS_HEADING}`;

export const isSavingThrowTrait = (trait: DefensiveTrait) =>
  ["Saving throws", "Death saves"].includes(trait.label);

/** Compact, self-contained defensive clause, e.g. "Resist 5 fire". */
export function defensiveTraitText(trait: DefensiveTrait): string {
  const numeric = /^(.+?) (\d+)(.*)$/.exec(trait.value);
  if (numeric && ["Resistance", "Vulnerability"].includes(trait.label))
    return `${trait.label === "Resistance" ? "Resist" : "Vulnerable"} ${numeric[2]} ${numeric[1]!.toLowerCase()}${numeric[3] ?? ""}`;
  if (
    /^immunit(?:y|ies)$/i.test(trait.group ?? trait.label) &&
    !/\bimmun(?:e|ity)\b/i.test(trait.value)
  )
    return `Immune to ${trait.value}`;
  if (trait.label === "Resistance / vulnerability")
    return `Resistance / vulnerability: ${trait.value}`;
  const text = isSavingThrowTrait(trait)
    ? trait.value.replace(/\bagainst\b/gi, "vs")
    : trait.value;
  return text.replace(
    /^(\s*(?:\*\*|__|\*|_)?)(\p{Ll})/u,
    (_, prefix: string, letter: string) => prefix + letter.toUpperCase(),
  );
}

/** Kinds that share their leading word on the card: "Resist 5 fire, 7
 *  cold". */
const GROUPS: readonly (readonly [string, RegExp])[] = [
  ["Resist", /^Resist\s+/i],
  ["Vulnerable", /^Vulnerable\s+/i],
  ["Immune to", /^Immune(?:\s+to)?\s+/i],
];

export interface PlayDataDefensesInput {
  /** The evaluated saving throw total ("+2"; "+0" or "" for none). */
  readonly saves: string;
  readonly defensiveTraits: readonly DefensiveTrait[];
  readonly conditionalModifiers: readonly ConditionalModifier[];
}

/** Whether the evaluator says the trait always applies: a resistance,
 *  vulnerability or save total, not a conditional contribution or a
 *  feature's or item's own clause (whose text says when it applies). */
const alwaysApplies = (trait: DefensiveTrait) =>
  !trait.conditional && !trait.authored;

/** Whether the character has any defense that applies only in a situation
 *  (a conditional resistance or save bonus, a conditional bonus to a
 *  defense score) or that only a feature's or item's text states: the
 *  Conditional modifiers pane lists them. */
export function hasConditionalDefenses(input: PlayDataDefensesInput): boolean {
  return (
    input.defensiveTraits.some((trait) => !alwaysApplies(trait)) ||
    input.conditionalModifiers.some(
      (modifier) => modifier.surface === "defenses",
    )
  );
}

/** The card's Defenses line, "" when the character has no defenses beyond
 *  its four scores. */
export function playDataDefenseLine(input: PlayDataDefensesInput): string {
  const texts = input.defensiveTraits
    .filter(alwaysApplies)
    .map((trait) => ({ trait, text: defensiveTraitText(trait) }));
  const clauses: string[] = [];
  for (const [word, prefix] of GROUPS) {
    const values = texts
      .filter(
        ({ trait, text }) => !isSavingThrowTrait(trait) && prefix.test(text),
      )
      .map(({ text }) => text.replace(prefix, ""));
    if (values.length) clauses.push(`${word} ${values.join(", ")}`);
  }
  clauses.push(
    ...texts
      .filter(
        ({ trait, text }) =>
          !isSavingThrowTrait(trait) &&
          !GROUPS.some(([, prefix]) => prefix.test(text)),
      )
      .map(({ text }) => text),
  );
  const saves = input.saves.trim();
  if (saves && !/^[+-]?0$/.test(saves)) clauses.push(`${saves} to saves`);
  clauses.push(
    ...texts
      .filter(({ trait }) => isSavingThrowTrait(trait))
      .map(({ text }) => text),
  );
  if (hasConditionalDefenses(input)) clauses.push(CONDITIONAL_DEFENSES_POINTER);
  // A pointer alone starts the line: "Conditional defenses in …".
  return clauses
    .join("; ")
    .replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}
