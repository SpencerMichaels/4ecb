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
 * the companion choice: the name as a short inline field (the Details tab's
 * Player width), the appearance as a freeform multi-line box beneath it like
 * the Details tab's Appearance note. The beast companion card reads both.
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
      className="companion-name-fields"
    >
      <div className="character-inline-fields">
        <CharacterTextField
          inlineLabel
          label="Name"
          name={COMPANION_NAME_TEXT}
          value={build.textStrings[COMPANION_NAME_TEXT] ?? ""}
          onDispatch={onDispatch}
        />
      </div>
      <CharacterTextField
        className="companion-appearance-field"
        label="Appearance"
        multiline
        name={COMPANION_APPEARANCE_TEXT}
        value={build.textStrings[COMPANION_APPEARANCE_TEXT] ?? ""}
        onDispatch={onDispatch}
      />
    </section>
  );
}
