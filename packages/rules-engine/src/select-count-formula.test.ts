import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";
import { parseRules, parseSelectCountFormula } from "./ir";

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
  rules: RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

// The Pathfinder campaign's bonus languages (D121): every Level record
// offers the Intelligence modifier's (at least 1) gain at that level.
const bonusLanguages = (ordinal: number) =>
  rule(
    "select",
    { type: "Language", number: "GAIN(MINONEMOD(Intelligence))" },
    ordinal,
  );

const LANGUAGES = ["ID_LANG_1", "ID_LANG_2", "ID_LANG_3", "ID_LANG_4"];

const content: ContentEntity[] = [
  entity("ID_INTERNAL_LEVEL_1", "1", "Level", [bonusLanguages(0)]),
  entity("ID_INTERNAL_LEVEL_2", "2", "Level", [bonusLanguages(0)]),
  entity("ID_INTERNAL_LEVEL_3", "3", "Level", [bonusLanguages(0)]),
  // Level 4's ability increase, as a fixed +2 to Intelligence.
  entity("ID_INTERNAL_LEVEL_4", "4", "Level", [
    bonusLanguages(0),
    rule("statadd", { name: "Intelligence", value: "+2" }, 1),
  ]),
  ...LANGUAGES.map((id, index) =>
    entity(id, `Language ${index + 1}`, "Language"),
  ),
];

const levels = (level: number): CharacterOccurrence[] =>
  Array.from({ length: level }, (_, index) => ({
    id: `level-${index + 1}`,
    definitionId: `ID_INTERNAL_LEVEL_${index + 1}`,
    acquiredLevel: index + 1,
    kind: "root" as const,
  }));

const pick = (
  level: number,
  choiceIndex: number,
  definitionId: string,
): CharacterOccurrence => ({
  id: `pick-${level}-${choiceIndex}`,
  definitionId,
  acquiredLevel: level,
  parentId: `level-${level}`,
  ruleOrdinal: 0,
  choiceIndex,
  kind: "choice",
});

const evaluate = (
  level: number,
  intelligence: number,
  picks: readonly CharacterOccurrence[] = [],
) =>
  evaluateCharacter(
    {
      level,
      baseAbilities: { Intelligence: intelligence },
      occurrences: [...levels(level), ...picks],
      inventory: [],
    },
    content,
  );

const languageSlots = (
  result: ReturnType<typeof evaluate>,
): Record<string, number> => {
  const slots: Record<string, number> = {};
  for (const choice of result.choices)
    if (choice.type === "Language")
      slots[choice.providerOccurrenceId] =
        (slots[choice.providerOccurrenceId] ?? 0) + 1;
  return slots;
};

describe("select count formulas (D121)", () => {
  it("parses the ability-modifier forms, optionally as a gain", () => {
    expect(parseSelectCountFormula("MINONEMOD(Intelligence)")).toEqual({
      ability: "Intelligence",
      minimumOne: true,
      half: false,
      gain: false,
    });
    expect(parseSelectCountFormula("GAIN(ABILITYMOD(int))")).toEqual({
      ability: "Intelligence",
      minimumOne: false,
      half: false,
      gain: true,
    });
    expect(parseSelectCountFormula("2")).toBeUndefined();
    expect(parseSelectCountFormula("MINONEMOD(Luck)")).toBeUndefined();
    const [select] = parseRules("P", [bonusLanguages(0)]);
    expect(select).toMatchObject({ kind: "select", number: 0 });
    const [literal] = parseRules("P", [
      rule("select", { type: "Language", number: "3" }, 0),
    ]);
    expect(literal).toMatchObject({ number: 3 });
    expect(literal).not.toHaveProperty("countFormula");
  });

  it("offers the 1st-level Intelligence modifier's languages, at least 1", () => {
    expect(languageSlots(evaluate(1, 14))).toEqual({ "level-1": 2 });
    expect(languageSlots(evaluate(1, 18))).toEqual({ "level-1": 4 });
    expect(languageSlots(evaluate(1, 8))).toEqual({ "level-1": 1 });
  });

  it("offers a later increase's language at the level it happens", () => {
    // Int 15 → 17 at level 4: modifier +2 → +3, one more language there.
    const result = evaluate(4, 15);
    expect(result.stats.Intelligence?.value).toBe(17);
    expect(languageSlots(result)).toEqual({ "level-1": 2, "level-4": 1 });
    // Int 14 → 16 also raises the modifier (+2 → +3).
    expect(languageSlots(evaluate(4, 14))).toEqual({
      "level-1": 2,
      "level-4": 1,
    });
    // Int 8 → 10: the modifier rises to 0, still below the minimum of 1.
    expect(languageSlots(evaluate(4, 8))).toEqual({ "level-1": 1 });
  });

  it("keeps a pick past the count inactive until the count returns", () => {
    const picks = [
      pick(1, 0, "ID_LANG_1"),
      pick(1, 1, "ID_LANG_2"),
      pick(1, 2, "ID_LANG_3"),
    ];
    const lower = evaluate(1, 14, picks);
    expect(languageSlots(lower)).toEqual({ "level-1": 2 });
    expect(lower.activeDefinitionIds).toContain("ID_LANG_2");
    expect(lower.activeDefinitionIds).not.toContain("ID_LANG_3");
    const higher = evaluate(1, 16, picks);
    expect(languageSlots(higher)).toEqual({ "level-1": 3 });
    expect(higher.activeDefinitionIds).toContain("ID_LANG_3");
    expect(
      higher.choices.filter(
        ({ type, selectedOccurrenceId }) =>
          type === "Language" && selectedOccurrenceId !== undefined,
      ),
    ).toHaveLength(3);
  });
});
