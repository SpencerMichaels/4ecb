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
  it("adds versatile damage only when no second weapon is equipped", () => {
    const entities = [
      entity("POWER", "Synthetic Strike", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.",
      }),
      entity("SWORD", "Synthetic Sword", "Weapon", {
        Damage: "1d8",
        Properties: "Versatile",
      }),
      entity("DAGGER", "Synthetic Dagger", "Weapon", { Damage: "1d4" }),
      entity("SHIELD", "Synthetic Shield", "Armor", {
        "Armor Type": "Shield",
      }),
      entity("TOTEM", "Synthetic Totem", "Magic Item", {
        "Magic Item Type": "Totem",
      }),
    ];
    const evaluate = (secondDefinitionId: string) =>
      evaluatePowers({
        level: 1,
        activeDefinitionIds: ["POWER"],
        inventory: [
          {
            id: "sword",
            definitionIds: ["SWORD"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "second",
            definitionIds: [secondDefinitionId],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        stats: { "Strength modifier": stat("Strength modifier", 4) },
        overlays: [],
        entities,
      })[0]?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Sword",
      );

    expect(evaluate("TOTEM")?.damage).toBe("1d8+5");
    expect(evaluate("DAGGER")?.damage).toBe("1d8+4");
    expect(evaluate("SHIELD")?.damage).toBe("1d8+4");
  });

  it("applies recovered weapon-field ability bonuses only to eligible families", () => {
    const powers = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["SWEEP", "BRASH"],
      inventory: [
        {
          id: "axe",
          definitionIds: ["AXE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "bow",
          definitionIds: ["BOW"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 5),
        "Constitution modifier": stat("Constitution modifier", 2),
      },
      overlays: [],
      entities: [
        entity("SWEEP", "Sweeping Blow", "Power", {
          Keywords: "Martial, Weapon",
          "Attack Type": "Close burst 1",
          Attack: "Strength vs. AC",
          " Weapon":
            "If you're wielding an axe, a flail, a heavy blade, or a pick, you gain a bonus to the attack roll equal to one-half your Strength modifier.",
          Hit: "1[W] + Strength modifier damage.",
        }),
        entity("BRASH", "Brash Strike", "Power", {
          Keywords: "Martial, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength +2 vs. AC",
          Hit: "1[W] + Strength modifier damage.",
          " Weapon":
            "If you're wielding an axe, a hammer, or a mace, the attack deals extra damage equal to your Constitution modifier.",
        }),
        entity("AXE", "Synthetic Axe", "Weapon", {
          Damage: "1d12",
          "Proficiency Bonus": "2",
          Group: "Axe",
          "Weapon Category": "Military Melee",
        }),
        entity("BOW", "Synthetic Bow", "Weapon", {
          Damage: "1d10",
          "Proficiency Bonus": "2",
          Group: "Bow",
          "Weapon Category": "Military Ranged",
        }),
      ],
    });
    const variant = (powerId: string, equipmentName: string) =>
      powers
        .find(({ definitionId }) => definitionId === powerId)
        ?.variants.find(
          (candidate) => candidate.equipmentName === equipmentName,
        );

    expect(variant("SWEEP", "Synthetic Axe")?.attackBonus).toBe(13);
    expect(variant("SWEEP", "Synthetic Bow")?.attackBonus).toBe(11);
    expect(variant("BRASH", "Synthetic Axe")?.damage).toBe("1d12+7");
    expect(variant("BRASH", "Synthetic Bow")?.damage).toBe("1d10+5");
  });

  it("uses recovered implement aliases and variant-specific range channels", () => {
    const powers = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["FLEX", "PRIMAL"],
      inventory: [
        {
          id: "blade",
          definitionIds: ["BLADE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "bow",
          definitionIds: ["BOW"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "totem",
          definitionIds: ["TOTEM"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "Dexterity modifier": stat("Dexterity modifier", 3),
        "Wisdom modifier": stat("Wisdom modifier", 4),
        "melee:damage": combatStat("melee:damage", 2),
        "ranged:damage": combatStat("ranged:damage", 3),
        "two-hands,weapon:attack": combatStat("two-hands,weapon:attack", 1),
        "two-hands:damage": combatStat("two-hands:damage", 1),
        "totem implement,implement:attack": combatStat(
          "totem implement,implement:attack",
          1,
        ),
      },
      overlays: [],
      entities: [
        entity("FLEX", "Flexible Strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee or Ranged weapon",
          Attack: "Strength vs. AC (melee) or Dexterity vs. AC (ranged)",
          Hit: "1[W] + Strength modifier damage (melee) or 1[W] + Dexterity modifier damage (ranged).",
        }),
        entity("PRIMAL", "Primal Burst", "Power", {
          Keywords: "Implement, Primal",
          "Attack Type": "Area burst 1 within 10 squares",
          Attack: "Wisdom vs. Will",
          Hit: "1d6 + Wisdom modifier damage.",
        }),
        entity("BLADE", "Synthetic Blade", "Weapon", {
          Damage: "1d8",
          "Proficiency Bonus": "2",
          "Weapon Category": "Military Melee",
        }),
        entity("BOW", "Synthetic Bow", "Weapon", {
          Damage: "1d10",
          "Proficiency Bonus": "2",
          "Weapon Category": "Military Ranged",
          Range: "20/40",
          "Item Slot": "Two-Hands",
        }),
        entity("TOTEM", "Synthetic Totem +1", "Magic Item", {
          "Magic Item Type": "Totem",
          Enhancement: "+1 attack rolls and damage rolls",
        }),
      ],
    });

    const flexible = powers.find(({ definitionId }) => definitionId === "FLEX");
    expect(
      flexible?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Blade",
      )?.damage,
    ).toBe("1d8+6");
    expect(
      flexible?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Bow",
      )?.damage,
    ).toBe("1d10+7");
    expect(
      flexible?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Blade",
      )?.attackStat,
    ).toBe("Strength");
    expect(
      flexible?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Bow",
      )?.attackStat,
    ).toBe("Dexterity");
    expect(
      flexible?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Bow",
      )?.attackBonus,
    ).toBe(6);
    expect(
      powers
        .find(({ definitionId }) => definitionId === "PRIMAL")
        ?.variants.find(
          ({ equipmentName }) => equipmentName === "Synthetic Totem +1",
        )?.attackBonus,
    ).toBe(6);
  });

  it("evaluates exact synthetic forms of three recovered level-one powers", () => {
    const powers = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["HOWL", "KNOCKDOWN", "CALL", "RAGE"],
      inventory: [
        {
          id: "axe",
          definitionIds: ["AXE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "Wisdom modifier": stat("Wisdom modifier", 4),
      },
      overlays: [],
      entities: [
        entity("HOWL", "Howling Strike", "Power", {
          Keywords: "Primal, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + 1d6 + Strength modifier damage.",
        }),
        entity("KNOCKDOWN", "Knockdown Assault", "Power", {
          Keywords: "Martial, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. Fortitude",
          Hit: "Strength modifier damage, and you knock the target prone.",
        }),
        entity("CALL", "Call of the Beast", "Power", {
          Keywords: "Charm, Implement, Primal, Psychic",
          "Attack Type": "Area burst 1 within 10 squares",
          Attack: "Wisdom vs. Will",
          Hit: "The target can't gain combat advantage until the end of your next turn. In addition, on its next turn the target takes psychic damage equal to 5 + your Wisdom modifier when it makes any attack that doesn't include your ally nearest to it as a target.",
        }),
        entity("RAGE", "Rage Strike", "Power", {
          Keywords: "Primal, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "You deal damage based on the level of the rage power you expend:\n1st level 3[W] + Strength modifier",
        }),
        entity("AXE", "Synthetic Greataxe", "Weapon", {
          Damage: "1d12",
          "Proficiency Bonus": "2",
        }),
      ],
    });

    expect(
      powers.find(({ definitionId }) => definitionId === "HOWL")?.variants[0]
        ?.damage,
    ).toBe("1d12+1d6+4");
    expect(
      powers.find(({ definitionId }) => definitionId === "KNOCKDOWN")
        ?.variants[0]?.damage,
    ).toBe("4");
    expect(
      powers.find(({ definitionId }) => definitionId === "CALL")?.variants[0]
        ?.conditionalDamage,
    ).toEqual([
      {
        source: "Call of the Beast",
        expression: "9",
        condition:
          "on its next turn when the target attacks without including your ally nearest to it",
      },
    ]);
    expect(
      powers.find(({ definitionId }) => definitionId === "RAGE")?.variants[0]
        ?.damage,
    ).toBe("As Above");
    expect(
      powers
        .filter(({ definitionId }) =>
          ["HOWL", "KNOCKDOWN", "CALL", "RAGE"].includes(definitionId),
        )
        .flatMap(({ unsupported }) => unsupported),
    ).toEqual([]);
  });

  it("applies one contribution once across overlapping implement and weapon channels", () => {
    const [power] = evaluatePowers({
      level: 7,
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
        "Wisdom modifier": stat("Wisdom modifier", 4),
        "melee:damage": combatStat("melee:damage", 2),
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic Beast Strike", "Power", {
          Keywords: "Implement, Primal",
          "Attack Type": "Melee beast 1",
          Attack: "Wisdom vs. Reflex",
          Hit: "1d8 + Wisdom modifier damage.",
        }),
        entity("BLADE", "Synthetic Blade", "Weapon", {
          Damage: "1d8",
          "Proficiency Bonus": "2",
        }),
      ],
    });

    expect(power?.variants[0]?.damage).toBe("1d8+6");
    expect(
      power?.variants[0]?.damageComponents.filter(
        ({ provenanceId }) => provenanceId === "bonus:melee:damage",
      ),
    ).toHaveLength(1);
  });

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
        Properties: "High Crit, Brutal 1",
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
        critical: "+2d8 high crit damage; +1d6 damage",
        brutal: 1,
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
          Hit: "1[W] + Strength or Charisma modifier + 3 bonus damage.",
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

  it("recognizes ongoing damage expressed through an ability modifier", () => {
    const [power] = evaluatePowers({
      level: 7,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: { "Dexterity modifier": stat("Dexterity modifier", 4) },
      overlays: [],
      entities: [
        entity("POWER", "Strength to Weakness", "Power", {
          Keywords: "Implement",
          "Attack Type": "Melee touch",
          Attack: "Dexterity vs. Fortitude",
          Hit: "Ongoing damage equal to your Dexterity modifier (save ends).",
        }),
      ],
    });

    expect(power?.variants[0]?.damage).toBe("Ongoing");
    expect(power?.unsupported).toEqual([]);
  });

  it("projects recovered fixed-output native power special cases", () => {
    const powers = evaluatePowers({
      level: 21,
      activeDefinitionIds: [
        "BOND",
        "BEACON",
        "BASILISK",
        "CONTAGION",
        "SUBTLE",
        "UNRESOLVED",
      ],
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
        "Wisdom modifier": stat("Wisdom modifier", 6),
        "Dexterity modifier": stat("Dexterity modifier", 4),
      },
      overlays: [],
      entities: [
        entity("BOND", "Bond of Censure", "Power", {
          Keywords: "Divine, Implement, Radiant",
          "Attack Type": "Ranged 5",
          Attack: "Wisdom vs. Will",
          Hit: "You pull the target a number of squares equal to your Intelligence modifier. If the target ends this movement adjacent to you, it takes 1d10 radiant damage.\nLevel 21: 2d10 radiant damage.",
        }),
        entity("BEACON", "Brilliant Beacon", "Power", {
          Keywords: "Divine, Implement, Radiant",
          "Attack Type": "Area burst 1",
          Attack: "Wisdom vs. Will",
          Hit: "The target takes ongoing 10 radiant damage (save ends).",
        }),
        entity("BASILISK", "Baleful Gaze of the Basilisk", "Power", {
          Keywords: "Arcane, Implement, Poison",
          "Attack Type": "Ranged 10",
          Attack: "Wisdom vs. Fortitude",
          Hit: "The target is stunned and takes ongoing 10 poison damage (save ends both).",
        }),
        entity("CONTAGION", "Contagion", "Power", {
          Keywords: "Arcane, Implement, Poison",
          "Attack Type": "Ranged 10",
          Attack: "Wisdom vs. Fortitude",
          Hit: "Ongoing 10 poison damage (save ends). The first time the target fails a saving throw against this ongoing damage, each enemy within 2 squares of the target takes ongoing 5 poison damage (save ends).",
        }),
        entity("SUBTLE", "Synthetic Dexterity Ongoing", "Power", {
          Keywords: "Martial, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "The target is slowed and takes ongoing damage equal to 10 + your Dexterity modifier (save ends both).",
        }),
        entity("SYMBOL", "Symbol +1", "Magic Item", {
          "Magic Item Type": "Holy Symbol",
          Enhancement: "+1",
        }),
        entity("UNRESOLVED", "Unresolved Native Exception", "Power", {
          Keywords: "Arcane, Implement, Necrotic",
          "Attack Type": "Ranged 10",
          Attack: "Wisdom vs. Fortitude",
          Hit: "The target takes necrotic damage equal to the damage you took from the attack.",
        }),
      ],
    });

    expect(
      powers
        .find(({ definitionId }) => definitionId === "BOND")
        ?.variants.find(({ equipmentName }) => equipmentName === "Symbol +1")
        ?.damage,
    ).toBe("2d10+1");
    for (const id of ["BEACON", "BASILISK", "CONTAGION"])
      expect(
        powers.find(({ definitionId }) => definitionId === id)?.variants[0]
          ?.damage,
      ).toBe("ongoing 10");
    expect(
      powers.find(({ definitionId }) => definitionId === "SUBTLE")?.variants[0]
        ?.damage,
    ).toBe("ongoing 10+4");
    expect(
      powers.find(({ definitionId }) => definitionId === "UNRESOLVED")
        ?.unsupported,
    ).toContain("native-special-case:UNRESOLVED");

    const [heroicBond] = evaluatePowers({
      level: 20,
      activeDefinitionIds: ["BOND"],
      inventory: [],
      stats: { "Wisdom modifier": stat("Wisdom modifier", 5) },
      overlays: [],
      entities: [
        entity("BOND", "Bond of Censure", "Power", {
          Keywords: "Divine, Implement, Radiant",
          "Attack Type": "Ranged 5",
          Attack: "Wisdom vs. Will",
          Hit: "Conditional movement prose with no parseable damage dice.",
        }),
      ],
    });
    expect(heroicBond?.variants[0]?.damage).toBe("1d10");
  });

  it("does not substitute character abilities for beast modifiers", () => {
    const [power] = evaluatePowers({
      level: 9,
      activeDefinitionIds: ["BEAST_POWER"],
      inventory: [],
      stats: { "Wisdom modifier": stat("Wisdom modifier", 6) },
      overlays: [],
      entities: [
        entity("BEAST_POWER", "Synthetic Beast Power", "Power", {
          Keywords: "Beast, Martial, Psychic",
          "Attack Type": "Close burst 1",
          Attack: "Beast's attack bonus vs. Will",
          Hit: "1d8 + beast's Wisdom modifier psychic damage, and the target is immobilized (save ends).",
        }),
      ],
    });

    expect(power?.variants[0]?.damage).toBe("1d8");
    expect(power?.unsupported).toContain("companion-ability:BEAST_POWER");
  });

  it("classifies healing surges and temporary hit point effects", () => {
    const [power] = evaluatePowers({
      level: 6,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {},
      overlays: [],
      entities: [
        entity("POWER", "Restoring Word", "Power", {
          "Attack Type": "Close burst 5",
          Effect:
            "The target can spend a healing surge and regain 2d6 additional hit points. Each ally gains temporary hit points equal to 5 + your Charisma modifier.",
        }),
      ],
    });

    expect(power?.recoveries).toEqual([
      {
        kind: "healing-surge",
        expression:
          "The target can spend a healing surge and regain 2d6 additional hit points.",
      },
      {
        kind: "temporary-hit-points",
        expression:
          "Each ally gains temporary hit points equal to 5 + your Charisma modifier.",
      },
    ]);
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

  it("uses Strength for ranged attacks with Heavy Thrown weapons", () => {
    const entities = [
      entity("BASIC", "Ranged Basic Attack", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Ranged weapon",
        Attack: "Dexterity vs. AC",
        Hit: "1[W] + Dexterity modifier damage.",
      }),
      entity("HANDAXE", "Handaxe", "Weapon", {
        Damage: "1d6",
        "Proficiency Bonus": "2",
        Properties: "Heavy Thrown, Off-Hand",
      }),
    ];
    const [power] = evaluatePowers({
      level: 4,
      activeDefinitionIds: ["BASIC"],
      inventory: [
        {
          id: "handaxe",
          definitionIds: ["HANDAXE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 5),
        "Dexterity modifier": stat("Dexterity modifier", 3),
      },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      attackStat: "Strength",
      attackBonus: 9,
      damage: "1d6+5",
    });
  });

  it("adds every explicitly additive ability modifier to damage", () => {
    const [power] = evaluatePowers({
      level: 4,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "Constitution modifier": stat("Constitution modifier", 3),
      },
      overlays: [],
      entities: [
        entity("POWER", "Brash Strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + Strength modifier + Constitution modifier damage.",
        }),
      ],
    });

    expect(power?.variants[0]).toMatchObject({ damage: "1d4+7" });
  });

  it("applies weapon damage bonuses when a weapon serves as an implement", () => {
    const entities = [
      entity("POWER", "Sword Burst", "Power", {
        Keywords: "Arcane, Implement",
        "Attack Type": "Close burst 1",
        Attack: "Intelligence vs. Reflex",
        Hit: "1d6 + Intelligence modifier force damage.",
      }),
      entity("BLADE", "Longsword", "Weapon", {
        Damage: "1d8",
        "Proficiency Bonus": "3",
        Group: "Heavy Blade",
      }),
      entity("IMPLEMENT", "Magic Blade +1", "Magic Item", {
        "Magic Item Type": "Implement",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const [power] = evaluatePowers({
      level: 4,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "blade",
          definitionIds: ["BLADE", "IMPLEMENT"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Intelligence modifier": stat("Intelligence modifier", 4),
        "heavy blade group,weapon:damage": combatStat(
          "heavy blade group,weapon:damage",
          2,
        ),
      },
      overlays: [],
      entities,
    });

    expect(power?.variants[0]).toMatchObject({
      attackBonus: 7,
      damage: "1d6+7",
    });
  });

  it("materializes and deduplicates psionic augment versions", () => {
    const entities = [
      entity("PARENT", "Mind Thrust", "Power", {
        Keywords: "Augmentable, Implement, Psionic",
        _AugmentVersions: "AUGMENT0,AUGMENT2",
      }),
      entity("AUGMENT0", "Mind Thrust (Augment 0)", "Power", {
        Keywords: "Augmentable, Implement, Psionic",
        "Attack Type": "Ranged 10",
        Attack: "Intelligence vs. Will",
        Hit: "1d10 + Intelligence modifier psychic damage.",
      }),
      entity("AUGMENT2", "Mind Thrust (Augment 2)", "Power", {
        Keywords: "Augmentable, Implement, Psionic",
        "Attack Type": "Ranged 10",
        Attack: "Intelligence vs. Will",
        Hit: "2d10 + Intelligence modifier psychic damage.",
      }),
    ];
    const powers = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["PARENT", "AUGMENT0"],
      inventory: [],
      stats: { "Intelligence modifier": stat("Intelligence modifier", 4) },
      overlays: [],
      entities,
    });

    expect(powers.map((power) => power.name)).toEqual([
      "Mind Thrust (Augment 0)",
      "Mind Thrust (Augment 2)",
    ]);
    expect(powers.map((power) => power.variants[0]?.damage)).toEqual([
      "1d10+4",
      "2d10+4",
    ]);
    expect(powers.flatMap((power) => power.unsupported)).toEqual([]);
  });

  it("binds main/off-hand weapon variants to the saved loadout selection", () => {
    const entities = [
      entity("POWER", "Off-Hand Diversion", "Power", {
        Keywords: "Martial, Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC (off-hand weapon)",
        Hit: "1[W] + Strength modifier damage.",
      }),
      entity("SWORD", "Longsword", "Weapon", {
        Damage: "1d8",
        "Proficiency Bonus": "3",
      }),
      entity("DAGGER", "Dagger", "Weapon", {
        Damage: "1d4",
        "Proficiency Bonus": "3",
        Properties: "Off-hand",
      }),
    ];
    const [power] = evaluatePowers({
      level: 5,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "sword",
          name: "Main blade",
          definitionIds: ["SWORD"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "dagger",
          name: "Left dagger",
          definitionIds: ["DAGGER"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      textStrings: { _INTERNAL_MainHandWeapon: "Main blade" },
      stats: { "Strength modifier": stat("Strength modifier", 4) },
      overlays: [],
      entities,
    });

    expect(power?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentName: "Left dagger",
          hand: "off",
          pairedEquipmentName: "Main blade",
          damage: "1d4+4",
        }),
      ]),
    );
    expect(power?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentName: "Main blade",
          hand: "main",
          pairedEquipmentName: "Left dagger",
        }),
      ]),
    );
  });

  it("uses only the selected off-hand implement enhancement for dual implements", () => {
    const entities = [
      entity("POWER", "Arcane Bolt", "Power", {
        Keywords: "Arcane, Implement",
        "Attack Type": "Ranged 10",
        Attack: "Intelligence vs. Reflex",
        Hit: "1d8 + Intelligence modifier force damage.",
      }),
      entity("FEAT", "Dual Implement Spellcaster", "Feat", {}),
      entity("ORB", "Accurate Orb +3", "Magic Item", {
        "Magic Item Type": "Orb",
        Enhancement: "+3 attack rolls and damage rolls",
      }),
      entity("WAND", "Defensive Wand +2", "Magic Item", {
        "Magic Item Type": "Wand",
        Enhancement: "+2 attack rolls and damage rolls",
      }),
      entity("ROD", "Uncertain Rod +1", "Magic Item", {
        "Magic Item Type": "Rod",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const powers = (mainHand: string, ambiguous = false) =>
      evaluatePowers({
        level: 10,
        activeDefinitionIds: ["POWER", "FEAT"],
        inventory: [
          {
            id: "orb",
            name: "Accurate Orb +3",
            definitionIds: ["ORB"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "wand",
            name: "Defensive Wand +2",
            definitionIds: ["WAND"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          ...(ambiguous
            ? [
                {
                  id: "rod",
                  name: "Uncertain Rod +1",
                  definitionIds: ["ROD"],
                  quantity: 1,
                  equippedQuantity: 1,
                  acquiredLevel: 1,
                },
              ]
            : []),
        ],
        textStrings: { _INTERNAL_MainHandWeapon: mainHand },
        stats: {
          "Intelligence modifier": stat("Intelligence modifier", 5),
        },
        overlays: [],
        entities,
      })[0];

    expect(powers("Accurate Orb +3")?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentName: "Accurate Orb +3",
          hand: "main",
          pairedEquipmentName: "Defensive Wand +2",
          attackBonus: 13,
          damage: "1d8+10",
          damageComponents: expect.arrayContaining([
            expect.objectContaining({
              label: "off-hand implement enhancement bonus",
              value: 2,
              source: "Dual Implement Spellcaster",
            }),
          ]),
        }),
      ]),
    );
    expect(powers("Defensive Wand +2")?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentName: "Defensive Wand +2",
          hand: "main",
          pairedEquipmentName: "Accurate Orb +3",
          attackBonus: 12,
          damage: "1d8+10",
        }),
      ]),
    );
    expect(
      powers("Accurate Orb +3", true)?.variants.find(
        (variant) => variant.hand === "main",
      ),
    ).toMatchObject({
      equipmentName: "Accurate Orb +3",
      damage: "1d8+8",
      damageComponents: expect.not.arrayContaining([
        expect.objectContaining({
          label: "off-hand implement enhancement bonus",
        }),
      ]),
    });
  });

  it("limits hybrid striker damage to its class powers", () => {
    const entities = [
      entity("RANGER_POWER", "Ranger Shot", "Power", {
        Keywords: "Martial, Weapon",
        "Attack Type": "Ranged weapon",
        Attack: "Dexterity vs. AC",
        Hit: "1[W] + Dexterity modifier damage.",
      }),
      entity("OTHER_POWER", "Borrowed Shot", "Power", {
        Keywords: "Martial, Weapon",
        "Attack Type": "Ranged weapon",
        Attack: "Dexterity vs. AC",
        Hit: "1[W] + Dexterity modifier damage.",
      }),
      entity("BOW", "Longbow", "Weapon", {
        Damage: "1d10",
        "Proficiency Bonus": "2",
        Group: "Bow",
      }),
    ].map((value) =>
      value.id === "RANGER_POWER"
        ? { ...value, categories: ["ID_FMP_CLASS_5"] }
        : value,
    );
    const powers = evaluatePowers({
      level: 11,
      activeDefinitionIds: [
        "RANGER_POWER",
        "OTHER_POWER",
        "ID_FMP_CLASS_FEATURE_1530",
      ],
      inventory: [
        {
          id: "bow",
          definitionIds: ["BOW"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Dexterity modifier": stat("Dexterity modifier", 5),
        "Hunter's Quarry Dice": stat("Hunter's Quarry Dice", 2),
      },
      overlays: [],
      entities,
    });

    expect(
      powers.find(({ definitionId }) => definitionId === "RANGER_POWER")
        ?.variants[0]?.conditionalDamage,
    ).toEqual([
      {
        source: "Hunter's Quarry",
        expression: "2d6",
        condition: "once per round against your quarry",
      },
    ]);
    expect(
      powers.find(({ definitionId }) => definitionId === "OTHER_POWER")
        ?.variants[0]?.conditionalDamage,
    ).toEqual([]);
  });

  it("projects sneak attack only for recovered eligible weapon families", () => {
    const entities = [
      entity("POWER", "Rogue Strike", "Power", {
        Keywords: "Martial, Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Dexterity vs. AC",
        Hit: "1[W] + Dexterity modifier damage.",
      }),
      entity("DAGGER", "Dagger", "Weapon", {
        Damage: "1d4",
        "Proficiency Bonus": "3",
        Group: "Light Blade",
      }),
      entity("AXE", "Battleaxe", "Weapon", {
        Damage: "1d10",
        "Proficiency Bonus": "2",
        Group: "Axe",
      }),
    ];
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER", "ID_FMP_CLASS_FEATURE_322"],
      inventory: [
        {
          id: "dagger",
          definitionIds: ["DAGGER"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "axe",
          definitionIds: ["AXE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Dexterity modifier": stat("Dexterity modifier", 4),
        "Sneak Attack Dice": stat("Sneak Attack Dice", 2),
      },
      overlays: [],
      entities,
    });

    expect(
      power?.variants.find(({ equipmentName }) => equipmentName === "Dagger")
        ?.conditionalDamage,
    ).toEqual([
      {
        source: "Sneak Attack",
        expression: "2d6",
        condition: "once per turn with combat advantage and an eligible weapon",
      },
    ]);
    expect(
      power?.variants.find(({ equipmentName }) => equipmentName === "Battleaxe")
        ?.conditionalDamage,
    ).toEqual([]);
  });

  it("retains unsupported diagnostics for unknown striker feature variants", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER", "CUSTOM_QUARRY"],
      inventory: [],
      stats: {},
      overlays: [],
      entities: [
        entity("POWER", "Strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] damage.",
        }),
        entity(
          "CUSTOM_QUARRY",
          "Hunter's Quarry (Unmapped Variant)",
          "Class Feature",
          {},
        ),
      ],
    });

    expect(power?.unsupported).toContain("striker-feature:CUSTOM_QUARRY");
  });
});
