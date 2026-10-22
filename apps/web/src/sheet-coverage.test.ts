import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";
import type { CharacterSheetModel } from "@4ecb/sheet-model";

import {
  ChoiceReachability,
  choiceRuleKey,
  groupCounts,
  mergeTallies,
  registryFindings,
  sheetPresence,
  tallyPresence,
  type TypePresenceTally,
} from "./sheet-coverage";

function entity(id: string, name: string, type: string): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Sheet coverage fixture",
    sources: ["Sheet coverage fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "sheet-coverage", sourceOrdinal: 0 },
  };
}

function occurrence(
  id: string,
  definitionId: string,
  parentId?: string,
): CharacterOccurrence {
  return {
    id,
    definitionId,
    acquiredLevel: 1,
    kind: parentId === undefined ? "root" : "grant",
    ...(parentId === undefined ? {} : { parentId }),
  };
}

function sheet(overrides: Partial<CharacterSheetModel>): CharacterSheetModel {
  return {
    source: "authoritative-evaluation",
    identity: [],
    abilities: [],
    defenses: [],
    resources: [],
    senses: [],
    skills: [],
    equipment: [],
    features: [],
    powers: [],
    items: [],
    companions: [],
    learnedReferences: [],
    notes: [],
    ...overrides,
  };
}

const entities = [
  entity("ID_LEVEL_1", "1", "Level"),
  entity("ID_CLASS", "Warblade", "Class"),
  entity("ID_FEATURE", "Blade Focus", "Class Feature"),
  entity("ID_ASSOCIATE", "Storm Spirit", "Associate"),
  entity("ID_GRANTS", "Warblade", "Grants"),
  entity("ID_POWER", "Cleaving Cut", "Power"),
  entity("ID_SWORD", "Longsword", "Weapon"),
  entity("ID_SKILL", "Athletics", "Skill"),
  entity("ID_TRAINING", "Athletics", "Skill Training"),
  entity("ID_HYBRID_A", "Hybrid Warblade", "Hybrid Class"),
  {
    ...entity("ID_HYBRID", "Hybrid", "Class"),
    rules: [
      {
        name: "select",
        attributes: [{ name: "type", value: "Hybrid Class" }],
        text: "",
        children: [],
        ordinal: 0,
      },
    ],
  },
];
const byId = new Map(entities.map((value) => [value.id.toLowerCase(), value]));

