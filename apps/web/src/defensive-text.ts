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
