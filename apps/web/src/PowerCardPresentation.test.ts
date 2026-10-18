import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  abbreviatePowerAbilities,
  expandWeaponDice,
  renderPowerText,
} from "./PowerCardPresentation";

const markup = (value: string) =>
  renderToStaticMarkup(
    createElement(Fragment, null, renderPowerText(value, true)),
  );

describe("power card text presentation", () => {
  it("keeps Build formulas authored while abbreviating ability names", () => {
    expect(
      abbreviatePowerAbilities(
        "Strength + 1 vs. AC; 2[W] + your Strength modifier damage, and gain your Wisdom modifier temporary hit points.",
      ),
    ).toBe(
      "STR + 1 vs. AC; 2[W] + STR damage, and gain WIS temporary hit points.",
    );
  });

  it("expands weapon dice from the weapon's damage", () => {
    expect(expandWeaponDice("Hit: 2[W] + 1[W].", "1d8")).toBe(
      "Hit: 2d8 + 1d8.",
    );
    expect(expandWeaponDice("Hit: 2[W].", "2d4")).toBe("Hit: 4d4.");
    expect(expandWeaponDice("Hit: 2[W].", undefined)).toBe("Hit: 2[W].");
  });

  it("renders compact ability tooltips without changing half-level text", () => {
    const rendered = markup(
      "2[W] + Charisma modifier (+4) damage and half your level (+3) more.",
    );
    expect(rendered).toContain(
      '<abbr class="power-value-abbreviation" title="Charisma modifier">4</abbr>',
    );
    expect(rendered).toContain("half your level (+3)");
    expect(rendered).not.toContain("Charisma modifier (+4)");
    expect(rendered).not.toContain("+ +4");
    expect(rendered).toContain("2[W] + <abbr");
    expect(markup("Your Charisma modifier (+4) applies.")).toContain(
      'title="Charisma modifier">+4</abbr> applies.',
    );
    expect(renderPowerText("Charisma modifier (+4)", false)).toBe(
      "Charisma modifier (+4)",
    );
  });
});
