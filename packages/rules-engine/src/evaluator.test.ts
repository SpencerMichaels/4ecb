import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  applyFieldOverlays,
  evaluateCharacter,
  type CharacterOccurrence,
} from "./evaluator";
import { EXCEPTION_IDS } from "./exceptions";

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
  it("applies native magic-armor base adjustments but preserves masterwork armor", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          rule("statalias", { name: "AC", alias: "Armor Class" }, 0),
          rule("statadd", { name: "AC", value: "+10" }, 1),
        ],
      }),
      entity("CHAIN", "Synthetic Chain", "Armor", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "6", type: "Armor" },
            0,
          ),
        ],
        specifics: {
          "Armor Bonus": "6",
          "Armor Type": "Heavy",
          "Minimum Enhancement Bonus": "",
        },
      }),
      entity("MASTERWORK", "Synthetic Masterwork Chain", "Armor", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "9", type: "Armor" },
            0,
          ),
        ],
        specifics: {
          "Armor Bonus": "9",
          "Armor Type": "Heavy",
          "Minimum Enhancement Bonus": "3",
        },
      }),
      entity("MAGIC_2", "Synthetic Armor +2", "Magic Item", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "+2", type: "Enhancement" },
            0,
          ),
        ],
        specifics: { Enhancement: "+2 AC", "Magic Item Type": "Armor" },
      }),
      entity("MAGIC_3", "Synthetic Armor +3", "Magic Item", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "+3", type: "Enhancement" },
            0,
          ),
        ],
        specifics: { Enhancement: "+3 AC", "Magic Item Type": "Armor" },
      }),
    ];
    const evaluateArmor = (definitionIds: string[]) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [rootOccurrence],
          inventory: [
            {
              id: "armor",
              definitionIds,
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
            },
          ],
        },
        content,
      );

    const adjusted = evaluateArmor(["CHAIN", "MAGIC_2"]);
    expect(adjusted.stats.AC?.value).toBe(19);
    expect(
      adjusted.stats.AC?.contributions.find(
        ({ providerName }) => providerName === "Synthetic Chain",
      )?.numericValue,
    ).toBe(7);

    const masterwork = evaluateArmor(["MASTERWORK", "MAGIC_3"]);
    expect(masterwork.stats.AC?.value).toBe(22);
    expect(
      masterwork.stats.AC?.contributions.find(
        ({ providerName }) => providerName === "Synthetic Masterwork Chain",
      )?.numericValue,
    ).toBe(9);
  });

  it("combines hybrid half points within a stat and truncates before links", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          rule("statadd", { name: "Hit Point Step", value: "+Per Level" }, 0),
        ],
      }),
      entity("HYBRID_A", "Synthetic Hybrid A", "Hybrid Class", {
        rules: [
          rule(
            "statadd",
            {
              name: "Healing Surges",
              value: "+3",
              "half-point": "true",
            },
            0,
          ),
          rule(
            "statadd",
            { name: "Per Level", value: "+2", "half-point": "true" },
            1,
          ),
        ],
      }),
      entity("HYBRID_B", "Synthetic Hybrid B", "Hybrid Class", {
        rules: [
          rule(
            "statadd",
            {
              name: "Healing Surges",
              value: "+4",
              "half-point": "true",
            },
            0,
          ),
          rule("statadd", { name: "Per Level", value: "+3" }, 1),
        ],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "hybrid-a",
            definitionId: "HYBRID_A",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "hybrid-b",
            definitionId: "HYBRID_B",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      content,
    );

    expect(evaluated.stats["Healing Surges"]?.value).toBe(8);
    expect(evaluated.stats["Per Level"]?.value).toBe(5);
    expect(evaluated.stats["Hit Point Step"]?.value).toBe(5);
  });

  it("does not execute one equipped holding twice when legacy tally repeats it", () => {
    const content = [
      entity("ROOT", "Root", "Test"),
      entity("ARMBANDS", "Synthetic Armbands", "Magic Item", {
        rules: [rule("statadd", { name: "melee:damage", value: "+2" }, 0)],
      }),
      entity("STANCE", "Synthetic Stance", "Feat", {
        rules: [rule("statadd", { name: "melee:damage", value: "+1" }, 0)],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "legacy-tally-item",
            definitionId: "ARMBANDS",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "distinct-stance",
            definitionId: "STANCE",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [
          {
            id: "same-physical-holding",
            definitionIds: ["ARMBANDS"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
      },
      content,
    );

    expect(evaluated.stats["melee:damage"]?.value).toBe(3);
    expect(
      evaluated.stats["melee:damage"]?.contributions.filter(
        ({ applied }) => applied,
      ),
    ).toHaveLength(2);
  });

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

  it("never offers a choice provider as its own recursive child", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [rule("grant", { name: "TRAIT", type: "Racial Trait" }, 0)],
      }),
      entity("TRAIT", "Dragonborn Subrace", "Racial Trait", {
        rules: [
          rule(
            "select",
            { type: "Racial Trait", Category: "Dragonborn Subrace" },
            0,
          ),
        ],
      }),
      entity("OPTION", "Draconian Wings", "Racial Trait", {
        categories: ["Dragonborn Subrace"],
      }),
    ];

    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      content,
    );

    expect(evaluated.choices[0]?.candidates).toEqual([
      { definitionId: "TRAIT", eligible: false, reasons: ["self"] },
      { definitionId: "OPTION", eligible: true, reasons: [] },
    ]);
  });

  it("does not duplicate an explicitly serialized granted definition", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "serialized-feature",
            definitionId: "FEATURE",
            acquiredLevel: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [rule("grant", { name: "FEATURE", type: "Feature" }, 0)],
        }),
        entity("FEATURE", "Feature", "Feature", {
          rules: [rule("statadd", { name: "AC", value: "+2" }, 0)],
        }),
      ],
    );

    expect(
      result.occurrences.filter((item) => item.definitionId === "FEATURE"),
    ).toHaveLength(1);
    expect(result.stats.AC?.value).toBe(2);
  });

  it("exposes weapon groups and magic implement types to equipment rules", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [
          {
            id: "blade",
            definitionIds: ["BLADE"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "staff",
            definitionIds: ["STAFF"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [
            rule(
              "statadd",
              { name: "AC", value: "+1", wearing: "weapon:heavy blade" },
              0,
            ),
            rule(
              "statadd",
              { name: "AC", value: "+1", wearing: "implement:staff" },
              1,
            ),
          ],
        }),
        entity("BLADE", "Longsword", "Weapon", {
          specifics: { Group: "Heavy Blade" },
        }),
        entity("STAFF", "Magic Staff", "Magic Item", {
          specifics: { "Magic Item Type": "Staff" },
        }),
      ],
    );

    expect(result.stats.AC?.value).toBe(2);
  });

  it("promotes CountsAsClass power categories for paragon multiclassing", () => {
    const result = evaluateCharacter(
      {
        level: 11,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "wizard",
            definitionId: "WIZARD",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "fighter-training",
            definitionId: "FIGHTER_TRAINING",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "paragon-multiclassing",
            definitionId: EXCEPTION_IDS.paragonMulticlassing,
            acquiredLevel: 11,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [rule("select", { type: "Power", Category: "$$CLASS" }, 0)],
        }),
        entity("WIZARD", "Wizard", "Class"),
        entity("FIGHTER_TRAINING", "Fighter Training", "Multiclass", {
          specifics: { CountsAsClass: "Fighter" },
        }),
        entity(
          EXCEPTION_IDS.paragonMulticlassing,
          "Paragon Multiclassing",
          "Paragon Path",
        ),
        entity("WIZARD_POWER", "Wizard Spell", "Power", {
          categories: ["Wizard"],
        }),
        entity("FIGHTER_POWER", "Fighter Exploit", "Power", {
          categories: ["Fighter"],
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toEqual([
      { definitionId: "WIZARD_POWER", eligible: true, reasons: [] },
      { definitionId: "FIGHTER_POWER", eligible: true, reasons: [] },
    ]);
  });

  it("uses class-descended CountsAsClass markers for Essentials power choices", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          {
            id: "knight",
            definitionId: "KNIGHT",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "fighter-marker",
            definitionId: "COUNTS_AS_FIGHTER",
            acquiredLevel: 1,
            parentId: "knight",
            kind: "grant",
          },
          {
            id: "utility-slot",
            definitionId: "UTILITY_SLOT",
            acquiredLevel: 2,
            parentId: "knight",
            kind: "grant",
          },
          {
            id: "rogue-training",
            definitionId: "ROGUE_TRAINING",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("KNIGHT", "Knight", "Class"),
        entity("COUNTS_AS_FIGHTER", "Fighter", "CountsAsClass"),
        entity("UTILITY_SLOT", "Level 2 utility", "Class Feature", {
          rules: [
            rule("select", { type: "Power", Category: "$$CLASS,Utility,2" }, 0),
          ],
        }),
        entity("ROGUE_TRAINING", "Rogue training", "Multiclass", {
          specifics: { CountsAsClass: "Rogue" },
        }),
        entity("FIGHTER_UTILITY", "Fighter utility", "Power", {
          categories: ["Fighter", "Utility"],
          specifics: { Level: "2" },
        }),
        entity("ROGUE_UTILITY", "Rogue utility", "Power", {
          categories: ["Rogue", "Utility"],
          specifics: { Level: "2" },
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toEqual([
      { definitionId: "FIGHTER_UTILITY", eligible: true, reasons: [] },
      {
        definitionId: "ROGUE_UTILITY",
        eligible: false,
        reasons: ["category"],
      },
    ]);
  });

  it("uses distinct hybrid components for both hybrid and primary class categories", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          {
            id: "hybrid-shell",
            definitionId: "HYBRID",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "hybrid-cleric",
            definitionId: "HYBRID_CLERIC",
            acquiredLevel: 1,
            parentId: "hybrid-shell",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "hybrid-fighter",
            definitionId: "HYBRID_FIGHTER",
            acquiredLevel: 1,
            parentId: "hybrid-shell",
            ruleOrdinal: 0,
            choiceIndex: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("HYBRID", "Hybrid", "Class", {
          rules: [
            rule("select", { type: "Hybrid Class", number: "2" }, 0),
            rule("select", { type: "Power", Category: "$$CLASS" }, 1),
            rule("select", { type: "Skill", Category: "$$HYBRID" }, 2),
          ],
        }),
        entity("HYBRID_CLERIC", "Hybrid Cleric", "Hybrid Class", {
          specifics: { _BaseClass: "CLERIC" },
        }),
        entity("HYBRID_FIGHTER", "Hybrid Fighter", "Hybrid Class", {
          specifics: { _BaseClass: "FIGHTER" },
        }),
        entity("CLERIC", "Cleric", "Class"),
        entity("FIGHTER", "Fighter", "Class"),
        entity("CLERIC_POWER", "Cleric power", "Power", {
          categories: ["Cleric"],
        }),
        entity("FIGHTER_POWER", "Fighter power", "Power", {
          categories: ["Fighter"],
        }),
        entity("WIZARD_POWER", "Wizard power", "Power", {
          categories: ["Wizard"],
        }),
        entity("CLERIC_SKILL", "Cleric skill", "Skill", {
          categories: ["Cleric"],
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toContainEqual({
      definitionId: "HYBRID_FIGHTER",
      eligible: false,
      reasons: ["duplicate"],
    });
    expect(result.choices[1]?.candidates).toContainEqual({
      definitionId: "HYBRID_CLERIC",
      eligible: false,
      reasons: ["duplicate"],
    });
    expect(result.choices[2]?.candidates).toEqual([
      { definitionId: "CLERIC_POWER", eligible: true, reasons: [] },
      { definitionId: "FIGHTER_POWER", eligible: true, reasons: [] },
      {
        definitionId: "WIZARD_POWER",
        eligible: false,
        reasons: ["category"],
      },
    ]);
    expect(result.choices[3]?.candidates).toEqual([
      { definitionId: "CLERIC_SKILL", eligible: true, reasons: [] },
    ]);
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

  it("offers original slot candidates for ordinary retraining", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-feat",
            definitionId: "FEAT_A",
            acquiredLevel: 1,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", {
          rules: [rule("select", { type: "Feat", number: "1" }, 0)],
        }),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("FEAT_A", "Old feat", "Feat"),
        entity("FEAT_B", "New feat", "Feat"),
      ],
    );

    expect(
      result.choices.find((choice) => choice.type === "Replacement"),
    ).toMatchObject({
      replacementOptions: [
        {
          replacesOccurrenceId: "old-feat",
          definitionId: "FEAT_A",
          candidates: [
            { definitionId: "FEAT_A", eligible: true },
            { definitionId: "FEAT_B", eligible: true },
          ],
        },
      ],
    });
  });

  it("uses a replacement rule's minimum level for early-granted providers", () => {
    const result = evaluateCharacter(
      {
        level: 7,
        baseAbilities: {},
        occurrences: [
          {
            id: "class",
            definitionId: "CLASS",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-power",
            definitionId: "POWER_A",
            acquiredLevel: 1,
            parentId: "class",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "advancement",
            definitionId: "ADVANCEMENT",
            acquiredLevel: 1,
            kind: "grant",
          },
        ],
        inventory: [],
      },
      [
        entity("CLASS", "Psionic class", "Class", {
          rules: [
            rule(
              "select",
              { type: "Power", number: "1", Category: "Psionic" },
              0,
            ),
          ],
        }),
        entity("ADVANCEMENT", "Augment advancement", "Feature", {
          rules: [
            rule("replace", { Level: "7", powerswap: "Psionic,at-will,7" }, 0),
          ],
        }),
        entity("POWER_A", "Old power", "Power", {
          categories: ["Psionic"],
        }),
        entity("POWER_B", "New power", "Power", {
          categories: ["Psionic"],
        }),
      ],
    );

    expect(
      result.choices.find((choice) => choice.type === "Replacement"),
    ).toMatchObject({
      optional: false,
      replacementOptions: [
        {
          replacesOccurrenceId: "old-power",
          candidates: [
            { definitionId: "POWER_A", eligible: true },
            { definitionId: "POWER_B", eligible: true },
          ],
        },
      ],
    });
  });

  it("re-retrains the active replacement through its original slot", () => {
    const result = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-feat",
            definitionId: "FEAT_A",
            acquiredLevel: 1,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
          {
            id: "new-feat",
            definitionId: "FEAT_B",
            acquiredLevel: 2,
            parentId: "level-2",
            ruleOrdinal: 0,
            choiceIndex: 0,
            replacesId: "old-feat",
            kind: "choice",
          },
          {
            id: "level-3",
            definitionId: "LEVEL_3",
            acquiredLevel: 3,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", {
          rules: [rule("select", { type: "Feat", number: "1" }, 0)],
        }),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("LEVEL_3", "3", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("FEAT_A", "Old feat", "Feat"),
        entity("FEAT_B", "Current feat", "Feat"),
        entity("FEAT_C", "Next feat", "Feat"),
      ],
    );

    expect(
      result.choices.find(
        (choice) => choice.providerOccurrenceId === "level-3",
      ),
    ).toMatchObject({
      replacementOptions: [
        {
          replacesOccurrenceId: "new-feat",
          definitionId: "FEAT_B",
          candidates: [
            { definitionId: "FEAT_A", eligible: true },
            { definitionId: "FEAT_B", eligible: true },
            { definitionId: "FEAT_C", eligible: true },
          ],
        },
      ],
    });
    expect(
      result.choices.find((choice) => choice.providerOccurrenceId === "level-1")
        ?.selectedOccurrenceId,
    ).toBe("new-feat");
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
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
