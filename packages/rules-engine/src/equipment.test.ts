import { describe, expect, it } from "vitest";

import {
  equipmentPredicate,
  matchesEquipmentSelector,
  type EquipmentState,
} from "./equipment";

const state: EquipmentState = {
  items: [
    {
      id: "sword",
      name: "Longsword",
      type: "Weapon",
      categories: ["Heavy Blade", "Military", "Two-Handed"],
      properties: ["Versatile"],
      hands: 2,
      quantity: 1,
    },
    {
      id: "dagger",
      name: "Dagger",
      type: "Weapon",
      categories: ["Light Blade"],
      properties: ["Off-hand"],
      hands: 1,
      quantity: 1,
    },
    {
      id: "armor",
      name: "Cloth",
      type: "Armor",
      categories: ["Light"],
      properties: [],
      slot: "Body",
      quantity: 1,
    },
  ],
};

describe("equipment predicates", () => {
  it("matches armor, weapon, slot, property, and versatile selectors", () => {
    expect(equipmentPredicate(state, "armor:light")).toBe(true);
    expect(equipmentPredicate(state, "weapon:heavy blade")).toBe(true);
    expect(equipmentPredicate(state, "SLOT:Body")).toBe(true);
    expect(equipmentPredicate(state, "versatile:heavy blade")).toBe(true);
    expect(matchesEquipmentSelector(state.items[0]!, "military")).toBe(true);
    expect(equipmentPredicate(state, "weapon:two-handed,heavy blade")).toBe(
      true,
    );
    expect(equipmentPredicate(state, "weapon:!axe")).toBe(true);
    expect(equipmentPredicate(state, "Armor:*")).toBe(true);
    expect(equipmentPredicate(state, "only-weapon:heavy blade")).toBe(false);
  });

  it("recognizes dual-wielding projections", () => {
    expect(equipmentPredicate(state, "DUAL-WIELDING:")).toBe(true);
    expect(
      equipmentPredicate(state, "DUAL-WIELDING:heavy blade,light blade"),
    ).toBe(true);
    expect(equipmentPredicate(state, "armor:heavy")).toBe(false);
  });

  it("recognizes the recovered singular dual-shield selector", () => {
    expect(
      equipmentPredicate(
        {
          items: [
            {
              id: "shields",
              name: "Heavy Shield",
              type: "Armor",
              categories: ["Shield"],
              properties: [],
              quantity: 2,
            },
          ],
        },
        "DUAL-SHIELD:",
      ),
    ).toBe(true);
  });
});
