import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { evaluatePrerequisite, internalizePrerequisite } from "./prerequisites";

const owned = [
  { id: "CLASS", name: "Avenger", type: "Class" },
  { id: "SOURCE", name: "Divine", type: "Power Source" },
  { id: "TRAINING", name: "Athletics", type: "Skill Training" },
  { id: "MULTI", name: "Multiclass", type: "Multiclass" },
  {
    id: "PROFICIENCY",
    name: "Weapon Proficiency (Longsword)",
    type: "Proficiency",
  },
  {
    id: "DEITY",
    name: "Ioun",
    type: "Deity",
    categories: [],
    specifics: [
      {
        name: "Domains",
        value: "Arcana, Knowledge, Skill",
        extraAttributes: [],
        ordinal: 0,
      },
    ],
  },
] as unknown as ContentEntity[];
const definitions = [
  ...owned,
  { id: "WIZARD", name: "Wizard", type: "Class" } as ContentEntity,
  {
    id: "BLOOD_THIRST",
    name: "Blood Thirst",
    type: "Feat",
  } as ContentEntity,
];
const context = {
  owned,
  definitions,
  level: 8,
  abilities: { Strength: 13, Wisdom: 16 },
};

const holySymbolProficiency = {
  id: "HOLY_SYMBOL_PROFICIENCY",
  name: "Implement Proficiency (Holy Symbol)",
  type: "Proficiency",
} as ContentEntity;
const kiFocusProficiency = {
  id: "KI_FOCUS_PROFICIENCY",
  name: "Implement Proficiency (Ki Focuses)",
  type: "Proficiency",
} as ContentEntity;

