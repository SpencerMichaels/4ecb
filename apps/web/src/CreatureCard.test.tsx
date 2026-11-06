import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { SheetCreatureCard } from "@4ecb/sheet-model";

import {
  authoredBuilderCardSettings,
  BuilderCardContext,
  BuilderCreatureCard,
  BuilderItemCard,
} from "./BuilderCards";
import { CreatureCard } from "./CreatureCard";
import { dotted } from "./test-dot-list";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ItemCard } from "./ItemCard";

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
    expect(dotted(html)).toContain(
      "Level 2 Brute · Medium natural beast (mount)",
    );
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
      expect(dotted(html)).toContain(text);
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

  it("shows the description's prose as flavor text and its tables in the builder pane's body", () => {
    const html = renderToStaticMarkup(
      <CreatureCard
        card={card}
        layout="panel"
        panel={{ headingId: "pony", source: "Source: Test" }}
      />,
    );
    expect(html).toContain("is-panel");
    // The prose is flavor text: under the header, above the defense tiles.
    expect(html).toContain(
      '<p class="print-card-flavor">Ponies are small horses.</p>',
    );
    expect(html.indexOf("print-card-flavor")).toBeGreaterThan(
      html.indexOf("</header>"),
    );
    expect(html.indexOf("print-card-flavor")).toBeLessThan(
      html.indexOf('aria-label="Defenses"'),
    );
    // The load table stays in the body, after the stat block.
    const body = html.slice(html.indexOf("print-card-body"));
    expect(body).not.toContain("Ponies are small horses.");
    expect(body).toContain("Max.Drag");
    expect(html).toContain("Source: Test");
  });

  it("hides the builder pane's flavor text with the preference, keeping the tables", () => {
    const html = renderToStaticMarkup(
      <HideFlavortextContext.Provider value={true}>
        <CreatureCard card={card} layout="panel" />
      </HideFlavortextContext.Provider>,
    );
    expect(html).not.toContain("print-card-flavor");
    expect(html).not.toContain("Ponies are small horses.");
    expect(html).toContain("Max.Drag");
  });

  it("shows a prose-only description as flavor text alone", () => {
    const html = renderToStaticMarkup(
      <CreatureCard
        card={{ ...card, description: "An ancient spirit." }}
        layout="panel"
      />,
    );
    expect(html).toContain(
      '<p class="print-card-flavor">An ancient spirit.</p>',
    );
    expect(html).not.toContain("print-creature-description");
    expect(renderToStaticMarkup(<CreatureCard card={card} />)).not.toContain(
      "print-card-flavor",
    );
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
    expect(dotted(html)).toContain(
      '<p class="print-creature-roll"><strong>Attack</strong> +12 vs. Reflex · <strong>Damage</strong> 1d8+7</span></span></p>',
    );
    expect(dotted(html)).toContain(">Summoned creature · Daily<");
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

  it("prints rows that adjacent commands share once, uncaptioned (D111)", () => {
    const rows = [
      {
        id: "rod",
        equipmentName: "Rod +3",
        equipped: true,
        hand: "main" as const,
        ability: "Wisdom",
        attack: "+12 vs Reflex",
        damage: "1d8+7",
      },
      {
        id: "staff",
        equipmentName: "Staff +1",
        equipped: false,
        hand: "main" as const,
        ability: "Wisdom",
        attack: "+10 vs Reflex",
        damage: "1d8+5",
      },
    ];
    const html = renderToStaticMarkup(
      <CreatureCard
        card={{
          ...card,
          origin: { kind: "summon", powerId: "ID_TEST_SUMMON" },
          actions: [
            {
              name: "Standard Action",
              action: "Standard",
              lines: [{ text: "Melee 1; Wisdom vs. Reflex." }],
            },
            {
              name: "Opportunity Attack",
              action: "Opportunity",
              lines: [{ text: "Melee 1; Wisdom vs. Reflex." }],
              variants: rows,
            },
          ],
        }}
      />,
    );
    expect(html.split('class="print-card-variant-table"').length - 1).toBe(1);
    // No caption names the commands (owner, 2026-11-05).
    expect(html).not.toContain("<caption");
    expect(dotted(html)).not.toContain("Standard Action · Opportunity Attack");
    // The command text is unchanged and the table follows the last command.
    expect(html.indexOf("print-card-variant-table")).toBeGreaterThan(
      html.lastIndexOf("Melee 1; Wisdom vs. Reflex."),
    );
  });

  it("prints no weapon rows for a creature without them", () => {
    const html = renderToStaticMarkup(<CreatureCard card={card} />);
    expect(html).not.toContain("print-card-variant-table");
  });
});

describe("a mount's item card beside its creature card (D110)", () => {
  const pony: ContentEntity = {
    id: "ID_TEST_PONY",
    name: "Test Pony",
    type: "Gear",
    source: "Test",
    sources: ["Test"],
    attributes: [],
    categories: [],
    specifics: [
      { name: "Category", value: "Mount", extraAttributes: [], ordinal: 0 },
      { name: "Gold", value: "75", extraAttributes: [], ordinal: 1 },
    ],
    rules: [],
    description: card.description ?? "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
  const pane = (withCreatureCard: boolean, hideFlavortext = false) =>
    renderToStaticMarkup(
      <BuilderCardContext.Provider
        value={{
          ...authoredBuilderCardSettings(2),
          creatureCardFor: () => card,
        }}
      >
        <HideFlavortextContext.Provider value={hideFlavortext}>
          <BuilderItemCard
            name="Test Pony"
            entities={[pony]}
            withCreatureCard={withCreatureCard}
          />
          <BuilderCreatureCard name="Test Pony" entities={[pony]} />
        </HideFlavortextContext.Provider>
      </BuilderCardContext.Provider>,
    );
  const count = (html: string, needle: string) => html.split(needle).length - 1;

  it("shows the description's paragraph and table once, on the creature card", () => {
    const html = pane(true);
    expect(count(html, "Ponies are small horses.")).toBe(1);
    expect(count(html, "1,000 lb.")).toBe(1);
    const itemCard = html.slice(0, html.indexOf("print-creature-card"));
    expect(itemCard).toContain("print-item-card");
    expect(itemCard).not.toContain("Ponies are small horses.");
    expect(itemCard).not.toContain("1,000 lb.");
  });

  it("hides the paragraph everywhere with the flavor text preference", () => {
    const html = pane(true, true);
    expect(html).not.toContain("Ponies are small horses.");
    expect(count(html, "1,000 lb.")).toBe(1);
  });

  it("prints the item card without the creature's description", () => {
    const html = renderToStaticMarkup(
      <ItemCard
        card={{
          kind: "item",
          name: "Test Pony",
          fields: [],
          description: card.description!,
          descriptionOnCreatureCard: true,
        }}
      />,
    );
    expect(html).toContain("print-item-card");
    expect(html).not.toContain("Ponies are small horses.");
    expect(html).not.toContain("1,000 lb.");
  });

  it("keeps the item card's description where no creature card is beside it", () => {
    const html = pane(false);
    const itemCard = html.slice(0, html.indexOf("print-creature-card"));
    expect(itemCard).toContain("Ponies are small horses.");
    expect(itemCard).toContain("1,000 lb.");
  });
});
