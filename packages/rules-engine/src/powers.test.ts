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

function combatStat(name: string, value: number): EvaluatedStat {
  return {
    name,
    value,
    contributions: [
      {
        id: `bonus:${name}`,
        stat: name,
        value: String(value),
        providerId: "feat",
        providerName: "Combat feat",
        numericValue: value,
        applied: true,
      },
    ],
  };
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
          name: "Custom gouge",
          definitionIds: ["GOUGE", "MAGIC"],
          quantity: 1,
          equippedQuantity: 0,
          acquiredLevel: 1,
          overrides: { Damage: "2d8" },
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
        equipmentName: "Custom gouge",
        attackStat: "Wisdom",
        defense: "AC",
        attackBonus: 12,
        damage: "2d8+8",
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

  it("chooses the best attack ability and retains explicit power bonuses", () => {
    const [power] = evaluatePowers({
      level: 4,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {
        "Strength modifier": stat("Strength modifier", 2),
        "Charisma modifier": stat("Charisma modifier", 5),
      },
      overlays: [],
      entities: [
        entity("POWER", "Flexible strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength or Charisma + 2 vs. AC",
          Hit: "1[W] + Charisma modifier + 3 bonus damage.",
        }),
      ],
    });

    expect(power?.variants[0]).toMatchObject({
      attackStat: "Charisma",
      attackBonus: 9,
      damage: "1d4+8",
    });
  });

  it("applies evaluated weapon-group and power-specific combat stats once", () => {
    const entities = [
      entity("POWER", "Melee Basic Attack", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.",
      }),
      entity("BLADE", "Longsword", "Weapon", {
        Damage: "1d8",
        "Proficiency Bonus": "3",
        Group: "Heavy Blade",
      }),
    ];
    const [power] = evaluatePowers({
      level: 10,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "blade",
          definitionIds: ["BLADE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "heavy blade group,weapon:attack": combatStat(
          "heavy blade group,weapon:attack",
          2,
        ),
        "Heavy Blade group,weapon:damage": combatStat(
          "Heavy Blade group,weapon:damage",
          2,
        ),
        "melee basic:damage": combatStat("melee basic:damage", 2),
      },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      attackBonus: 14,
      damage: "1d8+8",
    });
  });

  it("handles primary attacks and prose level scaling", () => {
    const entities = [
      entity("POWER", "Primary strike", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        "Primary Attack": "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.\nIncrease damage to 2[W] + Strength modifier damage at 21st level.",
      }),
    ];
    const [power] = evaluatePowers({
      level: 21,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: { "Strength modifier": stat("Strength modifier", 6) },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      attackStat: "Strength",
      attackBonus: 16,
      damage: "2d4+6",
    });
  });

  it("retains a legacy calculation variant for effect-only utilities", () => {
    const [power] = evaluatePowers({
      level: 3,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {},
      overlays: [],
      entities: [
        entity("POWER", "Regeneration", "Power", {
          "Attack Type": "Personal",
          Effect: "You gain regeneration 5.",
        }),
      ],
    });

    expect(power?.variants[0]).toMatchObject({
      equipmentName: "Unarmed",
      attackBonus: 1,
    });
  });

  it("treats magic staves as both implements and quarterstaff weapons", () => {
    const entities = [
      entity("BASIC", "Melee Basic Attack", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.",
      }),
      entity("STAFF", "Staff of Light +1", "Magic Item", {
        "Magic Item Type": "Staff",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const [power] = evaluatePowers({
      level: 3,
      activeDefinitionIds: ["BASIC"],
      inventory: [
        {
          id: "staff",
          definitionIds: ["STAFF"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: { "Strength modifier": stat("Strength modifier", 0) },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      equipmentName: "Staff of Light +1",
      attackBonus: 4,
      damage: "1d8+1",
    });
  });

  it("treats mundane holy symbols as implement choices", () => {
    const entities = [
      entity("POWER", "Sacred Flame", "Power", {
        Keywords: "Divine, Implement",
        "Attack Type": "Ranged 5",
        Attack: "Wisdom vs. Reflex",
        Hit: "1d6 + Wisdom modifier radiant damage.",
      }),
      entity("SYMBOL", "Holy Symbol", "Gear", {}),
    ];
    const [power] = evaluatePowers({
      level: 2,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "symbol",
          definitionIds: ["SYMBOL"],
          quantity: 1,
          equippedQuantity: 0,
          acquiredLevel: 1,
        },
      ],
      stats: { "Wisdom modifier": stat("Wisdom modifier", 2) },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      equipmentName: "Holy Symbol",
      attackBonus: 3,
      damage: "1d6+2",
    });
  });
});
