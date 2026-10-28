import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type BuildInventoryEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  acquisitionCommands,
  alchemicalFormulaItems,
  compatibleBaseItems,
  comparableSaleProceeds,
  entityCurrencyCopper,
  groupMagicItemFamilies,
  groupInventoryByCategory,
  IMPLEMENT_LOADOUT_PROFICIENCY_IDS,
  INVENTORY_CATEGORIES,
  inventoryCategory,
  inventoryDisplayName,
  inventoryEntryForEntity,
  inventoryLoadoutToggle,
  inventorySlotCandidates,
  isLegacyBoonType,
  inventoryRequiresBothHands,
  itemChoiceCandidates,
  LOADOUT_SLOT_COLUMNS,
  loadoutChangeCommand,
  loadoutContext,
  missingInventoryElements,
  practiceKind,
  resolveLoadoutAssignments,
  recommendedMagicItemVariant,
  shopAcquireBlockedReason,
  shopAlsoImplementEnchantment,
  shopBrowseCategory,
  shopDisplayName,
  shopSlot,
  shopSubtype,
  visibleLoadoutSlotColumns,
} from "./equipment-ui";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [],
    flavor: "",
    description: "",
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    extensions: [],
    provenance: { sourceKey: "equipment-ui", sourceOrdinal: 0 },
  };
}

function holding(...entities: readonly ContentEntity[]): BuildInventoryEntry {
  return {
    id: entities.map(({ id }) => id).join(":"),
    acquiredLevel: 1,
    quantity: 1,
    equippedQuantity: 0,
    elements: entities.map(({ id, name, type }) => ({
      definitionId: id,
      name,
      type,
    })),
    overrides: {},
    legality: "rules-legal",
  };
}

function entityIndex(
  ...entities: readonly ContentEntity[]
): ReadonlyMap<string, ContentEntity> {
  return new Map(
    entities.map((item) => [item.id.toLocaleLowerCase(), item] as const),
  );
}

