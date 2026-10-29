import { describe, expect, it } from "vitest";

import {
  ASSOCIATE_STAT_BLOCK_FIELD,
  ASSOCIATE_STAT_BLOCK_VERSION,
  type AssociateStatBlock,
  type ContentEntity,
  type RuleStatement,
} from "@4ecb/content-domain";

import { evaluateAssociates } from "./associates";
import { associateStatistics } from "./derived-values";
import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";
import type { EvaluatedStat } from "./stats";

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

const stat = (name: string, value: number): EvaluatedStat => ({
  name,
  value,
  contributions: [],
});
const stats = (values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, stat(name, value)]),
  );

// A fey beast companion in the Heroes of the Feywild format: defenses add
// your level, the bite steps up at 21st level.
const houndBlock: AssociateStatBlock = {
  version: ASSOCIATE_STAT_BLOCK_VERSION,
  role: "Fey Beast Companion",
  size: "Medium",
  creatureType: "fey beast",
  hitPoints: { kind: "master-bloodied" },
  defenses: {
    kind: "level",
    base: { ac: 15, fortitude: 13, reflex: 13, will: 13 },
  },
  initiative: { bonus: 0 },
  perception: { bonus: 2 },
  speed: "7",
  traits: [],
  powers: [
    {
      name: "Bite",
      action: "Standard",
      usage: "At-Will",
      lines: [
        {
          label: "Attack",
          text: "Melee 1 (one creature); your level + 5 vs. AC",
          attack: {
            range: "Melee 1 (one creature)",
            bonus: { kind: "level", plus: 5 },
            defense: "AC",
          },
        },
        {
          label: "Hit",
          text: "1d8 + one-half your level damage, and it teleports.",
          damage: {
            terms: [{ kind: "dice", dice: "1d8" }, { kind: "half-level" }],
          },
          rest: ", and it teleports.",
          steps: [
            {
              level: 21,
              damage: {
                terms: [{ kind: "dice", dice: "2d8" }, { kind: "half-level" }],
              },
            },
          ],
        },
      ],
    },
  ],
  abilities: {
    Strength: 14,
    Constitution: 17,
    Dexterity: 20,
    Intelligence: 2,
    Wisdom: 14,
    Charisma: 6,
  },
};

// A summoned creature in the Heroes of the Elemental Chaos format.
const spiritBlock: AssociateStatBlock = {
  version: ASSOCIATE_STAT_BLOCK_VERSION,
  role: "Summoned Creature",
  hitPoints: { kind: "master-surge-value" },
  defenses: {
    kind: "master",
    bonus: { ac: 2, fortitude: 0, reflex: 2, will: 0 },
  },
  traits: [],
  powers: [
    {
      name: "Standard Action",
      action: "Standard",
      lines: [
        {
          label: "Attack",
          text: "",
          attack: {
            range: "Melee 2 (one creature)",
            bonus: { kind: "level", plus: 7 },
            defense: "Reflex",
          },
        },
        {
          label: "Hit",
          text: "",
          damage: {
            terms: [{ kind: "dice", dice: "2d6" }, { kind: "highest-ability" }],
            damageType: "fire",
          },
          rest: ".",
        },
        {
          label: "Hit",
          text: "",
          damage: {
            terms: [
              { kind: "dice", dice: "2d6" },
              { kind: "ability", abilities: ["Strength", "Charisma"] },
            ],
          },
          rest: ".",
        },
      ],
    },
  ],
};

const master = (level: number) =>
  stats({
    "Hit Points": 20 + level * 6,
    "Healing Surge Value": 1,
    AC: 16 + level,
    "Fortitude Defense": 14 + level,
    "Reflex Defense": 13 + level,
    "Will Defense": 15 + level,
    Initiative: 3 + Math.floor(level / 2),
    Perception: 6 + Math.floor(level / 2),
    "Strength modifier": 1,
    "Constitution modifier": 2,
    "Dexterity modifier": 3,
    "Intelligence modifier": 0,
    "Wisdom modifier": 4,
    "Charisma modifier": 2,
  });

