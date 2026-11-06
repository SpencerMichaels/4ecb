import { describe, expect, it } from "vitest";
import {
  NOTE_VALUES_FIELD,
  NOTE_VALUES_VERSION,
  type ContentEntity,
  type NoteSegment,
  type RuleStatement,
} from "@4ecb/content-domain";
import type { EvaluatedStat } from "@4ecb/rules-engine";

import { buildSheetModel } from "./index";
import { withSheetOverview } from "./overview";

/** A feature as the pack stores it: its note and, when the pack build
 *  parsed values out of the note, the `_Note Values IR` field (D112). */
function feature(
  id: string,
  name: string,
  type: string,
  summary: string,
  description: string,
  options: {
    readonly segments?: readonly NoteSegment[];
    readonly statadds?: readonly (readonly [string, string])[];
  } = {},
): ContentEntity {
  const rules: RuleStatement[] = (options.statadds ?? []).map(
    ([stat, value], ordinal) => ({
      name: "statadd",
      attributes: [
        { name: "name", value: stat },
        { name: "value", value },
      ],
      text: "",
      children: [],
      ordinal,
    }),
  );
  return {
    id,
    name,
    type,
    source: "Synthetic source",
    sources: [],
    attributes: [],
    categories: [],
    rules,
    extensions: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
    description,
    specifics: [
      {
        name: "Short Description",
        value: summary,
        extraAttributes: [],
        ordinal: 0,
      },
      ...(options.segments === undefined
        ? []
        : [
            {
              name: NOTE_VALUES_FIELD,
              value: JSON.stringify({
                version: NOTE_VALUES_VERSION,
                notes: [{ text: summary, segments: options.segments }],
              }),
              extraAttributes: [],
              ordinal: 1,
            },
          ]),
    ],
  };
}

const text = (value: string) => ({ kind: "text", text: value }) as const;

const tome = feature(
  "class:tome",
  "Tome Binding",
  "Class Feature",
  "Encounter, free; with tome, creatures summoned gain a bonus to damage rolls.",
  "Once per encounter, as a free action, if you use your tome when using an arcane summoning power, all creatures summoned by that power gain a bonus to damage rolls equal to your Constitution modifier.",
  {
    segments: [
      text("Encounter, free; with tome, creatures summoned gain a "),
      {
        kind: "value",
        value: {
          terms: [{ kind: "ability", abilities: ["Constitution"] }],
          signed: true,
        },
      },
      text(" bonus to damage rolls."),
    ],
  },
);
const will = feature(
  "feat:will",
  "Steel Will",
  "Feat",
  "+2/+3/+4 (by tier) to Will; make saving throw to end stunned or dazed at start of your turn even if not (save ends) effect",
  "You gain a +2 feat bonus to Will. This bonus increases to +3 at 11th level and +4 at 21st level.\n\tIn addition, if you are dazed or stunned, you can make a saving throw at the start of your turn to end that effect.",
  {
    segments: [
      { kind: "applied", text: "+2/+3/+4 (by tier) to Will; " },
      text(
        "make saving throw to end stunned or dazed at start of your turn even if not (save ends) effect",
      ),
    ],
    statadds: [["Will Defense", "+2"]],
  },
);
const finesse = feature(
  "class:finesse",
  "Blade Finesse",
  "Class Feature",
  "1/turn, deal 1d8/2d8/3d8 (by tier) extra dmg with a weapon attack using a one-handed weapon.",
  "Once per turn, when you hit with a weapon attack, you deal 1d8 extra damage.",
  {
    segments: [
      text("1/turn, deal "),
      {
        kind: "value",
        value: {
          terms: [
            {
              kind: "tier",
              values: [
                { kind: "dice", count: 1, die: "d8" },
                { kind: "dice", count: 2, die: "d8" },
                { kind: "dice", count: 3, die: "d8" },
              ],
            },
          ],
          signed: false,
        },
      },
      text(" extra dmg with a weapon attack using a one-handed weapon."),
    ],
  },
);
// Already on the sheet: a pact's damage bonus on the warlock power rows,
// whose only "ally" is the summon warlock's ally power.
const reward = feature(
  "class:reward",
  "Pact Boon Reward",
  "Class Feature",
  "Gain tiered damage bonus",
  "You gain a bonus to the damage rolls of your warlock attack powers. At 9th level, you also gain this bonus to the damage rolls of the creature you summon with summon warlock's ally.",
  { statadds: [["ID_SYNTH_CLASS_WARLOCK:damage", "+Pact Reward"]] },
);
// A keyword bonus the power rows carry.
const moil = feature(
  "feat:moil",
  "Chill Scholar",
  "Feat",
  "+1/+2/+3 (by tier) to damage with cold or necrotic powers",
  "You gain a +1 feat bonus to damage rolls when you use a power that has the cold or necrotic keyword.",
  { statadds: [["cold:damage", "+1"]] },
);
// A bonus while holding a rod (`requires=WearingRod`), on AC already.
const rod = feature(
  "feat:rod",
  "Rod Guard",
  "Feat",
  "+1 to AC and Reflex when holding rod",
  "When you hold a rod, you gain a +1 shield bonus to AC and Reflex.",
  { statadds: [["AC", "+1"]] },
);
// A held loadout's condition still leaves the benefit's own trigger.
const crossbow = feature(
  "class:crossbow",
  "Crossbow Style",
  "Class Feature",
  "While holding light blade and hand crossbow, you don't provoke OAs with the hand crossbow",
  "When holding a light blade in one hand and a hand crossbow in the other, you do not provoke opportunity attacks when making attacks using your hand crossbow.",
);