describe("Shop presentation model", () => {
  it("uses authored fields for the modern taxonomy, slots, and subtypes", () => {
    const weapon = entity("WEAPON", "Public Longsword", "Weapon", {
      Group: "Heavy blade",
      "Weapon Category": "Military melee",
    });
    const enchantment = entity(
      "ENCHANTMENT",
      "Weapon of Testing +2",
      "Magic Item",
      {
        "Magic Item Type": "Weapon",
        Weapon: "Heavy blade",
        Level: "8",
      },
    );
    const scroll = entity("SCROLL", "Scroll of Testing", "Ritual Scroll");
    expect(shopBrowseCategory(weapon)).toBe("weapons");
    expect(shopBrowseCategory(enchantment)).toBe("weapon-enchantments");
    expect(shopBrowseCategory(scroll)).toBe("consumables");
    expect(shopSlot(weapon)).toBe("Held");
    expect(shopSubtype(weapon)).toBe("Heavy blade");
    expect(shopSubtype(scroll)).toBe("Scrolls");
    expect(shopDisplayName(enchantment)).toBe("Testing +2");
  });

  it("normalizes player-facing subtypes and classifies corpus edge cases", () => {
    const formulaScroll = entity(
      "SCROLL",
      "Scroll of Public Formula",
      "Ritual Scroll",
      { type: "Alchemical Formula" },
    );
    const genericConsumable = entity(
      "CONSUMABLE",
      "Public Consumable",
      "Magic Item",
      { "Magic Item Type": "Other Consumable" },
    );
    const ammunition = entity("AMMO", "Public Ammunition", "Magic Item", {
      "Magic Item Type": "Ammunition",
    });
    const mount = entity("MOUNT", "Public Mount", "Gear", {
      Category: "Mount",
    });
    const internalCompanionChoice = entity(
      "INTERNAL",
      "Public Companion Increase",
      "Companion Ability Increase (Level 4)",
    );
    const arms = entity("ARMS", "Public Bracers", "Magic Item", {
      "Magic Item Type": "Arms Slot",
    });
    const universalImplement = entity(
      "IMPLEMENT",
      "Public Implement +1",
      "Magic Item",
      { "Magic Item Type": "Any", _UniversalImplement: "true" },
    );
    const special = entity("SPECIAL", "Public Special Item", "Magic Item", {
      "Magic Item Type": "Special",
    });
    const tattoo = entity("TATTOO", "Public Tattoo", "Magic Item", {
      "Magic Item Type": "Wondrous Item",
      "Item Slot": "Tattoo",
    });

    expect(shopSubtype(formulaScroll)).toBe("Scrolls");
    expect(shopSubtype(genericConsumable)).toBe("Other");
    expect(shopSubtype(ammunition)).toBe("Ammunition");
    expect(shopBrowseCategory(mount)).toBe("companions-mounts");
    expect(shopBrowseCategory(internalCompanionChoice)).toBeUndefined();
    expect(shopBrowseCategory(arms)).toBe("worn-items");
    expect(shopSlot(arms)).toBe("Arms");
    expect(shopBrowseCategory(universalImplement)).toBe(
      "implement-enchantments",
    );
    expect(shopSubtype(universalImplement)).toBe("Any implement");
    expect(shopBrowseCategory(special)).toBe("special-items");
    expect(shopBrowseCategory(tattoo)).toBe("worn-items");
    expect(shopSlot(tattoo)).toBe("Tattoo");
  });

  it("resolves and orders exact alchemical-formula item references", () => {
    const formula = entity("FORMULA", "Public Formula", "Ritual", {
      type: "Alchemical Formula",
      _RELATED_ITEMS: "ITEM_6, ITEM_1, MISSING",
    });
    const levelOne = entity("ITEM_1", "Public Item (level 1)", "Magic Item", {
      "Magic Item Type": "Alchemical",
      Level: "1",
    });
    const levelSix = entity("ITEM_6", "Public Item (level 6)", "Magic Item", {
      "Magic Item Type": "Alchemical",
      Level: "6",
    });
    expect(
      alchemicalFormulaItems(formula, entityIndex(formula, levelOne, levelSix)),
    ).toEqual([levelOne, levelSix]);
  });

  it("chooses the highest exact family variant not above character level", () => {
    const variants = [3, 8, 13].map((level, index) =>
      entity(`FROST_${index}`, `Frost Weapon +${index + 1}`, "Magic Item", {
        "Magic Item Type": "Weapon",
        Weapon: "Any",
        Level: String(level),
      }),
    );
    const family = groupMagicItemFamilies(variants, variants)[0]!;
    expect(recommendedMagicItemVariant(family, 8).name).toBe("Frost Weapon +2");
    expect(recommendedMagicItemVariant(family, 1).name).toBe("Frost Weapon +1");
  });

  it("offers exact superior implements only when their authored type matches", () => {
    const ruin = entity("RUIN", "Staff of Ruin +2", "Magic Item", {
      "Magic Item Type": "Staff",
      Level: "8",
    });
    const accurateStaff = entity(
      "ACCURATE_STAFF",
      "Accurate Staff",
      "Superior Implement",
      { Group: "Staff" },
    );
    const accurateSymbol = entity(
      "ACCURATE_SYMBOL",
      "Accurate Symbol",
      "Superior Implement",
      { Group: "Holy Symbol" },
    );
    expect(
      compatibleBaseItems(ruin, [accurateSymbol, accurateStaff]).map(
        ({ id }) => id,
      ),
    ).toEqual(["ACCURATE_STAFF"]);
  });

  it("stores item-owned choice children beneath the composed entry's final element", () => {
    const resistanceType = entity("POISON", "Poison", "Class Feature");
    const resistanceChoice = {
      id: "web:choice",
      identity: {
        definitionId: resistanceType.id,
        name: resistanceType.name,
        type: resistanceType.type,
      },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const armor = entity("ARMOR", "Armor of Resistance", "Magic Item");
    const withoutBase = inventoryEntryForEntity(armor, 1, undefined, [
      resistanceChoice,
    ]);
    expect(withoutBase.elements).toEqual([
      {
        definitionId: "ARMOR",
        name: "Armor of Resistance",
        type: "Magic Item",
        children: [resistanceChoice],
      },
    ]);

    const base = entity("BASE_ARMOR", "Chainmail", "Armor");
    const withBase = inventoryEntryForEntity(armor, 1, base, [
      resistanceChoice,
    ]);
    expect(withBase.elements).toEqual([
      { definitionId: "BASE_ARMOR", name: "Chainmail", type: "Armor" },
      {
        definitionId: "ARMOR",
        name: "Armor of Resistance",
        type: "Magic Item",
        children: [resistanceChoice],
      },
    ]);

    expect(inventoryEntryForEntity(armor, 1).elements).toEqual([
      {
        definitionId: "ARMOR",
        name: "Armor of Resistance",
        type: "Magic Item",
      },
    ]);
  });

  it("narrows an item-owned choice slot by Category, not just type", () => {
    // Reproduces a real-corpus bug: many unrelated "Class Feature" records
    // (an ability score, an unrelated feature) share a type with the actual
    // resistance-type candidates and must be excluded by the select rule's
    // Category expression.
    const poison = {
      ...entity("POISON", "Resist Poison", "Class Feature"),
      categories: ["Resistance"],
    };
    const fire = {
      ...entity("FIRE", "Resist Fire", "Class Feature"),
      categories: ["Resistance"],
    };
    const dexterity = entity("DEX", "Dexterity", "Class Feature");
    const unrelated = entity(
      "UNRELATED",
      "Unrelated Class Feature",
      "Class Feature",
    );
    const entities = [poison, fire, dexterity, unrelated];

    expect(
      itemChoiceCandidates(
        { ruleOrdinal: 0, choiceIndex: 0, type: "Class Feature" },
        entities,
      ).map(({ id }) => id),
    ).toEqual(["DEX", "FIRE", "POISON", "UNRELATED"]);

    expect(
      itemChoiceCandidates(
        {
          ruleOrdinal: 0,
          choiceIndex: 0,
          type: "Class Feature",
          category: "Resistance",
        },
        entities,
      ).map(({ id }) => id),
    ).toEqual(["FIRE", "POISON"]);
  });
});

describe("legacy boon types", () => {
  it("mirrors RulesElementIsBoon's words and exact types", () => {
    expect(isLegacyBoonType("Legendary Boon")).toBe(true);
    expect(isLegacyBoonType("Grandmaster Training")).toBe(true);
    expect(isLegacyBoonType("Battle Scars")).toBe(true);
    expect(isLegacyBoonType("wanderer's secret")).toBe(true);
    expect(isLegacyBoonType("Secret")).toBe(false);
    expect(isLegacyBoonType("Alternative Reward")).toBe(false);
    expect(isLegacyBoonType(undefined)).toBe(false);
  });

  it("files every boon with the special items", () => {
    for (const type of ["Battle Scars", "Martial Training", "Unheard-of Boon"])
      expect(
        shopBrowseCategory(
          entity("BOON", "Public Boon", "Magic Item", {
            "Magic Item Type": type,
          }),
        ),
      ).toBe("special-items");
  });
});

describe("Inventory role taxonomy", () => {
  it("defines the approved display order and initial expansion policy", () => {
    expect(
      INVENTORY_CATEGORIES.map(({ label, initiallyExpanded }) => [
        label,
        initiallyExpanded,
      ]),
    ).toEqual([
      ["Adventuring gear", true],
      ["Ammunition", true],
      ["Armor & shields", true],
      ["Companion, familiar & mount", true],
      ["Consumables", true],
      ["Implements", true],
      ["Special items", true],
      ["Weapons", true],
      ["Wondrous items", true],
      ["Worn items", true],
      ["Miscellaneous", false],
    ]);
  });

  it("classifies every approved role from authored metadata", () => {
    const fixtures: readonly [ContentEntity, string][] = [
      [
        entity("ARMOR", "Fixture", "Magic Item", {
          "Magic Item Type": "Armor",
        }),
        "armor-shields",
      ],
      [
        entity("WORN", "Fixture", "Magic Item", {
          "Magic Item Type": "Ring",
        }),
        "worn-items",
      ],
      [
        entity("WEAPON", "Fixture", "Magic Item", {
          "Magic Item Type": "Weapon",
        }),
        "weapons",
      ],
      [
        entity("SHIELD", "Fixture", "Armor", { "Armor Type": "Shield" }),
        "armor-shields",
      ],
      [
        entity("IMPLEMENT", "Fixture", "Magic Item", {
          "Magic Item Type": "Orb",
        }),
        "implements",
      ],
      [
        entity("POTION", "Fixture", "Magic Item", {
          "Magic Item Type": "Potion",
        }),
        "consumables",
      ],
      [
        entity("AMMO", "Fixture", "Gear", { Category: "Ammunition" }),
        "ammunition",
      ],
      [
        entity("WONDROUS", "Fixture", "Magic Item", {
          "Magic Item Type": "Wondrous Item",
        }),
        "wondrous-items",
      ],
      [
        entity("BOON", "Fixture", "Magic Item", {
          "Magic Item Type": "Divine Boon",
        }),
        "special-items",
      ],
      [
        entity("GEAR", "Fixture", "Gear", { Category: "Gear" }),
        "adventuring-gear",
      ],
    ];
    const index = entityIndex(...fixtures.map(([definition]) => definition));
    for (const [definition, expected] of fixtures) {
      expect(inventoryCategory(holding(definition), index)).toBe(expected);
    }
  });

  it("uses all repeated specifics while preserving precedence", () => {
    const repeated: ContentEntity = {
      ...entity("REPEATED", "Fixture", "Magic Item"),
      specifics: [
        {
          name: "Magic Item Type",
          value: "Wondrous Item",
          extraAttributes: [],
          ordinal: 0,
        },
        {
          name: "Magic Item Type",
          value: "Potion",
          extraAttributes: [],
          ordinal: 1,
        },
      ],
    };
    const ammunition = entity("AMMO", "Fixture", "Magic Item", {
      "Magic Item Type": "Ammunition",
      Property: "A passive bonus",
    });
    const scroll = entity("SCROLL", "Fixture", "Ritual Scroll", {
      "Magic Item Type": "Wondrous Item",
    });
    const index = entityIndex(repeated, ammunition, scroll);
    expect(inventoryCategory(holding(repeated), index)).toBe("consumables");
    expect(inventoryCategory(holding(ammunition), index)).toBe("ammunition");
    expect(inventoryCategory(holding(scroll), index)).toBe("consumables");
  });

  it("lets composed physical shields and weapons win over enchantments", () => {
    const shield = entity("SHIELD", "Fixture", "Armor", {
      "Armor Type": "Shield",
    });
    const armorEnchantment = entity("ARMS", "Fixture", "Magic Item", {
      "Magic Item Type": "Arms Slot Item",
    });
    const weapon = entity("WEAPON", "Fixture", "Weapon");
    const implementEnchantment = entity("IMPLEMENT", "Fixture", "Magic Item", {
      "Magic Item Type": "Rod",
    });
    const index = entityIndex(
      shield,
      armorEnchantment,
      weapon,
      implementEnchantment,
    );
    expect(inventoryCategory(holding(shield, armorEnchantment), index)).toBe(
      "armor-shields",
    );
    expect(
      inventoryCategory(holding(weapon, implementEnchantment), index),
    ).toBe("weapons");
  });

  it("aligns reusable gear and mechanically active wondrous items with Browse", () => {
    const wondrous = entity("WONDROUS", "Fixture", "Magic Item", {
      "Magic Item Type": "Wondrous Item",
      _DisplayPowers: "ID_POWER",
    });
    const ordinary = entity("ORDINARY", "Fixture", "Gear", {
      Description: "Can be lit and carried.",
    });
    const index = entityIndex(wondrous, ordinary);
    expect(inventoryCategory(holding(wondrous), index)).toBe("wondrous-items");
    expect(inventoryCategory(holding(ordinary), index)).toBe(
      "adventuring-gear",
    );
  });

  it("excludes learned Ritual records while keeping Ritual Scroll holdings", () => {
    const ritual = entity("RITUAL", "Fixture", "Ritual");
    const scroll = entity("SCROLL", "Fixture", "Ritual Scroll");
    const index = entityIndex(ritual, scroll);
    expect(inventoryCategory(holding(ritual), index)).toBeUndefined();
    expect(
      groupInventoryByCategory([holding(ritual), holding(scroll)], index).map(
        ({ category, entries }) => [category.id, entries.length],
      ),
    ).toEqual([["consumables", 1]]);
  });

  it("keeps unresolved holdings recoverable and groups in stable domain order", () => {
    const unresolved: BuildInventoryEntry = {
      id: "unresolved",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [{ name: "Custom holding", type: "Gear" }],
      overrides: {},
      legality: "rules-legal",
    };
    const armorOne = entity("A1", "Fixture", "Armor");
    const weapon = entity("W", "Fixture", "Weapon");
    const armorTwo = entity("A2", "Fixture", "Armor");
    const index = entityIndex(armorOne, weapon, armorTwo);
    const grouped = groupInventoryByCategory(
      [holding(armorOne), holding(weapon), unresolved, holding(armorTwo)],
      index,
    );
    expect(
      grouped.map(({ category, entries }) => [
        category.id,
        entries.map(({ id }) => id),
      ]),
    ).toEqual([
      ["armor-shields", ["A1", "A2"]],
      ["weapons", ["W"]],
      ["miscellaneous", ["unresolved"]],
    ]);
  });
});

describe("equipment catalog presentation", () => {
  it("groups only complete compatible terminal enhancement families", () => {
    const one = entity("ONE", "Flame Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Heavy Blade",
    });
    const two = entity("TWO", "Flame Weapon +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Heavy Blade",
    });
    const axe = entity("AXE", "Flame Weapon +3", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Axe",
    });
    expect(groupMagicItemFamilies([one, two, axe], [one, two, axe])).toEqual([
      { key: expect.any(String), label: "Flame Weapon", entities: [one, two] },
      { key: "AXE", label: "Flame Weapon +3", entities: [axe] },
    ]);
    expect(groupMagicItemFamilies([one], [one, two])).toEqual([
      { key: expect.any(String), label: "Flame Weapon", entities: [one] },
    ]);
  });

  it("reads authored prices and ritual subtypes", () => {
    expect(
      entityCurrencyCopper(entity("G", "Gear", "Gear", { Gold: "15" })),
    ).toBe(1500);
    expect(
      entityCurrencyCopper(
        entity("R", "Ritual", "Ritual", { "Market Price": "1,000 gp" }),
      ),
    ).toBe(100_000);
    expect(practiceKind(entity("S", "Scroll", "Ritual Scroll"))).toBe("scroll");
    expect(
      practiceKind(
        entity("A", "Formula", "Ritual", { type: "Alchemical Formula" }),
      ),
    ).toBe("alchemical-formula");
  });

  it("formats every sale option in the exact unit selected by the 20% baseline", () => {
    expect(comparableSaleProceeds(340_000)).toEqual([
      { percentage: 100, label: "3400 gp" },
      { percentage: 50, label: "1700 gp" },
      { percentage: 20, label: "680 gp" },
    ]);
    expect(comparableSaleProceeds(50_000)).toEqual([
      { percentage: 100, label: "5 pp" },
      { percentage: 50, label: "2.5 pp" },
      { percentage: 20, label: "1 pp" },
    ]);
    expect(comparableSaleProceeds(123)).toEqual([
      { percentage: 100, label: "123 cp" },
      { percentage: 50, label: "61 cp" },
      { percentage: 20, label: "24 cp" },
    ]);
  });

  it("formats composed magic equipment as one natural item name", () => {
    const leather = entity("LEATHER", "Leather Armor", "Armor");
    const gloaming = entity("GLOAMING", "Gloaming Armor +1", "Magic Item");
    const greatbow = entity("GREATBOW", "Greatbow", "Weapon");
    const speed = entity("SPEED", "Weapon of Speed +2", "Magic Item");
    const magicArmor = entity("MAGIC_ARMOR", "Magic Armor +1", "Magic Item");
    const magicWeapon = entity("MAGIC_WEAPON", "Magic Weapon +1", "Magic Item");
    const heavyShield = entity("HEAVY_SHIELD", "Heavy Shield", "Armor");
    const stormShield = entity(
      "STORM_SHIELD",
      "Storm Shield (heroic tier)",
      "Magic Item",
    );
    const pactWeapon = entity(
      "PACT_WEAPON",
      "Fey Pact of the White Well Weapon",
      "Weapon",
    );
    const whiteWell = entity(
      "WHITE_WELL",
      "Sword of the White Well",
      "Magic Item",
      { "Magic Item Type": "Artifact" },
    );
    const index = new Map(
      [
        pactWeapon,
        whiteWell,
        leather,
        gloaming,
        greatbow,
        speed,
        magicArmor,
        magicWeapon,
        heavyShield,
        stormShield,
      ].map((item) => [item.id.toLocaleLowerCase(), item]),
    );
    const holding = (base: ContentEntity, enchantment: ContentEntity) => ({
      id: `${base.id}:${enchantment.id}`,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [base, enchantment].map(({ id, name, type }) => ({
        definitionId: id,
        name,
        type,
      })),
      overrides: {},
      legality: "rules-legal" as const,
    });

    expect(inventoryDisplayName(holding(leather, gloaming), index)).toBe(
      "Gloaming Leather Armor +1",
    );
    expect(inventoryDisplayName(holding(greatbow, speed), index)).toBe(
      "Greatbow of Speed +2",
    );
    expect(inventoryDisplayName(holding(leather, magicArmor), index)).toBe(
      "Leather Armor +1",
    );
    expect(inventoryDisplayName(holding(greatbow, magicWeapon), index)).toBe(
      "Greatbow +1",
    );
    expect(inventoryDisplayName(holding(heavyShield, stormShield), index)).toBe(
      "Storm Heavy Shield",
    );
    expect(inventoryDisplayName(holding(pactWeapon, whiteWell), index)).toBe(
      "Sword of the White Well",
    );
    expect(
      inventoryDisplayName(
        { ...holding(leather, gloaming), name: "Grandmother's armor" },
        index,
      ),
    ).toBe("Grandmother's armor");
  });

  it("appends a resolved item-owned choice in parentheses, after the +N bonus", () => {
    const base = entity("BANDED", "Banded Mail", "Armor");
    const enchantment = entity(
      "RESISTANCE",
      "Armor of Resistance +2",
      "Magic Item",
    );
    const fire = entity(
      "FIRE",
      "Armor of Resistance +2 (Fire)",
      "Class Feature",
    );
    const byId = new Map(
      [base, enchantment, fire].map((item) => [
        item.id.toLocaleLowerCase(),
        item,
      ]),
    );
    const resolvedChild = {
      id: "web:choice",
      identity: { definitionId: fire.id, name: fire.name, type: fire.type },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const resolvedEntry: BuildInventoryEntry = {
      id: "owned",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [
        { definitionId: base.id, name: base.name, type: base.type },
        {
          definitionId: enchantment.id,
          name: enchantment.name,
          type: enchantment.type,
          children: [resolvedChild],
        },
      ],
      overrides: {},
      legality: "rules-legal",
    };
    expect(inventoryDisplayName(resolvedEntry, byId)).toBe(
      "Banded Mail of Resistance +2 (Fire)",
    );

    const { children: _children, ...enchantmentWithoutChoice } =
      resolvedEntry.elements[1]!;
    void _children;
    const unresolvedEntry: BuildInventoryEntry = {
      ...resolvedEntry,
      elements: [resolvedEntry.elements[0]!, enchantmentWithoutChoice],
    };
    expect(inventoryDisplayName(unresolvedEntry, byId)).toBe(
      "Banded Mail of Resistance +2",
    );
  });

  it("pairs armor and weapon enchantments only with compatible bases", () => {
    const enchantment = entity("MAGIC", "Black Iron Armor +2", "Magic Item", {
      "Magic Item Type": "Armor",
      Armor: "Scale, Plate",
    });
    const scale = entity("SCALE", "Scale armor", "Armor", {
      "Armor Category": "Scale",
    });
    const cloth = entity("CLOTH", "Cloth armor", "Armor", {
      "Armor Category": "Cloth",
    });
    expect(compatibleBaseItems(enchantment, [cloth, scale])).toEqual([scale]);

    const shieldEnchantment = entity(
      "SHIELD_MAGIC",
      "Hammer Shield (heroic tier)",
      "Magic Item",
      {
        "Magic Item Type": "Arms Slot Item",
        _IsEnchant: "Shield",
      },
    );
    const heavyShield = entity("HEAVY_SHIELD", "Heavy Shield", "Armor", {
      "Armor Category": "Heavy Shields",
      "Armor Type": "Shield",
    });
    expect(
      compatibleBaseItems(shieldEnchantment, [cloth, scale, heavyShield]),
    ).toEqual([heavyShield]);

    const anyWeapon = entity("ANY", "Magic Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any",
    });
    const anyMelee = entity("MELEE", "Melee Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any melee",
    });
    const sword = entity("SWORD", "Longsword", "Weapon", {
      "Weapon Category": "Military Melee",
      Group: "Heavy Blade",
    });
    const bow = entity("BOW", "Longbow", "Weapon", {
      "Weapon Category": "Military Ranged",
      Group: "Bow",
      Range: "20/40",
    });
    expect(compatibleBaseItems(anyWeapon, [sword, bow])).toEqual([bow, sword]);
    expect(compatibleBaseItems(anyMelee, [sword, bow])).toEqual([sword]);
    const meleeTwo = entity("MELEE2", "Melee Weapon +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any melee (melee weapon)",
    });
    expect(compatibleBaseItems(meleeTwo, [sword, bow])).toEqual([sword]);

    // Armor enchantments never reach a shield (native ValidateShield).
    const anyArmor = entity("ANY_ARMOR", "Delver's Armor +1", "Magic Item", {
      "Magic Item Type": "Armor",
      Armor: "Any",
      Enhancement: "+1",
    });
    expect(compatibleBaseItems(anyArmor, [cloth, heavyShield])).toEqual([
      cloth,
    ]);
  });

  it("reads the Weapon field grammar as native IsValidWeapon does", () => {
    const weapon = (
      id: string,
      name: string,
      specifics: Readonly<Record<string, string>>,
    ) => entity(id, name, "Weapon", specifics);
    const longsword = weapon("ID_FMP_WEAPON_14", "Longsword", {
      Group: "Heavy Blade",
      "Weapon Category": "Military Melee",
      "Hands Required": "One-Handed",
      Properties: "Versatile",
    });
    const glaive = weapon("ID_FMP_WEAPON_25", "Glaive", {
      Group: "Heavy Blade, Polearm",
      "Weapon Category": "Military Melee",
      "Hands Required": "Two-Handed",
      Properties: "Reach",
    });
    const gauntlet = weapon("ID_FMP_WEAPON_48", "Spiked gauntlet", {
      Group: "Unarmed",
      "Weapon Category": "Simple Melee",
      "Hands Required": "One-Handed",
      Properties: "Off-hand",
    });
    const secondEnd = weapon(
      "ID_FMP_WEAPON_89",
      "Double sword (secondary end)",
      {
        Group: "Light Blade",
        "Weapon Category": "Superior Melee",
        "Hands Required": "One-Handed",
      },
    );
    const doubleSword = weapon("ID_FMP_WEAPON_68", "Double sword", {
      Group: "Heavy Blade",
      "Weapon Category": "Superior Melee",
      "Hands Required": "One-Handed",
      Properties: "Defensive, Off-hand",
      "_Secondary End": "ID_FMP_WEAPON_89",
    });
    const handaxe = weapon("ID_FMP_WEAPON_21", "Handaxe", {
      Group: "Axe",
      "Weapon Category": "Simple Melee",
      "Hands Required": "One-Handed",
      Properties: "Light Thrown, Off-hand",
      Range: "5/10",
    });
    const catalog = [longsword, glaive, gauntlet, doubleSword, handaxe];
    const entities = [...catalog, secondEnd];
    const enchant = (name: string, field: string) =>
      entity(`MAGIC_${name}`, `${name} +1`, "Magic Item", {
        "Magic Item Type": "Weapon",
        Weapon: field,
      });
    const offered = (field: string) =>
      compatibleBaseItems(enchant(field, field), catalog, entities).map(
        ({ name }) => name,
      );
    expect(offered("Any melee except reach weapons")).toEqual([
      "Double sword",
      "Handaxe",
      "Longsword",
      "Spiked gauntlet",
    ]);
    expect(offered("One-handed melee weapon")).toEqual([
      "Double sword",
      "Handaxe",
      "Longsword",
      "Spiked gauntlet",
    ]);
    expect(offered("Spiked gauntlets")).toEqual(["Spiked gauntlet"]);
    expect(offered("Any thrown")).toEqual(["Handaxe"]);
    expect(offered("Any Ranged")).toEqual(["Handaxe"]);
    // A list matches a base's groups, its name, or a double weapon's
    // secondary end group.
    expect(offered("Polearm, Spear")).toEqual(["Glaive"]);
    expect(offered("Light Blade")).toEqual(["Double sword"]);
    expect(offered("Light blade, Axe (one-handed only)")).toEqual([
      "Double sword",
      "Handaxe",
    ]);
    // Native ListContains matches whole entries only, so plural names fit
    // nothing (the content says "Axes, hammers, heavy blades").
    expect(offered("Axes, hammers, heavy blades")).toEqual([]);
  });

  it("puts weapon enchantments on superior staffs and daggers, as implement enchantments", () => {
    const quarterstaff = entity("ID_FMP_WEAPON_10", "Quarterstaff", "Weapon", {
      Group: "Staff",
      "Weapon Category": "Simple Melee",
      "Hands Required": "Two-Handed",
    });
    const dagger = entity("ID_FMP_WEAPON_3", "Dagger", "Weapon", {
      Group: "Light Blade",
      "Weapon Category": "Simple Melee",
      "Hands Required": "One-Handed",
      Properties: "Light Thrown, Off-hand",
      Range: "5/10",
    });
    const accurateStaff = entity(
      "ID_FMP_SUPERIOR_IMPLEMENT_108",
      "Accurate staff",
      "Superior Implement",
      { Group: "Staff", WeaponEquiv: "ID_FMP_WEAPON_10" },
    );
    const accurateDagger = entity(
      "ID_FMP_SUPERIOR_IMPLEMENT_123",
      "Accurate dagger",
      "Superior Implement",
      { Group: "Light Blade", WeaponEquiv: "ID_FMP_WEAPON_3" },
    );
    const accurateOrb = entity(
      "ID_FMP_SUPERIOR_IMPLEMENT_100",
      "Accurate orb",
      "Superior Implement",
      { Group: "Orb" },
    );
    const catalog = [
      quarterstaff,
      dagger,
      accurateStaff,
      accurateDagger,
      accurateOrb,
    ];
    const lightBlade = entity("BLADE", "Duelist's Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Light Blade",
    });
    const anyMelee = entity("MELEE", "Lifedrinker Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any melee",
    });
    const bow = entity("BOW", "Forceful Weapon +1", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Bow",
    });
    expect(
      compatibleBaseItems(lightBlade, catalog).map(({ name }) => name),
    ).toEqual(["Accurate dagger", "Dagger"]);
    expect(
      compatibleBaseItems(anyMelee, catalog).map(({ name }) => name),
    ).toEqual(["Accurate dagger", "Accurate staff", "Dagger", "Quarterstaff"]);
    expect(shopAlsoImplementEnchantment(lightBlade, catalog)).toBe(true);
    expect(shopAlsoImplementEnchantment(bow, catalog)).toBe(false);
  });

  it("turns a slotless magic item naming one weapon into that base (TransformLoot)", () => {
    const longsword = entity("ID_FMP_WEAPON_14", "Longsword", "Weapon", {
      Group: "Heavy Blade",
      "Weapon Category": "Military Melee",
    });
    const broadsword = entity("ID_FMP_WEAPON_60", "Broadsword", "Weapon", {
      Group: "Heavy Blade",
      "Weapon Category": "Military Melee",
    });
    const artifact = entity("NIGHTBRINGER", "Nightbringer", "Magic Item", {
      "Magic Item Type": "Artifact",
      Weapon: "Longsword",
    });
    const intelligent = entity("MOONLIGHT", "Moonlight +5", "Magic Item", {
      "Magic Item Type": "Intelligent Item",
      Weapon: "Light Blade",
    });
    const slotted = entity("FRAZ", "Staff of Fraz-Urb'luu", "Magic Item", {
      "Magic Item Type": "Artifact",
      "Item Slot": "Off-hand",
      Weapon: "Longsword",
    });
    const catalog = [longsword, broadsword];
    expect(compatibleBaseItems(artifact, catalog)).toEqual([longsword]);
    expect(compatibleBaseItems(intelligent, catalog)).toEqual([]);
    expect(compatibleBaseItems(slotted, catalog)).toEqual([]);
  });

  it("keeps enchantments and masterwork armor from being held alone", () => {
    const leather = entity("ID_FMP_ARMOR_2", "Leather Armor", "Armor", {
      "Armor Type": "Light",
      "Armor Category": "Leather",
    });
    const feyleather = entity("ID_FMP_ARMOR_12", "Feyleather Armor", "Armor", {
      "Armor Type": "Light",
      "Armor Category": "Leather",
      "Minimum Enhancement Bonus": "4",
    });
    const plateOnly = entity("PLATE", "Battleforged Armor +1", "Magic Item", {
      "Magic Item Type": "Armor",
      Armor: "Plate",
      Enhancement: "+1",
    });
    const leatherFour = entity(
      "LEATHER4",
      "Bloodtheft Armor +4",
      "Magic Item",
      {
        "Magic Item Type": "Armor",
        Armor: "Leather",
        Enhancement: "+4",
      },
    );
    const leatherTwo = entity("LEATHER2", "Bloodtheft Armor +2", "Magic Item", {
      "Magic Item Type": "Armor",
      Armor: "Leather",
      Enhancement: "+2",
    });
    const catalog = [leather, feyleather];
    expect(compatibleBaseItems(leatherFour, catalog)).toEqual([
      feyleather,
      leather,
    ]);
    expect(compatibleBaseItems(leatherTwo, catalog)).toEqual([leather]);
    expect(
      shopAcquireBlockedReason(plateOnly, catalog, catalog, {}),
    ).toBeDefined();
    expect(
      shopAcquireBlockedReason(leatherTwo, catalog, catalog, {}),
    ).toBeUndefined();
    expect(
      shopAcquireBlockedReason(leather, catalog, catalog, {}),
    ).toBeUndefined();
    expect(
      shopAcquireBlockedReason(feyleather, catalog, catalog, {}),
    ).toBeDefined();
    expect(
      shopAcquireBlockedReason(feyleather, catalog, catalog, {
        inherentBonuses: true,
      }),
    ).toBeUndefined();
  });

  it("limits explicit loadout choices to authored slots", () => {
    const weapon = entity("WEAPON", "Greatsword", "Weapon", {
      "Item Slot": "Two-hands",
    });
    expect(
      inventorySlotCandidates(
        {
          id: "held",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 0,
          elements: [
            { definitionId: weapon.id, name: weapon.name, type: weapon.type },
          ],
          overrides: {},
          legality: "rules-legal",
        },
        new Map([[weapon.id.toLocaleLowerCase(), weapon]]),
      ),
    ).toEqual(["main-hand", "off-hand"]);
    const entry = (item: ContentEntity) => ({
      id: item.id,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [{ definitionId: item.id, name: item.name, type: item.type }],
      overrides: {},
      legality: "rules-legal" as const,
    });
    const sword = entity("SWORD", "Longsword", "Weapon", {
      "Hands Required": "One-Handed",
    });
    const armor = entity("ARMOR", "Leather armor", "Armor");
    const shield = entity("SHIELD", "Guardian slab", "Armor", {
      "Armor Type": "Shield",
      "Item Slot": "Off-hand",
    });
    const shieldEnchantment = entity(
      "SHIELD_ENCHANTMENT",
      "Protective ward",
      "Magic Item",
      {
        "Magic Item Type": "Arms Slot Item",
        "Item Slot": "Arms",
      },
    );
    const headNeck = entity("HN", "Paired crown", "Magic Item", {
      "Item Slot": "Head and Neck",
    });
    const arms = entity("ARMS", "Iron armbands", "Magic Item", {
      "Magic Item Type": "Arms Slot Item",
    });
    const holySymbol = entity(
      "HOLY_SYMBOL",
      "Magic Holy Symbol +1",
      "Magic Item",
      {
        "Magic Item Type": "Holy Symbol",
        "Item Slot": "Off-hand",
      },
    );
    const index = new Map(
      [
        weapon,
        sword,
        armor,
        shield,
        shieldEnchantment,
        headNeck,
        arms,
        holySymbol,
      ].map((item) => [item.id.toLocaleLowerCase(), item]),
    );
    expect(inventorySlotCandidates(entry(sword), index)).toEqual([
      "main-hand",
      "off-hand",
    ]);
    expect(inventorySlotCandidates(entry(armor), index)).toEqual(["body"]);
    expect(inventorySlotCandidates(entry(shield), index)).toEqual(["off-hand"]);
    expect(
      inventorySlotCandidates(
        {
          ...entry(shield),
          elements: [
            ...entry(shield).elements,
            ...entry(shieldEnchantment).elements,
          ],
        },
        index,
      ),
    ).toEqual(["off-hand"]);
    expect(
      inventorySlotCandidates(
        {
          ...entry(shield),
          elements: [
            ...entry(shieldEnchantment).elements,
            ...entry(shield).elements,
          ],
        },
        index,
      ),
    ).toEqual(["off-hand"]);
    expect(inventorySlotCandidates(entry(headNeck), index)).toEqual([
      "head",
      "neck",
    ]);
    expect(inventorySlotCandidates(entry(arms), index)).toEqual(["arms"]);
    expect(inventorySlotCandidates(entry(holySymbol), index)).toEqual([
      "main-hand",
      "off-hand",
      "symbol",
    ]);
    expect(inventoryRequiresBothHands(entry(weapon), index)).toBe(true);
    expect(inventoryRequiresBothHands(entry(sword), index)).toBe(false);
  });

  it("orders the two loadout stacks with the approved monochrome icons", () => {
    expect(
      LOADOUT_SLOT_COLUMNS.map(({ id, slots }) => ({
        id,
        slots: slots.map(({ id: slotId, icon }) => [slotId, icon]),
      })),
    ).toEqual([
      {
        id: "body",
        slots: [
          ["head", "hard-hat"],
          ["neck", "medal"],
          ["body", "shirt"],
          ["arms", "arms"],
          ["hands", "hand"],
          ["waist", "square-star"],
          ["feet", "footprints"],
        ],
      },
      {
        id: "held",
        slots: [
          ["main-hand", "sword"],
          ["off-hand", "shield"],
          ["symbol", "church"],
          ["ki-focus", "focus"],
          ["ring-1", "gem"],
          ["ring-2", "gem"],
          ["ring-3", "gem"],
          ["ring-4", "gem"],
          ["tattoo", "stamp"],
        ],
      },
    ]);
  });

  it("shows legacy equipped counts in deterministic modern slots", () => {
    const cloth = entity("CLOTH", "Cloth Armor", "Armor", {
      "Armor Type": "Light",
      "Item Slot": "Body",
    });
    const flowform = entity("FLOWFORM", "Flowform Armor +1", "Magic Item", {
      "Magic Item Type": "Armor",
    });
    const cape = entity("CAPE", "Cape of the Mountebank +1", "Magic Item", {
      "Magic Item Type": "Neck Slot Item",
      "Item Slot": "Neck",
    });
    const index = new Map(
      [cloth, flowform, cape].map((item) => [
        item.id.toLocaleLowerCase(),
        item,
      ]),
    );
    const holding = (
      id: string,
      definitions: readonly ContentEntity[],
    ): BuildInventoryEntry => ({
      id,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 1,
      elements: definitions.map(({ id: definitionId, name, type }) => ({
        definitionId,
        name,
        type,
      })),
      overrides: {},
      legality: "rules-legal",
    });

    const armorHolding = holding("armor", [cloth, flowform]);
    const capeHolding = holding("cape", [cape]);
    const inventory = [armorHolding, capeHolding];
    const resolved = resolveLoadoutAssignments(inventory, index);

    expect(resolved.assignmentsByEntry.get("armor")).toEqual([
      { slot: "body", quantityIndex: 0 },
    ]);
    expect(resolved.assignmentsByEntry.get("cape")).toEqual([
      { slot: "neck", quantityIndex: 0 },
    ]);

    const command = loadoutChangeCommand(
      inventory,
      index,
      undefined,
      ["body"],
      "armor",
    );
    const build: CharacterBuild = {
      formatVersion: 3,
      known: [],
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory,
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    expect(command).toBeDefined();
    expect(applyCharacterCommand(build, command!).inventory[0]).toMatchObject({
      equippedQuantity: 0,
      equippedSlots: [],
    });
  });

  it("resolves Inventory equip toggles in visible slot order without flattening ambiguity", () => {
    const crown = entity("CROWN", "Flexible crown", "Magic Item", {
      "Item Slot": "Head and Neck",
    });
    const helmet = entity("HELMET", "Helmet", "Magic Item", {
      "Item Slot": "Head",
    });
    const collar = entity("COLLAR", "Collar", "Magic Item", {
      "Item Slot": "Neck",
    });
    const greatsword = entity("GREATSWORD", "Greatsword", "Weapon", {
      "Item Slot": "Two-hand",
      "Hands Required": "Two-handed",
    });
    const index = new Map(
      [crown, helmet, collar, greatsword].map((item) => [
        item.id.toLocaleLowerCase(),
        item,
      ]),
    );
    const holding = (
      item: ContentEntity,
      equippedSlots?: BuildInventoryEntry["equippedSlots"],
    ): BuildInventoryEntry => ({
      id: item.id,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: equippedSlots === undefined ? 0 : 1,
      ...(equippedSlots === undefined ? {} : { equippedSlots }),
      elements: [{ definitionId: item.id, name: item.name, type: item.type }],
      overrides: {},
      legality: "rules-legal",
    });
    const helmetHolding = holding(helmet, [{ slot: "head", quantityIndex: 0 }]);
    const collarHolding = holding(collar, [{ slot: "neck", quantityIndex: 0 }]);
    const crownHolding = holding(crown);

    expect(
      inventoryLoadoutToggle(
        [helmetHolding, crownHolding],
        index,
        crownHolding.id,
        ["head", "neck"],
      ),
    ).toEqual({ kind: "equip", slots: ["neck"], displaces: false });
    expect(
      inventoryLoadoutToggle(
        [helmetHolding, collarHolding, crownHolding],
        index,
        crownHolding.id,
        ["head", "neck"],
      ),
    ).toEqual({ kind: "equip", slots: ["head"], displaces: true });
    expect(
      inventoryLoadoutToggle([holding(greatsword)], index, greatsword.id, [
        "main-hand",
        "off-hand",
      ]),
    ).toEqual({
      kind: "equip",
      slots: ["main-hand", "off-hand"],
      displaces: false,
    });
    expect(
      inventoryLoadoutToggle([helmetHolding], index, helmetHolding.id, [
        "head",
        "neck",
      ]),
    ).toEqual({ kind: "unequip", slots: ["head"] });

    const ambiguous = { ...crownHolding, equippedQuantity: 1 };
    expect(
      inventoryLoadoutToggle(
        [helmetHolding, collarHolding, ambiguous],
        index,
        ambiguous.id,
        ["head", "neck"],
      ),
    ).toEqual({ kind: "ambiguous" });
  });

  it("shows implement slots only for their exact active proficiency IDs", () => {
    const visibleIds = (activeDefinitionIds: readonly string[]) =>
      visibleLoadoutSlotColumns(activeDefinitionIds, [], new Map())
        .flatMap(({ slots }) => slots)
        .map(({ id }) => id);

    expect(IMPLEMENT_LOADOUT_PROFICIENCY_IDS).toEqual({
      symbol: "ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_(HOLY_SYMBOL)",
      "ki-focus": "ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_(KI_FOCUSES)",
    });
    expect(visibleIds([])).not.toContain("symbol");
    expect(visibleIds([])).not.toContain("ki-focus");
    expect(visibleIds(["HOLY_SYMBOL_PROFICIENCY"])).not.toContain("symbol");
    expect(
      visibleIds([
        IMPLEMENT_LOADOUT_PROFICIENCY_IDS.symbol.toLocaleLowerCase(),
      ]),
    ).not.toContain("symbol");
    expect(visibleIds([IMPLEMENT_LOADOUT_PROFICIENCY_IDS.symbol])).toContain(
      "symbol",
    );
    expect(
      visibleIds([IMPLEMENT_LOADOUT_PROFICIENCY_IDS["ki-focus"]]),
    ).toContain("ki-focus");
  });

  it("offers a third and fourth ring slot only with the Ring Slots stat", () => {
    const ringIds = (ringSlots?: number) =>
      visibleLoadoutSlotColumns(
        [],
        [],
        new Map(),
        ringSlots === undefined
          ? undefined
          : {
              small: false,
              oversized: false,
              oneSizeLarger: false,
              ambidextrous: false,
              ringSlots,
            },
      )
        .flatMap(({ slots }) => slots)
        .map(({ id }) => id)
        .filter((id) => id.startsWith("ring-"));
    expect(ringIds()).toEqual(["ring-1", "ring-2"]);
    expect(ringIds(2)).toEqual(["ring-1", "ring-2"]);
    expect(ringIds(3)).toEqual(["ring-1", "ring-2", "ring-3"]);
    expect(ringIds(4)).toEqual(["ring-1", "ring-2", "ring-3", "ring-4"]);
  });

  it("keeps companion, familiar, and mount slots inventory-conditional", () => {
    const conditionalSlots = ["companion", "familiar", "mount"] as const;
    const emptyIds = visibleLoadoutSlotColumns([], [], new Map())
      .flatMap(({ slots }) => slots)
      .map(({ id }) => id);
    expect(emptyIds).toEqual(expect.not.arrayContaining([...conditionalSlots]));

    for (const slot of conditionalSlots) {
      const definition = entity(
        slot.toLocaleUpperCase(),
        `${slot} item`,
        "Magic Item",
        { "Item Slot": slot },
      );
      const entry = {
        id: definition.id,
        acquiredLevel: 1,
        quantity: 1,
        equippedQuantity: 0,
        elements: [
          {
            definitionId: definition.id,
            name: definition.name,
            type: definition.type,
          },
        ],
        overrides: {},
        legality: "rules-legal" as const,
      };
      const visibleIds = visibleLoadoutSlotColumns(
        [],
        [entry],
        new Map([[definition.id.toLocaleLowerCase(), definition]]),
      )
        .flatMap(({ slots }) => slots)
        .map(({ id }) => id);

      expect(visibleIds).toContain(slot);
      expect(visibleIds).toEqual(
        expect.not.arrayContaining(
          conditionalSlots.filter((candidate) => candidate !== slot),
        ),
      );
    }
  });
});

