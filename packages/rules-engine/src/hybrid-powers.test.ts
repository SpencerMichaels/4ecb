import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";
import {
  disallowedHybridClass,
  hybridPowerReplaceable,
  hybridPowerSlot,
  nativeHybridClasses,
} from "./hybrid-powers";

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
    categories?: string[];
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
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

/** A power spelled as the real content spells it. */
function power(
  id: string,
  classId: string,
  usage: "At-Will" | "Encounter" | "Daily",
  level: number,
  type: "Attack" | "Utility" = "Attack",
): ContentEntity {
  const usageCategory = `ID_INTERNAL_CATEGORY_${usage.toUpperCase()}`;
  return entity(id, id, "Power", {
    categories: [
      type === "Attack"
        ? "ID_INTERNAL_CATEGORY_ATTACK"
        : "ID_INTERNAL_CATEGORY_UTILITY",
      usageCategory,
      `${usageCategory}_USAGE`,
      classId,
      String(level),
    ],
    specifics: {
      "Power Usage": ` ${usage} `,
      Display: " Fighter Attack 1 ",
      "Power Type": ` ${type} `,
      Level: ` ${level} `,
      Class: ` ${classId} `,
    },
  });
}

const FIGHTER = "ID_FMP_CLASS_3";
const WARLORD = "ID_FMP_CLASS_8";
const ARDENT = "ID_FMP_CLASS_ARDENT";

const content = (secondBase = WARLORD): ContentEntity[] => [
  ...(
    [
      ["ID_INTERNAL_CATEGORY_AT-WILL", "At-Will"],
      ["ID_INTERNAL_CATEGORY_ENCOUNTER", "Encounter"],
      ["ID_INTERNAL_CATEGORY_DAILY", "Daily"],
      ["ID_INTERNAL_CATEGORY_ATTACK", "Attack"],
      ["ID_INTERNAL_CATEGORY_UTILITY", "Utility"],
    ] as const
  ).map(([id, name]) => entity(id, name, "Category")),
  entity("ID_INTERNAL_CLASS_HYBRID", "Hybrid", "Class", {
    rules: [rule("select", { type: "Hybrid Class", number: "2" }, 0)],
  }),
  entity(FIGHTER, "Fighter", "Class"),
  entity(WARLORD, "Warlord", "Class"),
  entity(ARDENT, "Ardent", "Class", {
    specifics: {
      _PARSED_CLASS_FEATURE:
        "Ardent Mantle, Ardent Surge, Psionic Augmentation",
    },
  }),
  entity("HYBRID_FIGHTER", "Hybrid Fighter", "Hybrid Class", {
    specifics: { _BaseClass: ` ${FIGHTER} ` },
    rules: [
      rule(
        "select",
        {
          type: "Power",
          name: "Power At-Will 1",
          number: "1",
          Category: "$$CLASS,at-will,1",
        },
        0,
      ),
    ],
  }),
  entity("HYBRID_SECOND", "Hybrid Second", "Hybrid Class", {
    specifics: { _BaseClass: ` ${secondBase} ` },
    rules: [
      rule(
        "select",
        {
          type: "Power",
          name: "Power At-Will 1",
          number: "1",
          Category: "$$CLASS,at-will,1",
        },
        0,
      ),
    ],
  }),
  entity("ID_INTERNAL_LEVEL_1", "1", "Level", {
    rules: [
      rule(
        "select",
        {
          type: "Power",
          name: "Power Encounter 1",
          number: "1",
          Category: "$$CLASS,encounter,1",
        },
        0,
      ),
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
    ],
  }),
  entity("ID_INTERNAL_LEVEL_4", "4", "Level", {
    rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
  }),
  entity("ID_INTERNAL_LEVEL_5", "5", "Level", {
    rules: [
      rule(
        "replace",
        { "power-replace": "Swapped In:encounter,3", optional: "true" },
        0,
      ),
    ],
  }),
  power("FIGHTER_AT_WILL", FIGHTER, "At-Will", 1),
  power("FIGHTER_AT_WILL_2", FIGHTER, "At-Will", 1),
  power("WARLORD_AT_WILL", WARLORD, "At-Will", 1),
  power("FIGHTER_ENCOUNTER", FIGHTER, "Encounter", 1),
  power("WARLORD_ENCOUNTER", WARLORD, "Encounter", 1),
  power("FIGHTER_ENCOUNTER_3", FIGHTER, "Encounter", 3),
  power("WARLORD_ENCOUNTER_3", WARLORD, "Encounter", 3),
  power("ARDENT_AT_WILL", ARDENT, "At-Will", 1),
  power("ARDENT_ENCOUNTER", ARDENT, "Encounter", 1),
  power("Swapped In", "ID_FMP_CLASS_OTHER", "Encounter", 3),
];

