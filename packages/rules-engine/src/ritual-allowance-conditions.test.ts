import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";
import {
  parseRitualAllowance,
  ritualAllowanceStatuses,
  ritualAllowances,
} from "./ritual-allowances";

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
  rules: readonly RuleStatement[] = [],
  specifics: readonly (readonly [string, string])[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: specifics.map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "ritual-allowance-conditions", sourceOrdinal: 0 },
  };
}

const RITUAL_CASTER = "ID_FMP_FEAT_159";
const SORCERE_FEATURE = "ID_TIV_CLASS_FEATURE_DRAGON_413-6-2";

// As the real content and 98-ritual-allowances.part author them: the
// wizard's Ritual Casting feature is a Feat select defaulting to Ritual
// Caster; the Sorcere Adept theme grants its Level 5 feature, which grants
// Ritual Caster unless the character has it and otherwise gives two rituals
// of the character's level or lower.
const content = [
  entity("ID_FMP_FEAT_159", "Ritual Caster", "Feat"),
  entity("ID_FMP_CLASS_FEATURE_683", "Ritual Casting", "Class Feature", [
    rule(
      "select",
      {
        type: "Feat",
        number: "1",
        Category: "Ritual Casting",
        default: "Ritual Caster",
      },
      0,
    ),
  ]),
  entity("ID_TIV_THEME_DRAGON_413-6", "Sorcere Adept", "Theme", [
    rule(
      "grant",
      { name: SORCERE_FEATURE, type: "Class Feature", level: "5" },
      0,
    ),
  ]),
  entity(
    SORCERE_FEATURE,
    "Level 5 Sorcere Adept Feature",
    "Class Feature",
    [
      rule(
        "grant",
        { name: RITUAL_CASTER, type: "Feat", requires: `!${RITUAL_CASTER}` },
        0,
      ),
    ],
    [
      [
        "_FreeRitualAllowance",
        `Ritual; 2@5<=level; requires-other=${RITUAL_CASTER}`,
      ],
    ],
  ),
  entity("ID_FMP_FEAT_1", "Alertness", "Feat"),
  // A class whose Ritual Casting arrives two grants deep, after the theme's
  // feature has granted Ritual Caster.
  entity("DEEP_CLASS", "Deep Class", "Class", [
    rule("grant", { name: "DEEP_GRANTS", type: "Grants" }, 0),
  ]),
  entity("DEEP_GRANTS", "Deep Class", "Grants", [
    rule(
      "grant",
      { name: "ID_FMP_CLASS_FEATURE_683", type: "Class Feature" },
      0,
    ),
  ]),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

const root = (id: string, definitionId: string): CharacterOccurrence => ({
  id,
  definitionId,
  acquiredLevel: 1,
  kind: "root",
});

function evaluate(level: number, roots: readonly CharacterOccurrence[]) {
  return evaluateCharacter(
    { level, baseAbilities: {}, occurrences: roots, inventory: [] },
    content,
  );
}

const theme = root("theme", "ID_TIV_THEME_DRAGON_413-6");
const wizard = root("wizard", "ID_FMP_CLASS_FEATURE_683");

const ritualCasters = (evaluation: ReturnType<typeof evaluate>) =>
  evaluation.occurrences.filter(
    ({ definitionId }) => definitionId === RITUAL_CASTER,
  );

describe("requires-other allowance condition", () => {
  it("parses the condition once, with one or more records", () => {
    expect(
      parseRitualAllowance("Ritual; 2@5<=level; requires-other=A|B"),
    ).toEqual({
      kind: "Ritual",
      steps: [{ level: 5, count: 2, max: "level" }],
      requiresOther: ["A", "B"],
    });
    for (const value of [
      "Ritual; 2@5; requires-other=",
      "Ritual; 2@5; requires-other=A; requires-other=B",
      "Ritual; requires-other=A",
    ])
      expect(parseRitualAllowance(value)).toBeUndefined();
  });

  it("gives a wizard two rituals of its level and no second Ritual Caster", () => {
    const evaluation = evaluate(5, [wizard, theme]);
    expect(ritualCasters(evaluation)).toHaveLength(1);
    expect(ritualCasters(evaluation)[0]?.parentId).toBe("wizard");
    const statuses = ritualAllowanceStatuses({ known: [] }, evaluation, lookup);
    expect(
      statuses.map(({ allowance, total, remainders }) => ({
        provider: allowance.providerId,
        total,
        remainders,
      })),
    ).toEqual([
      {
        provider: SORCERE_FEATURE,
        total: 2,
        remainders: [{ count: 2, maxLevel: 5 }],
      },
    ]);
  });

  it("counts a chosen Ritual Caster as another source", () => {
    const chosen = root("feat", RITUAL_CASTER);
    const evaluation = evaluate(6, [chosen, theme]);
    expect(ritualCasters(evaluation).map(({ id }) => id)).toEqual(["feat"]);
    expect(
      ritualAllowances(evaluation, lookup).map(({ providerId }) => providerId),
    ).toEqual([SORCERE_FEATURE]);
  });

  it("grants Ritual Caster and no rituals to a character without it", () => {
    const evaluation = evaluate(5, [theme, root("feat", "ID_FMP_FEAT_1")]);
    const granted = ritualCasters(evaluation);
    expect(granted).toHaveLength(1);
    expect(
      evaluation.occurrences.find(({ id }) => id === granted[0]?.parentId)
        ?.definitionId,
    ).toBe(SORCERE_FEATURE);
    expect(ritualAllowances(evaluation, lookup)).toEqual([]);
    expect(ritualAllowanceStatuses({ known: [] }, evaluation, lookup)).toEqual(
      [],
    );
  });

  it("drops its own grant when Ritual Caster arrives from elsewhere later", () => {
    const evaluation = evaluate(5, [theme, root("class", "DEEP_CLASS")]);
    const held = ritualCasters(evaluation);
    expect(held).toHaveLength(1);
    expect(
      evaluation.occurrences.find(({ id }) => id === held[0]?.parentId)
        ?.definitionId,
    ).toBe("ID_FMP_CLASS_FEATURE_683");
    expect(
      ritualAllowances(evaluation, lookup).map(({ providerId }) => providerId),
    ).toEqual([SORCERE_FEATURE]);
  });

  it("gives nothing before level 5", () => {
    const evaluation = evaluate(4, [wizard, theme]);
    expect(
      evaluation.occurrences.some(
        ({ definitionId }) => definitionId === SORCERE_FEATURE,
      ),
    ).toBe(false);
    expect(ritualAllowances(evaluation, lookup)).toEqual([]);
    expect(ritualCasters(evaluation)).toHaveLength(1);
  });
});
