import { describe, expect, it } from "vitest";

import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import {
  authoredSheetPowerCard,
  buildEvaluatedSheetModel,
  buildSheetModel,
  createSheetPowerCardFinder,
} from ".";

describe("sheet model", () => {
  it("applies the coin-weight option to cached sheets without modifying the cache", () => {
    const snapshot: LegacyCharacterSnapshot = {
      details: { CarriedMoney: "500 gp" },
      abilities: { Strength: 10 },
      stats: { Weight: "95" },
      selectedRules: [],
      loot: [],
      powers: [],
      textStrings: {},
      levelCount: 1,
      source: "legacy-cache",
    };
    expect(buildSheetModel(snapshot).encumbrance?.carriedWeight).toBe(105);
    expect(
      buildSheetModel(snapshot, [], { countCoinWeight: false }).encumbrance
        ?.carriedWeight,
    ).toBe(95);
    expect(snapshot.stats.Weight).toBe("95");
  });
  it("names a hybrid's two classes on the Class identity line", () => {
    const entity = (
      id: string,
      name: string,
      type: string,
      rules: ContentEntity["rules"] = [],
    ): ContentEntity => ({
      id,
      name,
      type,
      source: "test",
      sources: ["test"],
      attributes: [],
      categories: [],
      specifics: [],
      rules,
      description: "",
      extensions: [],
      provenance: { sourceKey: "test", sourceOrdinal: 0 },
    });
    const content = [
      entity("HYBRID", "Hybrid", "Class", [
        {
          name: "select",
          attributes: [
            { name: "type", value: "Hybrid Class" },
            { name: "number", value: "2" },
          ],
          text: "",
          children: [],
          ordinal: 0,
        },
      ]),
      entity("HYBRID_A", "Hybrid Warblade", "Hybrid Class"),
      entity("HYBRID_B", "Hybrid Seer", "Hybrid Class"),
      entity("PLAIN", "Warblade", "Class"),
    ];
    const occurrence = (
      id: string,
      definitionId: string,
      extra: Partial<EvaluatedCharacter["occurrences"][number]> = {},
    ): EvaluatedCharacter["occurrences"][number] => ({
      id,
      definitionId,
      acquiredLevel: 1,
      kind: "choice",
      ...extra,
    });
    const snapshot: LegacyCharacterSnapshot = {
      details: {},
      abilities: {},
      stats: {},
      selectedRules: [],
      loot: [],
      powers: [],
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
    const classLine = (occurrences: EvaluatedCharacter["occurrences"]) => {
      const evaluation: EvaluatedCharacter = {
        level: 1,
        converged: true,
        iterations: 1,
        complete: true,
        legal: true,
        occurrences,
        activeDefinitionIds: occurrences.map(
          ({ definitionId }) => definitionId,
        ),
        activeDefinitions: [],
        choices: [],
        stats: {},
        overlays: [],
        suggestions: [],
        textStrings: {},
        textContributions: [],
        diagnostics: [],
        powers: [],
      } as unknown as EvaluatedCharacter;
      return buildEvaluatedSheetModel(
        snapshot,
        build,
        evaluation,
        content,
      ).identity.find(({ label }) => label === "Class")?.value;
    };
    expect(
      classLine([
        occurrence("hybrid", "HYBRID", { kind: "root" }),
        occurrence("a", "HYBRID_A", { parentId: "hybrid" }),
        occurrence("b", "HYBRID_B", { parentId: "hybrid" }),
      ]),
    ).toBe("Hybrid Warblade / Hybrid Seer");
    expect(classLine([occurrence("plain", "PLAIN", { kind: "root" })])).toBe(
      "Warblade",
    );
  });

  it("retains physical and identity details and cached encumbrance for legacy references", () => {
    const model = buildSheetModel({
      details: {
        Size: "Medium",
        Gender: "Female",
        Age: "30",
        Height: "5 ft",
        Weight: "120 lb",
        Alignment: "Good",
        Deity: "Example",
        RPGA: "123",
        CarriedMoney: "0 gp",
      },
      abilities: { Strength: 13 },
      stats: { Weight: "65" },
      selectedRules: [],
      loot: [],
      powers: [],
      textStrings: { Age: "31" },
      levelCount: 1,
      source: "legacy-cache",
    });
    for (const label of [
      "Size",
      "Gender",
      "Age",
      "Height",
      "Weight",
      "Alignment",
      "Deity",
      "RPGA",
    ])
      expect(model.identity.some((value) => value.label === label)).toBe(true);
    expect(model.identity).toContainEqual({ label: "Age", value: "31" });
    expect(model.encumbrance).toEqual({
      carriedWeight: 65,
      normalLimit: 130,
      load: "Normal",
    });
  });
  it("projects current-level carried and stored wallet text without losing custom denominations", () => {
    const snapshot: LegacyCharacterSnapshot = {
      details: { CarriedMoney: "old value", StoredMoney: "legacy stored" },
      abilities: {},
      stats: {},
      selectedRules: [],
      loot: [],
      powers: [],
      levelCount: 8,
      source: "legacy-cache",
      textStrings: {
        "_PER_LEVEL_1_Carried Money": "1 gp",
        "_PER_LEVEL_7_Carried Money": "17 gp; 2 custom coins",
        "_PER_LEVEL_9_Carried Money": "999 gp",
      },
    };
    expect(buildSheetModel(snapshot).currency).toEqual([
      { label: "Carried", value: "17 gp; 2 custom coins" },
      { label: "Stored", value: "legacy stored" },
    ]);
    expect(
      buildSheetModel({
        ...snapshot,
        textStrings: { "_PER_LEVEL_8_Stored Money": "" },
      }).currency,
    ).toEqual([
      { label: "Carried", value: "old value" },
      { label: "Stored", value: "0 gp" },
    ]);
  });
  it("selects legacy additional effects from the equipped saved main hand without pooling alternate caches", () => {
    const model = buildSheetModel({
      details: {},
      abilities: {},
      stats: {},
      selectedRules: [],
      levelCount: 1,
      source: "legacy-cache",
      textStrings: { _INTERNAL_MainHandWeapon: "Equipped blade" },
      loot: [
        {
          name: "Equipped blade",
          count: 1,
          equippedCount: 1,
          showPowerCard: true,
          elements: [],
        },
      ],
      powers: [
        {
          name: "Synthetic strike",
          weapons: [
            {
              name: "Carried blade",
              attackBonus: "1",
              conditions: "Carried reminder.",
            },
            {
              name: "Equipped blade",
              attackBonus: "4",
              conditions: "Equipped reminder.",
            },
          ],
        },
      ],
    });
    expect(model.powers[0]?.attack).toBe("+4 vs defense");
    expect(model.powers[0]?.additionalEffects).toEqual([
      { text: "Equipped reminder.", source: "legacy-cache" },
    ]);
    expect(model.powers[0]?.variants?.[0]?.additionalEffects).toEqual([
      { text: "Carried reminder.", source: "legacy-cache" },
    ]);
    expect(model.powers[0]?.variants?.[0]?.equipped).toBe(false);
    expect(model.powers[0]?.variants?.[1]?.hand).toBe("main");
  });
  it("maps legacy cached values and enriches cards from content", () => {
    const model = buildSheetModel(
      {
        details: { name: "Ada", Level: "3", Traits: "Stale" },
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
                attackStat: "Intelligence",
                defense: "Reflex",
                damage: "1d6+4",
                conditions:
                  "  +1 to damage while flanking (Synthetic feature).\nA verbatim reminder.  ",
              },
            ],
          },
        ],
        loot: [],
        textStrings: {
          "NOTE_Personality Traits": "Observant",
          "NOTE_Character Background": "Raised among artificers.",
        },
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
          prerequisites: "ID_FMP_THEME_643",
          specifics: [
            {
              name: "Attack",
              value: "Intelligence + 2 vs. Reflex",
              extraAttributes: [],
              ordinal: 0,
            },
            {
              name: "Effect",
              value: "A test spark.",
              extraAttributes: [],
              ordinal: 1,
            },
            {
              name: "_REQUIRESID",
              value: "ID_INTERNAL_REQUIREMENT",
              extraAttributes: [],
              ordinal: 2,
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
      additionalEffects: [
        {
          text: "+1 to damage while flanking (Synthetic feature).\nA verbatim reminder.",
          source: "legacy-cache",
        },
      ],
      variants: [
        {
          ability: "Intelligence",
          attack: "+7 vs Reflex",
          damage: "1d6+4",
          powerBonus: 2,
        },
      ],
    });
    expect(model.powers[0]?.fields).toEqual([
      {
        label: "Attack",
        value: "Intelligence + 2 vs. Reflex",
      },
      { label: "Effect", value: "A test spark." },
    ]);
    expect(model.powers[0]?.prerequisites).toBeUndefined();
    expect(model.notes).toContainEqual({ label: "Traits", value: "Observant" });
    expect(model.notes).toContainEqual({
      label: "Character Background",
      value: "Raised among artificers.",
    });
  });

  it("keeps an annotated ability modifier separate from an authored power bonus", () => {
    const model = buildSheetModel(
      {
        details: { name: "Ada", Level: "1" },
        abilities: { Strength: 12, Charisma: 18 },
        stats: { "Strength modifier": "1", "Charisma modifier": "4" },
        selectedRules: [],
        powers: [
          {
            id: "POWER_1",
            name: "Ardent Strike",
            weapons: [
              {
                name: "Longsword",
                attackBonus: "9",
                attackStat: "Charisma",
                defense: "AC",
              },
            ],
          },
        ],
        loot: [],
        textStrings: {},
        levelCount: 1,
        source: "legacy-cache",
      },
      [
        {
          id: "POWER_1",
          name: "Ardent Strike",
          type: "Power",
          source: "Synthetic",
          sources: ["Synthetic"],
          attributes: [],
          categories: [],
          specifics: [
            {
              name: "Attack",
              value: "Strength or Charisma vs. AC",
              extraAttributes: [],
              ordinal: 0,
            },
          ],
          rules: [],
          description: "",
          extensions: [],
          provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
        },
      ],
      { resolveAbilityChoices: true },
    );

    expect(model.powers[0]?.fields).toContainEqual({
      label: "Attack",
      value: "Charisma (+4) vs. AC",
    });
    expect(model.powers[0]?.variants?.[0]).toMatchObject({
      ability: "Charisma",
      powerBonus: 0,
      attack: "+9 vs AC",
    });
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
      details: {
        name: "Ada",
        Level: "1",
        Race: "Old race",
        Size: "Medium",
        Deity: "Example",
        Gender: "Female",
        Alignment: "Good",
        Age: "30",
        Height: "5 ft",
        Weight: "120 lb",
        CarriedMoney: "0 gp",
      },
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
    const classOccurrence = {
      id: "class-occurrence",
      identity: { definitionId: "CLASS_1", name: "Ardent", type: "Class" },
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
        {
          id: "armor-entry",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 1,
          elements: [
            { definitionId: "ARMOR_1", name: "Leather Armor", type: "Armor" },
            {
              definitionId: "GLOAMING_1",
              name: "Gloaming Armor +1",
              type: "Magic Item",
            },
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
          id: classOccurrence.id,
          definitionId: "CLASS_1",
          acquiredLevel: 1,
          kind: "grant",
          legality: "rules-legal",
        },
        {
          id: "power-occurrence",
          definitionId: "POWER_1",
          acquiredLevel: 1,
          kind: "grant",
        },
      ],
      activeDefinitionIds: ["RACE_1", "CLASS_1", "POWER_1"],
      activeDefinitions: [
        {
          definitionId: "RACE_1",
          occurrenceIds: [occurrence.id],
          providerOccurrenceIds: [],
        },
        {
          definitionId: "CLASS_1",
          occurrenceIds: [classOccurrence.id],
          providerOccurrenceIds: [],
        },
        {
          definitionId: "POWER_1",
          occurrenceIds: ["power-occurrence"],
          providerOccurrenceIds: [],
        },
      ],
      choices: [],
      stats: {
        Strength: { name: "Strength", value: 20, contributions: [] },
        "resist:fire": { name: "resist:fire", value: 5, contributions: [] },
        "Saving Throws": {
          name: "Saving Throws",
          value: 0,
          contributions: [
            {
              id: "save:conditional",
              stat: "Saving Throws",
              value: "2",
              providerId: "feat:save",
              providerName: "Synthetic saving feat",
              numericValue: 2,
              applied: false,
              reason: "conditional",
              condition: "against poison",
            },
          ],
        },
        Constitution: {
          name: "Constitution",
          value: 21,
          contributions: [],
        },
        Dexterity: { name: "Dexterity", value: 20, contributions: [] },
        Intelligence: {
          name: "Intelligence",
          value: 20,
          contributions: [],
        },
        Wisdom: { name: "Wisdom", value: 20, contributions: [] },
        Charisma: { name: "Charisma", value: 20, contributions: [] },
        "Wisdom modifier": {
          name: "Wisdom modifier",
          value: 5,
          contributions: [],
        },
        "Strength modifier": {
          name: "Strength modifier",
          value: 5,
          contributions: [],
        },
        "Constitution modifier": {
          name: "Constitution modifier",
          value: 5,
          contributions: [],
        },
        "Intelligence modifier": {
          name: "Intelligence modifier",
          value: 5,
          contributions: [],
        },
        "Charisma modifier": {
          name: "Charisma modifier",
          value: 5,
          contributions: [],
        },
        "Dexterity modifier": {
          name: "Dexterity modifier",
          value: 5,
          contributions: [],
        },
        AC: { name: "AC", value: 19, contributions: [] },
        "Fortitude Defense": {
          name: "Fortitude Defense",
          value: 17,
          contributions: [],
        },
      },
      textStrings: {},
      overlays: [
        {
          providerOccurrenceId: "power-occurrence",
          targetDefinitionIds: ["POWER_1"],
          field: "Effect",
          value: "Then teleport 3 squares.",
        },
        {
          providerOccurrenceId: "power-occurrence",
          targetDefinitionIds: ["POWER_1"],
          field: "Display",
          value: "Overlaid internal display metadata",
        },
        {
          providerOccurrenceId: "power-occurrence",
          targetDefinitionIds: ["POWER_1"],
          field: "_GENERATEDID",
          value: "ID_INTERNAL_OVERLAY",
        },
      ],
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
              proficient: true,
              attackBonus: 7,
              defense: "Reflex",
              damage: "1d6+4",
              attackComponents: [],
              attacks: [
                {
                  id: "phase-1",
                  ordinal: 1,
                  attackStat: "Intelligence",
                  powerBonus: 0,
                  defense: "Reflex",
                  attackBonus: 7,
                  damage: "1d6+4",
                  damageType: "fire",
                  attackComponents: [],
                },
                {
                  id: "phase-2",
                  ordinal: 2,
                  attackStat: "Wisdom",
                  powerBonus: 2,
                  defense: "Fortitude",
                  attackBonus: 9,
                  damage: "2d6+2",
                  damageType: "cold and lightning",
                  weaponRole: "off",
                  eligible: false,
                  attackComponents: [],
                },
              ],
              damageComponents: [],
              conditionalDamage: [
                {
                  source: "Synthetic striker",
                  expression: "2d6",
                  condition: "once per turn",
                },
              ],
              additionalEffects: [
                {
                  text: "+1 to damage against a marked target (Synthetic feature).",
                  source: "Synthetic feature",
                  provenanceId: "reminder:1",
                },
              ],
            },
          ],
          recoveries: [
            {
              kind: "temporary-hit-points",
              expression: "Gain 5 + half your level temporary hit points.",
            },
          ],
          unsupported: ["Synthetic calculation limitation."],
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
        id: "CLASS_1",
        name: "Ardent",
        type: "Class",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [
          {
            name: "Key Abilities",
            value: "Charisma, Wisdom, Intelligence",
            extraAttributes: [],
            ordinal: 0,
          },
        ],
        rules: [],
        description: "",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 1 },
      },
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
            name: "Hit",
            value: "2[W] + Your Wisdom modifier damage.",
            extraAttributes: [],
            ordinal: 0,
          },
          {
            name: "Effect",
            value: "Gain 5 + half your level temporary hit points.",
            extraAttributes: [],
            ordinal: 1,
          },
          {
            name: "Effect",
            value: "Then teleport 2 squares.",
            extraAttributes: [],
            ordinal: 2,
          },
          {
            name: "Special",
            value:
              "Use your Strength, Constitution, or Wisdom modifier; Wisdom modifier (+5) is already shown.",
            extraAttributes: [],
            ordinal: 3,
          },
          {
            name: "Secondary Effect",
            value: "You gain resist 5 + 1/2 level.",
            extraAttributes: [],
            ordinal: 4,
          },
          {
            name: "Attack",
            value:
              "Strength +2 vs. Reflex, Constitution +2 vs. Reflex, or Dexterity +2 vs. Reflex",
            extraAttributes: [],
            ordinal: 5,
          },
          {
            name: "Requirement",
            value: "Use your Strength or Dexterity modifier.",
            extraAttributes: [],
            ordinal: 6,
          },
          {
            name: "Miss",
            value:
              "1[W] + Strength modifier or Dexterity modifier damage; add Strength modifier and Wisdom modifier.",
            extraAttributes: [],
            ordinal: 6,
          },
          {
            name: "Display",
            value: "Wizard Attack 1",
            extraAttributes: [],
            ordinal: 7,
          },
          {
            name: "_CLASS",
            value: "ID_FMP_CLASS_123",
            extraAttributes: [],
            ordinal: 8,
          },
          {
            name: "Class ID",
            value: "ID_FMP_CLASS_123",
            extraAttributes: [],
            ordinal: 9,
          },
          {
            name: "Associated Feat",
            value: "ID_FMP_FEAT_456",
            extraAttributes: [],
            ordinal: 10,
          },
          {
            name: "Associated Theme",
            value: "ID_FMP_THEME_789",
            extraAttributes: [],
            ordinal: 11,
          },
        ],
        rules: [],
        flavor: "Lightning gathers around your implement.",
        prerequisites: "Wizard",
        printPrerequisites: "Wizard class",
        description: "A modern evaluated spark.",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 2 },
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
        provenance: { sourceKey: "fixture", sourceOrdinal: 3 },
      },
      {
        id: "ARMOR_1",
        name: "Leather Armor",
        type: "Armor",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [
          {
            name: "AC Bonus",
            value: "2",
            extraAttributes: [],
            ordinal: 0,
          },
          {
            name: "Check",
            value: "0",
            extraAttributes: [],
            ordinal: 1,
          },
        ],
        rules: [],
        description: "",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 4 },
      },
      {
        id: "GLOAMING_1",
        name: "Gloaming Armor +1",
        type: "Magic Item",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [
          {
            name: "Enhancement",
            value: "+1 AC",
            extraAttributes: [],
            ordinal: 0,
          },
          {
            name: "Level",
            value: "4",
            extraAttributes: [],
            ordinal: 1,
          },
          {
            name: "Property",
            value: "You gain concealment in dim light.",
            extraAttributes: [],
            ordinal: 2,
          },
        ],
        rules: [],
        description: "",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 5 },
      },
    ];

    const model = buildEvaluatedSheetModel(
      snapshot,
      build,
      evaluation,
      content,
      { resolveAbilityChoices: true },
    );

    expect(model.source).toBe("authoritative-evaluation");
    const flaggedModel = buildEvaluatedSheetModel(
      snapshot,
      build,
      {
        ...evaluation,
        powers: evaluation.powers.map((power) => ({
          ...power,
          basicAttackKind: "ranged" as const,
        })),
      },
      content,
    );
    expect(flaggedModel.powers[0]?.basicAttackKind).toBe("ranged");
    expect(model.powers[0]?.basicAttackKind).toBeUndefined();
    // The builder's card for an owned power is exactly the sheet's card.
    const ownedPower = evaluation.powers[0]!;
    const ownedEntity = content.find(
      (entity) =>
        entity.id.toLocaleLowerCase() ===
        ownedPower.definitionId.toLocaleLowerCase(),
    );
    expect(ownedEntity).toBeDefined();
    expect(
      createSheetPowerCardFinder(evaluation, content, {
        resolveAbilityChoices: true,
      })(ownedEntity!, ownedPower),
    ).toEqual(model.powers.find((card) => card.id === ownedPower.definitionId));
    expect(model.overview?.defensiveTraits).toContainEqual({
      label: "Resistance",
      value: "Fire 5",
      source: "Evaluated total",
    });
    expect(model.overview?.defensiveTraits).toContainEqual({
      label: "Saving throws",
      value: "+2 to saves against poison",
      source: "Synthetic saving feat",
    });
    expect(model.powers[0]?.additionalEffects).toEqual([
      {
        text: "+1 to damage against a marked target (Synthetic feature).",
        source: "authoritative-evaluation",
        provider: "Synthetic feature",
        provenanceId: "reminder:1",
      },
      {
        text: "+2d6 to damage once per turn (Synthetic striker).",
        source: "authoritative-evaluation",
        provider: "Synthetic striker",
      },
    ]);
    // A healing bonus another feature grants is one more additional effect.
    const healingCard = createSheetPowerCardFinder(
      {
        ...evaluation,
        powers: [
          {
            ...ownedPower,
            healing: {
              bonus: 5,
              components: [
                {
                  label: "ID_CLASS:healing",
                  value: 5,
                  source: "Healer's Lore",
                  provenanceId: "lore:1",
                },
              ],
              conditional: [],
            },
          },
        ],
      },
      content,
    )(ownedEntity!, {
      ...ownedPower,
      healing: {
        bonus: 5,
        components: [
          {
            label: "ID_CLASS:healing",
            value: 5,
            source: "Healer's Lore",
            provenanceId: "lore:1",
          },
        ],
        conditional: [
          {
            amount: "4",
            condition: "while you are bloodied",
            source: "Draconic Healing",
            provenanceId: "draconic:1",
          },
        ],
      },
    });
    expect(healingCard.additionalEffects?.slice(-2)).toEqual([
      {
        text: "Regain an additional 5 hit points.",
        source: "authoritative-evaluation",
        provider: "Healer's Lore",
        provenanceId: "lore:1",
      },
      {
        text: "Regain an additional 4 hit points while you are bloodied.",
        source: "authoritative-evaluation",
        provider: "Draconic Healing",
        provenanceId: "draconic:1",
      },
    ]);
    expect(model.identity).toContainEqual({ label: "Level", value: "3" });
    expect(model.identity).toContainEqual({ label: "Race", value: "Cliffkin" });
    // Free-text details carry over, but element-backed details the evaluated
    // build doesn't select must not resurface from the import-time snapshot.
    for (const label of ["Age", "Height", "Weight"])
      expect(model.identity.some((value) => value.label === label)).toBe(true);
    for (const label of ["Size", "Gender", "Alignment", "Deity"])
      expect(model.identity.some((value) => value.label === label)).toBe(false);
    expect(model.encumbrance?.normalLimit).toBe(200);
    const withCoins = {
      ...snapshot,
      details: { ...snapshot.details, CarriedMoney: "500 gp" },
    };
    const withCoinWeight = buildEvaluatedSheetModel(
      withCoins,
      build,
      evaluation,
      content,
    );
    const withoutCoinWeight = buildEvaluatedSheetModel(
      withCoins,
      build,
      evaluation,
      content,
      { countCoinWeight: false },
    );
    expect(
      withCoinWeight.encumbrance!.carriedWeight! -
        withoutCoinWeight.encumbrance!.carriedWeight!,
    ).toBe(10);
    expect(withCoinWeight.currency).toEqual(withoutCoinWeight.currency);
    expect(model.abilities).toContainEqual({ label: "Strength", value: "20" });
    expect(model.defenses).toContainEqual({ label: "AC", value: "19" });
    expect(model.defenses).toContainEqual({
      label: "Fortitude",
      value: "17",
    });
    expect(model.powers[0]).toMatchObject({
      name: "Arc Flash",
      calculationWarnings: ["Synthetic calculation limitation."],
      attack: "+7 vs Reflex",
      damage: "1d6+4",
      flavor: "Lightning gathers around your implement.",
      prerequisites: "Wizard class",
      variants: [
        expect.objectContaining({
          equipmentName: "Test wand",
          attack: "+7 vs Reflex",
          damage: "1d6+4",
        }),
      ],
    });
    expect(model.powers[0]?.variants?.[0]?.attacks).toMatchObject([
      {
        ordinal: 1,
        ability: "Intelligence",
        attack: "+7 vs Reflex",
        damage: "1d6+4",
        damageType: "fire",
      },
      {
        ordinal: 2,
        ability: "Wisdom",
        powerBonus: 2,
        attack: "+9 vs Fortitude",
        damage: "2d6+2",
        damageType: "cold and lightning",
        weaponRole: "off",
        eligible: false,
      },
    ]);
    expect(model.powers[0]?.fields).toEqual([
      { label: "Hit", value: "2[W] + Your Wisdom modifier (+5) damage." },
      {
        label: "Effect",
        value: "Gain 5 + half your level (+1) temporary hit points.",
      },
      { label: "Effect", value: "Then teleport 3 squares." },
      {
        label: "Special",
        value:
          "Use Constitution modifier (+5); Wisdom modifier (+5) is already shown.",
      },
      {
        label: "Secondary Effect",
        value: "You gain resist 5 + 1/2 level (+1).",
      },
      { label: "Attack", value: "Constitution +2 vs. Reflex" },
      {
        label: "Requirement",
        value: "Use Strength modifier (+5).",
      },
      {
        label: "Miss",
        value:
          "1[W] + Strength modifier (+5) damage; add Strength modifier and Wisdom modifier.",
      },
    ]);
    const authoredChoices = buildEvaluatedSheetModel(
      snapshot,
      build,
      evaluation,
      content,
      { resolveAbilityChoices: false },
    );
    expect(authoredChoices.powers[0]?.fields).toContainEqual({
      label: "Special",
      value:
        "Use your Strength, Constitution, or Wisdom modifier; Wisdom modifier (+5) is already shown.",
    });
    const incompleteStats = { ...evaluation.stats };
    delete incompleteStats["Dexterity modifier"];
    const incompleteChoices = buildEvaluatedSheetModel(
      snapshot,
      build,
      { ...evaluation, stats: incompleteStats },
      content,
      { resolveAbilityChoices: true },
    );
    expect(incompleteChoices.powers[0]?.fields).toContainEqual({
      label: "Requirement",
      value: "Use your Strength or Dexterity modifier.",
    });
    expect(model.items[0]).toMatchObject({ name: "Test wand" });
    const template = content.find((entity) => entity.id === "ITEM_1")!;
    const displayContent = [
      ...content,
      {
        ...template,
        id: "DISPLAY_BASE",
        name: "Quick staff",
        type: "Superior Implement",
      },
      {
        ...template,
        id: "DISPLAY_MAGIC",
        name: "Veiling Staff +2",
        type: "Magic Item",
      },
    ];
    const displayEntry = {
      ...build.inventory[0]!,
      elements: [
        {
          definitionId: "DISPLAY_BASE",
          name: "Quick staff",
          type: "Superior Implement",
        },
        {
          definitionId: "DISPLAY_MAGIC",
          name: "Veiling Staff +2",
          type: "Magic Item",
        },
      ],
    };
    const displayBuild = { ...build, inventory: [displayEntry] };
    const displayEvaluation = {
      ...evaluation,
      powers: evaluation.powers.map((power) => ({
        ...power,
        variants: power.variants.map((variant) => ({
          ...variant,
          equipmentId: displayEntry.id,
          equipmentName: "Quick staff + Veiling Staff +2",
        })),
      })),
    };
    const displayModel = buildEvaluatedSheetModel(
      snapshot,
      displayBuild,
      displayEvaluation,
      displayContent,
    );
    expect(displayModel.powers[0]?.variants?.[0]).toMatchObject({
      equipmentName: "Veiling Quick staff +2",
      attack: "+7 vs Reflex",
      damage: "1d6+4",
    });
    expect(displayModel.powers[0]?.variants?.[0]?.equipmentName).toBe(
      displayModel.overview?.inventory[0]?.name,
    );
    const olderEvaluation = {
      ...displayEvaluation,
      powers: displayEvaluation.powers.map((power) => ({
        ...power,
        variants: power.variants.map((variant) => {
          const older: Omit<typeof variant, "equipmentId"> & {
            equipmentId?: string;
          } = {
            ...variant,
            id: `${power.definitionId}:${displayEntry.id}`,
          };
          delete older.equipmentId;
          return older;
        }),
      })),
    };
    expect(
      buildEvaluatedSheetModel(
        snapshot,
        displayBuild,
        olderEvaluation,
        displayContent,
      ).powers[0]?.variants?.[0]?.equipmentName,
    ).toBe("Veiling Quick staff +2");
    const customBuild = {
      ...displayBuild,
      inventory: [
        { ...displayEntry, name: "Personal staff" },
        {
          ...displayEntry,
          id: "spare",
          name: "Spare staff",
          equippedQuantity: 0,
        },
      ],
    };
    const customEvaluation = {
      ...displayEvaluation,
      powers: displayEvaluation.powers.map((power) => ({
        ...power,
        variants: [
          power.variants[0]!,
          { ...power.variants[0]!, id: "spare-variant", equipmentId: "spare" },
        ],
      })),
    };
    expect(
      buildEvaluatedSheetModel(
        snapshot,
        customBuild,
        customEvaluation,
        displayContent,
      ).powers[0]?.variants?.map((variant) => variant.equipmentName),
    ).toEqual(["Personal staff", "Spare staff"]);
    expect(model.items).toContainEqual(
      expect.objectContaining({
        name: "Gloaming Leather Armor +1",
        itemType: "Magic Item",
        baseItemType: "Armor",
      }),
    );
    expect(
      model.items.find(({ name }) => name === "Gloaming Leather Armor +1")
        ?.fields,
    ).toEqual(
      expect.arrayContaining([
        { label: "AC Bonus", value: "2" },
        { label: "Check", value: "0" },
        { label: "Enhancement", value: "+1 AC" },
        { label: "Level", value: "4" },
        { label: "Property", value: "You gain concealment in dim light." },
      ]),
    );
    expect(model.equipment).toEqual([
      { label: "Test wand", value: "× 2 · 1 equipped" },
      { label: "Gloaming Leather Armor +1", value: "× 1 · 1 equipped" },
    ]);
    expect(model.equipment).not.toContainEqual(
      expect.objectContaining({ label: "Stale wand" }),
    );
  });

  it("separates learned references from physical and unresolved inventory", () => {
    const reference = (
      id: string,
      name: string,
      subtype: string,
    ): ContentEntity => ({
      id,
      name,
      type: "Ritual",
      source: "Synthetic source",
      sources: ["Synthetic source"],
      attributes: [],
      categories: [],
      flavor: `${name} flavor.`,
      prerequisites: "Trained in Arcana",
      specifics: [
        {
          name: "Type",
          value: subtype,
          extraAttributes: [],
          ordinal: 0,
        },
        {
          name: "Key Skill",
          value: "Arcana",
          extraAttributes: [],
          ordinal: 1,
        },
        {
          name: "_ASSOCIATEDID",
          value: "ID_INTERNAL_REFERENCE",
          extraAttributes: [],
          ordinal: 2,
        },
      ],
      rules: [],
      description: `${name} rules text.`,
      extensions: [],
      provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
    });
    const ritual = reference("RITUAL_1", "Traveler's Chant", "Ritual");
    const formula = reference(
      "FORMULA_1",
      "Alchemist's Frost",
      "Alchemical Formula",
    );
    const practice = reference(
      "PRACTICE_1",
      "Forced March",
      "Martial Practice",
    );
    const scroll: ContentEntity = {
      ...reference("SCROLL_1", "Traveler's Chant Scroll", "Ritual"),
      type: "Ritual Scroll",
    };
    const content = [ritual, formula, practice, scroll];
    const legacySnapshot: LegacyCharacterSnapshot = {
      details: { name: "Sage" },
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [
        {
          name: ritual.name,
          count: 1,
          equippedCount: 0,
          showPowerCard: true,
          elements: [{ id: ritual.id, name: ritual.name, type: "Ritual" }],
        },
        {
          name: scroll.name,
          count: 2,
          equippedCount: 0,
          showPowerCard: true,
          elements: [
            { id: scroll.id, name: scroll.name, type: "Ritual Scroll" },
          ],
        },
        {
          name: "Unresolved custom keepsake",
          count: 1,
          equippedCount: 0,
          showPowerCard: false,
          elements: [
            { name: "Unresolved custom keepsake", type: "Custom Treasure" },
          ],
        },
      ],
      textStrings: {},
      levelCount: 1,
      source: "legacy-cache",
    };
    const legacy = buildSheetModel(legacySnapshot, content);
    expect(legacy.learnedReferences).toEqual([
      expect.objectContaining({
        id: ritual.id,
        kind: "ritual",
        name: ritual.name,
        quantity: 1,
        flavor: `${ritual.name} flavor.`,
        prerequisites: "Trained in Arcana",
        description: `${ritual.name} rules text.`,
        source: "Synthetic source",
        fields: [
          { label: "Type", value: "Ritual" },
          { label: "Key Skill", value: "Arcana" },
        ],
      }),
    ]);
    expect(legacy.equipment.map(({ label }) => label)).toEqual([
      scroll.name,
      "Unresolved custom keepsake",
    ]);
    expect(legacy.items.map(({ name }) => name)).toEqual([scroll.name]);

    const inventory = [
      ...content.map((entity, index) => ({
        id: `entry-${index}`,
        acquiredLevel: 1,
        quantity: entity === scroll ? 2 : 1,
        equippedQuantity: 0,
        elements: [
          { definitionId: entity.id, name: entity.name, type: entity.type },
        ],
        showPowerCard: true,
        overrides: {},
        legality: "rules-legal" as const,
      })),
      {
        id: "custom-entry",
        acquiredLevel: 1,
        quantity: 3,
        equippedQuantity: 0,
        elements: [
          { name: "Unresolved custom keepsake", type: "Custom Treasure" },
        ],
        showPowerCard: false,
        overrides: {},
        legality: "houserule" as const,
      },
    ];
    const build: CharacterBuild = {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory,
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
      activeDefinitions: [],
      choices: [],
      stats: {},
      textStrings: {},
      overlays: [],
      powers: [],
      suggestions: [],
      diagnostics: [],
    };
    const evaluated = buildEvaluatedSheetModel(
      legacySnapshot,
      build,
      evaluation,
      content,
    );
    expect(
      evaluated.learnedReferences.map(({ name, kind }) => ({ name, kind })),
    ).toEqual([
      { name: ritual.name, kind: "ritual" },
      { name: formula.name, kind: "alchemical-formula" },
      { name: practice.name, kind: "martial-practice" },
    ]);
    expect(evaluated.equipment.map(({ label }) => label)).toEqual([
      scroll.name,
      "Unresolved custom keepsake",
    ]);
    expect(evaluated.items.map(({ name }) => name)).toEqual([scroll.name]);
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
      activeDefinitions: [],
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

describe("authored power cards", () => {
  it("projects a build choice into the printed card shape without calculations", () => {
    const specifics = [
      ["Power Usage", "Encounter"],
      ["Action Type", "Standard Action"],
      ["Keywords", "Martial, Weapon"],
      ["Attack Type", "Melee weapon"],
      ["Class", "ID_SYNTHETIC_CLASS"],
      ["Level", "7"],
      ["Attack", "Strength vs. AC"],
      ["Hit", "2[W] + Strength modifier damage."],
    ].map(([name, value], ordinal) => ({
      name: name!,
      value: value!,
      ordinal,
      extraAttributes: [],
    }));
    const card = authoredSheetPowerCard(
      {
        id: "SYNTHETIC_POWER",
        name: "Synthetic Strike",
        type: "Power",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics,
        rules: [],
        description: "",
        extensions: [],
        provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
      },
      (text) => text.replace("Strength modifier", "STR"),
    );
    expect(card).toMatchObject({
      kind: "power",
      usage: "Encounter",
      actionType: "Standard Action",
      keywords: "Martial, Weapon",
      source: "Synthetic",
    });
    expect(card.variants).toBeUndefined();
    expect(card.fields.map(({ label }) => label)).toEqual([
      "Attack Type",
      "Level",
      "Attack",
      "Hit",
    ]);
    expect(card.fields.at(-1)?.value).toBe("2[W] + STR damage.");
  });
});
