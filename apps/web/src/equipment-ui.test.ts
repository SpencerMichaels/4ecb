import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type BuildInventoryEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  compatibleBaseItems,
  comparableSaleProceeds,
  entityCurrencyCopper,
  groupMagicItemFamilies,
  groupInventoryByCategory,
  IMPLEMENT_LOADOUT_PROFICIENCY_IDS,
  INVENTORY_CATEGORIES,
  inventoryCategory,
  inventoryDisplayName,
  inventoryLoadoutToggle,
  inventorySlotCandidates,
  inventoryRequiresBothHands,
  LOADOUT_SLOT_COLUMNS,
  loadoutChangeCommand,
  practiceKind,
  resolveLoadoutAssignments,
  recommendedMagicItemVariant,
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
    expect(shopDisplayName(enchantment)).toBe("Testing +2");
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
    const index = new Map(
      [
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
      "+1 Gloaming Leather Armor",
    );
    expect(inventoryDisplayName(holding(greatbow, speed), index)).toBe(
      "+2 Greatbow of Speed",
    );
    expect(inventoryDisplayName(holding(leather, magicArmor), index)).toBe(
      "+1 Leather Armor",
    );
    expect(inventoryDisplayName(holding(greatbow, magicWeapon), index)).toBe(
      "+1 Greatbow",
    );
    expect(inventoryDisplayName(holding(heavyShield, stormShield), index)).toBe(
      "Storm Heavy Shield",
    );
    expect(
      inventoryDisplayName(
        { ...holding(leather, gloaming), name: "Grandmother's armor" },
        index,
      ),
    ).toBe("Grandmother's armor");
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
      "Minimum Enhancement Bonus": "2",
    });
    const bow = entity("BOW", "Longbow", "Weapon", {
      "Weapon Category": "Military Ranged",
      Group: "Bow",
      Range: "20/40",
    });
    expect(compatibleBaseItems(anyWeapon, [sword, bow])).toEqual([bow]);
    expect(compatibleBaseItems(anyMelee, [sword, bow])).toEqual([]);
    const meleeTwo = entity("MELEE2", "Melee Weapon +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Any melee (melee weapon)",
    });
    expect(compatibleBaseItems(meleeTwo, [sword, bow])).toEqual([sword]);
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
      formatVersion: 1,
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