describe("legacy prerequisites", () => {
  it("evaluates ability, level, training, source, identity, and boolean clauses", () => {
    expect(
      evaluatePrerequisite("Str 13, Wis 13; Multiclass; !Wizard", context)
        .status,
    ).toBe("satisfied");
    expect(evaluatePrerequisite("Trained in Athletics", context).status).toBe(
      "satisfied",
    );
    expect(evaluatePrerequisite("Any divine class", context).status).toBe(
      "satisfied",
    );
    expect(evaluatePrerequisite("Level 11", context).status).toBe("failed");
  });

  it("keeps unresolved markers and unknown prose unverified", () => {
    expect(evaluatePrerequisite("~HUMAN", context).status).toBe("unverified");
    expect(
      evaluatePrerequisite("must have crossed the silver sea", context).status,
    ).toBe("unverified");
  });

  it("fails an absent prerequisite that names a known definition", () => {
    const arcaneAdmixture = {
      id: "ARCANE_ADMIXTURE_II",
      name: "Arcane Admixture II",
      type: "Feat",
    } as ContentEntity;
    expect(
      evaluatePrerequisite("Arcane Admixture II", {
        ...context,
        knownTokens: new Set(["arcane admixture ii"]),
      }).status,
    ).toBe("failed");
    expect(
      evaluatePrerequisite("Arcane Admixture II", {
        ...context,
        owned: [...owned, arcaneAdmixture],
        knownTokens: new Set(["arcane admixture ii"]),
      }).status,
    ).toBe("satisfied");
  });

  it("covers level, tier, class, training, proficiency, and deity prose", () => {
    expect(evaluatePrerequisite("8th level", context).status).toBe("satisfied");
    expect(evaluatePrerequisite("Paragon Tier", context).status).toBe("failed");
    expect(evaluatePrerequisite("Avenger class", context).status).toBe(
      "satisfied",
    );
    expect(
      evaluatePrerequisite("You must have training in Athletics.", context)
        .status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("proficiency with longsword", context).status,
    ).toBe("satisfied");
    expect(evaluatePrerequisite("must worship Ioun", context).status).toBe(
      "satisfied",
    );
    expect(
      evaluatePrerequisite("must worship a deity of the skill domain", context)
        .status,
    ).toBe("satisfied");
    expect(evaluatePrerequisite("Unselectable", context).status).toBe("failed");
  });

  it("resolves implement-use prose to exact proficiency definitions", () => {
    const implementDefinitions = [
      ...definitions,
      holySymbolProficiency,
      kiFocusProficiency,
    ];
    const holySymbolContext = {
      ...context,
      definitions: implementDefinitions,
      owned: [...owned, holySymbolProficiency],
    };

    expect(
      internalizePrerequisite(
        "Can use the Holy Symbol implement",
        holySymbolContext,
      ),
    ).toEqual({
      kind: "element",
      text: "Can use the Holy Symbol implement",
      definitionIds: ["HOLY_SYMBOL_PROFICIENCY"],
      negated: false,
    });
    expect(
      evaluatePrerequisite(
        "Can use the Holy Symbol implement",
        holySymbolContext,
      ).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("Can use the Holy Symbol implement", {
        ...holySymbolContext,
        owned,
      }).status,
    ).toBe("failed");
    expect(
      evaluatePrerequisite("Can use the Ki focuses implement", {
        ...holySymbolContext,
        owned: [...owned, kiFocusProficiency],
      }).status,
    ).toBe("satisfied");
  });

  it("evaluates bracketed feat references by their definition name", () => {
    const prerequisite = "Blood Thirst [Multiclass Vampire] feat";
    expect(evaluatePrerequisite(prerequisite, context).status).toBe("failed");
    expect(
      evaluatePrerequisite(prerequisite, {
        ...context,
        owned: [
          ...owned,
          { id: "BLOOD_THIRST", name: "Blood Thirst", type: "Feat" },
        ] as ContentEntity[],
      }).status,
    ).toBe("satisfied");
  });

  it("treats comma-delimited lists ending in or as alternatives", () => {
    const prerequisite =
      "ID_FMP_POWER_917, ID_FMP_POWER_4368, or ID_FMP_POWER_10591";
    const knownTokens = new Set([
      "id fmp power 917",
      "id fmp power 4368",
      "id fmp power 10591",
    ]);
    expect(
      evaluatePrerequisite(prerequisite, {
        ...context,
        knownTokens,
        ownedTokens: new Set(["id fmp power 4368"]),
      }).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite(prerequisite, {
        ...context,
        knownTokens,
        ownedTokens: new Set(),
      }).status,
    ).toBe("failed");
  });

  it("builds the confirmed semicolon, comma, and word-and tree", () => {
    const definitions = [
      { id: "A", name: "A", type: "Feat" },
      { id: "B", name: "B", type: "Feat" },
      { id: "C", name: "C", type: "Feat" },
    ] as ContentEntity[];
    const ir = internalizePrerequisite("A, B and C; 11th level", {
      ...context,
      definitions,
    });
    expect(ir).toMatchObject({
      kind: "all",
      children: [
        {
          kind: "all",
          children: [
            { kind: "element" },
            { kind: "element" },
            { kind: "element" },
          ],
        },
        { kind: "level", minimum: 11 },
      ],
    });
    expect(
      evaluatePrerequisite("A, B and C; 11th level", {
        ...context,
        level: 11,
        definitions,
        owned: definitions,
      }).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("A, B and C; 11th level", {
        ...context,
        level: 11,
        definitions,
        owned: definitions.slice(0, 2),
      }).status,
    ).toBe("failed");
  });

  it("builds A, B, or C as one OR branch", () => {
    const definitions = ["A", "B", "C"].map(
      (name) => ({ id: name, name, type: "Feat" }) as ContentEntity,
    );
    expect(
      internalizePrerequisite("A, B, or C", {
        ...context,
        definitions,
      }),
    ).toMatchObject({
      kind: "any",
      children: [{ kind: "element" }, { kind: "element" }, { kind: "element" }],
    });
    expect(
      evaluatePrerequisite("A, B, or C", {
        ...context,
        definitions,
        owned: [definitions[1] as ContentEntity],
      }).status,
    ).toBe("satisfied");
  });

  it("honors evidenced parentheses around nested connective groups", () => {
    const definitions = ["A", "B", "C"].map(
      (name) => ({ id: name, name, type: "Feat" }) as ContentEntity,
    );
    expect(
      internalizePrerequisite("A and (B or C)", {
        ...context,
        definitions,
      }),
    ).toMatchObject({
      kind: "all",
      children: [
        { kind: "element", definitionIds: ["A"] },
        { kind: "any", children: [{ kind: "element" }, { kind: "element" }] },
      ],
    });
    expect(
      evaluatePrerequisite("A and (B or C)", {
        ...context,
        definitions,
        owned: [definitions[0], definitions[2]] as ContentEntity[],
      }).status,
    ).toBe("satisfied");
  });

  it("resolves exact names, internal IDs, and type-qualified references", () => {
    const feat = {
      id: "ID_FEAT_ALPHA",
      name: "Shared Name",
      type: "Feat",
    } as ContentEntity;
    const power = {
      id: "ID_POWER_ALPHA",
      name: "Shared Name",
      type: "Power",
    } as ContentEntity;
    const resolvedContext = {
      ...context,
      definitions: [feat, power],
      owned: [feat],
    };
    expect(evaluatePrerequisite("ID_FEAT_ALPHA", resolvedContext).status).toBe(
      "satisfied",
    );
    expect(
      evaluatePrerequisite("Shared Name feat", resolvedContext).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("Shared Name power", resolvedContext).status,
    ).toBe("failed");
    expect(
      evaluatePrerequisite(
        "Shared Name [Multiclass Example] feat",
        resolvedContext,
      ).status,
    ).toBe("satisfied");
  });

  it("evaluates same-type tilde markers as mutual exclusions", () => {
    const subject = {
      id: "PATH_A",
      name: "Path A",
      type: "Feat",
      prerequisites: "~EXCLUSIVE_PATH",
    } as ContentEntity;
    const competing = {
      id: "PATH_B",
      name: "Path B",
      type: "Feat",
      prerequisites: "Str 13, ~EXCLUSIVE_PATH; Paragon Tier",
    } as ContentEntity;
    const otherType = {
      id: "RACE_PATH",
      name: "Race Path",
      type: "Race",
      prerequisites: "~EXCLUSIVE_PATH",
    } as ContentEntity;
    const definitions = [subject, competing, otherType];
    expect(
      internalizePrerequisite(subject.prerequisites, {
        ...context,
        subject,
        definitions,
      }),
    ).toEqual({
      kind: "exclusive",
      text: "~EXCLUSIVE_PATH",
      definitionIds: ["PATH_B"],
    });
    expect(
      evaluatePrerequisite(subject.prerequisites, {
        ...context,
        subject,
        definitions,
        owned: [subject, otherType],
      }).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite(subject.prerequisites, {
        ...context,
        subject,
        definitions,
        owned: [competing],
      }).status,
    ).toBe("failed");
  });
});
