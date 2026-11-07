import { describe, expect, it } from "vitest";
import { StatAccumulator, type StatContribution } from "@4ecb/rules-engine";
import {
  combinedConditionalModifiers,
  conditionalModifiers,
} from "./conditional-modifiers";

const SKILLS = [
  "Arcana",
  "Athletics",
  "History",
  "Intimidate",
  "Perception",
  "Stealth",
];

function project(
  additions: readonly Omit<StatContribution, "providerId">[],
  aliases: readonly (readonly [string, string])[] = [],
  equipment?: ConstructorParameters<typeof StatAccumulator>[0],
) {
  const accumulator = new StatAccumulator(equipment);
  for (const [name, alias] of aliases) accumulator.alias(name, alias);
  for (const addition of additions)
    accumulator.add({ ...addition, providerId: addition.id });
  const names = [
    ...new Set([
      ...accumulator.allNames(),
      ...aliases.flatMap(([name, alias]) => [name, alias]),
    ]),
  ];
  return conditionalModifiers(
    Object.fromEntries(names.map((name) => [name, accumulator.evaluate(name)])),
    SKILLS,
  );
}

describe("conditional modifier projection", () => {
  it("places each conditional bonus on the surface legacy showed it beside", () => {
    const modifiers = project([
      {
        id: "ac",
        stat: "AC",
        value: "+4",
        condition:
          "against opportunity attacks you provoke by making a ranged attack",
        providerName: "Hunter Fighting Style",
      },
      {
        id: "will",
        stat: "Will Defense",
        value: "+1",
        condition: "against attacks made by your oath of enmity target",
        providerName: "Blood Oath",
      },
      {
        id: "speed",
        stat: "Speed",
        value: "+4",
        bonusType: "Feat",
        condition: "when you charge or run in beast form and you are bloodied",
        providerName: "Cheetah's Speed",
      },
      {
        id: "init",
        stat: "Initiative Misc",
        value: "+2",
        condition: "when underground",
        providerName: "Stone Sense",
      },
      {
        id: "skill",
        stat: "Perception Misc",
        value: "+2",
        condition: "while you are shifting",
        providerName: "Shifter",
      },
      {
        id: "climb",
        stat: "Athletics checks to climb",
        value: "+5",
        bonusType: "Feat",
        condition: "while you are in beast form",
        providerName: "Scuttling Crawler Form",
      },
      {
        id: "escape",
        stat: "check:Escape",
        value: "+5",
        bonusType: "item",
        condition: "as part of the escape action",
        providerName: "Pitted Flowstone",
      },
      {
        id: "rush",
        stat: "bull rush",
        value: "+2",
        condition: "when you charge",
        providerName: "Powerful Charge",
      },
      {
        id: "surge",
        stat: "Healing Surge Value",
        value: "+2",
        condition: "when in range of the standard",
        providerName: "Standard",
      },
      {
        id: "surges",
        stat: "Healing Surges",
        value: "-2",
        condition: "when you are bloodied",
        providerName: "Drawback",
      },
    ]);
    expect(
      modifiers.map(({ surface, target, text, source }) => [
        surface,
        target,
        text,
        source,
      ]),
    ).toEqual([
      [
        "defenses",
        "AC",
        "+4 to AC against opportunity attacks you provoke by making a ranged attack",
        "Hunter Fighting Style",
      ],
      [
        "defenses",
        "Will",
        "+1 to Will against attacks made by your oath of enmity target",
        "Blood Oath",
      ],
      [
        "speed",
        "Speed",
        "+4 feat bonus to speed when you charge or run in beast form and you are bloodied",
        "Cheetah's Speed",
      ],
      [
        "initiative",
        "Initiative",
        "+2 to initiative when underground",
        "Stone Sense",
      ],
      [
        "skills",
        "Perception",
        "+2 to Perception checks while you are shifting",
        "Shifter",
      ],
      [
        "skills",
        "Athletics",
        "+5 feat bonus to Athletics checks to climb while you are in beast form",
        "Scuttling Crawler Form",
      ],
      [
        "checks",
        "Escape",
        "+5 item bonus to Escape checks as part of the escape action",
        "Pitted Flowstone",
      ],
      [
        "checks",
        "Bull rush",
        "+2 to bull rush when you charge",
        "Powerful Charge",
      ],
      [
        "health",
        "Healing Surge Value",
        "+2 to healing surge value when in range of the standard",
        "Standard",
      ],
      [
        "health",
        "Healing Surges",
        "-2 to healing surges when you are bloodied",
        "Drawback",
      ],
    ]);
    expect(modifiers[0]?.provenanceId).toBe("ac");
  });

  it("words ally-facing bonuses for the allies who gain them", () => {
    expect(
      project([
        {
          id: "ally-ac",
          stat: "ALLY.AC",
          value: "+1",
          condition: "against any creature marked by you",
          providerName: "Sideways Defense",
        },
        {
          id: "ally-stealth",
          stat: "ALLY.Stealth misc",
          value: "+2",
          condition: "within 5 squares",
          providerName: "Thieving Crew",
        },
        {
          id: "ally-damage",
          stat: "ALLY.damage rolls",
          value: "+1",
          condition: "against your quarry",
          providerName: "Group Quarry",
        },
        {
          id: "ally-saves",
          stat: "ALLY.Saving Throws",
          value: "+2",
          condition: "when bloodied",
          providerName: "Standard",
        },
        {
          id: "ally-resist",
          stat: "ALLY.resist:fire",
          value: "+5",
          bonusType: "resist",
          condition: "when the ally is adjacent to you",
          providerName: "Concordant Resistance",
        },
      ]).map(({ surface, target, text }) => [surface, target, text]),
    ).toEqual([
      [
        "allies",
        "AC",
        "Allies gain +1 to AC against any creature marked by you",
      ],
      [
        "allies",
        "Stealth",
        "Allies gain +2 to Stealth checks within 5 squares",
      ],
      [
        "allies",
        "damage rolls",
        "Allies gain +1 to damage rolls against your quarry",
      ],
      ["allies", "Saving throws", "Allies gain +2 to saves when bloodied"],
      [
        "allies",
        "Resist fire",
        "Allies gain resist 5 fire when the ally is adjacent to you",
      ],
    ]);
  });

  it("leaves unconditional, equipment-gated, zero and other surfaces' bonuses alone", () => {
    expect(
      project(
        [
          { id: "plain", stat: "AC", value: "+2", providerName: "Plain" },
          {
            id: "zero",
            stat: "Reflex Defense",
            value: "+0",
            condition: "when flanked",
            providerName: "Zero",
          },
          {
            id: "shield",
            stat: "AC",
            value: "+1",
            condition: "if the ally is adjacent to you",
            wearing: "armor:shield",
            providerName: "Phalanx",
          },
          {
            id: "save",
            stat: "Saving Throws",
            value: "+2",
            condition: "against fear",
            providerName: "Defensive trait",
          },
          {
            id: "attack",
            stat: "attack rolls",
            value: "+1",
            condition: "when you charge",
            providerName: "Power card",
          },
          {
            id: "beast",
            stat: "BEAST.AC",
            value: "+2",
            condition: "while adjacent to you",
            providerName: "Companion card",
          },
          {
            id: "typo",
            stat: "Acrobatis Misc",
            value: "+2",
            condition: "while dancing",
            providerName: "Unknown stat",
          },
        ],
        [],
        { items: [] },
      ),
    ).toEqual([]);
  });

  it("collapses aliases and zero / non-zero gated pairs to one entry", () => {
    expect(
      project(
        [
          {
            id: "alias",
            stat: "AC",
            value: "+4",
            condition: "against opportunity attacks",
            providerName: "Style",
          },
          {
            id: "gate-zero",
            stat: "check:Knowledge",
            value: "+3",
            bonusType: "item",
            zeroOnly: true,
            condition: "related to demons",
            providerName: "Tome",
          },
          {
            id: "gate-nonzero",
            stat: "check:Knowledge",
            value: "+3",
            bonusType: "item",
            nonZeroOnly: true,
            condition: "related to demons",
            providerName: "Tome",
          },
        ],
        [["AC", "Armor Class"]],
      ).map(({ text }) => text),
    ).toEqual([
      "+4 to AC against opportunity attacks",
      "+3 item bonus to Knowledge checks related to demons",
    ]);
  });
});

