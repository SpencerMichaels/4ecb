import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";

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
    categories: [],
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

const augmentable = (id: string, name: string, level: string) =>
  entity(id, name, "Power", {
    specifics: {
      "Power Usage": "At-Will",
      "Power Type": "Attack",
      Class: "ID_FMP_CLASS_124",
      Level: level,
      Keywords: "Augmentable, Implement, Psionic, Psychic",
      _AugmentVersions: `${id}_(AUGMENT_0),${id}_(AUGMENT_1)`,
    },
  });

const content = [
  entity("ROOT", "1", "Level", {
    rules: [rule("select", { type: "Power", number: "2" }, 0)],
  }),
  entity("ID_FMP_CLASS_124", "Psion", "Class"),
  entity(
    "ID_INTERNAL_INTERNAL_HYBRID_POWER_POINTS",
    "Hybrid Power Points",
    "Internal",
    {
      rules: [
        rule(
          "statadd",
          { name: "Power Points", value: "+Hybrid Power Points" },
          0,
        ),
      ],
    },
  ),
  entity("ID_FMP_RACIAL_TRAIT_643", "Dilettante", "Racial Trait", {
    rules: [
      rule("select", { type: "Power", name: "Dilettante", number: "1" }, 0),
    ],
  }),
  entity("ID_FMP_FEAT_2732", "Psionic Conventionalist", "Feat", {
    rules: [
      rule(
        "replace",
        {
          Level: "1",
          multiclass: "Augmentable At-Will|encounter",
          optional: "true",
        },
        0,
      ),
    ],
  }),
  augmentable("MIND_THRUST", "Mind Thrust", "1"),
  augmentable("FORCEFUL_PUSH", "Forceful Push", "1"),
  augmentable("DISHEARTEN", "Dishearten", "11"),
  entity("SWORD_BURST", "Sword Burst", "Power", {
    specifics: {
      "Power Usage": "Encounter",
      "Power Type": "Attack",
      Level: "1",
    },
  }),
];

const root: CharacterOccurrence = {
  id: "root",
  definitionId: "ROOT",
  acquiredLevel: 1,
  kind: "root",
};

function choice(
  id: string,
  definitionId: string,
  parentId: string,
  choiceIndex: number,
  extra: Partial<CharacterOccurrence> = {},
): CharacterOccurrence {
  return {
    id,
    definitionId,
    acquiredLevel: 1,
    parentId,
    ruleOrdinal: 0,
    choiceIndex,
    kind: "choice",
    ...extra,
  };
}

describe("native Psionics (Hybrid Power Points)", () => {
  it("adds 2/4/6 per owned unlocked augmentable at-will attack and strips locked keywords", () => {
    const evaluated = evaluateCharacter(
      {
        level: 11,
        baseAbilities: {},
        occurrences: [
          root,
          {
            id: "hpp",
            definitionId: "ID_INTERNAL_INTERNAL_HYBRID_POWER_POINTS",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          choice("a", "MIND_THRUST", "root", 0),
          choice("b", "DISHEARTEN", "root", 1),
          {
            id: "trait",
            definitionId: "ID_FMP_RACIAL_TRAIT_643",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          choice("d", "FORCEFUL_PUSH", "trait", 0),
        ],
        inventory: [],
      },
      content,
    );
    // Mind Thrust (Level 1) 2 + Dishearten (Level 11) 4; the Dilettante
    // pick is locked (D20Workspace.IsUnlockedAugmentablePower).
    expect(evaluated.stats["Hybrid Power Points"]?.value).toBe(6);
    expect(evaluated.stats["Power Points"]?.value).toBe(6);
    expect(
      evaluated.overlays.find(
        ({ field, targetDefinitionIds }) =>
          field === "Keywords" && targetDefinitionIds.includes("FORCEFUL_PUSH"),
      )?.value,
    ).toBe("Implement, Psionic, Psychic");
    expect(
      evaluated.overlays.some(({ targetDefinitionIds }) =>
        targetDefinitionIds.includes("MIND_THRUST"),
      ),
    ).toBe(false);
  });

  it("gives Hybrid Power Points 0 without augmentable powers", () => {
    const evaluated = evaluateCharacter(
      { level: 1, baseAbilities: {}, occurrences: [root], inventory: [] },
      content,
    );
    expect(evaluated.stats["Hybrid Power Points"]?.value).toBe(0);
  });

  it("takes Psionic Conventionalist's power points by the swapped power's Level", () => {
    const evaluated = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          root,
          choice("a", "MIND_THRUST", "root", 0),
          choice("lost", "FORCEFUL_PUSH", "root", 1),
          {
            id: "feat",
            definitionId: "ID_FMP_FEAT_2732",
            acquiredLevel: 2,
            kind: "grabbag",
          },
          choice("swap", "SWORD_BURST", "feat", 0, {
            acquiredLevel: 2,
            replacesId: "lost",
          }),
        ],
        inventory: [],
      },
      content,
    );
    expect(evaluated.stats["Power Points"]?.value).toBe(-2);
    expect(evaluated.stats["Hybrid Power Points"]?.value).toBe(2);
  });
});
