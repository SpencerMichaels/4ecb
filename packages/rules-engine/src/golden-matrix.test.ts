import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  evaluateCharacter,
  type CharacterOccurrence,
  type EvaluationInput,
} from "./evaluator";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  options: {
    categories?: readonly string[];
    specifics?: Readonly<Record<string, string>>;
    rules?: readonly RuleStatement[];
    legality?: "rules-legal" | "houserule";
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public golden matrix",
    sources: ["Public golden matrix"],
    attributes:
      options.legality === undefined
        ? []
        : [{ name: "legality", value: options.legality }],
    categories: [...(options.categories ?? [])],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([fieldName, value], ordinal) => ({
        name: fieldName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: [...(options.rules ?? [])],
    description: "",
    extensions: [],
    provenance: { sourceKey: "golden", sourceOrdinal: 0 },
  };
}

function occurrence(
  definitionId: string,
  acquiredLevel: number,
  options: Partial<CharacterOccurrence> = {},
): CharacterOccurrence {
  return {
    id: `${definitionId}:${acquiredLevel}`,
    definitionId,
    acquiredLevel,
    kind: "grabbag",
    ...options,
  };
}

const derivedStats = entity("DERIVED", "Derived statistics", "Internal", {
  rules: [
    rule(
      "statadd",
      { name: "Strength modifier", value: "ABILITYMOD(Strength)" },
      0,
    ),
    rule(
      "statadd",
      { name: "Intelligence modifier", value: "ABILITYMOD(Intelligence)" },
      1,
    ),
    rule(
      "statadd",
      { name: "Wisdom modifier", value: "ABILITYMOD(Wisdom)" },
      2,
    ),
  ],
});

describe("representative public character goldens", () => {
  it("evaluates a heroic martial dual-weapon build", () => {
    const entities = [
      derivedStats,
      entity("HUMAN", "Human", "Race"),
      entity("FIGHTER", "Fighter", "Class"),
      entity("TEMPEST", "Tempest Fighter", "Build", {
        rules: [
          rule(
            "statadd",
            {
              name: "two-melee-weapon:damage",
              value: "+1",
              wearing: "DUAL-WIELDING:",
            },
            0,
          ),
        ],
      }),
      entity("MARTIAL", "Martial", "Power Source"),
      entity("STRIKE", "Twin-Weapon Strike", "Power", {
        specifics: {
          Keywords: "Martial, Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + Strength modifier damage.",
        },
      }),
      entity("SWORD", "Longsword", "Weapon", {
        specifics: {
          Damage: "1d8",
          "Proficiency Bonus": "3",
          Group: "Heavy Blade",
        },
      }),
      entity("DAGGER", "Dagger", "Weapon", {
        specifics: {
          Damage: "1d4",
          "Proficiency Bonus": "3",
          Group: "Light Blade",
          Properties: "Off-hand",
        },
      }),
    ];
    const input: EvaluationInput = {
      level: 5,
      baseAbilities: { Strength: 18 },
      occurrences: [
        occurrence("DERIVED", 1),
        occurrence("HUMAN", 1),
        occurrence("FIGHTER", 1),
        occurrence("TEMPEST", 1),
        occurrence("MARTIAL", 1),
        occurrence("STRIKE", 1),
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
          equippedQuantity: 1,
          acquiredLevel: 1,
        },
      ],
    };

    const result = evaluateCharacter(input, entities);
    expect(result).toMatchObject({ complete: true, legal: true });
    expect(result.activeDefinitionIds).toEqual(
      expect.arrayContaining(["HUMAN", "FIGHTER", "TEMPEST", "MARTIAL"]),
    );
    expect(result.stats["two-melee-weapon:damage"]?.value).toBe(1);
    expect(result.powers[0]?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentName: "Longsword",
          attackBonus: 9,
          damage: "1d8+5",
        }),
        expect.objectContaining({
          equipmentName: "Dagger",
          attackBonus: 9,
          damage: "1d4+5",
        }),
      ]),
    );
  });

  it("evaluates paragon psionic augment versions through a magic implement", () => {
    const entities = [
      derivedStats,
      entity("KALASHTAR", "Kalashtar", "Race"),
      entity("PSION", "Psion", "Class"),
      entity("TELEPATH", "Telepath", "Build"),
      entity("PSIONIC", "Psionic", "Power Source"),
      entity("FOCUS", "Implement Focus", "Feat", {
        rules: [rule("statadd", { name: "implement:attack", value: "+2" }, 0)],
      }),
      entity("THRUST", "Mind Thrust", "Power", {
        specifics: {
          Keywords: "Augmentable, Implement, Psionic",
          _AugmentVersions: "THRUST_0,THRUST_2",
        },
      }),
      entity("THRUST_0", "Mind Thrust (Augment 0)", "Power", {
        specifics: {
          Keywords: "Augmentable, Implement, Psionic",
          "Attack Type": "Ranged 10",
          Attack: "Intelligence vs. Will",
          Hit: "1d8 + Intelligence modifier psychic damage.",
        },
      }),
      entity("THRUST_2", "Mind Thrust (Augment 2)", "Power", {
        specifics: {
          Keywords: "Augmentable, Implement, Psionic",
          "Attack Type": "Ranged 10",
          Attack: "Intelligence vs. Will",
          Hit: "2d8 + Intelligence modifier psychic damage.",
        },
      }),
      entity("ORB", "Orb of Precision +3", "Magic Item", {
        specifics: {
          "Magic Item Type": "Orb",
          Enhancement: "+3 attack rolls and damage rolls",
        },
      }),
    ];
    const result = evaluateCharacter(
      {
        level: 15,
        baseAbilities: { Intelligence: 21 },
        occurrences: [
          occurrence("DERIVED", 1),
          occurrence("KALASHTAR", 1),
          occurrence("PSION", 1),
          occurrence("TELEPATH", 1),
          occurrence("PSIONIC", 1),
          occurrence("FOCUS", 11),
          occurrence("THRUST", 1),
        ],
        inventory: [
          {
            id: "orb",
            definitionIds: ["ORB"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 11,
          },
        ],
      },
      entities,
    );

    expect(result).toMatchObject({ complete: true, legal: true });
    expect(result.powers.map((power) => power.name)).toEqual([
      "Mind Thrust (Augment 0)",
      "Mind Thrust (Augment 2)",
    ]);
    expect(result.powers[1]?.variants[0]).toMatchObject({
      equipmentName: "Orb of Precision +3",
      attackBonus: 17,
      damage: "2d8+8",
    });
  });

  it("evaluates epic companion rules, retraining, and visible custom content", () => {
    const entities = [
      derivedStats,
      entity("WILDEN", "Wilden", "Race"),
      entity("SHAMAN", "Shaman", "Class"),
      entity("WORLD_SPEAKER", "World Speaker Shaman", "Build"),
      entity("PRIMAL", "Primal", "Power Source"),
      entity("SPIRIT", "World Speaker Spirit", "Companion", {
        rules: [
          rule("statadd", { name: "companion:Fortitude", value: "+2" }, 0),
        ],
      }),
      entity("OLD_FEAT", "Heroic Insight", "Feat", {
        rules: [rule("statadd", { name: "Will", value: "+1" }, 0)],
      }),
      entity("NEW_FEAT", "Epic Insight", "Feat", {
        rules: [rule("statadd", { name: "Will", value: "+2" }, 0)],
      }),
      entity("CUSTOM", "Campaign Boon", "Feat", {
        legality: "houserule",
        rules: [rule("statadd", { name: "Speed", value: "+1" }, 0)],
      }),
      entity("CALL", "Call the Ancient", "Power", {
        specifics: {
          Keywords: "Implement, Primal",
          "Attack Type": "Close burst 2",
          Attack: "Wisdom vs. Fortitude",
          Hit: "1d8 + Wisdom modifier damage.\nLevel 21: 2d8 + Wisdom modifier damage.",
        },
      }),
      entity("TOTEM", "Totem of the World Tree +6", "Magic Item", {
        specifics: {
          "Magic Item Type": "Totem",
          Enhancement: "+6 attack rolls and damage rolls",
        },
      }),
    ];
    const result = evaluateCharacter(
      {
        level: 25,
        baseAbilities: { Wisdom: 22 },
        occurrences: [
          occurrence("DERIVED", 1),
          occurrence("WILDEN", 1),
          occurrence("SHAMAN", 1),
          occurrence("WORLD_SPEAKER", 1),
          occurrence("PRIMAL", 1),
          occurrence("SPIRIT", 1),
          occurrence("OLD_FEAT", 1, { id: "old-feat" }),
          occurrence("NEW_FEAT", 21, {
            id: "new-feat",
            replacesId: "old-feat",
          }),
          occurrence("CUSTOM", 25, { legality: "houserule" }),
          occurrence("CALL", 25),
        ],
        inventory: [
          {
            id: "totem",
            definitionIds: ["TOTEM"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 21,
          },
        ],
      },
      entities,
    );

    expect(result).toMatchObject({ complete: true, legal: false });
    expect(result.activeDefinitionIds).not.toContain("OLD_FEAT");
    expect(result.stats.Will?.value).toBe(2);
    expect(result.stats["companion:Fortitude"]?.value).toBe(2);
    expect(result.stats.Speed?.value).toBe(1);
    expect(result.powers[0]?.variants[0]).toMatchObject({
      equipmentName: "Totem of the World Tree +6",
      attackBonus: 24,
      damage: "2d8+12",
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "occurrence.houserule" }),
    );
  });
});
