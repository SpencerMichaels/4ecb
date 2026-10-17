import { describe, expect, it } from "vitest";
import { buildSheetModel } from "@4ecb/sheet-model";
import { scratchpadConsumables } from "./scratchpad-consumables";

const model = buildSheetModel({
  details: {},
  abilities: {},
  stats: {},
  selectedRules: [],
  textStrings: {},
  powers: [],
  levelCount: 1,
  source: "legacy-cache",
  loot: [
    {
      name: "Potion",
      count: 3,
      equippedCount: 0,
      showPowerCard: false,
      elements: [{ id: "p", name: "Potion", type: "Potion" }],
    },
    {
      name: "Arrows",
      count: 25,
      equippedCount: 0,
      showPowerCard: false,
      elements: [{ id: "a", name: "Arrows", type: "Ammunition" }],
    },
    {
      name: "Potion-shaped sword",
      count: 1,
      equippedCount: 1,
      showPowerCard: true,
      elements: [{ id: "s", name: "Sword", type: "Weapon" }],
    },
  ],
});
describe("scratchpad consumable stock", () => {
  it("uses owned inventory metadata, not item names or card visibility", () => {
    expect(scratchpadConsumables(model)).toEqual([
      { id: "consumable:1", name: "Arrows", quantity: 25, circles: false },
      { id: "consumable:0", name: "Potion", quantity: 3, circles: true },
    ]);
  });
  it("uses circles through five, count boxes for larger/custom quantities, and omits empty stocks", () => {
    const items = [0, 1, 5, 6, 1.5].map((quantity) => ({
      name: `Stock ${quantity}`,
      quantity,
      equipped: 0,
      slots: [],
      fields: [],
      category: "consumables",
    }));
    const result = scratchpadConsumables({
      ...model,
      overview: { ...model.overview!, inventory: items },
    });
    expect(result.map((item) => [item.quantity, item.circles])).toEqual([
      [1, true],
      [1.5, false],
      [5, true],
      [6, false],
    ]);
  });
  it("recognizes authored consumable powers without guessing from prose", () => {
    const item = {
      name: "Coin",
      quantity: 2,
      equipped: 0,
      slots: [],
      fields: [
        {
          label: "Utility Power",
          value: "Consumable (Free Action)\nEffect: Gain a bonus.",
        },
      ],
    };
    expect(
      scratchpadConsumables({
        ...model,
        overview: { ...model.overview!, inventory: [item] },
      }),
    ).toHaveLength(1);
  });
});
