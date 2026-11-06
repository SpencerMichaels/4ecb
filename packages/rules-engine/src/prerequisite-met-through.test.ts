import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  evaluateCharacter,
  type CharacterOccurrence,
  type EvaluationInput,
} from "./evaluator";

// A prerequisite met only through a counts-as alternate names the element
// that granted it (CandidateDecision.prerequisiteMetThrough), so the builder
// can say "met through Torag".

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
  options: { prerequisites?: string; rules?: RuleStatement[] } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic fixture",
    sources: ["Synthetic fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
    ...(options.prerequisites === undefined
      ? {}
      : { prerequisites: options.prerequisites }),
  };
}

const definitions = [
  entity("ROOT", "1", "Level", {
    rules: [
      rule("select", { type: "Deity", optional: "true" }, 0),
      rule("select", { type: "Class", optional: "true" }, 1),
      rule("select", { type: "Feat", optional: "true" }, 2),
      rule("select", { type: "Language", optional: "true" }, 3),
    ],
  }),
  entity("ID_MORADIN", "Moradin", "Deity"),
  entity("ID_TORAG", "Torag", "Deity", {
    rules: [
      rule(
        "grant",
        { name: "ID_COUNTSASDEITY_MORADIN", type: "CountsAsDeity" },
        0,
      ),
    ],
  }),
  entity("ID_COUNTSASDEITY_MORADIN", "Moradin", "CountsAsDeity"),
  entity("ID_WARLORD", "Warlord", "Class"),
  // As in stock content, the class grants its CountsAsClass through an
  // internal Grants record, which the explanation skips.
  entity("ID_HYBRID_WARLORD", "Hybrid Warlord", "Class", {
    rules: [
      rule("grant", { name: "ID_GRANTS_HYBRID_WARLORD", type: "Grants" }, 0),
    ],
  }),
  entity("ID_GRANTS_HYBRID_WARLORD", "Hybrid Warlord", "Grants", {
    rules: [
      rule(
        "grant",
        { name: "ID_COUNTSASCLASS_WARLORD", type: "CountsAsClass" },
        0,
      ),
    ],
  }),
  entity("ID_COUNTSASCLASS_WARLORD", "Warlord", "CountsAsClass"),
  // A campaign's Celestial counts as Supernal, which no Language is named.
  entity("ID_CELESTIAL", "Celestial", "Language", {
    rules: [
      rule(
        "grant",
        { name: "ID_COUNTSASLANGUAGE_SUPERNAL", type: "CountsAsLanguage" },
        0,
      ),
    ],
  }),
  entity("ID_COUNTSASLANGUAGE_SUPERNAL", "Supernal", "CountsAsLanguage"),
  entity("ID_SUPERNAL_FEAT", "Synthetic Holy Speech", "Feat", {
    prerequisites: "fluent in Supernal",
  }),
  entity("ID_MORADIN_FEAT", "Moradin's Synthetic Blessing", "Feat", {
    prerequisites: "must worship Moradin",
  }),
  entity("ID_WARLORD_FEAT", "Synthetic Battle Cry", "Feat", {
    prerequisites: "Warlord",
  }),
];

const root: CharacterOccurrence = {
  id: "root",
  definitionId: "ROOT",
  acquiredLevel: 1,
  kind: "root",
};

function pick(
  id: string,
  definitionId: string,
  ruleOrdinal: number,
): CharacterOccurrence {
  return {
    id,
    definitionId,
    acquiredLevel: 1,
    parentId: "root",
    ruleOrdinal,
    choiceIndex: 0,
    kind: "choice",
  };
}

function feat(
  occurrences: readonly CharacterOccurrence[],
  definitionId: string,
) {
  const input: EvaluationInput = {
    level: 1,
    baseAbilities: {},
    occurrences: [root, ...occurrences],
    inventory: [],
  };
  return evaluateCharacter(input, definitions)
    .choices.find((choice) => choice.type === "Feat")
    ?.candidates.find((decision) => decision.definitionId === definitionId);
}

describe("prerequisite met through a counts-as alternate", () => {
  it("names the deity whose CountsAsDeity meets a worship requirement", () => {
    expect(
      feat([pick("deity", "ID_TORAG", 0)], "ID_MORADIN_FEAT"),
    ).toMatchObject({ eligible: true, prerequisiteMetThrough: ["ID_TORAG"] });
  });

  it("names the class whose CountsAsClass meets a class requirement", () => {
    expect(
      feat([pick("class", "ID_HYBRID_WARLORD", 1)], "ID_WARLORD_FEAT"),
    ).toMatchObject({
      eligible: true,
      prerequisiteMetThrough: ["ID_HYBRID_WARLORD"],
    });
  });

  it("names the language whose CountsAsLanguage meets a fluency requirement", () => {
    expect(
      feat([pick("language", "ID_CELESTIAL", 3)], "ID_SUPERNAL_FEAT"),
    ).toMatchObject({
      eligible: true,
      prerequisiteMetThrough: ["ID_CELESTIAL"],
    });
    expect(feat([], "ID_SUPERNAL_FEAT")?.eligible).toBe(false);
  });

  it("adds nothing for a directly met or unmet prerequisite", () => {
    const direct = feat([pick("deity", "ID_MORADIN", 0)], "ID_MORADIN_FEAT");
    expect(direct?.eligible).toBe(true);
    expect(direct).not.toHaveProperty("prerequisiteMetThrough");
    const directClass = feat(
      [pick("class", "ID_WARLORD", 1)],
      "ID_WARLORD_FEAT",
    );
    expect(directClass?.eligible).toBe(true);
    expect(directClass).not.toHaveProperty("prerequisiteMetThrough");
    const unmet = feat([], "ID_MORADIN_FEAT");
    expect(unmet?.eligible).toBe(false);
    expect(unmet).not.toHaveProperty("prerequisiteMetThrough");
  });
});
