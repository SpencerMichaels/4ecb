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
      {
        id: "consumable:1",
        name: "Arrows",
        quantity: 25,
        boxes: false,
        icon: "bow-arrow",
      },
      {
        id: "consumable:0",
        name: "Potion",
        quantity: 3,
        boxes: true,
        icon: "flask-round",
      },
    ]);
  });
  it("uses tracking boxes through five, count boxes for larger/custom quantities, and omits empty stocks", () => {
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
    expect(result.map((item) => [item.quantity, item.boxes])).toEqual([
      [1, true],
      [1.5, false],
      [5, true],
      [6, false],
    ]);
  });
  it("omits parentheticals except where different owned variants would collide", () => {
    const inventory = [
      "Elixir (Lvl 5)",
      "Oil (heroic tier)",
      "Potion (Lvl 5)",
      "Potion (Lvl 10)",
      "Salve (heroic tier)",
      "Salve (heroic tier)",
    ].map((name) => ({
      name,
      quantity: 1,
      equipped: 0,
      slots: [],
      fields: [],
      itemType: "Potion",
    }));
    expect(
      scratchpadConsumables({
        ...model,
        overview: { ...model.overview!, inventory },
      }).map((item) => item.name),
    ).toEqual([
      "Elixir",
      "Oil",
      "Potion (Lvl 10)",
      "Potion (Lvl 5)",
      "Salve",
      "Salve",
    ]);
  });
  it("uses the same composed-item metadata mapping as item cards", () => {
    const inventory = [
      {
        name: "Special arrows",
        quantity: 5,
        equipped: 0,
        slots: [],
        itemType: "Magic Item",
        baseItemType: "Ammunition",
        fields: [{ label: "Magic Item Type", value: "Ammunition" }],
      },
    ];
    expect(
      scratchpadConsumables({
        ...model,
        overview: { ...model.overview!, inventory },
      })[0]?.icon,
    ).toBe("bow-arrow");
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
