import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { entityTypeIcon, entityVisualTone } from "./visual-language";

function entity(
  type: string,
  categories: readonly string[] = [],
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id: `${type}-fixture`,
    name: "Fixture",
    type,
    source: "Test",
    sources: ["Test"],
    attributes: [],
    categories,
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      ordinal,
      extraAttributes: [],
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

describe("legacy-derived visual language", () => {
  it("uses utility before usage and maps every legacy card color", () => {
    expect(
      entityVisualTone(
        entity("Power", ["Utility"], { "Power Usage": "Encounter" }),
      ),
    ).toBe("utility");
    expect(entityVisualTone(entity("Power", ["At-Will"]))).toBe("at-will");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "Encounter" })),
    ).toBe("encounter");
    expect(entityVisualTone(entity("Power", ["Daily"]))).toBe("daily");
    expect(entityVisualTone(entity("Magic Item"))).toBe("item");
  });

  it("maps familiar entity families to monochrome icons", () => {
    expect(entityTypeIcon("Race")).toBe("race");
    expect(entityTypeIcon("Feat")).toBe("feat");
    expect(entityTypeIcon("Power")).toBe("power");
    expect(entityTypeIcon("Armor")).toBe("item");
  });
});
