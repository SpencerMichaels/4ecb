import { describe, expect, it } from "vitest";

import type { BuildOccurrence, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  type EvaluatedCharacter,
  type EvaluationInput,
} from "@4ecb/rules-engine";

import {
  characterDetailLevels,
  type BuilderEvaluationState,
} from "./builder-evaluation-plan";
import {
  builderEvaluations,
  scopedRequestGaps,
  shownChoices,
} from "./builder-scoped-requests";
import { levelRetrain, planningEvaluationHorizon } from "./builder-ui";
import type { BuilderWorkspaceTab } from "./routes";

// A level-4 fighter with every kind of choice the builder shows: ordinary
// picks (race, class, feats, class powers), level 1's racial ability bonus,
// gender/alignment/deity, a beast companion, a level-progression power swap
// (powerswap), a multiclass swap (Novice Power), a power-replace swap
// (Secrets of Belial's `$$NOT_CLASS` gain), the optional retrain at every
// level and an item-owned power choice. Rule shapes and selector operands
// are spelled as the stock content spells them.

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
  text = "",
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text,
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  options: {
    categories?: string[];
    rules?: RuleStatement[];
    specifics?: Record<string, string>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: options.categories ?? [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([fieldName, value], ordinal) => ({
        name: fieldName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "scoped-requests", sourceOrdinal: 0 },
  };
}

const FIGHTER = "ID_FMP_CLASS_3";
const WARLORD = "ID_FMP_CLASS_10";
const power = (
  id: string,
  name: string,
  className: string,
  usage: "At-Will" | "Encounter" | "Daily",
  level: number,
  utility = false,
) =>
  entity(id, name, "Power", {
    categories: [
      className,
      `ID_INTERNAL_CATEGORY_${usage.toUpperCase()}`,
      ...(utility ? ["ID_INTERNAL_CATEGORY_UTILITY"] : []),
      String(level),
    ],
    specifics: {
      "Power Usage": usage,
      Display: `${className === FIGHTER ? "Fighter" : "Warlord"} ${utility ? "Utility" : "Attack"} ${level}`,
      Level: String(level),
    },
  });

const content: readonly ContentEntity[] = [
  entity("ID_INTERNAL_CATEGORY_AT-WILL", "At-Will", "Category"),
  entity("ID_INTERNAL_CATEGORY_ENCOUNTER", "Encounter", "Category"),
  entity("ID_INTERNAL_CATEGORY_DAILY", "Daily", "Category"),
  entity("ID_INTERNAL_CATEGORY_UTILITY", "Utility", "Category"),
  entity("ID_INTERNAL_LEVEL_1", "1", "Level", {
    rules: [
      rule("select", { type: "Race", number: "1" }, 0),
      rule("select", { type: "Class", number: "1" }, 1),
      rule("select", { type: "Feat", number: "1" }, 2),
      rule("select", { type: "Gender", number: "1", optional: "true" }, 3),
      rule("select", { type: "Alignment", number: "1", optional: "true" }, 4),
      rule("select", { type: "Deity", number: "1", optional: "true" }, 5),
    ],
  }),
  entity("ID_INTERNAL_LEVEL_2", "2", "Level", {
    rules: [
      rule("select", { type: "Feat", number: "1" }, 0),
      rule(
        "select",
        {
          type: "Power",
          name: "Power Utility 2",
          number: "1",
          Category: "$$CLASS,utility,2",
        },
        1,
      ),
      rule("replace", { retrain: "true", optional: "true" }, 2),
    ],
  }),
  entity("ID_INTERNAL_LEVEL_3", "3", "Level", {
    rules: [
      rule(
        "select",
        {
          type: "Power",
          name: "Power Encounter 3",
          number: "1",
          Category: "$$CLASS,encounter,3",
        },
        0,
      ),
      rule("replace", { retrain: "true", optional: "true" }, 1),
    ],
  }),
  entity("ID_INTERNAL_LEVEL_4", "4", "Level", {
    rules: [
      rule("select", { type: "Feat", number: "1" }, 0),
      rule(
        "replace",
        {
          name: "Power Encounter 4",
          requires: "!No Encounter Powers",
          powerswap: "$$CLASS,encounter,4",
        },
        1,
      ),
      rule("replace", { retrain: "true", optional: "true" }, 2),
    ],
  }),
  entity("HUMAN", "Human", "Race", {
    rules: [rule("select", { type: "Race Ability Bonus", number: "1" }, 0)],
  }),
  entity("HUMAN_STR", "Strength", "Race Ability Bonus", {
    rules: [rule("statadd", { name: "Strength", value: "+2" }, 0)],
  }),
  entity("HUMAN_CON", "Constitution", "Race Ability Bonus", {
    rules: [rule("statadd", { name: "Constitution", value: "+2" }, 0)],
  }),
  entity(FIGHTER, "Fighter", "Class", {
    rules: [
      rule(
        "select",
        { type: "Power", number: "2", Category: "$$CLASS,at-will,1" },
        0,
      ),
      rule(
        "select",
        { type: "Companion", number: "1" },
        1,
        "Beast Companion Type",
      ),
    ],
  }),
  entity(WARLORD, "Warlord", "Class"),
  entity("MALE", "Male", "Gender"),
  entity("FEMALE", "Female", "Gender"),
  entity("UNALIGNED", "Unaligned", "Alignment"),
  entity("GOOD", "Good", "Alignment"),
  entity("BAHAMUT", "Bahamut", "Deity"),
  entity("MORADIN", "Moradin", "Deity"),
  entity("BEAR", "Bear", "Companion"),
  entity("WOLF", "Wolf", "Companion"),
  // A feat whose option is a class feature (Twofold Pact's pact): the
  // options share no feature, though the pick alone belongs to one.
  entity("STUDENT", "Student of Battle", "Feat", {
    specifics: { CountsAsClass: WARLORD },
    rules: [
      rule(
        "select",
        { type: "Class Feature", number: "1", Category: "BOON" },
        0,
      ),
    ],
  }),
  entity("BOON", "Boon", "Category"),
  entity("PACT", "Eldritch Pact", "Class Feature"),
  entity("DARK_PACT", "Dark Pact", "Class Feature", {
    categories: ["BOON", "PACT"],
  }),
  entity("STAR_PACT", "Star Pact", "Class Feature", { categories: ["BOON"] }),
  entity("ID_FMP_FEAT_339", "Novice Power", "Feat", {
    rules: [
      rule(
        "replace",
        {
          name: "encounter swap",
          Level: "4",
          multiclass: "Encounter",
          optional: "true",
        },
        0,
      ),
    ],
  }),
  entity("BELIAL", "Secrets of Belial", "Feat", {
    rules: [rule("replace", { "power-replace": "$$NOT_CLASS:utility,2" }, 0)],
  }),
  entity("TOUGHNESS", "Toughness", "Feat"),
  power("CLEAVE", "Cleave", FIGHTER, "At-Will", 1),
  power("REAPING", "Reaping Strike", FIGHTER, "At-Will", 1),
  power("SURE", "Sure Strike", FIGHTER, "At-Will", 1),
  // An at-will utility the at-will slots also offer: the slots' candidates
  // mix usages, their picks don't.
  power("GLOW", "Sun's Glow", FIGHTER, "At-Will", 1, true),
  power("BOOST", "Boundless Endurance", FIGHTER, "Daily", 2, true),
  power("UNSTOPPABLE", "Unstoppable", FIGHTER, "Daily", 2, true),
  power("PASSING", "Passing Attack", FIGHTER, "Encounter", 1),
  power("SPINNING", "Spinning Sweep", FIGHTER, "Encounter", 3),
  power("COME_AND_GET", "Come and Get It", FIGHTER, "Encounter", 3),
  power("RAIN", "Rain of Steel", FIGHTER, "Encounter", 4),
  power("GUARDING", "Guarding Attack", WARLORD, "Encounter", 1),
  power("INSPIRING", "Inspiring Word", WARLORD, "Daily", 2, true),
  entity("BOOK", "Book of Undeniable Strikes +1", "Magic Item", {
    rules: [
      rule(
        "select",
        { type: "Power", number: "1", Category: `${FIGHTER},encounter,4` },
        0,
      ),
    ],
  }),
];
const byId = new Map(
  content.map((definition) => [definition.id.toLocaleLowerCase(), definition]),
);

function node(
  id: string,
  definitionId: string,
  acquiredLevel: number,
  children: readonly BuildOccurrence[] = [],
): BuildOccurrence {
  const definition = byId.get(definitionId.toLocaleLowerCase())!;
  return {
    id,
    identity: {
      definitionId,
      name: definition.name,
      type: definition.type,
    },
    acquiredLevel,
    legality: "rules-legal",
    children,
    unresolved: false,
  };
}

const build: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 4,
  levels: [
    {
      level: 1,
      root: node("level-1", "ID_INTERNAL_LEVEL_1", 1, [
        node("human", "HUMAN", 1, [node("human-str", "HUMAN_STR", 1)]),
        node("fighter", FIGHTER, 1, [
          node("cleave", "CLEAVE", 1),
          node("reaping", "REAPING", 1),
        ]),
        node("student", "STUDENT", 1, [node("dark-pact", "DARK_PACT", 1)]),
        node("male", "MALE", 1),
      ]),
    },
    {
      level: 2,
      root: node("level-2", "ID_INTERNAL_LEVEL_2", 2, [
        node("novice", "ID_FMP_FEAT_339", 2),
        node("boost", "BOOST", 2),
      ]),
    },
    {
      level: 3,
      root: node("level-3", "ID_INTERNAL_LEVEL_3", 3, [
        node("spinning", "SPINNING", 3),
      ]),
    },
    {
      level: 4,
      root: node("level-4", "ID_INTERNAL_LEVEL_4", 4, [
        node("belial", "BELIAL", 4),
      ]),
    },
  ],
  grabbag: [],
  inventory: [
    {
      id: "book",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [
        {
          definitionId: "BOOK",
          name: "Book of Undeniable Strikes +1",
          type: "Magic Item",
        },
      ],
      overrides: {},
      legality: "rules-legal",
    },
  ],
  known: [],
  alternates: [],
  baseAbilities: {
    Strength: 16,
    Constitution: 14,
    Dexterity: 13,
    Intelligence: 10,
    Wisdom: 12,
    Charisma: 11,
  },
  textStrings: {},
};