describe("associate statistics", () => {
  it.each([
    // level, HP (your bloodied value), AC/F/R/W (base + level), init, perc,
    // attack (level + 5), damage
    [4, 22, [19, 17, 17, 17], 5, 10, 9, "1d8 + 2"],
    [12, 46, [27, 25, 25, 25], 9, 14, 17, "1d8 + 6"],
    [21, 73, [36, 34, 34, 34], 13, 18, 26, "2d8 + 10"],
  ] as const)(
    "works out a level-scaled companion at level %i",
    (level, hp, [ac, fortitude, reflex, will], init, perc, attack, damage) => {
      const statistics = associateStatistics({
        block: houndBlock,
        stats: master(level),
        level,
      });
      expect(statistics).toMatchObject({
        hitPoints: hp,
        hitPointsSource: "master-bloodied",
        bloodied: Math.floor(hp / 2),
        defenses: { ac, fortitude, reflex, will },
        initiative: init,
        perception: perc,
      });
      expect(statistics.abilities?.Dexterity).toEqual({
        score: 20,
        modifier: 5,
      });
      expect(statistics.powers[0]?.lines).toEqual([
        {
          label: "Attack",
          text: `Melee 1 (one creature); +${attack} vs. AC`,
          attackBonus: attack,
          defense: "AC",
        },
        {
          label: "Hit",
          text: `${damage} damage, and it teleports.`,
          damage,
        },
      ]);
    },
  );

  it("uses its master's defenses and the summoned-creature bonuses", () => {
    const statistics = associateStatistics({
      block: spiritBlock,
      stats: {
        ...master(10),
        // "your Strength or Charisma modifier": the higher score wins.
        Strength: stat("Strength", 13),
        Charisma: stat("Charisma", 14),
        "SUMMON.AC": stat("SUMMON.AC", 1),
        "SUMMON.damage": stat("SUMMON.damage", 2),
      },
      level: 10,
    });
    // Healing surge value: 80 / 4 + 1.
    expect(statistics.hitPoints).toBe(21);
    expect(statistics.hitPointsSource).toBe("master-surge-value");
    expect(statistics.defenses).toEqual({
      ac: 26 + 2 + 1,
      fortitude: 24,
      reflex: 23 + 2,
      will: 25,
    });
    expect(statistics.initiative).toBeUndefined();
    expect(statistics.powers[0]?.lines.map(({ text }) => text)).toEqual([
      "Melee 2 (one creature); +17 vs. Reflex",
      // Highest modifier (Wisdom +4) and Alien Summoning's +2.
      "2d6 + 6 fire damage.",
      // Native MultipleAbilityChoices: the highest score (Charisma 14,
      // modifier +2) and Alien Summoning's +2.
      "2d6 + 4 damage.",
    ]);
  });

  it("keeps a fixed-level creature's own numbers", () => {
    const statistics = associateStatistics({
      block: {
        ...spiritBlock,
        role: "Summoned Creature",
        level: 9,
        hitPoints: { kind: "fixed", value: 30 },
        defenses: {
          kind: "fixed",
          values: { ac: 23, fortitude: 21, reflex: 20, will: 19 },
        },
        powers: [
          {
            name: "Standard Action",
            action: "Standard",
            lines: [
              {
                label: "Attack",
                text: "",
                attack: {
                  range: "Melee 1 (one creature)",
                  bonus: { kind: "fixed", value: 14 },
                  defense: "AC",
                },
              },
            ],
          },
        ],
      },
      stats: master(20),
      level: 20,
    });
    expect(statistics.hitPoints).toBe(30);
    expect(statistics.defenses.ac).toBe(23);
    expect(statistics.powers[0]?.lines[0]?.attackBonus).toBe(14);
  });
});

describe("evaluated associates", () => {
  const hound = entity("ASSOCIATE_HOUND", "Trained Moss Hound", "Associate", {
    specifics: {
      "_Associated Power": "POWER_X",
      [ASSOCIATE_STAT_BLOCK_FIELD]: JSON.stringify(houndBlock),
    },
  });
  const content: ContentEntity[] = [
    entity("ROOT", "1", "Level", {
      rules: [statadd("Hit Points", "+46"), statadd("AC", "+27")],
    }),
    // The inert community card carries the FREEBEE (9F-associates.part).
    entity("CARD", "Trained Moss Hound", "Internal", {
      rules: [statadd("FREEBEE:ASSOCIATE_HOUND", "+1")],
    }),
    entity("TAMER", "Moss Hound Tamer", "Class Feature", {
      rules: [rule("grant", { name: "CARD", type: "Power" })],
    }),
    hound,
    // A pack built before D107 has no stat block field.
    entity("ASSOCIATE_OLD", "Old Associate", "Associate"),
    entity("OLD_GIVER", "Old Giver", "Class Feature", {
      rules: [statadd("FREEBEE:ASSOCIATE_OLD", "+1")],
    }),
  ];
  const occurrence = (definitionId: string): CharacterOccurrence => ({
    id: `own-${definitionId}`,
    definitionId,
    acquiredLevel: 1,
    kind: definitionId === "ROOT" ? "root" : "choice",
  });

  it("gives the associates a FREEBEE stat names, with their numbers", () => {
    const evaluated = evaluateCharacter(
      {
        level: 12,
        baseAbilities: {},
        occurrences: [
          occurrence("ROOT"),
          occurrence("TAMER"),
          occurrence("OLD_GIVER"),
        ],
        inventory: [],
      },
      content,
    );
    expect(
      evaluated.associates?.map(({ definitionId }) => definitionId),
    ).toEqual(["ASSOCIATE_HOUND"]);
    const [associate] = evaluated.associates ?? [];
    expect(associate?.statistics.hitPoints).toBe(23);
    expect(associate?.statistics.defenses.ac).toBe(27);
    expect(associate?.providerIds).toHaveLength(1);
  });

  it("has none without a FREEBEE", () => {
    expect(
      evaluateAssociates({
        level: 5,
        occurrences: [],
        stats: { "FREEBEE:ASSOCIATE_HOUND": stat("x", 0) },
        content: { get: (id) => (id === hound.id ? hound : undefined) },
      }),
    ).toEqual([]);
  });
});
