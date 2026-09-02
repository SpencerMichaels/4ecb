import { describe, expect, it } from "vitest";

import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { buildEvaluatedSheetModel, buildSheetModel } from ".";

describe("sheet model", () => {
  it("maps legacy cached values and enriches cards from content", () => {
    const model = buildSheetModel(
      {
        details: { name: "Ada", Level: "3" },
        abilities: { Strength: 14 },
        stats: { AC: "19", Arcana: "8", Strength: "16" },
        selectedRules: [{ id: "POWER_1", name: "Arc Flash", type: "Power" }],
        powers: [
          {
            id: "POWER_1",
            name: "Arc Flash",
            usage: "Encounter",
            weapons: [
              {
                name: "Wand",
                attackBonus: "7",
                defense: "Reflex",
                damage: "1d6+4",
              },
            ],
          },
        ],
        loot: [],
        textStrings: {},
        levelCount: 3,
        source: "legacy-cache",
      },
      [
        {
          id: "POWER_1",
          name: "Arc Flash",
          type: "Power",
          source: "Synthetic",
          sources: ["Synthetic"],
          attributes: [],
          categories: [],
          specifics: [
            {
              name: "Effect",
              value: "A test spark.",
              extraAttributes: [],
              ordinal: 0,
            },
            {
              name: "_REQUIRESID",
              value: "ID_INTERNAL_REQUIREMENT",
              extraAttributes: [],
              ordinal: 1,
            },
          ],
          rules: [],
          description: "Description",
          extensions: [],
          provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
        },
      ],
    );
    expect(model.defenses).toContainEqual({ label: "AC", value: "19" });
    expect(model.abilities).toContainEqual({ label: "Strength", value: "16" });
    expect(model.powers[0]).toMatchObject({
      attack: "+7 vs Reflex",
      damage: "1d6+4",
      description: "Description",
    });
    expect(model.powers[0]?.fields).toEqual([
      { label: "Effect", value: "A test spark." },
    ]);
  });

  it("preserves an empty native snapshot source without relabeling it as legacy", () => {
    const model = buildSheetModel({
      details: { name: "New Hero", Level: "1" },
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [],
      textStrings: {},
      levelCount: 1,
      source: "native-empty",
    });
    expect(model.source).toBe("native-empty");
    expect(model.identity).toContainEqual({
      label: "name",
      value: "New Hero",
    });
  });

  it("projects converged engine values, current selections, powers, and inventory", () => {
    const snapshot: LegacyCharacterSnapshot = {
      details: { name: "Ada", Level: "1", Race: "Old race" },
      abilities: { Strength: 10 },
      stats: { AC: "12" },
      selectedRules: [],
      powers: [],
      loot: [
        {
          name: "Stale wand",
          count: 9,
          equippedCount: 0,
          showPowerCard: true,
          elements: [],
        },
      ],
      textStrings: {},
      levelCount: 1,
      source: "legacy-cache",
    };
    const occurrence = {
      id: "race-occurrence",
      identity: { definitionId: "RACE_1", name: "Cliffkin", type: "Race" },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 3,
      levels: [{ level: 1, root: occurrence }],
      grabbag: [],
      inventory: [
        {
          id: "wand-entry",
          acquiredLevel: 1,
          quantity: 2,
          equippedQuantity: 1,
          elements: [
            { definitionId: "ITEM_1", name: "Test wand", type: "Magic Item" },
          ],
          showPowerCard: true,
          overrides: {},
          legality: "rules-legal",
        },
      ],
      alternates: [],
      baseAbilities: { Strength: 14 },
      textStrings: {},
    };
    const evaluation: EvaluatedCharacter = {
      level: 3,
      converged: true,
      iterations: 1,
      complete: true,
      legal: true,
      occurrences: [
        {
          id: occurrence.id,
          definitionId: "RACE_1",
          acquiredLevel: 1,
          kind: "root",
          legality: "rules-legal",
        },
        {
          id: "power-occurrence",
          definitionId: "POWER_1",
          acquiredLevel: 1,
          kind: "grant",
        },
      ],
      activeDefinitionIds: ["RACE_1", "POWER_1"],
      choices: [],
      stats: {
        Strength: { name: "Strength", value: 16, contributions: [] },
        AC: { name: "AC", value: 19, contributions: [] },
      },
      textStrings: {},
      overlays: [],
      powers: [
        {
          definitionId: "POWER_1",
          name: "Arc Flash",
          usage: "Encounter",
          keywords: ["Arcane", "Lightning"],
          variants: [
            {
              id: "wand-entry",
              equipmentName: "Test wand",
              attackBonus: 7,
              defense: "Reflex",
              damage: "1d6+4",
              attackComponents: [],
              damageComponents: [],
              conditionalDamage: [],
            },
          ],
          recoveries: [],
          unsupported: [],
        },
      ],
      suggestions: [],
      diagnostics: [],
    };
    const content: ContentEntity[] = [
      {
        id: "RACE_1",
        name: "Cliffkin",
        type: "Race",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [],
        rules: [],
        description: "",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
      },
      {
        id: "POWER_1",
        name: "Arc Flash",
        type: "Power",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [],
        rules: [],
        description: "A modern evaluated spark.",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 1 },
      },
      {
        id: "ITEM_1",
        name: "Test wand",
        type: "Magic Item",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [],
        rules: [],
        description: "An implement.",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 2 },
      },
    ];

    const model = buildEvaluatedSheetModel(
      snapshot,
      build,
      evaluation,
      content,
    );

    expect(model.source).toBe("authoritative-evaluation");
    expect(model.identity).toContainEqual({ label: "Level", value: "3" });
    expect(model.identity).toContainEqual({ label: "Race", value: "Cliffkin" });
    expect(model.abilities).toContainEqual({ label: "Strength", value: "16" });
    expect(model.defenses).toContainEqual({ label: "AC", value: "19" });
    expect(model.powers[0]).toMatchObject({
      name: "Arc Flash — Test wand",
      attack: "+7 vs Reflex",
      damage: "1d6+4",
    });
    expect(model.items[0]).toMatchObject({ name: "Test wand" });
    expect(model.equipment).toEqual([
      { label: "Test wand", value: "× 2 · 1 equipped" },
    ]);
    expect(model.equipment).not.toContainEqual(
      expect.objectContaining({ label: "Stale wand" }),
    );
  });

  it("rejects nonconvergent evaluations and never fabricates missing abilities", () => {
    const snapshot: LegacyCharacterSnapshot = {
      details: { name: "Sparse" },
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [],
      textStrings: {},
      levelCount: 1,
      source: "legacy-cache",
    };
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    const evaluation: EvaluatedCharacter = {
      level: 1,
      converged: true,
      iterations: 1,
      complete: true,
      legal: true,
      occurrences: [],
      activeDefinitionIds: [],
      choices: [],
      stats: {},
      textStrings: {},
      overlays: [],
      powers: [],
      suggestions: [],
      diagnostics: [],
    };

    expect(
      buildEvaluatedSheetModel(snapshot, build, evaluation, []),
    ).toMatchObject({ abilities: [], source: "authoritative-evaluation" });
    expect(() =>
      buildEvaluatedSheetModel(
        snapshot,
        build,
        { ...evaluation, converged: false },
        [],
      ),
    ).toThrow("nonconvergent");
  });
});
