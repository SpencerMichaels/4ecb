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
  it("treats the clauses legacy ignores as met", () => {
    expect(
      evaluatePrerequisite("Living humanoid race; Multiclass", context).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("Must adhere to Amoth's precepts", context).status,
    ).toBe("satisfied");
  });

  it("counts a hybrid as both classes and its hybrid features as the base ones", () => {
    // Legacy CreateElementPrereq: a class or class feature requirement is also
    // met by the same-named CountsAsClass/CountsAsFeature the hybrid owns.
    const hybridOwned = [
      { id: "HYBRID_WARLORD", name: "Hybrid Warlord", type: "Hybrid Class" },
      { id: "COUNTS_WARLORD", name: "Warlord", type: "CountsAsClass" },
      {
        id: "COUNTS_BATTLEFRONT",
        name: "Battlefront Leader",
        type: "CountsAsFeature",
      },
    ] as unknown as ContentEntity[];
    const hybridContext = {
      owned: hybridOwned,
      definitions: [
        ...hybridOwned,
        { id: "ID_WARLORD", name: "Warlord", type: "Class" },
        {
          id: "BATTLEFRONT",
          name: "Battlefront Leader",
          type: "Class Feature",
        },
      ] as unknown as ContentEntity[],
      level: 8,
      abilities: {},
    };
    for (const prerequisite of [
      "Warlord",
      "warlord class",
      "ID_WARLORD",
      "Battlefront Leader class feature",
    ])
      expect(
        evaluatePrerequisite(prerequisite, hybridContext).status,
        prerequisite,
      ).toBe("satisfied");
    // Negated requirements take no alternate.
    expect(evaluatePrerequisite("!ID_WARLORD", hybridContext).status).toBe(
      "satisfied",
    );
  });

  it("resolves a bare race-family name through a granted CountsAsRace", () => {
    // Legacy SpecialCase maps "Shifter" to either shifter race; the
    // corrections pack expresses that as a CountsAsRace both races grant.
    const shifter = {
      id: "COUNTS_SHIFTER",
      name: "Shifter",
      type: "CountsAsRace",
    } as ContentEntity;
    const razorclaw = {
      id: "RAZORCLAW",
      name: "Razorclaw Shifter",
      type: "Race",
    } as ContentEntity;
    const shifterDefinitions = [...definitions, shifter, razorclaw];
    const shifterContext = {
      ...context,
      owned: [razorclaw, shifter],
      definitions: shifterDefinitions,
    };
    expect(evaluatePrerequisite("Shifter, Wis 13", shifterContext).status).toBe(
      "satisfied",
    );
    expect(
      evaluatePrerequisite("Shifter", {
        ...context,
        definitions: shifterDefinitions,
      }).status,
    ).toBe("failed");
  });

  it("meets a story membership by a representing option, else leaves it unverified", () => {
    // D090: corrections rewrite a membership clause as "<option> or <the
    // original wording>"; an OR is met by any met branch, otherwise it is
    // unverified while any branch is, and only fails when every branch does.
    const agent = {
      id: "AGENT_BACKGROUND",
      name: "Lodge Agent",
      type: "Background",
    } as ContentEntity;
    const scar = {
      id: "COUNTS_SCAR",
      name: "Scar",
      type: "CountsAsFeature",
    } as ContentEntity;
    const storyDefinitions = [...definitions, agent, scar];
    const without = { ...context, definitions: storyDefinitions };
    const withAgent = { ...without, owned: [...owned, agent] };
    const withScar = { ...without, owned: [...owned, scar] };
    const membership = "Lodge Agent or membership in the Lodge";
    expect(evaluatePrerequisite(membership, withAgent).status).toBe(
      "satisfied",
    );
    expect(evaluatePrerequisite(membership, without).status).toBe("unverified");
    expect(evaluatePrerequisite(membership, without).clauses).toEqual([
      { text: "Lodge Agent", status: "failed" },
      { text: "membership in the Lodge", status: "unverified" },
    ]);
    // Inside a comma list the other clauses still decide failure.
    expect(
      evaluatePrerequisite(
        "Any divine class, Scar or you have a scar",
        withScar,
      ).status,
    ).toBe("satisfied");
    expect(
      evaluatePrerequisite("Any divine class, Scar or you have a scar", without)
        .status,
    ).toBe("unverified");
    expect(
      evaluatePrerequisite("Any arcane class, Scar or you have a scar", without)
        .status,
    ).toBe("failed");
    // An alternative chain keeps earlier alternatives.
    expect(
      evaluatePrerequisite(
        "Blood Thirst feat or Lodge Agent or member of the Lodge",
        without,
      ).status,
    ).toBe("unverified");
    expect(
      evaluatePrerequisite(
        "Avenger or Lodge Agent or member of the Lodge",
        without,
      ).status,
    ).toBe("satisfied");
    // An OR of only resolvable branches still fails.
    expect(
      evaluatePrerequisite("Blood Thirst feat or Lodge Agent", without).status,
    ).toBe("failed");
  });

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
    // Swift Recovery and Combat Medic say "Training in Endurance/Heal".
    expect(evaluatePrerequisite("Training in Athletics", context).status).toBe(
      "satisfied",
    );
    expect(evaluatePrerequisite("Training in Heal", context).status).toBe(
      "failed",
    );
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

