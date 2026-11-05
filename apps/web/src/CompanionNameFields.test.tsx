import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@4ecb/character-domain";
import type { EvaluatedChoice } from "@4ecb/rules-engine";

import { CompanionNameFields, hasCompanionChoice } from "./CompanionNameFields";
import { appStyles } from "./test-styles";

describe("companion name fields", () => {
  it("edit the legacy companion name and appearance textstrings", () => {
    const build = {
      textStrings: {
        _COMPANION_NAME: "Ash",
        _COMPANION_APPEARANCE: "Grey wolf.\nTorn left ear.",
      },
    } as unknown as CharacterRecord["build"];
    const html = renderToStaticMarkup(
      <CompanionNameFields build={build} onDispatch={() => undefined} />,
    );
    // Name: the Details tab's short inline field.
    expect(html).toMatch(
      /<div class="character-inline-fields"><label class="inline-field"><span class="inline-field-label">Name<\/span><input value="Ash"\/><\/label><\/div>/,
    );
    // Appearance: a multi-line box beneath it, like Details' Appearance note.
    expect(html).toContain(
      '<label class="companion-appearance-field"><span>Appearance</span><textarea rows="5">Grey wolf.\nTorn left ear.</textarea></label>',
    );
  });

  it("show an empty appearance box when none is written", () => {
    const build = {
      textStrings: {},
    } as unknown as CharacterRecord["build"];
    const html = renderToStaticMarkup(
      <CompanionNameFields build={build} onDispatch={() => undefined} />,
    );
    expect(html).toContain('<input value=""/>');
    expect(html).toContain('<textarea rows="5"></textarea>');
  });

  it("grow the appearance box with its text, as the Details notes do", () => {
    expect(appStyles).toMatch(
      /\.character-note-panel textarea,\s*\.companion-appearance-field textarea \{[^}]*field-sizing: content;/,
    );
  });

  it("belong to a section with a beast companion choice", () => {
    const choice = (type: string) => ({ type }) as unknown as EvaluatedChoice;
    expect(hasCompanionChoice([choice("Companion")])).toBe(true);
    expect(
      hasCompanionChoice([
        choice("Familiar"),
        choice("Companion Ability Increase (Level 4)"),
      ]),
    ).toBe(false);
  });
});
