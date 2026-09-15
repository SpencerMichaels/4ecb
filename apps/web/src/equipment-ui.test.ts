import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  compatibleBaseItems,
  entityCurrencyCopper,
  groupMagicItemFamilies,
  inventorySlotCandidates,
  inventoryRequiresBothHands,
  practiceKind,
} from "./equipment-ui";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [],
    flavor: "",
    description: "",
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    extensions: [],
    provenance: { sourceKey: "equipment-ui", sourceOrdinal: 0 },
  };
}

describe("equipment catalog presentation", () => {
  it("groups only complete compatible terminal enhancement families", () => {
    const one = entity("ONE", "Flame Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Heavy Blade",
    });
    const two = entity("TWO", "Flame Weapon +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Heavy Blade",
    });
    const axe = entity("AXE", "Flame Weapon +3", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Axe",
    });
    expect(groupMagicItemFamilies([one, two, axe], [one, two, axe])).toEqual([
      { key: expect.any(String), label: "Flame Weapon", entities: [one, two] },
      { key: "AXE", label: "Flame Weapon +3", entities: [axe] },
    ]);
    expect(groupMagicItemFamilies([one], [one, two])).toEqual([
      { key: expect.any(String), label: "Flame Weapon", entities: [one] },
    ]);
  });

  it("reads authored prices and ritual subtypes", () => {
    expect(
      entityCurrencyCopper(entity("G", "Gear", "Gear", { Gold: "15" })),
    ).toBe(1500);
    expect(
      entityCurrencyCopper(
        entity("R", "Ritual", "Ritual", { "Market Price": "1,000 gp" }),
      ),
    ).toBe(100_000);
    expect(practiceKind(entity("S", "Scroll", "Ritual Scroll"))).toBe("scroll");
    expect(
      practiceKind(
        entity("A", "Formula", "Ritual", { type: "Alchemical Formula" }),
      ),
    ).toBe("alchemical-formula");
  });

  it("pairs armor and weapon enchantments only with compatible bases", () => {
    const enchantment = entity("MAGIC", "Black Iron Armor +2", "Magic Item", {
      "Magic Item Type": "Armor",
      Armor: "Scale, Plate",
    });
    const scale = entity("SCALE", "Scale armor", "Armor", {
      "Armor Category": "Scale",
    });
    const cloth = entity("CLOTH", "Cloth armor", "Armor", {
      "Armor Category": "Cloth",
    });
    expect(compatibleBaseItems(enchantment, [cloth, scale])).toEqual([scale]);

    const anyWeapon = entity("ANY", "Magic Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any",
    });
    const anyMelee = entity("MELEE", "Melee Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any melee",
    });
    const sword = entity("SWORD", "Longsword", "Weapon", {
      "Weapon Category": "Military Melee",
      Group: "Heavy Blade",
      "Minimum Enhancement Bonus": "2",
    });
    const bow = entity("BOW", "Longbow", "Weapon", {
      "Weapon Category": "Military Ranged",
      Group: "Bow",
      Range: "20/40",
    });
    expect(compatibleBaseItems(anyWeapon, [sword, bow])).toEqual([bow]);
    expect(compatibleBaseItems(anyMelee, [sword, bow])).toEqual([]);
    const meleeTwo = entity("MELEE2", "Melee Weapon +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any melee (melee weapon)",
    });
    expect(compatibleBaseItems(meleeTwo, [sword, bow])).toEqual([sword]);
  });

  it("limits explicit loadout choices to authored slots", () => {
    const weapon = entity("WEAPON", "Greatsword", "Weapon", {
      "Item Slot": "Two-hands",
    });
    expect(
      inventorySlotCandidates(
        {
          id: "held",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 0,
          elements: [
            { definitionId: weapon.id, name: weapon.name, type: weapon.type },
          ],
          overrides: {},
          legality: "rules-legal",
        },
        new Map([[weapon.id.toLocaleLowerCase(), weapon]]),
      ),
    ).toEqual(["main-hand", "off-hand"]);
    const entry = (item: ContentEntity) => ({
      id: item.id,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [{ definitionId: item.id, name: item.name, type: item.type }],
      overrides: {},
      legality: "rules-legal" as const,
    });
    const sword = entity("SWORD", "Longsword", "Weapon", {
      "Hands Required": "One-Handed",
    });
    const armor = entity("ARMOR", "Leather armor", "Armor");
    const shield = entity("SHIELD", "Heavy shield", "Armor");
    const headNeck = entity("HN", "Paired crown", "Magic Item", {
      "Item Slot": "Head and Neck",
    });
    const arms = entity("ARMS", "Iron armbands", "Magic Item", {
      "Magic Item Type": "Arms Slot Item",
    });
    const index = new Map(
      [weapon, sword, armor, shield, headNeck, arms].map((item) => [
        item.id.toLocaleLowerCase(),
        item,
      ]),
    );
    expect(inventorySlotCandidates(entry(sword), index)).toEqual([
      "main-hand",
      "off-hand",
    ]);
    expect(inventorySlotCandidates(entry(armor), index)).toEqual(["body"]);
    expect(inventorySlotCandidates(entry(shield), index)).toEqual(["arms"]);
    expect(inventorySlotCandidates(entry(headNeck), index)).toEqual([
      "head",
      "neck",
    ]);
    expect(inventorySlotCandidates(entry(arms), index)).toEqual(["arms"]);
    expect(inventoryRequiresBothHands(entry(weapon), index)).toBe(true);
    expect(inventoryRequiresBothHands(entry(sword), index)).toBe(false);
  });
});
