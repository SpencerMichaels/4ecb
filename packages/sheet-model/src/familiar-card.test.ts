import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";

import { sheetFamiliarCard } from "./familiar-card";

function familiar(specifics: Readonly<Record<string, string>>): ContentEntity {
  return {
    id: "FAMILIAR_TEST",
    name: "Test Sprite",
    type: "Familiar",
    source: "Test Book",
    sources: ["Test Book"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: " A helpful spirit. ",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const stat = (name: string, value: number) =>
  [name, { name, value, contributions: [] }] as const;
const stats = Object.fromEntries([
  stat("AC", 18),
  stat("Fortitude Defense", 14),
  stat("Reflex Defense", 16),
  stat("Will Defense", 17),
  stat("FAMILIAR.AC", 1),
  stat("FAMILIAR.Speed", 2),
]);

describe("familiar card", () => {
  it("shows the familiar's fields with its master's defenses and bonuses", () => {
    expect(
      sheetFamiliarCard(
        familiar({
          Size: "Tiny",
          Tier: "Heroic Tier",
          Speed: " 4 ",
          "Secondary Speed": "fly 6",
          Senses: "Low-light vision",
          "Constant Benefits": "You gain a +2 bonus to Arcana checks.",
          Power: "Light: You shed bright light.",
          Quirks: "",
        }),
        stats,
      ),
    ).toEqual({
      kind: "familiar",
      id: "FAMILIAR_TEST",
      name: "Test Sprite",
      size: "Tiny",
      tier: "Heroic Tier",
      speed: "6, fly 6",
      senses: "Low-light vision",
      defenses: { ac: 19, fortitude: 14, reflex: 16, will: 17 },
      hitPoints: 1,
      constantBenefits: "You gain a +2 bonus to Arcana checks.",
      activeBenefits: "Light: You shed bright light.",
      description: "A helpful spirit.",
      source: "Test Book",
    });
  });

  it("defaults to Tiny and omits what the familiar doesn't author", () => {
    const card = sheetFamiliarCard(familiar({ Size: " " }), {});
    expect(card.size).toBe("Tiny");
    expect(card.defenses).toEqual({});
    expect(card).not.toHaveProperty("speed");
    expect(card).not.toHaveProperty("quirks");
  });
});