describe("missing inventory content", () => {
  it("finds saved elements whose definitions the content lacks", () => {
    const byId = entityIndex(entity("ARMOR", "Leather Armor", "Armor"));
    expect(
      missingInventoryElements(
        {
          elements: [
            { definitionId: "armor", name: "Leather Armor", type: "Armor" },
            {
              definitionId: "HOMEBREW",
              name: "Armor of Brewing +1",
              type: "Magic Item",
            },
            // A name-only legacy element never had a definition to miss.
            { name: "Custom trinket", type: "Gear" },
          ],
        },
        byId,
      ).map(({ name }) => name),
    ).toEqual(["Armor of Brewing +1"]);
  });
});

describe("alternate slots and two-handed wielding in the Loadout (D101)", () => {
  const razor = entity("RAZOR", "Arm blade", "Weapon", {
    "Item Slot": "Off-hand",
    Properties: "Off-hand",
    _AlternateSlot: "Arms",
  });
  const sword = entity("SWORD", "Bastard blade", "Weapon", {
    "Item Slot": "One-hand",
    Properties: "Versatile",
  });
  const index = entityIndex(razor, sword);
  const build = (inventory: BuildInventoryEntry[]): CharacterBuild => ({
    formatVersion: 3,
    known: [],
    effectiveLevel: 1,
    levels: [],
    grabbag: [],
    inventory,
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  });

  it("moves a placed item to its alternate slot instead of refusing", () => {
    const razorHolding: BuildInventoryEntry = {
      ...holding(razor),
      equippedQuantity: 1,
      equippedSlots: [{ slot: "off-hand", quantityIndex: 0 }],
    };
    const command = loadoutChangeCommand([razorHolding], index, razor.id, [
      "arms",
    ]);
    expect(command).toBeDefined();
    expect(
      applyCharacterCommand(build([razorHolding]), command!).inventory[0]
        ?.equippedSlots,
    ).toEqual([{ slot: "arms", quantityIndex: 0 }]);
  });

  it("never double-click equips into the alternate slot", () => {
    expect(
      inventoryLoadoutToggle([holding(razor)], index, razor.id, [
        "main-hand",
        "off-hand",
        "arms",
      ]),
    ).toEqual({ kind: "equip", slots: ["main-hand"], displaces: false });
  });

  it("equips a versatile weapon wielded two-handed in both hands", () => {
    const swordHolding: BuildInventoryEntry = {
      ...holding(sword),
      wieldedTwoHanded: true,
    };
    expect(
      inventoryLoadoutToggle([swordHolding], index, sword.id, [
        "main-hand",
        "off-hand",
      ]),
    ).toEqual({
      kind: "equip",
      slots: ["main-hand", "off-hand"],
      displaces: false,
    });
  });
});

