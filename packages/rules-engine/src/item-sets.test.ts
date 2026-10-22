import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterInventoryEntry } from "./evaluator";
import { itemSetPartyCountName, itemSetPartyPieces } from "./item-sets";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      name: key,
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
    readonly rules?: readonly RuleStatement[];
    readonly specifics?: Record<string, string>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([name, value], ordinal) => ({
        name,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "item-sets-test", sourceOrdinal: 0 },
  };
}

const piece = (id: string, name: string, set: string, counter = "Set Count") =>
  entity(id, name, "Magic Item", {
    rules: [
      rule(
        "statadd",
        { name: `${set} ${counter}`, value: "+1", type: name },
        0,
      ),
    ],
    specifics: { _Item_Set_ID: set },
  });

const content = [
  entity("L1", "1", "Level"),
  entity("SET", "Synthetic Regalia", "Item Set", {
    specifics: { Tier: "Heroic", Benefits: "BENEFIT_2,BENEFIT_3" },
  }),
  entity("BENEFIT_2", "Synthetic Regalia (2)", "Item Set Benefit", {
    specifics: { _Item_Set_ID: "SET", "Piece Count": "2" },
    rules: [rule("statadd", { name: "Stealth", value: "+2", type: "item" }, 0)],
  }),
  entity("BENEFIT_3", "Synthetic Regalia (3)", "Item Set Benefit", {
    specifics: { _Item_Set_ID: "SET", "Piece Count": "3" },
    rules: [rule("statadd", { name: "Speed", value: "+1" }, 0)],
  }),
  piece("CROWN", "Synthetic Crown", "SET"),
  piece("CLOAK", "Synthetic Cloak", "SET"),
  entity("GROUP", "Synthetic Company Arms", "Item Set", {
    specifics: { Tier: "Group", Benefits: "GROUP_2" },
  }),
  entity("GROUP_2", "Synthetic Company Arms (2)", "Item Set Benefit", {
    specifics: { _Item_Set_ID: "GROUP", "Piece Count": "2" },
    rules: [rule("statadd", { name: "Insight", value: "+2" }, 0)],
  }),
  piece("BLADE", "Synthetic Company Blade", "GROUP", "Equipped Count"),
];

const holding = (
  id: string,
  definitionId: string,
  equippedQuantity: number,
  quantity = 1,
): CharacterInventoryEntry => ({
  id,
  definitionIds: [definitionId],
  quantity,
  equippedQuantity,
  acquiredLevel: 1,
});

const evaluate = (
  inventory: readonly CharacterInventoryEntry[],
  textStrings: Record<string, string> = {},
) =>
  evaluateCharacter(
    {
      level: 1,
      baseAbilities: {},
      occurrences: [
        { id: "level-1", definitionId: "L1", acquiredLevel: 1, kind: "root" },
      ],
      inventory,
      textStrings,
    },
    content,
  );

describe("item sets", () => {
  it("unlocks the benefits the equipped pieces reach and applies them", () => {
    const evaluated = evaluate([
      holding("crown", "CROWN", 1),
      holding("cloak", "CLOAK", 1),
    ]);
    expect(evaluated.itemSets).toEqual([
      { setId: "SET", pieces: 2, activeBenefitIds: ["BENEFIT_2"] },
    ]);
    expect(evaluated.activeDefinitionIds).toContain("BENEFIT_2");
    expect(evaluated.activeDefinitionIds).not.toContain("BENEFIT_3");
    expect(evaluated.stats.Stealth?.value).toBe(2);
  });

  it("counts a piece once however many copies, and only while equipped", () => {
    expect(
      evaluate([holding("crowns", "CROWN", 2, 2)]).itemSets?.[0]?.pieces,
    ).toBe(1);
    const unequipped = evaluate([
      holding("crown", "CROWN", 1),
      holding("cloak", "CLOAK", 0),
    ]);
    expect(unequipped.itemSets?.[0]?.pieces).toBe(1);
    expect(unequipped.activeDefinitionIds).not.toContain("BENEFIT_2");
  });

  it("counts a group set's party pieces only while the character wields one", () => {
    const party = { "GROUP Set Count": "3" };
    expect(evaluate([holding("blade", "BLADE", 1)], party).itemSets).toEqual([
      { setId: "GROUP", pieces: 3, activeBenefitIds: ["GROUP_2"] },
    ]);
    expect(evaluate([holding("blade", "BLADE", 0)], party).itemSets).toBe(
      undefined,
    );
  });

  it("applies a group set's benefits at the entered party count", () => {
    const blade = [holding("blade", "BLADE", 1)];
    const unset = evaluate(blade);
    expect(unset.itemSets?.[0]?.pieces).toBe(0);
    expect(unset.stats.Insight?.value ?? 0).toBe(0);
    const below = evaluate(blade, { "GROUP Set Count": "1" });
    expect(below.activeDefinitionIds).not.toContain("GROUP_2");
    // The key matches ignoring case, as legacy textstrings may differ.
    const entered = evaluate(blade, { "group set count": "2" });
    expect(entered.activeDefinitionIds).toContain("GROUP_2");
    expect(entered.stats.Insight?.value).toBe(2);
  });

  it("reads and names the party count textstring", () => {
    expect(itemSetPartyPieces("GROUP", {})).toBeUndefined();
    expect(itemSetPartyPieces("GROUP", { "GROUP Set Count": "" })).toBe(
      undefined,
    );
    expect(itemSetPartyPieces("GROUP", { "Group set count": "4" })).toBe(4);
    expect(itemSetPartyCountName("GROUP")).toBe("GROUP Set Count");
    expect(itemSetPartyCountName("GROUP", { "group set count": "4" })).toBe(
      "group set count",
    );
  });
});