const occurrence = (
  id: string,
  definitionId: string,
  acquiredLevel: number,
  parentId?: string,
  choiceIndex = 0,
  extra: Partial<CharacterOccurrence> = {},
): CharacterOccurrence => ({
  id,
  definitionId,
  acquiredLevel,
  kind: parentId === undefined ? "root" : "choice",
  ...(parentId === undefined ? {} : { parentId, ruleOrdinal: 0, choiceIndex }),
  ...extra,
});

const hybridOccurrences = (
  level: number,
  picks: Readonly<Record<string, string>>,
  extra: readonly CharacterOccurrence[] = [],
): CharacterOccurrence[] => [
  occurrence("hybrid", "ID_INTERNAL_CLASS_HYBRID", 1),
  occurrence("hybrid-fighter", "HYBRID_FIGHTER", 1, "hybrid", 0),
  occurrence("hybrid-second", "HYBRID_SECOND", 1, "hybrid", 1),
  occurrence("level-1", "ID_INTERNAL_LEVEL_1", 1),
  ...(level >= 3 ? [occurrence("level-3", "ID_INTERNAL_LEVEL_3", 3)] : []),
  ...(level >= 4 ? [occurrence("level-4", "ID_INTERNAL_LEVEL_4", 4)] : []),
  ...(level >= 5 ? [occurrence("level-5", "ID_INTERNAL_LEVEL_5", 5)] : []),
  ...Object.entries(picks).map(([parent, definitionId]) =>
    occurrence(
      `pick-${parent}`,
      definitionId,
      parent === "level-3" ? 3 : 1,
      parent,
    ),
  ),
  ...extra,
];

const evaluate = (
  level: number,
  picks: Readonly<Record<string, string>>,
  options: {
    readonly extra?: readonly CharacterOccurrence[];
    readonly secondBase?: string;
  } = {},
) =>
  evaluateCharacter(
    {
      level,
      baseAbilities: {},
      occurrences: hybridOccurrences(level, picks, options.extra),
      inventory: [],
    },
    content(options.secondBase),
  );

const reasonsFor = (
  result: ReturnType<typeof evaluate>,
  choiceProvider: string,
  definitionId: string,
) =>
  result.choices
    .find((choice) => choice.providerOccurrenceId === choiceProvider)
    ?.candidates.find((candidate) => candidate.definitionId === definitionId)
    ?.reasons;

