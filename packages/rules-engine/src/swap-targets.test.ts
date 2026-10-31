import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  commandForEvaluatedChoice,
  projectBuildForEvaluation,
} from "./build-projection";
import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";

// What a replacement may lose (native D20Choice CheckReplaceElem,
// BuildReplaceList) and the automatic power-replace swap (UpdateReplacement,
// PowerReplaceCategory).

function statement(
  name: string,
  attributes: Readonly<Record<string, string>>,
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
  extra: Partial<ContentEntity> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public swap-target fixture",
    sources: ["Public swap-target fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "swap-targets", sourceOrdinal: 0 },
    ...extra,
  };
}

function power(
  id: string,
  name: string,
  categories: readonly string[],
  level: string,
  extra: Partial<ContentEntity> = {},
): ContentEntity {
  return entity(id, name, "Power", [], {
    categories: [id, ...categories],
    specifics: [
      { name: "Level", value: ` ${level} `, extraAttributes: [], ordinal: 0 },
      {
        name: "Power Usage",
        value: " Encounter ",
        extraAttributes: [],
        ordinal: 1,
      },
    ],
    ...extra,
  });
}

function occurrence(
  id: string,
  definitionId: string,
  acquiredLevel: number,
  kind: CharacterOccurrence["kind"],
  extra: Partial<CharacterOccurrence> = {},
): CharacterOccurrence {
  return { id, definitionId, acquiredLevel, kind, ...extra };
}

function input(level: number, occurrences: readonly CharacterOccurrence[]) {
  return {
    level,
    occurrences,
    inventory: [],
    baseAbilities: {},
    textStrings: {},
  } as const;
}

const errors = (result: ReturnType<typeof evaluateCharacter>) =>
  result.diagnostics.filter(({ severity }) => severity === "error");

