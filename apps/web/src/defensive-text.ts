import type { CharacterSheetModel } from "@4ecb/sheet-model";

export type OverviewDefensiveTrait = NonNullable<
  CharacterSheetModel["overview"]
>["defensiveTraits"][number];

export const isSavingThrowTrait = (trait: OverviewDefensiveTrait) =>
  ["Saving throws", "Death saves"].includes(trait.label);

/** Compact, self-contained defensive clause, e.g. "Resist 5 fire". */
export function defensiveBonusText(trait: OverviewDefensiveTrait) {
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

export type OverviewConditionalModifier = NonNullable<
  CharacterSheetModel["overview"]
>["conditionalModifiers"][number];

/** The Conditional modifiers pane's group for each sheet-model surface. */
export const CONDITIONAL_MODIFIER_GROUPS: Readonly<
  Record<OverviewConditionalModifier["surface"], string>
> = {
  defenses: "Defenses",
  initiative: "Initiative",
  speed: "Speed",
  skills: "Skills & checks",
  checks: "Skills & checks",
  health: "Health",
  allies: "Allies",
};

/** A conditional modifier as a self-contained clause, e.g. "+2 to speed when
 *  charging". */
export const conditionalModifierText = (
  modifier: OverviewConditionalModifier,
) => modifier.text.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
