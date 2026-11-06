import { describe, expect, it } from "vitest";

import {
  FORMULA_ITEMS_FIELD,
  readFormulaItems,
  withStoredFormulaItems,
  type ContentEntity,
} from "./index";

function record(
  id: string,
  name: string,
  type: string,
  fields: Readonly<Record<string, string>>,
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
    attributes: [],
    categories: [],
    specifics: Object.entries(fields).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "synthetic.xml", sourceOrdinal: 0 },
  };
}

// Spelled as Adventurer's Vault records are: the formula's subtype in a
// lowercase "type" field, its cost "See below", each version a Magic Item.
const formula = (id: string, name: string, cost: string) =>
  record(id, name, "Ritual", {
    Category: "Volatile",
    "Component Cost": cost,
    Level: "5",
    "Market Price": "200 gp",
    type: "Alchemical Formula",
  });
const version = (id: string, name: string, level: string, gold: string) =>
  record(id, name, "Magic Item", {
    Level: level,
    Gold: gold,
    "Magic Item Type": "Alchemical",
  });

function stored(entities: readonly ContentEntity[], id: string) {
  return readFormulaItems(
    withStoredFormulaItems(entities).find((entity) => entity.id === id)
      ?.specifics,
  );
}

describe("stored formula items", () => {
  it("links a See below formula to its level versions, by level", () => {
    expect(
      stored(
        [
          formula("F", "Acidic Fire", "See below"),
          version("V10", "Acidic Fire (level 10)", "10", "200"),
          version("V5", "Acidic Fire (level 5)", "5", "50"),
          version("V15", "Acidic Fire (level 15)", "15", "1,000"),
          version("AMMO", "Acidic Fire Ammunition (level 6)", "6", "75"),
        ],
        "F",
      ),
    ).toEqual({
      version: 1,
      name: "Acidic Fire",
      items: [
        { id: "V5", level: 5, gold: 50 },
        { id: "V10", level: 10, gold: 200 },
        { id: "V15", level: 15, gold: 1000 },
      ],
    });
  });

  it("links tier-named versions and other See references", () => {
    expect(
      stored(
        [
          formula("F", "Woundpatch", "See Alchemical Item"),
          version("H", "Woundpatch (heroic tier)", "3", "30"),
          version("P", "Woundpatch (Paragon Tier)", "13", "650"),
        ],
        "F",
      )?.items.map(({ id }) => id),
    ).toEqual(["H", "P"]);
    expect(
      stored(
        [
          formula("F", "Rust Bomb", "See below."),
          version("V", "Rust Bomb (level 5)", "5", "50"),
        ],
        "F",
      )?.items,
    ).toHaveLength(1);
  });

  it("lists one version that two records describe once", () => {
    expect(
      stored(
        [
          formula("F", "Universal Solvent", "See Alchemical Item"),
          version("B", "Universal Solvent (Level 10)", "10", "200"),
          version("A", "Universal Solvent (heroic tier)", "10", "200"),
        ],
        "F",
      )?.items,
    ).toEqual([{ id: "A", level: 10, gold: 200 }]);
  });

  it("stores nothing for a formula without versions or with a real cost", () => {
    const entities = [
      formula("ORPHAN", "Lost Tincture", "See below"),
      formula("PRICED", "Keen Oil", "200 gp"),
      version("K", "Keen Oil (heroic tier)", "5", "50"),
    ];
    const result = withStoredFormulaItems(entities);
    expect(
      result.flatMap(({ specifics }) =>
        specifics.filter(({ name }) => name === FORMULA_ITEMS_FIELD),
      ),
    ).toEqual([]);
    expect(result[0]).toBe(entities[0]);
    expect(result[1]).toBe(entities[1]);
  });

  it("replaces an older field when linking again", () => {
    const once = withStoredFormulaItems([
      formula("F", "Acidic Fire", "See below"),
      version("V5", "Acidic Fire (level 5)", "5", "50"),
    ]);
    const twice = withStoredFormulaItems([
      once[0]!,
      version("V5", "Acidic Fire (level 5)", "5", "60"),
    ]);
    expect(
      twice[0]!.specifics.filter(({ name }) => name === FORMULA_ITEMS_FIELD),
    ).toHaveLength(1);
    expect(readFormulaItems(twice[0]!.specifics)?.items[0]?.gold).toBe(60);
    expect(withStoredFormulaItems([once[0]!])[0]!.specifics).toHaveLength(
      once[0]!.specifics.length - 1,
    );
  });

  it("reads nothing from another version", () => {
    expect(
      readFormulaItems([
        {
          name: FORMULA_ITEMS_FIELD,
          value: JSON.stringify({ version: 0, name: "X", items: [{}] }),
        },
      ]),
    ).toBeUndefined();
  });
});
