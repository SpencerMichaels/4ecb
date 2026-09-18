import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  entityTypeIcon,
  entityVisualTone,
  powerActionSymbol,
  powerAttackIcon,
} from "./visual-language";

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
  it("uses authored Power Usage for tone and never treats Utility as a color", () => {
    expect(
      entityVisualTone(
        entity("Power", ["Utility"], { "Power Usage": "Encounter" }),
      ),
    ).toBe("encounter");
    expect(entityVisualTone(entity("Power", ["At-Will"]))).toBe("neutral");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "At-Will" })),
    ).toBe("at-will");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "Encounter" })),
    ).toBe("encounter");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "Daily" })),
    ).toBe("daily");
    expect(entityVisualTone(entity("Magic Item"))).toBe("item");
  });

  it("maps familiar entity families to monochrome icons", () => {
    expect(entityTypeIcon("Race")).toBe("race");
    expect(entityTypeIcon("Feat")).toBe("feat");
    expect(entityTypeIcon("Power")).toBe("power");
    expect(entityTypeIcon("Armor")).toBe("item");
  });

  it("maps every power action type to the tabletop-dashboard symbol", () => {
    expect(powerActionSymbol("Standard Action")).toBe("●");
    expect(powerActionSymbol("Minor Action")).toBe("◔");
    expect(powerActionSymbol("Move Action")).toBe("≫");
    expect(powerActionSymbol("Free Action")).toBe("○");
    expect(powerActionSymbol("No Action")).toBe("○");
    expect(powerActionSymbol("Immediate Reaction")).toBe("↻");
    expect(powerActionSymbol("Immediate Interrupt")).toBe("↯");
    expect(powerActionSymbol(undefined)).toBe("–");
  });

  it("maps power attack metadata to compact semantic icons", () => {
    expect(powerAttackIcon("Melee weapon")).toBe("attack-melee");
    expect(powerAttackIcon("Melee or Ranged weapon")).toBe("attack-versatile");
    expect(powerAttackIcon("Area burst 1 within 10")).toBe("attack-area");
    expect(powerAttackIcon(undefined)).toBe("action-none");
  });
});