describe("power-replace targets", () => {
  // As in the real content: a class feature grants the power a feat or a
  // later class feature trades ("ID_FMP_POWER_15849:ID_FMP_POWER_2339").
  const content = (powerReplace: string, optional = false) => [
    entity("WORD_FEATURE", "Majestic Word", "Class Feature", [
      statement("grant", { name: "ID_POWER_WORD", type: "Power" }, 0),
    ]),
    entity("SKALD_FEAT", "Skald Training", "Feat", [
      statement(
        "replace",
        {
          "power-replace": powerReplace,
          ...(optional ? { optional: "true" } : {}),
        },
        0,
      ),
    ]),
    power("ID_POWER_WORD", "Majestic Word", ["utility"], "1"),
    // Its own prerequisite limits picking it as a class power.
    power("ID_POWER_AURA", "Skald's Aura", ["utility"], "1", {
      prerequisites: "Skald",
    }),
  ];
  const saved = [
    occurrence("word", "WORD_FEATURE", 1, "root"),
    occurrence("feat", "SKALD_FEAT", 4, "grabbag"),
  ];

  it("lists a granted power for a power-replace (native skips its granted-element block)", () => {
    const result = evaluateCharacter(
      input(4, saved),
      content("Skald's Aura:utility,1", true),
    );
    const choice = result.choices.find(({ type }) => type === "Replacement");
    expect(
      choice?.replacementOptions?.map(({ replacesOccurrenceId }) => [
        replacesOccurrenceId,
      ]),
    ).toEqual([["word:grant:0"]]);
    expect(choice?.selectedOccurrenceId).toBeUndefined();
  });

  it("swaps on its own when GAIN and LOSE each name one power", () => {
    const result = evaluateCharacter(
      input(4, saved),
      content("ID_POWER_AURA:ID_POWER_WORD"),
    );
    expect(result.activeDefinitionIds).toContain("ID_POWER_AURA");
    expect(result.activeDefinitionIds).not.toContain("ID_POWER_WORD");
    const choice = result.choices.find(({ type }) => type === "Replacement");
    expect(choice?.selectedOccurrenceId).toBe("feat:power-replace:0");
    expect(
      result.occurrences.find(({ id }) => id === "feat:power-replace:0"),
    ).toMatchObject({ replacesId: "word:grant:0", parentId: "feat" });
    // The feat gives the power: its "Skald" prerequisite is not checked.
    expect(errors(result)).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("gives the power back when the feat goes", () => {
    const result = evaluateCharacter(
      input(4, [saved[0]!]),
      content("ID_POWER_AURA:ID_POWER_WORD"),
    );
    expect(result.activeDefinitionIds).toContain("ID_POWER_WORD");
    expect(result.activeDefinitionIds).not.toContain("ID_POWER_AURA");
  });

  it("keeps a category LOSE the player's choice", () => {
    const result = evaluateCharacter(
      input(4, saved),
      content("ID_POWER_AURA:utility,1"),
    );
    expect(result.activeDefinitionIds).toContain("ID_POWER_WORD");
    expect(
      result.choices.find(({ type }) => type === "Replacement")
        ?.selectedOccurrenceId,
    ).toBeUndefined();
  });

  it("chains a later swap onto an earlier swap's gain (binder pact powers, D105)", () => {
    // Level 13 trades the level-1 pact power, level 27 the level-13 one.
    const pact = [
      entity("PACT_1", "Level 1 Pact Encounter Power", "Class Feature", [
        statement("grant", { name: "ID_POWER_HOUND", type: "Power" }, 0),
      ]),
      entity("PACT_13", "Level 13 Pact Encounter Power", "Class Feature", [
        statement(
          "replace",
          { "power-replace": "ID_POWER_SHADOW:ID_POWER_HOUND" },
          0,
        ),
      ]),
      entity("PACT_27", "Level 27 Pact Encounter Power", "Class Feature", [
        statement(
          "replace",
          { "power-replace": "ID_POWER_UMBRAL:ID_POWER_SHADOW" },
          0,
        ),
      ]),
      power("ID_POWER_HOUND", "Hound of Dark Omen", ["encounter"], "1"),
      power("ID_POWER_SHADOW", "Haunting Shadow", ["encounter"], "13"),
      power("ID_POWER_UMBRAL", "Umbral Swap", ["encounter"], "27"),
    ];
    const result = evaluateCharacter(
      input(27, [
        occurrence("p1", "PACT_1", 1, "grabbag"),
        occurrence("p13", "PACT_13", 13, "grabbag"),
        occurrence("p27", "PACT_27", 27, "grabbag"),
      ]),
      pact,
    );
    expect(result.converged).toBe(true);
    expect(result.activeDefinitionIds).toContain("ID_POWER_UMBRAL");
    expect(result.activeDefinitionIds).not.toContain("ID_POWER_SHADOW");
    expect(result.activeDefinitionIds).not.toContain("ID_POWER_HOUND");
    const swaps = result.choices.filter(({ type }) => type === "Replacement");
    expect(
      swaps.map(({ selectedOccurrenceId }) => selectedOccurrenceId),
    ).toEqual(["p13:power-replace:0", "p27:power-replace:0"]);
    expect(result.replacedSelections?.map(({ id }) => id)).toEqual([
      "p13:power-replace:0",
    ]);
    expect(errors(result)).toEqual([]);
  });
});

describe("retraining targets", () => {
  // A class feature's power select with a rule default, a class feature's
  // feat select, a granted power, and a level retrain.
  const content = [
    entity("CLASS", "Warlock", "Class", [
      statement("grant", { name: "BLAST_FEATURE", type: "Class Feature" }, 0),
      statement("grant", { name: "RITUALS", type: "Class Feature" }, 1),
      statement("grant", { name: "ID_POWER_GRANTED", type: "Power" }, 2),
    ]),
    entity("BLAST_FEATURE", "Eldritch Blast", "Class Feature", [
      statement(
        "select",
        {
          type: "Power",
          number: "1",
          Category: "ID_POWER_BLAST|ID_POWER_STRIKE",
          default: "Eldritch Blast",
        },
        0,
      ),
    ]),
    entity("RITUALS", "Ritual Casting", "Class Feature", [
      statement(
        "select",
        { type: "Feat", number: "1", Category: "Ritual Casting" },
        0,
      ),
    ]),
    entity("ID_FEAT_RITUAL", "Ritual Caster", "Feat", [], {
      categories: ["Ritual Casting"],
    }),
    entity("ID_FEAT_OTHER", "Other Ritual Feat", "Feat", [], {
      categories: ["Ritual Casting"],
    }),
    entity("LEVEL_3", "3", "Level", [
      statement("replace", { retrain: "true", optional: "true" }, 0),
    ]),
    power("ID_POWER_BLAST", "Eldritch Blast", ["at-will"], "1"),
    power("ID_POWER_STRIKE", "Eldritch Strike", ["at-will"], "1"),
    power("ID_POWER_GRANTED", "Granted Power", ["at-will"], "1"),
  ];
  const saved = [
    occurrence("class", "CLASS", 1, "root"),
    occurrence("ritual-feat", "ID_FEAT_RITUAL", 1, "choice", {
      parentId: "class:grant:1",
      ruleOrdinal: 0,
      choiceIndex: 0,
    }),
    occurrence("level-3", "LEVEL_3", 3, "root"),
  ];

  it("offers an unsaved rule default, never a grant or a class feature's feat", () => {
    const result = evaluateCharacter(input(3, saved), content);
    const retrain = result.choices.find(({ type }) => type === "Replacement");
    const options = retrain?.replacementOptions ?? [];
    expect(
      options.map(({ replacesOccurrenceId }) => replacesOccurrenceId),
    ).toEqual(["class:grant:0:default:0:0"]);
    // The gain is the default's own select.
    expect(
      options[0]?.candidates
        .filter(({ reasons }) => !reasons.includes("category"))
        .map(({ definitionId }) => definitionId),
    ).toEqual(["ID_POWER_STRIKE"]);
  });

  it("stores the generated default a retrain gives up, so the retrain can name it", () => {
    const element = (
      id: string,
      definitionId: string,
      type: string,
      acquiredLevel: number,
    ) => ({
      id,
      identity: { definitionId, name: definitionId, type },
      acquiredLevel,
      legality: "rules-legal" as const,
      unresolved: false,
      children: [],
    });
    const build: CharacterBuild = {
      formatVersion: 3,
      known: [],
      effectiveLevel: 3,
      levels: [
        { level: 1, root: element("class", "CLASS", "Class", 1) },
        { level: 3, root: element("level-3", "LEVEL_3", "Level", 3) },
      ],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    const initial = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    const retrain = initial.choices.find(({ type }) => type === "Replacement")!;
    expect(
      retrain.replacementOptions?.map(
        ({ replacesOccurrenceId }) => replacesOccurrenceId,
      ),
    ).toEqual(["class:grant:0:default:0:0"]);
    const command = commandForEvaluatedChoice(
      build,
      retrain,
      initial.occurrences,
      content,
      {
        ...element("strike", "ID_POWER_STRIKE", "Power", 3),
        replacesId: "class:grant:0:default:0:0",
      },
      (index) => `placeholder:${index}`,
    );
    expect(command).toMatchObject({
      kind: "batch",
      commands: [
        { kind: "choose", occurrence: { id: "class:grant:0" } },
        {
          kind: "choose",
          parentId: "level-3",
          occurrence: { id: "strike", replacesId: "class:grant:0:default:0:0" },
        },
      ],
    });
    const completed = evaluateCharacter(
      projectBuildForEvaluation(
        applyCharacterCommand(build, command!),
        content,
      ),
      content,
    );
    expect(
      completed.choices.find(({ type }) => type === "Replacement"),
    ).toMatchObject({ selectedOccurrenceId: "strike" });
    expect(completed.activeDefinitionIds).toContain("ID_POWER_STRIKE");
    expect(completed.activeDefinitionIds).not.toContain("ID_POWER_BLAST");
  });

  it("never offers a power a power-replace swap gained, and flags a saved retrain of one", () => {
    const swapContent = [
      ...content,
      entity("SWAP_FEAT", "Swap Feat", "Feat", [
        statement(
          "replace",
          { "power-replace": "ID_POWER_GAINED:at-will", optional: "true" },
          0,
        ),
      ]),
      power("ID_POWER_GAINED", "Gained Power", ["at-will"], "1"),
    ];
    const withSwap = [
      ...saved,
      occurrence("blast", "ID_POWER_BLAST", 1, "choice", {
        parentId: "class:grant:0",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
      occurrence("swap-feat", "SWAP_FEAT", 2, "grabbag"),
      occurrence("gained", "ID_POWER_GAINED", 2, "choice", {
        parentId: "swap-feat",
        ruleOrdinal: 0,
        replacesId: "blast",
      }),
    ];
    const listed = evaluateCharacter(input(3, withSwap), swapContent)
      .choices.find(
        ({ providerOccurrenceId }) => providerOccurrenceId === "level-3",
      )
      ?.replacementOptions?.map(({ definitionId }) => definitionId);
    expect(listed).not.toContain("ID_POWER_GAINED");
    const retrained = evaluateCharacter(
      input(3, [
        ...withSwap,
        occurrence("strike", "ID_POWER_STRIKE", 3, "choice", {
          parentId: "level-3",
          ruleOrdinal: 0,
          replacesId: "gained",
        }),
      ]),
      swapContent,
    );
    expect(
      retrained.diagnostics.some(
        ({ code, message }) =>
          code === "choice.ineligible" && /swap gained it/.test(message),
      ),
    ).toBe(true);
  });
});
