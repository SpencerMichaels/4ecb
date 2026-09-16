import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  CompendiumIndex,
  deserializeCompendiumQuery,
  normalizeCompendiumQuery,
  parseTextQuery,
  serializeCompendiumQuery,
  tokenize,
} from "./index";

function entity(
  id: string,
  name: string,
  type: string,
  fields: Record<string, string> = {},
  categories: string[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic Source",
    sources: ["Synthetic Source"],
    attributes: [],
    categories,
    specifics: Object.entries(fields).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: `${name} searchable description`,
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const entities: ContentEntity[] = [
  entity("ID_POWER_1", "Stone Step", "Power", {
    Level: "3",
    "Power Usage": "Encounter",
    "Action Type": "Move Action",
    Keywords: "Primal, Teleportation",
  }),
  entity("ID_POWER_2", "Stone Shield", "Power", {
    Level: "7",
    "Power Usage": "Daily",
    "Action Type": "Immediate Interrupt",
    Keywords: "Primal",
  }),
  entity("ID_FEAT_1", "Measured Step", "Feat", { Tier: "Heroic" }, [
    "Heroic Tier",
  ]),
];

describe("query parsing", () => {
  it("normalizes Unicode tokens and quoted phrases", () => {
    expect(tokenize("Élan's  STEP")).toEqual(["elan's", "step"]);
    expect(parseTextQuery('stone "move action" stone')).toEqual({
      terms: ["stone"],
      phrases: ["move action"],
    });
  });

  it("bounds paging and removes empty filters", () => {
    expect(
      normalizeCompendiumQuery({
        page: { offset: -2, limit: 500 },
        facets: [{ key: "type", include: [], exclude: [] }],
      }).page,
    ).toEqual({ offset: 0, limit: 200 });
  });

  it("round-trips the serializable query representation", () => {
    const original = normalizeCompendiumQuery({
      text: 'stone "move action"',
      facets: [{ key: "type", include: ["Power"], exclude: ["Feat"] }],
      ranges: [{ field: "level", minimum: 3, maximum: 9 }],
      sort: { key: "level", direction: "descending" },
      page: { offset: 20, limit: 20 },
    });
    expect(
      deserializeCompendiumQuery(serializeCompendiumQuery(original)),
    ).toEqual(original);
  });
});

describe("CompendiumIndex", () => {
  const index = new CompendiumIndex(entities);

  it("combines full text, included/excluded facets, and numeric ranges", () => {
    const result = index.query({
      text: "stone",
      facets: [
        { key: "type", include: ["Power"], exclude: [] },
        { key: "usage", include: [], exclude: ["Daily"] },
      ],
      ranges: [{ field: "level", minimum: 1, maximum: 5 }],
      sort: { key: "level", direction: "ascending" },
    });
    expect(result.items.map((item) => item.id)).toEqual(["ID_POWER_1"]);
    expect(result.total).toBe(1);
  });

  it("matches phrases and reports facet counts", () => {
    const result = index.query({ text: '"immediate interrupt"' });
    expect(result.items.map((item) => item.id)).toEqual(["ID_POWER_2"]);
    expect(
      result.facets.find((facet) => facet.key === "usage")?.values,
    ).toEqual([{ value: "Daily", count: 1 }]);
  });

  it("indexes legacy implement shop categories as semantic slots", () => {
    const equipment = [
      entity("ID_SYMBOL_MAGIC", "Consecrated Emblem +1", "Magic Item", {
        "Magic Item Type": "Holy Symbol",
        "Item Slot": "Off-hand",
      }),
      entity("ID_SYMBOL_BASE", "Holy Symbol", "Gear", {
        "Item Slot": "Off-hand",
      }),
      entity("ID_FOCUS", "Centered Focus +1", "Magic Item", {
        "Magic Item Type": "Ki Focus",
      }),
      entity("ID_OFF_HAND", "Parrying Dagger", "Weapon", {
        "Item Slot": "Off-hand",
      }),
    ];
    const equipmentIndex = new CompendiumIndex(equipment);

    expect(
      equipmentIndex
        .query({
          facets: [{ key: "slot", include: ["Holy Symbol"], exclude: [] }],
        })
        .items.map((item) => item.id),
    ).toEqual(["ID_SYMBOL_MAGIC", "ID_SYMBOL_BASE"]);
    expect(
      equipmentIndex
        .query({
          facets: [{ key: "slot", include: ["Ki Focus"], exclude: [] }],
        })
        .items.map((item) => item.id),
    ).toEqual(["ID_FOCUS"]);
    expect(
      equipmentIndex.query({
        facets: [{ key: "slot", include: ["Off-hand"], exclude: [] }],
      }).total,
    ).toBe(3);
  });

  it("reports self-excluding facet counts for multi-select filters", () => {
    const result = index.query({
      facets: [{ key: "type", include: ["Power"], exclude: [] }],
    });
    expect(result.total).toBe(2);
    expect(result.facets.find((facet) => facet.key === "type")?.values).toEqual(
      [
        { value: "Power", count: 2 },
        { value: "Feat", count: 1 },
      ],
    );
  });

  it("sorts and pages stably", () => {
    const first = index.query({
      sort: { key: "name", direction: "ascending" },
      page: { offset: 0, limit: 2 },
    });
    const second = index.query({
      sort: { key: "name", direction: "ascending" },
      page: { offset: 2, limit: 2 },
    });
    expect([...first.items, ...second.items].map((item) => item.name)).toEqual([
      "Measured Step",
      "Stone Shield",
      "Stone Step",
    ]);
  });

  it("keeps missing numeric values last in descending level order", () => {
    const result = index.query({
      sort: { key: "level", direction: "descending" },
    });
    expect(result.items.map((item) => item.name)).toEqual([
      "Stone Shield",
      "Stone Step",
      "Measured Step",
    ]);
  });

  it("returns entities by case-insensitive stable ID", () => {
    expect(index.getEntity("id_power_1")?.name).toBe("Stone Step");
    expect(index.getEntity("missing")).toBeUndefined();
  });

  it("finds outbound and inbound stable-ID relationships", () => {
    const referencing: ContentEntity = {
      ...entity("ID_REFERENCE", "Reference", "Class Feature"),
      rules: [
        {
          name: "grant",
          attributes: [{ name: "name", value: "ID_POWER_1" }],
          text: "",
          children: [],
          ordinal: 0,
        },
      ],
    };
    const relationshipIndex = new CompendiumIndex([...entities, referencing]);
    expect(
      relationshipIndex
        .relationships("ID_REFERENCE")
        ?.references.map((item) => item.id),
    ).toEqual(["ID_POWER_1"]);
    expect(
      relationshipIndex
        .relationships("ID_POWER_1")
        ?.referencedBy.map((item) => item.id),
    ).toEqual(["ID_REFERENCE"]);
    expect(
      relationshipIndex
        .query({ relatedTo: "ID_POWER_1" })
        .items.map((item) => item.id),
    ).toEqual(["ID_REFERENCE"]);
    expect(relationshipIndex.query({ relatedTo: "ID_MISSING" }).total).toBe(0);
  });

  it("resolves ID-valued facets to display names", () => {
    const wizard = entity("ID_CLASS_WIZARD", "Wizard", "Class");
    const wizardPower = entity("ID_WIZARD_POWER", "Wizard Power", "Power", {
      Class: "ID_CLASS_WIZARD",
    });
    const resolvedIndex = new CompendiumIndex([wizard, wizardPower]);
    const result = resolvedIndex.query({
      facets: [{ key: "class", include: ["Wizard"], exclude: [] }],
    });
    expect(result.items.map((item) => item.id)).toEqual(["ID_WIZARD_POWER"]);
    expect(
      result.facets.find((facet) => facet.key === "class")?.values,
    ).toEqual([{ value: "Wizard", count: 1 }]);
  });
});
