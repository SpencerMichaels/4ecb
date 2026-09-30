import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createPowerCardPresentationFinder,
  defaultPowerVariant,
  expandWeaponDice,
  PowerTextInline,
  PowerVariantPanel,
} from "./PowerCardPresentation";

const variants = [
  {
    id: "inventory-axe",
    equipmentName: "Battleaxe",
    equipped: false,
    weaponDamage: "1d10",
    attackBonus: 7,
    defense: "AC",
    damage: "2d10+4",
  },
  {
    id: "off-dagger",
    equipmentName: "Left dagger",
    equipped: true,
    hand: "off" as const,
    weaponDamage: "1d4",
    attackBonus: 9,
    defense: "AC",
    damage: "2d4+4",
  },
  {
    id: "main-sword",
    equipmentName: "Main blade",
    equipped: true,
    hand: "main" as const,
    weaponDamage: "1d8",
    attackBonus: 10,
    defense: "AC",
    damage: "2d8+4",
  },
];

describe("interactive power-card presentation", () => {
  it("can evaluate a Build candidate that is not yet selected", () => {
    let resolutions = 0;
    const presentationFor = createPowerCardPresentationFinder(
      {
        level: 1,
        converged: true,
        iterations: 1,
        complete: true,
        legal: true,
        occurrences: [],
        activeDefinitionIds: [],
        activeDefinitions: [],
        choices: [],
        stats: {},
        textStrings: {},
        overlays: [],
        powers: [],
        suggestions: [],
        diagnostics: [],
      },
      [],
      {
        resolveAbilityChoices: true,
        abbreviateAbilityValues: true,
        expandWeaponDice: true,
      },
      (definitionId) => {
        resolutions += 1;
        return {
          definitionId,
          name: "Candidate strike",
          keywords: ["Weapon"],
          variants: variants.map((variant) => ({
            ...variant,
            attackComponents: [],
            damageComponents: [],
            conditionalDamage: [],
          })),
          recoveries: [],
          unsupported: [],
        };
      },
    );

    expect(
      presentationFor("candidate").variants.map((variant) => variant.id),
    ).toEqual(variants.map((variant) => variant.id));
    expect(presentationFor("candidate").variants).toHaveLength(3);
    expect(resolutions).toBe(1);
  });

  it("defaults to the equipped main hand, then expands its weapon dice", () => {
    expect(defaultPowerVariant(variants)?.id).toBe("main-sword");
    expect(expandWeaponDice("Hit: 2[W] + 1[W].", "1d8")).toBe(
      "Hit: 2d8 + 1d8.",
    );
    expect(expandWeaponDice("Hit: 2[W].", "2d4")).toBe("Hit: 4d4.");
  });

  it("renders compact ability tooltips without changing half-level text", () => {
    const markup = renderToStaticMarkup(
      createElement(PowerTextInline, {
        value:
          "2[W] + Charisma modifier (+4) damage and half your level (+3) more.",
        presentation: {
          personalizePowerText: (value) => value,
          abbreviateAbilityValues: true,
          expandWeaponDice: false,
          variants,
        },
        variant: variants[2],
      }),
    );
    expect(markup).toContain(
      '<abbr class="power-value-abbreviation" title="Charisma modifier">4</abbr>',
    );
    expect(markup).toContain("half your level (+3)");
    expect(markup).not.toContain("Charisma modifier (+4)");
    expect(markup).not.toContain("+ +4");
    expect(markup).toContain("2[W] + <abbr");

    const standalone = renderToStaticMarkup(
      createElement(PowerTextInline, {
        value: "Your Charisma modifier (+4) applies.",
        presentation: {
          personalizePowerText: (value) => value,
          abbreviateAbilityValues: true,
          expandWeaponDice: false,
          variants,
        },
      }),
    );
    expect(standalone).toContain(
      'title="Charisma modifier">+4</abbr> applies.',
    );
  });

  it("offers every compatible variant while marking inventory and hands", () => {
    const markup = renderToStaticMarkup(
      createElement(PowerVariantPanel, {
        variants,
        selected: variants[2]!,
        onSelect: () => undefined,
      }),
    );
    expect(markup).toContain("Compare weapons");
    expect(markup).toContain("Battleaxe · Inventory");
    expect(markup).toContain("Left dagger · Off hand");
    expect(markup).toContain("Main blade · Main hand");
    expect(markup).toContain("+10 vs AC");
    expect(markup).toContain("2d8+4");
    expect(markup.indexOf("Main blade · Main hand")).toBeLessThan(
      markup.indexOf("Battleaxe · Inventory"),
    );
  });
});
