import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetAssociateCard } from "@4ecb/sheet-model";

import { AssociateCard } from "./AssociateCard";

const card: SheetAssociateCard = {
  kind: "associate",
  id: "ASSOCIATE_HOUND",
  name: "Trained Moss Hound",
  role: "Fey Beast Companion",
  identity: "Medium fey beast",
  defenses: { ac: 27, fortitude: 25, reflex: 25, will: 25 },
  hitPoints: 41,
  hitPointsFrom: "Your bloodied value",
  bloodied: 20,
  initiative: 6,
  perception: 15,
  speed: "7",
  senses: "Low-light vision",
  abilities: [
    { name: "Strength", score: 14, modifier: 2 },
    { name: "Constitution", score: 17, modifier: 3 },
    { name: "Dexterity", score: 20, modifier: 5 },
    { name: "Intelligence", score: 2, modifier: -4 },
    { name: "Wisdom", score: 14, modifier: 2 },
    { name: "Charisma", score: 6, modifier: -2 },
  ],
  traits: [
    {
      name: "Mossy Pack",
      keywords: "teleportation",
      aura: 1,
      lines: [{ text: "Allies in the aura can teleport 1 square." }],
    },
  ],
  powers: [
    {
      name: "Mossy Bite",
      action: "Standard",
      usage: "At-Will",
      lines: [
        {
          label: "Attack",
          text: "Melee 1 (one creature); +17 vs. AC",
          attackBonus: 17,
          defense: "AC",
        },
        {
          label: "Hit",
          text: "1d8 + 6 damage, and it teleports up to 2 squares.",
          damage: "1d8 + 6",
        },
      ],
    },
    {
      name: "Minor Action",
      action: "Minor",
      usage: "At-Will (1/round)",
      lines: [{ label: "Effect", text: "The hound walks." }],
    },
  ],
  source: "Test Book",
  provenanceIds: [],
};

describe("associate card", () => {
  it("prints the associate's stat block in the companion frame", () => {
    const html = renderToStaticMarkup(<AssociateCard card={card} />);
    expect(html).toContain(
      "print-play-card print-familiar-card print-associate-card",
    );
    expect(html).toContain("Trained Moss Hound");
    expect(html).toContain("Medium fey beast");
    expect(html).toMatch(/AC<\/.*?27/);
    expect(html).toContain('title="Your bloodied value"');
    expect(html).toMatch(/Init<\/.*?\+6/);
    expect(html).toMatch(/Perc<\/.*?\+15/);
    expect(html).toContain("Low-light vision");
    expect(html).toContain("Mossy Pack (teleportation) · Aura 1");
    expect(html).toContain("Mossy Bite");
    expect(html).toContain("Standard · At-Will");
    expect(html).toContain(
      "<strong>Attack: </strong>Melee 1 (one creature); +17 vs. AC",
    );
    expect(html).toContain("1d8 + 6 damage, and it teleports up to 2 squares.");
    // A power named for its action does not repeat it.
    expect(html).toContain("Minor Action<span");
    expect(html).not.toContain("Minor · At-Will (1/round)");
    expect(html).toContain("Fey Beast Companion</span>");
  });

  it("leaves out tiles the stat block does not have", () => {
    const html = renderToStaticMarkup(
      <AssociateCard
        card={{
          kind: "associate",
          id: "ASSOCIATE_MOTE",
          name: "Glint Mote",
          identity: "Small elemental humanoid",
          defenses: card.defenses,
          hitPoints: 1,
          speed: "",
          defensesNote:
            "Your defenses, not including any temporary bonuses or penalties",
          hitPointsNote: "A missed attack never damages the companion",
          traits: [],
          powers: [],
          source: "Test Book",
          provenanceIds: [],
        }}
      />,
    );
    expect(html).not.toContain("Bloodied");
    expect(html).not.toContain("Init");
    expect(html).toContain("Speed</strong> —");
    expect(html).toContain("A missed attack never damages the companion");
    expect(html).toContain("Associate</span>");
  });
});
