import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  canMaterializeEvaluatedChoiceProvider,
  commandForEvaluatedChoice,
  projectBuildForEvaluation,
} from "./build-projection";
import { evaluateCharacter } from "./evaluator";

function statement(
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

describe("build projection", () => {
  it("recovers a uniquely categorized race ability choice nested under grants", () => {
    const content = [
      entity("RACE", "Synthetic ancestry", "Race", [
        statement("grant", { name: "RACE_GRANTS", type: "Grants" }, 0),
        statement(
          "select",
          {
            type: "Race Ability Bonus",
            number: "1",
            Category: "Wisdom|Charisma",
          },
          1,
        ),
      ]),
      entity("RACE_GRANTS", "Synthetic ancestry", "Grants", [
        statement("grant", { name: "CON", type: "Race Ability Bonus" }, 0),
      ]),
      entity("CON", "Constitution", "Race Ability Bonus"),
      entity("CHA", "Charisma", "Race Ability Bonus", [
        statement("statadd", { name: "Charisma", value: "+2" }, 0),
      ]),
    ];
    const occurrence = (
      id: string,
      definitionId: string,
      children: CharacterBuild["levels"][number]["root"]["children"] = [],
    ) => ({
      id,
      identity: { definitionId, name: id, type: id },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      unresolved: false,
      children,
    });
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: occurrence("race", "RACE", [
            occurrence("grants", "RACE_GRANTS", [
              occurrence("fixed", "CON"),
              occurrence("selected", "CHA"),
            ]),
          ]),
        },
      ],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: { Charisma: 10 },
      textStrings: {},
    };
    const projected = projectBuildForEvaluation(build, content);
    expect(projected.occurrences).toContainEqual(
      expect.objectContaining({
        id: "selected",
        parentId: "race",
        ruleOrdinal: 1,
        kind: "choice",
      }),
    );
    const evaluated = evaluateCharacter(projected, content);
    expect(evaluated.stats.Charisma?.value).toBe(12);
    expect(evaluated.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
  });

  it("maps serialized child slots to rule ordinals and avoids duplicate grants", () => {
    const content = [
      entity("LEVEL", "1", "Level", [
        statement("statadd", { name: "Strength", value: "+1" }, 0),
        statement("grant", { name: "FEATURE", type: "Feature" }, 1),
        statement("select", { type: "Feat", number: "1" }, 2),
      ]),
      entity("FEATURE", "Feature", "Feature"),
      entity("FEAT", "Feat", "Feat"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [
              {
                id: "feature",
                identity: {
                  definitionId: "FEATURE",
                  name: "Feature",
                  type: "Feature",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                unresolved: false,
                children: [],
              },
              {
                id: "feat",
                identity: { definitionId: "FEAT", name: "Feat", type: "Feat" },
                acquiredLevel: 1,
                legality: "rules-legal",
                unresolved: false,
                children: [],
              },
            ],
          },
        },
      ],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: { Strength: 10 },
      textStrings: {},
    };
    const projected = projectBuildForEvaluation(build, content);
    expect(projected.occurrences).toEqual([
      expect.objectContaining({ id: "level", kind: "root" }),
      expect.objectContaining({
        id: "feature",
        kind: "grant",
        ruleOrdinal: 1,
      }),
      expect.objectContaining({ id: "feat", kind: "choice", ruleOrdinal: 2 }),
    ]);
    const evaluated = evaluateCharacter(projected, content);
    expect(evaluated.occurrences.map(({ id }) => id)).toEqual([
      "level",
      "feature",
      "feat",
    ]);
    expect(evaluated.complete).toBe(true);
  });

  it("projects legacy alternate selections as owned elements", () => {
    const content = [
      entity("LEVEL", "1", "Level"),
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
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
      ],
      grabbag: [],
      inventory: [],
      alternates: [
        {
          id: "alternate",
          selectName: "Power Daily 1",
          provider: { name: "Spellbook", type: "Class Feature" },
          choice: {
            id: "spell",
            identity: {
              definitionId: "SPELL",
              name: "Prepared spell",
              type: "Power",
            },
            acquiredLevel: 0,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
      ],
      baseAbilities: {},
      textStrings: {},
    };

    expect(
      projectBuildForEvaluation(build, content).occurrences,
    ).toContainEqual(
      expect.objectContaining({
        id: "spell",
        definitionId: "SPELL",
        kind: "grabbag",
      }),
    );
  });

  it("materializes a generated grant and its nested choice atomically", () => {
    const content = [
      entity("LEVEL", "1", "Level", [
        statement("grant", { name: "FEATURE", type: "Feature" }, 0),
      ]),
      entity("FEATURE", "Granted feature", "Feature", [
        statement("statadd", { name: "AC", value: "+1" }, 0),
        statement("select", { type: "Feat", number: "1" }, 1),
      ]),
      entity("FEAT", "Chosen feat", "Feat"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
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
    const choice = initial.choices[0]!;
    expect(
      canMaterializeEvaluatedChoiceProvider(
        build,
        choice,
        initial.occurrences,
        content,
      ),
    ).toBe(true);
    const command = commandForEvaluatedChoice(
      build,
      choice,
      initial.occurrences,
      content,
      {
        id: "chosen",
        identity: { definitionId: "FEAT", name: "Chosen feat", type: "Feat" },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `placeholder:${index}`,
    );

    expect(command).toMatchObject({
      kind: "choose",
      parentId: "level",
      index: 0,
      occurrence: {
        id: "level:grant:0",
        children: [{ id: "chosen" }],
      },
    });
    const completed = evaluateCharacter(
      projectBuildForEvaluation(
        applyCharacterCommand(build, command!),
        content,
      ),
      content,
    );
    expect(completed.complete).toBe(true);
    expect(completed.stats.AC?.value).toBe(1);
  });

  it("materializes an arbitrarily nested generated grant chain", () => {
    const content = [
      entity("LEVEL", "1", "Level", [
        statement("grant", { name: "OUTER", type: "Feature" }, 0),
      ]),
      entity("OUTER", "Outer feature", "Feature", [
        statement("grant", { name: "INNER", type: "Feature" }, 0),
      ]),
      entity("INNER", "Inner feature", "Feature", [
        statement("select", { type: "Feat", number: "1" }, 0),
      ]),
      entity("FEAT", "Chosen feat", "Feat"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
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
    const choice = initial.choices[0]!;
    expect(
      canMaterializeEvaluatedChoiceProvider(
        build,
        choice,
        initial.occurrences,
        content,
      ),
    ).toBe(true);
    const command = commandForEvaluatedChoice(
      build,
      choice,
      initial.occurrences,
      content,
      {
        id: "chosen",
        identity: { definitionId: "FEAT", name: "Chosen feat", type: "Feat" },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `placeholder:${index}`,
    );

    expect(command).toMatchObject({
      kind: "choose",
      parentId: "level",
      index: 0,
      occurrence: {
        identity: { definitionId: "OUTER" },
        children: [
          {
            identity: { definitionId: "INNER" },
            children: [{ id: "chosen" }],
          },
        ],
      },
    });
    const completed = evaluateCharacter(
      projectBuildForEvaluation(
        applyCharacterCommand(build, command!),
        content,
      ),
      content,
    );
    expect(completed.complete).toBe(true);
  });

  it("stores nested choices at their enclosing level and projects effective grant levels", () => {
    const content = [
      entity("LEVEL", "1", "Level", [
        statement(
          "grant",
          { name: "ADVANCEMENT", type: "Feature", Level: "2" },
          0,
        ),
      ]),
      entity("ADVANCEMENT", "Level 2 advancement", "Feature", [
        statement("select", { type: "Power", number: "1" }, 0),
      ]),
      entity("POWER", "Level 2 power", "Power"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 2,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
        {
          level: 2,
          root: {
            id: "level-2",
            identity: { name: "2", type: "Level" },
            acquiredLevel: 2,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
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
    const command = commandForEvaluatedChoice(
      build,
      initial.choices[0]!,
      initial.occurrences,
      content,
      {
        id: "power",
        identity: {
          definitionId: "POWER",
          name: "Level 2 power",
          type: "Power",
        },
        acquiredLevel: 2,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `placeholder:${index}`,
    );

    const updated = applyCharacterCommand(build, command!);
    expect(updated.levels[0]?.root.children[0]).toMatchObject({
      acquiredLevel: 1,
      children: [{ id: "power", acquiredLevel: 1 }],
    });
    expect(
      projectBuildForEvaluation(updated, content).occurrences.filter(({ id }) =>
        ["level:grant:0", "power"].includes(id),
      ),
    ).toEqual([
      expect.objectContaining({ id: "level:grant:0", acquiredLevel: 2 }),
      expect.objectContaining({ id: "power", acquiredLevel: 2 }),
    ]);
  });

  it("materializes explicit placeholders when a later choice is selected first", () => {
    const content = [
      entity("LEVEL", "1", "Level", [
        statement("select", { type: "Race", number: "1" }, 0),
        statement("select", { type: "Class", number: "1" }, 1),
        statement("select", { type: "Feat", number: "1" }, 2),
      ]),
      entity("RACE", "Race", "Race"),
      entity("CLASS", "Class", "Class"),
      entity("FEAT", "Feat", "Feat"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "level",
            identity: { definitionId: "LEVEL", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        },
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
    const choice = initial.choices.find((value) => value.type === "Feat")!;
    const command = commandForEvaluatedChoice(
      build,
      choice,
      initial.occurrences,
      content,
      {
        id: "chosen",
        identity: { definitionId: "FEAT", name: "Feat", type: "Feat" },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `placeholder:${index}`,
    );

    expect(command).toMatchObject({
      kind: "batch",
      commands: [
        { index: 0, occurrence: { id: "placeholder:0", unresolved: true } },
        { index: 1, occurrence: { id: "placeholder:1", unresolved: true } },
        { index: 2, occurrence: { id: "chosen", unresolved: false } },
      ],
    });
    const updated = applyCharacterCommand(build, command!);
    expect(updated.levels[0]?.root.children).toHaveLength(3);
    const evaluated = evaluateCharacter(
      projectBuildForEvaluation(updated, content),
      content,
    );
    expect(
      evaluated.choices.filter(
        (value) => !value.optional && value.selectedOccurrenceId === undefined,
      ),
    ).toHaveLength(2);
  });

  it("projects saved inventory choices beneath the synthetic item provider", () => {
    const content = [
      entity("ITEM", "Armor of Resistance", "Magic Item", [
        statement("select", { type: "Class Feature", number: "1" }, 0),
      ]),
      entity("POISON", "Poison", "Class Feature"),
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory: [
        {
          id: "loot",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 1,
          elements: [
            {
              definitionId: "ITEM",
              name: "Armor of Resistance",
              type: "Magic Item",
              children: [
                {
                  id: "poison",
                  identity: {
                    definitionId: "POISON",
                    name: "Poison",
                    type: "Class Feature",
                  },
                  acquiredLevel: 1,
                  legality: "rules-legal",
                  children: [],
                  unresolved: false,
                },
              ],
            },
          ],
          overrides: {},
          legality: "rules-legal",
        },
      ],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };

    const evaluated = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    expect(evaluated.choices[0]).toMatchObject({
      providerOccurrenceId: "loot:definition:0",
      selectedOccurrenceId: "poison",
    });
    expect(evaluated.complete).toBe(true);
  });
});
