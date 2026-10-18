import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type { BuildInventoryEntry } from "@4ecb/character-domain";

import {
  ItemDetail,
  catalogItemDetail,
  inventoryEquippedStatus,
  inventoryItemDetail,
  walletDisplayCurrency,
} from "./EquipmentWorkspace";

function entity(
  id: string,
  name: string,
  type: string,
  source: string,
  specifics: Readonly<Record<string, string>>,
  rules: readonly RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source,
    sources: [source],
    attributes: [],
    categories: [],
    flavor: `${name} flavor.`,
    description: `${name} description.`,
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules,
    extensions: [],
    provenance: { sourceKey: "public-composed-item", sourceOrdinal: 0 },
  };
}

describe("equipment item details", () => {
  it("keeps explicit large coins while showing lower overflow as gold", () => {
    const wallet = {
      carried: {
        copper: 0,
        silver: 0,
        gold: 10_000,
        platinum: 2,
        astral: 1,
      },
      stored: {
        copper: 0,
        silver: 0,
        gold: 5_000,
        platinum: 3,
        astral: 0,
      },
    };
    expect(walletDisplayCurrency(wallet, true)).toEqual({
      ad: 1,
      pp: 5,
      gp: 15_000,
      sp: 0,
      cp: 0,
    });
    expect(walletDisplayCurrency(wallet, false)).toEqual({
      ad: 2,
      pp: 55,
      gp: 0,
      sp: 0,
      cp: 0,
    });
  });

  it("shows equipped state without turning ordinary single copies into counts", () => {
    const entry: BuildInventoryEntry = {
      id: "item",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 1,
      equippedSlots: [{ slot: "body", quantityIndex: 0 }],
      elements: [],
      overrides: {},
      legality: "rules-legal",
    };
    expect(inventoryEquippedStatus(entry)).toBe("Equipped");
    expect(
      inventoryEquippedStatus({
        id: "historical-item",
        acquiredLevel: 1,
        quantity: 3,
        equippedQuantity: 2,
        elements: [],
        overrides: {},
        legality: "rules-legal",
      }),
    ).toBe("2/3 equipped · slots unknown");
    expect(
      inventoryEquippedStatus({ ...entry, equippedQuantity: 0 }),
    ).toBeUndefined();
  });

  it("uses the physical shield identity for a composed magic shield header", () => {
    const base = entity("SHIELD", "Heavy Shield", "Armor", "A", {
      "Armor Type": "Shield",
      "Item Slot": "Off-hand",
    });
    const enchantment = entity(
      "HAMMER_SHIELD",
      "Hammer Shield",
      "Magic Item",
      "B",
      {
        "Magic Item Type": "Arms Slot Item",
        "Item Slot": "Arms",
        Level: "8",
        Gold: "3400",
        Rarity: "Uncommon",
        Armor: "Shield",
        Property: "Gain a defensive benefit.",
        "Full Text": "Duplicated shield text.",
      },
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [base, enchantment],
          displayName: "Hammer Heavy Shield",
        },
        byId: new Map(
          [base, enchantment].map((item) => [
            item.id.toLocaleLowerCase(),
            item,
          ]),
        ),
      }),
    );

    // The builder shows the sheet's item card for the composed item (D079).
    expect(markup).toContain("print-item-card is-panel");
    expect(markup).toContain("Hammer Heavy Shield");
    expect(markup).toContain("lucide-shield");
    expect(markup).not.toContain("lucide-biceps-flexed");
    expect(markup).toContain("<span>Armor</span>");
    expect(markup).toContain("Level 8");
    expect(markup).not.toContain("Heavy Shield</h");
    expect(markup).not.toContain("Duplicated shield text.");
    expect(markup).not.toContain("Weapon:");
    expect(markup).toContain("Gain a defensive benefit.");
    expect(markup).toContain("3400 gp");
    expect(markup).toContain("Sources: A; B");
  });

  it("renders composed body armor as one unified physical and magical card", () => {
    const base = entity("PLATE", "Plate Armor", "Armor", "Physical source", {
      "Armor Bonus": "8",
      Check: "-2",
      Speed: "-1",
      "Armor Category": "Plate",
      "Armor Type": "Heavy",
      "Item Slot": "Body",
      Weight: "50",
    });
    const enchantment = entity(
      "BLOODIRON",
      "Bloodiron Armor +2",
      "Magic Item",
      "Magic source",
      {
        "Magic Item Type": "Armor",
        Level: "8",
        Enhancement: "+2 AC",
        Gold: "3400",
        Rarity: "Uncommon",
        Armor: "Scale, Plate",
        Property: "Reward an aggressive wearer.",
        "Full Text": "Duplicated armor text.",
      },
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [base, enchantment],
          displayName: "Bloodiron Plate Armor +2",
        },
        byId: new Map(
          [base, enchantment].map((item) => [
            item.id.toLocaleLowerCase(),
            item,
          ]),
        ),
      }),
    );

    expect(markup).toContain("print-item-card is-panel");
    expect(markup).toContain("Bloodiron Plate Armor +2");
    expect(markup).toContain("<span>Armor</span>");
    expect(markup).toContain("Level 8");
    expect(markup).toContain("lucide-shirt");
    expect(markup).toContain("<dt>AC bonus</dt>");
    expect(markup.indexOf("+2 AC")).toBeLessThan(
      markup.indexOf("Reward an aggressive wearer."),
    );
    expect(markup).toContain("50 lb");
    expect(markup).toContain("3400 gp");
    expect(markup).not.toContain("Plate Armor</h");
    expect(markup).not.toContain("Scale, Plate");
    expect(markup).not.toContain("Duplicated armor text.");
    expect(markup).toContain("Reward an aggressive wearer.");
    expect(markup).toContain("Sources: Physical source; Magic source");
    expect(markup.match(/detail-source-note/g)).toHaveLength(1);
  });

  it("renders an owned base item before its enchantment under one composed title", () => {
    const base = entity(
      "PUBLIC_BASE",
      "Public Warhammer",
      "Weapon",
      "Public base source",
      {
        "Proficiency Bonus": "+2",
        Damage: "1d10",
        "Weapon Category": "Military melee",
        "Hands Required": "One-handed",
        Group: "Hammer",
        Weight: "5 lb.",
        Properties: "Versatile",
      },
    );
    const enchantment = entity(
      "PUBLIC_ENCHANTMENT",
      "Protective Weapon +2",
      "Magic Item",
      "Public enchantment source",
      {
        "Magic Item Type": "Weapon",
        Level: "7",
        Gold: "2600",
        Rarity: "Common",
        Critical: "+2d6 damage",
        Weapon: "Any",
        "Item Slot": "Off-hand",
        Enhancement: "+2 attack rolls and damage rolls",
        Property: "Gain a defensive benefit.",
        "Full Text": "Damage: 1d10. Group: Hammer.",
      },
    );
    const byId = new Map(
      [base, enchantment].map((item) => [item.id.toLocaleLowerCase(), item]),
    );

    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [base, enchantment],
          displayName: "Protective Public Warhammer +2",
        },
        byId,
      }),
    );

    expect(markup).toContain("print-item-card is-panel");
    expect(markup).toContain("Protective Public Warhammer +2");
    expect(markup).toContain("<span>Weapon</span>");
    expect(markup).toContain("Level 7");
    expect(markup).not.toContain("Public Warhammer</h");
    expect(markup.indexOf("1d10")).toBeLessThan(
      markup.indexOf("Gain a defensive benefit."),
    );
    expect(markup).toContain("<dt>Proficiency</dt>");
    expect(markup).toContain("<dt>Crit</dt>");
    expect(markup).toContain("+2d6");
    expect(markup).not.toContain("+2d6 damage");
    expect(markup).toContain("<dt>Properties</dt>");
    expect(markup).toContain("2600 gp");
    expect(markup).toContain("+2 attack rolls and damage rolls");
    expect(markup).not.toContain("Weapon: Any");
    expect(markup).not.toContain("Damage: 1d10. Group: Hammer.");
    expect(markup).toContain(
      "Sources: Public base source; Public enchantment source",
    );
    expect(markup.match(/detail-source-note/g)).toHaveLength(1);
  });

  it("preserves both definitions through inventory, loadout, and shop inspection", () => {
    const base = entity("PUBLIC_BASE", "Public Warhammer", "Weapon", "A", {});
    const enchantment = entity(
      "PUBLIC_MAGIC",
      "Protective Weapon +2",
      "Magic Item",
      "B",
      { "Magic Item Type": "Weapon", Level: "7" },
    );
    const byId = new Map(
      [base, enchantment].map((item) => [item.id.toLocaleLowerCase(), item]),
    );
    const entry: BuildInventoryEntry = {
      id: "owned-item",
      acquiredLevel: 7,
      quantity: 1,
      equippedQuantity: 1,
      equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
      elements: [
        { definitionId: base.id, name: base.name, type: base.type },
        {
          definitionId: enchantment.id,
          name: enchantment.name,
          type: enchantment.type,
        },
      ],
      overrides: {},
      legality: "rules-legal",
    };

    const inventoryOrLoadout = inventoryItemDetail(entry, byId);
    const shop = catalogItemDetail(enchantment, base, 7, byId);
    expect(inventoryOrLoadout?.entities).toEqual([base, enchantment]);
    expect(shop.entities).toEqual([base, enchantment]);
    expect(inventoryOrLoadout?.displayName).toBe(
      "Protective Public Warhammer +2",
    );
    expect(shop.displayName).toBe("Protective Public Warhammer +2");
  });

  it("keeps an ordinary one-record item on the same shared detail path", () => {
    const item = entity(
      "PUBLIC_GEAR",
      "Public Adventuring Gear",
      "Gear",
      "Public gear source",
      { Weight: "1 lb." },
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: { entities: [item], displayName: item.name },
        byId: new Map([[item.id.toLocaleLowerCase(), item]]),
      }),
    );

    expect(markup).toContain("Public Adventuring Gear");
    expect(markup).not.toContain("composed-weapon-card");
    expect(markup).not.toContain("composed-item-details");
    expect(markup).toContain("Source: Public gear source");
  });

  it("shows the highest usable item created by an alchemical formula", () => {
    const formula = entity(
      "PUBLIC_FORMULA",
      "Public Formula",
      "Ritual",
      "Public formula source",
      {
        type: "Alchemical Formula",
        Level: "1",
        _RELATED_ITEMS: "PUBLIC_ITEM_1,PUBLIC_ITEM_6,PUBLIC_ITEM_11",
      },
    );
    const related = [1, 6, 11].map((level) =>
      entity(
        `PUBLIC_ITEM_${level}`,
        `Public Alchemical Item (level ${level})`,
        "Magic Item",
        "Public item source",
        { "Magic Item Type": "Alchemical", Level: String(level) },
      ),
    );
    const byId = new Map(
      [formula, ...related].map((item) => [item.id.toLocaleLowerCase(), item]),
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [formula],
          displayName: formula.name,
          effectiveLevel: 8,
        },
        byId,
      }),
    );

    expect(markup).toContain("Public Formula");
    expect(markup).toContain("Public Alchemical Item (level 6)");
    expect(markup).not.toContain("Public Alchemical Item (level 11)");
    expect(markup).not.toContain("Creates");
    expect(markup.match(/print-item-card is-panel/g)).toHaveLength(2);
  });

  it("leads an uncomposed enchantment's descriptors with its own compatible-type field", () => {
    const enchantment = entity(
      "PUBLIC_ENCHANT",
      "Public Weapon of Testing +1",
      "Magic Item",
      "Public source",
      {
        "Magic Item Type": "Weapon",
        Level: "1",
        Weapon: "Heavy blade",
        Rarity: "Common",
      },
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [enchantment],
          displayName: enchantment.name,
        },
        byId: new Map([[enchantment.id.toLocaleLowerCase(), enchantment]]),
      }),
    );

    expect(markup).not.toContain("shop-detail-compatibility");
    // Without a physical base, the card names what the enchantment fits.
    expect(markup).toContain("Weapon: Heavy blade");
  });

  it("resolves an item-owned choice's chosen entity for the detail view", () => {
    const base = entity(
      "PUBLIC_PLATE",
      "Public Plate",
      "Armor",
      "Public source",
      {},
    );
    const enchantment = entity(
      "SOUL_ARMOR",
      "Soul Armor of Probing +2",
      "Magic Item",
      "Public source",
      { "Magic Item Type": "Armor", Level: "1" },
    );
    const power = entity(
      "FIREHEART",
      "Fireheart Blast",
      "Power",
      "Public source",
      { "Power Usage": "Encounter", "Power Type": "Standard", Level: "1" },
    );
    const byId = new Map(
      [base, enchantment, power].map((item) => [
        item.id.toLocaleLowerCase(),
        item,
      ]),
    );
    const entry: BuildInventoryEntry = {
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
          children: [
            {
              id: "web:choice",
              identity: {
                definitionId: power.id,
                name: power.name,
                type: power.type,
              },
              acquiredLevel: 1,
              legality: "rules-legal" as const,
              children: [],
              unresolved: false,
            },
          ],
        },
      ],
      overrides: {},
      legality: "rules-legal",
    };

    const detail = inventoryItemDetail(entry, byId);

    expect(detail?.resolvedChoiceEntities).toEqual([power]);
  });

  it("shows an item-owned choice's chosen Power as a sibling card, not nested inside the item's own card", () => {
    const base = entity(
      "PUBLIC_PLATE",
      "Public Plate",
      "Armor",
      "Public source",
      {},
    );
    const enchantment = entity(
      "SOUL_ARMOR",
      "Soul Armor of Probing +2",
      "Magic Item",
      "Public source",
      { "Magic Item Type": "Armor", Level: "1" },
    );
    const power = entity(
      "FIREHEART",
      "Fireheart Blast",
      "Power",
      "Public source",
      { "Power Usage": "Encounter", "Power Type": "Standard", Level: "1" },
    );
    const byId = new Map(
      [base, enchantment, power].map((item) => [
        item.id.toLocaleLowerCase(),
        item,
      ]),
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [base, enchantment],
          displayName: "Soul Public Plate of Probing +2 (Fireheart Blast)",
          resolvedChoiceEntities: [power],
        },
        byId,
      }),
    );

    expect(markup).toContain("Fireheart Blast");
    expect(markup).toContain("candidate-detail-stack");
    expect(markup).toContain("print-power-card is-panel");
    // The Power's card must come after the item card's own </article> —
    // a sibling in .candidate-detail-stack, the same way a granted power
    // shown in the Build choice inspector is a sibling of the entity that
    // grants it, never nested inside that entity's own card.
    const primaryCardCloseIndex = markup.indexOf("</article>");
    const powerCardIndex = markup.indexOf("print-power-card is-panel");
    expect(primaryCardCloseIndex).toBeGreaterThan(-1);
    expect(powerCardIndex).toBeGreaterThan(primaryCardCloseIndex);
  });

  it("does not show a nested card for a simple (non-power) resolved choice", () => {
    const enchantment = entity(
      "PROBING_ARMOR",
      "Armor of Probing +2",
      "Magic Item",
      "Public source",
      { "Magic Item Type": "Armor", Level: "1" },
    );
    const fire = entity(
      "FIRE",
      "Armor of Probing +2 (Fire)",
      "Class Feature",
      "Public source",
      {},
    );
    const byId = new Map(
      [enchantment, fire].map((item) => [item.id.toLocaleLowerCase(), item]),
    );
    const markup = renderToStaticMarkup(
      createElement(ItemDetail, {
        item: {
          entities: [enchantment],
          displayName: "Armor of Probing +2 (Fire)",
          resolvedChoiceEntities: [fire],
        },
        byId,
      }),
    );

    expect(markup).not.toContain("print-power-card");
  });
});
