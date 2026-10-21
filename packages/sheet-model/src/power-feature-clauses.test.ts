import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";
import {
  featureClauseKey,
  irrelevantFeatureClauseNames,
} from "./power-feature-clauses";
import { buildEvaluatedSheetModel } from "./index";

function feature(
  id: string,
  name: string,
  categories: string[] = [],
): ContentEntity {
  return {
    id,
    name,
    type: "Class Feature",
    categories,
    source: "test",
    sources: ["test"],
    specifics: [],
    attributes: [],
    rules: [],
    extensions: [],
    description: "",
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}
const parent: ContentEntity = {
  ...feature("FAMILY", "Synthetic Choice"),
  rules: [
    {
      name: "select",
      attributes: [
        { name: "type", value: "Class Feature" },
        { name: "number", value: "1" },
        { name: "Category", value: "FAMILY" },
      ],
      text: "",
      children: [],
      ordinal: 0,
    },
  ],
};
const chosen = feature("OPTION_A", "Option A", ["FAMILY"]);
const other = feature("OPTION_B", "Option B", ["FAMILY"]);
const content = [
  parent,
  chosen,
  other,
  feature("UNRELATED", "Unrelated feature"),
];
const evaluation: EvaluatedCharacter = {
  level: 1,
  converged: true,
  iterations: 1,
  complete: true,
  legal: true,
  occurrences: [
    { id: "parent", definitionId: parent.id, acquiredLevel: 1, kind: "grant" },
    {
      id: "chosen",
      definitionId: chosen.id,
      acquiredLevel: 1,
      kind: "choice",
      parentId: "parent",
      ruleOrdinal: 0,
      legality: "rules-legal",
    },
  ],
  activeDefinitionIds: [parent.id, chosen.id],
  activeDefinitions: [],
  choices: [
    {
      id: "choice",
      level: 1,
      providerOccurrenceId: "parent",
      ruleOrdinal: 0,
      index: 0,
      type: "Class Feature",
      optional: false,
      selectedOccurrenceId: "chosen",
      candidates: [
        {
          definitionId: chosen.id,
          eligible: true,
          sourceEntitled: true,
          rulesLegal: true,
          activeDefinition: true,
          activeOccurrenceIds: ["chosen"],
          providerOccurrenceIds: ["parent"],
          reasons: [],
        },
      ],
    },
  ],
  stats: {},
  textStrings: {},
  overlays: [],
  powers: [],
  suggestions: [],
  diagnostics: [],
};

describe("feature-gated power clauses", () => {
  it("derives unselected siblings from the choice category, even with candidate lists trimmed", () => {
    expect([...irrelevantFeatureClauseNames(evaluation, content)]).toEqual([
      "option b",
    ]);
    expect(featureClauseKey("  OPTION   B ")).toBe("option b");
  });
  it("retains uncertain, illegal, missing, conflicting and custom selections", () => {
    const base = evaluation.choices[0]!;
    const unselected = { ...base };
    delete unselected.selectedOccurrenceId;
    for (const candidate of [
      { ...evaluation, converged: false },
      {
        ...evaluation,
        choices: [unselected],
      },
      { ...evaluation, choices: [{ ...base, candidates: [] }] },
      {
        ...evaluation,
        choices: [base, { ...base, id: "duplicate-slot", index: 1 }],
      },
      {
        ...evaluation,
        choices: [
          {
            ...base,
            candidates: [{ ...base.candidates[0]!, sourceEntitled: false }],
          },
        ],
      },
      {
        ...evaluation,
        choices: [
          {
            ...base,
            candidates: [{ ...base.candidates[0]!, rulesLegal: false }],
          },
        ],
      },
      {
        ...evaluation,
        activeDefinitionIds: [...evaluation.activeDefinitionIds, other.id],
      },
      {
        ...evaluation,
        occurrences: evaluation.occurrences.map((entry) => ({
          ...entry,
          legality: "houserule" as const,
        })),
      },
    ])
      expect(irrelevantFeatureClauseNames(candidate, content).size).toBe(0);
  });
  it("retains multi-choice/composite families and ambiguous duplicate feature names", () => {
    for (const attributes of [
      parent.rules[0]!.attributes.map((attribute) =>
        attribute.name === "number" ? { ...attribute, value: "2" } : attribute,
      ),
      parent.rules[0]!.attributes.map((attribute) =>
        attribute.name === "Category"
          ? { ...attribute, value: "FAMILY,Other" }
          : attribute,
      ),
    ])
      expect(
        irrelevantFeatureClauseNames(evaluation, [
          { ...parent, rules: [{ ...parent.rules[0]!, attributes }] },
          chosen,
          other,
        ]).size,
      ).toBe(0);
    expect(
      irrelevantFeatureClauseNames(evaluation, [
        ...content,
        feature("DUPLICATE", "Option B"),
      ]).size,
    ).toBe(0);
  });
  it("never hides standard rules labels or unrelated feature names", () => {
    expect(
      irrelevantFeatureClauseNames(evaluation, [
        parent,
        chosen,
        { ...other, name: "Special" },
      ]).size,
    ).toBe(0);
    expect([
      ...irrelevantFeatureClauseNames(evaluation, content),
    ]).not.toContain("unrelated feature");
  });
  it("filters only the derived personalized sheet and leaves authored content intact", () => {
    const power: ContentEntity = {
      ...feature("POWER", "Synthetic power"),
      type: "Power",
      specifics: [
        {
          name: "Effect",
          value: "Base effect.",
          ordinal: 0,
          extraAttributes: [],
        },
        {
          name: " Option A",
          value: "Selected benefit.",
          ordinal: 1,
          extraAttributes: [],
        },
        {
          name: " Option B",
          value: "Other benefit.",
          ordinal: 2,
          extraAttributes: [],
        },
        {
          name: "Unrelated feature",
          value: "Do not guess this is conditional.",
          ordinal: 3,
          extraAttributes: [],
        },
      ],
    };
    const model = buildEvaluatedSheetModel(
      {
        details: {},
        abilities: {},
        stats: {},
        selectedRules: [],
        powers: [],
        loot: [],
        textStrings: {},
        levelCount: 1,
        source: "legacy-cache",
      },
      {
        formatVersion: 2,
        known: [],
        effectiveLevel: 1,
        levels: [],
        grabbag: [],
        inventory: [],
        alternates: [],
        baseAbilities: {},
        textStrings: {},
      },
      {
        ...evaluation,
        powers: [
          {
            definitionId: power.id,
            name: power.name,
            keywords: [],
            recoveries: [],
            variants: [],
            unsupported: [],
          },
        ],
      },
      [...content, power],
    );
    expect(model.powers[0]?.fields.map((field) => field.label.trim())).toEqual([
      "Effect",
      "Option A",
      "Unrelated feature",
    ]);
    expect(power.specifics).toHaveLength(4);
  });
});
