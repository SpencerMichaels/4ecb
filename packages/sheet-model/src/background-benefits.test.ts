import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  backgroundPlayBenefit,
  inherentBackgroundBenefit,
} from "./background-benefits";
import { buildSheetModel } from "./index";
import { withSheetOverview } from "./overview";

function background(
  rules: ContentEntity["rules"],
  benefit: string,
): ContentEntity {
  return {
    id: "bg:test",
    name: "Test Background",
    type: "Background",
    source: "Synthetic",
    sources: [],
    attributes: [],
    categories: [],
    rules,
    extensions: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
    description: "",
    specifics: [
      { name: "Benefit", value: benefit, extraAttributes: [], ordinal: 0 },
    ],
  };
}
const rule = (name: string, attributes: Record<string, string>) => ({
  name,
  attributes: Object.entries(attributes).map(([name, value]) => ({
    name,
    value,
  })),
  text: "",
  children: [],
  ordinal: 0,
});

describe("background benefits in play", () => {
  it("keeps mechanical benefits and drops what the build applies", () => {
    for (const text of [
      "You can reroll any Arcana check, but you must keep the second result, even if it is worse. You also know Deep Speech as an additional language.",
      "You gain Terrain Walk in one of the following environments, allowing you to bypass difficult terrain: Earth, Forest, Ice, or Swamp.",
      "While in an urban environment, you can substitute Streetwise for Nature when using a ritual that requires a Nature check.",
      "It takes four failed death saves to kill you.",
      "You gain a +3 bonus to Nature checks made to recall useful information about geography.",
    ])
      expect(backgroundPlayBenefit(text), text).toBe(true);
    for (const text of [
      "You add Perception and Insight to your class skill list, and you gain a +1 bonus to Perception and Insight checks.",
      "You know one additional language of your choice, you add Diplomacy to your class skill list, and you gain a +2 bonus to Diplomacy checks.",
      "You gain proficiency in a simple or military weapon of your choice, and you gain a +1 bonus to initiative checks.",
      "You substitute your highest ability score for Constitution to determine your initial hit points.",
      "+2 bonus to Acrobatics and Diplomacy.",
      "You can speak, read, and write All fluently.",
      "You gain resist 2 cold, resist 2 fire, and resist 2 thunder (or your existing resistance to these damage types increases by 2). At 11th level, these values improve to resist 3 (or increase by 3), and at 21st level, they improve to resist 5.",
    ])
      expect(backgroundPlayBenefit(text), text).toBe(false);
  });

  it("reads a background's own benefit only when it implements it", () => {
    const text = "While shifting, you gain a +2 bonus to Intimidate checks.";
    expect(
      inherentBackgroundBenefit(
        background(
          [
            rule("grant", {
              name: "ID_INTERNAL_BACKGROUND_ASSOCIATION_NATURE",
              type: "Background Association",
            }),
          ],
          text,
        ),
      ),
    ).toBeUndefined();
    expect(
      inherentBackgroundBenefit(
        background(
          [
            rule("statadd", {
              name: "Intimidate Misc",
              value: "+2",
              condition: "while you are shifting",
            }),
          ],
          text,
        ),
      ),
    ).toBe(text);
  });

  it("puts a chosen benefit in Remember in play", () => {
    const benefit =
      "You can reroll any Arcana check, but you must keep the second result, even if it is worse.";
    const base = buildSheetModel(
      {
        details: { name: "Background hero", Level: "3" },
        abilities: {},
        stats: {},
        selectedRules: [],
        levelCount: 3,
        source: "legacy-cache",
        textStrings: {},
        loot: [],
        powers: [],
      },
      [],
    );
    const overview = withSheetOverview(
      {
        ...base,
        features: [
          {
            group: "Background",
            entries: [
              {
                label: "Background benefit",
                value: benefit,
                choices: [
                  {
                    id: "ID_TEST_IMASKAR_BENEFIT",
                    name: "High Imaskar Benefit",
                    type: "Background Choice",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        level: 3,
        stats: {},
        selections: [],
        content: [],
        inventory: [],
      },
    ).overview!;
    expect(overview.reminders).toContainEqual(
      expect.objectContaining({
        label: "Background benefit",
        value: benefit,
        choice: "High Imaskar Benefit",
        category: "Other reminders",
      }),
    );
  });
});