describe("sheet presence", () => {
  const occurrences = [
    occurrence("level", "ID_LEVEL_1"),
    occurrence("class", "ID_CLASS", "level"),
    occurrence("grants", "ID_GRANTS", "class"),
    occurrence("feature", "ID_FEATURE", "class"),
    occurrence("feature-again", "ID_FEATURE", "level"),
    occurrence("associate", "ID_ASSOCIATE", "feature"),
    occurrence("power", "ID_POWER", "class"),
    occurrence("sword", "ID_SWORD"),
    occurrence("skill", "ID_SKILL", "level"),
    occurrence("training", "ID_TRAINING", "class"),
    occurrence("ghost", "ID_MISSING", "class"),
  ];
  const model = sheet({
    identity: [
      { label: "Level", value: "1" },
      { label: "Class", value: "Warblade" },
    ],
    features: [
      {
        group: "Class Feature",
        entries: [{ label: "Blade Focus", value: "" }],
      },
    ],
    powers: [
      { id: "ID_POWER", kind: "power", name: "Cleaving Cut", fields: [] },
    ],
    items: [{ kind: "item", name: "Longsword +1", fields: [] }],
    skills: [{ label: "Athletics", value: "5" }],
  });
  const rows = sheetPresence(occurrences, byId, model);
  const row = (id: string) => rows.find((value) => value.definitionId === id);

  it("finds each definition on its own surface only", () => {
    expect(row("ID_CLASS")?.surfaces).toEqual(["identity"]);
    expect(row("ID_FEATURE")?.surfaces).toEqual(["features"]);
    expect(row("ID_POWER")?.surfaces).toEqual(["powers"]);
    expect(row("ID_SWORD")?.surfaces).toEqual(["items"]);
    expect(row("ID_SKILL")?.surfaces).toEqual(["skills"]);
    // Same names on other types do not count as shown.
    expect(row("ID_GRANTS")?.surfaces).toEqual([]);
    expect(row("ID_TRAINING")?.surfaces).toEqual([]);
    expect(row("ID_LEVEL_1")?.surfaces).toEqual([]);
  });

  it("classifies what is not shown against the registry", () => {
    expect(row("ID_GRANTS")?.status).toBe("accounted");
    expect(row("ID_TRAINING")?.status).toBe("accounted");
    expect(row("ID_ASSOCIATE")?.status).toBe("unpresented");
    expect(row("ID_ASSOCIATE")?.provider).toEqual({
      id: "ID_FEATURE",
      name: "Blade Focus",
      type: "Class Feature",
    });
    expect(row("ID_MISSING")?.status).toBe("missing-definition");
  });

  it("merges a definition's occurrences into one row", () => {
    expect(row("ID_FEATURE")?.occurrences).toBe(2);
    expect(rows).toHaveLength(occurrences.length - 1);
  });

  it("counts an augmentable power shown through its augment versions", () => {
    const augmentable = {
      ...entity("ID_SURGE", "Mind Surge", "Power"),
      specifics: [
        {
          name: "_AugmentVersions",
          value: "ID_SURGE_A0, ID_SURGE_A1",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const shown = sheetPresence(
      [occurrence("surge", "ID_SURGE")],
      new Map([["id_surge", augmentable]]),
      sheet({
        powers: [
          {
            id: "ID_SURGE_A1",
            kind: "power",
            name: "Mind Surge (Augment 1)",
            fields: [],
          },
        ],
      }),
    );
    expect(shown[0]?.surfaces).toEqual(["powers"]);
  });

  it("counts sub-choices on their feature's row and listed proficiencies", () => {
    const content = new Map(
      [
        entity("ID_PACKAGE", "Bond of Stars", "Trait Package"),
        entity("ID_SIMPLE", "Simple Melee", "Proficiency"),
        entity("ID_CLUB", "Weapon Proficiency (Club)", "Proficiency"),
        entity("ID_PACT", "Weapon Proficiency (Pact)", "Proficiency"),
      ].map((value) => [value.id.toLowerCase(), value]),
    );
    const shown = sheetPresence(
      [
        occurrence("package", "ID_PACKAGE"),
        occurrence("simple", "ID_SIMPLE"),
        occurrence("club", "ID_CLUB", "simple"),
        occurrence("pact", "ID_PACT"),
      ],
      content,
      sheet({
        features: [
          {
            group: "Class Feature",
            entries: [
              {
                label: "Bond Choice",
                value: "",
                choices: [
                  {
                    id: "ID_PACKAGE",
                    name: "Bond of Stars",
                    type: "Trait Package",
                  },
                ],
              },
            ],
          },
        ],
        proficiencies: [
          {
            kind: "Weapons",
            values: ["simple melee"],
            definitionIds: ["ID_SIMPLE", "ID_CLUB"],
          },
        ],
      }),
    );
    const surfaces = (id: string) =>
      shown.find((value) => value.definitionId === id)?.surfaces;
    expect(surfaces("ID_PACKAGE")).toEqual(["choices"]);
    expect(surfaces("ID_SIMPLE")).toEqual(["proficiencies"]);
    // A weapon the listed group covers is shown through the group.
    expect(surfaces("ID_CLUB")).toEqual(["proficiencies"]);
    expect(surfaces("ID_PACT")).toEqual([]);
  });

  it("counts an alias the identity line's class grants as shown there", () => {
    const content = new Map(
      [
        ...entities,
        entity("ID_AS_WARBLADE", "Warblade", "CountsAsClass"),
        entity("ID_AS_FIGHTER", "Fighter", "CountsAsClass"),
      ].map((value) => [value.id.toLowerCase(), value]),
    );
    const shown = sheetPresence(
      [
        occurrence("class", "ID_CLASS"),
        occurrence("grants", "ID_GRANTS", "class"),
        occurrence("alias", "ID_AS_WARBLADE", "grants"),
        occurrence("feature", "ID_FEATURE", "class"),
        // A listed feature's alias needs its row; the class does not imply it.
        occurrence("feature-alias", "ID_AS_FIGHTER", "feature"),
      ],
      content,
      sheet({
        identity: [{ label: "Class", value: "Warblade" }],
        features: [
          {
            group: "Class Feature",
            entries: [{ label: "Blade Focus", value: "" }],
          },
        ],
      }),
    );
    const surfaces = (id: string) =>
      shown.find((value) => value.definitionId === id)?.surfaces;
    expect(surfaces("ID_AS_WARBLADE")).toEqual(["identity"]);
    expect(surfaces("ID_AS_FIGHTER")).toEqual([]);
  });

  it("splits a hybrid's Class identity line into its classes", () => {
    const hybrid = sheetPresence(
      [occurrence("hybrid", "ID_HYBRID_A")],
      byId,
      sheet({
        identity: [{ label: "Class", value: "Hybrid Warblade / Hybrid Seer" }],
      }),
    );
    expect(hybrid[0]?.surfaces).toEqual(["identity"]);
  });

  it("counts the hybrid marker class as shown by the hybrid Class line", () => {
    const presence = (value: string) =>
      sheetPresence(
        [occurrence("marker", "ID_HYBRID")],
        byId,
        sheet({ identity: [{ label: "Class", value }] }),
      )[0]?.surfaces;
    expect(presence("Hybrid Warblade / Hybrid Seer")).toEqual(["identity"]);
    expect(presence("Warblade")).toEqual([]);
  });
});

describe("registry findings", () => {
  it("flags registry claims the generated sheets contradict", () => {
    const tallies = new Map<string, TypePresenceTally>();
    tallyPresence(
      tallies,
      sheetPresence(
        [
          occurrence("associate", "ID_ASSOCIATE"),
          occurrence("power", "ID_POWER"),
          occurrence("feature", "ID_FEATURE"),
        ],
        byId,
        sheet({
          // An associate shows (contradicting its gap entry); the power has no card.
          features: [
            {
              group: "Associate",
              entries: [{ label: "Storm Spirit", value: "" }],
            },
            {
              group: "Class Feature",
              entries: [{ label: "Blade Focus", value: "" }],
            },
          ],
        }),
      ),
    );
    expect(registryFindings(tallies).map(({ type }) => type)).toEqual([
      "Associate",
      "Power",
    ]);
    expect(
      registryFindings(tallies, () => undefined).every(
        ({ problem }) => problem === "not in the registry",
      ),
    ).toBe(true);
  });

  it("treats a choice named on its feature's row as incidental", () => {
    const tallies = new Map<string, TypePresenceTally>([
      // Applied, but named on a feat's row: no contradiction.
      ["Skill Training", { rows: 4, presented: 1, surfaces: { choices: 1 } }],
      // Listed as a feature, and also chosen under one.
      ["Feat", { rows: 2, presented: 2, surfaces: { features: 2 } }],
      // A gap that now shows contradicts its entry.
      ["Associate", { rows: 1, presented: 1, surfaces: { choices: 1 } }],
    ]);
    expect(registryFindings(tallies).map(({ type }) => type)).toEqual([
      "Associate",
    ]);
  });
});

describe("choice reachability", () => {
  it("records offers, best eligibility and fillability per rule", () => {
    const reach = new ChoiceReachability();
    const rule = choiceRuleKey("ID_CLASS", 3);
    reach.record(rule, "A", 0, false);
    reach.record(rule, "B", 4, true);
    reach.record(rule, "B", 2, true);
    expect(reach.get(rule)).toEqual({
      offered: 3,
      maxEligible: 4,
      fillable: 2,
      examples: ["A", "B"],
    });
    expect(reach.get(choiceRuleKey("id_class", 4))).toBeUndefined();
    expect(choiceRuleKey(" ID_Class ", 3)).toBe(rule);
  });

  it("merges parallel workers' offers and tallies", () => {
    const left = new ChoiceReachability();
    left.record("rule", "A", 1, true);
    const right = new ChoiceReachability();
    right.record("rule", "B", 3, false);
    right.record("other", "B", 0, false);
    left.merge(right.reach);
    expect(left.get("rule")).toEqual({
      offered: 2,
      maxEligible: 3,
      fillable: 1,
      examples: ["A", "B"],
    });
    expect(left.get("other")?.offered).toBe(1);

    const tallies = new Map<string, TypePresenceTally>([
      ["Feat", { rows: 2, presented: 1, surfaces: { features: 1 } }],
    ]);
    mergeTallies(tallies, [
      ["Feat", { rows: 3, presented: 3, surfaces: { features: 2, powers: 1 } }],
      ["Associate", { rows: 1, presented: 0, surfaces: {} }],
    ]);
    expect(tallies.get("Feat")).toEqual({
      rows: 5,
      presented: 4,
      surfaces: { features: 3, powers: 1 },
    });
    expect(tallies.get("Associate")?.rows).toBe(1);
  });

  it("groups by key, most frequent first, with examples", () => {
    expect(
      groupCounts(["b", "a", "b", "c", "b", "a"], (value) => value, 2),
    ).toEqual([
      { key: "b", count: 3, examples: ["b", "b"] },
      { key: "a", count: 2, examples: ["a", "a"] },
      { key: "c", count: 1, examples: ["c"] },
    ]);
  });
});

describe("deity, god fragment and item set surfaces", () => {
  const records = new Map(
    [
      entity("ID_DEITY", "Synthetic Moon", "Deity"),
      entity("ID_DOMAIN", "Tides", "Domain"),
      entity("ID_FRAGMENT", "Shard of the Moon", "God Fragment"),
      entity("ID_BENEFIT", "Synthetic Regalia (2)", "Item Set Benefit"),
    ].map((value) => [value.id.toLowerCase(), value]),
  );
  const rows = sheetPresence(
    [
      occurrence("deity", "ID_DEITY"),
      occurrence("domain", "ID_DOMAIN", "deity"),
      occurrence("fragment", "ID_FRAGMENT"),
      occurrence("benefit", "ID_BENEFIT"),
    ],
    records,
    sheet({
      identity: [{ label: "Deity", value: "Synthetic Moon" }],
      deity: {
        id: "ID_DEITY",
        name: "Synthetic Moon",
        domains: [{ id: "ID_DOMAIN", name: "Tides" }],
        description: "",
        source: "",
      },
      powers: [{ id: "ID_FRAGMENT", kind: "power", name: "Shard", fields: [] }],
      itemSets: [
        {
          kind: "item-set",
          id: "ID_SET",
          name: "Synthetic Regalia",
          group: false,
          pieces: 2,
          pieceIds: [],
          benefits: [
            { id: "ID_BENEFIT", pieceCount: 2, text: "", active: true },
          ],
        },
      ],
    }),
  );

  it("finds each on the surface the registry claims", () => {
    expect(rows.map(({ type, surfaces }) => [type, surfaces])).toEqual([
      ["Deity", ["identity", "references"]],
      ["Domain", ["references"]],
      ["God Fragment", ["powers"]],
      ["Item Set Benefit", ["items"]],
    ]);
    const tallies = new Map<string, TypePresenceTally>();
    tallyPresence(tallies, rows);
    expect(registryFindings(tallies)).toEqual([]);
  });
});
