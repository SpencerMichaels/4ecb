import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type FieldOverlay } from "./evaluator";
import {
  legacyKeywordList,
  legacyListContains,
  legacyListContainsOneOf,
  weaponGroups,
} from "./weapon-groups";

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
  specifics: Record<string, string> = {},
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
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const glaive = entity("SYN_GLAIVE", "Synthetic glaive", "Weapon", {
  Group: "Heavy Blade, Polearm",
  Damage: "2d4",
  "Proficiency Bonus": "2",
  "Weapon Category": "Military Melee",
  "Hands Required": "Two-Handed",
});

function arenaOverlay(overrides: Partial<FieldOverlay> = {}): FieldOverlay {
  return {
    providerOccurrenceId: "arena",
    targetDefinitionIds: [],
    targetName: "Synthetic glaive",
    targetType: "Weapon",
    field: "Group",
    listAddition: "Arena",
    ...overrides,
  };
}

describe("weapon groups", () => {
  it("splits a keyword list like native InsertList", () => {
    expect(legacyKeywordList(" Heavy Blade ,Polearm ")).toEqual([
      "Heavy Blade",
      "Polearm",
    ]);
    expect(legacyKeywordList("Spear; see text, Axe")).toEqual(["Spear"]);
    expect(legacyKeywordList(undefined)).toEqual([]);
  });

  it("applies Group overlays that name an unowned inventory weapon", () => {
    expect(weaponGroups(glaive, [])).toEqual(["Heavy Blade", "Polearm"]);
    expect(weaponGroups(glaive, [arenaOverlay()])).toEqual([
      "Heavy Blade",
      "Polearm",
      "Arena",
    ]);
    expect(
      weaponGroups(glaive, [arenaOverlay({ targetName: "SYN_GLAIVE" })]),
    ).toContain("Arena");
    // The type qualifies the name; another field never changes the groups.
    expect(
      weaponGroups(glaive, [arenaOverlay({ targetType: "Magic Item" })]),
    ).not.toContain("Arena");
    expect(
      weaponGroups(glaive, [arenaOverlay({ field: "Properties" })]),
    ).not.toContain("Arena");
    expect(
      weaponGroups(glaive, [
        {
          providerOccurrenceId: "spear",
          targetDefinitionIds: ["syn_glaive"],
          targetName: "Elsewhere",
          field: "group",
          value: "Spear",
        },
      ]),
    ).toEqual(["Spear"]);
  });

  it("matches each group's damage channel, including an overlaid group", () => {
    const entities = [
      entity("ROOT", "1", "Level"),
      glaive,
      entity(
        "SYN_ARENA_GLAIVE",
        "Synthetic arena weapon (glaive)",
        "Class Feature",
        {},
        [
          rule(
            "modify",
            {
              name: "Synthetic glaive",
              type: "Weapon",
              Field: "Group",
              "list-addition": "Arena",
            },
            0,
          ),
        ],
      ),
      entity("SYN_FEAT", "Synthetic blade master", "Feat", {}, [
        rule(
          "statadd",
          { name: "arena group:damage", value: "+3", type: "Feat" },
          0,
        ),
        rule("statadd", { name: "polearm group:damage", value: "+1" }, 1),
      ]),
      entity("SYN_STRIKE", "Synthetic strike", "Power", {
        Keywords: "Martial, Weapon",
        "Attack Type": "Melee weapon",
        Attack: "Strength vs. AC",
        Hit: "1[W] damage.",
      }),
    ];
    const evaluate = (arena: boolean) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            {
              id: "root",
              definitionId: "ROOT",
              acquiredLevel: 1,
              kind: "root",
            },
            {
              id: "feat",
              definitionId: "SYN_FEAT",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            {
              id: "strike",
              definitionId: "SYN_STRIKE",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            ...(arena
              ? [
                  {
                    id: "arena",
                    definitionId: "SYN_ARENA_GLAIVE",
                    acquiredLevel: 1,
                    kind: "grabbag" as const,
                  },
                ]
              : []),
          ],
          inventory: [
            {
              id: "glaive",
              definitionIds: ["SYN_GLAIVE"],
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
            },
          ],
          candidateDetailLevels: [],
        },
        entities,
      )
        .powers.find((power) => power.definitionId === "SYN_STRIKE")
        ?.variants.find((variant) => variant.equipmentId === "glaive");

    expect(evaluate(false)?.damage).toBe("2d4+1");
    expect(evaluate(true)?.damage).toBe("2d4+4");
  });
});

describe("legacy list matching", () => {
  it("matches whole comma entries like native ListContains", () => {
    expect(legacyListContains("hand crossbow,shortbow", "Shortbow")).toBe(true);
    expect(legacyListContains("hand crossbow,shortbow", "Hand Crossbow")).toBe(
      true,
    );
    // "crossbow" first occurs inside "hand crossbow", so it is not an entry.
    expect(legacyListContains("hand crossbow,shortbow", "Crossbow")).toBe(
      false,
    );
    expect(legacyListContains("Longsword, Mace group", "mace group")).toBe(
      true,
    );
    expect(legacyListContains("any", "Greatsword")).toBe(true);
    expect(legacyListContainsOneOf("light blade,sling", "Axe, Sling")).toBe(
      true,
    );
    expect(legacyListContainsOneOf("light blade,sling", "Heavy Blade")).toBe(
      false,
    );
  });
});
