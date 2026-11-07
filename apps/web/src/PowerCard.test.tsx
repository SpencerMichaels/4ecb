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

  it("badges Channel Divinity before a utility's usage badge", () => {
    const utility = {
      ...card,
      usage: "Encounter",
      fields: [...card.fields, { label: "Power Type", value: "Utility" }],
    };
    const both = renderToStaticMarkup(
      createElement(PowerCard, {
        card: { ...utility, sharedUsage: "Channel Divinity" },
        characterLevel: 1,
      }),
    );
    const cd = both.indexOf(">CD</span>");
    expect(cd).toBeGreaterThan(0);
    expect(cd).toBeLessThan(both.indexOf(">E</span>"));
    expect(both.indexOf(">E</span>")).toBeLessThan(both.indexOf("</header>"));
    const attack = renderToStaticMarkup(
      createElement(PowerCard, {
        card: { ...card, sharedUsage: "Channel Divinity" },
        characterLevel: 1,
      }),
    );
    expect(attack).toContain(">CD</span>");
    expect(attack).not.toContain(">W</span>");
    const plain = renderToStaticMarkup(
      createElement(PowerCard, { card: utility, characterLevel: 1 }),
    );
    expect(plain).not.toContain("print-channel-divinity-badge");
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

describe("augmentable power card (D118)", () => {
  const augmentable: SheetCard = {
    ...card,
    usage: "Encounter",
    augmentVersionIds: ["strike-0", "strike-2", "strike-4"],
    augments: [
      {
        id: "strike-2",
        augment: "2",
        fields: [{ label: "Hit", value: "As above, and slide the target 1." }],
        numbers: [
          { equipmentName: "Flail", damage: "2d10+6" },
          { equipmentName: "Unarmed", damage: "2d4+6" },
        ],
      },
      {
        id: "strike-4",
        augment: "4",
        fields: [{ label: "Effect", value: "The target is dazed." }],
        numbers: [{ attack: "+20 vs Will", damage: "3d10+6" }],
      },
    ],
  };

  it("prints each augment as a section after the power's rules", () => {
    for (const layout of ["print", "panel"] as const) {
      const markup = renderToStaticMarkup(
        createElement(PowerCard, {
          card: augmentable,
          characterLevel: 1,
          layout,
        }),
      );
      const base = markup.indexOf("1[W] + Strength");
      const two = markup.indexOf('aria-label="Augment 2"');
      const four = markup.indexOf('aria-label="Augment 4"');
      expect(base).toBeGreaterThan(0);
      expect(two).toBeGreaterThan(base);
      expect(four).toBeGreaterThan(two);
      const section = markup.slice(two, four);
      expect(section).toContain(
        '<p class="print-card-rule-line print-card-augment-title"><strong>Augment 2</strong></p>',
      );
      // The augment's own numbers, per weapon, then its rules.
      expect(section.indexOf("<strong>Flail:</strong>")).toBeLessThan(
        section.indexOf("<strong>Hit:</strong>"),
      );
      expect(section).toContain("2d10+6 damage");
      expect(section).toContain("2d4+6 damage");
      expect(section).toContain("As above, and slide the target 1.");
      const last = markup.slice(four);
      expect(last).toContain("<strong>Attack:</strong>");
      expect(last).toContain("+20 vs Will");
      expect(last).toContain("<strong>Damage:</strong>");
      expect(last).toContain("The target is dazed.");
    }
  });
});
