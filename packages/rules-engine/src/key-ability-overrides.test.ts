import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import type { CharacterOccurrence, FieldOverlay } from "./evaluator";
import { canonicalAbility } from "./key-ability-overrides";
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

function abilities(
  scores: Partial<Record<string, number>>,
): Record<string, EvaluatedStat> {
  return Object.fromEntries(
    [
      "Strength",
      "Constitution",
      "Dexterity",
      "Intelligence",
      "Wisdom",
      "Charisma",
    ].flatMap((ability) => {
      const score = scores[ability] ?? 10;
      const modifier = Math.floor((score - 10) / 2);
      return [
        [ability, { name: ability, value: score, contributions: [] }],
        [
          `${ability} modifier`,
          { name: `${ability} modifier`, value: modifier, contributions: [] },
        ],
      ];
    }),
  );
}

const meleeBasic = entity(
  "ID_INTERNAL_POWER_MELEE_BASIC_ATTACK",
  "Melee Basic Attack",
  "Power",
  {
    Keywords: "Weapon",
    "Attack Type": "Melee weapon",
    Attack: "Strength vs. AC",
    Hit: "1[W] + Strength modifier damage.",
  },
);
const longsword = entity("LONGSWORD", "Longsword", "Weapon", {
  Damage: "1d8",
  "Proficiency Bonus": "3",
  "Weapon Category": "Military Melee",
  Group: "Heavy Blade",
});
const proficiency = entity(
  "PROF_LONGSWORD",
  "Weapon Proficiency (Longsword)",
  "Proficiency",
  {},
);
const otherProficiency = entity(
  "PROF_DAGGER",
  "Weapon Proficiency (Dagger)",
  "Proficiency",
  {},
);
const sword = {
  id: "sword",
  definitionIds: ["LONGSWORD"],
  quantity: 1,
  equippedQuantity: 1,
  acquiredLevel: 1,
};

function evaluate(input: {
  readonly powers: readonly ContentEntity[];
  readonly entities?: readonly ContentEntity[];
  readonly activeIds?: readonly string[];
  readonly scores: Partial<Record<string, number>>;
  readonly textStrings?: Record<string, string>;
  readonly overlays?: readonly FieldOverlay[];
  readonly occurrences?: readonly CharacterOccurrence[];
  readonly weapon?: boolean;
}) {
  return evaluatePowers({
    level: 2,
    activeDefinitionIds: [
      ...input.powers.map(({ id }) => id),
      ...(input.activeIds ?? []),
    ],
    entities: [...input.powers, longsword, ...(input.entities ?? [])],
    inventory: input.weapon === false ? [] : [sword],
    stats: abilities(input.scores),
    overlays: input.overlays ?? [],
    textStrings: input.textStrings ?? {},
    ...(input.occurrences === undefined
      ? {}
      : { occurrences: input.occurrences }),
  });
}

function row(
  powers: ReturnType<typeof evaluate>,
  power: string,
  equipment: string,
) {
  const variant = powers
    .find(({ name }) => name === power)
    ?.variants.find(({ equipmentName }) => equipmentName === equipment);
  return {
    attackStat: variant?.attackStat,
    damage: variant?.damageComponents
      .filter(({ label }) => label.endsWith("modifier"))
      .map(({ label, value }) => `${label} ${value}`),
  };
}

