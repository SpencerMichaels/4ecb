import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import type { FieldOverlay } from "./evaluator";
import {
  increaseDamageDie,
  legacyItemSlot,
  legacyLootSlots,
  legacySlotMatches,
  legacyLootImplement,
  overlaidEntity,
  overlaidField,
  overlayTargets,
  withOverlaidItems,
} from "./item-fields";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const overlay = (changes: Partial<FieldOverlay>): FieldOverlay => ({
  providerOccurrenceId: "feat",
  targetDefinitionIds: [],
  field: "Properties",
  ...changes,
});

describe("item field overlays (native C_RulesElementField)", () => {
  it("steps dice through the native one-handed table", () => {
    expect(
      ["1d4", "1d6", "1d8", "1d10", "1d12", "2d6", "2d8", "2d10"].map((die) =>
        increaseDamageDie(die),
      ),
    ).toEqual(["1d6", "1d8", "1d10", "1d12", "2d6", "2d8", "2d10", "2d10"]);
    expect(increaseDamageDie("2d4")).toBe("1d10");
    expect(increaseDamageDie("d8")).toBe("1d10");
    expect(increaseDamageDie("1d6/1d4")).toBe("1d8/1d6");
    expect(increaseDamageDie("1d4", 2)).toBe("1d8");
    expect(increaseDamageDie("1d8 + 2")).toBe("1d8 + 2");
    expect(increaseDamageDie("")).toBe("");
  });

  it("targets records by name, ID, type and Large size, never by context name", () => {
    const scythe = entity("SCYTHE", "Scythe", "Weapon");
    const large = entity("LARGE_SCYTHE", "Large Scythe", "Weapon");
    const named = overlay({ targetName: "Scythe", targetType: "Weapon" });
    expect(overlayTargets(named, scythe)).toBe(true);
    expect(overlayTargets(named, large)).toBe(true);
    expect(overlayTargets(overlay({ targetName: "SCYTHE" }), scythe)).toBe(
      true,
    );
    expect(
      overlayTargets(
        overlay({ targetName: "Scythe", targetType: "Power" }),
        scythe,
      ),
    ).toBe(false);
    expect(
      overlayTargets(
        overlay({ targetName: "BaseItem" }),
        entity("B", "BaseItem", "Weapon"),
      ),
    ).toBe(false);
    expect(
      overlayTargets(
        overlay({ targetName: "BaseItem", targetDefinitionIds: ["SCYTHE"] }),
        scythe,
      ),
    ).toBe(true);
  });

  it("applies value, list-addition and die-increase in order without mutating content", () => {
    const sling = entity("SLING", "Sling", "Weapon", {
      Damage: "1d6",
      Properties: "Load Free",
    });
    const overlays = [
      overlay({ targetName: "Sling", listAddition: "High Crit" }),
      overlay({ targetName: "Sling", field: "Proficiency Bonus", value: "3" }),
      overlay({ targetName: "Sling", field: "Damage", dieIncrease: "1" }),
    ];
    expect(overlaidField(sling, "Properties", overlays)).toBe(
      "Load Free, High Crit",
    );
    const resolved = overlaidEntity(sling, overlays);
    expect(
      Object.fromEntries(resolved.specifics.map((s) => [s.name, s.value])),
    ).toEqual({
      Damage: "1d8",
      Properties: "Load Free, High Crit",
      "Proficiency Bonus": "3",
    });
    expect(sling.specifics.map((s) => s.value)).toEqual(["1d6", "Load Free"]);
    expect(overlaidEntity(sling, [])).toBe(sling);
  });

  it("overlays only loot records in an entity list", () => {
    const entities = [
      entity("SLING", "Sling", "Weapon", { Properties: "" }),
      entity("POWER", "Sling", "Power", { Properties: "" }),
    ];
    const overlays = [
      overlay({ targetName: "Sling", listAddition: "High Crit" }),
    ];
    const [weapon, power] = withOverlaidItems(entities, overlays);
    expect(weapon?.specifics[0]?.value).toBe("High Crit");
    expect(power).toBe(entities[1]);
    expect(withOverlaidItems(entities, [])).toBe(entities);
  });
});

