import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SheetCard } from "@4ecb/sheet-model";

import { PowerCard } from "./PowerCard";
import { dotted } from "./test-dot-list";

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
      // One "·" list, whose separator drops when "Level 1" wraps (DotList).
      '<div class="print-card-type"><span>At-Will power</span><span><span class="dot-list"><span class="dot-list-item">Synthetic Monk</span> <span class="dot-list-item">Level 1</span></span></span></div>',
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

  it("puts a full discipline's movement technique in a band at the card's foot", () => {
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
      additionalEffects: [
        { text: "Synthetic rider.", source: "authoritative-evaluation" },
      ],
    });
    // Free space, then the weapon table, the technique and additional
    // effects at the foot (owner 2026-11-05).
    const technique = markup.indexOf('class="print-card-technique"');
    const spacer = markup.indexOf('class="print-card-spacer"');
    expect(spacer).toBeGreaterThan(markup.indexOf("1[W] + Strength"));
    expect(markup.indexOf("print-card-variant")).toBeGreaterThan(spacer);
    expect(technique).toBeGreaterThan(markup.indexOf("print-card-variant"));
    expect(markup.indexOf("print-card-additional")).toBeGreaterThan(technique);
    const section = markup.slice(
      technique,
      markup.indexOf("</section>", technique),
    );
    // "≫ MOVEMENT TECHNIQUE · Move Action" beside the attack type.
    expect(dotted(section)).toContain(
      '<div class="print-card-action-band print-card-technique-band"><span class="print-card-action-types"><span class="print-card-action-line"><span class="selection-metadata-icon action-type-icon" aria-hidden="true" title="Move Action">',
    );
    expect(dotted(section)).toContain(
      '<strong class="print-card-technique-title">Movement Technique</strong> · Move Action</span></span></span></span><span>',
    );
    expect(section).not.toContain("lucide-timer");
    expect(section).toContain("Personal</span></div>");
    expect(section).toContain(
      '<div class="print-card-technique-rules"><div class="print-card-rule-line"><strong>Effect:</strong>',
    );
    expect(section).toContain("You shift 2 squares.");
  });

  it("keeps the technique's own action and no attack-type cell without one", () => {
    const markup = render({
      ...card,
      movementTechnique: {
        id: "synthetic-technique",
        name: "Synthetic Strike [Movement Technique]",
        actionType: "Minor Action",
        fields: [{ label: "Effect", value: "You stand up." }],
      },
    });
    const band = markup.slice(
      markup.indexOf("print-card-technique-band"),
      markup.indexOf("print-card-technique-rules"),
    );
    expect(band).toContain('title="Minor Action"');
    expect(dotted(band)).toContain(
      " · Minor Action</span></span></span></span></div>",
    );
    // A spacer still pushes the technique to the foot.
    expect(markup).toContain(
      '<div class="print-card-spacer" aria-hidden="true"></div>',
    );
  });
});