describe("size rules in the Loadout (D102)", () => {
  const sword = entity("SWORD", "Bastard blade", "Weapon", {
    "Item Slot": "One-hand",
    Properties: "Versatile",
  });
  const great = entity("GREAT", "Great blade", "Weapon", {
    "Item Slot": "Two-Hands",
    "Hands Required": "Two-Handed",
  });
  const index = entityIndex(sword, great);
  const facts = {
    small: false,
    oversized: false,
    oneSizeLarger: false,
    ambidextrous: false,
  };

  it("puts a Small character's versatile weapon in both hands", () => {
    const small = loadoutContext({}, { ...facts, small: true });
    expect(
      inventoryLoadoutToggle(
        [holding(sword)],
        index,
        sword.id,
        ["main-hand", "off-hand"],
        small,
      ),
    ).toEqual({
      kind: "equip",
      slots: ["main-hand", "off-hand"],
      displaces: false,
    });
    expect(inventoryRequiresBothHands(holding(sword), index, small)).toBe(true);
    // An unwieldable two-handed weapon is still placed, in both hands.
    expect(
      inventoryLoadoutToggle(
        [holding(great)],
        index,
        great.id,
        ["main-hand", "off-hand"],
        small,
      ),
    ).toEqual({
      kind: "equip",
      slots: ["main-hand", "off-hand"],
      displaces: false,
    });
  });

  it("puts a two-handed weapon in one hand with One Size Larger", () => {
    expect(
      inventoryLoadoutToggle(
        [holding(great)],
        index,
        great.id,
        ["main-hand", "off-hand"],
        loadoutContext({}, { ...facts, oneSizeLarger: true }),
      ),
    ).toEqual({ kind: "equip", slots: ["main-hand"], displaces: false });
  });
});

