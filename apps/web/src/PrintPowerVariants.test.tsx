import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetPowerAttack, SheetPowerVariant } from "@4ecb/sheet-model";
import { PrintPowerVariants } from "./PrintPowerVariants";

function attack(
  ordinal: number,
  extra: Partial<SheetPowerAttack> = {},
): SheetPowerAttack {
  return {
    id: `attack-${ordinal}`,
    ordinal,
    ability: "Strength",
    powerBonus: 0,
    attack: "+12 vs AC",
    damage: "2d8+5",
    ...extra,
  };
}
function render(
  attacks: readonly SheetPowerAttack[],
  extra: Partial<SheetPowerVariant> = {},
) {
  return renderToStaticMarkup(
    <PrintPowerVariants
      attackOrdinals={attacks.map((phase) => phase.ordinal)}
      variants={[
        {
          id: "blade",
          equipmentName: "Longsword",
          equipped: true,
          attacks,
          ...extra,
        },
      ]}
    />,
  );
}
function text(markup: string) {
  return markup.replace(/<[^>]*>/g, "");
}

describe("printed weapon calculation summaries", () => {
  it("uses a compact arrow line for one attack or identical repeated attacks", () => {
    for (const phases of [[attack(1)], [attack(1), attack(2)]]) {
      const markup = render(phases);
      expect(markup).not.toContain("<table");
      expect(text(markup)).toBe("Longsword: +12 → 2d8 + 5");
      expect(text(markup)).not.toMatch(/damage|equipped|vs AC|;/i);
    }
  });
  it.each([
    { ability: "Charisma", attack: "+10 vs Will" },
    { damage: "1d8+5" },
    { damageType: "thunder" },
    { weaponRole: "off" as const },
  ])("keeps different phase calculations in distinct columns: %j", (change) => {
    const markup = render([
      attack(1, { damageType: "fire" }),
      attack(2, { damageType: "fire", ...change }),
    ]);
    expect(markup).toContain("<table");
    expect(text(markup)).toContain("WeaponAttack 1Attack 2Longsword");
    expect((text(markup).match(/Longsword/g) ?? []).length).toBe(1);
    expect(text(markup)).toContain("+12 → 2d8 + 5 fire");
  });
  it("preserves compound types and shows a dash for ineligible or missing phases", () => {
    const markup = render([
      attack(1, { damageType: "cold and lightning" }),
      attack(2, { eligible: false }),
    ]);
    expect(text(markup)).toContain("+12 → 2d8 + 5 cold and lightning—");
    expect(markup).toContain("<wbr/>");
    const missing = renderToStaticMarkup(
      <PrintPowerVariants
        attackOrdinals={[1, 2]}
        variants={[
          {
            id: "cached",
            equipmentName: "Cached weapon",
            equipped: false,
            attack: "+7 vs AC",
            damage: "1d6+2",
          },
        ]}
      />,
    );
    expect(text(missing)).toContain("+7 → 1d6 + 2—");
  });
});
