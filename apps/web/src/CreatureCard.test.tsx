import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetCreatureCard } from "@4ecb/sheet-model";

import { CreatureCard } from "./CreatureCard";

const card: SheetCreatureCard = {
  kind: "creature",
  id: "ID_TEST_PONY",
  origin: { kind: "mount", holdingId: "h-pony" },
  name: "Test Pony",
  level: 2,
  role: "Brute",
  identity: "Medium natural beast (mount)",
  defenses: { ac: 14, fortitude: 15, reflex: 13, will: 12 },
  hitPoints: 40,
  bloodied: 20,
  initiative: 2,
  perception: 6,
  speed: "7",
  senses: "Low-light vision",
  abilities: [
    { name: "Strength", score: 16, modifier: 4 },
    { name: "Constitution", score: 15, modifier: 3 },
    { name: "Dexterity", score: 13, modifier: 2 },
    { name: "Intelligence", score: 2, modifier: -3 },
    { name: "Wisdom", score: 12, modifier: 2 },
    { name: "Charisma", score: 8, modifier: 0 },
  ],
  skills: "Endurance +9",
  traits: [
    {
      name: "Steady",
      keywords: "Mount",
      usage:
        "while mounted by a friendly rider of 2nd level or higher; at-will",
      lines: [{ text: "The pony's rider gains a +1 bonus to saving throws." }],
    },
  ],
  actions: [
    {
      name: "Nip",
      attackKind: "basic-melee",
      usage: "standard, at-will",
      lines: [{ text: "+5 vs. AC; 1d6+3 damage." }],
    },
  ],
  description:
    "Ponies are small horses.\n<table>Normal Load\tHeavy Load\tMax.Drag\n200 lb.\t400 lb.\t1,000 lb.</table>",
  source: "Test",
  provenanceIds: [],
};

describe("CreatureCard", () => {
  it("prints the whole stat block on one card, with the load table only", () => {
    const html = renderToStaticMarkup(<CreatureCard card={card} />);
    expect(html).toContain('data-creature-part="whole"');
    expect(html).toContain("Test Pony");
    expect(html).toContain("Level 2 Brute · Medium natural beast (mount)");
    for (const text of [
      "<dt>AC</dt><dd>14</dd>",
      "<dt>HP</dt><dd>40</dd>",
      "<dt>Bloodied</dt><dd>20</dd>",
      "<strong>Initiative</strong> +2",
      "<strong>Perception</strong> +6",
      "<strong>Speed</strong> 7",
      "Skills Endurance +9",
      "Steady (Mount)",
      "Nip",
      "Melee basic attack · standard, at-will",
      "+5 vs. AC; 1d6+3 damage.",
      "Max.Drag",
      "1,000 lb.",
    ])
      expect(html).toContain(text);
    // Flavor prose stays off the printed card.
    expect(html).not.toContain("Ponies are small horses.");
    expect(html).toContain(">Mount<");
  });

  it("prints a stats card and an actions card with its own title", () => {
    const stats = renderToStaticMarkup(
      <CreatureCard card={{ ...card, part: "stats" }} />,
    );
    expect(stats).toContain("<dt>AC</dt><dd>14</dd>");
    expect(stats).toContain("Steady (Mount)");
    expect(stats).toContain("Max.Drag");
    expect(stats).not.toContain("Nip");
    const actions = renderToStaticMarkup(
      <CreatureCard card={{ ...card, part: "actions" }} />,
    );
    expect(actions).toContain("Test Pony — Actions");
    expect(actions).toContain("+5 vs. AC; 1d6+3 damage.");
    expect(actions).not.toContain("<dt>AC</dt>");
    expect(actions).not.toContain("Steady");
    expect(actions).not.toContain("Max.Drag");
    expect(actions).not.toContain("Brute");
    expect(actions).not.toMatch(/continued/i);
  });

  it("shows the whole description in the builder pane", () => {
    const html = renderToStaticMarkup(
      <CreatureCard
        card={card}
        layout="panel"
        panel={{ headingId: "pony", source: "Source: Test" }}
      />,
    );
    expect(html).toContain("is-panel");
    expect(html).toContain("Ponies are small horses.");
    expect(html).toContain("Max.Drag");
    expect(html).toContain("Source: Test");
  });

  it("prints a summoned creature's command row and the power's usage (D111)", () => {
    const html = renderToStaticMarkup(
      <CreatureCard
        card={{
          ...card,
          origin: { kind: "summon", powerId: "ID_TEST_SUMMON" },
          usage: "Daily",
          actions: [
            {
              name: "Opportunity Attack",
              action: "Opportunity",
              lines: [
                {
                  text: "Melee 1; targets one creature; Wisdom vs. Reflex; 1d8 + Wisdom modifier (+4) damage.",
                },
              ],
              roll: { attack: "+12 vs. Reflex", damage: "1d8+7" },
            },
          ],
        }}
      />,
    );
    expect(html).toContain(
      '<p class="print-creature-roll"><strong>Attack</strong> +12 vs. Reflex · <strong>Damage</strong> 1d8+7</p>',
    );
    expect(html).toContain(">Summoned creature · Daily<");
  });

  it("lists a command's numbers per implement as the power card's weapon rows (D111)", () => {
    const variant = (
      id: string,
      equipped: boolean,
      attack: string,
      damage: string,
    ) => ({
      id,
      equipmentName: id,
      equipped,
      hand: "main" as const,
      ability: "Wisdom",
      attack,
      damage,
    });
    const html = renderToStaticMarkup(
      <CreatureCard
        card={{
          ...card,
          origin: { kind: "summon", powerId: "ID_TEST_SUMMON" },
          actions: [
            {
              name: "Opportunity Attack",
              action: "Opportunity",
              lines: [{ text: "Melee 1; Wisdom vs. Reflex." }],
              variants: [
                variant("Staff +1", false, "+10 vs Reflex", "1d8+5"),
                variant("Rod +3", true, "+12 vs Reflex", "1d8+7"),
              ],
            },
          ],
        }}
      />,
    );
    const start = html.indexOf("Opportunity Attack");
    const section = html.slice(start, html.indexOf("</section>", start));
    expect(section).toContain('class="print-card-variant-table"');
    // Rows only: no column headings under a command.
    expect(section).not.toContain("<thead>");
    // The equipped row leads, as on the power card.
    expect(section.indexOf("Rod\u00a0+3")).toBeGreaterThan(0);
    expect(section.indexOf("Rod\u00a0+3")).toBeLessThan(
      section.indexOf("Staff\u00a0+1"),
    );
    expect(section).toMatch(
      /<th scope="row">Staff\u00a0\+1<\/th><td class="print-variant-bonus" aria-label="To hit">\+10<\/td><td aria-label="Damage"><span class="print-variant-expression">1d8\+5<\/span><\/td>/,
    );
  });

  it("prints no weapon rows for a creature without them", () => {
    const html = renderToStaticMarkup(<CreatureCard card={card} />);
    expect(html).not.toContain("print-card-variant-table");
  });
});
