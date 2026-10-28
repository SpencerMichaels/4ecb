import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SheetCard } from "@4ecb/sheet-model";

import { PowerCard } from "./PowerCard";

const card: SheetCard = {
  id: "synthetic-strike",
  kind: "power",
  name: "Synthetic Strike",
  usage: "At-Will",
  actionType: "Standard Action",
  keywords: "Martial, Weapon",
  fields: [
    { label: "Attack Type", value: "Melee weapon" },
    { label: "Attack", value: "Strength vs. AC" },
    { label: "Hit", value: "1[W] + Strength modifier damage." },
  ],
};

describe("panel power card", () => {
  it("puts flavor directly under the name, before every band", () => {
    const markup = renderToStaticMarkup(
      createElement(PowerCard, {
        card,
        characterLevel: 1,
        layout: "panel",
        panel: { flavor: "A synthetic flourish." },
      }),
    );
    const flavor = markup.indexOf("print-card-flavor");
    expect(flavor).toBeGreaterThan(markup.indexOf("</header>"));
    expect(flavor).toBeLessThan(markup.indexOf("print-card-keyword-band"));
    expect(flavor).toBeLessThan(markup.indexOf("print-card-action-band"));
    expect(markup.indexOf("print-card-body")).toBeGreaterThan(flavor);
  });

  it("shows evaluated encounter uses on the usage line of every layout", () => {
    for (const layout of ["print", "panel"] as const) {
      const markup = renderToStaticMarkup(
        createElement(PowerCard, {
          card: { ...card, usage: "Encounter", encounterUses: 2 },
          characterLevel: 1,
          layout,
        }),
      );
      expect(markup).toContain("<span>Encounter (2×) power</span>");
    }
  });

  it("never shows flavor on printed cards", () => {
    const markup = renderToStaticMarkup(
      createElement(PowerCard, {
        card: { ...card, flavor: "A synthetic flourish." },
        characterLevel: 1,
      }),
    );
    expect(markup).not.toContain("A synthetic flourish.");
  });
});

describe("legacy power card parts", () => {
  const render = (value: SheetCard) =>
    renderToStaticMarkup(
      createElement(PowerCard, { card: value, characterLevel: 1 }),
    );

  it("ends the type bar with the class block before the level", () => {
    const markup = render({
      ...card,
      classBlock: "Synthetic Monk",
      fields: [...card.fields, { label: "Level", value: "1" }],
    });
    expect(markup).toContain(
      '<div class="print-card-type"><span>At-Will power</span><span>Synthetic Monk · Level 1</span></div>',
    );
    // Neither part on the card: the bar holds only the type.
    expect(render(card)).toContain(
      '<div class="print-card-type"><span>At-Will power</span></div>',
    );
  });

  it("subtitles a spellbook power beside its name", () => {
    const markup = render({ ...card, spellbook: true });
    expect(markup).toContain(
      '</h3><span class="print-card-name-subtext">Spellbook</span>',
    );
    expect(render(card)).not.toContain("print-card-name-subtext");
  });

  it("appends a full discipline's movement technique after its attack", () => {
    const markup = render({
      ...card,
      variants: [
        {
          id: "synthetic-strike:hand",
          equipmentName: "Synthetic Hand",
          equipped: true,
          powerBonus: 0,
          attack: "+5 vs AC",
          damage: "1d8+3",
        },
      ],
      movementTechnique: {
        id: "synthetic-technique",
        name: "Synthetic Strike [Movement Technique]",
        actionType: "Move Action",
        attackType: "Personal",
        fields: [{ label: "Effect", value: "You shift 2 squares." }],
      },
    });
    const technique = markup.indexOf('class="print-card-technique"');
    expect(technique).toBeGreaterThan(markup.indexOf("1[W] + Strength"));
    expect(technique).toBeLessThan(markup.indexOf("print-card-variant"));
    const section = markup.slice(
      technique,
      markup.indexOf("</section>", technique),
    );
    expect(section).toContain("Movement Technique</strong>");
    expect(section).toContain("Move</span>");
    expect(section).toContain("Personal</span>");
    expect(section).toContain("<strong>Effect:</strong>");
    expect(section).toContain("You shift 2 squares.");
  });
});
