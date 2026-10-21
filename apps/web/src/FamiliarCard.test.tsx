import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetFamiliarCard } from "@4ecb/sheet-model";

import { FamiliarCard } from "./FamiliarCard";
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
    expect(html).toContain("A helpful spirit.");
    expect(html).toContain("<span>Familiar</span>");
  });

  it("hides the description with flavor text", () => {
    const html = renderToStaticMarkup(
      <HideFlavortextContext.Provider value={true}>
        <FamiliarCard card={card} />
      </HideFlavortextContext.Provider>,
    );
    expect(html).not.toContain("A helpful spirit.");
  });
});