describe("packaged gear (legacy CharacterLootItem.PackageManipulation)", () => {
  const arrows = entity("ID_FMP_GEAR_11", "Arrows", "Gear", {
    count: "30",
    Gold: "1",
    _RelatedElement: "ID_FMP_GEAR_58",
  });
  const arrow = entity("ID_FMP_GEAR_58", "Arrow", "Gear", {
    count: "1",
    Copper: "4",
    _RelatedElement: "ID_FMP_GEAR_11",
  });
  const rope = entity("ID_FMP_GEAR_18", "Hempen Rope (50 ft.)", "Gear", {
    count: "1",
  });
  const byId = new Map(
    [arrows, arrow, rope].map((item) => [item.id.toLocaleLowerCase(), item]),
  );
  const build = (inventory: BuildInventoryEntry[]): CharacterBuild => ({
    formatVersion: 3,
    known: [],
    effectiveLevel: 1,
    levels: [],
    grabbag: [],
    inventory,
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  });
  const acquire = (
    inventory: BuildInventoryEntry[],
    item: ContentEntity,
    quantity = 1,
  ) =>
    acquisitionCommands(
      inventory,
      { ...inventoryEntryForEntity(item, 1), quantity },
      0,
      byId,
    )
      .reduce(applyCharacterCommand, build(inventory))
      .inventory.map((entry) => `${entry.elements[0]!.name} x${entry.quantity}`)
      .sort();

  it("folds single items into full packages and keeps the rest single", () => {
    const singles = { ...holding(arrow), quantity: 29 };
    expect(acquire([singles], arrow)).toEqual(["Arrows x1"]);
    expect(acquire([singles], arrow, 3)).toEqual(["Arrow x2", "Arrows x1"]);
    expect(acquire([singles], arrows)).toEqual(["Arrow x29", "Arrows x1"]);
    expect(acquire([], arrow, 31)).toEqual(["Arrow x1", "Arrows x1"]);
  });

  it("adds unpackaged gear unchanged", () => {
    expect(
      acquisitionCommands([], inventoryEntryForEntity(rope, 1), 0, byId),
    ).toHaveLength(1);
    expect(acquire([], rope)).toEqual(["Hempen Rope (50 ft.) x1"]);
  });
});