function entity(
  id: string,
  name: string,
  type: string,
  fields: Readonly<Record<string, string>> = {},
  extra: Partial<ContentEntity> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    categories: [],
    rules: [],
    specifics: Object.entries(fields).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    ...extra,
  } as unknown as ContentEntity;
}

describe("ported legacy prerequisite grammar", () => {
  const dwarf = entity("DWARF", "Dwarf", "Race");
  const fighter = entity("FIGHTER", "Fighter", "Class", {
    "Power Source": "Martial",
  });
  const psion = entity("PSION", "Psion", "Class", {
    "Power Source": "Psionic",
    _PARSED_CLASS_FEATURE: "Psionic Augmentation, Discipline Focus",
  });
  const breath = entity("BREATH", "Dragon Breath", "Power");
  const deity = entity("BAHAMUT", "Bahamut", "Deity");
  const region = entity("REGION", "East Rift", "Background");
  const ritualCaster = entity("RITUAL_CASTER", "Ritual Caster", "Feat");
  const ritual = entity("RITUAL", "Some Ritual", "Ritual");
  const fighterMulticlass = entity(
    "MC_FIGHTER",
    "Student of the Sword",
    "Feat",
    {
      type: "Multiclass Fighter",
    },
  );
  const psionMulticlass = entity("MC_PSION", "Psion Talent", "Feat", {
    type: "Multiclass Psion",
  });
  const plague = entity("PLAGUE", "Student of the Plague", "Feat", {
    type: "Multiclass Spellscarred",
  });
  const arena = entity("ARENA", "Arena Style", "Feat", {
    type: "Arena Fighting",
  });
  const paragonMulticlassing = entity(
    "ID_INTERNAL_PARAGON_PATH_PARAGON_MULTICLASSING",
    "Paragon Multiclassing",
    "Paragon Path",
  );
  const countsAsFighter = entity("COUNTS_FIGHTER", "Fighter", "CountsAsClass");
  const pact = entity("PACT", "Fey Pact", "CountsAsPact");
  const flail = entity("FLAIL", "Flail", "Weapon", {
    Group: "Flail",
    "Hands Required": "One-Handed",
  });
  const flailGroup = entity("FLAIL_GROUP", "Flail", "Weapon Group");
  const flailProficiency = entity(
    "FLAIL_PROF",
    "Weapon Proficiency (Flail)",
    "Proficiency",
  );
  const chainmail = entity(
    "CHAIN_PROF",
    "Armor Proficiency (Chainmail)",
    "Proficiency",
  );
  const psionicDaily = entity("PSI_DAILY", "Mind Storm", "Power", {
    "Power Type": "Attack",
    "Power Usage": "Daily",
    Keywords: "Psionic, Psychic",
  });
  const infusion = entity("INFUSION", "Healing Infusion: Remedy", "Power");
  const all = [
    dwarf,
    fighter,
    psion,
    breath,
    deity,
    region,
    ritualCaster,
    ritual,
    fighterMulticlass,
    psionMulticlass,
    plague,
    arena,
    paragonMulticlassing,
    countsAsFighter,
    pact,
    flail,
    flailGroup,
    flailProficiency,
    chainmail,
    psionicDaily,
    infusion,
  ];
  const status = (
    prerequisite: string,
    owned: readonly ContentEntity[],
    level = 1,
  ) =>
    evaluatePrerequisite(prerequisite, {
      owned,
      level,
      abilities: {},
      definitions: all,
    }).status;

  // Each form is met by the owning character and failed (not unverified)
  // without it.
  it.each([
    ["dragon breath racial power", [breath]],
    ["Follower of Bahamut", [deity]],
    ["you must worship Bahamut", [deity]],
    ["East Rift regional background", [region]],
    ["you must have the dragon breath power", [breath]],
    ["Ritual Caster feat", [ritualCaster]],
    ["dwarf fighter", [dwarf, fighter]],
    ["any multiclass fighter feat", [fighterMulticlass]],
    ["at least one arena fighting feat", [arena]],
    [
      "paragon multiclassing as a fighter",
      [paragonMulticlassing, fighterMulticlass],
    ],
    [
      "paragon multiclassing in a martial class",
      [paragonMulticlassing, countsAsFighter],
    ],
    ["any class-specific multiclass feat", [plague]],
    [
      "any class-specific multiclass feat for a class that has the Psionic Augmentation class feature",
      [psionMulticlass],
    ],
    [
      "any class that doesn't have the Psionic Augmentation class feature",
      [fighter],
    ],
    ["any warlock pact", [pact]],
    ["training with chainmail", [chainmail]],
    ["at least one psionic daily attack power", [psionicDaily]],
    ["at least one healing infusion power", [infusion]],
  ] as const)("reads %s", (prerequisite, owned) => {
    expect(status(prerequisite, owned)).toBe("satisfied");
    expect(status(prerequisite, [])).toBe("failed");
  });

  it("does not count a psionic class's multiclass feat as non-psionic", () => {
    expect(
      status(
        "any class-specific multiclass feat for a class that doesn't have the Psionic Augmentation class feature",
        [psionMulticlass],
      ),
    ).toBe("failed");
    expect(
      status(
        "any class that doesn't have the Psionic Augmentation class feature",
        [psion],
      ),
    ).toBe("failed");
  });

  it("reads hyphenated levels and curly apostrophes", () => {
    expect(status("21st-level", [], 21)).toBe("satisfied");
    expect(status("21st-level", [], 20)).toBe("failed");
    const quote = entity("QUOTE", "Templar's Fist", "Power");
    expect(
      evaluatePrerequisite("templar’s fist power", {
        owned: [quote],
        level: 1,
        abilities: {},
        definitions: [quote],
      }).status,
    ).toBe("satisfied");
  });

  it("carries a proficiency prefix to later weapon-group clauses", () => {
    const prerequisite =
      "proficiency with any one-handed hammer, one-handed flail, or one-handed mace";
    expect(status(prerequisite, [flailProficiency])).toBe("satisfied");
    // The first clause keeps the lenient modern proficiency reading.
    expect(status(prerequisite, [])).toBe("unverified");
    // Without the prefix the bare group form stays unread.
    expect(status("one-handed flail", [flailProficiency])).toBe("unverified");
  });

  it("does not split 1 or more", () => {
    expect(
      internalizePrerequisite("1 or more power points", context)?.kind,
    ).toBe("unverified");
  });
});

