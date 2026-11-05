import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetFamiliarCard } from "@4ecb/sheet-model";

import { FamiliarCard, familiarCardTitle } from "./FamiliarCard";
import { HideFlavortextContext } from "./HideFlavortextContext";

const card: SheetFamiliarCard = {
  kind: "familiar",
  id: "FAMILIAR_TEST",
  name: "Test Sprite",
  size: "Tiny",
  tier: "Heroic Tier",
  speed: "6, fly 6",
  senses: "Low-light vision",
  defenses: { ac: 19, fortitude: 14, reflex: 16, will: 17 },
  hitPoints: 1,
  constantBenefits: "You gain a +2 bonus to Arcana checks.",
  activeBenefits: "Light: You shed bright light.",
  description: "A helpful spirit.",
  source: "Test Book",
};

describe("familiar card", () => {
  it("prints the familiar's statistics in the play-data frame", () => {
    const html = renderToStaticMarkup(<FamiliarCard card={card} />);
    expect(html).toContain("print-play-card print-familiar-card");
    expect(html).toContain("Tiny familiar · Heroic Tier");
    expect(html).toContain("<dt>AC</dt><dd>19</dd>");
    expect(html).toContain("<dt>HP</dt><dd>1</dd>");
    expect(html).toContain("<dt>Speed</dt><dd>6, fly 6</dd>");
    expect(html).toContain("Low-light vision");
    expect(html).toContain("A missed attack never damages it.");
    expect(html.indexOf("Constant benefits")).toBeLessThan(
      html.indexOf("Active benefits"),
    );
    expect(html).toContain("<span>Familiar</span>");
  });

  it("prints mechanics only; the builder pane shows the description", () => {
    // Owner, 2026-11-04: familiars "Same as beasts" (D110).
    expect(renderToStaticMarkup(<FamiliarCard card={card} />)).not.toContain(
      "A helpful spirit.",
    );
    // As flavor text, under the header and above the defense tiles.
    const pane = renderToStaticMarkup(
      <FamiliarCard card={card} layout="panel" />,
    );
    expect(pane).toContain(
      '<p class="print-card-flavor">A helpful spirit.</p>',
    );
    expect(pane.indexOf("print-card-flavor")).toBeGreaterThan(
      pane.indexOf("</header>"),
    );
    expect(pane.indexOf("print-card-flavor")).toBeLessThan(
      pane.indexOf('aria-label="Defenses"'),
    );
  });

  it("hides the builder pane's description with flavor text", () => {
    const html = renderToStaticMarkup(
      <HideFlavortextContext.Provider value={true}>
        <FamiliarCard card={card} layout="panel" />
      </HideFlavortextContext.Provider>,
    );
    expect(html).not.toContain("A helpful spirit.");
  });

  it("renders each benefit paragraph as its own paragraph", () => {
    const html = renderToStaticMarkup(
      <FamiliarCard
        card={{
          ...card,
          activeBenefits:
            "Independent Spirit: No range limit.\nSilent Predator: +5 to Stealth.",
        }}
      />,
    );
    expect(html).toContain(
      '<p class="prose-paragraph">Independent Spirit: No range limit.</p><p class="prose-paragraph">Silent Predator: +5 to Stealth.</p>',
    );
  });

  it("drops a benefit's See Below lead before its list", () => {
    // Spiderling of Lolth's "Passive Benefits".
    for (const layout of ["print", "panel"] as const) {
      const html = renderToStaticMarkup(
        <FamiliarCard
          card={{
            ...card,
            constantBenefits:
              "See Below:\n* Venom Affinity: +2 to saves.\n* Webs of Malice: -1 to saves.",
          }}
          layout={layout}
        />,
      );
      expect(html).not.toMatch(/see below/i);
      expect(html).toContain(
        '<h4>Constant benefits</h4><div class="prose-blocks"><ul><li>Venom Affinity: +2 to saves.</li>',
      );
    }
  });

  it("prints a split familiar as a stats card and a notes card", () => {
    const stats = renderToStaticMarkup(
      <FamiliarCard card={{ ...card, part: "stats" }} />,
    );
    expect(stats).toContain('data-familiar-part="stats"');
    expect(stats).toContain("<dt>HP</dt><dd>1</dd>");
    expect(stats).toContain("A missed attack never damages it.");
    expect(stats).not.toContain("Constant benefits");
    const notes = renderToStaticMarkup(
      <FamiliarCard card={{ ...card, part: "notes" }} />,
    );
    expect(notes).toContain('data-familiar-part="notes"');
    expect(notes).toContain("Test Sprite — Notes");
    expect(notes).toContain("Constant benefits");
    expect(notes).toContain("Active benefits");
    expect(notes).not.toContain("<dt>HP</dt>");
    expect(notes).not.toContain("A missed attack never damages it.");
    expect(familiarCardTitle(card)).toBe("Test Sprite");
  });
});
