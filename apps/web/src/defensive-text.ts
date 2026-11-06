import type { CharacterSheetModel } from "@4ecb/sheet-model";

export {
  defensiveTraitText as defensiveBonusText,
  isSavingThrowTrait,
} from "@4ecb/sheet-model";

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