describe("combined conditional modifiers", () => {
  it("joins a source's same bonus to several defenses", () => {
    const defenses = ["AC", "Fortitude", "Reflex", "Will"];
    const modifiers = project([
      ...defenses.map((stat, index) => ({
        id: `majesty:${index}`,
        stat,
        value: "+1",
        condition: "against attacks made by bloodied creatures",
        providerName: "Majesty",
      })),
      ...["AC", "Will"].map((stat, index) => ({
        id: `cloak:${index}`,
        stat,
        value: "+2",
        bonusType: "Item",
        condition: "against ranged attacks",
        providerName: "Cloak",
      })),
      {
        id: "stride",
        stat: "Speed",
        value: "+2",
        condition: "when charging",
        providerName: "Stride",
      },
      {
        id: "other",
        stat: "Reflex",
        value: "+1",
        condition: "against attacks made by bloodied creatures",
        providerName: "Other source",
      },
    ]);
    expect(modifiers).toHaveLength(8);
    expect(
      combinedConditionalModifiers(modifiers).map(
        ({ target, text, source }) => [target, text, source],
      ),
    ).toEqual([
      [
        "AC, Fortitude, Reflex, Will",
        "+1 to all defenses against attacks made by bloodied creatures",
        "Majesty",
      ],
      [
        "AC, Will",
        "+2 item bonus to AC and Will against ranged attacks",
        "Cloak",
      ],
      [
        "Reflex",
        "+1 to Reflex against attacks made by bloodied creatures",
        "Other source",
      ],
      ["Speed", "+2 to speed when charging", "Stride"],
    ]);
  });
});

