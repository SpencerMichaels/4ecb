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
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public construction-conformance fixture",
    sources: ["Public construction-conformance fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "construction-conformance", sourceOrdinal: 0 },
  };
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

describe("native construction conformance", () => {
  it("defers a future-level grant and its subtree until that level", () => {
    const content = [
      entity("LEVEL", "Level 1", "Level", [
        statement("grant", { name: "FUTURE", type: "Feature", Level: "3" }, 0),
      ]),
      entity("FUTURE", "Future feature", "Feature", [
        statement("grant", { name: "DESCENDANT", type: "Feature" }, 0),
      ]),
      entity("DESCENDANT", "Deferred descendant", "Feature", [
        statement("statadd", { name: "Deferred Stat", value: "+1" }, 0),
      ]),
    ];
    const saved = [occurrence("level", "LEVEL", 1, "root")];

    const historical = evaluateCharacter(input(1, saved), content);
    expect(historical.activeDefinitionIds).toEqual(["LEVEL"]);
    expect(historical.stats["Deferred Stat"]).toBeUndefined();

    const current = evaluateCharacter(input(3, saved), content);
    expect(current.activeDefinitionIds).toEqual([
      "LEVEL",
      "FUTURE",
      "DESCENDANT",
    ]);
    expect(current.stats["Deferred Stat"]?.value).toBe(1);
    expect(current.iterations).toBeGreaterThan(1);
  });

  it("restarts generated topology until a nested choice is materialized", () => {
    const content = [
      entity("LEVEL", "Level 1", "Level", [
        statement("grant", { name: "OUTER", type: "Feature" }, 0),
      ]),
      entity("OUTER", "Outer", "Feature", [
        statement("grant", { name: "INNER", type: "Feature" }, 0),
      ]),
      entity("INNER", "Inner", "Feature", [
        statement("select", { type: "Feat", number: "1" }, 0),
      ]),
      entity("FEAT", "Synthetic feat", "Feat"),
    ];

    const result = evaluateCharacter(
      input(1, [occurrence("level", "LEVEL", 1, "root")]),
      content,
    );

    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(3);
    expect(result.choices).toEqual([
      expect.objectContaining({
        providerOccurrenceId: "level:grant:0:grant:0",
        type: "Feat",
      }),
    ]);
  });

  it("evaluates level-one grabbag topology before final rules", () => {
    const content = [
      entity("HOUSE", "House option", "Feature", [
        statement("grant", { name: "GRANTED", type: "Feature" }, 0),
      ]),
      entity("GRANTED", "Granted option", "Feature", [
        statement("statadd", { name: "Grabbag Stat", value: "+2" }, 0),
      ]),
    ];

    const result = evaluateCharacter(
      input(1, [occurrence("house", "HOUSE", 1, "grabbag")]),
      content,
    );

    expect(result.activeDefinitionIds).toEqual(["HOUSE", "GRANTED"]);
    expect(result.stats["Grabbag Stat"]?.value).toBe(2);
  });

  it("drops every occurrence of a named definition without destroying saved input", () => {
    const content = [
      entity("DROP", "Suppress duplicate", "Feature", [
        statement("drop", { name: "Target", type: "Feat" }, 0),
      ]),
      entity("TARGET", "Target", "Feat"),
    ];
    const saved = [
      occurrence("drop", "DROP", 1, "root"),
      occurrence("target-a", "TARGET", 1, "choice"),
      occurrence("target-b", "TARGET", 1, "grabbag"),
    ];

    const result = evaluateCharacter(input(1, saved), content);
    expect(result.activeDefinitionIds).toEqual(["DROP"]);
    expect(saved.map(({ id }) => id)).toEqual(["drop", "target-a", "target-b"]);
  });

  it.each([
    ["ordinary", {}],
    ["retrain", { retrain: "true" }],
    ["multiclass", { multiclass: "Synthetic class" }],
    ["power swap", { powerswap: "Synthetic,encounter,1" }],
    ["power replace", { "power-replace": "Synthetic,encounter,1" }],
  ] as const)(
    "keeps explicit source occurrence identity for %s replacement",
    (_label, mode) => {
      const content = [
        entity("SOURCE_PROVIDER", "Source provider", "Feature", [
          statement("select", { type: "Power", number: "1" }, 0),
        ]),
        entity("REPLACE_PROVIDER", "Replacement provider", "Level", [
          statement("replace", mode, 0),
        ]),
        entity("OLD", "Old power", "Power"),
        entity("NEW", "New power", "Power"),
      ];
      const saved = [
        occurrence("source-provider", "SOURCE_PROVIDER", 1, "root"),
        occurrence("old-occurrence", "OLD", 1, "choice", {
          parentId: "source-provider",
          ruleOrdinal: 0,
          choiceIndex: 0,
        }),
        occurrence("replace-provider", "REPLACE_PROVIDER", 2, "root"),
      ];

      const replacement = evaluateCharacter(
        input(2, saved),
        content,
      ).choices.find((choice) => choice.type === "Replacement");
      expect(replacement?.replacementOptions).toContainEqual(
        expect.objectContaining({
          replacesOccurrenceId: "old-occurrence",
          definitionId: "OLD",
          candidates: expect.arrayContaining([
            expect.objectContaining({ definitionId: "NEW" }),
          ]),
        }),
      );
    },
  );

  it("follows an explicit replacement chain while preserving both source occurrences", () => {
    const content = [
      entity("SOURCE_PROVIDER", "Source provider", "Feature", [
        statement("select", { type: "Power", number: "1" }, 0),
      ]),
      entity("REPLACE_TWO", "Second replacement", "Level", [
        statement("replace", { retrain: "true" }, 0),
      ]),
      entity("OLD", "Old power", "Power"),
      entity("MIDDLE", "Middle power", "Power"),
      entity("NEW", "New power", "Power"),
    ];
    const saved = [
      occurrence("source-provider", "SOURCE_PROVIDER", 1, "root"),
      occurrence("old-occurrence", "OLD", 1, "choice", {
        parentId: "source-provider",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
      occurrence("middle-occurrence", "MIDDLE", 2, "choice", {
        parentId: "replace-one",
        ruleOrdinal: 0,
        choiceIndex: 0,
        replacesId: "old-occurrence",
      }),
      occurrence("replace-two", "REPLACE_TWO", 3, "root"),
      occurrence("new-occurrence", "NEW", 3, "choice", {
        parentId: "replace-two",
        ruleOrdinal: 0,
        choiceIndex: 0,
        replacesId: "middle-occurrence",
      }),
    ];

    const result = evaluateCharacter(input(3, saved), content);
    expect(result.activeDefinitionIds).toContain("NEW");
    expect(result.activeDefinitionIds).not.toContain("OLD");
    expect(result.activeDefinitionIds).not.toContain("MIDDLE");
    expect(saved.filter(({ replacesId }) => replacesId !== undefined)).toEqual([
      expect.objectContaining({
        id: "middle-occurrence",
        replacesId: "old-occurrence",
      }),
      expect.objectContaining({
        id: "new-occurrence",
        replacesId: "middle-occurrence",
      }),
    ]);
    expect(
      result.choices.find(
        (choice) => choice.providerOccurrenceId === "source-provider",
      )?.selectedOccurrenceId,
    ).toBe("new-occurrence");
  });

  it("projects spellbook alternates into their named select slot without moving their durable envelope", () => {
    const content = [
      entity("LEVEL", "Level 1", "Level", [
        statement("grant", { name: "BOOK", type: "Class Feature" }, 0),
      ]),
      entity("BOOK", "Spellbook", "Class Feature", [
        statement(
          "select",
          {
            type: "Power",
            number: "1",
            Category: "Wizard,daily,1",
            spellbook: "Power Daily 1",
            Level: "1",
          },
          0,
        ),
      ]),
      entity("SPELL", "Prepared spell", "Power"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: {
              definitionId: "LEVEL",
              name: "Level 1",
              type: "Level",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            children: [
              {
                id: "book",
                identity: {
                  definitionId: "BOOK",
                  name: "Spellbook",
                  type: "Class Feature",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                children: [],
                unresolved: false,
              },
            ],
            unresolved: false,
          },
        },
      ],
      grabbag: [],
      inventory: [],
      alternates: [
        {
          id: "alternate",
          selectName: "Power Daily 1",
          provider: {
            definitionId: "BOOK",
            name: "Spellbook",
            type: "Class Feature",
          },
          choice: {
            id: "prepared-spell",
            identity: {
              definitionId: "SPELL",
              name: "Prepared spell",
              type: "Power",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            children: [],
            unresolved: false,
          },
        },
      ],
      baseAbilities: {},
      textStrings: {},
    };

    const projected = projectBuildForEvaluation(build, content);
    expect(projected.occurrences).toContainEqual(
      expect.objectContaining({
        id: "prepared-spell",
        definitionId: "SPELL",
        kind: "choice",
        parentId: "book",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
    );
    const evaluated = evaluateCharacter(projected, content);
    expect(evaluated.choices).toContainEqual(
      expect.objectContaining({
        providerOccurrenceId: "book",
        selectedOccurrenceId: "prepared-spell",
      }),
    );
    expect(evaluated.complete).toBe(true);
    const spellbookChoice = evaluated.choices.find(
      (choice) => choice.spellbook === "Power Daily 1",
    )!;
    const command = commandForEvaluatedChoice(
      build,
      spellbookChoice,
      evaluated.occurrences,
      content,
      {
        id: "new-prepared-spell",
        identity: {
          definitionId: "SPELL",
          name: "Prepared spell",
          type: "Power",
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `placeholder:${index}`,
    );
    expect(command).toMatchObject({
      kind: "put-alternate",
      alternate: {
        id: "alternate",
        selectName: "Power Daily 1",
        choice: { id: "new-prepared-spell" },
      },
    });
    expect(
      applyCharacterCommand(build, command!).alternates[0]?.choice.id,
    ).toBe("new-prepared-spell");
    expect(build.alternates).toHaveLength(1);
    expect(build.grabbag).toEqual([]);
  });

  it("does not require an impossible replacement", () => {
    const content = [
      entity("LEVEL", "Level 1", "Level", [
        statement("replace", { retrain: "true" }, 0),
      ]),
    ];

    const result = evaluateCharacter(
      input(1, [occurrence("level", "LEVEL", 1, "root")]),
      content,
    );

    expect(result.choices).toEqual([
      expect.objectContaining({
        type: "Replacement",
        optional: false,
        replacementOptions: [],
      }),
    ]);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
    expect(result.complete).toBe(true);
  });

  it("drops the active replacement-chain tip selected by a named select", () => {
    const content = [
      entity("CHOOSER", "Chooser", "Feature", [
        statement(
          "select",
          { type: "Power", number: "1", name: "Mastery Power" },
          0,
        ),
      ]),
      entity("DROPPER", "Dropper", "Feature", [
        statement("drop", { select: "Mastery Power" }, 0),
      ]),
      entity("OLD", "Old power", "Power"),
      entity("NEW", "New power", "Power"),
    ];
    const saved = [
      occurrence("chooser", "CHOOSER", 1, "root"),
      occurrence("old", "OLD", 1, "choice", {
        parentId: "chooser",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
      occurrence("new", "NEW", 2, "choice", {
        replacesId: "old",
        parentId: "replacement-provider",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
      occurrence("dropper", "DROPPER", 2, "root"),
    ];

    const result = evaluateCharacter(input(2, saved), content);
    expect(result.activeDefinitionIds).not.toContain("OLD");
    expect(result.activeDefinitionIds).not.toContain("NEW");
    expect(saved.map(({ id }) => id)).toContain("new");
  });

  it("applies a blank select default and restarts topology", () => {
    const content = [
      entity("CHOOSER", "Chooser", "Feature", [
        statement(
          "select",
          { type: "Feat", number: "1", default: "DEFAULT" },
          0,
        ),
      ]),
      entity("DEFAULT", "Default feat", "Feat", [
        statement("grant", { name: "CHILD", type: "Feature" }, 0),
      ]),
      entity("CHILD", "Default child", "Feature", [
        statement("statadd", { name: "Default Stat", value: "+1" }, 0),
      ]),
    ];

    const result = evaluateCharacter(
      input(1, [occurrence("chooser", "CHOOSER", 1, "root")]),
      content,
    );
    expect(result.activeDefinitionIds).toEqual(["CHOOSER", "DEFAULT", "CHILD"]);
    expect(result.choices[0]?.selectedOccurrenceId).toBe("chooser:default:0:0");
    expect(result.stats["Default Stat"]?.value).toBe(1);
    expect(result.iterations).toBeGreaterThan(1);
  });

  it("does not require an impossible existing select", () => {
    const content = [
      entity("CHOOSER", "Chooser", "Feature", [
        statement("select", { type: "Feat", number: "1", existing: "true" }, 0),
      ]),
      entity("UNOWNED", "Not active", "Feat"),
    ];

    const result = evaluateCharacter(
      input(1, [occurrence("chooser", "CHOOSER", 1, "root")]),
      content,
    );
    expect(result.choices[0]?.candidates).toEqual([
      expect.objectContaining({
        definitionId: "UNOWNED",
        rulesLegal: false,
        reasons: ["existing"],
      }),
    ]);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
    expect(result.complete).toBe(true);
  });

  it("clears ordinary and pass-through duplicates but retains defaults and replacement sources", () => {
    const wrapper = entity("WRAPPER", "Training wrapper", "Feature", [
      statement("grant", { name: "TRAINING", type: "Skill Training" }, 0),
    ]);
    const training = entity(
      "TRAINING",
      "Skill Training (Arcana)",
      "Skill Training",
    );
    const content = [
      entity("CHOOSER", "Chooser", "Feature", [
        statement("select", { type: "Feature", number: "1" }, 0),
      ]),
      entity("DEFAULT_CHOOSER", "Default chooser", "Feature", [
        statement(
          "select",
          {
            type: "Feature",
            number: "1",
            default: "Training wrapper",
          },
          0,
        ),
      ]),
      wrapper,
      training,
    ];
    const selectedWrapper = (providerId: string) =>
      occurrence(`${providerId}-wrapper`, "WRAPPER", 1, "choice", {
        parentId: providerId,
        ruleOrdinal: 0,
        choiceIndex: 0,
      });
    const activeTraining = occurrence(
      "active-training",
      "TRAINING",
      1,
      "grabbag",
    );

    const duplicate = evaluateCharacter(
      input(1, [
        occurrence("chooser", "CHOOSER", 1, "root"),
        selectedWrapper("chooser"),
        activeTraining,
      ]),
      content,
    );
    expect(duplicate.activeDefinitionIds).not.toContain("WRAPPER");
    expect(duplicate.choices[0]?.selectedOccurrenceId).toBeUndefined();

    const retainedDefault = evaluateCharacter(
      input(1, [
        occurrence("default-chooser", "DEFAULT_CHOOSER", 1, "root"),
        selectedWrapper("default-chooser"),
        activeTraining,
      ]),
      content,
    );
    expect(retainedDefault.choices[0]?.selectedOccurrenceId).toBe(
      "default-chooser-wrapper",
    );
    expect(retainedDefault.activeDefinitionIds).toContain("WRAPPER");

    const replacementSource = evaluateCharacter(
      input(2, [
        occurrence("chooser", "CHOOSER", 1, "root"),
        occurrence("old", "WRAPPER", 1, "choice", {
          parentId: "chooser",
          ruleOrdinal: 0,
          choiceIndex: 0,
        }),
        occurrence("replacement", "WRAPPER", 2, "choice", {
          parentId: "replacement-provider",
          ruleOrdinal: 0,
          choiceIndex: 0,
          replacesId: "old",
        }),
      ]),
      content,
    );
    expect(replacementSource.activeDefinitionIds).toContain("WRAPPER");
    expect(replacementSource.choices[0]?.selectedOccurrenceId).toBe(
      "replacement",
    );
  });
});
