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
  it("uses the effective BA flag for eligibility and native basic-specific combat channels", () => {
    const entities = [
      entity("POWER", "Synthetic wisdom strike", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Wisdom vs. AC",
        Hit: "1[W] + Wisdom modifier damage.",
      }),
      entity("BLADE", "Blade", "Weapon", {
        Damage: "1d8",
        "Proficiency Bonus": "3",
        "Weapon Category": "Military Melee",
        Group: "Heavy Blade",
      }),
    ];
    const input = {
      level: 2,
      activeDefinitionIds: ["POWER"],
      entities,
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
        "Wisdom modifier": stat("Wisdom modifier", 5),
        "Strength modifier": stat("Strength modifier", 1),
        "melee basic:attack": combatStat("melee basic:attack", 2),
        "melee basic:damage": combatStat("melee basic:damage", 3),
      },
    };
    const ordinary = evaluatePowers({ ...input, overlays: [] })[0]!;
    expect(ordinary.basicAttackKind).toBeUndefined();
    const flagged = evaluatePowers({
      ...input,
      overlays: [
        {
          providerOccurrenceId: "selected-feat",
          targetDefinitionIds: ["POWER"],
          field: "_BasicAttack",
          value: "Melee",
        },
      ],
    })[0]!;
    expect(flagged.basicAttackKind).toBe("melee");
    const before = ordinary.variants.find(
      (variant) => variant.equipmentId === "blade",
    )!;
    const after = flagged.variants.find(
      (variant) => variant.equipmentId === "blade",
    )!;
    expect(after.attackStat).toBe("Wisdom");
    expect(after.attackBonus).toBe(before.attackBonus! + 2);
    expect(after.damage).toBe("1d8+8");
    expect(before.damage).toBe("1d8+5");
    expect(
      evaluatePowers({
        ...input,
        overlays: [
          {
            providerOccurrenceId: "other",
            targetDefinitionIds: ["OTHER"],
            field: "_BasicAttack",
            value: "Melee",
          },
        ],
      })[0]?.basicAttackKind,
    ).toBeUndefined();
  });
  it("preserves direct ranged BA flags and honors an effective cleared flag", () => {
    const power = entity("POWER", "Synthetic bolt", "Power", {
      _BasicAttack: "Ranged",
      "Attack Type": "Ranged 10",
      Attack: "Wisdom vs. Reflex",
      Hit: "1d6 damage.",
    });
    const input = {
      level: 1,
      activeDefinitionIds: ["POWER"],
      entities: [power],
      inventory: [],
      stats: {},
    };
    expect(evaluatePowers({ ...input, overlays: [] })[0]?.basicAttackKind).toBe(
      "ranged",
    );
    expect(
      evaluatePowers({
        ...input,
        overlays: [
          {
            providerOccurrenceId: "override",
            targetDefinitionIds: ["POWER"],
            field: "_BasicAttack",
            value: "",
          },
        ],
      })[0]?.basicAttackKind,
    ).toBeUndefined();
  });
  it("shares typed bonus maxima across general and defense-specific implement channels", () => {
    const typed = (name: string, value: number) => {
      const base = combatStat(name, value);
      return {
        ...base,
        contributions: base.contributions.map((c) => ({
          ...c,
          bonusType: "Superior Implement",
        })),
      };
    };
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      overlays: [],
      entities: [
        entity("POWER", "Synthetic spell", "Power", {
          Keywords: "Implement",
          Attack: "Intelligence vs. Will",
        }),
        entity("ORB", "Synthetic orb", "Superior Implement", { Group: "Orb" }),
      ],
      inventory: [
        {
          id: "orb",
          definitionIds: ["ORB"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Intelligence modifier": stat("Intelligence modifier", 4),
        "implement:attack(Synthetic orb)": typed(
          "implement:attack(Synthetic orb)",
          1,
        ),
        "implement,will:attack(Synthetic orb)": typed(
          "implement,will:attack(Synthetic orb)",
          2,
        ),
      },
    });
    expect(
      power?.variants.find((v) => v.equipmentId === "orb")?.attackBonus,
    ).toBe(10);
  });
  it.each(["Will", "Reflex", "Fortitude"])(
    "resolves implement bonuses per attack defense (%s), keyword and selected item",
    (defense) => {
      const entities = [
        entity("POWER", "Synthetic paired spell", "Power", {
          Keywords: "Arcane, Implement, Fire",
          Attack: `Intelligence vs. ${defense}`,
          "Attack Type": "Ranged 10",
          Hit: "1d8 + Intelligence modifier fire damage.",
          "Secondary Attack": "Intelligence vs. AC",
          "Secondary Hit": "2d8 + Intelligence modifier fire damage.",
        }),
        entity("ORB", "Focused orb", "Superior Implement", { Group: "Orb" }),
        entity("OTHER", "Other orb", "Superior Implement", { Group: "Orb" }),
      ];
      const attackKey = `implement,${defense.toLowerCase()}:attack(Focused orb)`;
      const damageKey = "implement,Fire:damage(Focused orb)";
      const result = evaluatePowers({
        level: 8,
        activeDefinitionIds: ["POWER"],
        overlays: [],
        entities,
        inventory: ["ORB", "OTHER"].map((id) => ({
          id,
          definitionIds: [id],
          quantity: 1,
          equippedQuantity: id === "ORB" ? 1 : 0,
          acquiredLevel: 1,
        })),
        stats: {
          "Intelligence modifier": stat("Intelligence modifier", 4),
          [attackKey]: combatStat(attackKey, 1),
          [damageKey]: combatStat(damageKey, 3),
          "implement,Cold:damage(Focused orb)": combatStat(
            "implement,Cold:damage(Focused orb)",
            99,
          ),
          "weapon,Fire:damage(Focused orb)": combatStat(
            "weapon,Fire:damage(Focused orb)",
            99,
          ),
          "implement,will:attack(Other orb)": combatStat(
            "implement,will:attack(Other orb)",
            2,
          ),
        },
      })[0]!;
      const focused = result.variants.find(
        (v) => v.equipmentName === "Focused orb",
      )!;
      expect(focused.attackBonus).toBe(9);
      expect(focused.attacks?.map((a) => a.attackBonus)).toEqual([9, 8]);
      expect(focused.attacks?.map((a) => a.damage)).toEqual(["1d8+7", "2d8+7"]);
      expect(focused.attackComponents).toContainEqual(
        expect.objectContaining({
          label: attackKey,
          value: 1,
          source: "Combat feat",
        }),
      );
      expect(focused.additionalEffects ?? []).toEqual([]);
      const other = result.variants.find(
        (v) => v.equipmentName === "Other orb",
      )!;
      expect(other.attackBonus).toBe(defense === "Will" ? 10 : 8);
      expect(other.damage).toBe("1d8+4");
      const noFire = evaluatePowers({
        level: 8,
        activeDefinitionIds: ["POWER"],
        overlays: [],
        entities: entities.map((e) =>
          e.id === "POWER"
            ? entity("POWER", e.name, "Power", {
                Keywords: "Arcane, Implement, Cold",
                Attack: `Intelligence vs. ${defense}`,
                Hit: "1d8 + Intelligence modifier cold damage.",
              })
            : e,
        ),
        inventory: [
          {
            id: "ORB",
            definitionIds: ["ORB"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        stats: {
          "Intelligence modifier": stat("Intelligence modifier", 4),
          [damageKey]: combatStat(damageKey, 3),
        },
      })[0]!;
      expect(
        noFire.variants.find((v) => v.equipmentName === "Focused orb")?.damage,
      ).toBe("1d8+4");
    },
  );
  it("keeps conditional reminders and keyword info separate from totals and alternate equipment", () => {
    const conditional = (
      name: string,
      value: number,
      condition: string,
    ): EvaluatedStat => ({
      name,
      value: 0,
      contributions: [
        {
          id: `reminder:${name}`,
          stat: name,
          value: String(value),
          numericValue: value,
          providerId: "feature",
          providerName: "Synthetic feature",
          condition,
          applied: false,
          reason: "conditional",
        },
      ],
    });
    const info: EvaluatedStat = {
      name: "fire,weapon:info(Synthetic Sword)",
      value: "Preserve this authored reminder.",
      contributions: [
        {
          id: "info",
          stat: "fire,weapon:info(Synthetic Sword)",
          value: "Preserve this authored reminder.",
          providerId: "feature",
          providerName: "Synthetic feature",
          applied: true,
        },
      ],
    };
    const global = conditional(
      "damage rolls",
      1,
      "per ally adjacent to the marked target",
    );
    const powers = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER"],
      overlays: [],
      entities: [
        entity("POWER", "Synthetic Strike", "Power", {
          Keywords: "Weapon, Fire",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + Strength modifier fire damage.",
        }),
        entity("SWORD", "Synthetic Sword", "Weapon", { Damage: "1d8" }),
        entity("DAGGER", "Synthetic Dagger", "Weapon", { Damage: "1d4" }),
      ],
      inventory: [
        {
          id: "sword",
          definitionIds: ["SWORD"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "dagger",
          definitionIds: ["DAGGER"],
          quantity: 1,
          equippedQuantity: 0,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "damage rolls": global,
        "alias duplicate:info": { ...global },
        "weapon:damage": { ...global },
        "fire:attack": conditional(
          "fire:attack",
          2,
          "against a burning target",
        ),
        "cold:damage": conditional(
          "cold:damage",
          20,
          "against a chilled target",
        ),
        "attack rolls": conditional("attack rolls", 7, "when you charge"),
        "fire,weapon:info(Synthetic Sword)": info,
        "fire,cold:info": { ...info },
        "weapon:damage(Synthetic Dagger)": conditional(
          "weapon:damage(Synthetic Dagger)",
          3,
          "while flanking",
        ),
        "fire:damage": {
          ...conditional("fire:damage", 10, "while armored"),
          contributions: [
            {
              ...conditional("fire:damage", 10, "while armored")
                .contributions[0]!,
              reason: "equipment",
            },
          ],
        },
      },
    });
    const sword = powers[0]?.variants.find(
      (v) => v.equipmentName === "Synthetic Sword",
    );
    const dagger = powers[0]?.variants.find(
      (v) => v.equipmentName === "Synthetic Dagger",
    );
    expect(sword?.damage).toBe("1d8+4");
    expect(sword?.additionalEffects).toEqual([
      {
        text: "+1 to damage rolls per ally adjacent to the marked target - Synthetic feature.",
        source: "Synthetic feature",
        provenanceId: "reminder:damage rolls",
      },
      {
        text: "+2 to attack rolls against a burning target - Synthetic feature.",
        source: "Synthetic feature",
        provenanceId: "reminder:fire:attack",
      },
      {
        text: "Preserve this authored reminder.",
        source: "Synthetic feature",
        provenanceId: "info",
      },
    ]);
    expect(dagger?.additionalEffects?.map((v) => v.text)).toEqual([
      "+1 to damage rolls per ally adjacent to the marked target - Synthetic feature.",
      "+2 to attack rolls against a burning target - Synthetic feature.",
      "+3 to damage rolls while flanking - Synthetic feature.",
    ]);
  });
  it("adds versatile damage only when the legacy two-handed choice is set", () => {
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
    const evaluate = (secondDefinitionId: string, usedTwoHanded: string) =>
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
        textStrings: {
          _INTERNAL_VersatileUsedTwoHanded: usedTwoHanded,
        },
        entities,
      })[0]?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Sword",
      );

    expect(evaluate("TOTEM", "1")?.damage).toBe("1d8+5");
    expect(evaluate("TOTEM", "0")?.damage).toBe("1d8+4");
    expect(evaluate("DAGGER", "1")?.damage).toBe("1d8+5");
    expect(evaluate("SHIELD", "1")?.damage).toBe("1d8+5");
  });

  it("limits equipped-loadout combat predicates to equipped power variants", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "main",
          definitionIds: ["SWORD"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "alternate",
          definitionIds: ["DAGGER"],
          quantity: 1,
          equippedQuantity: 0,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "two-melee-weapon:damage": stat("two-melee-weapon:damage", 1),
        "two-weapon,weapon:damage": stat("two-weapon,weapon:damage", 1),
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic Strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + Strength modifier damage.",
        }),
        entity("SWORD", "Equipped Sword", "Weapon", { Damage: "1d8" }),
        entity("DAGGER", "Carried Dagger", "Weapon", { Damage: "1d4" }),
      ],
    });
    const damage = (equipmentName: string) =>
      power?.variants.find((variant) => variant.equipmentName === equipmentName)
        ?.damage;

    expect(damage("Equipped Sword")).toBe("1d8+6");
    expect(damage("Carried Dagger")).toBe("1d4+4");
  });

  it("applies recovered weapon-field ability bonuses only to eligible families", () => {
    const powers = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["SWEEP", "BRASH", "CRUSH"],
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
        entity("CRUSH", "Crushing Blow", "Power", {
          Keywords: "Martial, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "2[W] + Strength modifier damage.",
          " Weapon":
            "If you're wielding an axe, a hammer, or a mace, you gain a bonus to the damage roll equal to your Constitution modifier.",
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
    expect(variant("CRUSH", "Synthetic Axe")?.damage).toBe("2d12+7");
    expect(variant("CRUSH", "Synthetic Bow")?.damage).toBe("2d10+5");
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

  it.each(["Brutal 1", "Brutal"])(
    "produces explainable weapon and unarmed variants with %s",
    (brutalProperty) => {
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
          Properties: `High Crit, ${brutalProperty}`,
          "Full Text":
            "Synthetic weapon\nProperties:\nHigh Crit\nBrutal 1 (Reroll low dice.)\nGroup:\nTest group",
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
    },
  );

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

  it("uses the selected primary ability for generic ability-modifier damage", () => {
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
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
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic Theme Strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Ranged weapon",
          Attack: "Primary ability vs. AC",
          Hit: "1[W] + ability modifier damage.",
        }),
        entity("BOW", "Synthetic Bow", "Weapon", {
          Damage: "1d12",
          Group: "Bow",
          "Weapon Category": "Military Ranged",
        }),
      ],
    });

    expect(power?.variants[0]?.attackStat).toBe("Dexterity");
    expect(power?.variants[0]?.damage).toBe("1d12+5");
  });

  it("honors a serialized named ability choice for a multi-ability power", () => {
    const [power] = evaluatePowers({
      level: 15,
      activeDefinitionIds: ["POWER", "WISDOM_CHOICE"],
      inventory: [],
      stats: {
        "Intelligence modifier": stat("Intelligence modifier", 5),
        "Wisdom modifier": stat("Wisdom modifier", 3),
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic Flame", "Power", {
          "Attack Type": "Ranged 10",
          Attack:
            "Intelligence +4 vs. Reflex, Wisdom +4 vs. Reflex, or Charisma +4 vs. Reflex\nIncrease to +6 bonus at 11th level and +8 bonus at 21st level.",
          Hit: "The target grants combat advantage.",
        }),
        entity("WISDOM_CHOICE", "Synthetic Flame Wisdom", "Racial Trait", {}),
      ],
    });

    expect(power?.variants[0]).toMatchObject({
      attackStat: "Wisdom",
      attackBonus: 16,
    });
  });

  it("does not bridge unrelated weapon expertise onto implement attacks", () => {
    const [power] = evaluatePowers({
      level: 15,
      activeDefinitionIds: ["POWER", "STRIKE_IMPLEMENT"],
      inventory: [
        {
          id: "strike",
          definitionIds: ["STRIKE", "MAGIC"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Dexterity modifier": stat("Dexterity modifier", 7),
        "heavy blade group,weapon:attack": stat(
          "heavy blade group,weapon:attack",
          2,
        ),
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic Discipline", "Power", {
          Keywords: "Implement",
          "Attack Type": "Melee 1",
          Attack: "Dexterity vs. Reflex",
          Hit: "1d8 + Dexterity modifier damage.",
        }),
        // Monks may use proficient weapons as implements.
        entity(
          "STRIKE_IMPLEMENT",
          "Implement Proficiency (Synthetic Unarmed Strike)",
          "Proficiency",
          {},
        ),
        entity("STRIKE", "Synthetic Unarmed Strike", "Weapon", {
          Damage: "1d8",
          Group: "Heavy Blade",
        }),
        entity("MAGIC", "Quick Strike +3", "Magic Item", {
          "Magic Item Type": "Weapon",
          Enhancement: "+3 attack rolls and damage rolls",
        }),
      ],
    });

    expect(power?.variants[0]?.attackBonus).toBe(17);
    expect(power?.variants[0]?.attackComponents).not.toContainEqual(
      expect.objectContaining({ label: "heavy blade group,weapon:attack" }),
    );
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

  it.each([false, true])(
    "does not infer a secondary target without phase metadata: %s",
    (override) => {
      const [power] = evaluatePowers({
        level: 8,
        activeDefinitionIds: ["POWER"],
        inventory: [],
        overlays: [],
        stats: {
          "Strength modifier": stat("Strength modifier", 2),
          "Dexterity modifier": stat("Dexterity modifier", 5),
        },
        entities: [
          entity("POWER", "Synthetic targeted sequence", "Power", {
            "Attack Type": "Melee 1",
            Target: "One creature",
            "Primary Attack": "Strength vs. Reflex",
            Hit: "1d6 damage.",
            " Secondary Attack": "Dexterity vs. AC",
            ...(override
              ? { "Secondary Targets": "A different creature" }
              : {}),
            " Hit": "2d6 + Dexterity modifier damage.",
          }),
        ],
      });
      expect(power?.variants[0]?.attacks).toMatchObject([
        { ordinal: 1, attackBonus: 6, target: "One creature", damage: "1d6" },
        { ordinal: 2, attackBonus: 9, damage: "2d6+5" },
      ]);
      expect(power?.variants[0]?.attacks?.[1]?.target).toBe(
        override ? "A different creature" : undefined,
      );
    },
  );

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
      attacks: [
        expect.objectContaining({
          ordinal: 1,
          attackStat: "Strength",
          attackBonus: 16,
          defense: "AC",
        }),
      ],
    });
  });

  it("calculates each authored attack independently", () => {
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER", "CLASS"],
      inventory: [],
      stats: {
        Strength: stat("Strength", 18),
        Wisdom: stat("Wisdom", 19),
        "Strength modifier": stat("Strength modifier", 4),
        "Wisdom modifier": stat("Wisdom modifier", 4),
      },
      overlays: [],
      entities: [
        entity("CLASS", "Synthetic Warden", "Class", {
          "Key Abilities": "Wisdom, Strength",
        }),
        entity("POWER", "Twofold Test", "Power", {
          "Attack Type": "Melee 1",
          "Primary Target": "One creature",
          "Primary Attack": "Primary ability vs. AC",
          "Secondary Attack": ".",
          "Secondary Target": "A second creature",
          Attack: "Strength +2 vs. Reflex",
          Hit: "The target falls prone.",
        }),
      ],
    });

    expect(power?.variants[0]?.attacks).toMatchObject([
      {
        ordinal: 1,
        attackStat: "Wisdom",
        powerBonus: 0,
        defense: "AC",
        attackBonus: 8,
        target: "One creature",
      },
      {
        ordinal: 2,
        attackStat: "Strength",
        powerBonus: 2,
        defense: "Reflex",
        attackBonus: 10,
        target: "A second creature",
      },
    ]);
  });

  it.each([8, 11])(
    "keeps each attack's ability, hit dice, damage type, and bonus independent at level %i",
    (level) => {
      const [power] = evaluatePowers({
        level,
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
          "Strength modifier": stat("Strength modifier", 5),
          "Charisma modifier": stat("Charisma modifier", 2),
        },
        overlays: [],
        entities: [
          entity("BLADE", "Test blade", "Weapon", {
            Damage: "1d8",
            "Proficiency Bonus": "3",
          }),
          entity("POWER", "Synthetic changing strike", "Power", {
            Keywords: "Weapon, Fire, Thunder",
            "Attack Type": "Melee weapon",
            "Primary Attack": "Strength vs. AC",
            Hit: "2[W] + Strength modifier fire damage, and the target is dazed.",
            "Secondary Attack": "Charisma +2 vs. Reflex",
            " Hit":
              "1[W] + Charisma modifier thunder damage.\nLevel 11: 3[W] + Charisma modifier thunder damage.",
          }),
        ],
      });
      expect(power?.variants[0]).toMatchObject({
        damage: "2d8+5",
        damageType: "fire",
      });
      expect(power?.variants[0]?.attacks).toMatchObject([
        {
          ordinal: 1,
          attackStat: "Strength",
          attackBonus: 8 + Math.floor(level / 2),
          damage: "2d8+5",
          damageType: "fire",
        },
        {
          ordinal: 2,
          attackStat: "Charisma",
          attackBonus: 7 + Math.floor(level / 2),
          damage: level < 11 ? "1d8+2" : "3d8+2",
          damageType: "thunder",
        },
      ]);
    },
  );

  it("binds distinct attack phases to the saved main/off-hand roles without dropping inventory alternatives", () => {
    const [power] = evaluatePowers({
      level: 4,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "main",
          name: "Main blade",
          definitionIds: ["SWORD"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "off",
          name: "Off dagger",
          definitionIds: ["DAGGER"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "spare",
          name: "Spare dagger",
          definitionIds: ["DAGGER"],
          quantity: 1,
          equippedQuantity: 0,
          acquiredLevel: 1,
        },
      ],
      textStrings: { _INTERNAL_MainHandWeapon: "Main blade" },
      stats: { "Strength modifier": stat("Strength modifier", 4) },
      overlays: [],
      entities: [
        entity("SWORD", "Sword", "Weapon", {
          Damage: "1d8",
          "Proficiency Bonus": "3",
        }),
        entity("DAGGER", "Dagger", "Weapon", {
          Damage: "1d4",
          "Proficiency Bonus": "3",
          Properties: "Off-hand",
        }),
        entity("POWER", "Synthetic hand sequence", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          "Primary Attack": "Strength vs. AC (off-hand weapon)",
          Hit: "1[W] damage.",
          "Secondary Attack": "Strength vs. AC (main weapon)",
          " Hit": "2[W] + Strength modifier damage.",
        }),
      ],
    });
    expect(
      power?.variants.find((variant) => variant.equipmentName === "Main blade")
        ?.attacks,
    ).toMatchObject([
      { ordinal: 1, eligible: false, weaponRole: "off", damage: "1d8" },
      { ordinal: 2, weaponRole: "main", damage: "2d8+4" },
    ]);
    expect(
      power?.variants.find((variant) => variant.equipmentName === "Off dagger")
        ?.attacks,
    ).toMatchObject([
      { ordinal: 1, weaponRole: "off", damage: "1d4" },
      { ordinal: 2, eligible: false, weaponRole: "main", damage: "2d4+4" },
    ]);
    expect(
      power?.variants
        .find((variant) => variant.equipmentName === "Spare dagger")
        ?.attacks?.every((attack) => attack.eligible !== false),
    ).toBe(true);
  });

  it("keeps compound damage types and secondary-only companion damage out of character math", () => {
    const [power] = evaluatePowers({
      level: 2,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {
        "Charisma modifier": stat("Charisma modifier", 3),
        "Strength modifier": stat("Strength modifier", 5),
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic companion sequence", "Power", {
          "Attack Type": "Ranged 10",
          "Primary Attack": "Charisma vs. Reflex",
          Hit: "2d6 + Charisma modifier cold and lightning damage, and ongoing 5 acid damage.",
          "Secondary Attack": "Beast's attack bonus vs. AC",
          " Hit": "1[B] + beast's Strength modifier damage.",
        }),
      ],
    });
    expect(power?.variants[0]?.attacks?.[0]).toMatchObject({
      damage: "2d6+3",
      damageType: "cold and lightning",
    });
    expect(power?.variants[0]?.attacks?.[1]).toMatchObject({ eligible: false });
    expect(power?.variants[0]?.attacks?.[1]?.damage).toBeUndefined();
    expect(power?.unsupported).toContain("companion-ability:POWER");
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
        "Weapon Category": "Simple Melee",
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
      basicAttackTypes: ["melee", "ranged"],
      equipmentId: "handaxe",
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
          equipped: true,
          weaponDamage: "1d4",
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
          equipped: true,
          weaponDamage: "1d8",
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