describe("hybrid power slots (native DisallowClass)", () => {
  it("reads a slot's kind and level from its name", () => {
    expect(hybridPowerSlot("Power Encounter 3")).toEqual({
      usage: "Encounter",
      type: "Attack",
      level: 3,
    });
    expect(hybridPowerSlot("Power Utility 22")).toEqual({
      type: "Utility",
      level: 22,
    });
    expect(hybridPowerSlot("Hybrid At-Will/Encounter 7")).toEqual({
      usage: "Encounter",
      type: "Attack",
      level: 7,
    });
    expect(hybridPowerSlot("Human Bonus At-Will")).toBeUndefined();
    expect(hybridPowerSlot("Power 10")).toBeUndefined();
  });

  it("limits the second at-will slot to the class the first lacks", () => {
    const result = evaluate(1, {
      "hybrid-fighter": "FIGHTER_AT_WILL",
    });
    // The Hybrid Second slot: Fighter already has an at-will at level 1.
    expect(reasonsFor(result, "hybrid-second", "FIGHTER_AT_WILL_2")).toContain(
      "hybrid-class",
    );
    expect(reasonsFor(result, "hybrid-second", "WARLORD_AT_WILL")).toEqual([]);
    // The Hybrid Fighter slot's own pick does not count against it.
    expect(
      reasonsFor(result, "hybrid-fighter", "WARLORD_AT_WILL"),
    ).not.toContain("hybrid-class");
  });

  it("makes a level-3 encounter power of the class that has one illegal", () => {
    const legal = evaluate(3, {
      "level-1": "FIGHTER_ENCOUNTER",
      "level-3": "WARLORD_ENCOUNTER_3",
    });
    expect(legal.legal).toBe(true);
    expect(reasonsFor(legal, "level-3", "FIGHTER_ENCOUNTER_3")).toContain(
      "hybrid-class",
    );

    const illegal = evaluate(3, {
      "level-1": "FIGHTER_ENCOUNTER",
      "level-3": "FIGHTER_ENCOUNTER_3",
    });
    expect(illegal.legal).toBe(false);
    expect(illegal.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "choice.ineligible",
        occurrenceId: "pick-level-3",
        message: expect.stringContaining("hybrid-class"),
      }),
    );
  });

  it("counts a psionic class as already having an encounter power", () => {
    // Native IsPsionicClass: _PARSED_CLASS_FEATURE names Psionic
    // Augmentation, so the level-1 encounter power comes from the other class.
    const result = evaluate(1, {}, { secondBase: ARDENT });
    expect(reasonsFor(result, "level-1", "FIGHTER_ENCOUNTER")).toEqual([]);
    expect(reasonsFor(result, "level-1", "ARDENT_ENCOUNTER")).toContain(
      "hybrid-class",
    );
    // Neither class has one yet: both are open.
    const open = evaluate(1, {});
    expect(reasonsFor(open, "level-1", "FIGHTER_ENCOUNTER")).toEqual([]);
    expect(reasonsFor(open, "level-1", "WARLORD_ENCOUNTER")).toEqual([]);
  });

  it("applies the slot of the retrained power at the retraining's level", () => {
    // PHB3 "Retraining": the replacement follows the hybrid power rules.
    const result = evaluate(4, {
      "level-1": "FIGHTER_ENCOUNTER",
      "level-3": "WARLORD_ENCOUNTER_3",
    });
    const retraining = result.choices.find(
      (choice) => choice.providerOccurrenceId === "level-4",
    );
    const option = retraining?.replacementOptions?.find(
      (candidate) => candidate.replacesOccurrenceId === "pick-level-3",
    );
    // Without the level-3 Warlord power, Fighter alone has an encounter
    // power at level 4, so the new one must be a Warlord power.
    expect(
      option?.candidates.find(
        (candidate) => candidate.definitionId === "FIGHTER_ENCOUNTER_3",
      )?.reasons,
    ).toContain("hybrid-class");
    const illegal = evaluate(
      4,
      {
        "level-1": "FIGHTER_ENCOUNTER",
        "level-3": "WARLORD_ENCOUNTER_3",
      },
      {
        extra: [
          occurrence("retrain", "FIGHTER_ENCOUNTER_3", 4, "level-4", 0, {
            replacesId: "pick-level-3",
          }),
        ],
      },
    );
    expect(illegal.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "choice.ineligible",
        occurrenceId: "retrain",
      }),
    );
  });

  it("leaves a non-hybrid character's slots unrestricted", () => {
    const result = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [
          occurrence("fighter", FIGHTER, 1),
          occurrence("level-1", "ID_INTERNAL_LEVEL_1", 1),
          occurrence("level-3", "ID_INTERNAL_LEVEL_3", 3),
          occurrence("pick-level-1", "FIGHTER_ENCOUNTER", 1, "level-1"),
        ],
        inventory: [],
      },
      content(),
    );
    expect(reasonsFor(result, "level-3", "FIGHTER_ENCOUNTER_3")).toEqual([]);
  });
});