const evaluations = new Map<string, EvaluatedCharacter>();
const evaluate = (input: EvaluationInput): EvaluatedCharacter => {
  const key = JSON.stringify(input);
  let result = evaluations.get(key);
  if (result === undefined) {
    result = evaluateCharacter(input, content);
    evaluations.set(key, result);
  }
  return result;
};

/** An editor state as `CharacterEditorPage` holds it, with the Details
 *  tab's levels read from its previous planning evaluation. */
function editorState(
  workspace: BuilderWorkspaceTab,
  selectedLevel: number,
  expandedReplacementChoiceId?: string,
): BuilderEvaluationState {
  const base: BuilderEvaluationState = {
    workspace,
    currentLevel: build.effectiveLevel,
    selectedLevel,
    planningHorizon: planningEvaluationHorizon(build, selectedLevel),
    characterDetailLevels: [],
    expandedReplacementChoiceId,
  };
  const previous = builderEvaluations(build, content, base, evaluate).planning;
  return { ...base, characterDetailLevels: characterDetailLevels(previous) };
}

const scoped = (state: BuilderEvaluationState) =>
  builderEvaluations(build, content, state, evaluate);

/** The candidates (or a target's gains) an editor lists, as definition IDs. */
const listed = (
  state: BuilderEvaluationState,
  match: (choiceType: string, choiceId: string) => boolean,
  target?: string,
) => {
  const shown = shownChoices(state.workspace, scoped(state), state).find(
    ({ choice }) => match(choice.type, choice.id),
  );
  const candidates =
    target === undefined
      ? shown?.choice.candidates
      : shown?.choice.replacementOptions?.find(
          ({ definitionId }) => definitionId === target,
        )?.candidates;
  return candidates
    ?.filter(({ reasons }) => !reasons.includes("category"))
    .map(({ definitionId }) => definitionId)
    .sort();
};