describe("connectors inside names", () => {
  const circle = entity("CIRCLE", "Circle of Smoke and Whispers", "Internal");
  const stance = entity("STANCE", "Hammer and Anvil", "Feat");
  const style = entity("STYLE", "Sword or Shield Style", "Feat");
  const lodge = entity("LODGE", "Lodge of Ash, Ember", "Background");
  const hammer = entity("HAMMER", "Hammer", "Feat");
  const anvil = entity("ANVIL", "Anvil", "Feat");
  const fighter = entity("FIGHTER", "Fighter", "Class");
  const all = [circle, stance, style, lodge, hammer, anvil, fighter];
  const evaluate = (prerequisite: string, owned: readonly ContentEntity[]) =>
    evaluatePrerequisite(prerequisite, {
      owned,
      level: 1,
      abilities: {},
      definitions: all,
    });

  it("keeps a membership naming a known record whole", () => {
    // Legacy InternalizeBlock keeps this clause whole before LineParse splits
    // at " and "; D090 leaves it unverified, as one clause.
    const result = evaluate(
      "Membership in the Circle of Smoke and Whispers",
      [],
    );
    expect(result.ir).toEqual({
      kind: "unverified",
      text: "Membership in the Circle of Smoke and Whispers",
    });
    expect(result.status).toBe("unverified");
  });

  it("does not split and, or, or a comma inside a known name", () => {
    expect(evaluate("Fighter, Hammer and Anvil feat", [fighter]).status).toBe(
      "failed",
    );
    expect(
      evaluate("Fighter, Hammer and Anvil feat", [fighter, stance]).status,
    ).toBe("satisfied");
    // The parts alone would have passed.
    expect(
      evaluate("Fighter, Hammer and Anvil feat", [fighter, hammer, anvil])
        .status,
    ).toBe("failed");
    expect(evaluate("Sword or Shield Style", [style]).status).toBe("satisfied");
    expect(evaluate("Sword or Shield Style", []).status).toBe("failed");
    expect(
      evaluate("Fighter, Lodge of Ash, Ember", [fighter, lodge]).status,
    ).toBe("satisfied");
    expect(evaluate("Fighter, Lodge of Ash, Ember", [fighter]).clauses).toEqual(
      [
        { text: "Fighter", status: "satisfied" },
        { text: "Lodge of Ash, Ember", status: "failed" },
      ],
    );
  });

  it("still splits at connectors outside names", () => {
    // The longest known name wins: bare "Hammer and Anvil" is the feat.
    expect(evaluate("Hammer and Anvil", [hammer, anvil]).status).toBe("failed");
    expect(evaluate("Hammer feat and Anvil feat", [hammer, anvil]).status).toBe(
      "satisfied",
    );
    expect(evaluate("Hammer feat and Anvil feat", [hammer]).status).toBe(
      "failed",
    );
    expect(evaluate("Fighter and Hammer", [fighter, hammer]).status).toBe(
      "satisfied",
    );
    // A name is matched on word boundaries only.
    expect(
      evaluate("Warhammer and Anvil", []).clauses.map((clause) => clause.text),
    ).toEqual(["Warhammer", "Anvil"]);
  });

  it("reads training in any two of a list as one clause", () => {
    // Legacy HarperTraining, read before the block's commas split it.
    const training = (name: string) =>
      entity(`TRAINING_${name}`, name, "Skill Training");
    const prerequisite =
      "training in any two of Diplomacy, Insight, Nature, or Stealth";
    const status = (names: readonly string[]) =>
      evaluate(prerequisite, names.map(training)).status;
    expect(status(["Insight"])).toBe("failed");
    expect(status(["Insight", "Stealth"])).toBe("satisfied");
    expect(status(["Diplomacy", "Nature"])).toBe("satisfied");
    expect(status(["Athletics", "Nature"])).toBe("failed");
    const ir = internalizePrerequisite(prerequisite, {
      owned: [],
      level: 1,
      abilities: {},
      definitions: all,
    });
    expect(ir?.kind === "any" ? ir.children.length : 0).toBe(6);
  });
});

