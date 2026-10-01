import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import {
  printItemPresentation,
  printItemPower,
} from "./print-item-presentation";

function card(
  itemType: string,
  values: Record<string, string>,
  baseItemType = itemType,
): SheetCard {
  return {
    kind: "item",
    name: "Synthetic item",
    itemType,
    baseItemType,
    fields: Object.entries(values).map(([label, value]) => ({ label, value })),
  };
}

describe("printed item presentation", () => {
  it("preserves weapon fields and moves long magical values into the body", () => {
    const view = printItemPresentation(
      card(
        "Magic Item",
        {
          Damage: "1d10",
          "Proficiency Bonus": "+2",
          Group: "Heavy blade, axe",
          Range: "5/10",
          Quantity: "2",
          Enhancement: "+3 attack rolls and damage rolls",
          Critical: "+3d6 damage, or +3d10 against undead",
          Level: "13",
          Gold: "17000",
          Weight: "6",
          "Magic Item Type": "Weapon",
          Flavor: "A dramatic flourish.",
        },
        "Weapon",
      ),
    );
    expect(view.icon).toBe("sword");
    expect(view.kind).toBe("Weapon");
    expect(view.stats).toHaveLength(5);
    expect(view.rules.map(({ label }) => label)).toEqual([
      "Enhancement",
      "Critical",
    ]);
    expect(view).toMatchObject({
      weight: "6 lb",
      price: "17000 gp",
      level: "13",
    });
  });
  it.each(["Armor Bonus", "AC Bonus"])(
    "supports %s plus check and speed without truncation",
    (armorLabel) => {
      const view = printItemPresentation(
        card(
          "Magic Item",
          {
            [armorLabel]: "8",
            Check: "-2",
            Speed: "-1",
            Quantity: "1",
            "Armor Type": "Heavy Shield",
            Property: "Retained property.",
          },
          "Armor",
        ),
      );
      expect(view.icon).toBe("shield");
      expect(view.stats.map(({ value }) => value)).toEqual(["8", "-2", "-1"]);
      expect(view.rules).toEqual([
        { label: "Property", value: "Retained property." },
      ]);
    },
  );
  it.each([
    ["Gear", undefined, "item", "Gear"],
    ["Magic Item", "Holy Symbol", "church", "Holy Symbol"],
    ["Magic Item", "Potion", "flask-round", "Potion"],
    ["Magic Item", "Feet Slot Item", "footprints", "Feet item"],
  ])("uses shop category icons for %s/%s", (type, magicType, icon, kind) => {
    const view = printItemPresentation(
      card(type!, magicType ? { "Magic Item Type": magicType } : {}),
    );
    expect(view).toMatchObject({ icon, kind });
  });
  it("preserves unknown custom description and omits explicitly marked flavor", () => {
    const custom = {
      ...card("Item", {}),
      description: "Custom item instructions.",
    };
    expect(printItemPresentation(custom).description).toBe(custom.description);
    expect(
      printItemPresentation({
        ...custom,
        fields: [{ label: "Quantity", value: "2" }],
      }).description,
    ).toBe(custom.description);
    expect(
      printItemPresentation({ ...custom, flavor: custom.description })
        .description,
    ).toBeUndefined();
  });
  it("gives every activated power its own usage/action heading without changing effects", () => {
    expect(
      printItemPower({
        label: "Power",
        value: "Power (Daily • Healing): Minor Action. Spend a surge.",
      }),
    ).toEqual({ title: "Daily • Healing · Minor", text: "Spend a surge." });
    expect(
      printItemPower({
        label: "Power",
        value:
          "Power (Encounter): Immediate Reaction. Trigger: You are hit. Effect: Teleport 5 squares.",
      }),
    ).toEqual({
      title: "Encounter · Immediate Reaction",
      text: "Trigger: You are hit. Effect: Teleport 5 squares.",
    });
    const unusual = {
      label: "Utility Power (Consumable)",
      value: "Use in an unusual way; keep every word.",
    };
    expect(printItemPower(unusual)).toEqual({
      title: unusual.label,
      text: unusual.value,
    });
    expect(
      printItemPower({
        label: "Utility Power",
        value: "Consumable (Minor Action): Effect: Gain a benefit.",
      }),
    ).toEqual({ title: "Consumable · Minor", text: "Effect: Gain a benefit." });
    expect(
      printItemPower({
        label: "Utility Power (Consumable)",
        value: "Minor Action. Effect: Gain a benefit.",
      }),
    ).toEqual({ title: "Consumable · Minor", text: "Effect: Gain a benefit." });
    expect(
      printItemPower({ label: "Property", value: "Passive benefit." }),
    ).toBeUndefined();
  });
});