describe("combined conditional modifiers across skills", () => {
  const scarf = (stat: string, condition: string, index: number) => ({
    id: `scarf:${index}`,
    stat: `${stat} checks`,
    value: "+2",
    bonusType: "Item",
    condition,
    providerName: "Scarf of Reconciliation",
  });
  const drow = "while you have a drow ally within 10 squares of you";
  const eladrin = "while you have an eladrin ally within 10 squares of you";

  it("joins one source's same bonus to several skills, in row order", () => {
    const modifiers = project([
      scarf("Intimidate", drow, 0),
      scarf("Stealth", drow, 1),
      scarf("Arcana", eladrin, 2),
      scarf("History", eladrin, 3),
    ]);
    expect(modifiers).toHaveLength(4);
    expect(
      combinedConditionalModifiers(modifiers).map(
        ({ surface, target, text, source }) => [surface, target, text, source],
      ),
    ).toEqual([
      [
        "skills",
        "Intimidate, Stealth",
        `+2 item bonus to Intimidate and Stealth checks ${drow}`,
        "Scarf of Reconciliation",
      ],
      [
        "skills",
        "Arcana, History",
        `+2 item bonus to Arcana and History checks ${eladrin}`,
        "Scarf of Reconciliation",
      ],
    ]);
  });

  it("keeps rows apart that differ in amount, type, condition or source", () => {
    const modifiers = project([
      scarf("Stealth", drow, 0),
      { ...scarf("Perception", drow, 1), value: "+3" },
      { ...scarf("Athletics", drow, 2), bonusType: "Power" },
      scarf("Arcana", eladrin, 3),
      { ...scarf("History", drow, 4), providerName: "Other source" },
      {
        id: "pair",
        stat: "Intimidate checks",
        value: "+2",
        bonusType: "Item",
        condition: drow,
        providerName: "Scarf of Reconciliation",
      },
    ]);
    expect(
      combinedConditionalModifiers(modifiers).map(({ text, source }) => [
        text,
        source,
      ]),
    ).toEqual([
      [
        `+2 item bonus to Stealth and Intimidate checks ${drow}`,
        "Scarf of Reconciliation",
      ],
      [`+3 item bonus to Perception checks ${drow}`, "Scarf of Reconciliation"],
      [`+2 power bonus to Athletics checks ${drow}`, "Scarf of Reconciliation"],
      [`+2 item bonus to Arcana checks ${eladrin}`, "Scarf of Reconciliation"],
      [`+2 item bonus to History checks ${drow}`, "Other source"],
    ]);
  });
});