describe("hybrid power replacement (native CheckHybridPower)", () => {
  it("keeps a power-replace from taking a hybrid class's only power of its kind", () => {
    const options = (picks: Readonly<Record<string, string>>) =>
      evaluate(5, picks)
        .choices.find((choice) => choice.providerOccurrenceId === "level-5")
        ?.replacementOptions?.map((option) => option.replacesOccurrenceId);
    // One Fighter and one Warlord encounter power: neither can go.
    expect(
      options({
        "level-1": "FIGHTER_ENCOUNTER",
        "level-3": "WARLORD_ENCOUNTER_3",
      }),
    ).toEqual([]);
    // Two Fighter encounter powers: either Fighter one can go.
    expect(
      options({
        "level-1": "FIGHTER_ENCOUNTER",
        "level-3": "FIGHTER_ENCOUNTER_3",
      }),
    ).toEqual(["pick-level-1", "pick-level-3"]);
  });

  it("checks class, Power Type and Power Usage of the other powers", () => {
    const classes = nativeHybridClasses(
      [
        entity("HYBRID_A", "Hybrid A", "Hybrid Class", {
          specifics: { _BaseClass: FIGHTER },
        }),
        entity("HYBRID_B", "Hybrid B", "Hybrid Class", {
          specifics: { _BaseClass: WARLORD },
        }),
        entity("ID_INTERNAL_CLASS_HYBRID", "Hybrid", "Class"),
      ],
      (value) => content().find((candidate) => candidate.id === value.trim()),
    );
    expect(classes).toBeDefined();
    const find = (value: string) =>
      content().find((candidate) => candidate.id === value.trim());
    const lost = power("LOST", FIGHTER, "Encounter", 1);
    expect(
      hybridPowerReplaceable(
        classes!,
        lost,
        [power("OTHER", FIGHTER, "Daily", 1)],
        find,
      ),
    ).toBe(false);
    expect(
      hybridPowerReplaceable(
        classes!,
        lost,
        [power("OTHER", FIGHTER, "Encounter", 7)],
        find,
      ),
    ).toBe(true);
    expect(
      disallowedHybridClass(
        classes!,
        { usage: "Encounter", type: "Attack", level: 3 },
        [power("OTHER", WARLORD, "Encounter", 1)],
        find,
      ),
    ).toBe(1);
  });

  it("needs exactly two hybrid classes and three class entries", () => {
    const find = (value: string) =>
      content().find((candidate) => candidate.id === value.trim());
    const hybridClasses = [
      entity("HYBRID_A", "Hybrid A", "Hybrid Class", {
        specifics: { _BaseClass: FIGHTER },
      }),
      entity("HYBRID_B", "Hybrid B", "Hybrid Class", {
        specifics: { _BaseClass: WARLORD },
      }),
    ];
    expect(
      nativeHybridClasses(
        [
          entity("ID_INTERNAL_CLASS_HYBRID", "Hybrid", "Class"),
          ...hybridClasses,
        ],
        find,
      )?.baseClasses.map(({ id }) => id),
    ).toEqual([FIGHTER, WARLORD]);
    // A parent class adds a fourth entry (native leaves it unrestricted).
    expect(
      nativeHybridClasses(
        [
          entity("ID_INTERNAL_CLASS_HYBRID", "Hybrid", "Class", {
            specifics: { _ParentClass: "ID_FMP_CLASS_PARENT" },
          }),
          ...hybridClasses,
        ],
        find,
      ),
    ).toBeUndefined();
    expect(
      nativeHybridClasses([entity(FIGHTER, "Fighter", "Class")], find),
    ).toBeUndefined();
  });
});
