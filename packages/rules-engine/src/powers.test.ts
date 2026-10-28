import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import type { CharacterInventoryEntry } from "./evaluator";
import { evaluatePowers, powerAttackProfile } from "./powers";
import { EXCEPTION_IDS } from "./exceptions";
import { StatAccumulator, type EvaluatedStat } from "./stats";

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
  it("tags a military weapon for military-qualified channels (AddWeaponKeywords)", () => {
    const weapon = (id: string, category: string) =>
      entity(id, id, "Weapon", {
        Damage: "1d8",
        "Weapon Category": category,
        Group: "Heavy Blade",
      });
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER"],
      entities: [
        entity("POWER", "Synthetic strike", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] damage.",
        }),
        weapon("Military blade", "Military Melee"),
        weapon("Superior blade", "Superior Melee"),
      ],
      inventory: ["Military blade", "Superior blade"].map((id) => ({
        id,
        definitionIds: [id],
        quantity: 1,
        equippedQuantity: 1,
        acquiredLevel: 1,
      })),
      stats: {
        "military,heavy blade group:damage": combatStat(
          "military,heavy blade group:damage",
          2,
        ),
      },
      overlays: [],
    });
    const damage = (name: string) =>
      power?.variants.find((variant) => variant.equipmentName === name)?.damage;
    expect(damage("Military blade")).toBe("1d8+2");
    expect(damage("Superior blade")).toBe("1d8");
  });

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
  it("adds a weapon's proficiency bonus only with its weapon proficiency", () => {
    // Legacy GetProficiencyBonus/IsProficient: "Weapon Proficiency (<base>)",
    // or the magic item's "Proficient As".
    const attackWith = (activeDefinitionIds: readonly string[]) =>
      evaluatePowers({
        level: 2,
        activeDefinitionIds: ["POWER", ...activeDefinitionIds],
        overlays: [],
        entities: [
          entity("POWER", "Synthetic strike", "Power", {
            Keywords: "Weapon",
            "Attack Type": "Melee weapon",
            Attack: "Strength vs. AC",
            Hit: "1[W] + Strength modifier damage.",
          }),
          entity("SWORD", "Longsword", "Weapon", {
            Damage: "1d8",
            "Proficiency Bonus": "3",
            "Weapon Category": "Military Melee",
          }),
          entity("BLADE", "Synthetic Blade +1", "Magic Item", {
            "Magic Item Type": "Weapon",
            "Proficient As": "Dagger",
            Enhancement: "+1 attack rolls and damage rolls",
          }),
          entity(
            "LONG_PROF",
            "Weapon Proficiency (Longsword)",
            "Proficiency",
            {},
          ),
          entity(
            "DAGGER_PROF",
            "Weapon Proficiency (Dagger)",
            "Proficiency",
            {},
          ),
          entity("CLUB_PROF", "Weapon Proficiency (Club)", "Proficiency", {}),
        ],
        inventory: [
          {
            id: "sword",
            definitionIds: ["SWORD", "BLADE"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        stats: { "Strength modifier": stat("Strength modifier", 4) },
      })[0]?.variants.find((variant) => variant.equipmentId === "sword")
        ?.attackBonus;
    expect(attackWith(["LONG_PROF"])).toBe(9);
    expect(attackWith(["DAGGER_PROF"])).toBe(9);
    expect(attackWith(["CLUB_PROF"])).toBe(6);
  });

  it("gives a Large weapon its proficiency only with Oversized or One Size Larger", () => {
    // Native IsProficient: a Large weapon needs CanUseLargeWeapons, then
    // matches its NormalizedName (no " (large)"); without it even Proficient
    // As does not count.
    const attackWith = (
      activeDefinitionIds: readonly string[],
      parts: readonly string[] = ["LARGE_SWORD"],
    ) =>
      evaluatePowers({
        level: 2,
        activeDefinitionIds: ["POWER", "LONG_PROF", ...activeDefinitionIds],
        overlays: [],
        entities: [
          entity("POWER", "Synthetic strike", "Power", {
            Keywords: "Weapon",
            "Attack Type": "Melee weapon",
            Attack: "Strength vs. AC",
            Hit: "1[W] + Strength modifier damage.",
          }),
          entity("LARGE_SWORD", "Longsword (Large)", "Weapon", {
            Damage: "1d12",
            Size: "Large",
            "Proficiency Bonus": "3",
            "Weapon Category": "Military Melee",
          }),
          entity("BLADE", "Synthetic Blade +1", "Magic Item", {
            "Magic Item Type": "Weapon",
            "Proficient As": "Longsword",
            Enhancement: "+1 attack rolls and damage rolls",
          }),
          entity(
            "LONG_PROF",
            "Weapon Proficiency (Longsword)",
            "Proficiency",
            {},
          ),
          entity("OVERSIZED", "Oversized", "Internal", {}),
          entity("ONE_SIZE_LARGER", "One Size Larger", "Internal", {}),
          entity("SMALL", "Small", "Size", {}),
        ],
        inventory: [
          {
            id: "sword",
            definitionIds: parts,
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        stats: { "Strength modifier": stat("Strength modifier", 4) },
      })[0]?.variants.find((variant) => variant.equipmentId === "sword")
        ?.attackBonus;
    const enchanted = ["LARGE_SWORD", "BLADE"];
    expect(attackWith([])).toBe(5);
    expect(attackWith([], enchanted)).toBe(6);
    expect(attackWith(["OVERSIZED"])).toBe(8);
    expect(attackWith(["ONE_SIZE_LARGER"])).toBe(8);
    expect(attackWith(["ONE_SIZE_LARGER"], enchanted)).toBe(9);
    expect(attackWith(["ONE_SIZE_LARGER", "SMALL"], enchanted)).toBe(6);
  });

  it("matches bonuses keyed by the power's class ID and the weapon's ID", () => {
    // Hexblade content keys Pact Reward as `<class ID>:damage` and its
    // pact-blade bonuses as `<weapon ID>,<class ID>:attack` (CalcKeywords).
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER", "CLASS_ID"],
      overlays: [],
      entities: [
        entity("CLASS_ID", "Synthetic Hexblade", "Class", {}),
        entity("POWER", "Synthetic bolt", "Power", {
          Keywords: "Arcane, Implement",
          Class: "CLASS_ID",
          "Attack Type": "Ranged 10",
          Attack: "Charisma vs. Reflex",
          Hit: "1d10 + Charisma modifier damage.",
        }),
        entity("PACT", "Pact Sword", "Weapon", {
          Damage: "1d8",
          "Weapon Category": "Military Melee",
          _ImplementForClass: "CLASS_ID",
        }),
      ],
      inventory: [
        {
          id: "pact",
          definitionIds: ["PACT"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Charisma modifier": stat("Charisma modifier", 5),
        "CLASS_ID:damage": combatStat("CLASS_ID:damage", 7),
        "PACT,CLASS_ID:attack": combatStat("PACT,CLASS_ID:attack", 1),
      },
    });
    const pact = power?.variants.find(
      (variant) => variant.equipmentId === "pact",
    );
    expect(pact?.attackBonus).toBe(10);
    expect(pact?.damage).toBe("1d10+12");
    const unarmed = power?.variants.find(
      (variant) => variant.equipmentId === "unarmed",
    );
    expect(unarmed?.attackBonus).toBe(9);
    expect(unarmed?.damage).toBe("1d10+12");
  });

  it("takes the implement path for a power that is both Weapon and Implement", () => {
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      overlays: [],
      entities: [
        entity("POWER", "Synthetic blade spell", "Power", {
          Keywords: "Arcane, Implement, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Charisma vs. AC",
          Hit: "1[W] + Charisma modifier damage.",
        }),
        entity("ROD", "Synthetic Rod +2", "Magic Item", {
          "Magic Item Type": "Rod",
          Enhancement: "+2 attack rolls and damage rolls",
        }),
        entity("SWORD", "Synthetic Sword", "Weapon", {
          Damage: "1d8",
          "Weapon Category": "Military Melee",
        }),
      ],
      inventory: ["ROD", "SWORD"].map((id) => ({
        id,
        definitionIds: [id],
        quantity: 1,
        equippedQuantity: 1,
        acquiredLevel: 1,
      })),
      stats: { "Charisma modifier": stat("Charisma modifier", 5) },
    });
    // Legacy lists the rod, and with no weapon die it deals only the ability.
    expect(
      power?.variants.find((variant) => variant.equipmentId === "ROD")?.damage,
    ).toBe("5");
    expect(
      power?.variants.find((variant) => variant.equipmentId === "SWORD")
        ?.damage,
    ).toBe("1d8+5");
  });

  it("applies defense-keyed damage bonuses to powers that target that defense", () => {
    // Legacy Resplendent Gloves: `will:damage +2` adds to Hold Foe's damage.
    const powers = evaluatePowers({
      level: 9,
      activeDefinitionIds: ["WILL", "REFLEX"],
      overlays: [],
      entities: [
        entity("WILL", "Synthetic will spell", "Power", {
          Keywords: "Implement",
          Attack: "Wisdom vs. Will",
          Hit: "2d6 + Wisdom modifier damage.",
        }),
        entity("REFLEX", "Synthetic reflex spell", "Power", {
          Keywords: "Implement",
          Attack: "Wisdom vs. Reflex",
          Hit: "1d6 + Wisdom modifier damage.",
        }),
      ],
      inventory: [],
      stats: {
        "Wisdom modifier": stat("Wisdom modifier", 5),
        "will:damage": combatStat("will:damage", 2),
      },
    });
    const damage = (name: string) =>
      powers.find((power) => power.name === name)?.variants[0]?.damage;
    expect(damage("Synthetic will spell")).toBe("2d6+7");
    expect(damage("Synthetic reflex spell")).toBe("1d6+5");
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
  it("adds a flat hit bonus only from the damage expression (native CalcDamage)", () => {
    const damageFor = (hit: string) =>
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
        ],
        stats: { "Strength modifier": stat("Strength modifier", 4) },
        overlays: [],
        entities: [
          entity("POWER", "Synthetic Strike", "Power", {
            Keywords: "Weapon",
            "Attack Type": "Melee weapon",
            Attack: "Strength vs. AC",
            Hit: hit,
          }),
          entity("SWORD", "Synthetic Sword", "Weapon", { Damage: "1d8" }),
        ],
      })[0]?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Sword",
      )?.damage;

    expect(damageFor("1[W] + Strength modifier + 2 damage.")).toBe("1d8+6");
    expect(
      damageFor(
        "1[W] + Strength modifier damage, and you gain a +4 power bonus to damage rolls against the target until the end of the encounter.",
      ),
    ).toBe("1d8+4");
  });

  it("deals flat damage from a dice-less expression, without roll-only bonuses (native CalcDamage)", () => {
    const damageFor = (hit: string) =>
      evaluatePowers({
        level: 1,
        activeDefinitionIds: ["POWER"],
        inventory: [
          {
            id: "rod",
            definitionIds: ["ROD"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        stats: {
          "Charisma modifier": stat("Charisma modifier", 6),
          damage: combatStat("damage", 1),
          "damage rolls": combatStat("damage rolls", 2),
          "implement:damage": combatStat("implement:damage", 4),
          "implement:nonroll-damage": combatStat("implement:nonroll-damage", 8),
        },
        overlays: [],
        entities: [
          entity("POWER", "Synthetic Note", "Power", {
            Keywords: "Arcane, Implement",
            "Attack Type": "Ranged 10",
            Attack: "Charisma vs. Will",
            Hit: hit,
          }),
          entity("ROD", "Synthetic Rod +3", "Magic Item", {
            "Magic Item Type": "Rod",
            Enhancement: "+3 attack rolls and damage rolls",
          }),
        ],
      })[0]?.variants.find(({ equipmentId }) => equipmentId === "rod")?.damage;

    // Flat: Charisma, `damage` and `:nonroll-damage` only (IsDamageRoll is
    // false, so no enhancement, `damage rolls` or `:damage`).
    expect(
      damageFor(
        "Charisma modifier thunder damage, and you push the target 2 squares.",
      ),
    ).toBe("15");
    // A roll reads every channel and the enhancement.
    expect(damageFor("1d6 + Charisma modifier thunder damage.")).toBe("1d6+24");
    // A sentence ending before " damage" is not a damage expression.
    expect(
      damageFor("Charisma modifier. The target takes damage."),
    ).toBeUndefined();
    // A leading number is the expression's constant (ParseDamage), and an
    // "ongoing" rider after the damage does not replace it.
    expect(
      damageFor(
        "5 + Charisma modifier necrotic damage, and the target takes ongoing 10 necrotic damage (save ends).",
      ),
    ).toBe("20");
    expect(damageFor("3 damage.")).toBe("12");
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

  it("adds versatile damage for the holding the loadout wields two-handed (D101)", () => {
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
    ];
    const evaluate = (
      sword: Partial<CharacterInventoryEntry>,
      textStrings: Record<string, string> = {},
    ) =>
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
            ...sword,
          },
        ],
        stats: { "Strength modifier": stat("Strength modifier", 4) },
        overlays: [],
        textStrings,
        entities,
      })[0]?.variants.find(
        ({ equipmentName }) => equipmentName === "Synthetic Sword",
      );
    const bothHands = [
      { slot: "main-hand", quantityIndex: 0 },
      { slot: "off-hand", quantityIndex: 0 },
    ] as const;
    expect(
      evaluate({ wieldedTwoHanded: true, equippedSlots: bothHands })?.damage,
    ).toBe("1d8+5");
    // Wielded two-handed but unplaced: the projection holds it in both hands.
    expect(evaluate({ wieldedTwoHanded: true })?.damage).toBe("1d8+5");
    // Placed in one hand, a stale legacy text string no longer applies.
    expect(
      evaluate(
        { equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }] },
        { _INTERNAL_VersatileUsedTwoHanded: "1" },
      )?.damage,
    ).toBe("1d8+4");
    expect(
      evaluate(
        { wieldedTwoHanded: false },
        {
          _INTERNAL_VersatileUsedTwoHanded: "1",
        },
      )?.damage,
    ).toBe("1d8+4");
  });

  it("applies two-weapon channels only with a weapon in the off hand (native DetermineOffhand)", () => {
    const evaluate = (daggerEquipped: number) =>
      evaluatePowers({
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
            equippedQuantity: daggerEquipped,
            acquiredLevel: 1,
          },
        ],
        stats: {
          "Strength modifier": stat("Strength modifier", 4),
          "two-melee-weapon:damage": stat("two-melee-weapon:damage", 1),
          "two-weapon,weapon:damage": stat("two-weapon,weapon:damage", 1),
          "two-blade:damage": stat("two-blade:damage", 1),
          "two-melee-offhand,weapon:attack": stat(
            "two-melee-offhand,weapon:attack",
            1,
          ),
        },
        overlays: [],
        entities: [
          entity("POWER", "Synthetic Strike", "Power", {
            Keywords: "Weapon",
            "Attack Type": "Melee weapon",
            Attack: "Strength vs. AC",
            Hit: "1[W] + Strength modifier damage.",
          }),
          entity("SWORD", "Equipped Sword", "Weapon", {
            Damage: "1d8",
            Group: "Heavy Blade",
            "Weapon Category": "Military Melee",
          }),
          entity("DAGGER", "Carried Dagger", "Weapon", {
            Damage: "1d4",
            Group: "Light Blade",
            Properties: "Off-hand, Light Thrown",
            "Weapon Category": "Simple Melee",
            Range: "5/10",
          }),
        ],
      })[0];
    const variant = (
      power: ReturnType<typeof evaluate>,
      equipmentName: string,
    ) => power?.variants.find((entry) => entry.equipmentName === equipmentName);

    // One weapon in hand: no off hand, so none of the two-weapon channels.
    const single = evaluate(0);
    expect(variant(single, "Equipped Sword")?.damage).toBe("1d8+4");
    expect(variant(single, "Carried Dagger")?.damage).toBe("1d4+4");
    // Two melee blades: two-weapon, two-melee-weapon and two-blade, and the
    // off-hand dagger's own row also gets two-melee-offhand.
    const dual = evaluate(1);
    expect(variant(dual, "Equipped Sword")?.damage).toBe("1d8+7");
    expect(variant(dual, "Equipped Sword")?.attackBonus).toBe(4);
    expect(variant(dual, "Carried Dagger")?.damage).toBe("1d4+7");
    expect(variant(dual, "Carried Dagger")?.attackBonus).toBe(5);
  });

  it("adds a ki-focused row per owned weapon base for an equipped ki focus (native BuildKiList)", () => {
    const evaluate = (kiEquipped: number) =>
      evaluatePowers({
        level: 1,
        activeDefinitionIds: ["POWER"],
        inventory: [
          {
            id: "ki",
            definitionIds: ["KI"],
            quantity: 1,
            equippedQuantity: kiEquipped,
            acquiredLevel: 1,
          },
          {
            id: "magic-blade",
            definitionIds: ["BLADE", "WEAPON_ENCHANT"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          // A second holding of the same base adds no second ki row.
          {
            id: "plain-blade",
            definitionIds: ["BLADE"],
            quantity: 1,
            equippedQuantity: 0,
            acquiredLevel: 1,
          },
        ],
        stats: { "Strength modifier": stat("Strength modifier", 2) },
        overlays: [],
        entities: [
          entity("POWER", "Synthetic Strike", "Power", {
            Keywords: "Weapon",
            "Attack Type": "Melee weapon",
            Attack: "Strength vs. AC",
            Hit: "1[W] + Strength modifier damage.",
          }),
          entity("KI", "Synthetic Ki Focus +2", "Magic Item", {
            "Magic Item Type": "Ki Focus",
            Enhancement: "+2",
          }),
          entity("BLADE", "Wrist Blade", "Weapon", {
            Damage: "1d4",
            "Proficiency Bonus": "3",
            Group: "Light Blade",
            "Weapon Category": "Simple Melee",
          }),
          entity("WEAPON_ENCHANT", "Keen Weapon +1", "Magic Item", {
            "Magic Item Type": "Weapon",
            Enhancement: "+1",
          }),
        ],
      })[0];
    const names = (power: ReturnType<typeof evaluate>) =>
      power?.variants.map((entry) => entry.equipmentName) ?? [];

    const equipped = evaluate(1);
    const focused = equipped?.variants.filter(
      (entry) => entry.equipmentName === "Synthetic Ki Focused Wrist Blade +2",
    );
    // The bare base (the weapon's own +1 dropped) with the focus's +2.
    expect(focused).toHaveLength(1);
    expect(focused?.[0]?.attackBonus).toBe(7);
    expect(focused?.[0]?.damage).toBe("1d4+4");
    expect(names(equipped)).toContain("Keen Wrist Blade +1");
    // An unequipped ki focus adds nothing.
    expect(names(evaluate(0))).not.toContain(
      "Synthetic Ki Focused Wrist Blade +2",
    );
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
    // Legacy IsValidPowerCombo: a ranged weapon is not offered to a melee
    // power, but a close weapon power takes both.
    expect(variant("BRASH", "Synthetic Bow")).toBeUndefined();
    expect(variant("CRUSH", "Synthetic Axe")?.damage).toBe("2d12+7");
    expect(variant("CRUSH", "Synthetic Bow")).toBeUndefined();
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

  it("applies row-wide attack and damage stats like native CalcGlobal", () => {
    const contribution = (
      name: string,
      value: number,
      extra: { bonusType?: string; condition?: string } = {},
    ) => ({
      id: `${name}:${value}:${extra.bonusType ?? extra.condition ?? ""}`,
      stat: name,
      value: String(value),
      providerId: "feature",
      providerName: "Synthetic feature",
      numericValue: value,
      ...extra,
      applied: extra.condition === undefined,
      ...(extra.condition === undefined
        ? {}
        : { reason: "conditional" as const }),
    });
    const evaluated = (
      name: string,
      ...contributions: ReturnType<typeof contribution>[]
    ): EvaluatedStat => ({ name, value: 0, contributions });
    const entities = [
      entity("STRIKE", "Synthetic Strike", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.",
      }),
      entity("BOLT", "Synthetic Bolt", "Power", {
        Keywords: "Arcane, Implement",
        "Attack Type": "Ranged 10",
        Attack: "Intelligence vs. Reflex",
        Hit: "2d6 + Intelligence modifier damage.",
      }),
      entity("SWORD", "Synthetic Sword", "Weapon", { Damage: "1d8" }),
      entity("SWORD_MAGIC", "Synthetic Sword +1", "Magic Item", {
        "Magic Item Type": "Weapon",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
      entity("WAND", "Synthetic Wand +3", "Magic Item", {
        "Magic Item Type": "Wand",
        Enhancement: "+3 attack rolls and damage rolls",
      }),
    ];
    const powers = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["STRIKE", "BOLT"],
      inventory: [
        {
          id: "sword",
          definitionIds: ["SWORD", "SWORD_MAGIC"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "wand",
          definitionIds: ["WAND"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 4),
        "Intelligence modifier": stat("Intelligence modifier", 5),
        // Armor non-proficiency penalty, an Inherent Bonuses-style typed
        // enhancement and a conditional bonus that stays a reminder.
        "attack rolls": evaluated(
          "attack rolls",
          contribution("attack rolls", -2),
          contribution("attack rolls", 2, { bonusType: "Enhancement" }),
          contribution("attack rolls", 3, { condition: "while bloodied" }),
        ),
        "damage rolls": evaluated(
          "damage rolls",
          contribution("damage rolls", 2, { bonusType: "Enhancement" }),
        ),
        Damage: evaluated("Damage", contribution("Damage", 1)),
        // Native AddLaterKeywords makes the attack ability a keyword.
        "Intelligence:damage": evaluated(
          "Intelligence:damage",
          contribution("Intelligence:damage", 1),
        ),
        "weapon attack rolls": evaluated(
          "weapon attack rolls",
          contribution("weapon attack rolls", 1),
        ),
        "attack rolls(Synthetic Sword +1)": evaluated(
          "attack rolls(Synthetic Sword +1)",
          contribution("attack rolls(Synthetic Sword +1)", 1),
        ),
        "attack rolls(Other Blade +5)": evaluated(
          "attack rolls(Other Blade +5)",
          contribution("attack rolls(Other Blade +5)", 5),
        ),
      },
      overlays: [],
      entities,
    });
    const row = (power: string, equipment: string) =>
      powers
        .find((candidate) => candidate.name === power)
        ?.variants.find((variant) => variant.equipmentId === equipment);

    // Str 4, enhancement max(+1 sword, +2 typed) = 2, -2 penalty, +1 weapon
    // attack rolls, +1 limited to the sword; damage +2 enhancement, +1.
    expect(row("Synthetic Strike", "sword")).toMatchObject({
      attackBonus: 6,
      damage: "1d8+7",
    });
    // The wand's +3 enhancement exceeds the typed +2; no weapon-only stats;
    // an Intelligence attack adds Intelligence:damage.
    expect(row("Synthetic Bolt", "wand")).toMatchObject({
      attackBonus: 6,
      damage: "2d6+10",
    });
    // Unarmed holds no enhancement, so the typed +2 applies in full.
    expect(row("Synthetic Strike", "unarmed")?.attackBonus).toBe(4);
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

  it("reads both steps of a native exact increase line (AttackPowerModRepl)", () => {
    const bonusAt = (level: number) =>
      evaluatePowers({
        level,
        activeDefinitionIds: ["POWER"],
        inventory: [],
        stats: {},
        overlays: [],
        entities: [
          entity("POWER", "Synthetic Flame", "Power", {
            "Attack Type": "Ranged 10",
            Attack:
              "Wisdom +4 vs. Reflex\nIncrease to +6 bonus at 11th level and +8 bonus at 21st level.",
            Hit: "The target grants combat advantage.",
          }),
        ],
      })[0]?.variants[0]?.attackComponents.find(
        ({ label }) => label === "power attack bonus",
      )?.value;

    expect([bonusAt(10), bonusAt(11), bonusAt(21)]).toEqual([4, 6, 8]);
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

  it("calculates no rows for a power with neither an attack nor a Hit line", () => {
    // Legacy PowerStats returns no row without a Hit line; it only kept a
    // placeholder row for Healing powers, which now report healing instead.
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

    expect(power?.variants).toEqual([]);
  });

  it("totals legacy healing stats for Healing powers, sharing typed maxima", () => {
    const typed = (name: string, value: number, bonusType: string) => {
      const base = combatStat(name, value);
      return {
        ...base,
        contributions: base.contributions.map((contribution) => ({
          ...contribution,
          id: `${name}:${bonusType}`,
          bonusType,
        })),
      };
    };
    const evaluate = (keywords: string) =>
      evaluatePowers({
        level: 8,
        activeDefinitionIds: ["POWER"],
        inventory: [],
        stats: {
          Healing: combatStat("Healing", 2),
          "Healing Word:healing": typed("Healing Word:healing", 3, "Item"),
          "CLASS_ID:healing": typed("CLASS_ID:healing", 1, "Item"),
          "Other Power:healing": combatStat("Other Power:healing", 9),
        },
        overlays: [],
        entities: [
          entity("POWER", "Healing Word", "Power", {
            Keywords: keywords,
            Class: "CLASS_ID",
            Effect: "The target can spend a healing surge.",
          }),
        ],
      })[0];

    const healing = evaluate("Healing");
    expect(healing?.variants).toEqual([]);
    expect(healing?.healing?.bonus).toBe(5);
    expect(healing?.healing?.components.map((part) => part.label)).toEqual([
      "Healing",
      "Healing Word:healing",
    ]);
    expect(evaluate("Divine")?.healing).toBeUndefined();
  });

  it("counts a class power's power source for keyed healing", () => {
    // Healing Word is a divine healing power though its keywords omit Divine.
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER", "CLERIC"],
      inventory: [],
      stats: { "divine:healing": combatStat("divine:healing", 6) },
      overlays: [],
      entities: [
        entity("CLERIC", "Synthetic Cleric", "Class", {
          "Power Source": "Divine. You wield divine power.",
        }),
        entity("POWER", "Synthetic word", "Power", {
          Keywords: "Healing",
          Class: "CLERIC",
          Effect: "The target can spend a healing surge.",
        }),
      ],
    });
    expect(power?.healing?.bonus).toBe(6);
  });

  it("counts healing keyed by power ID or keyword, and reminds of conditional healing", () => {
    const [power] = evaluatePowers({
      level: 8,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {
        "POWER:healing": combatStat("POWER:healing", 3),
        "divine:healing": combatStat("divine:healing", 25),
        "Primal:healing": combatStat("Primal:healing", 99),
        Healing: {
          name: "Healing",
          value: 0,
          contributions: [
            {
              id: "bloodied",
              stat: "Healing",
              value: "4",
              providerId: "feat",
              providerName: "Draconic Healing",
              condition: "while you are bloodied",
              numericValue: 4,
              applied: false,
              reason: "conditional",
            },
          ],
        },
        "divine:healing ": {
          name: "divine:healing ",
          value: 0,
          contributions: [
            {
              id: "gift",
              stat: "divine:healing",
              value: "+1d6",
              providerId: "feature",
              providerName: "Gift of Life",
              condition: "to a bloodied target",
              numericValue: 0,
              applied: false,
              reason: "conditional",
            },
          ],
        },
      },
      overlays: [],
      entities: [
        entity("POWER", "Synthetic prayer", "Power", {
          Keywords: "Divine, Healing",
          Effect: "The target can spend a healing surge.",
        }),
      ],
    });
    expect(power?.healing?.bonus).toBe(28);
    expect(power?.healing?.conditional).toEqual([
      {
        amount: "4",
        condition: "while you are bloodied",
        source: "Draconic Healing",
        provenanceId: "bloodied",
      },
      {
        amount: "1d6",
        condition: "to a bloodied target",
        source: "Gift of Life",
        provenanceId: "gift",
      },
    ]);
  });

  it("calculates a correction-supplied hit line for a prose-only damage power", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: { "Intelligence modifier": stat("Intelligence modifier", 4) },
      overlays: [],
      entities: [
        entity("POWER", "Storm Pillar", "Power", {
          Keywords: "Arcane, Implement, Lightning",
          Effect:
            "Each enemy that moves adjacent takes 1d6 + Intelligence modifier lightning damage.",
          _CalculatedHit: "1d6 + Intelligence modifier lightning damage.",
        }),
      ],
    });

    expect(power?.variants[0]?.damage).toBe("1d6+4");
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

  it.each([
    [1, 2, "1d6+3"],
    [11, 4, "2d6+3"],
    [21, 6, "3d6+3"],
  ])(
    "raises Dragon Breath's bonus by name and its damage by its increase sentence at level %i (native AttackPowerModRepl/ParseIncreaseLine)",
    (level, powerBonus, damage) => {
      const breath = {
        "Attack Type": "Close blast 3",
        Attack:
          "Strength +2 vs. Reflex, Constitution +2 vs. Reflex, or Dexterity +2 vs. Reflex",
        Hit: "1d6 + Constitution modifier damage.\nIncrease to +4 bonus and 2d6 + Constitution modifier damage at 11th level, and to +6 bonus and 3d6 + Constitution modifier damage at 21st level.",
      };
      const powers = evaluatePowers({
        level,
        activeDefinitionIds: ["BREATH", "COPY"],
        inventory: [],
        stats: {
          Constitution: stat("Constitution", 16),
          "Constitution modifier": stat("Constitution modifier", 3),
        },
        overlays: [],
        entities: [
          entity("BREATH", "Dragon Breath", "Power", breath),
          entity("COPY", "Synthetic Breath", "Power", breath),
        ],
      });
      const byName = (name: string) =>
        powers.find((power) => power.name === name)?.variants[0]?.attacks?.[0];
      expect(byName("Dragon Breath")).toMatchObject({ powerBonus, damage });
      // The bonus is keyed by name; the same text under another name keeps
      // its +2 but its damage still scales.
      expect(byName("Synthetic Breath")).toMatchObject({
        powerBonus: 2,
        damage,
      });
    },
  );

  it.each([
    [1, "1d12+4"],
    [5, "2d12+4"],
    [11, "3d12+4"],
    [15, "4d12+4"],
    [21, "5d12+4"],
    [25, "6d12+4"],
  ])(
    "reads every threshold of a native-rewritten increase sentence at level %i",
    (level, damage) => {
      const [power] = evaluatePowers({
        level,
        activeDefinitionIds: ["POWER"],
        inventory: [],
        stats: { "Wisdom modifier": stat("Wisdom modifier", 4) },
        overlays: [],
        entities: [
          entity("POWER", "Synthetic Judgment", "Power", {
            "Attack Type": "Close blast 5",
            Attack: "Wisdom vs. Will",
            Hit: "1d12 + Wisdom modifier radiant damage.\nIncrease damage to 2d12 + Wisdom modifier at 5th level, 3d12 + Wisdom modifier at 11th, 4d12 + Wisdom modifier at 15th, 5d12 + Wisdom modifier at 21st, and 6d12 + Wisdom modifier at 25th.",
          }),
        ],
      });
      expect(power?.variants[0]?.attacks?.[0]?.damage).toBe(damage);
    },
  );

  it.each([
    [10, "1d6+3", "1d8+3"],
    [11, "2d6+3", "2d8+3"],
    [21, "3d6+3", "3d8+3"],
  ])(
    "parses 'Increase to' damage sentences anywhere in the hit at level %i",
    (level, pulse, storm) => {
      const powers = evaluatePowers({
        level,
        activeDefinitionIds: ["PULSE", "STORM"],
        inventory: [],
        stats: {
          Dexterity: stat("Dexterity", 16),
          "Dexterity modifier": stat("Dexterity modifier", 3),
        },
        overlays: [],
        entities: [
          entity("PULSE", "Synthetic Pulse", "Power", {
            "Attack Type": "Melee 1",
            Attack: "Dexterity +2 vs. Reflex",
            Hit: "1d6 + Strength, Constitution, or Dexterity modifier fire damage.\nIncrease to 2d6 + Strength, Constitution, or Dexterity modifier fire damage at 11th level, and to 3d6 + Strength, Constitution, or Dexterity modifier fier damage at 21st level.",
          }),
          // D091: the leading "+N bonus and" is skipped, not read as damage.
          entity("STORM", "Synthetic Storm", "Power", {
            "Attack Type": "Close burst 2",
            Attack: "Dexterity + 2 vs. Reflex",
            Hit: "1d8 + Dexterity modifier damage, and ongoing 5 damage (save ends).\nIncrease to +4 bonus and 2d8 + Dexterity modifier damage, and ongoing 10 damage at 11th level, and to +6 bonus and 3d8 + Dexterity modifier damage, and ongoing 15 damage at 21st level.",
          }),
        ],
      });
      const damage = (name: string) =>
        powers.find((power) => power.name === name)?.variants[0]?.attacks?.[0]
          ?.damage;
      expect(damage("Synthetic Pulse")).toBe(pulse);
      expect(damage("Synthetic Storm")).toBe(storm);
    },
  );

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
    // With no beast the attack stays unresolved and unusable, never a
    // character attack bonus.
    expect(power?.variants[0]?.attacks?.[0]).toMatchObject({
      attackStat: "Unknown",
      defense: "Will",
      eligible: false,
    });
  });

  it("attacks through a summoned creature with your level plus its bonus", () => {
    const summoned = (attack: string, overlay?: string) =>
      evaluatePowers({
        level: 25,
        activeDefinitionIds: ["SUMMONED"],
        inventory: [],
        stats: {
          "Charisma modifier": stat("Charisma modifier", 6),
          "Strength modifier": stat("Strength modifier", 2),
        },
        overlays:
          overlay === undefined
            ? []
            : [
                {
                  providerOccurrenceId: "SUMMONED",
                  targetDefinitionIds: ["SUMMONED"],
                  field: "Attack",
                  value: overlay,
                },
              ],
        entities: [
          entity("SUMMONED", "Synthetic Summoned Attack", "Power", {
            "Attack Type": "Close blast 3",
            Target: "Enemies in the blast",
            Attack: attack,
            Hit: "2d12 + your Charisma modifier psychic damage.",
          }),
        ],
      })[0];

    const direct = summoned("Your level + 5 vs. Will");
    expect(direct?.variants).toHaveLength(1);
    expect(direct?.variants[0]?.attacks?.[0]).toMatchObject({
      attackStat: "Level",
      powerBonus: 5,
      defense: "Will",
      attackBonus: 30,
      damage: "2d12+6",
    });
    expect(direct?.variants[0]?.attacks?.[0]?.eligible).toBeUndefined();
    expect(direct?.unsupported).toEqual([]);

    // A content correction overlays a beast-phrased line with the formula.
    const corrected = summoned(
      "Beast's attack bonus vs. Will",
      "your level + 3 vs. Will",
    );
    expect(corrected?.variants[0]?.attacks?.[0]).toMatchObject({
      attackStat: "Level",
      attackBonus: 28,
    });
    expect(corrected?.unsupported).toEqual([]);
  });

  it("gives a fixed-bonus summoned creature only creature and power-keyed bonuses (D095)", () => {
    const evaluate = (fields: Record<string, string>) =>
      evaluatePowers({
        level: 10,
        activeDefinitionIds: ["SUMMONED"],
        inventory: [],
        stats: {
          "Charisma modifier": stat("Charisma modifier", 4),
          "attack rolls": combatStat("attack rolls", 2),
          damage: combatStat("damage", 1),
          "damage rolls": combatStat("damage rolls", 2),
          "arcane:damage": combatStat("arcane:damage", 7),
          "ALLY.attack rolls": stat("ALLY.attack rolls", 1),
          "SUMMON.damage": stat("SUMMON.damage", 5),
          "COMPANION.damage rolls": stat("COMPANION.damage rolls", 1),
          "SUMMONED:damage": combatStat("SUMMONED:damage", 2),
        },
        overlays: [],
        entities: [
          entity("SUMMONED", "Synthetic Ally Attack", "Power", {
            "Attack Type": "Melee 1",
            Attack: "your level + 5 vs. AC",
            ...fields,
          }),
        ],
      })[0]?.variants[0]?.attacks?.[0];

    // Dice + Charisma + SUMMON.damage + COMPANION.damage rolls + the
    // power's own bonus; no damage, damage rolls or arcane:damage.
    const creature = evaluate({
      Keywords: "Arcane, Summoning",
      Hit: "1d8 + your Charisma modifier damage.",
    });
    expect(creature).toMatchObject({ attackBonus: 16, damage: "1d8+12" });
    expect(creature?.damageComponents?.map(({ label }) => label)).toEqual([
      "Charisma modifier",
      "creature damage bonus",
      "SUMMONED:damage",
    ]);

    // Flat damage is not a damage roll: no COMPANION.damage rolls.
    expect(
      evaluate({ Keywords: "Arcane, Summoning", Hit: "5 damage." }),
    ).toMatchObject({ damage: "12" });

    // A stat block naming a Summoned Creature, without the keyword.
    expect(
      evaluate({
        "Synthetic Servant Stats": "Medium humanoid; Summoned Creature",
        Hit: "1d8 + your Charisma modifier damage.",
      }),
    ).toMatchObject({ damage: "1d8+12" });

    // A "your level + N" attack you make yourself (a transformed form)
    // keeps your damage bonuses; its attack stays the fixed line.
    expect(
      evaluate({
        Keywords: "Arcane",
        Hit: "1d8 + your Charisma modifier damage.",
      }),
    ).toMatchObject({ attackBonus: 15, damage: "1d8+16" });
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

  it("gives a staff without a weapon part the Quarterstaff's weapon keywords (AddWeaponKeywords)", () => {
    const entities = [
      entity("BASIC", "Melee Basic Attack", "Power", {
        Keywords: "Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.",
      }),
      entity("BOLT", "Synthetic bolt", "Power", {
        Keywords: "Arcane, Implement",
        "Attack Type": "Ranged 10",
        Attack: "Intelligence vs. Reflex",
        Hit: "1d6 + Intelligence modifier damage.",
      }),
      entity(EXCEPTION_IDS.quarterstaff, "Quarterstaff", "Weapon", {
        Damage: "1d8",
        "Proficiency Bonus": "2",
        "Weapon Category": "Simple Melee",
        Group: "Staff",
        "Item Slot": "Two-Hand",
      }),
      entity("STAFF", "Staff of Light +1", "Magic Item", {
        "Magic Item Type": "Staff",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const powers = evaluatePowers({
      level: 3,
      activeDefinitionIds: ["BASIC", "BOLT"],
      inventory: [
        {
          id: "staff",
          definitionIds: ["STAFF"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: {
        "Strength modifier": stat("Strength modifier", 0),
        "Intelligence modifier": stat("Intelligence modifier", 0),
        "weapon,staff group:attack": combatStat("weapon,staff group:attack", 1),
      },
      overlays: [],
      entities,
    });
    const attack = (name: string) =>
      powers
        .find((power) => power.name === name)
        ?.variants.find(
          (variant) => variant.equipmentName === "Staff of Light +1",
        )?.attackBonus;
    // 1 half level + 2 proficiency + 1 enhancement + 1 staff group feat.
    expect(attack("Melee Basic Attack")).toBe(5);
    // An implement power is not a weapon power: no `weapon,` channel.
    expect(attack("Synthetic bolt")).toBe(2);
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
        Range: "5/10",
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

  it("keeps a one-handed weapon main over a stale main-hand name on an alternate-slot off-hand weapon", () => {
    // Native AddLoot names any equipped off-hand item as
    // _INTERNAL_MainHandWeapon, but CharLootSlot honours that name only
    // while no one-handed item is equipped (-Module-.cs ~19185), and legacy
    // power rows list the one-handed "Main hand" weapon first.
    const entities = [
      entity("POWER", "Synthetic Strike", "Power", {
        Keywords: "Arcane, Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Intelligence vs. AC",
        Hit: "1[W] + Intelligence modifier damage.",
      }),
      entity("SWORD", "Longsword", "Weapon", {
        Damage: "1d8",
        "Proficiency Bonus": "3",
        "Hands Required": "One-Handed",
        "Item Slot": "One-hand",
      }),
      entity("RAZOR", "Wrist Razors", "Weapon", {
        Damage: "1d4",
        "Proficiency Bonus": "3",
        "Hands Required": "One-Handed",
        "Item Slot": "Off-hand",
        Properties: "Off-hand",
        _AlternateSlot: "Arms",
      }),
    ];
    const [power] = evaluatePowers({
      level: 6,
      activeDefinitionIds: ["POWER"],
      inventory: [
        {
          id: "sword",
          name: "Aegis sword",
          definitionIds: ["SWORD"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "razor",
          name: "Rhythm razors",
          definitionIds: ["RAZOR"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
          overrides: { _AlternateSlot: "1" },
        },
      ],
      textStrings: { _INTERNAL_MainHandWeapon: "Rhythm razors" },
      stats: { "Intelligence modifier": stat("Intelligence modifier", 4) },
      overlays: [],
      entities,
    });

    const hands = Object.fromEntries(
      (power?.variants ?? [])
        .filter((variant) => variant.equipped === true)
        .map((variant) => [variant.equipmentName, variant.hand]),
    );
    expect(hands).toEqual({ "Aegis sword": "main", "Rhythm razors": "off" });
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
    // The off-hand row pairs with the main-hand implement, as native
    // DetermineOffhand does for every equipped row.
    expect(
      powers("Accurate Orb +3")?.variants.find(
        (variant) => variant.equipmentName === "Defensive Wand +2",
      ),
    ).toMatchObject({ hand: "off", damage: "1d8+10" });
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

  it("stacks a pact blade's typed bonus with Dual Implement Spellcaster's in one row maximum", () => {
    // Native PowerStats keeps one dmg_type_max per row: a pact blade's
    // transferred "off-hand enhancement" (read on the weapon path of an
    // implement power) and Dual Implement Spellcaster's bonus of the same
    // type do not stack (legacy "[Doesn't Stack]").
    const entities = [
      entity("WARLOCK", "Warlock", "Class", {}),
      entity("POWER", "Arcane Curse", "Power", {
        Keywords: "Arcane, Implement",
        Class: "WARLOCK",
        "Attack Type": "Ranged 10",
        Attack: "Charisma vs. Reflex",
        Hit: "1d8 + Charisma modifier force damage.",
      }),
      entity("FEAT", "Dual Implement Spellcaster", "Feat", {}),
      entity("DAGGER", "Dagger", "Weapon", {
        Damage: "1d4",
        Group: "Light Blade",
        "Proficiency Bonus": "3",
      }),
      entity("BLADE", "Pact Blade +1", "Magic Item", {
        "Magic Item Type": "Weapon",
        Enhancement: "+1 attack rolls and damage rolls",
        _ImplementForClass: "WARLOCK",
      }),
      entity("WAND", "Synthetic Wand +2", "Magic Item", {
        "Magic Item Type": "Wand",
        Enhancement: "+2 attack rolls and damage rolls",
      }),
    ];
    const pactTransfer = (value: number): EvaluatedStat => ({
      name: "BLADE:damage",
      value,
      contributions: [
        {
          id: "pact-transfer",
          stat: "BLADE:damage",
          value: String(value),
          bonusType: "off-hand enhancement",
          providerId: "pact",
          providerName: "Pact Weapon",
          numericValue: value,
          applied: true,
        },
      ],
    });
    const bladeRow = (transfer: number) =>
      evaluatePowers({
        level: 10,
        activeDefinitionIds: ["WARLOCK", "POWER", "FEAT"],
        inventory: [
          {
            id: "blade",
            name: "Pact Blade Dagger +1",
            definitionIds: ["DAGGER", "BLADE"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "wand",
            name: "Synthetic Wand +2",
            definitionIds: ["WAND"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        textStrings: { _INTERNAL_MainHandWeapon: "Pact Blade Dagger +1" },
        stats: {
          "Charisma modifier": stat("Charisma modifier", 5),
          "BLADE:damage": pactTransfer(transfer),
        },
        overlays: [],
        entities,
      })[0]?.variants.find(
        (variant) => variant.equipmentName === "Pact Blade Dagger +1",
      );
    // Charisma 5 + blade enhancement 1 + one off-hand enhancement 2.
    expect(bladeRow(2)?.damage).toBe("1d8+8");
    expect(
      bladeRow(2)?.damageComponents.filter(
        (component) =>
          component.label === "off-hand implement enhancement bonus" ||
          component.label === "BLADE:damage",
      ),
    ).toHaveLength(1);
    // The higher bonus of the type wins.
    expect(bladeRow(3)?.damage).toBe("1d8+9");
  });

  it("pairs dual implements by legacy DetermineOffhand without a hand selection", () => {
    const entities = [
      entity("POWER", "Arcane Bolt", "Power", {
        Keywords: "Arcane, Implement",
        "Attack Type": "Ranged 10",
        Attack: "Charisma vs. Reflex",
        Hit: "1d8 + Charisma modifier force damage.",
      }),
      entity("DIVINE", "Holy Bolt", "Power", {
        Keywords: "Divine, Implement",
        "Attack Type": "Ranged 10",
        Attack: "Charisma vs. Reflex",
        Hit: "1d8 + Charisma modifier radiant damage.",
      }),
      entity("FEAT", "Dual Implement Spellcaster", "Feat", {}),
      entity("WAND", "Synthetic Wand +2", "Magic Item", {
        "Magic Item Type": "Wand",
        Enhancement: "+2 attack rolls and damage rolls",
      }),
      // A wondrous item that is an implement only through _ImplementEquiv.
      entity("LUTE", "Synthetic Lute +3", "Magic Item", {
        "Magic Item Type": "Wondrous Item",
        "Item Slot": "Off-hand",
        _ImplementEquiv: "Instrument",
        Enhancement: "+3 attack rolls and damage rolls",
      }),
      entity("ROD", "Spare Rod +1", "Magic Item", {
        "Magic Item Type": "Rod",
        Enhancement: "+1 attack rolls and damage rolls",
      }),
    ];
    const [arcane, divine] = evaluatePowers({
      level: 10,
      activeDefinitionIds: ["POWER", "DIVINE", "FEAT"],
      inventory: [
        {
          id: "wand",
          name: "Synthetic Wand +2",
          definitionIds: ["WAND"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
        {
          id: "rod",
          name: "Spare Rod +1",
          definitionIds: ["ROD"],
          quantity: 1,
          equippedQuantity: 0,
          acquiredLevel: 1,
        },
        {
          id: "lute",
          name: "Synthetic Lute +3",
          definitionIds: ["LUTE"],
          quantity: 1,
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
      stats: { "Charisma modifier": stat("Charisma modifier", 5) },
      overlays: [],
      entities,
    });
    const damage = (power: typeof arcane, name: string) =>
      power?.variants.find((variant) => variant.equipmentName === name)?.damage;
    // Each equipped implement's row adds the other's enhancement.
    expect(damage(arcane, "Synthetic Wand +2")).toBe("1d8+10");
    expect(damage(arcane, "Synthetic Lute +3")).toBe("1d8+10");
    // An unequipped implement has no off hand; a non-arcane power gets none.
    expect(damage(arcane, "Spare Rod +1")).toBe("1d8+6");
    expect(damage(divine, "Synthetic Wand +2")).toBe("1d8+7");
  });

  it("matches an augment limiter on the item the augment is bound to", () => {
    const shardBonus: EvaluatedStat = combatStat(
      "implement:damage(Synthetic Shard)",
      1,
    );
    const augment =
      '<?xml version="1.0" encoding="utf-16"?><CharLootID><baseID>SHARD</baseID></CharLootID>';
    const evaluate = (shardOwned: boolean) =>
      evaluatePowers({
        level: 1,
        activeDefinitionIds: ["POWER"],
        inventory: [
          {
            id: "dagger",
            name: "Shard Dagger",
            definitionIds: ["DAGGER"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
            overrides: { augment },
          },
          {
            id: "other",
            name: "Plain Dagger",
            definitionIds: ["DAGGER"],
            quantity: 1,
            equippedQuantity: 0,
            acquiredLevel: 1,
          },
          ...(shardOwned
            ? [
                {
                  id: "shard",
                  definitionIds: ["SHARD"],
                  quantity: 1,
                  equippedQuantity: 0,
                  acquiredLevel: 1,
                },
              ]
            : []),
        ],
        stats: {
          "Charisma modifier": stat("Charisma modifier", 3),
          "implement:damage(Synthetic Shard)": shardBonus,
        },
        overlays: [],
        entities: [
          entity("POWER", "Arcane Bolt", "Power", {
            Keywords: "Arcane, Implement",
            "Attack Type": "Ranged 10",
            Attack: "Charisma vs. Reflex",
            Hit: "1d6 + Charisma modifier damage.",
          }),
          entity("DAGGER", "Dagger", "Weapon", { Damage: "1d4" }),
          entity("SHARD", "Synthetic Shard", "Magic Item", {
            "Magic Item Type": "Dragonshard Augment",
          }),
        ],
      })[0];
    const damage = (power: ReturnType<typeof evaluate>, name: string) =>
      power?.variants.find((variant) => variant.equipmentName === name)?.damage;
    const owned = evaluate(true);
    expect(damage(owned, "Shard Dagger")).toBe("1d6+4");
    expect(damage(owned, "Plain Dagger")).toBe("1d6+3");
    // CharLootAugment resolves only an augment the character owns.
    expect(damage(evaluate(false), "Shard Dagger")).toBe("1d6+3");
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
        condition: "once per round",
      },
    ]);
    expect(
      powers.find(({ definitionId }) => definitionId === "OTHER_POWER")
        ?.variants[0]?.conditionalDamage,
    ).toEqual([]);
  });

  it("projects sneak attack only for recovered eligible weapon families", () => {
    const weapon = (id: string, name: string, group: string) =>
      entity(id, name, "Weapon", {
        Damage: "1d6",
        "Proficiency Bonus": "2",
        Group: group,
        "Weapon Category": "Simple Melee",
      });
    const entities = [
      entity("POWER", "Rogue Strike", "Power", {
        Keywords: "Martial, Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Dexterity vs. AC",
        Hit: "1[W] + Dexterity modifier damage.",
      }),
      entity("SPELL", "Rogue Spell", "Power", {
        Keywords: "Arcane, Implement",
        "Attack Type": "Ranged 10",
        Attack: "Dexterity vs. Reflex",
        Hit: "1d6 + Dexterity modifier damage.",
      }),
      entity("ID_FMP_CLASS_FEATURE_322", "Sneak Attack", "Class Feature", {
        Usage: "turn",
      }),
      weapon("DAGGER", "Dagger", "Light Blade"),
      weapon("HAND", "Hand Crossbow", "Crossbow"),
      weapon("XBOW", "Crossbow", "Crossbow"),
      weapon("SWORD", "Longsword", "Heavy Blade"),
      weapon("MACE", "Mace", "Mace"),
      weapon("AXE", "Battleaxe", "Axe"),
    ];
    const evaluate = (
      textContributions: { name: string; value: string }[],
      extraStats: Record<string, number> = {},
    ) =>
      evaluatePowers({
        level: 1,
        activeDefinitionIds: ["POWER", "SPELL", "ID_FMP_CLASS_FEATURE_322"],
        inventory: ["DAGGER", "HAND", "XBOW", "SWORD", "MACE", "AXE"].map(
          (id) => ({
            id,
            definitionIds: [id],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          }),
        ),
        stats: {
          "Dexterity modifier": stat("Dexterity modifier", 4),
          "Sneak Attack Dice": stat("Sneak Attack Dice", 2),
          ...Object.fromEntries(
            Object.entries(extraStats).map(([name, value]) => [
              name,
              stat(name, value),
            ]),
          ),
        },
        textContributions,
        overlays: [],
        entities,
      });
    const sneak = (
      powers: ReturnType<typeof evaluate>,
      powerId: string,
      equipmentName: string,
    ) =>
      powers
        .find(({ definitionId }) => definitionId === powerId)
        ?.variants.find((variant) => variant.equipmentName === equipmentName)
        ?.conditionalDamage.map(
          ({ expression, condition }) => `${expression} ${condition}`,
        );

    const plain = evaluate([]);
    expect(sneak(plain, "POWER", "Dagger")).toEqual(["2d6 once per turn"]);
    // Native names only the hand crossbow, not the whole crossbow group.
    expect(sneak(plain, "POWER", "Hand Crossbow")).toEqual([
      "2d6 once per turn",
    ]);
    expect(sneak(plain, "POWER", "Crossbow")).toEqual([]);
    expect(sneak(plain, "POWER", "Longsword")).toEqual([]);
    expect(sneak(plain, "POWER", "Battleaxe")).toEqual([]);
    // Only a weapon power deals Sneak Attack damage.
    expect(sneak(plain, "SPELL", "Dagger")).toEqual([]);

    // "Sneak Attack Weapons" (Longsword Finesse, Street Thug) adds weapons
    // by name or "<group> group"; DiceAdjustment reads the limited dice.
    const feats = evaluate(
      [
        { name: "Sneak Attack Weapons", value: "Longsword" },
        { name: "Sneak Attack Weapons", value: "Mace group" },
      ],
      {
        "Sneak Attack Dice(longsword)": -1,
        "Sneak Attack Dice(mace group)": -1,
      },
    );
    expect(sneak(feats, "POWER", "Longsword")).toEqual(["1d6 once per turn"]);
    expect(sneak(feats, "POWER", "Mace")).toEqual(["1d6 once per turn"]);
    expect(sneak(feats, "POWER", "Dagger")).toEqual(["2d6 once per turn"]);
    expect(sneak(feats, "POWER", "Battleaxe")).toEqual([]);
  });

  it("names a striker's usage from its feature's Usage field", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER", "ID_FMP_CLASS_FEATURE_605"],
      inventory: [],
      stats: { "Warlock's Curse Dice": stat("Warlock's Curse Dice", 1) },
      overlays: [],
      entities: [
        entity("POWER", "Eldritch Bolt", "Power", {
          Keywords: "Arcane, Implement",
          "Attack Type": "Ranged 10",
          Attack: "Charisma vs. Reflex",
          Hit: "1d10 damage.",
        }),
        entity(
          "ID_FMP_CLASS_FEATURE_605",
          "Warlock's Curse",
          "Class Feature",
          {},
        ),
      ],
    });
    // No Usage field: native "round".
    expect(power?.variants[0]?.conditionalDamage).toEqual([
      {
        source: "Warlock's Curse",
        expression: "1d6",
        condition: "once per round",
      },
    ]);
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
  const variants = (activeDefinitionIds: readonly string[]) =>
    evaluatePowers({
      level: 8,
      activeDefinitionIds,
      inventory: ["SYMBOL", "ORB", "PICK"].map(owned),
      stats: { "Wisdom modifier": stat("Wisdom modifier", 5) },
      overlays: [],
      entities,
    })[0]?.variants ?? [];
  // The D081 view: variants the character is proficient with.
  const names = (activeDefinitionIds: readonly string[]) =>
    variants(activeDefinitionIds)
      .filter((variant) => variant.proficient)
      .map((variant) => variant.equipmentName);

  it("lists every owned weapon and implement like legacy, marking proficiency", () => {
    expect(
      variants(["POWER", "SYMBOL_PROFICIENCY"]).map((variant) => [
        variant.equipmentName,
        variant.proficient,
      ]),
    ).toEqual([
      ["Symbol of Hope +1", true],
      ["Orb of Light +1", false],
      ["War Pick", false],
      ["Unarmed", true],
    ]);
  });

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

describe("item implement metadata", () => {
  // Weapon enchantments are owned on a base weapon, as in real inventories.
  const owned = (item: ContentEntity) => ({
    id: item.id,
    definitionIds:
      field(item, "Magic Item Type") === "Weapon"
        ? ["DAGGER", item.id]
        : [item.id],
    quantity: 1,
    equippedQuantity: 1,
    acquiredLevel: 1,
  });
  const field = (item: ContentEntity, name: string) =>
    item.specifics.find((specific) => specific.name === name)?.value;
  const base = [
    entity("WARLOCK", "Warlock", "Class", {}),
    entity("CLERIC", "Cleric", "Class", {}),
    entity("ARCANE", "Arcane", "Power Source", {}),
    entity("DIVINE", "Divine", "Power Source", {}),
    entity("DWARF", "Dwarf", "Race", {}),
    entity("DAGGER", "Dagger", "Weapon", {
      Damage: "1d4",
      Group: "Light Blade",
    }),
    {
      ...entity("ORACLE", "Divine Oracle", "Paragon Path", {}),
      prerequisites: "Cleric class",
    },
    entity("CURSE", "Synthetic Curse", "Power", {
      Keywords: "Arcane, Implement",
      Class: "WARLOCK",
      Attack: "Charisma vs. Will",
      Hit: "1d6 + Charisma modifier damage.",
    }),
    entity("PRAYER", "Synthetic Prayer", "Power", {
      Keywords: "Divine, Implement",
      Class: "CLERIC",
      Attack: "Wisdom vs. Will",
      Hit: "1d6 + Wisdom modifier damage.",
    }),
    entity("FATE", "Synthetic Fate", "Power", {
      Keywords: "Divine, Implement",
      Class: "ORACLE",
      Attack: "Wisdom vs. Will",
      Hit: "1d6 + Wisdom modifier damage.",
    }),
    entity(
      "SYMBOL_PROFICIENCY",
      "Implement Proficiency (Holy Symbol)",
      "Proficiency",
      {},
    ),
  ];
  const variantsFor = (
    powerId: string,
    items: readonly ContentEntity[],
    active: readonly string[] = [],
  ) =>
    evaluatePowers({
      level: 8,
      activeDefinitionIds: [powerId, ...active],
      inventory: items.map(owned),
      stats: {},
      overlays: [],
      entities: [...base, ...items],
    })[0]
      ?.variants.filter((variant) => variant.proficient)
      .map((variant) => variant.equipmentName);

  it("uses a pact blade only for its class's powers", () => {
    const blade = entity("BLADE", "Pact Blade +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+1 attack rolls and damage rolls",
      _ImplementForClass: "WARLOCK",
    });
    expect(variantsFor("CURSE", [blade])).toContain("Pact Blade Dagger +1");
    expect(variantsFor("PRAYER", [blade], ["SYMBOL_PROFICIENCY"])).toEqual([
      "Unarmed",
    ]);
  });

  it("requires the race named in a scope qualifier", () => {
    const hammer = entity("HAMMER", "Pact Hammer +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+1 attack rolls and damage rolls",
      _ImplementForClass: "warlock(dwarf)",
    });
    expect(variantsFor("CURSE", [hammer])).toEqual(["Unarmed"]);
    expect(variantsFor("CURSE", [hammer], ["DWARF"])).toContain(
      "Pact Hammer Dagger +1",
    );
  });

  it("reads _ImplementAsClass as an alias of _ImplementForClass", () => {
    // Same grammar: a race qualifier and comma-joined list-additions.
    const hammer = entity("HAMMER", "Alias Hammer +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+1 attack rolls and damage rolls",
      _ImplementAsClass: "warlock(dwarf)",
    });
    expect(variantsFor("CURSE", [hammer])).toEqual(["Unarmed"]);
    expect(variantsFor("CURSE", [hammer], ["DWARF"])).toContain(
      "Alias Hammer Dagger +1",
    );
    const listed = entity("LISTED", "Alias Blade +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+1 attack rolls and damage rolls",
      _ImplementAsClass: "WIZARD, CLERIC",
    });
    expect(variantsFor("PRAYER", [listed])).toContain("Alias Blade Dagger +1");
    expect(variantsFor("CURSE", [listed])).toEqual(["Unarmed"]);
    // Both fields present: either scope works.
    const both = entity("BOTH", "Twofold Blade +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+1 attack rolls and damage rolls",
      _ImplementForClass: "WARLOCK",
      _ImplementAsClass: "CLERIC",
    });
    expect(variantsFor("CURSE", [both])).toContain("Twofold Blade Dagger +1");
    expect(variantsFor("PRAYER", [both])).toContain("Twofold Blade Dagger +1");
  });

  it("treats an implement-equivalent weapon as that implement", () => {
    const avenger = entity("AVENGER", "Holy Avenger +5", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+5 attack rolls and damage rolls",
      _ImplementEquiv: "Holy Symbol",
    });
    expect(variantsFor("PRAYER", [avenger], ["SYMBOL_PROFICIENCY"])).toContain(
      "Holy Avenger Dagger +5",
    );
    expect(variantsFor("PRAYER", [avenger])).toEqual(["Unarmed"]);
  });

  it("uses a weapon scoped to a power source as an implement for its powers", () => {
    // Rose Scythe of Chauntea: a staff implement for a divine or primal
    // character, whatever their weapon proficiencies.
    const scythe = entity("SCYTHE", "Rose Scythe +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+2 attack rolls and damage rolls",
      _ImplementForPower: "DIVINE, PRIMAL",
    });
    expect(variantsFor("PRAYER", [scythe])).toContain("Rose Scythe Dagger +2");
    expect(variantsFor("CURSE", [scythe], ["WARLOCK"])).toEqual(["Unarmed"]);
  });

  it("matches power-source and paragon-path scopes and universal implements", () => {
    const star = entity("STAR", "Star of Corellon +2", "Magic Item", {
      "Magic Item Type": "Holy Symbol",
      Enhancement: "+2 attack rolls and damage rolls",
      _ImplementForPower: "ARCANE(ARCANE)",
    });
    const oracle = entity("RELIC", "Oracle Relic +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+1 attack rolls and damage rolls",
      _ImplementForPower: "PP CLERIC",
    });
    const universal = entity("ANY", "Controller's Implement +3", "Magic Item", {
      "Magic Item Type": "Weapon",
      Enhancement: "+3 attack rolls and damage rolls",
      _UniversalImplement: "true",
    });
    // A warlock without holy-symbol proficiency may still use the star for
    // arcane powers.
    expect(variantsFor("CURSE", [star], ["WARLOCK"])).toContain(
      "Star of Corellon +2",
    );
    expect(variantsFor("FATE", [oracle])).toContain("Oracle Relic Dagger +1");
    expect(variantsFor("PRAYER", [oracle])).toEqual(["Unarmed"]);
    expect(variantsFor("PRAYER", [universal])).toContain(
      "Controller's Implement Dagger +3",
    );
  });
});

describe("power attack profile", () => {
  const stats = {
    "Strength modifier": stat("Strength modifier", 2),
    "Dexterity modifier": stat("Dexterity modifier", 4),
    "Wisdom modifier": stat("Wisdom modifier", 3),
  };
  const fighter = entity("CLASS", "Ranger", "Class", {
    "Key Abilities": "Dexterity, Strength, Wisdom",
  });
  const byId = new Map([["class", fighter]]);
  const profile = (specifics: Record<string, string>) =>
    powerAttackProfile(entity("POWER", "Synthetic power", "Power", specifics), {
      stats,
      activeDefinitionIds: ["CLASS"],
      byId,
    });

  it("takes the character's best ability when the attack offers a choice", () => {
    expect(profile({ Attack: "Strength or Dexterity vs. AC" })).toEqual({
      abilities: ["Dexterity"],
      defenses: ["AC"],
    });
  });

  it("collects every attack's ability and defense, normalizing names", () => {
    expect(
      profile({
        "Primary Attack": "Wisdom + 2 vs. Fort",
        "Secondary Attack": "Strength vs. Reflex",
      }),
    ).toEqual({
      abilities: ["Wisdom", "Strength"],
      defenses: ["Fortitude", "Reflex"],
    });
  });

  it("resolves a primary-ability attack from the class's key abilities", () => {
    expect(profile({ Attack: "Primary ability vs. Will" }).abilities).toEqual([
      "Dexterity",
    ]);
  });

  it("is empty for a power without an attack", () => {
    expect(profile({ Effect: "You shift 1 square." })).toEqual({
      abilities: [],
      defenses: [],
    });
  });
});

describe("extra damage dice", () => {
  it("sums dice statadds keyed by the power's ID or name", () => {
    const stats = new StatAccumulator();
    const add = (
      id: string,
      statName: string,
      value: string,
      condition?: string,
    ) =>
      stats.add({
        id,
        stat: statName,
        value,
        providerId: id,
        providerName: `Upgrade ${id}`,
        ...(condition === undefined ? {} : { condition }),
      });
    add("1", "POWER:extra damage", "+1d10");
    add("2", "POWER:extra damage", "+1d10");
    add("3", "Synthetic strike:extra damage", "+1d6");
    add("4", "POWER:extra damage", "+1d10", "against a helpless target");
    add("5", "OTHER:extra damage", "+4d10");
    const evaluated = Object.fromEntries(
      stats.allNames().map((name) => [name, stats.evaluate(name)]),
    );
    const [power] = evaluatePowers({
      level: 13,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: evaluated,
      overlays: [],
      entities: [
        entity("POWER", "Synthetic strike", "Power", {
          "Action Type": "No Action",
          Effect: "The target takes 1d10 extra damage.",
        }),
      ],
    });

    expect(power?.variants).toEqual([]);
    expect(power?.extraDamage?.dice).toBe("2d10 + 1d6");
    expect(power?.extraDamage?.components.map((part) => part.source)).toEqual([
      "Upgrade 1",
      "Upgrade 2",
      "Upgrade 3",
    ]);
  });

  it("reports nothing without extra damage stats", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER"],
      inventory: [],
      stats: {},
      overlays: [],
      entities: [entity("POWER", "Synthetic strike", "Power", {})],
    });
    expect(power?.extraDamage).toBeUndefined();
  });
});

describe("power field overlays (native CalcModifiedValue)", () => {
  it("adds a keyword only when the power does not already have it", () => {
    // Power of Skill list-adds Lightning to Divine Bolts and Thunder to
    // another power; native ListContains skips the one it already has.
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["DIVINE_BOLTS"],
      inventory: [],
      stats: {},
      overlays: [
        {
          providerOccurrenceId: "power-of-skill",
          targetDefinitionIds: ["DIVINE_BOLTS"],
          targetName: "Divine Bolts",
          field: "Keywords",
          listAddition: "Lightning",
        },
        {
          providerOccurrenceId: "power-of-skill",
          targetDefinitionIds: ["DIVINE_BOLTS"],
          targetName: "Divine Bolts",
          field: "Keywords",
          listAddition: "Radiant",
        },
      ],
      entities: [
        entity("DIVINE_BOLTS", "Divine Bolts", "Power", {
          Keywords: "Divine, Implement, Lightning",
        }),
      ],
    });
    expect(power?.keywords).toEqual([
      "Divine",
      "Implement",
      "Lightning",
      "Radiant",
    ]);
  });
});

describe("weapon fields and dice (native C_RulesElementField, FigureWeaponDice)", () => {
  const held = (id: string, definitionIds: string[], equippedQuantity = 1) => ({
    id,
    definitionIds,
    quantity: 1,
    equippedQuantity,
    acquiredLevel: 1,
  });
  const strike = (id: string, hit: string, attackType = "Melee weapon") =>
    entity(id, id, "Power", {
      Keywords: "Weapon",
      "Attack Type": attackType,
      Attack: "Strength vs. AC",
      Hit: hit,
    });
  const weapon = (
    id: string,
    name: string,
    specifics: Record<string, string> = {},
  ) =>
    entity(id, name, "Weapon", {
      Damage: "1d8",
      "Proficiency Bonus": "2",
      "Weapon Category": "Military Melee",
      Group: "Heavy Blade",
      Properties: "",
      Range: "",
      ...specifics,
    });
  const overlay = (
    targetName: string,
    field: string,
    change: { value?: string; listAddition?: string; dieIncrease?: string },
  ) => ({
    providerOccurrenceId: "feat",
    targetDefinitionIds: [],
    targetName,
    targetType: "Weapon",
    field,
    ...change,
  });
  const variant = (
    power: ReturnType<typeof evaluatePowers>[number] | undefined,
    equipmentId: string,
  ) =>
    power?.variants.find((candidate) => candidate.equipmentId === equipmentId);

  it("reads modified weapon properties, proficiency, damage and range", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["STRIKE"],
      entities: [
        strike("STRIKE", "1[W] damage."),
        weapon("SCYTHE", "Scythe", { Damage: "2d4" }),
        weapon("SHURIKEN", "Large Shuriken", { Damage: "1d4" }),
        weapon("SPEAR", "Spear"),
      ],
      inventory: [
        held("scythe", ["SCYTHE"]),
        held("shuriken", ["SHURIKEN"]),
        held("spear", ["SPEAR"]),
      ],
      stats: {},
      overlays: [
        overlay("Scythe", "Properties", { listAddition: "High Crit" }),
        overlay("Scythe", "Proficiency Bonus", { value: "3" }),
        // A weapon modify also changes its "Large <name>" record.
        overlay("Shuriken", "Damage", { dieIncrease: "1" }),
        {
          providerOccurrenceId: "spear-enchantment",
          targetDefinitionIds: ["SPEAR"],
          targetName: "BaseItem",
          field: "Properties",
          listAddition: "Heavy Thrown",
        },
        {
          providerOccurrenceId: "spear-enchantment",
          targetDefinitionIds: ["SPEAR"],
          targetName: "BaseItem",
          field: "Range",
          value: "10/20",
        },
      ],
    });
    expect(variant(power, "scythe")).toMatchObject({
      attackBonus: 3,
      critical: "+2d4 high crit damage",
    });
    expect(variant(power, "shuriken")).toMatchObject({
      weaponDamage: "1d6",
      damage: "1d6",
    });
    expect(variant(power, "spear")?.basicAttackTypes).toEqual([
      "melee",
      "ranged",
    ]);
  });

  it("steps weapon dice up by matching ':die' stats (DieIncrease)", () => {
    const stats = {
      "Off-hand:die": stat("Off-hand:die", 1),
      "thrown,ranged:die": stat("thrown,ranged:die", 1),
    };
    const entities = [
      strike("MELEE", "1[W] damage."),
      strike("THROW", "1[W] damage.", "Ranged weapon"),
      weapon("SHORT", "Short sword", {
        Damage: "1d6",
        Properties: "Off-Hand",
        Group: "Light Blade",
      }),
      weapon("AXE", "Throwing axe", {
        Damage: "1d6",
        Properties: "Light Thrown",
        Range: "5/10",
        Group: "Axe",
      }),
    ];
    const [melee, thrown] = evaluatePowers({
      level: 11,
      activeDefinitionIds: ["MELEE", "THROW"],
      entities,
      inventory: [held("short", ["SHORT"], 0), held("axe", ["AXE"], 0)],
      stats,
      overlays: [],
    });
    expect(variant(melee, "short")?.damage).toBe("1d8");
    expect(variant(melee, "axe")?.damage).toBe("1d6");
    expect(variant(thrown, "axe")?.damage).toBe("1d8");
  });

  it("uses the Unarmed Damage Die text string and the off-hand weapon's die", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["FRENZY"],
      entities: [
        strike("FRENZY", "1[W] + 1[W] (off-hand weapon) damage."),
        weapon("LONG", "Longsword"),
        weapon("SHORT", "Short sword", { Damage: "1d6" }),
      ],
      inventory: [held("long", ["LONG"]), held("short", ["SHORT"])],
      stats: {},
      textStrings: { "Unarmed Damage Die": "1d6" },
      overlays: [],
    });
    expect(variant(power, "long")?.damage).toBe("1d8+1d6");
    expect(variant(power, "short")?.damage).toBe("1d6+1d8");
    expect(variant(power, "unarmed")?.damage).toBe("1d6+1d6");
  });

  it("gives Arena Training improvised weapons 1d8 or 1d10 and +2 proficiency", () => {
    const [power] = evaluatePowers({
      level: 1,
      activeDefinitionIds: ["STRIKE", EXCEPTION_IDS.arenaTraining, "LONG_PROF"],
      entities: [
        strike("STRIKE", "1[W] damage."),
        entity(
          EXCEPTION_IDS.arenaTraining,
          "Arena Training",
          "Class Feature",
          {},
        ),
        entity(
          "LONG_PROF",
          "Weapon Proficiency (Longsword)",
          "Proficiency",
          {},
        ),
        weapon("LONG", "Longsword", { "Proficiency Bonus": "3" }),
        weapon("MAUL", "Maul", {
          Damage: "2d6",
          "Hands Required": "Two-Handed",
        }),
      ],
      inventory: [held("long", ["LONG"]), held("maul", ["MAUL"])],
      stats: {},
      overlays: [],
    });
    expect(variant(power, "long")).toMatchObject({
      attackBonus: 3,
      damage: "1d8",
    });
    expect(variant(power, "maul")).toMatchObject({
      attackBonus: 2,
      damage: "1d10",
    });
    expect(variant(power, "unarmed")).toMatchObject({
      attackBonus: 2,
      damage: "1d8",
    });
  });
});

describe("native BuildKeywordSet channels", () => {
  const owned = (id: string, definitionIds: string[], equipped = 1) => ({
    id,
    definitionIds,
    quantity: 1,
    equippedQuantity: equipped,
    acquiredLevel: 1,
  });
  const implementPower = entity("BOLT", "Synthetic Bolt", "Power", {
    Keywords: "Arcane, Implement",
    "Attack Type": "Ranged 10",
    Attack: "Intelligence vs. Reflex",
    Hit: "1d6 + Intelligence modifier damage.",
  });
  const rows = (
    entities: ContentEntity[],
    inventory: ReturnType<typeof owned>[],
    bonuses: string[],
    extra: Partial<Parameters<typeof evaluatePowers>[0]> = {},
  ) =>
    evaluatePowers({
      level: 1,
      activeDefinitionIds: entities
        .filter((candidate) => candidate.type === "Power")
        .map(({ id }) => id),
      inventory,
      stats: {
        "Intelligence modifier": stat("Intelligence modifier", 4),
        "Strength modifier": stat("Strength modifier", 3),
        ...Object.fromEntries(
          bonuses.map((name) => [name, combatStat(name, 1)]),
        ),
      },
      overlays: [],
      entities,
      ...extra,
    });
  const sources = (
    power: ReturnType<typeof rows>[number] | undefined,
    equipmentName: string,
  ) => {
    const variant = power?.variants.find(
      (candidate) => candidate.equipmentName === equipmentName,
    );
    return [
      ...(variant?.attackComponents ?? []),
      ...(variant?.damageComponents ?? []),
    ]
      .filter(({ source }) => source !== undefined)
      .map(({ label }) => label);
  };

  it("adds the overlaid enchantment's _PowerstatKeywords (AdditionalKeywords)", () => {
    const staff = (id: string, name: string) =>
      entity(id, name, "Magic Item", {
        "Magic Item Type": "Staff",
        Enhancement: "+1 attack rolls and damage rolls",
      });
    const [power] = rows(
      [
        implementPower,
        entity("QUICKBEAM", "Quickbeam staff", "Superior Implement", {
          Group: "Staff",
        }),
        staff("ID_FMP_MAGIC_ITEM_6476", "Staff of Divinity +1"),
        staff("AVERSION", "Aversion Staff +1"),
      ],
      [
        owned("divinity", ["QUICKBEAM", "ID_FMP_MAGIC_ITEM_6476"]),
        owned("aversion", ["QUICKBEAM", "AVERSION"]),
      ],
      ["holy symbol implement,implement:attack"],
      {
        // Staff of Divinity's `modify name="this" Field="_PowerstatKeywords"
        // list-addition="holy symbol implement" requires="Divine"`, active.
        overlays: [
          {
            providerOccurrenceId: "divinity:definition:1",
            targetDefinitionIds: ["ID_FMP_MAGIC_ITEM_6476"],
            targetName: "this",
            field: "_PowerstatKeywords",
            listAddition: "holy symbol implement",
          },
        ],
      },
    );

    expect(sources(power, "Quickbeam staff of Divinity +1")).toEqual([
      "holy symbol implement,implement:attack",
    ]);
    expect(sources(power, "Aversion Quickbeam staff +1")).toEqual([]);
  });

  it("adds a '?<class ID>' _PowerstatKeywords entry only to that class's powers", () => {
    const strike = (id: string, classId: string) =>
      entity(id, `Synthetic ${id}`, "Power", {
        Keywords: "Arcane, Weapon",
        Class: classId,
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] + Strength modifier damage.",
      });
    const path = {
      ...entity("ID_FMP_PARAGON_PATH_29", "Battle Mage", "Paragon Path", {}),
      prerequisites: "Wizard class",
    };
    const powers = rows(
      [
        entity("ID_FMP_CLASS_9", "Wizard", "Class", {}),
        entity("ID_FMP_CLASS_1", "Fighter", "Class", {}),
        path,
        strike("WIZARD_POWER", "ID_FMP_CLASS_9"),
        strike("PATH_POWER", "ID_FMP_PARAGON_PATH_29"),
        strike("FIGHTER_POWER", "ID_FMP_CLASS_1"),
        entity("ID_FMP_WEAPON_LONGSWORD", "Longsword", "Weapon", {
          Damage: "1d8",
          Group: "Heavy Blade",
          "Weapon Category": "Military Melee",
        }),
      ],
      [owned("sword", ["ID_FMP_WEAPON_LONGSWORD"])],
      ["wand implement:damage"],
      {
        // Eladrin Sword Wizardry: `modify name="Longsword" type="Weapon"
        // Field="_PowerstatKeywords" list-addition="wand implement?ID_FMP_CLASS_9"`.
        overlays: [
          {
            providerOccurrenceId: "feat",
            targetDefinitionIds: [],
            targetName: "Longsword",
            targetType: "Weapon",
            field: "_PowerstatKeywords",
            listAddition: "wand implement?ID_FMP_CLASS_9",
          },
        ],
      },
    );
    const bonus = (id: string) =>
      sources(
        powers.find((power) => power.definitionId === id),
        "Longsword",
      );

    expect(bonus("WIZARD_POWER")).toEqual(["wand implement:damage"]);
    // BaseClass: a paragon path power counts as its path's class.
    expect(bonus("PATH_POWER")).toEqual(["wand implement:damage"]);
    expect(bonus("FIGHTER_POWER")).toEqual([]);
  });

  it("adds a paragon path power's ID and its '<class> Paragon Path' category (InsertParagonPath)", () => {
    const bolt = (id: string, classId: string) =>
      entity(id, `Synthetic ${id}`, "Power", {
        Keywords: "Arcane, Implement",
        Class: classId,
        "Attack Type": "Ranged 10",
        Attack: "Charisma vs. Reflex",
        Hit: "1d10 + Charisma modifier damage.",
      });
    const powers = rows(
      [
        entity("ID_FMP_CLASS_128", "Sorcerer", "Class", {}),
        entity("ID_FMP_CLASS_7", "Warlock", "Class", {}),
        entity(
          "ID_INTERNAL_CATEGORY_SORCERER_PARAGON_PATH",
          "Sorcerer Paragon Path",
          "Category",
          {},
        ),
        {
          ...entity(
            "ID_FMP_PARAGON_PATH_100",
            "Synthetic Path",
            "Paragon Path",
            {},
          ),
          prerequisites: "Sorcerer",
        },
        {
          ...entity(
            "ID_FMP_PARAGON_PATH_234",
            "Dragonbane Pactmaker",
            "Paragon Path",
            {},
          ),
          prerequisites: "Warlock",
        },
        bolt("SORCERER_POWER", "ID_FMP_CLASS_128"),
        bolt("SORCERER_PATH_POWER", "ID_FMP_PARAGON_PATH_100"),
        bolt("WARLOCK_PATH_POWER", "ID_FMP_PARAGON_PATH_234"),
      ],
      [],
      [
        // Sorcerous Power and Gloom Pact Reward.
        "ID_INTERNAL_CATEGORY_SORCERER_PARAGON_PATH:damage",
        "ID_FMP_PARAGON_PATH_234:damage",
      ],
    );
    const bonus = (id: string) =>
      sources(
        powers.find((power) => power.definitionId === id),
        "Unarmed",
      );

    expect(bonus("SORCERER_POWER")).toEqual([]);
    expect(bonus("SORCERER_PATH_POWER")).toEqual([
      "ID_INTERNAL_CATEGORY_SORCERER_PARAGON_PATH:damage",
    ]);
    // No "Warlock Paragon Path" record: only the path's own ID matches.
    expect(bonus("WARLOCK_PATH_POWER")).toEqual([
      "ID_FMP_PARAGON_PATH_234:damage",
    ]);
  });

  it("names a ki focus 'Ki Focuses Implement' (LootImplement), not its item type", () => {
    const [power] = rows(
      [
        implementPower,
        entity("FOCUS", "Synthetic Ki Focus +1", "Magic Item", {
          "Magic Item Type": "Ki Focus",
          Enhancement: "+1 attack rolls and damage rolls",
        }),
      ],
      [owned("focus", ["FOCUS"])],
      [
        "ki focuses implement,implement:attack",
        "ki focuses,implement:damage",
        "ki focus implement,implement:attack",
        "implement,ki focus:attack",
      ],
    );

    expect(sources(power, "Synthetic Ki Focus +1")).toEqual([
      "ki focuses implement,implement:attack",
      "ki focuses,implement:damage",
    ]);
  });

  it("makes mundane implement gear implement rows, and a staff a Quarterstaff", () => {
    const strike = entity("STRIKE", "Synthetic Strike", "Power", {
      Keywords: "Weapon",
      "Attack Type": "Melee weapon",
      Attack: "Strength vs. AC",
      Hit: "1[W] + Strength modifier damage.",
    });
    const powers = rows(
      [
        implementPower,
        strike,
        entity("ID_FMP_WEAPON_10", "Quarterstaff", "Weapon", {
          Damage: "1d8",
          "Proficiency Bonus": "2",
          "Weapon Category": "Simple Melee",
          Group: "Staff",
        }),
        entity("ROD", "Rod Implement", "Gear", { "Item Slot": "Off-hand" }),
        entity("OLD", "Implement, Totem", "Gear", { "Item Slot": "Off-hand" }),
        entity("STAFF", "Staff Implement", "Gear", { "Item Slot": "Off-hand" }),
        entity("PROF", "Implement Proficiency (Rod)", "Class Feature", {}),
      ],
      [owned("rod", ["ROD"]), owned("totem", ["OLD"], 0)],
      ["rod implement,implement:attack", "rod,implement:damage"],
      { activeDefinitionIds: ["BOLT", "STRIKE", "PROF"] },
    );
    const bolt = powers.find(({ definitionId }) => definitionId === "BOLT");
    const rod = bolt?.variants.find(
      ({ equipmentName }) => equipmentName === "Rod Implement",
    );

    expect(rod).toMatchObject({
      proficient: true,
      attackBonus: 5,
      damage: "1d6+5",
    });
    expect(
      bolt?.variants.find(
        ({ equipmentName }) => equipmentName === "Implement, Totem",
      )?.proficient,
    ).toBe(false);

    const staff = rows(
      [
        strike,
        entity("ID_FMP_WEAPON_10", "Quarterstaff", "Weapon", {
          Damage: "1d8",
          "Proficiency Bonus": "2",
          "Weapon Category": "Simple Melee",
          Group: "Staff",
        }),
        entity("STAFF", "Staff Implement", "Gear", { "Item Slot": "Off-hand" }),
      ],
      [owned("staff", ["STAFF"])],
      ["staff group,weapon:damage"],
    )[0]?.variants.find(
      ({ equipmentName }) => equipmentName === "Staff Implement",
    );
    // Native AddWeaponKeywords reads a staff main hand's group from the
    // Quarterstaff, so "staff group,weapon" applies (+1).
    expect(staff).toMatchObject({ weaponDamage: "1d8", damage: "1d8+4" });
  });

  it("adds '<group> implement group' and 'instrument implement' channels", () => {
    const [power] = rows(
      [
        implementPower,
        entity("ID_FMP_WEAPON_3", "Dagger", "Weapon", {
          Damage: "1d4",
          Group: "Light Blade",
          "Weapon Category": "Simple Melee",
        }),
        entity("SONG", "Synthetic Songblade +1", "Magic Item", {
          "Magic Item Type": "Weapon",
          Enhancement: "+1 attack rolls and damage rolls",
          _ImplementEquiv: "Instrument",
        }),
        entity("ACCURATE", "Accurate dagger", "Superior Implement", {
          WeaponEquiv: "ID_FMP_WEAPON_3",
        }),
      ],
      [
        owned("dagger", ["ID_FMP_WEAPON_3"]),
        owned("song", ["ID_FMP_WEAPON_3", "SONG"]),
        owned("accurate", ["ACCURATE"]),
      ],
      [
        "light blade implement group:attack",
        "instrument implement:attack",
        "dagger implement,implement:damage",
      ],
    );

    expect(sources(power, "Dagger")).toEqual([
      "light blade implement group:attack",
      "dagger implement,implement:damage",
    ]);
    expect(sources(power, "Synthetic Songblade Dagger +1")).toEqual([
      "light blade implement group:attack",
      "instrument implement:attack",
    ]);
    // A superior implement's ImplementType is its WeaponEquiv record.
    expect(sources(power, "Accurate dagger")).toEqual([
      "light blade implement group:attack",
      "dagger implement,implement:damage",
    ]);
  });

  it("adds 'melee weapon' or 'ranged weapon' to weapon power rows", () => {
    const [power] = rows(
      [
        entity("STRIKE", "Synthetic Shot", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee or Ranged weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + Strength modifier damage.",
        }),
        entity("SWORD", "Sword", "Weapon", {
          Damage: "1d8",
          "Weapon Category": "Military Melee",
        }),
        entity("BOW", "Bow", "Weapon", {
          Damage: "1d10",
          "Weapon Category": "Military Ranged",
          Range: "20/40",
        }),
      ],
      [owned("sword", ["SWORD"]), owned("bow", ["BOW"])],
      ["melee weapon:damage", "ranged weapon:damage"],
    );

    expect(sources(power, "Sword")).toEqual(["melee weapon:damage"]);
    expect(sources(power, "Bow")).toEqual(["ranged weapon:damage"]);
  });

  it("adds an augment version's _AugmentParent as a keyword", () => {
    const [power] = rows(
      [
        entity("AUGMENTED", "Synthetic Bolt (Augment 1)", "Power", {
          Keywords: "Psionic, Implement",
          "Attack Type": "Ranged 10",
          Attack: "Intelligence vs. Reflex",
          Hit: "1d6 + Intelligence modifier damage.",
          _AugmentParent: "PARENT",
        }),
      ],
      [],
      ["parent:damage"],
    );

    expect(sources(power, "Unarmed")).toEqual(["parent:damage"]);
  });

  it("adds 'multiclass' and 'multiclass feat' by the power's origin (FromMulticlassing)", () => {
    const entities = [
      implementPower,
      entity("MC", "Synthetic Initiate", "Feat", { type: "Multiclass" }),
      entity("ID_FMP_RACIAL_TRAIT_643", "Dilettante", "Racial Trait", {}),
    ];
    const evaluateFrom = (parent: string) =>
      sources(
        rows(entities, [], ["multiclass:damage", "multiclass feat:attack"], {
          occurrences: [
            {
              id: "parent",
              definitionId: parent,
              acquiredLevel: 1,
              kind: "root",
            },
            {
              id: "power",
              definitionId: "BOLT",
              acquiredLevel: 1,
              parentId: "parent",
              kind: "choice",
            },
          ],
        })[0],
        "Unarmed",
      );

    expect(evaluateFrom("MC")).toEqual([
      "multiclass feat:attack",
      "multiclass:damage",
    ]);
    expect(evaluateFrom("ID_FMP_RACIAL_TRAIT_643")).toEqual([
      "multiclass:damage",
    ]);
  });
});

describe("encounter uses (native RulesElementEncounterUses)", () => {
  const healingWordSpecial =
    "You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter.";
  const uses = (
    power: ContentEntity,
    level: number,
    overlays: Parameters<typeof evaluatePowers>[0]["overlays"] = [],
    stats: Record<string, EvaluatedStat> = {},
  ) =>
    evaluatePowers({
      level,
      activeDefinitionIds: [power.id],
      inventory: [],
      stats,
      overlays,
      entities: [power],
    })[0]?.encounterUses;

  it("gives a recovered 'twice per encounter' Special 2 uses, 3 from 16th level", () => {
    const word = entity("ID_FMP_POWER_1455", "Healing Word", "Power", {
      "Power Usage": "Encounter",
      Keywords: "Divine, Healing",
      Special: healingWordSpecial,
    });
    expect(uses(word, 15)).toBe(2);
    expect(uses(word, 16)).toBe(3);
    // Ardent Surge's Special breaks its line before "but only once" (D091).
    const surge = entity("ID_FMP_POWER_10273", "Ardent Surge", "Power", {
      "Power Usage": "Encounter",
      Special:
        "You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter,\n but only once per round.",
    });
    expect(uses(surge, 1)).toBe(2);
  });

  it("adds the overlaid _ADDITIONAL_USES field and the '<ID>_ADDITIONAL_USES' stat", () => {
    const rage = entity("ID_FMP_POWER_4807", "Rage Strike", "Power", {
      "Power Usage": "Daily",
      _ADDITIONAL_USES: "1",
    });
    expect(uses(rage, 5)).toBe(2);
    const reaping = entity("DARK_REAPING", "Dark Reaping", "Power", {
      "Power Usage": "Encounter",
    });
    expect(uses(reaping, 1)).toBeUndefined();
    // Reaping Renewal: `modify name="Dark Reaping" type="Power"
    // Field="_ADDITIONAL_USES" value="1"`.
    const renewal = [
      {
        providerOccurrenceId: "feat",
        targetDefinitionIds: ["DARK_REAPING"],
        targetName: "Dark Reaping",
        targetType: "Power",
        field: "_ADDITIONAL_USES",
        value: "1",
      },
    ];
    expect(uses(reaping, 1, renewal)).toBe(2);
    expect(
      uses(reaping, 1, renewal, {
        DARK_REAPING_ADDITIONAL_USES: stat("DARK_REAPING_ADDITIONAL_USES", 1),
      }),
    ).toBe(3);
  });

  it("counts Fight On's additional use on top of Inspiring Word's two (D091)", () => {
    const word = entity("ID_FMP_POWER_1590", "Inspiring Word", "Power", {
      "Power Usage": "Encounter",
      Special:
        "You can use this power twice per encounter, but only once per round. At 16th level, you can use inspiring word three times per encounter.",
    });
    // Fight On: `modify name="Inspiring Word" type="Power"
    // Field="_ADDITIONAL_USES" value="1"`.
    const fightOn = [
      {
        providerOccurrenceId: "feat",
        targetDefinitionIds: ["ID_FMP_POWER_1590"],
        targetName: "Inspiring Word",
        targetType: "Power",
        field: "_ADDITIONAL_USES",
        value: "1",
      },
    ];
    expect(uses(word, 1)).toBe(2);
    expect(uses(word, 1, fightOn)).toBe(3);
  });
});
