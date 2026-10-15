import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { OverviewInventory } from "./overview";
import { equippedItemPropertyReminders } from "./item-reminders";
const propertyDefinition = (
  name: string,
  description: string,
): ContentEntity => ({
  id: `property:${name}`,
  name,
  description,
  type: "Weapon Property",
  source: "Synthetic",
  sources: [],
  attributes: [],
  categories: [],
  rules: [],
  extensions: [],
  specifics: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
});

const item: OverviewInventory = {
  name: "Synthetic enchanted staff",
  quantity: 1,
  equipped: 1,
  slots: [],
  fields: [
    { label: "Properties", value: "Resonant (storm), Shoving" },
    {
      label: "Full Text",
      value:
        "A staff with unrelated flavor.\nProperties:\nResonant (storm) (When a matching power hits, add a bonus (only once per roll).).\nShoving (Whenever you push a foe, push it one extra square.).\nGroup:\nStaff (An ordinary implement.).",
    },
    {
      label: "Property",
      value: "Gain a bonus against enemies subject to your effects.",
    },
  ],
};

describe("equipped item property reminders", () => {
  it("expands declared names from authored property sections and retains nested parentheses", () => {
    expect(equippedItemPropertyReminders([item], [])).toEqual([
      {
        label: item.name,
        value:
          "Resonant (storm): When a matching power hits, add a bonus (only once per roll).",
      },
      {
        label: item.name,
        value: "Shoving: Whenever you push a foe, push it one extra square.",
      },
      {
        label: item.name,
        value: "Gain a bonus against enemies subject to your effects.",
      },
    ]);
  });
  it("uses general weapon-property definitions when item Full Text is absent", () => {
    const definition = propertyDefinition(
      "Rerolling",
      "Reroll a damage die showing the property's value or lower.",
    );
    expect(
      equippedItemPropertyReminders(
        [{ ...item, fields: [{ label: "Properties", value: "Rerolling 1" }] }],
        [definition],
      ),
    ).toEqual([
      { label: item.name, value: `Rerolling 1: ${definition.description}` },
    ]);
  });
  it("prefers item-specific explanations over general property prose", () => {
    const definition = propertyDefinition(
      "Shoving",
      "Whenever you push, use the generic rule.",
    );
    expect(equippedItemPropertyReminders([item], [definition])[1]?.value).toBe(
      "Shoving: Whenever you push a foe, push it one extra square.",
    );
  });
  it("does not add carried/zero-quantity items, empty properties, or simple precalculated bonuses", () => {
    const passive = {
      ...item,
      fields: [
        { label: "Property", value: "You gain a +1 bonus to attack rolls." },
        { label: "Properties", value: "Precise" },
        {
          label: "Full Text",
          value: "Properties:\nPrecise (You gain a +1 bonus to attack rolls.).",
        },
      ],
    };
    expect(
      equippedItemPropertyReminders(
        [{ ...item, equipped: 0 }, { ...item, quantity: 0 }, passive],
        [],
      ),
    ).toEqual([]);
  });
  it("preserves prose Properties fields and deduplicates repeated fields", () => {
    const field = {
      label: "Properties",
      value: "When you hit, you may shift.",
    };
    expect(
      equippedItemPropertyReminders([{ ...item, fields: [field, field] }], []),
    ).toEqual([{ label: item.name, value: field.value }]);
  });
  it("does not invent explanations for missing or incomplete authored descriptions", () => {
    const fields = [
      { label: "Properties", value: "Unknown" },
      {
        label: "Full Text",
        value: "Properties:\nUnknown (When you hit, an incomplete clause",
      },
    ];
    expect(equippedItemPropertyReminders([{ ...item, fields }], [])).toEqual(
      [],
    );
    expect(fields[1]?.value).toContain("incomplete clause");
  });
});
