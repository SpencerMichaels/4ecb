import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@4ecb/character-domain";
import type { EvaluatedChoice } from "@4ecb/rules-engine";

import { CompanionNameFields, hasCompanionChoice } from "./CompanionNameFields";

describe("companion name fields", () => {
  it("edit the legacy companion name and appearance textstrings", () => {
    const build = {
      textStrings: { _COMPANION_NAME: "Ash" },
    } as unknown as CharacterRecord["build"];
    const html = renderToStaticMarkup(
      <CompanionNameFields build={build} onDispatch={() => undefined} />,
    );
    expect(html).toContain("Name");
    expect(html).toContain('value="Ash"');
    expect(html).toContain("Appearance");
    expect(html).toContain('value=""');
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
