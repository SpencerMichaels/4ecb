import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { entityCardFields, layoutCardFields } from "./entity-card-fields";

function entity(
  type: string,
  specifics: Readonly<Record<string, string>>,
): ContentEntity {
  return {
    id: `ID_${type}`,
    name: type,
    type,
    source: "",
    sources: [],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "entity-card-fields", sourceOrdinal: 0 },
  };
}

describe("layoutCardFields", () => {
  it("groups subheader lines by number, keeps body order, drops empties", () => {
    expect(
      layoutCardFields([
        { label: "B", value: "2", place: 2 },
        { label: "A", value: "1", place: 1 },
        { label: "Gone", value: "x", place: "drop" },
        { label: "Blank", value: "  ", place: 1 },
        { label: "Missing", value: undefined, place: 3 },
        { label: "Z", value: " body ", place: "body" },
        { label: "C", value: "3", place: 1 },
      ]),
    ).toEqual({
      subheader: [
        [
          { label: "A", value: "1" },
          { label: "C", value: "3" },
        ],
        [{ label: "B", value: "2" }],
      ],
      body: [{ label: "Z", value: "body" }],
    });
  });
});

describe("entityCardFields", () => {
  it("has none for a type without placements", () => {
    expect(entityCardFields(entity("Language", { Script: "Davek" }))).toBe(
      undefined,
    );
  });

  it("places a feat's fields and accounts for their specifics", () => {
    const fields = entityCardFields(
      entity("Feat", {
        Tier: "Heroic",
        type: "Lesser Style",
        "Associated Powers": "Wolf Strike",
        Special: "Once.",
      }),
    );
    expect(fields?.subheader).toEqual([
      [
        { label: "Tier", value: "Heroic" },
        { label: "Type", value: "Lesser Style" },
      ],
    ]);
    expect(fields?.body).toEqual([
      { label: "Powers", value: "Wolf Strike" },
      { label: "Special", value: "Once." },
    ]);
    expect([...(fields?.placed ?? [])]).toEqual([
      "tier",
      "type",
      "associated powers",
      "associated power info",
      "special",
    ]);
  });
});
