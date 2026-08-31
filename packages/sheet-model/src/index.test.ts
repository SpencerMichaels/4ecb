import { describe, expect, it } from "vitest";

import { buildSheetModel } from ".";

describe("sheet model", () => {
  it("maps legacy cached values and enriches cards from content", () => {
    const model = buildSheetModel(
      {
        details: { name: "Ada", Level: "3" },
        abilities: { Strength: 14 },
        stats: { AC: "19", Arcana: "8", Strength: "16" },
        selectedRules: [{ id: "POWER_1", name: "Arc Flash", type: "Power" }],
        powers: [
          {
            id: "POWER_1",
            name: "Arc Flash",
            usage: "Encounter",
            weapons: [
              {
                name: "Wand",
                attackBonus: "7",
                defense: "Reflex",
                damage: "1d6+4",
              },
            ],
          },
        ],
        loot: [],
        textStrings: {},
        levelCount: 3,
        source: "legacy-cache",
      },
      [
        {
          id: "POWER_1",
          name: "Arc Flash",
          type: "Power",
          source: "Synthetic",
          sources: ["Synthetic"],
          attributes: [],
          categories: [],
          specifics: [
            {
              name: "Effect",
              value: "A test spark.",
              extraAttributes: [],
              ordinal: 0,
            },
          ],
          rules: [],
          description: "Description",
          extensions: [],
          provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
        },
      ],
    );
    expect(model.defenses).toContainEqual({ label: "AC", value: "19" });
    expect(model.abilities).toContainEqual({ label: "Strength", value: "16" });
    expect(model.powers[0]).toMatchObject({
      attack: "+7 vs Reflex",
      damage: "1d6+4",
      description: "Description",
    });
  });
});
