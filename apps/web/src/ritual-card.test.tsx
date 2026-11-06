import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  withStoredFormulaItems,
  type ContentEntity,
} from "@4ecb/content-domain";
import { learnedRecordFieldLabel, sheetItemCard } from "@4ecb/sheet-model";

import { ItemCard } from "./ItemCard";
import { canonicalItemIcon, KNOWN_RECORD_ICONS } from "./item-icons";
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

/** A created item version, spelled as Adventurer's Vault records are. */
function version(name: string, level: string, gold: string): ContentEntity {
  return {
    ...record(name, { Level: level, Gold: gold }, ""),
    type: "Magic Item",
  };
}

describe("a formula whose cost is the created item's price", () => {
  // "See below" in the book: the created version's market price, from the
  // item's level table under the formula. The pack build links the
  // versions (`_Formula Items IR`); the card names the price and lists them.
  const [acidic] = withStoredFormulaItems([
    record(
      "Synthetic Acidic Fire",
      {
        Category: "Volatile",
        "Key Skill": "Arcana or Thievery (no check)",
        "Component Cost": "See below",
        Duration: "",
        Level: "5",
        Time: "30 minutes",
        "Market Price": "200 gp",
        Prerequisite: "",
        type: "Alchemical Formula",
      },
      "You combine reagents into a volatile flask.",
    ),
    version("Synthetic Acidic Fire (level 10)", "10", "200"),
    version("Synthetic Acidic Fire (level 5)", "5", "50"),
    version("Synthetic Acidic Fire (level 15)", "15", "1000"),
  ]);
  const creates =
    "Synthetic Acidic Fire — level 5 (50 gp), 10 (200 gp), 15 (1,000 gp)";

  it("reads Item's price and lists the versions after the description", () => {
    const item = printItemPresentation(cardOf(acidic!));
    expect(item.statRows).toContainEqual([
      { label: "Cost", value: "Item's price" },
    ]);
    expect(item.description).toBe(acidic!.description);
    expect(item.rules).toEqual([{ label: "Creates", value: creates }]);
    // The formula's own price stays the footer's.
    expect(item.footerDetails).toEqual(["200 gp"]);
    const markup = renderToStaticMarkup(
      <ItemCard card={cardOf(acidic!)} layout="print" />,
    );
    expect(markup).not.toContain("See below");
    expect(markup.indexOf(acidic!.description)).toBeLessThan(
      markup.indexOf("Creates: "),
    );
    expect(markup).toContain(creates);
  });

  it("gives the printed reference entry the same fields under the card's labels", () => {
    // Printed rituals are reference-page entries built from these fields,
    // relabeled by the same learnedRecordFieldLabel as the card subheader.
    const fields = cardOf(acidic!).fields;
    expect(fields).toContainEqual({
      label: "Component Cost",
      value: "Item's price",
    });
    expect(fields.at(-1)).toEqual({ label: "Creates", value: creates });
    const printed = fields.map(({ label, value }) => ({
      label: learnedRecordFieldLabel(label),
      value,
    }));
    expect(printed).toContainEqual({ label: "Cost", value: "Item's price" });
    expect(printed).toContainEqual({
      label: "Skill",
      value: "Arcana or Thievery (no check)",
    });
    expect(printed).toContainEqual({ label: "Price", value: "200 gp" });
  });

  it.each([ritual, practice, formula])(
    "labels %s's subheader fields as its printed reference entry does",
    (entity) => {
      const card = cardOf(entity);
      const printed = card.fields.map(({ label, value }) => ({
        label: learnedRecordFieldLabel(label),
        value: value.trim(),
      }));
      for (const stat of printItemPresentation(card).statRows.flat())
        expect(printed).toContainEqual(stat);
    },
  );

  it("leaves a formula without linked versions as authored", () => {
    // `formula` names no versions in its set: no Creates line.
    const [unlinked] = withStoredFormulaItems([formula]);
    const item = printItemPresentation(cardOf(unlinked!));
    expect(item.statRows).toContainEqual([
      { label: "Cost", value: "See Alchemical Item" },
    ]);
    expect(item.rules).toEqual([]);
  });
});

describe("known-record icons", () => {
  it.each([
    [ritual, "book"],
    [practice, "dumbbell"],
    [formula, "flask-conical"],
  ] as const)("show the same icon on %s's card and row", (entity, icon) => {
    // The Inventory, Shop and choice rows use canonicalItemIcon.
    expect(canonicalItemIcon(entity)).toBe(icon);
    expect(printItemPresentation(cardOf(entity)).icon).toBe(icon);
    expect(Object.values(KNOWN_RECORD_ICONS)).toContain(icon);
  });
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
