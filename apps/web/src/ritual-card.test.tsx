import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import { sheetItemCard } from "@4ecb/sheet-model";

import { ItemCard } from "./ItemCard";
import { printItemPresentation } from "./print-item-presentation";
import { appStyles } from "./test-styles";

/*
 * Rituals, alchemical formulas and martial practices are all "Ritual"
 * records with the same fields; the card (D079) shows their short fields
 * as the subheader and their description as the body.
 */

function record(
  name: string,
  specifics: Readonly<Record<string, string>>,
  description: string,
): ContentEntity {
  return {
    id: `RITUAL_${name.toUpperCase().replace(/\W+/gu, "_")}`,
    name,
    type: "Ritual",
    source: "Synthetic source",
    sources: ["Synthetic source"],
    attributes: [],
    categories: [],
    // Shaped like the pack's records: every field present, some empty.
    specifics: Object.entries(specifics).map(([field, value], ordinal) => ({
      name: field,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description,
    flavor: `${name} flavor.`,
    extensions: [],
    provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
  };
}

const ritual = record(
  "Synthetic Messenger",
  {
    Category: "Exploration",
    "Key Skill": "Nature",
    "Component Cost": "10 gp",
    Duration: "Special",
    Level: "1",
    Time: "10 minutes",
    "Market Price": "50 gp",
    Prerequisite: "",
    type: "Ritual",
  },
  "You whisper a message to a small animal.",
);
const practice = record(
  "Synthetic Disguise",
  {
    Category: "Martial Practice",
    "Key Skill": "Bluff",
    "Component Cost": "50 gp plus 1 healing surge",
    Duration: "24 hours",
    Level: "8",
    Time: "1 hour",
    "Market Price": "275 gp",
    Prerequisite: "",
    type: "Martial Practice",
  },
  "You alter your own appearance.",
);
const formula = record(
  "Synthetic Silver",
  {
    Category: "Oil",
    "Key Skill": "Nature or Religion or Thievery (no check)",
    "Component Cost": "See Alchemical Item",
    Duration: "",
    Level: "5",
    Time: "15 minutes",
    "Market Price": "200 gp",
    Prerequisite: "Alchemist",
    type: "Alchemical Formula",
  },
  "You apply this silver liquid to a weapon.",
);

const cardOf = (entity: ContentEntity) =>
  sheetItemCard({ name: entity.name, entities: [entity] });

describe("ritual, formula and practice cards", () => {
  it("puts the short fields in the subheader with one-word labels", () => {
    expect(printItemPresentation(cardOf(ritual)).statRows).toEqual([
      [
        { label: "Category", value: "Exploration" },
        { label: "Time", value: "10 minutes" },
        { label: "Skill", value: "Nature" },
      ],
      // Variable-length values have their own lines.
      [{ label: "Duration", value: "Special" }],
      [{ label: "Cost", value: "10 gp" }],
    ]);
    // A practice's category repeats its kind; an empty field has no cell;
    // a prerequisite is a subheader row of its own.
    expect(printItemPresentation(cardOf(practice)).statRows[0]).toEqual([
      { label: "Time", value: "1 hour" },
      { label: "Skill", value: "Bluff" },
    ]);
    expect(printItemPresentation(cardOf(formula)).statRows).toEqual([
      [
        { label: "Category", value: "Oil" },
        { label: "Time", value: "15 minutes" },
        { label: "Skill", value: "Nature or Religion or Thievery (no check)" },
      ],
      [{ label: "Cost", value: "See Alchemical Item" }],
      [{ label: "Prerequisite", value: "Alchemist" }],
    ]);
  });

  it.each([
    [ritual, "Ritual"],
    [practice, "Martial Practice"],
    [formula, "Alchemical Formula"],
  ])(
    "shows %s's description as its body and names its kind",
    (entity, kind) => {
      const item = printItemPresentation(cardOf(entity));
      expect(item.description).toBe(entity.description);
      // The subheader fields are not repeated as body rules.
      expect(item.rules).toEqual([]);
      expect(item.kind).toBe(kind);
      expect(item.level).toBe(
        entity.specifics.find(({ name }) => name === "Level")?.value,
      );
      expect(item.metadata).toEqual([]);
      expect(item.footerDetails).toEqual([
        entity.specifics.find(({ name }) => name === "Market Price")?.value,
      ]);
      const markup = renderToStaticMarkup(
        <ItemCard card={cardOf(entity)} layout="panel" />,
      );
      expect(markup).toContain('class="print-item-subheader"');
      // Its lines read as one block: no dividers between them.
      expect(markup).toContain('class="print-item-stats is-ritual"');
      expect(markup).toContain(entity.description);
      expect(markup).not.toContain("Key Skill");
      expect(markup).not.toContain("Component Cost");
    },
  );
});

describe("Inventory known-record rows (D114)", () => {
  it("leave the last-cell right alignment to the actions column", () => {
    // The table right-aligns its last cell (the item actions). A known row
    // was one cell spanning all three, so that cell was also the last and
    // its name sat at the right; the rows now have the item rows' three
    // cells (known-records-ui.test.tsx).
    expect(appStyles).toMatch(
      /\.inventory-table :is\(th, td\):last-child \{\s*text-align: right;/u,
    );
    expect(appStyles).toMatch(
      /\.inventory-table th:first-child \{\s*width: auto;/u,
    );
    // A ritual card's subheader lines have no dividers between them.
    expect(appStyles).toMatch(
      /\.print-item-stats\.is-ritual \.print-item-stat-row \{\s*border-bottom: 0;/u,
    );
    // No muted detail line under a known record's name.
    expect(appStyles).not.toContain("inventory-known-detail");
  });
});
