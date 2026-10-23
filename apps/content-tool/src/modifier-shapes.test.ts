import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  collectModifierUses,
  groupByShape,
  linkedStatNames,
  modifierShape,
  qualifierShapes,
  representativeUses,
  selectorShape,
  shapeVocabulary,
  statNameShape,
  valueForm,
} from "./modifier-shapes";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal = 0,
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
    readonly rules?: readonly RuleStatement[];
    readonly specifics?: Record<string, string>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
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
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
  };
}

const entities = [
  entity("ID_SYN_SKILL_1", "Lore", "Skill"),
  entity("ID_SYN_SKILL_2", "History", "Skill"),
  entity("ID_SYN_POWER_1", "Synthetic Bolt", "Power", {
    specifics: { Keywords: "Arcane, Implement, Charm" },
  }),
  entity("ID_SYN_ITEM_1", "Synthetic Shard", "Magic Item", {
    specifics: { "Magic Item Type": "Dragonshard Augment" },
  }),
  entity("ID_SYN_ITEM_SET_1", "Synthetic Set", "Item Set"),
  entity("ID_SYN_FEAT_1", "Synthetic Feat", "Feat", {
    rules: [
      rule("statadd", { name: "Lore Misc", value: "+2", type: "Feat" }),
      rule(
        "statadd",
        { name: "fire:damage", value: "+1", condition: "when bloodied" },
        1,
      ),
      rule(
        "statadd",
        {
          name: "implement:damage(Synthetic Shard)",
          value: "+Synthetic Counter",
        },
        2,
      ),
      rule(
        "modify",
        {
          name: "Synthetic Bolt",
          type: "Power",
          Field: "Strength",
          value: "18",
        },
        3,
      ),
      rule("textstring", { name: "Action Point", value: "Extra" }, 4),
      rule("statadd", { name: "AC", value: "+1", wearing: "armor:light" }, 5),
    ],
  }),
  entity("ID_SYN_FEAT_2", "Other Feat", "Feat", {
    rules: [
      rule("statadd", { name: "History Misc", value: "+1" }),
      rule(
        "modify",
        { select: "Bolt Choice", Field: "Keywords", "list-addition": "Fire" },
        1,
      ),
    ],
  }),
];

describe("modifier shapes", () => {
  const vocabulary = shapeVocabulary(entities);

  it("normalizes keyword, limiter and namespace stat names", () => {
    expect(statNameShape("fire:damage", vocabulary)).toBe(
      "<damage type>:damage",
    );
    expect(statNameShape("arcane,implement:attack", vocabulary)).toBe(
      "<keyword>,implement:attack",
    );
    expect(statNameShape("implement,arcane:attack", vocabulary)).toBe(
      "<keyword>,implement:attack",
    );
    expect(statNameShape("implement:damage(Synthetic Shard)", vocabulary)).toBe(
      "implement:damage(<magic item>)",
    );
    expect(statNameShape("ID_SYN_POWER_1:attack", vocabulary)).toBe(
      "<power id>:attack",
    );
    expect(statNameShape("resist:fire", vocabulary)).toBe(
      "resist:<damage type>",
    );
    expect(statNameShape("resist:all", vocabulary)).toBe("resist:all");
    expect(statNameShape("light blade group:attack", vocabulary)).toBe(
      "<weapon group>:attack",
    );
    expect(statNameShape("BEAST.Lore Misc", vocabulary)).toBe(
      "beast.<skill> misc",
    );
  });

  it("normalizes misc, set-count and literal stat names", () => {
    expect(statNameShape("Lore Misc", vocabulary)).toBe("<skill> misc");
    expect(statNameShape("Initiative Misc", vocabulary)).toBe(
      "initiative misc",
    );
    expect(statNameShape("ID_SYN_ITEM_SET_1 Set Count", vocabulary)).toBe(
      "<item set id> set count",
    );
    expect(statNameShape("Armor Class", vocabulary)).toBe("armor class");
    expect(statNameShape("[Bolt Choice]:damage", vocabulary)).toBe(
      "<other>:damage",
    );
  });

  it("shapes equipment selectors and value forms", () => {
    expect(selectorShape("armor:light", vocabulary)).toBe("armor:light");
    expect(selectorShape("weapon:light blade group", vocabulary)).toBe(
      "weapon:<weapon group>",
    );
    expect(selectorShape("Synthetic Shard", vocabulary)).toBe(
      "<magic item name>",
    );
    expect(valueForm("+2")).toBe("constant");
    expect(valueForm("+Constitution modifier")).toBe("link");
    expect(valueForm("ABILITYMOD(Wisdom)")).toBe("ability-modifier");
    expect(valueForm("Low-light")).toBe("string");
  });

  it("keys uses by target shape, gate and modify mutation", () => {
    const uses = collectModifierUses(entities);
    expect(uses.map((use) => modifierShape(use, vocabulary))).toEqual([
      "statadd <skill> misc",
      "statadd <damage type>:damage [conditional]",
      "statadd implement:damage(<magic item>)",
      "modify power.<ability> value",
      "textstring action point",
      "statadd ac [wearing]",
      "statadd <skill> misc",
      "modify <select>.keywords list-addition",
    ]);
    expect(qualifierShapes(uses[0]!, vocabulary)).toEqual([
      "statadd type=feat",
      "statadd value=constant",
    ]);
    expect(qualifierShapes(uses[5]!, vocabulary)).toContain(
      "statadd wearing=armor:light",
    );
  });

  it("ranks groups by entity count and picks distinct examples", () => {
    const uses = collectModifierUses(entities);
    const groups = groupByShape(uses, (use) => modifierShape(use, vocabulary));
    expect(groups[0]?.shape).toBe("statadd <skill> misc");
    expect(groups[0]?.entityCount).toBe(2);
    expect(
      representativeUses(groups[0]!, 5).map((use) => use.attributes.name),
    ).toEqual(["Lore Misc", "History Misc"]);
    expect(linkedStatNames(uses).get("synthetic counter")).toBe(1);
  });
});
