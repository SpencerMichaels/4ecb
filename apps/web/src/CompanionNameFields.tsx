import type { CharacterCommand, CharacterRecord } from "@4ecb/character-domain";
import type { EvaluatedChoice } from "@4ecb/rules-engine";

import { CharacterTextField } from "./CharacterDetailsEditor";

/** The legacy textstrings the Companion panel names the beast with. */
export const COMPANION_NAME_TEXT = "_COMPANION_NAME";
export const COMPANION_APPEARANCE_TEXT = "_COMPANION_APPEARANCE";

/** Whether a Build tab section's choices include a beast companion choice. */
export function hasCompanionChoice(
  choices: readonly EvaluatedChoice[],
): boolean {
  return choices.some(
    (choice) => choice.type.trim().toLocaleLowerCase() === "companion",
  );
}

/**
 * The companion's name and appearance (legacy `_COMPANION_NAME` and
 * `_COMPANION_APPEARANCE`), shown in the Build tab's Companion section beside
 * the companion choice; the beast companion card's title reads them.
 */
export function CompanionNameFields({
  build,
  onDispatch,
}: {
  readonly build: CharacterRecord["build"];
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  return (
    <section
      aria-label="Companion name and appearance"
      className="character-inline-fields companion-name-fields"
    >
      <CharacterTextField
        inlineLabel
        label="Name"
        name={COMPANION_NAME_TEXT}
        value={build.textStrings[COMPANION_NAME_TEXT] ?? ""}
        onDispatch={onDispatch}
      />
      <CharacterTextField
        inlineLabel
        label="Appearance"
        name={COMPANION_APPEARANCE_TEXT}
        value={build.textStrings[COMPANION_APPEARANCE_TEXT] ?? ""}
        onDispatch={onDispatch}
      />
    </section>
  );
}