const stat = (name: string, value: number): [string, EvaluatedStat] => [
  name,
  { name, value, contributions: [] },
];

// An ability-modifier bonus (D112 amendment): nothing at a modifier of 0
// or less.
const charisma = () =>
  ({
    kind: "value",
    value: {
      terms: [{ kind: "ability", abilities: ["Charisma"] }],
      signed: false,
    },
  }) as const;
const dawn = feature(
  "class:dawn",
  "Dawn Strike",
  "Class Feature",
  "When you use Channel Divinity power, deal radiant damage equal to Charisma modifier to enemy within 5 squares of you.",
  "When you use a Channel Divinity power, one enemy within 5 squares of you takes radiant damage equal to your Charisma modifier.",
  {
    segments: [
      text(
        "When you use Channel Divinity power, deal radiant damage equal to ",
      ),
      charisma(),
      text(" to enemy within 5 squares of you."),
    ],
  },
);
const mantle = feature(
  "class:mantle",
  "Bright Mantle",
  "Class Feature",
  "Gain 2 healing surges; add Cha modifier to healing surge value when an ally is bloodied",
  "You gain two healing surges. When an ally is bloodied, add your Charisma modifier to your healing surge value.",
  {
    segments: [
      text("Gain 2 healing surges; add "),
      charisma(),
      text(" to healing surge value when an ally is bloodied"),
    ],
  },
);

const rebuke = feature(
  "class:rebuke",
  "Bright Rebuke",
  "Class Feature",
  "Add Cha mod to opportunity attacks. Hit ends foe's movement.",
  "Whenever an enemy provokes an opportunity attack from you, add your Charisma modifier to the attack roll. If you hit, the enemy stops moving.",
  {
    segments: [
      text("Add "),
      charisma(),
      text(" to opportunity attacks. Hit ends foe's movement."),
    ],
  },
);

function reminders(level: number, charismaModifier = 2) {
  const content = [
    rebuke,
    tome,
    will,
    finesse,
    reward,
    moil,
    rod,
    crossbow,
    dawn,
    mantle,
  ];
  const selections = content.map(({ id, name, type }) => ({ id, name, type }));
  const model = buildSheetModel(
    {
      details: { name: "Valued", Level: String(level) },
      abilities: {},
      stats: {},
      selectedRules: selections,
      levelCount: level,
      source: "legacy-cache" as const,
      textStrings: {},
      loot: [],
      powers: [],
    },
    content,
  );
  return withSheetOverview(model, {
    level,
    stats: {},
    evaluatedStats: Object.fromEntries([
      stat("Constitution", 16),
      stat("Constitution modifier", 3),
      stat("Charisma", 10 + 2 * charismaModifier),
      stat("Charisma modifier", charismaModifier),
    ]),
    selections,
    content,
    inventory: [],
  }).overview!.reminderCandidates!.map(({ label, value }) => [label, value]);
}

describe("concrete reminder values (D112)", () => {
  it("prints each note value at the character's level and abilities", () => {
    const positive = new Set(["Dawn Strike", "Bright Mantle", "Bright Rebuke"]);
    expect(reminders(12).filter(([label]) => !positive.has(label!))).toEqual([
      [
        "Tome Binding",
        "Encounter, free; with tome, creatures summoned gain a +3 bonus to damage rolls.",
      ],
      [
        "Blade Finesse",
        "1/turn, deal 2d8 extra dmg with a weapon attack using a one-handed weapon.",
      ],
      [
        "Crossbow Style",
        "While holding light blade and hand crossbow, you don't provoke OAs with the hand crossbow",
      ],
      [
        "Steel Will",
        "Make saving throw to end stunned or dazed at start of your turn even if not (save ends) effect",
      ],
    ]);
    expect(reminders(25).find(([label]) => label === "Blade Finesse")).toEqual([
      "Blade Finesse",
      "1/turn, deal 3d8 extra dmg with a weapon attack using a one-handed weapon.",
    ]);
  });
});

describe("bonuses of 0 or less (D112, owner 2026-11-05)", () => {
  it("drops the clause, and a reminder with no clause left", () => {
    const labels = (modifier: number) =>
      Object.fromEntries(reminders(12, modifier));
    expect(labels(2)["Dawn Strike"]).toBe(
      "When you use Channel Divinity power, deal radiant damage equal to 2 to enemy within 5 squares of you.",
    );
    expect(labels(2)["Bright Mantle"]).toBe(
      "Gain 2 healing surges; add 2 to healing surge value when an ally is bloodied",
    );
    expect(labels(-1)["Dawn Strike"]).toBeUndefined();
    expect(labels(0)["Bright Mantle"]).toBe("Gain 2 healing surges");
    expect(labels(0)["Bright Rebuke"]).toBe("Hit ends foe's movement.");
  });
});
