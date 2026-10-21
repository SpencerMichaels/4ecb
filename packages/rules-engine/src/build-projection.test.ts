import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  characterWalletTextKey,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  canMaterializeEvaluatedChoiceProvider,
  commandForEvaluatedChoice,
  itemChoiceSlots,
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

  it("matches saved grants to current grant rules by target, not position", () => {
    // Saved against older content: a direct trait (OLD_POWER) sat where the
    // current content grants SKILL_BONUS, and the old trait is now the
    // selection inside a new container grant (POWER_SELECTION).
    const content = [
      entity("GRANTS", "Synthetic people", "Grants", [
        statement("grant", { name: "SIZE", type: "Size" }, 0),
        statement("grant", { name: "SKILL_BONUS", type: "Racial Trait" }, 1),
        statement(
          "grant",
          { name: "POWER_SELECTION", type: "Racial Trait" },
          2,
        ),
        statement("grant", { name: "LANGUAGE", type: "Language" }, 3),
      ]),
      entity("SIZE", "Medium", "Size"),
      entity("LANGUAGE", "Common", "Language"),
      entity("SKILL_BONUS", "Diplomacy Bonus", "Racial Trait", [
        statement("statadd", { name: "Diplomacy Misc", value: "+2" }, 0),
      ]),
      entity("POWER_SELECTION", "Power Selection", "Racial Trait", [
        statement(
          "select",
          { type: "Racial Trait", number: "1", Category: "Power Selection" },
          0,
        ),
      ]),
      {
        ...entity("OLD_POWER", "Bonus Power", "Racial Trait", [
          statement("statadd", { name: "Bonus Power Taken", value: "+1" }, 0),
        ]),
        categories: ["POWER_SELECTION"],
      },
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
          root: occurrence("grants", "GRANTS", [
            occurrence("size", "SIZE"),
            occurrence("old-power", "OLD_POWER"),
            occurrence("language", "LANGUAGE"),
          ]),
        },
      ],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    const projected = projectBuildForEvaluation(build, content);
    expect(projected.occurrences).toContainEqual(
      expect.objectContaining({ id: "language", ruleOrdinal: 3 }),
    );
    const evaluated = evaluateCharacter(projected, content);
    expect(evaluated.stats["Diplomacy Misc"]?.value).toBe(2);
    expect(evaluated.stats["Bonus Power Taken"]?.value).toBe(1);
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

  it("fills a power-swap replacement whose provider is a generated grant", () => {
    // Essentials class features grant their own power swaps (Level 03
    // Controller Encounter Power); the swap must be fillable before the
    // granted feature is ever saved.
    const power = (id: string, usage: string, level: string) => ({
      ...entity(id, id, "Power"),
      categories: ["Synthetic", usage],
      specifics: [
        { name: "Level", value: level, extraAttributes: [], ordinal: 0 },
      ],
    });
    const content = [
      entity("LEVEL_1", "1", "Level", [
        statement(
          "select",
          { type: "Power", number: "2", Category: "Synthetic" },
          0,
        ),
      ]),
      entity("LEVEL_2", "2", "Level"),
      entity("LEVEL_3", "3", "Level", [
        statement("grant", { name: "SWAP", type: "Class Feature" }, 0),
      ]),
      entity("SWAP", "Level 3 swap", "Class Feature", [
        statement(
          "replace",
          { name: "Power Encounter 3", powerswap: "Synthetic,encounter,3" },
          0,
        ),
      ]),
      power("OLD_ENCOUNTER", "encounter", "1"),
      power("OLD_DAILY", "daily", "1"),
      power("NEW_ENCOUNTER", "encounter", "3"),
    ];
    const root = (id: string, definitionId: string, level: number) => ({
      id,
      identity: { definitionId, name: String(level), type: "Level" },
      acquiredLevel: level,
      legality: "rules-legal" as const,
      unresolved: false,
      children: [],
    });
    const chosen = (id: string, definitionId: string) => ({
      id,
      identity: { definitionId, name: definitionId, type: "Power" },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      unresolved: false,
      children: [],
    });
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 3,
      levels: [
        {
          level: 1,
          root: {
            ...root("level-1", "LEVEL_1", 1),
            children: [
              chosen("old-encounter", "OLD_ENCOUNTER"),
              chosen("old-daily", "OLD_DAILY"),
            ],
          },
        },
        { level: 2, root: root("level-2", "LEVEL_2", 2) },
        { level: 3, root: root("level-3", "LEVEL_3", 3) },
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
    const swap = initial.choices.find(({ type }) => type === "Replacement")!;
    expect(swap.providerOccurrenceId).toBe("level-3:grant:0");
    // Only a power within the swap's category can be lost.
    expect(
      swap.replacementOptions?.map(
        ({ replacesOccurrenceId }) => replacesOccurrenceId,
      ),
    ).toEqual(["old-encounter"]);
    const command = commandForEvaluatedChoice(
      build,
      swap,
      initial.occurrences,
      content,
      {
        id: "new-encounter",
        identity: {
          definitionId: "NEW_ENCOUNTER",
          name: "NEW_ENCOUNTER",
          type: "Power",
        },
        acquiredLevel: 3,
        legality: "rules-legal",
        children: [],
        unresolved: false,
        replacesId: "old-encounter",
      },
      (index) => `placeholder:${index}`,
    );
    expect(command).toMatchObject({
      kind: "choose",
      parentId: "level-3",
      index: 0,
      occurrence: {
        id: "level-3:grant:0",
        children: [{ id: "new-encounter", replacesId: "old-encounter" }],
      },
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
    ).toMatchObject({ selectedOccurrenceId: "new-encounter" });
    expect(completed.activeDefinitionIds).toContain("NEW_ENCOUNTER");
    expect(completed.activeDefinitionIds).not.toContain("OLD_ENCOUNTER");
    expect(completed.complete).toBe(true);
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

  it("projects modern loadout assignments into equipment-backed defenses", () => {
    const content = [
      entity("ROOT", "Root", "Test", [
        statement("statadd", { name: "AC", value: "10" }, 0),
        statement("statadd", { name: "Fortitude Defense", value: "10" }, 1),
        statement("statadd", { name: "Reflex Defense", value: "10" }, 2),
        statement("statadd", { name: "Will Defense", value: "10" }, 3),
      ]),
      entity("ARMOR", "Synthetic Flowform Cloth Armor", "Armor", [
        statement("statadd", { name: "AC", value: "+1" }, 0),
      ]),
      entity("CAPE", "Synthetic Cape", "Magic Item", [
        statement("statadd", { name: "Fortitude Defense", value: "+1" }, 0),
        statement("statadd", { name: "Reflex Defense", value: "+1" }, 1),
        statement("statadd", { name: "Will Defense", value: "+1" }, 2),
      ]),
    ];
    const inventoryEntry = (
      id: string,
      definitionId: string,
      name: string,
      type: string,
    ) => ({
      id,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      equippedSlots: [],
      elements: [{ definitionId, name, type }],
      overrides: {},
      legality: "rules-legal" as const,
    });
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [],
      grabbag: [
        {
          id: "root",
          identity: { definitionId: "ROOT", name: "Root", type: "Test" },
          acquiredLevel: 1,
          legality: "rules-legal",
          children: [],
          unresolved: false,
        },
      ],
      inventory: [
        inventoryEntry("armor", "ARMOR", "Flowform", "Armor"),
        inventoryEntry("cape", "CAPE", "Cape", "Magic Item"),
      ],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    const equipped = applyCharacterCommand(build, {
      kind: "batch",
      commands: [
        {
          kind: "equip-inventory",
          entryId: "armor",
          assignments: [{ slot: "body", quantityIndex: 0 }],
        },
        {
          kind: "equip-inventory",
          entryId: "cape",
          assignments: [{ slot: "neck", quantityIndex: 0 }],
        },
      ],
    });
    const unequippedEvaluation = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    const equippedEvaluation = evaluateCharacter(
      projectBuildForEvaluation(equipped, content),
      content,
    );

    expect(unequippedEvaluation.stats.AC?.value).toBe(10);
    expect(equippedEvaluation.stats.AC?.value).toBe(11);
    expect(equippedEvaluation.stats["Fortitude Defense"]?.value).toBe(11);
    expect(equippedEvaluation.stats["Reflex Defense"]?.value).toBe(11);
    expect(equippedEvaluation.stats["Will Defense"]?.value).toBe(11);
  });

  it("excludes wallet and freeform detail text keys from evaluation input so those edits reuse cached results", () => {
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {
        _internal_mainhandweapon: "Longsword",
        Name: "Ada",
        "NOTE_Character Background": "Raised by wolves",
        [characterWalletTextKey(1, "carried")]: "5 gp",
        [characterWalletTextKey(1, "stored")]: "20 gp",
      },
    };
    const afterEdits: CharacterBuild = {
      ...build,
      textStrings: {
        ...build.textStrings,
        [characterWalletTextKey(1, "carried")]: "2 gp; 5 sp",
        Name: "Adalyn",
        "NOTE_Character Background": "Raised by dragons",
      },
    };
    const projected = projectBuildForEvaluation(build, []);
    const projectedAfterEdits = projectBuildForEvaluation(afterEdits, []);
    expect(projected.textStrings).toEqual({
      _internal_mainhandweapon: "Longsword",
    });
    expect(projectedAfterEdits.textStrings).toEqual(projected.textStrings);
  });

  describe("item-owned choice slots", () => {
    const resistanceItem = entity("ITEM", "Armor of Resistance", "Magic Item", [
      statement("select", { type: "Class Feature", number: "1" }, 0),
    ]);
    const plainItem = entity("PLAIN", "Plain Armor", "Magic Item");

    it("reads an item's own choice slots purely from content, independent of any character", () => {
      expect(itemChoiceSlots(resistanceItem)).toEqual([
        { ruleOrdinal: 0, choiceIndex: 0, type: "Class Feature" },
      ]);
      expect(itemChoiceSlots(plainItem)).toEqual([]);
    });
  });
});