const states = (): readonly BuilderEvaluationState[] => {
  const all: BuilderEvaluationState[] = [];
  for (const workspace of [
    "overview",
    "details",
    "equipment",
    "shop",
    "diagnostics",
    "house-rules",
  ] as const)
    all.push(editorState(workspace, build.effectiveLevel));
  for (let level = 1; level <= build.effectiveLevel; level += 1) {
    all.push(editorState("build", level));
    all.push(editorState("retraining", level));
    const planning = scoped(editorState("retraining", level)).planning;
    const choices = planning.choices.filter(
      (choice) =>
        choice.level === level &&
        choice.type === "Replacement" &&
        choice.optional &&
        (choice.name ?? "") === "",
    );
    const open = levelRetrain(choices, planning, byId)?.choice ?? choices[0];
    if (open !== undefined) all.push(editorState("retraining", level, open.id));
  }
  return all;
};

describe("the builder's scoped evaluation requests", () => {
  it("give every tab's shown choices what the unscoped evaluation lists", () => {
    const gaps = states().flatMap((state) =>
      scopedRequestGaps({ build, entities: content, byId, state, evaluate }),
    );
    expect(gaps).toEqual([]);
  });

  it("list each kind of choice the tabs show (the check is not vacuous)", () => {
    const type = (wanted: string) => (choiceType: string) =>
      choiceType === wanted;
    // Ordinary picks, the class's at-wills, the companion, level 1's racial
    // ability bonus (from the selected-level evaluation).
    const build1 = editorState("build", 1);
    expect(listed(build1, type("Feat"))).toEqual(
      expect.arrayContaining(["TOUGHNESS"]),
    );
    expect(listed(build1, type("Companion"))).toEqual(["BEAR", "WOLF"]);
    expect(listed(build1, type("Race Ability Bonus"))).toEqual([
      "HUMAN_CON",
      "HUMAN_STR",
    ]);
    expect(
      listed(
        build1,
        (choiceType, id) => choiceType === "Power" && id.startsWith("fighter:"),
      ),
    ).toEqual(["CLEAVE", "GLOW", "REAPING", "SURE"]);
    // Details: gender, alignment, deity.
    const details = editorState("details", 4);
    expect(listed(details, type("Alignment"))).toEqual(["GOOD", "UNALIGNED"]);
    expect(listed(details, type("Deity"))).toEqual(["BAHAMUT", "MORADIN"]);
    // Required swaps on the Build tab: the level-4 powerswap and the
    // power-replace list their gains with the level; Novice Power's
    // multiclass swap too.
    const build4 = editorState("build", 4);
    const swap = (provider: string) => (choiceType: string, id: string) =>
      choiceType === "Replacement" && id.startsWith(`${provider}:`);
    expect(listed(build4, swap("level-4"), "SPINNING")).toEqual([
      "COME_AND_GET",
      "PASSING",
      "RAIN",
    ]);
    expect(listed(build4, swap("novice"), "SPINNING")).toEqual(["GUARDING"]);
    expect(listed(build4, swap("belial"), "BOOST")).toEqual(["INSPIRING"]);
    // The optional retrain lists gains once its editor is open.
    const retrain = (choiceType: string, id: string) =>
      choiceType === "Replacement" && id.startsWith("level-3:");
    expect(listed(editorState("retraining", 3), retrain, "BOOST")).toEqual([]);
    const open = scoped(editorState("retraining", 3)).planning.choices.find(
      ({ type, id }) => retrain(type, id),
    )!;
    expect(
      listed(editorState("retraining", 3, open.id), retrain, "BOOST"),
    ).toEqual(["GLOW", "UNSTOPPABLE"]);
  });
});
