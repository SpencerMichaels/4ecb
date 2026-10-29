import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";
import { EXCEPTION_IDS } from "./exceptions";

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
    prerequisites?: string;
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
    ...(options.prerequisites === undefined
      ? {}
      : { prerequisites: options.prerequisites }),
  };
}

const occurrence = (
  id: string,
  definitionId: string,
  acquiredLevel: number,
  parentId?: string,
): CharacterOccurrence => ({
  id,
  definitionId,
  acquiredLevel,
  kind: parentId === undefined ? "root" : "choice",
  ...(parentId === undefined ? {} : { parentId, ruleOrdinal: 0 }),
});

describe("PowersAsClass (native CategoryOpt::Build)", () => {
  const WIZARD = "ID_FMP_CLASS_9";
  const CLERIC = "ID_FMP_CLASS_2";
  const content = [
    entity("ID_FMP_CLASS_0", "Any Class", "Class"),
    entity(WIZARD, "Wizard", "Class"),
    entity(CLERIC, "Cleric", "Class"),
    entity(
      "ID_INTERNAL_LEVEL1RULES_LEVEL1RULES",
      "Level1Rules",
      "Level1Rules",
      {
        rules: [
          rule(
            "textstring",
            { name: "PowersAsClass", value: "ID_FMP_CLASS_0" },
            0,
          ),
        ],
      },
    ),
    entity(
      "ID_INTERNAL_CLASS_FEATURE_KNOWLEDGE_OF_ANCIENT_LIVES_(CLERIC)",
      "Knowledge of Ancient Lives (Cleric)",
      "Class Feature",
      {
        rules: [
          rule("textstring", { name: "PowersAsClass", value: CLERIC }, 0),
        ],
      },
    ),
    entity("ID_INTERNAL_LEVEL_2", "2", "Level", {
      rules: [
        rule(
          "select",
          {
            type: "Power",
            name: "Power Utility 2",
            number: "1",
            Category: "$$CLASS,utility,2",
          },
          0,
        ),
      ],
    }),
    entity("ID_INTERNAL_LEVEL_6", "6", "Level", {
      rules: [
        rule(
          "select",
          {
            type: "Power",
            name: "Power Utility 6",
            number: "1",
            Category: "$$CLASS,utility,6",
          },
          0,
        ),
      ],
    }),
    entity("ID_INTERNAL_CATEGORY_UTILITY", "Utility", "Category"),
    entity("CLERIC_UTILITY", "Cleric utility", "Power", {
      categories: ["ID_INTERNAL_CATEGORY_UTILITY", CLERIC, "2"],
      specifics: { Class: ` ${CLERIC} `, "Power Type": " Utility " },
    }),
    entity("SKILL_POWER", "Skill power", "Power", {
      categories: ["ID_INTERNAL_CATEGORY_UTILITY", "ID_FMP_CLASS_0", "2"],
      specifics: { "Power Type": " Utility " },
    }),
  ];
  const evaluate = (featureLevel: number | undefined) =>
    evaluateCharacter(
      {
        level: 6,
        baseAbilities: {},
        occurrences: [
          occurrence("wizard", WIZARD, 1),
          occurrence("rules", "ID_INTERNAL_LEVEL1RULES_LEVEL1RULES", 1),
          occurrence("level-2", "ID_INTERNAL_LEVEL_2", 2),
          occurrence("level-6", "ID_INTERNAL_LEVEL_6", 6),
          ...(featureLevel === undefined
            ? []
            : [
                occurrence(
                  "knowledge",
                  "ID_INTERNAL_CLASS_FEATURE_KNOWLEDGE_OF_ANCIENT_LIVES_(CLERIC)",
                  featureLevel,
                ),
              ]),
        ],
        inventory: [],
      },
      content,
    );
  const reasons = (
    result: ReturnType<typeof evaluate>,
    provider: string,
    definitionId: string,
  ) =>
    result.choices
      .find((choice) => choice.providerOccurrenceId === provider)
      ?.candidates.find((candidate) => candidate.definitionId === definitionId)
      ?.reasons;

  it("lets a power of the named class fill a $$CLASS slot", () => {
    expect(reasons(evaluate(undefined), "level-6", "CLERIC_UTILITY")).toContain(
      "category",
    );
    expect(reasons(evaluate(1), "level-6", "CLERIC_UTILITY")).toEqual([]);
  });

  it("counts from the level that adds it, as native builds categories per choice level", () => {
    const result = evaluate(5);
    expect(reasons(result, "level-2", "CLERIC_UTILITY")).toContain("category");
    expect(reasons(result, "level-6", "CLERIC_UTILITY")).toEqual([]);
  });

  it("keeps the Any Class powers when another feature names a class (D109)", () => {
    // Native keeps only the last PowersAsClass value; PHB3 p165 lets any
    // character take a skill power in place of a class utility power.
    expect(reasons(evaluate(1), "level-6", "SKILL_POWER")).toEqual([]);
  });
});

