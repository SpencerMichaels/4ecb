import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";
import {
  beastCompanionStatistics,
  companionStatBonus,
  isBeastCompanionFields,
} from "./derived-values";

let ordinal = 0;
function rule(name: string, attributes: Record<string, string>): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal: ordinal++,
  };
}
const statadd = (name: string, value: string, extra = {}) =>
  rule("statadd", { name, value, ...extra });

function entity(
  id: string,
  name: string,
  type: string,
  options: {
    rules?: RuleStatement[];
    specifics?: Record<string, string>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([fieldName, value], index) => ({
        name: fieldName,
        value,
        extraAttributes: [],
        ordinal: index,
      }),
    ),
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

// Martial Power's bear (p. 39), as the content records it.
const bearFields = {
  Strength: "16",
  Constitution: "14",
  Dexterity: "12",
  Intelligence: "6",
  Wisdom: "12",
  Charisma: "6",
  "Attack Bonus": "2",
  Damage: "1d12",
  "Armor Class": "12",
  "Fortitude Defense": "14",
  "Reflex Defense": "10",
  "Will Defense": "12",
  "Hit Points at 1st Level": "16",
  "Hit Points per Level Gained": "10",
  Size: "Medium",
  Speed: "5",
  "Secondary Speed": "",
  Attack: "Claw",
  "Ability Score": "Strength",
  "Trained Skills": "SKILL_ATHLETICS, SKILL_ENDURANCE",
};

const content: ContentEntity[] = [
  entity("ROOT", "1", "Level", {
    rules: [
      ...ABILITIES.map((ability) =>
        statadd(`${ability} modifier`, `+ABILITYMOD(${ability})`),
      ),
      statadd("Hit Points", "+41"),
    ],
  }),
  entity("TIER_PARAGON", "Paragon Tier", "Tier"),
  entity("TIER_EPIC", "Epic Tier", "Tier"),
  entity("SKILL_ATHLETICS", "Athletics", "Skill", {
    specifics: { "Key Ability": "Strength" },
  }),
  entity("SKILL_ENDURANCE", "Endurance", "Skill", {
    specifics: { "Key Ability": "Constitution" },
  }),
  entity("SKILL_PERCEPTION", "Perception", "Skill", {
    specifics: { "Key Ability": "Wisdom" },
  }),
  entity("SKILL_STEALTH", "Stealth", "Skill", {
    specifics: { "Key Ability": "Dexterity" },
  }),
  entity("BEAST_MASTERY", "Beast Mastery", "Class Feature", {
    rules: ABILITIES.flatMap((ability) => [
      statadd(`Companion.${ability}`, "+1", { requires: "Paragon Tier" }),
      statadd(`Companion.${ability}`, "+1", { requires: "Epic Tier" }),
    ]),
  }),
  entity("BEAR", "Bear", "Companion", {
    specifics: bearFields,
    rules: [
      ...ABILITIES.map((ability) =>
        statadd(`Companion.${ability}`, `+${bearFields[ability]}`),
      ),
      rule("grant", { name: "BEAST_BASIC_ATTACK", type: "Power" }),
    ],
  }),
  ...ABILITIES.map((ability) =>
    entity(
      `INCREASE_${ability.toUpperCase()}`,
      ability,
      "Companion Ability Increase (Level 4)",
      {
        rules: [statadd(`Companion.${ability}`, "+1")],
      },
    ),
  ),
  entity("RESILIENT_BEAST", "Resilient Beast", "Feat", {
    rules: [
      statadd("BEAST.AC", "+2", { type: "Feat" }),
      statadd("BEAST.Fortitude Defense", "+2", { type: "Feat" }),
      statadd("BEAST.Reflex Defense", "+2", { type: "Feat" }),
      statadd("BEAST.Will Defense", "+2", { type: "Feat" }),
    ],
  }),
  entity("STURDY_BEAST", "Sturdy Beast", "Feat", {
    rules: [
      statadd("BEAST.Healing Surges", "+1"),
      statadd("BEAST.Hit Points", "+5"),
      statadd("BEAST.Hit Points", "+Wisdom modifier"),
    ],
  }),
  entity("HYBRID_BEAST_MASTERY", "Beast Mastery (Hybrid)", "Class Feature", {
    rules: [
      statadd("BEAST.attack rolls", "-1"),
      statadd("BEAST.AC", "-1"),
      statadd("BEAST.Fortitude Defense", "-1"),
      statadd("BEAST.Reflex Defense", "-1"),
      statadd("BEAST.Will Defense", "-1"),
    ],
  }),
  entity("NIMBLE_COMPANION", "Nimble Companion", "Feat", {
    rules: [
      statadd("BEAST.AC", "+2", { condition: "against opportunity attacks" }),
    ],
  }),
  entity("GUIDANCE", "Beast Guidance", "Feat", {
    rules: [statadd("BEAST.Stealth misc", "+2", { type: "Feat" })],
  }),
  entity("BEAST_BASIC_ATTACK", "Beast Melee Basic Attack", "Power", {
    specifics: {
      "Power Usage": "At-Will",
      Keywords: "Implement",
      "Action Type": "Standard action",
      "Attack Type": "Melee",
      Target: "One creature",
      Attack: "Beast's attack bonus vs. AC",
      Hit: "1[B] + beast's ability modifier damage.",
    },
  }),
  entity("PREDATOR_STRIKE", "Predator Strike", "Power", {
    specifics: {
      "Power Usage": "At-Will",
      Keywords: "Beast, Martial",
      "Action Type": "Standard action",
      "Attack Type": "Melee beast 1",
      Target: "One creature",
      Attack: "Beast's attack bonus vs. AC",
      Hit: "2[B] + beast's Strength modifier + your Wisdom modifier damage.",
    },
  }),
  entity("FEAT_PREDATOR", "Predatory Focus", "Feat", {
    rules: [statadd("PREDATOR_STRIKE:damage", "+2")],
  }),
];

const occurrence = (
  definitionId: string,
  acquiredLevel = 1,
): CharacterOccurrence => ({
  id: `own-${definitionId}`,
  definitionId,
  acquiredLevel,
  kind: definitionId === "ROOT" ? "root" : "choice",
});

/** The tier records the level records grant. */
const tiers = (level: number) => [
  ...(level >= 11 ? [occurrence("TIER_PARAGON", 11)] : []),
  ...(level >= 21 ? [occurrence("TIER_EPIC", 21)] : []),
];

function evaluate(level: number, extra: readonly string[] = []) {
  return evaluateCharacter(
    {
      level,
      baseAbilities: { Wisdom: 16, Constitution: 14 },
      occurrences: [
        occurrence("ROOT"),
        ...tiers(level),
        occurrence("BEAST_MASTERY"),
        occurrence("BEAR"),
        occurrence("BEAST_BASIC_ATTACK"),
        ...extra.map((id) => occurrence(id)),
      ],
      inventory: [],
    },
    content,
  );
}

describe("beast companion statistics", () => {
  it("is a beast stat block only with an attack bonus and a [B] die", () => {
    expect(isBeastCompanionFields(bearFields)).toBe(true);
    expect(isBeastCompanionFields({ Strength: "10" })).toBe(false);
    expect(isBeastCompanionFields({ "Attack Bonus": "2", Damage: " " })).toBe(
      false,
    );
  });

  it("follows the Martial Power formulas for a 1st-level bear", () => {
    const beast = evaluate(1).beastCompanion;
    expect(beast).toMatchObject({
      occurrenceId: "own-BEAR",
      definitionId: "BEAR",
      name: "Bear",
    });
    const statistics = beast!.statistics;
    expect(statistics.abilities.Strength).toEqual({ score: 16, modifier: 3 });
    expect(statistics.defenses).toEqual({
      ac: 13,
      fortitude: 15,
      reflex: 11,
      will: 13,
    });
    expect(statistics).toMatchObject({
      level: 1,
      hitPoints: 26,
      bloodied: 13,
      healingSurgeValue: 6,
      healingSurgesPerDay: 2,
      sharesHealingSurges: false,
      hitPointsFromMasterBloodied: false,
      speed: "5",
      vision: "Low-light",
      attackBonus: 3,
      damage: {
        die: "1d12",
        abilities: [{ ability: "Strength", owner: "beast", modifier: 3 }],
        modifier: 3,
        expression: "1d12+3",
      },
    });
    // Monster Manual / Player's Handbook p. 178: modifier + half level,
    // +5 trained.
    expect(statistics.skills).toEqual([
      {
        name: "Athletics",
        ability: "Strength",
        trained: true,
        bonus: 0,
        total: 8,
      },
      {
        name: "Endurance",
        ability: "Constitution",
        trained: true,
        bonus: 0,
        total: 7,
      },
    ]);
  });

  it("adds increases, tier bonuses and BEAST.* feats at 11th and 21st level", () => {
    const increases = [
      "INCREASE_STRENGTH",
      "INCREASE_CONSTITUTION",
      "INCREASE_STRENGTH",
      "INCREASE_WISDOM",
    ];
    const level11 = evaluateCharacter(
      {
        level: 11,
        baseAbilities: { Wisdom: 16 },
        occurrences: [
          occurrence("ROOT"),
          ...tiers(11),
          occurrence("BEAST_MASTERY"),
          occurrence("BEAR"),
          ...increases.map((id, index) => ({
            ...occurrence(id, index < 2 ? 4 : 8),
            id: `increase-${index}`,
          })),
          occurrence("RESILIENT_BEAST"),
          occurrence("STURDY_BEAST"),
          occurrence("NIMBLE_COMPANION"),
          occurrence("GUIDANCE"),
        ],
        inventory: [],
      },
      content,
    ).beastCompanion!.statistics;
    expect(
      Object.fromEntries(
        Object.entries(level11.abilities).map(([name, { score }]) => [
          name,
          score,
        ]),
      ),
    ).toEqual({
      Strength: 19,
      Constitution: 16,
      Dexterity: 13,
      Intelligence: 7,
      Wisdom: 14,
      Charisma: 7,
    });
    expect(level11.defenses).toEqual({
      ac: 25,
      fortitude: 27,
      reflex: 23,
      will: 25,
    });
    // 16 + 11 × 10, Sturdy Beast's 5 + your Wisdom modifier (+3).
    expect(level11).toMatchObject({
      hitPoints: 134,
      bloodied: 67,
      healingSurgeValue: 33,
      healingSurgesPerDay: 3,
      attackBonus: 13,
      damage: { expression: "1d12+4" },
    });
    expect(level11.skills).toContainEqual({
      name: "Athletics",
      ability: "Strength",
      trained: true,
      bonus: 0,
      total: 14,
    });
    // An untrained skill with a companion bonus is listed too.
    expect(level11.skills).toContainEqual({
      name: "Stealth",
      ability: "Dexterity",
      trained: false,
      bonus: 2,
      total: 8,
    });
    expect(level11.conditionalBonuses).toEqual([
      expect.objectContaining({
        stat: "AC",
        value: "+2",
        condition: "against opportunity attacks",
        source: "Nimble Companion",
      }),
    ]);
    expect(level11.contributions.map((entry) => entry.providerName)).toEqual(
      expect.arrayContaining(["Resilient Beast", "Sturdy Beast", "Bear"]),
    );

    const level21 = evaluate(21, ["HYBRID_BEAST_MASTERY"]).beastCompanion!
      .statistics;
    expect(level21.abilities.Strength.score).toBe(18);
    expect(level21.defenses).toEqual({
      ac: 32,
      fortitude: 34,
      reflex: 30,
      will: 32,
    });
    expect(level21).toMatchObject({ hitPoints: 226, attackBonus: 22 });
  });

  it("previews a candidate from its fields and the other companion bonuses", () => {
    const evaluation = evaluate(11);
    const candidate = beastCompanionStatistics({
      fields: { ...bearFields, Strength: "20" },
      stats: evaluation.stats,
      level: 11,
      candidate: { replacedProviderIds: ["own-BEAR"] },
    });
    // 20 + the paragon +1, without the chosen bear's own 16.
    expect(candidate.abilities.Strength.score).toBe(21);
  });

  it("gives the sentinel's companion your bloodied value and your surges", () => {
    const sentinel = beastCompanionStatistics({
      fields: {
        ...bearFields,
        "Hit Points at 1st Level": "",
        "Hit Points per Level Gained": "",
        "Attack Bonus": "5",
        "Ability Score": "your Wisdom + your Constitution",
        "Trained Skills": "Athletics, Endurance",
        "_Hit Points": "bloodied",
        // Paragon of the Natural Cycle's overlay.
        Damage: "1d12 + 2",
      },
      stats: {
        "Hit Points": { name: "Hit Points", value: 47, contributions: [] },
        "Wisdom modifier": {
          name: "Wisdom modifier",
          value: 3,
          contributions: [],
        },
        "Constitution modifier": {
          name: "Constitution modifier",
          value: 2,
          contributions: [],
        },
        "BEAST.Healing Surges": {
          name: "BEAST.Healing Surges",
          value: -2,
          contributions: [],
        },
      },
      level: 3,
    });
    expect(sentinel).toMatchObject({
      hitPoints: 23,
      hitPointsFromMasterBloodied: true,
      healingSurgesPerDay: 0,
      sharesHealingSurges: true,
      attackBonus: 8,
      damage: {
        abilities: [
          { ability: "Wisdom", owner: "master", modifier: 3 },
          { ability: "Constitution", owner: "master", modifier: 2 },
        ],
        die: "1d12",
        bonus: 2,
        expression: "1d12+7",
      },
    });
  });

  it("sums ALLY., COMPANION. and BEAST. bonuses", () => {
    const stat = (name: string, value: number) =>
      [name, { name, value, contributions: [] }] as const;
    expect(
      companionStatBonus(
        Object.fromEntries([
          stat("ALLY.AC", 1),
          stat("companion.ac", 1),
          stat("BEAST.AC", 2),
          stat("FAMILIAR.AC", 5),
        ]),
        "BEAST",
        "AC",
      ),
    ).toBe(4);
  });
});

describe("beast power numbers", () => {
  it("uses the beast's attack bonus, [B] die and ability modifiers", () => {
    const evaluation = evaluate(1, ["PREDATOR_STRIKE", "FEAT_PREDATOR"]);
    const basic = evaluation.powers.find(
      (power) => power.definitionId === "BEAST_BASIC_ATTACK",
    )!;
    expect(basic.unsupported).toEqual([]);
    expect(basic.variants).toHaveLength(1);
    expect(basic.variants[0]).toMatchObject({
      attacker: "beast",
      proficient: true,
      attackStat: "Beast",
      attackBonus: 3,
      damage: "1d12+3",
    });
    const strike = evaluation.powers.find(
      (power) => power.definitionId === "PREDATOR_STRIKE",
    )!;
    expect(strike.unsupported).toEqual([]);
    // 2[B] + beast's Strength (+3) + your Wisdom (+3) + Predatory Focus.
    expect(strike.variants[0]).toMatchObject({
      attackBonus: 3,
      damage: "2d12+8",
    });
    expect(strike.variants[0]!.attacks?.[0]).toMatchObject({
      attacker: "beast",
      attackBonus: 3,
      damage: "2d12+8",
    });
    expect(strike.variants[0]!.attacks?.[0]?.eligible).toBeUndefined();
  });

  it("flags beast powers without a chosen beast", () => {
    const evaluation = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [occurrence("ROOT"), occurrence("PREDATOR_STRIKE")],
        inventory: [],
      },
      content,
    );
    expect(evaluation.beastCompanion).toBeUndefined();
    expect(evaluation.powers[0]?.unsupported).toContain(
      "companion-ability:PREDATOR_STRIKE",
    );
  });
});
