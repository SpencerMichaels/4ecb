import { describe, expect, it } from "vitest";

import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { buildEvaluatedSheetModel, buildSheetModel } from ".";

describe("sheet model", () => {
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
      details: { name: "Ada", Level: "1", Race: "Old race" },
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
    expect(model.overview?.defensiveTraits).toContainEqual({
      label: "Resistance",
      value: "Fire 5",
    });
    expect(model.overview?.defensiveTraits).toContainEqual({
      label: "Saving throws",
      value: "+2 against poison (Synthetic saving feat)",
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
    expect(model.identity).toContainEqual({ label: "Level", value: "3" });
    expect(model.identity).toContainEqual({ label: "Race", value: "Cliffkin" });
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
