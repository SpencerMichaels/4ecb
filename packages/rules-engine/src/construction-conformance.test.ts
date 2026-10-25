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
  it("keeps a saved choice dormant while its select requirement is false", () => {
    const content = [
      // As in the real content, the style is chosen under a different
      // element: a requirement never sees its own element's children.
      entity("STYLE", "Fighting Style", "Class Feature", [
        statement("select", { type: "Fighting Style", number: "1" }, 0),
      ]),
      entity("RANGER", "Ranger", "Class", [
        statement(
          "select",
          {
            type: "Class Feature",
            number: "1",
            requires: "!BEAST_MASTERY",
          },
          1,
        ),
      ]),
      entity("BEAST_MASTERY", "Beast Mastery", "Fighting Style"),
      entity("ARCHER", "Archer Fighting Style", "Fighting Style"),
      entity("PRIME_SHOT", "Prime Shot", "Class Feature", [
        statement("statadd", { name: "Ranged Attack", value: "+1" }, 0),
      ]),
    ];
    const ranger = occurrence("ranger", "RANGER", 1, "root");
    const primeShot = occurrence("prime-shot", "PRIME_SHOT", 1, "choice", {
      parentId: ranger.id,
      ruleOrdinal: 1,
      choiceIndex: 0,
    });
    const beastMastery = occurrence(
      "beast-mastery",
      "BEAST_MASTERY",
      1,
      "choice",
      { parentId: "style", ruleOrdinal: 0, choiceIndex: 0 },
    );
    const style = occurrence("style", "STYLE", 1, "root");

    const beastMaster = evaluateCharacter(
      input(1, [ranger, style, beastMastery, primeShot]),
      content,
    );
    expect(beastMaster.activeDefinitionIds).not.toContain("PRIME_SHOT");
    expect(beastMaster.choices).not.toContainEqual(
      expect.objectContaining({ selectedOccurrenceId: primeShot.id }),
    );
    expect(beastMaster.stats["Ranged Attack"]?.value).toBeUndefined();

    const archer = evaluateCharacter(
      input(1, [
        ranger,
        style,
        { ...beastMastery, definitionId: "ARCHER" },
        primeShot,
      ]),
      content,
    );
    expect(archer.activeDefinitionIds).toContain("PRIME_SHOT");
    expect(archer.choices).toContainEqual(
      expect.objectContaining({ selectedOccurrenceId: primeShot.id }),
    );
    expect(archer.stats["Ranged Attack"]?.value).toBe(1);
  });

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
    ["power replace", { "power-replace": "NEW:Synthetic,encounter,1" }],
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
        // Within the power-swap category, which a swap can only lose from.
        {
          ...entity("OLD", "Old power", "Power"),
          categories: ["Synthetic", "encounter"],
          specifics: [
            { name: "Level", value: "1", extraAttributes: [], ordinal: 0 },
          ],
        },
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

  describe("power-replace (native PowerReplaceCategory)", () => {
    const power = (
      id: string,
      name: string,
      categories: readonly string[],
      level?: string,
    ): ContentEntity => ({
      ...entity(id, name, "Power"),
      categories,
      specifics:
        level === undefined
          ? []
          : [{ name: "Level", value: level, extraAttributes: [], ordinal: 0 }],
    });
    const content = (powerReplace: string) => [
      entity("CLASS_SLOTS", "Class slots", "Feature", [
        statement("select", { type: "Power", number: "4" }, 0),
      ]),
      entity("SWAP_FEAT", "Swap feat", "Feat", [
        statement("replace", { "power-replace": powerReplace }, 0),
      ]),
      power("UTILITY_2", "Utility two", ["utility"], "2"),
      power("UTILITY_6", "Utility six", ["utility"], "6"),
      power("UTILITY_10", "Utility ten", ["utility"], "10"),
      power("ATTACK_7", "Attack seven", ["encounter", "attack"], "7"),
      power("GAINED", "Gained power", ["utility"], "6"),
      power("OTHER", "Other utility", ["utility"], "6"),
    ];
    const saved = (swapLevel: number) => [
      occurrence("slots", "CLASS_SLOTS", 1, "root"),
      ...["UTILITY_2", "UTILITY_6", "UTILITY_10", "ATTACK_7"].map(
        (definitionId, choiceIndex) =>
          occurrence(`pick-${definitionId}`, definitionId, 1, "choice", {
            parentId: "slots",
            ruleOrdinal: 0,
            choiceIndex,
          }),
      ),
      occurrence("swap", "SWAP_FEAT", swapLevel, "grabbag"),
    ];
    const replacement = (powerReplace: string, swapLevel = 10) =>
      evaluateCharacter(
        input(10, saved(swapLevel)),
        content(powerReplace),
      ).choices.find((choice) => choice.type === "Replacement");

    it("loses only a power matching the category after ':' and gains the named power", () => {
      const choice = replacement("gained power:utility,6+");
      expect(
        choice?.replacementOptions?.map((option) => option.definitionId),
      ).toEqual(["UTILITY_6", "UTILITY_10"]);
      for (const option of choice?.replacementOptions ?? [])
        expect(
          option.candidates.map((candidate) => candidate.definitionId),
        ).toEqual(["GAINED"]);
    });

    it("reads a bare level as that level or lower", () => {
      expect(
        replacement("GAINED:utility,6")?.replacementOptions?.map(
          (option) => option.definitionId,
        ),
      ).toEqual(["UTILITY_2", "UTILITY_6"]);
    });

    it("finds the gained power by ID and offers powers held at the swap's own level", () => {
      const choice = replacement("GAINED:encounter,attack", 1);
      expect(
        choice?.replacementOptions?.map((option) => [
          option.definitionId,
          option.candidates.map((candidate) => candidate.definitionId),
        ]),
      ).toEqual([["ATTACK_7", ["GAINED"]]]);
    });

    it("offers nothing when the gained power does not exist", () => {
      expect(replacement("Missing power:utility")?.replacementOptions).toEqual(
        [],
      );
    });

    it("applies the swap: the lost power is gone and the named power is held", () => {
      const result = evaluateCharacter(
        input(10, [
          ...saved(10),
          occurrence("gain", "GAINED", 10, "choice", {
            parentId: "swap",
            ruleOrdinal: 0,
            replacesId: "pick-UTILITY_6",
          }),
        ]),
        content("Gained power:utility,6+"),
      );
      expect(result.activeDefinitionIds).toContain("GAINED");
      expect(result.activeDefinitionIds).not.toContain("UTILITY_6");
      expect(
        result.diagnostics.filter(
          (diagnostic) => diagnostic.severity === "error",
        ),
      ).toEqual([]);
    });

    it("reads a power's level from its category number when it has no Level field", () => {
      const result = evaluateCharacter(
        input(3, [occurrence("slot", "SLOT", 1, "root")]),
        [
          entity("SLOT", "Encounter slot", "Feature", [
            statement(
              "select",
              { type: "Power", number: "1", Category: "encounter,1" },
              0,
            ),
          ]),
          power("CATEGORY_LEVEL", "Category level", ["encounter", "1"]),
          power("NO_LEVEL", "No level", ["encounter"]),
        ],
      );
      const candidates = result.choices[0]?.candidates ?? [];
      expect(
        candidates.find(
          (candidate) => candidate.definitionId === "CATEGORY_LEVEL",
        )?.eligible,
      ).toBe(true);
      expect(
        candidates.find((candidate) => candidate.definitionId === "NO_LEVEL")
          ?.reasons,
      ).toContain("category");
    });
  });

  it("lets a level's retrain change the beast companion (Martial Power p. 42)", () => {
    const beast = (id: string, name: string): ContentEntity => ({
      ...entity(id, name, "Companion"),
      specifics: [
        { name: "Attack Bonus", value: "2", extraAttributes: [], ordinal: 0 },
        { name: "Damage", value: "1d8", extraAttributes: [], ordinal: 1 },
      ],
    });
    const content = [
      entity("BEAST_MASTERY", "Beast Mastery", "Class Feature", [
        statement("select", { type: "Companion", number: "1" }, 0),
        statement("select", { type: "Familiar", number: "1" }, 1),
      ]),
      entity("LEVEL_5", "Level 5", "Level", [
        statement("replace", { retrain: "true" }, 0),
      ]),
      beast("WOLF", "Wolf"),
      beast("BEAR", "Bear"),
      // A Companion record without a beast stat block is not retrained.
      entity("SUMMON_LORE", "Summon lore", "Companion"),
      entity("SPRITE", "Sprite", "Familiar"),
    ];
    const saved = [
      occurrence("mastery", "BEAST_MASTERY", 1, "root"),
      occurrence("wolf", "WOLF", 1, "choice", {
        parentId: "mastery",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
      occurrence("sprite", "SPRITE", 1, "choice", {
        parentId: "mastery",
        ruleOrdinal: 1,
        choiceIndex: 0,
      }),
      occurrence("level-5", "LEVEL_5", 5, "root"),
    ];
    const retraining = evaluateCharacter(input(5, saved), content).choices.find(
      (choice) => choice.type === "Replacement",
    );
    expect(
      retraining?.replacementOptions?.map((option) => option.definitionId),
    ).toEqual(["WOLF"]);
    expect(
      retraining?.replacementOptions?.[0]?.candidates.map(
        (candidate) => candidate.definitionId,
      ),
    ).toEqual(expect.arrayContaining(["BEAR"]));
  });

  it("uses a power-swap rule's gain category instead of the displaced slot", () => {
    const oldPower = {
      ...entity("OLD", "Old power", "Power"),
      categories: ["Wizard", "daily", "1"],
      specifics: [
        { name: "Level", value: "1", extraAttributes: [], ordinal: 0 },
      ],
    };
    const newPower = {
      ...entity("NEW", "New power", "Power"),
      categories: ["Wizard", "daily", "15"],
      specifics: [
        { name: "Level", value: "15", extraAttributes: [], ordinal: 0 },
      ],
    };
    const content = [
      entity("SOURCE_PROVIDER", "Source provider", "Feature", [
        statement(
          "select",
          {
            type: "Power",
            number: "1",
            Category: "Wizard,daily,1",
          },
          0,
        ),
      ]),
      entity("REPLACE_PROVIDER", "Replacement provider", "Level", [
        statement("replace", { powerswap: "Wizard,daily,15", Level: "15" }, 0),
      ]),
      oldPower,
      newPower,
    ];
    const result = evaluateCharacter(
      input(15, [
        occurrence("source-provider", "SOURCE_PROVIDER", 1, "root"),
        occurrence("old", "OLD", 1, "choice", {
          parentId: "source-provider",
          ruleOrdinal: 0,
          choiceIndex: 0,
        }),
        occurrence("replace-provider", "REPLACE_PROVIDER", 15, "root"),
        occurrence("new", "NEW", 15, "choice", {
          parentId: "replace-provider",
          ruleOrdinal: 0,
          choiceIndex: 0,
          replacesId: "old",
        }),
      ]),
      content,
    );
    const replacement = result.choices.find(
      (choice) => choice.providerOccurrenceId === "replace-provider",
    );

    expect(replacement?.replacementOptions?.[0]?.candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "NEW",
        rulesLegal: true,
        reasons: [],
      }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "choice.ineligible",
        occurrenceId: "new",
      }),
    );
  });

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
      formatVersion: 3,
      known: [],
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

  it("restores a power whose swap went dormant", () => {
    // Taking an Assassin's Strike upgrade grants No Level 17 Encounter
    // Power, which switches off the level-17 swap made earlier: the power
    // it displaced is active again and its slot stays filled.
    const content = [
      entity("LEVEL_3", "3", "Level", [
        statement("select", { type: "Power", number: "1" }, 0),
      ]),
      entity("LEVEL_17", "17", "Level", [
        statement(
          "replace",
          { powerswap: "Synthetic", requires: "!NO_SWAP" },
          0,
        ),
      ]),
      entity("UPGRADE", "Strike upgrade", "Class Feature", [
        statement("grant", { name: "NO_SWAP", type: "Internal" }, 0),
      ]),
      entity("NO_SWAP", "No Level 17 Encounter Power", "Internal"),
      { ...entity("OLD", "Old power", "Power"), categories: ["Synthetic"] },
      { ...entity("NEW", "New power", "Power"), categories: ["Synthetic"] },
    ];
    const saved = [
      occurrence("level-3", "LEVEL_3", 3, "root"),
      occurrence("old", "OLD", 3, "choice", {
        parentId: "level-3",
        ruleOrdinal: 0,
        choiceIndex: 0,
      }),
      occurrence("level-17", "LEVEL_17", 17, "root"),
      occurrence("new", "NEW", 17, "choice", {
        parentId: "level-17",
        ruleOrdinal: 0,
        choiceIndex: 0,
        replacesId: "old",
      }),
    ];
    const swapped = evaluateCharacter(input(17, saved), content);
    expect(swapped.activeDefinitionIds).toContain("NEW");
    expect(swapped.activeDefinitionIds).not.toContain("OLD");

    const dormant = evaluateCharacter(
      input(17, [...saved, occurrence("upgrade", "UPGRADE", 17, "root")]),
      content,
    );
    expect(dormant.converged).toBe(true);
    expect(dormant.activeDefinitionIds).toContain("OLD");
    expect(dormant.activeDefinitionIds).not.toContain("NEW");
    expect(dormant.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
  });

  it("does not offer a swap gain the character already owns", () => {
    const content = [
      entity("LEVEL_1", "1", "Level", [
        statement("select", { type: "Power", number: "2" }, 0),
      ]),
      entity("LEVEL_13", "13", "Level", [
        statement("replace", { powerswap: "Synthetic" }, 0),
      ]),
      { ...entity("LOST", "Lost power", "Power"), categories: ["Synthetic"] },
      { ...entity("KEPT", "Kept power", "Power"), categories: ["Synthetic"] },
      { ...entity("FRESH", "Fresh power", "Power"), categories: ["Synthetic"] },
    ];
    const result = evaluateCharacter(
      input(13, [
        occurrence("level-1", "LEVEL_1", 1, "root"),
        occurrence("lost", "LOST", 1, "choice", {
          parentId: "level-1",
          ruleOrdinal: 0,
          choiceIndex: 0,
        }),
        occurrence("kept", "KEPT", 1, "choice", {
          parentId: "level-1",
          ruleOrdinal: 0,
          choiceIndex: 1,
        }),
        occurrence("level-13", "LEVEL_13", 13, "root"),
      ]),
      content,
    );
    const swap = result.choices.find(({ type }) => type === "Replacement");
    const losingLost = swap?.replacementOptions?.find(
      ({ replacesOccurrenceId }) => replacesOccurrenceId === "lost",
    );
    expect(losingLost?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definitionId: "KEPT",
          eligible: false,
          reasons: ["owned"],
        }),
        expect.objectContaining({ definitionId: "FRESH", eligible: true }),
      ]),
    );
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
    // The dropped select is unlinked, not reopened (Level 19 Cavalier Daily
    // Power drops the level-5 daily select).
    expect(result.choices).not.toContainEqual(
      expect.objectContaining({ providerOccurrenceId: "chooser" }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
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

  it("treats legacy Build records as optional suggestion presets", () => {
    const result = evaluateCharacter(
      input(1, [occurrence("class", "CLASS", 1, "root")]),
      [
        entity("CLASS", "Class", "Class", [
          statement("select", { type: "Build", number: "1" }, 0),
        ]),
        entity("BUILD", "Suggested build", "Build"),
      ],
    );

    expect(result.choices[0]).toMatchObject({ type: "Build", optional: true });
    expect(result.complete).toBe(true);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
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

  it("retains an earlier choice when a later existing selector grants another use", () => {
    const content = [
      entity("LEVEL", "Level", "Level", [
        statement("select", { type: "Power", number: "1" }, 0),
      ]),
      entity("EXTRA_USE", "Extra use", "Feature", [
        statement(
          "select",
          { type: "Power", number: "1", existing: "true" },
          0,
        ),
      ]),
      entity("POWER", "Encounter power", "Power"),
    ];
    const result = evaluateCharacter(
      input(11, [
        occurrence("level", "LEVEL", 1, "root"),
        occurrence("original", "POWER", 1, "choice", {
          parentId: "level",
          ruleOrdinal: 0,
          choiceIndex: 0,
        }),
        occurrence("extra-use", "EXTRA_USE", 11, "root"),
        occurrence("existing-reference", "POWER", 11, "choice", {
          parentId: "extra-use",
          ruleOrdinal: 0,
          choiceIndex: 0,
        }),
      ]),
      content,
    );

    expect(result.choices).toEqual([
      expect.objectContaining({
        providerOccurrenceId: "level",
        selectedOccurrenceId: "original",
      }),
      expect.objectContaining({
        providerOccurrenceId: "extra-use",
        selectedOccurrenceId: "existing-reference",
      }),
    ]);
    expect(result.activeDefinitions).toContainEqual(
      expect.objectContaining({
        definitionId: "POWER",
        occurrenceIds: ["original", "existing-reference"],
      }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
  });
});