describe("Adept Dilettante's [Dilettante] grant (native FindGrantElement)", () => {
  const content = [
    entity(EXCEPTION_IDS.dilettante, "Dilettante", "Racial Trait", {
      rules: [rule("select", { type: "Power", number: "1" }, 0)],
    }),
    entity("ID_FMP_CLASS_2", "Cleric", "Class"),
    entity("ID_INTERNAL_COUNTSASCLASS_CLERIC", "Cleric", "CountsAsClass"),
    entity("CLERIC_AT_WILL", "Sacred Flame", "Power", {
      specifics: {
        Class: " ID_FMP_CLASS_2 ",
        "Power Type": " Attack ",
        "Attack Type": " Ranged 5 ",
        Keywords: " Divine, Implement, Radiant ",
      },
    }),
    entity("ID_FMP_FEAT_2871", "Adept Dilettante", "Feat", {
      rules: [
        rule("grant", { name: "[Dilettante]", type: "CountsAsClass" }, 0),
      ],
    }),
    entity("IMPLEMENT_FEAT", "Implement Dilettante feat", "Feat", {
      prerequisites:
        "you must have chosen an implement power for your Dilettante racial trait",
    }),
    entity("ROOT", "Root", "Test", {
      rules: [rule("select", { type: "Feat", number: "1" }, 0)],
    }),
  ];
  const evaluate = (dilettante: boolean) =>
    evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          occurrence("root", "ROOT", 1),
          occurrence("feat", "ID_FMP_FEAT_2871", 1, "root"),
          ...(dilettante
            ? [
                occurrence("trait", EXCEPTION_IDS.dilettante, 1),
                occurrence("power", "CLERIC_AT_WILL", 1, "trait"),
              ]
            : []),
        ],
        inventory: [],
      },
      content,
    );

  it("grants the CountsAsClass of the Dilettante power's class", () => {
    const result = evaluate(true);
    expect(
      result.occurrences.map(({ definitionId }) => definitionId),
    ).toContain("ID_INTERNAL_COUNTSASCLASS_CLERIC");
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "grant.missing-target" }),
    );
  });

  it("grants nothing, without an error, before a Dilettante power is chosen", () => {
    const result = evaluate(false);
    expect(
      result.occurrences.map(({ definitionId }) => definitionId),
    ).not.toContain("ID_INTERNAL_COUNTSASCLASS_CLERIC");
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "grant.missing-target" }),
    );
  });

  it("reads a Dilettante prerequisite from the power chosen through the trait", () => {
    const featReasons = (dilettante: boolean) =>
      evaluate(dilettante)
        .choices.find((choice) => choice.providerOccurrenceId === "root")
        ?.candidates.find(
          (candidate) => candidate.definitionId === "IMPLEMENT_FEAT",
        )?.reasons;
    expect(featReasons(true)).toEqual([]);
    expect(featReasons(false)).toContain("prerequisite");
  });
});
