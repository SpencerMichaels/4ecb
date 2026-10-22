import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetBeastCompanionCard } from "@4ecb/sheet-model";

import { BeastCompanionCard, beastCompanionTitle } from "./BeastCompanionCard";
import { HideFlavortextContext } from "./HideFlavortextContext";

const card: SheetBeastCompanionCard = {
  kind: "beast",
  id: "WOLF",
  occurrenceId: "own-WOLF",
  name: "Ash",
  appearance: "timber wolf",
  category: "Wolf",
  level: 8,
  size: "Medium",
  speed: "7",
  vision: "Low-light",
  defenses: { ac: 22, fortitude: 20, reflex: 20, will: 21 },
  hitPoints: 78,
  bloodied: 39,
  healingSurgeValue: 19,
  healingSurges: 2,
  sharesHealingSurges: false,
  hitPointsFromMasterBloodied: false,
  abilities: [
    { name: "Strength", score: 16, modifier: 3 },
    { name: "Constitution", score: 14, modifier: 2 },
    { name: "Dexterity", score: 15, modifier: 2 },
    { name: "Intelligence", score: 6, modifier: -2 },
    { name: "Wisdom", score: 15, modifier: 2 },
    { name: "Charisma", score: 6, modifier: -2 },
  ],
  attack: { name: "Bite", attackBonus: 12, defense: "AC", damage: "1d8+3" },
  savingThrows: 2,
  resistances: [{ type: "poison", value: 5 }],
  skills: [
    { name: "Perception", total: 11, trained: true },
    { name: "Stealth", total: 6, trained: false },
  ],
  notes: [
    {
      text: "+2 AC against opportunity attacks.",
      source: "Nimble Companion",
      provenanceId: "nimble",
    },
  ],
  traits: [{ label: "Combat Advantage", text: "The target is knocked prone." }],
  commands: "Attack or defend: standard action.",
  description: "A loyal hunter.",
  source: "Test Book",
  abilityIncreaseIds: [],
};

describe("beast companion card", () => {
  it("prints the beast's stat block in the play-data frame", () => {
    const html = renderToStaticMarkup(<BeastCompanionCard card={card} />);
    expect(html).toContain(
      "print-play-card print-familiar-card print-beast-card",
    );
    expect(html).toContain("Ash — timber wolf");
    expect(html).toContain("Level 8 Medium beast · Wolf");
    expect(html).toContain("<dt>AC</dt><dd>22</dd>");
    expect(html).toContain("<dt>Will</dt><dd>21</dd>");
    expect(html).toContain("<dt>HP</dt><dd>78</dd>");
    expect(html).toContain("<dt>Bloodied</dt><dd>39</dd>");
    expect(html).toContain("<dt>Surge</dt><dd>19</dd>");
    expect(html).toContain("<dt>Surges</dt><dd>2</dd>");
    expect(html).toContain('<span class="stat-tile-lead">16</span>');
    expect(html).toContain('<span class="stat-tile-label">STR</span>');
    expect(html).toContain("<dd>+3</dd>");
    expect(html).toContain("7 · Low-light vision");
    expect(html).toContain("<strong>Bite</strong> +12 vs AC · 1d8+3 damage");
    expect(html).toContain("+2 to saving throws · Resist 5 poison");
    expect(html).toContain("<strong>Trained</strong> Perception +11");
    expect(html).toContain("<strong>Skills</strong> Stealth +6");
    expect(html).toContain("+2 AC against opportunity attacks.");
    expect(html).toContain("(Nimble Companion)");
    expect(html.indexOf("Situational")).toBeLessThan(
      html.indexOf("Combat Advantage"),
    );
    expect(html).toContain("Attack or defend: standard action.");
    expect(html).toContain("A loyal hunter.");
    expect(html).toContain("<span>Beast Companion</span>");
  });

  it("shows a sentinel's shared surges and hides the flavor text", () => {
    const sentinel: SheetBeastCompanionCard = {
      ...card,
      sharesHealingSurges: true,
      hitPointsFromMasterBloodied: true,
      notes: [],
    };
    delete (sentinel as { healingSurges?: number }).healingSurges;
    const html = renderToStaticMarkup(
      <HideFlavortextContext.Provider value={true}>
        <BeastCompanionCard card={sentinel} layout="panel" />
      </HideFlavortextContext.Provider>,
    );
    expect(html).toContain("is-panel");
    expect(html).toContain(
      '<dt>Surges</dt><dd title="Shares your healing surges">Yours</dd>',
    );
    expect(html).toContain('<dd title="Your bloodied value">78</dd>');
    expect(html).not.toContain("Situational");
    expect(html).not.toContain("A loyal hunter.");
  });

  it("titles an unnamed beast by its category", () => {
    const unnamed = { ...card, name: "Wolf" };
    delete (unnamed as { appearance?: string }).appearance;
    expect(beastCompanionTitle(unnamed)).toBe("Wolf");
    expect(beastCompanionTitle({ ...unnamed, name: "Ash" })).toBe("Ash — Wolf");
    const html = renderToStaticMarkup(<BeastCompanionCard card={unnamed} />);
    expect(html).toContain(
      '<p class="print-play-identity">Level 8 Medium beast</p>',
    );
  });
});
