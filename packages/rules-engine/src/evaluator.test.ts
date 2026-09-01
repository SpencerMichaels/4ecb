import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  applyFieldOverlays,
  evaluateCharacter,
  type CharacterOccurrence,
} from "./evaluator";

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
  options: {
    categories?: string[];
    rules?: RuleStatement[];
    specifics?: Record<string, string>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: options.categories ?? [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([fieldName, value], ordinal) => ({
        name: fieldName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const rootOccurrence: CharacterOccurrence = {
  id: "root",
  definitionId: "ROOT",
  acquiredLevel: 1,
  kind: "root",
};

describe("character evaluator", () => {
  it("aggregates legacy inventory deltas before activating item rules", () => {
    const content = [
      entity("ROOT", "Root", "Test"),
      entity("SHIELD", "Shield", "Armor", {
        rules: [rule("statadd", { name: "AC", value: "+2" }, 0)],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [
          {
            id: "shield-start",
            definitionIds: ["SHIELD"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "shield-off",
            definitionIds: ["SHIELD"],
            quantity: 0,
            equippedQuantity: -1,
            acquiredLevel: 2,
          },
          {
            id: "shield-on",
            definitionIds: ["SHIELD"],
            quantity: 0,
            equippedQuantity: 1,
            acquiredLevel: 3,
          },
        ],
      },
      content,
    );

    expect(evaluated.stats.AC?.value).toBe(2);
  });

  it("runs grants to a fixed point and exposes required selections", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [rule("grant", { name: "FEATURE", type: "Feature" }, 0)],
      }),
      entity("FEATURE", "Feature", "Feature", {
        rules: [
          rule("statadd", { name: "Strength", value: "+2" }, 0),
          rule("statalias", { name: "Strength", alias: "Might" }, 1),
          rule("statadd", { name: "Attack", value: "+Might" }, 2),
          rule("select", { type: "Feat", number: "1", Category: "Martial" }, 3),
        ],
      }),
      entity("FEAT_A", "Eligible feat", "Feat", {
        categories: ["Martial"],
      }),
      entity("FEAT_B", "Ineligible feat", "Feat", {
        categories: ["Arcane"],
      }),
    ];

    const first = evaluateCharacter(
      {
        level: 1,
        baseAbilities: { Strength: 10 },
        occurrences: [rootOccurrence],
        inventory: [],
      },
      content,
    );
    expect(first.converged).toBe(true);
    expect(first.iterations).toBe(2);
    expect(first.stats.Strength?.value).toBe(12);
    expect(first.stats.Attack?.value).toBe(12);
    expect(first.complete).toBe(false);
    expect(first.choices[0]?.candidates).toEqual([
      { definitionId: "FEAT_A", eligible: true, reasons: [] },
      { definitionId: "FEAT_B", eligible: false, reasons: ["category"] },
    ]);

    const completed = evaluateCharacter(
      {
        level: 1,
        baseAbilities: { Strength: 10 },
        occurrences: [
          rootOccurrence,
          {
            id: "chosen-feat",
            definitionId: "FEAT_A",
            acquiredLevel: 1,
            parentId: "root:grant:0",
            ruleOrdinal: 3,
            choiceIndex: 0,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      content,
    );
    expect(completed.complete).toBe(true);
    expect(completed.choices[0]?.selectedOccurrenceId).toBe("chosen-feat");
  });

  it("keeps house rules visible but makes the result non-legal", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          {
            ...rootOccurrence,
            legality: "houserule",
          },
        ],
        inventory: [],
      },
      [entity("ROOT", "Root", "Test")],
    );
    expect(result.complete).toBe(true);
    expect(result.legal).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "occurrence.houserule" }),
    );
  });

  it("materializes optional replacement slots without making them incomplete", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [rule("replace", { optional: "true", retrain: "true" }, 0)],
        }),
      ],
    );
    expect(result.choices).toEqual([
      expect.objectContaining({ type: "Replacement", optional: true }),
    ]);
    expect(result.complete).toBe(true);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "replace.requires-command" }),
    );
  });

  it("applies list, replacement, and die-step overlays without mutating content", () => {
    const power = entity("POWER", "Power", "Power", {
      specifics: { Keywords: "Arcane", Damage: "1d8 + 2" },
    });
    const fields = applyFieldOverlays(power, [
      {
        providerOccurrenceId: "provider",
        targetDefinitionIds: ["POWER"],
        field: "Keywords",
        listAddition: "Fire",
      },
      {
        providerOccurrenceId: "provider",
        targetDefinitionIds: ["POWER"],
        field: "Damage",
        dieIncrease: "1",
      },
      {
        providerOccurrenceId: "provider",
        targetDefinitionIds: ["POWER"],
        field: "Display",
        value: "Changed",
      },
    ]);
    expect(fields).toEqual({
      Keywords: "Arcane, Fire",
      Damage: "1d10 + 2",
      Display: "Changed",
    });
    expect(power.specifics.map(({ value }) => value)).toEqual([
      "Arcane",
      "1d8 + 2",
    ]);
  });
});