describe("power variant equipment names", () => {
  it("names a composed superior implement like the inventory, not as a part list", () => {
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      overlays: [],
      entities: [
        entity("POWER", "Synthetic spell", "Power", {
          Keywords: "Implement",
          Attack: "Wisdom vs. Will",
        }),
        entity("QUICKBEAM", "Quickbeam staff", "Superior Implement", {
          Group: "Staff",
        }),
        entity("AVERSION", "Aversion Staff +2", "Magic Item", {
          "Magic Item Type": "Staff",
          Enhancement: "+2 attack rolls and damage rolls",
        }),
      ],
      inventory: [
        {
          id: "staff",
          definitionIds: ["QUICKBEAM", "AVERSION"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: { "Wisdom modifier": stat("Wisdom modifier", 4) },
    });
    const name = power?.variants.find(
      (v) => v.equipmentId === "staff",
    )?.equipmentName;
    expect(name).not.toContain(" + ");
    expect(name).toMatch(/^Aversion Quickbeam staff \+2$/i);
  });
});

describe("implement power equipment", () => {
  const entities = [
    entity("POWER", "Synthetic Censure", "Power", {
      Keywords: "Divine, Implement",
      "Attack Type": "Ranged 5",
      Attack: "Wisdom vs. Will",
      Hit: "1d8 + Wisdom modifier damage.",
    }),
    entity(
      "SYMBOL_PROFICIENCY",
      "Implement Proficiency (Holy Symbol)",
      "Proficiency",
      {},
    ),
    entity("SYMBOL", "Symbol of Hope +1", "Magic Item", {
      "Magic Item Type": "Holy Symbol",
      Enhancement: "+1 attack rolls and damage rolls",
    }),
    entity("ORB", "Orb of Light +1", "Magic Item", {
      "Magic Item Type": "Orb",
      Enhancement: "+1 attack rolls and damage rolls",
    }),
    entity("PICK", "War Pick", "Weapon", {
      Damage: "1d8",
      Group: "Pick",
    }),
  ];
  const owned = (id: string) => ({
    id,
    definitionIds: [id],
    quantity: 1,
    equippedQuantity: 1,
    acquiredLevel: 1,
  });
  const names = (activeDefinitionIds: readonly string[]) =>
    evaluatePowers({
      level: 8,
      activeDefinitionIds,
      inventory: ["SYMBOL", "ORB", "PICK"].map(owned),
      stats: { "Wisdom modifier": stat("Wisdom modifier", 5) },
      overlays: [],
      entities,
    })[0]?.variants.map((variant) => variant.equipmentName);

  it("offers only proficient implements and Unarmed, never a plain weapon", () => {
    expect(names(["POWER", "SYMBOL_PROFICIENCY"])).toEqual([
      "Symbol of Hope +1",
      "Unarmed",
    ]);
  });

  it("keeps implements when the content records no implement proficiency", () => {
    expect(names(["POWER"])).toEqual([
      "Symbol of Hope +1",
      "Orb of Light +1",
      "Unarmed",
    ]);
  });

  it("offers a weapon its owner can use as an implement", () => {
    const proficiency = entity(
      "PICK_PROFICIENCY",
      "Implement Proficiency (War Pick)",
      "Proficiency",
      {},
    );
    entities.push(proficiency);
    expect(names(["POWER", "SYMBOL_PROFICIENCY", "PICK_PROFICIENCY"])).toEqual([
      "Symbol of Hope +1",
      "War Pick",
      "Unarmed",
    ]);
    entities.pop();
  });
});
