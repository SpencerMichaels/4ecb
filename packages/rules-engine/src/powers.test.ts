import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { evaluatePowers } from "./powers";
import type { EvaluatedStat } from "./stats";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string>,
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

function stat(name: string, value: number): EvaluatedStat {
  return { name, value, contributions: [] };
}

describe("power evaluation", () => {
  it("produces explainable weapon and unarmed variants", () => {
    const entities = [
      entity("POWER", "Overwhelming Strike", "Power", {
        Keywords: "Divine, Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Wisdom vs. AC",
        Hit: "1[W] + Wisdom modifier damage.",
      }),
      entity("GOUGE", "Gouge", "Weapon", {
        Damage: "2d6",
        "Proficiency Bonus": "2",
      }),
      entity("MAGIC", "Way-Leader Weapon +1", "Magic Item", {
        "Magic Item Type": "Weapon",
        Enhancement: "+1 attack rolls and damage rolls",
        Critical: "+1d6 damage",
      }),
    ];
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "gouge",
          definitionIds: ["GOUGE", "MAGIC"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Wisdom modifier": stat("Wisdom modifier", 5),
        "melee:damage": stat("melee:damage", 2),
      },
      overlays: [],
      entities,
    });

    expect(power?.variants).toMatchObject([
      {
        equipmentName: "Way-Leader Gouge +1",
        attackStat: "Wisdom",
        defense: "AC",
        attackBonus: 12,
        damage: "2d6+8",
        critical: "+1d6 damage",
      },
      {
        equipmentName: "Unarmed",
        attackBonus: 9,
        damage: "1d4+7",
      },
    ]);
    expect(
      power?.variants[0]?.attackComponents.map((part) => part.value),
    ).toEqual([5, 4, 2, 1]);
  });

  it("applies an implement enhancement to fixed power dice", () => {
    const entities = [
      entity("POWER", "Shining Symbol", "Power", {
        Keywords: "Divine, Implement, Radiant",
        "Attack Type": "Close burst 3",
        Attack: "Wisdom vs. Will",
        Hit: "1d8 + Wisdom modifier radiant damage.",
      }),
      entity("SYMBOL", "Symbol of Hope +1", "Magic Item", {
        "Magic Item Type": "Holy Symbol",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "symbol",
          definitionIds: ["SYMBOL"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: { "Wisdom modifier": stat("Wisdom modifier", 5) },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      equipmentName: "Symbol of Hope +1",
      attackBonus: 10,
      damage: "1d8+6",
    });
  });

  it("selects the current level line and highest listed ability", () => {
    const entities = [
      entity("POWER", "Theme blast", "Power", {
        Keywords: "Implement, Radiant",
        "Attack Type": "Close blast 3",
        Attack: "Primary ability vs. Will",
        Hit: "1d8 + Strength, Constitution, Dexterity, Intelligence, Wisdom, or Charisma radiant damage.\nLevel 5: 2d8 + Strength, Constitution, Dexterity, Intelligence, Wisdom, or Charisma radiant damage.",
      }),
      entity("SYMBOL", "Symbol +1", "Magic Item", {
        "Magic Item Type": "Holy Symbol",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "symbol",
          definitionIds: ["SYMBOL"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 1),
        "Wisdom modifier": stat("Wisdom modifier", 5),
      },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      attackStat: "Wisdom",
      attackBonus: 10,
      damage: "2d8+6",
    });
  });

  it("retains the legacy half-level calculation for close effect powers", () => {
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {},
      overlays: [],
      entities: [
        entity("POWER", "Healing burst", "Power", {
          "Attack Type": "Close burst 2",
          Effect: "Each ally can spend a healing surge.",
        }),
      ],
    });

    expect(power?.variants).toMatchObject([
      {
        equipmentName: "Unarmed",
        attackStat: "Unknown",
        defense: "Unknown",
        attackBonus: 4,
      },
    ]);
  });
});
