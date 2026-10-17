import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import {
  printItemPresentation,
  printItemPower,
  printItemPowerClauses,
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
  it.each(["Heroic", "Paragon", "Epic"])(
    "moves the %s tier suffix into footer metadata",
    (tier) => {
      const item = {
        ...card("Magic Item", { "Magic Item Type": "Arms Slot Item" }),
        name: `Fixture armbands (${tier.toLowerCase()} tier)`,
      };
      const view = printItemPresentation(item);
      expect(view.name).toBe("Fixture armbands");
      expect(view.metadata).toContain(`${tier} tier`);
      expect(item.name).toContain("tier)");
      expect(
        printItemPresentation({ ...item, name: "Fixture potion (Lvl 5)" }).name,
      ).toBe("Fixture potion (Lvl 5)");
    },
  );
  it.each([
    ["3", "+3"],
    ["+3", "+3"],
    ["0", "+0"],
    ["-1", "-1"],
  ])("signs proficiency %s as %s", (value, displayed) => {
    expect(
      printItemPresentation(card("Weapon", { "Proficiency Bonus": value }))
        .stats,
    ).toContainEqual({ label: "Proficiency", value: displayed });
  });
  it.each(["Neck Slot Item", "Weapon", "Wand", "Armor"])(
    "omits a bare enhancement bonus for %s",
    (kind) => {
      const view = printItemPresentation(
        card("Magic Item", { "Magic Item Type": kind, Enhancement: "+1" }),
      );
      expect(view.stats.map(({ label }) => label)).not.toContain("Enhancement");
      expect(view.rules).toEqual([]);
    },
  );
  it.each([
    ["Neck Slot Item", "+2 Fortitude, Reflex, and Will"],
    ["Weapon", "+2 attack rolls and damage rolls"],
    ["Armor", "+2 AC"],
  ])(
    "shows a %s enhancement that names what it modifies as the first body rule",
    (kind, enhancement) => {
      const view = printItemPresentation(
        card("Magic Item", {
          "Magic Item Type": kind,
          Property: "A passive benefit.",
          Enhancement: enhancement,
        }),
      );
      expect(view.stats.map(({ label }) => label)).not.toContain("Enhancement");
      expect(view.rules).toEqual([
        { label: "Enhancement", value: enhancement },
        { label: "Property", value: "A passive benefit." },
      ]);
    },
  );
  it("keeps ranged combat values together on one row", () => {
    const view = printItemPresentation(
      card("Weapon", {
        Range: "25/50",
        "Proficiency Bonus": "+2",
        Damage: "1d12",
        Critical: "+3d6",
      }),
    );
    expect(view.statRows.map((row) => row.map(({ label }) => label))).toEqual([
      ["Range", "Proficiency", "Damage", "Critical"],
    ]);
  });
  it("preserves physical and magical structured values in the subheader", () => {
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
    expect(view.stats).toHaveLength(3);
    expect(view.stats.some(({ label }) => label === "Quantity")).toBe(false);
    expect(view.rules.some(({ label }) => label === "Quantity")).toBe(false);
    expect(view.rules).toEqual([
      { label: "Enhancement", value: "+3 attack rolls and damage rolls" },
      { label: "Critical", value: "+3d6 damage, or +3d10 against undead" },
    ]);
    expect(view.statRows.map((row) => row.map(({ label }) => label))).toEqual([
      ["Range", "Proficiency", "Damage"],
    ]);
    expect(view.metadata).toBe("Heavy blade, axe");
    expect(view).toMatchObject({
      weight: "6 lb",
      price: "17000 gp",
      level: "13",
    });
  });
  it("compacts standard enhancement and critical formulas without discarding conditional riders", () => {
    const simple = printItemPresentation(
      card("Magic Item", {
        Enhancement: "+3 attack rolls and damage rolls",
        Critical: "+3d12 damage",
        "Magic Item Type": "Wand",
      }),
    );
    expect(simple.stats).toEqual([{ label: "Critical", value: "+3d12" }]);
    const conditional = printItemPresentation(
      card("Weapon", {
        Critical: "+3d6 damage, or +3d10 against undead",
      }),
    );
    expect(conditional.stats).toEqual([]);
    expect(conditional.rules).toEqual([
      { label: "Critical", value: "+3d6 damage, or +3d10 against undead" },
    ]);
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
      expect(view.weaponProperties).toEqual([]);
      expect(view.rules).toEqual([
        { label: "Property", value: "Retained property." },
      ]);
    },
  );
  it("moves only weapon keyword properties into the subheader, retaining paragraph properties in the body", () => {
    const view = printItemPresentation(
      card("Weapon", {
        Properties: "Off-hand, light thrown",
        Property: "Gain a bonus against marked targets.",
        Power: "Power (Daily): Minor Action. Activate the item.",
      }),
    );
    expect(view.weaponProperties.map(({ value }) => value)).toEqual([
      "Off-hand, light thrown",
    ]);
    expect(view.rules.map(({ label }) => label)).toEqual(["Power", "Property"]);
    expect(view.description).toBeUndefined();
  });
  it("places passive properties below item actions regardless of authored field order", () => {
    const view = printItemPresentation(
      card("Magic Item", {
        Power: "Power (Daily): Minor Action. Activate the item.",
        Property: "Gain a bonus to ranged damage.",
        Enhancement: "+2",
        "Utility Power": "Power (Encounter): Free Action. Another activation.",
      }),
    );
    expect(view.rules.map(({ label }) => label)).toEqual([
      "Power",
      "Utility Power",
      "Property",
    ]);
  });
  it("places general item rules after powers while keeping explicit requirements before them", () => {
    const view = printItemPresentation(
      card("Magic Item", {
        Special: "A restriction on using another such item.",
        Property: "A passive benefit.",
        Requirement: "You must carry the item.",
        Power:
          "Power (Daily): Minor Action. Effect: Activate it. Special: A power-specific restriction.",
        "Custom instructions": "Keep this note.",
        Prerequisite: "A required feature.",
        "Utility Power": "Power (Encounter): Free Action. Another activation.",
        Critical: "+1d6 damage against a marked target.",
      }),
    );
    expect(view.rules.map((field) => field.label)).toEqual([
      "Requirement",
      "Prerequisite",
      "Power",
      "Utility Power",
      "Special",
      "Property",
      "Custom instructions",
      "Critical",
    ]);
    expect(printItemPower(view.rules[2]!)?.text).toContain(
      "Special: A power-specific restriction.",
    );
  });
  it("projects known enum fields but leaves passive and unfamiliar prose in the body", () => {
    const view = printItemPresentation(
      card("Armor", {
        "Armor Category": "Plate",
        "Armor Type": "Heavy",
        "Hands Required": "One-handed",
        Rarity: "Rare",
        "Key Ability": "Wisdom",
        Property: "Gain resistance while bloodied.",
        "Custom instructions": "Use this item in a special way.",
        Copper: "3",
      }),
    );
    expect(view.stats).toEqual([]);
    expect(view.metadata).toBe(
      "Rare one-handed heavy plate armor · Key ability Wisdom",
    );
    expect(view.rules.map(({ label }) => label)).toEqual([
      "Property",
      "Custom instructions",
    ]);
    expect(view.price).toBe("3 cp");
  });
  it("groups melee combat values and combines metadata with an unlabeled held-item footer", () => {
    const view = printItemPresentation(
      card(
        "Magic Item",
        {
          "Magic Item Type": "Weapon",
          "Weapon Category": "Military Melee",
          "Hands Required": "One-handed",
          Group: "Hammer",
          Rarity: "Uncommon",
          Damage: "1d10",
          "Proficiency Bonus": "+2",
          Critical: "+2d6 damage",
          Enhancement: "+2 attack rolls and damage rolls",
          "Item Slot": "Main-hand",
          Weight: "6",
          Gold: "1000",
        },
        "Weapon",
      ),
    );
    expect(view.statRows.map((row) => row.map(({ label }) => label))).toEqual([
      ["Proficiency", "Damage", "Critical"],
    ]);
    expect(view.metadata).toBe("Uncommon one-handed hammer · Military melee");
    expect(view.slot).toBeUndefined();
    expect(view.footerDetails).toBe("6 lb · 1000 gp");
  });
  it("groups armor bonuses and penalties, omits zero penalties, and preserves worn slots", () => {
    const view = printItemPresentation(
      card(
        "Magic Item",
        {
          "Armor Bonus": "8",
          Enhancement: "+2 AC",
          Check: "-2",
          Speed: "-1",
          "Armor Type": "Heavy",
          "Armor Category": "Plate",
          Rarity: "Rare",
          "Item Slot": "Body",
          Weight: "50",
          Gold: "5000",
        },
        "Armor",
      ),
    );
    expect(view.statRows.map((row) => row.map(({ label }) => label))).toEqual([
      ["AC bonus"],
      ["Check penalty", "Speed penalty"],
    ]);
    expect(view.rules).toEqual([{ label: "Enhancement", value: "+2 AC" }]);
    expect(view.metadata).toBe("Rare heavy plate armor");
    expect(view.footerDetails).toBe("Body · 50 lb · 5000 gp");
    const shield = printItemPresentation(
      card("Armor", {
        "Armor Type": "Heavy Shield",
        "Armor Bonus": "2",
        Check: "-2",
        Speed: "-",
        "Item Slot": "Off-hand",
      }),
    );
    expect(shield.stats.map(({ label }) => label)).toEqual([
      "AC bonus",
      "Check penalty",
    ]);
    expect(shield.metadata).toBe("Heavy shield");
    expect(shield.slot).toBeUndefined();
  });
  it("puts implement enhancement and critical on one row and hides held slots", () => {
    const view = printItemPresentation(
      card("Magic Item", {
        "Magic Item Type": "Holy Symbol",
        Enhancement: "+2",
        Critical: "+2d6",
        "Item Slot": "Symbol",
        Rarity: "Uncommon",
      }),
    );
    expect(view.statRows.map((row) => row.map(({ label }) => label))).toEqual([
      ["Critical"],
    ]);
    expect(view.rules).toEqual([]);
    expect(view.slot).toBeUndefined();
    expect(view.metadata).toBe("Uncommon holy symbol");
  });
  it.each([
    ["Gear", undefined, "item", "Gear"],
    ["Magic Item", "Holy Symbol", "church", "Holy Symbol"],
    ["Magic Item", "Potion", "flask-round", "Potion"],
    ["Magic Item", "Ammunition", "bow-arrow", "Ammunition"],
    ["Magic Item", "Feet Slot Item", "footprints", "Feet item"],
  ])("uses shop category icons for %s/%s", (type, magicType, icon, kind) => {
    const view = printItemPresentation(
      card(type!, magicType ? { "Magic Item Type": magicType } : {}),
    );
    expect(view).toMatchObject({ icon, kind });
  });
  it("uses the ammunition icon for mundane gear categories too", () => {
    expect(
      printItemPresentation(card("Gear", { "Gear Category": "Ammunition" }))
        .icon,
    ).toBe("bow-arrow");
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
        itemType: "Gear",
        fields: [{ label: "Category", value: "Gear" }],
      }).description,
    ).toBe(custom.description);
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
  it("recognizes No Action and preserves separate Trigger, Effect and Augment clauses", () => {
    const text =
      "Trigger: You are hit. Effect: Make a saving throw. Augment 1: Gain a bonus to that saving throw.";
    const field = {
      label: "Power",
      value: `Power (Encounter • Augmentable): No Action. ${text}`,
    };
    expect(printItemPower(field)).toEqual({
      title: "Encounter • Augmentable • No Action",
      usage: "Encounter",
      keywords: "Augmentable",
      actionType: "No Action",
      text,
    });
    expect(printItemPowerClauses(text)).toEqual([
      { label: "Trigger", value: "You are hit." },
      { label: "Effect", value: "Make a saving throw." },
      { label: "Augment 1", value: "Gain a bonus to that saving throw." },
    ]);
    expect(field.value).toContain(
      "Power (Encounter • Augmentable): No Action.",
    );
  });
  it.each([": ", "\n", ".\n"])(
    "parses consumable action prefixes terminated with %j",
    (separator) => {
      const text =
        "Effect: Gain a bonus.\nSpecial: Wait until an extended rest to use another.";
      expect(
        printItemPower({
          label: "Utility Power",
          value: `consumable (free action)${separator}${text}`,
        }),
      ).toEqual({
        title: "Consumable • Free",
        usage: "Consumable",
        actionType: "Free",
        text,
      });
      expect(printItemPowerClauses(text).map((clause) => clause.label)).toEqual(
        ["Effect", "Special"],
      );
    },
  );
  it("separates and normalizes usage without changing authored keywords or effect text", () => {
    expect(
      printItemPower({
        label: "Power",
        value:
          "Power (consumable • Fire, Healing): minor action. Drink the potion.",
      }),
    ).toEqual({
      title: "Consumable • Fire, Healing • Minor",
      usage: "Consumable",
      keywords: "Fire, Healing",
      actionType: "Minor",
      text: "Drink the potion.",
    });
  });
  it.each([
    "utility Power (Daily * Teleportation)",
    "Utility Power (Teleportation • Daily)",
    "Utility Power * Daily • Teleportation",
    "Power (Daily · Teleportation): Move Action",
  ])("reads metadata from the field label: %s", (label) => {
    const labelHasAction = label.endsWith("Move Action");
    const text = "Effect: Teleport an ally.";
    expect(
      printItemPower({
        label,
        value: labelHasAction ? text : `Move Action.\n${text}`,
      }),
    ).toEqual({
      title: "Daily • Teleportation • Move",
      usage: "Daily",
      keywords: "Teleportation",
      actionType: "Move",
      text,
    });
  });
  it("keeps prose and tables intact when splitting authored clauses", () => {
    const text =
      "Keep this sentence.\nTrigger: You are hit.\nEffect: Gain a benefit.\n<table>Name\tEffect\nOption\tSpecial: Keep this cell.</table>";
    expect(printItemPowerClauses(text)).toEqual([
      { label: "", value: "Keep this sentence." },
      { label: "Trigger", value: "You are hit." },
      {
        label: "Effect",
        value:
          "Gain a benefit.\n<table>Name\tEffect\nOption\tSpecial: Keep this cell.</table>",
      },
    ]);
  });
  it("gives every activated power its own usage/action heading without changing effects", () => {
    expect(
      printItemPower({
        label: "Power",
        value: "Power (Daily • Healing): Minor Action. Spend a surge.",
      }),
    ).toEqual({
      title: "Daily • Healing • Minor",
      text: "Spend a surge.",
      usage: "Daily",
      keywords: "Healing",
      actionType: "Minor",
    });
    expect(
      printItemPower({
        label: "Power",
        value:
          "Power (Encounter): Immediate Reaction. Trigger: You are hit. Effect: Teleport 5 squares.",
      }),
    ).toEqual({
      title: "Encounter • Immediate Reaction",
      usage: "Encounter",
      actionType: "Immediate Reaction",
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
    ).toEqual({
      title: "Consumable • Minor",
      text: "Effect: Gain a benefit.",
      usage: "Consumable",
      actionType: "Minor",
    });
    expect(
      printItemPower({
        label: "Utility Power (Consumable)",
        value: "Minor Action. Effect: Gain a benefit.",
      }),
    ).toEqual({
      title: "Consumable • Minor",
      text: "Effect: Gain a benefit.",
      usage: "Consumable",
      actionType: "Minor",
    });
    expect(
      printItemPower({ label: "Property", value: "Passive benefit." }),
    ).toBeUndefined();
  });
});