describe("legacyLootImplement special implements", () => {
  const records = [
    entity("WARLOCK", "Warlock", "Class"),
    entity("BARD", "Bard", "Class"),
  ];
  const resolve = {
    weaponEquiv: () => undefined,
    record: (reference: string) =>
      records.find(
        (record) => record.id.toLowerCase() === reference.trim().toLowerCase(),
      ),
  };
  const sword = (specifics: Record<string, string>) =>
    entity("SWORD", "Longsword", "Weapon", {
      Group: "Heavy Blade",
      ...specifics,
    });

  it("reads _ImplementAsClass as an alias of _ImplementForClass", () => {
    expect(legacyLootImplement(sword({}), undefined, resolve)).toBeUndefined();
    // An overlaid list-addition onto an empty field.
    const overlaid = overlaidEntity(sword({}), [
      overlay({
        targetName: "SWORD",
        targetType: "Weapon",
        field: "_ImplementAsClass",
        listAddition: "WARLOCK",
      }),
    ]);
    expect(legacyLootImplement(overlaid, undefined, resolve)).toBe("Implement");
    expect(
      legacyLootImplement(
        sword({ _ImplementAsClass: "BARD" }),
        undefined,
        resolve,
      ),
    ).toBe("instrument");
    // `_ImplementForClass` is read first; the alias still counts beside it.
    expect(
      legacyLootImplement(
        sword({ _ImplementForClass: "UNKNOWN", _ImplementAsClass: "BARD" }),
        undefined,
        resolve,
      ),
    ).toBe("instrument");
  });
});

describe("legacy loot slots (native ItemSlot/CharLootSlot)", () => {
  const plain = {
    small: false,
    oversized: false,
    oneSizeLarger: false,
    ambidextrous: false,
    versatileUsedTwoHanded: false,
  };
  const sword = entity("SWORD", "Sword", "Weapon", {
    "Hands Required": "One-Handed",
    "Item Slot": "One-hand",
    Properties: "Versatile",
  });
  const razor = entity("RAZOR", "Razor", "Weapon", {
    "Item Slot": "Off-hand",
    Properties: "Off-hand",
    _AlternateSlot: "Arms",
  });
  const double = entity("DOUBLE", "Double sword", "Weapon", {
    "Hands Required": "Two-Handed",
    "Item Slot": "Two-Hands",
    Properties: "Off-hand",
  });
  const ring = entity("RING", "Ring", "Magic Item", { "Item Slot": "Ring" });
  const holding = (
    base: ContentEntity,
    equippedQuantity = 1,
    alternate = false,
  ) => ({ base, name: base.name, equippedQuantity, alternate });

  it("names each equipped holding's hand slot", () => {
    expect(
      legacyLootSlots(
        [
          holding(sword),
          holding(razor),
          holding(double),
          holding(ring, 2),
          holding(razor, 1, true),
        ],
        plain,
      ),
    ).toEqual(["Main hand", "Off hand", "Two-hands", "Ring", "Arms"]);
    expect(legacyLootSlots([holding(razor, 2)], plain)).toEqual([
      "Main hand, off hand",
    ]);
    expect(
      legacyLootSlots([holding(sword)], {
        ...plain,
        versatileUsedTwoHanded: true,
      }),
    ).toEqual(["Two-hands"]);
    // With no one-handed item, the named main-hand weapon is the main hand.
    expect(
      legacyLootSlots([holding(razor)], { ...plain, mainHandWeapon: "Razor" }),
    ).toEqual(["Main hand"]);
  });

  it("adjusts the Item Slot for size and Ambidextrous", () => {
    const great = entity("GREAT", "Great", "Weapon", {
      "Item Slot": "Two-Hands",
    });
    expect(legacyItemSlot(great, { ...plain, small: true })).toBe("");
    expect(legacyItemSlot(sword, { ...plain, small: true })).toBe("two-hands");
    expect(legacyItemSlot(great, { ...plain, oneSizeLarger: true })).toBe(
      "one-hand",
    );
    expect(legacyItemSlot(sword, { ...plain, ambidextrous: true })).toBe(
      "off-hand",
    );
  });

  it("matches SLOT:off hand for off-hand, both-hands and two-handed slots", () => {
    for (const slot of ["Off hand", "Main hand, off hand", "Two-hands"])
      expect(legacySlotMatches(slot, "off hand")).toBe(true);
    for (const slot of ["Main hand", "Arms", "Ring"])
      expect(legacySlotMatches(slot, "off hand")).toBe(false);
    expect(legacySlotMatches("Body", "body")).toBe(true);
  });
});