describe("native key-ability overrides (OverrideStat)", () => {
  it("reads melee-basic text strings, gated by a melee weapon, and moves damage with the attack", () => {
    const powers = evaluate({
      powers: [meleeBasic],
      entities: [proficiency],
      activeIds: ["PROF_LONGSWORD"],
      scores: { Strength: 10, Intelligence: 18 },
      // Intelligent Blademaster: the three-letter stat alias.
      textStrings: { "melee basic,melee weapon:key ability": "int" },
    });
    expect(row(powers, "Melee Basic Attack", "Longsword")).toEqual({
      attackStat: "Intelligence",
      damage: ["Intelligence modifier 4"],
    });
    // Unarmed is no melee weapon (native WeaponBase is null).
    expect(row(powers, "Melee Basic Attack", "Unarmed").attackStat).toBe(
      "Strength",
    );
  });

  it("keeps the line's ability when a listed one is not higher", () => {
    const powers = evaluate({
      powers: [meleeBasic],
      scores: { Strength: 16, Dexterity: 14 },
      textStrings: { "melee basic:key ability": "Strength,Dexterity" },
    });
    expect(row(powers, "Melee Basic Attack", "Longsword").attackStat).toBe(
      "Strength",
    );
  });

  it("needs a proficient weapon for a starred ability and halves HALF-DMG damage", () => {
    const textStrings = {
      "melee basic:key ability": "HALF-DMG:Intelligence*",
    };
    const proficient = evaluate({
      powers: [meleeBasic],
      entities: [proficiency],
      activeIds: ["PROF_LONGSWORD"],
      scores: { Strength: 10, Intelligence: 19 },
      textStrings,
    });
    expect(row(proficient, "Melee Basic Attack", "Longsword")).toEqual({
      attackStat: "Intelligence",
      damage: ["half Intelligence modifier 2"],
    });
    const unproficient = evaluate({
      powers: [meleeBasic],
      entities: [otherProficiency],
      activeIds: ["PROF_DAGGER"],
      scores: { Strength: 10, Intelligence: 19 },
      textStrings,
    });
    expect(
      row(unproficient, "Melee Basic Attack", "Longsword").attackStat,
    ).toBe("Strength");
  });

  it("halves the damage of Melee Training's own overlaid attack line", () => {
    // Melee Training also rewrites the attack and hit lines, so its list
    // never picks (Intelligence is not higher than itself); native still
    // sets the damage flags when it reads the HALF-DMG list.
    const powers = evaluate({
      powers: [meleeBasic],
      scores: { Strength: 10, Intelligence: 20 },
      textStrings: { "melee basic:key ability": "HALF-DMG:Intelligence*" },
      overlays: [
        {
          providerOccurrenceId: "feat",
          targetDefinitionIds: [meleeBasic.id],
          field: "Attack",
          value: "Intelligence vs. AC",
        },
        {
          providerOccurrenceId: "feat",
          targetDefinitionIds: [meleeBasic.id],
          field: "Hit",
          value: "1[W] + half Intelligence modifier damage.",
        },
      ],
      weapon: false,
    });
    expect(row(powers, "Melee Basic Attack", "Unarmed")).toEqual({
      attackStat: "Intelligence",
      damage: ["half Intelligence modifier 2"],
    });
  });

  it("forces a `!` ability keyed by power id, including through _KeyAbilityAs", () => {
    const breath = entity("BREATH", "Dragon Breath", "Power", {
      "Attack Type": "Close blast 3",
      Attack:
        "Strength +2 vs. Reflex, Constitution +2 vs. Reflex, or Dexterity +2 vs. Reflex",
      Hit: "1d6 + Constitution modifier damage.",
    });
    const wrath = entity("WRATH", "Dragon's Wrath", "Power", {
      "Attack Type": "Close blast 3",
      Attack: "Strength vs. Reflex, Constitution vs. Reflex, or Dexterity",
      Hit: "2d6 + Constitution modifier damage.",
      _KeyAbilityAs: "BREATH",
    });
    const powers = evaluate({
      powers: [breath, wrath],
      scores: { Strength: 12, Constitution: 14, Dexterity: 18 },
      textStrings: { "BREATH:key ability": "Strength!" },
      weapon: false,
    });
    for (const name of ["Dragon Breath", "Dragon's Wrath"])
      expect(row(powers, name, "Unarmed")).toEqual({
        attackStat: "Strength",
        damage: ["Strength modifier 1"],
      });
  });

  it("reads `<feat> association` text strings for the power's _Associated Feats", () => {
    const power = entity("ASSOC", "Associated strike", "Power", {
      Keywords: "Weapon",
      "Attack Type": "Melee weapon",
      Attack: "Strength vs. AC",
      Hit: "1[W] + Strength modifier damage.",
      "_Associated Feats": "FEAT_A, FEAT_B",
    });
    const powers = evaluate({
      powers: [power],
      scores: { Strength: 12, Dexterity: 16 },
      textStrings: { "FEAT_B association:key ability": "DMG:Dex" },
    });
    expect(row(powers, "Associated strike", "Longsword")).toEqual({
      attackStat: "Dexterity",
      damage: ["Dexterity modifier 3"],
    });
  });

  it("reads the power's and the granting element's Key Ability fields, attack only without DMG:", () => {
    const power = entity("GRANTED", "Granted strike", "Power", {
      "Attack Type": "Melee touch",
      Attack: "Strength vs. Reflex",
      Hit: "1d8 + Strength modifier damage.",
    });
    const item = entity("ITEM", "Artifact", "Magic Item", {
      "Key Ability": "Intelligence,Wisdom,Charisma",
    });
    const occurrences: CharacterOccurrence[] = [
      { id: "item", definitionId: "ITEM", acquiredLevel: 1, kind: "root" },
      {
        id: "granted",
        definitionId: "GRANTED",
        acquiredLevel: 1,
        parentId: "item",
        ruleOrdinal: 0,
        kind: "grant",
      },
    ];
    const fromGrantor = evaluate({
      powers: [power],
      entities: [item],
      activeIds: ["ITEM"],
      scores: { Strength: 10, Wisdom: 16, Charisma: 14 },
      occurrences,
      weapon: false,
    });
    expect(row(fromGrantor, "Granted strike", "Unarmed")).toEqual({
      attackStat: "Wisdom",
      damage: ["Strength modifier 0"],
    });
    // Unexpected Flourish: a `modify` of the chosen power's Key Ability.
    const flourish = evaluate({
      powers: [power],
      scores: { Strength: 10, Constitution: 17 },
      overlays: [
        {
          providerOccurrenceId: "feat",
          targetDefinitionIds: ["GRANTED"],
          field: "Key Ability",
          value: "DMG:Str,Con,Dex,Int,Wis,Cha",
        },
      ],
      weapon: false,
    });
    expect(row(flourish, "Granted strike", "Unarmed")).toEqual({
      attackStat: "Constitution",
      damage: ["Constitution modifier 3"],
    });
  });

  it("applies dilettante and multiclass overrides by where the power came from", () => {
    const power = entity("OUT", "Out-of-class strike", "Power", {
      "Attack Type": "Ranged 10",
      Attack: "Wisdom vs. Will",
      Hit: "1d6 + Wisdom modifier damage.",
    });
    const dilettante = entity(
      "ID_FMP_RACIAL_TRAIT_643",
      "Dilettante",
      "Racial Trait",
      {},
    );
    const multiclassFeat = entity("MC", "Initiate feat", "Feat", {
      type: "Multiclass",
    });
    const textStrings = {
      "dilettante:key ability": "Con,Wis,Cha",
      "multiclass:key ability": "charisma",
    };
    const from = (parent: string) => [
      {
        id: "parent",
        definitionId: parent,
        acquiredLevel: 1,
        kind: "root" as const,
      },
      {
        id: "power",
        definitionId: "OUT",
        acquiredLevel: 1,
        parentId: "parent",
        ruleOrdinal: 0,
        kind: "choice" as const,
      },
    ];
    const scores = { Wisdom: 12, Constitution: 14, Charisma: 16 };
    // Dilettante comes first and moves the damage too.
    expect(
      row(
        evaluate({
          powers: [power],
          entities: [dilettante],
          scores,
          textStrings,
          occurrences: from("ID_FMP_RACIAL_TRAIT_643"),
          weapon: false,
        }),
        "Out-of-class strike",
        "Unarmed",
      ),
    ).toEqual({ attackStat: "Charisma", damage: ["Charisma modifier 3"] });
    // A multiclass feat's power: attack only.
    expect(
      row(
        evaluate({
          powers: [power],
          entities: [multiclassFeat],
          scores,
          textStrings,
          occurrences: from("MC"),
          weapon: false,
        }),
        "Out-of-class strike",
        "Unarmed",
      ),
    ).toEqual({ attackStat: "Charisma", damage: ["Wisdom modifier 1"] });
    // Neither origin: no override.
    expect(
      row(
        evaluate({ powers: [power], scores, textStrings, weapon: false }),
        "Out-of-class strike",
        "Unarmed",
      ).attackStat,
    ).toBe("Wisdom");
  });

  it("tries martial melee first, before a power-id override", () => {
    const power = entity("MARTIAL", "Martial strike", "Power", {
      Keywords: "Martial, Weapon",
      "Attack Type": "Melee weapon",
      Attack: "Strength vs. AC",
      Hit: "1[W] + Strength modifier damage.",
    });
    const powers = evaluate({
      powers: [power],
      scores: { Strength: 10, Wisdom: 18, Charisma: 14 },
      textStrings: {
        "martial,melee:key ability": "Charisma",
        "MARTIAL:key ability": "Wisdom",
      },
    });
    expect(row(powers, "Martial strike", "Longsword")).toEqual({
      attackStat: "Charisma",
      damage: ["Charisma modifier 2"],
    });
  });

  it("wins over the `<power> <ability>` choice element", () => {
    const power = entity("CHOSEN", "Chosen strike", "Power", {
      "Attack Type": "Ranged 10",
      Attack: "Strength or Dexterity vs. Reflex",
      Hit: "1d6 + Strength or Dexterity modifier damage.",
    });
    const choice = entity(
      "CHOICE",
      "Chosen strike Dexterity",
      "Class Feature",
      {},
    );
    const powers = evaluate({
      powers: [power],
      entities: [choice],
      activeIds: ["CHOICE"],
      scores: { Strength: 14, Dexterity: 12, Wisdom: 16 },
      textStrings: { "CHOSEN:key ability": "Wisdom" },
      weapon: false,
    });
    expect(row(powers, "Chosen strike", "Unarmed")).toEqual({
      attackStat: "Wisdom",
      damage: ["Wisdom modifier 3"],
    });
    const choiceOnly = evaluate({
      powers: [power],
      entities: [choice],
      activeIds: ["CHOICE"],
      scores: { Strength: 14, Dexterity: 12 },
      weapon: false,
    });
    expect(row(choiceOnly, "Chosen strike", "Unarmed").attackStat).toBe(
      "Dexterity",
    );
  });

  it("names abilities by full name or statalias", () => {
    expect(canonicalAbility("dex")).toBe("Dexterity");
    expect(canonicalAbility("Charisma")).toBe("Charisma");
    expect(canonicalAbility("in")).toBeUndefined();
  });
});