describe("shared words in coordinated alternatives", () => {
  const martial = entity("MARTIAL", "Martial", "Power Source");
  const divine = entity("DIVINE", "Divine", "Power Source");
  const fighter = entity("FIGHTER", "Fighter", "Class", {
    "Power Source": "Martial",
  });
  const cleric = entity("CLERIC", "Cleric", "Class", {
    "Power Source": "Divine",
  });
  const skill = entity("SKILL_STEALTH", "Stealth", "Skill");
  const bluff = entity("TRAINING_BLUFF", "Bluff", "Skill Training");
  const stealth = entity("TRAINING_STEALTH", "Stealth", "Skill Training");
  const longbow = entity("LONGBOW", "Longbow", "Weapon", { Group: "Bow" });
  const shortbow = entity("SHORTBOW", "Shortbow", "Weapon", { Group: "Bow" });
  const longbowProficiency = entity(
    "PROF_LONGBOW",
    "Weapon Proficiency (Longbow)",
    "Proficiency",
  );
  const shortbowProficiency = entity(
    "PROF_SHORTBOW",
    "Weapon Proficiency (Shortbow)",
    "Proficiency",
  );
  const lightShield = entity(
    "PROF_LIGHT",
    "Shield Proficiency (Light)",
    "Proficiency",
  );
  const heavyShield = entity(
    "PROF_HEAVY",
    "Shield Proficiency (Heavy)",
    "Proficiency",
  );
  const heavyShields = entity("HEAVY_SHIELDS", "Heavy Shields", "Category");
  const defender = entity("DEFENDER", "Defender", "Role");
  const hunter = entity("HUNTER", "Hunter", "Class");
  const all = [
    martial,
    divine,
    fighter,
    cleric,
    skill,
    bluff,
    stealth,
    longbow,
    shortbow,
    longbowProficiency,
    shortbowProficiency,
    lightShield,
    heavyShield,
    heavyShields,
    defender,
    hunter,
  ];
  const evaluate = (
    prerequisite: string,
    owned: readonly ContentEntity[],
    level = 1,
  ) =>
    evaluatePrerequisite(prerequisite, {
      owned,
      level,
      abilities: {},
      definitions: all,
    });

  it("distributes a shared head or tail to an alternative missing it", () => {
    // Legacy reads "Any martial" alone (Unrecognized, always fails).
    const prerequisite = "Any martial or divine class";
    expect(evaluate(prerequisite, [martial]).status).toBe("satisfied");
    expect(evaluate(prerequisite, [divine]).status).toBe("satisfied");
    expect(evaluate(prerequisite, []).status).toBe("failed");
    expect(evaluate(prerequisite, []).clauses.map((c) => c.text)).toEqual([
      "Any martial class",
      "divine class",
    ]);
    expect(evaluate("any martial class or divine class", [divine]).status).toBe(
      "satisfied",
    );
  });

  it("keeps an unresolvable elliptical alternative whole, not a fragment", () => {
    expect(
      evaluate("Any arcane or divine class that can use an implement", [])
        .clauses,
    ).toEqual([
      {
        text: "Any arcane class that can use an implement",
        status: "unverified",
      },
      { text: "divine class that can use an implement", status: "unverified" },
    ]);
  });

  it("leaves alternatives that resolve alone untouched", () => {
    expect(
      evaluate("Fighter or Cleric", [cleric]).clauses.map((c) => c.text),
    ).toEqual(["Fighter", "Cleric"]);
    expect(
      evaluate("Elturgard or Evereska", []).clauses.map((c) => c.text),
    ).toEqual(["Elturgard", "Evereska"]);
  });

  it("carries a prefix's type to the alternatives after it", () => {
    // Every character owns the Stealth skill; only the training counts.
    expect(evaluate("trained in Bluff or Stealth", [skill]).status).toBe(
      "failed",
    );
    expect(evaluate("trained in Bluff or Stealth", [stealth]).status).toBe(
      "satisfied",
    );
    expect(evaluate("Trained in Bluff, Stealth", [bluff, skill]).status).toBe(
      "failed",
    );
    // Legacy InternalizeOr hands the rest of the text after " or " to
    // InternalizeBlock, which reads the prefix there.
    expect(
      evaluate("Fighter or trained in Bluff or Stealth", [stealth]).status,
    ).toBe("satisfied");
    expect(
      evaluate("proficiency with longbow or shortbow", [shortbow]).status,
    ).not.toBe("satisfied");
    expect(
      evaluate("proficiency with longbow or shortbow", [shortbowProficiency])
        .status,
    ).toBe("satisfied");
  });

  it("reads armor and shield proficiencies, sharing a tail", () => {
    const prerequisite = "proficiency with light or heavy shields";
    expect(evaluate(prerequisite, [heavyShield]).status).toBe("satisfied");
    expect(evaluate(prerequisite, [lightShield]).status).toBe("satisfied");
    expect(evaluate(prerequisite, [heavyShields]).status).not.toBe("satisfied");
    expect(evaluate(prerequisite, []).clauses.map((c) => c.text)).toEqual([
      "proficiency with light shields",
      "heavy shields",
    ]);
  });

  it("drops an ignored alternative, as legacy InternalizeOr does", () => {
    const prerequisite = "6th-level or higher utility power";
    expect(evaluate(prerequisite, [], 5).status).toBe("failed");
    expect(evaluate(prerequisite, [], 6).status).toBe("satisfied");
  });

  it("reads a class clause only when it names a class", () => {
    expect(evaluate("Arcane class", []).ir).toMatchObject({
      kind: "class-source",
      value: "Arcane",
    });
    expect(evaluate("Any defender class", [defender]).status).toBe("satisfied");
    expect(evaluate("Any defender class", []).status).toBe("failed");
    expect(evaluate("!Hunter class", []).status).toBe("satisfied");
    expect(evaluate("!Hunter class", [hunter]).status).toBe("failed");
    expect(evaluate("any other arcane class", []).status).toBe("unverified");
  });

  it("reads multiclass source and more-than-one-class clauses", () => {
    const divineMulticlass = entity("MC_CLERIC", "Initiate", "Feat", {
      type: "Multiclass Cleric",
    });
    const martialMulticlass = entity("MC_FIGHTER", "Student", "Feat", {
      type: "Multiclass Fighter",
    });
    const countsAs = entity("COUNTS_CLERIC", "Cleric", "CountsAsClass");
    const hybrid = entity("HYBRID", "Hybrid", "Class");
    const definitions = [
      ...all,
      divineMulticlass,
      martialMulticlass,
      countsAs,
      hybrid,
    ];
    const status = (prerequisite: string, owned: readonly ContentEntity[]) =>
      evaluatePrerequisite(prerequisite, {
        owned,
        level: 1,
        abilities: {},
        definitions,
      }).status;
    expect(status("multiclass divine class", [divineMulticlass])).toBe(
      "satisfied",
    );
    expect(status("multiclass divine class", [martialMulticlass])).toBe(
      "failed",
    );
    expect(status("must have more than one class", [countsAs])).toBe(
      "satisfied",
    );
    expect(status("must have more than one class", [hybrid])).toBe("satisfied");
    expect(status("must have more than one class", [cleric])).toBe("failed");
  });
});
