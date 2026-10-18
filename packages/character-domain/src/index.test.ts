import { describe, expect, it } from "vitest";

import {
  addCurrency,
  adjustWalletCoins,
  adjustWalletCurrency,
  buildElementNames,
  characterDisplayName,
  applyCharacterCommand,
  CharacterTransaction,
  currencyFromCopper,
  currencyFromCopperKeepingLargeCoins,
  currencyToCopper,
  detailsWithLegacyTextStrings,
  duplicateCharacterRecord,
  formatInventoryItemName,
  characterWalletTextKey,
  formatLegacyCurrency,
  inventoryEntryWithQuantity,
  isCharacterRecord,
  isFreeformCharacterDetailTextKey,
  isLegacyCharacterRecordV1,
  isWalletTextKey,
  newCharacterRecord,
  newNativeCharacterRecord,
  parseLegacyCurrency,
  parseCoinAdjustment,
  parseCurrencyAdjustment,
  resolveCharacterWallet,
  subtractCurrency,
  type CharacterBuild,
  type BuildInventoryEntry,
  type CurrencyAmount,
  ZERO_CURRENCY,
} from ".";

const snapshot = {
  details: { name: "Ada" },
  abilities: {},
  stats: {},
  selectedRules: [],
  powers: [],
  loot: [],
  textStrings: {},
  levelCount: 1,
  source: "legacy-cache" as const,
};

const build: CharacterBuild = {
  formatVersion: 1,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "level-1",
        identity: {
          definitionId: "ID_INTERNAL_LEVEL_1",
          name: "1",
          type: "Level",
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
    },
  ],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

const portrait = {
  sourceDataUrl: "data:image/webp;base64,c291cmNl",
  sourceWidth: 800,
  sourceHeight: 1200,
  crop: { x: 0.5, y: 0.4, size: 0.5 },
  renderedDataUrl: "data:image/webp;base64,cmVuZGVyZWQ=",
};

function inventoryEntry(id: string, quantity = 1): BuildInventoryEntry {
  return {
    id,
    acquiredLevel: 1,
    quantity,
    equippedQuantity: 0,
    elements: [{ definitionId: `ITEM_${id}`, name: id, type: "Magic Item" }],
    overrides: {},
    legality: "rules-legal",
  };
}

describe("character records", () => {
  it("creates versioned records and independent duplicates", () => {
    const source = newCharacterRecord(
      { format: "dnd4e", sourceXml: "<D20Character/>" },
      snapshot,
      build,
      { id: "one", now: "2026-01-01T00:00:00.000Z" },
    );
    const copy = duplicateCharacterRecord(
      source,
      "two",
      "2026-01-02T00:00:00.000Z",
    );
    expect(source.title).toBe("Ada");
    expect(copy).toMatchObject({
      id: "two",
      title: "Ada (copy)",
      schemaVersion: 2,
    });
    expect(isCharacterRecord(source)).toBe(true);
  });

  it("validates and duplicates browser-local portrait metadata", () => {
    const source = {
      ...newCharacterRecord(
        { format: "dnd4e", sourceXml: "<D20Character/>" },
        snapshot,
        build,
        { id: "portrait", now: "2026-01-01T00:00:00.000Z" },
      ),
      portrait,
    };
    expect(isCharacterRecord(source)).toBe(true);
    expect(duplicateCharacterRecord(source, "copy").portrait).toEqual(portrait);
    expect(
      isCharacterRecord({
        ...source,
        portrait: { ...portrait, crop: { ...portrait.crop, size: 2 } },
      }),
    ).toBe(false);
    expect(
      isCharacterRecord({
        ...source,
        portrait: { ...portrait, sourceDataUrl: "javascript:alert(1)" },
      }),
    ).toBe(false);
    expect(
      isCharacterRecord({
        ...source,
        portrait: { ...portrait, crop: { ...portrait.crop, x: 0.1 } },
      }),
    ).toBe(false);
  });

  it("creates an exact-profile native level-1 record without legacy cache claims", () => {
    const record = newNativeCharacterRecord(
      "New Hero",
      {
        definitionId: "ID_INTERNAL_LEVEL_1",
        name: "1",
        type: "Level",
      },
      { packId: "private", contentDigest: "digest-1" },
      {
        id: "native-one",
        occurrenceId: "native-level-one",
        now: "2026-09-01T00:00:00.000Z",
      },
    );
    expect(record).toMatchObject({
      id: "native-one",
      title: "New Hero",
      profileBinding: { packId: "private", contentDigest: "digest-1" },
      legacy: { origin: "native", version: "0.07a" },
      snapshot: { source: "native-empty" },
      build: {
        effectiveLevel: 1,
        baseAbilities: {
          Strength: 8,
          Constitution: 10,
          Dexterity: 10,
          Intelligence: 10,
          Wisdom: 10,
          Charisma: 10,
        },
        levels: [
          {
            root: {
              id: "native-level-one",
              identity: { definitionId: "ID_INTERNAL_LEVEL_1" },
            },
          },
        ],
      },
    });
    expect(record.snapshot.stats).toEqual({});
    expect(record.build.textStrings.Name).toBe("New Hero");
    expect(isCharacterRecord(record)).toBe(true);
  });

  it("projects edited legacy detail text into the derived sheet fields", () => {
    expect(
      detailsWithLegacyTextStrings(
        { name: "Old", Traits: "Old traits", Race: "Human" },
        {
          Name: "New",
          "NOTE_Personality Traits": "New traits",
          "NOTE_Mannerisms and Appearance": "",
        },
      ),
    ).toEqual({
      name: "New",
      Traits: "New traits",
      Appearance: "",
      Race: "Human",
    });
  });

  it("rejects unsafe native names and inexact native profiles", () => {
    const level = {
      definitionId: "ID_INTERNAL_LEVEL_1",
      name: "1",
      type: "Level",
    };
    expect(() =>
      newNativeCharacterRecord(" bad\nname ", level, {
        packId: "private",
        contentDigest: "digest-1",
      }),
    ).toThrow("Character name");
    expect(() =>
      newNativeCharacterRecord("Hero", level, { packId: "private" }),
    ).toThrow("exact content profile");
  });

  it("rejects incomplete records and invalid nested authoritative builds", () => {
    const record = newCharacterRecord(
      { format: "dnd4e", sourceXml: "<D20Character/>" },
      snapshot,
      build,
      { id: "validated", now: "2026-01-01T00:00:00.000Z" },
    );
    const { build: _build, ...withoutBuild } = record;
    void _build;
    expect(isCharacterRecord(withoutBuild)).toBe(false);
    expect(
      isCharacterRecord({
        ...record,
        build: {
          ...record.build,
          levels: [
            {
              level: 1,
              root: { ...record.build.levels[0]?.root, children: "invalid" },
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isLegacyCharacterRecordV1({ ...withoutBuild, schemaVersion: 1 }),
    ).toBe(true);
  });

  it("applies atomic commands with undo and redo", () => {
    const transaction = new CharacterTransaction(build);
    transaction.dispatch({
      kind: "set-base-ability",
      ability: "Strength",
      value: 16,
    });
    transaction.dispatch({ kind: "set-text", name: "Player", value: "Ada" });
    expect(transaction.current.baseAbilities.Strength).toBe(16);
    expect(transaction.current.textStrings.Player).toBe("Ada");
    expect(transaction.undo().textStrings.Player).toBeUndefined();
    expect(transaction.redo().textStrings.Player).toBe("Ada");
  });

  it("edits a positional choice without mutating the previous build", () => {
    const choice = {
      id: "choice",
      identity: { definitionId: "FEAT", name: "Feat", type: "Feat" },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const changed = new CharacterTransaction(build).dispatch({
      kind: "choose",
      parentId: "level-1",
      index: 0,
      occurrence: choice,
    });
    expect(build.levels[0]?.root.children).toEqual([]);
    expect(changed.levels[0]?.root.children[0]?.id).toBe("choice");
  });

  it("formats composed magic equipment as a single display name", () => {
    // The +N bonus is a suffix, matching the legacy builder's "Item +X"
    // convention, not a prefix — see docs/implementation-status.md.
    expect(
      formatInventoryItemName([
        { name: "Leather Armor", type: "Armor" },
        { name: "Gloaming Armor +1", type: "Magic Item" },
      ]),
    ).toBe("Gloaming Leather Armor +1");
    expect(
      formatInventoryItemName([
        { name: "Greatbow", type: "Weapon" },
        { name: "Weapon of Speed +2", type: "Magic Item" },
      ]),
    ).toBe("Greatbow of Speed +2");
    expect(
      formatInventoryItemName([
        { name: "Leather Armor", type: "Armor" },
        { name: "Magic Armor +1", type: "Magic Item" },
      ]),
    ).toBe("Leather Armor +1");
    expect(
      formatInventoryItemName([
        { name: "Heavy Shield", type: "Armor" },
        { name: "Storm Shield (heroic tier)", type: "Magic Item" },
      ]),
    ).toBe("Storm Heavy Shield");
    expect(
      formatInventoryItemName([
        { name: "heavy shield", type: "Armor" },
        { name: "storm shield", type: "Magic Item" },
      ]),
    ).toBe("Storm Heavy Shield");
    expect(
      formatInventoryItemName([
        { name: "leather armor", type: "Armor" },
        { name: "gloaming armor +1", type: "Magic Item" },
      ]),
    ).toBe("gloaming leather armor +1");
    expect(
      formatInventoryItemName([
        { name: "Light Shield", type: "Armor" },
        {
          name: "Shield of Deflection (paragon tier)",
          type: "Magic Item",
        },
      ]),
    ).toBe("Light Shield of Deflection");
    expect(
      formatInventoryItemName([
        { name: "Spiked Shield", type: "Armor" },
        { name: "Spellshield (paragon tier)", type: "Magic Item" },
      ]),
    ).toBe("Spellshield Spiked Shield");
    expect(
      formatInventoryItemName([
        { name: "Barbed Shield", type: "Armor" },
        { name: "Tusk Shield", type: "Magic Item" },
      ]),
    ).toBe("Tusk Barbed Shield");
  });

  it("parses, formats, and calculates all five currency denominations", () => {
    const amount = parseLegacyCurrency("1 ad; 2 pp; 1,003 gp; 4 sp; 5 cp");
    expect(amount).toEqual({ ad: 1, pp: 2, gp: 1003, sp: 4, cp: 5 });
    expect(formatLegacyCurrency(amount)).toBe(
      "1 ad; 2 pp; 1003 gp; 4 sp; 5 cp",
    );
    expect(formatLegacyCurrency(currencyFromCopper(0))).toBe("0 gp");
    expect(currencyToCopper(amount)).toBe(1_120_345);
    expect(addCurrency(currencyFromCopper(95), currencyFromCopper(10))).toEqual(
      { ad: 0, pp: 0, gp: 1, sp: 0, cp: 5 },
    );
    expect(
      subtractCurrency(currencyFromCopper(105), currencyFromCopper(6)),
    ).toEqual({ ad: 0, pp: 0, gp: 0, sp: 9, cp: 9 });
    expect(() => parseLegacyCurrency("one gold")).toThrow(
      "Invalid legacy currency",
    );
    expect(() =>
      subtractCurrency(currencyFromCopper(1), currencyFromCopper(2)),
    ).toThrow("Insufficient currency");
  });

  it("keeps explicit large coins while normalizing automatic change through gold", () => {
    expect(
      currencyFromCopperKeepingLargeCoins(1_250_000, {
        ad: 1,
        pp: 5,
        gp: 0,
        sp: 0,
        cp: 0,
      }),
    ).toEqual({ ad: 1, pp: 5, gp: 2000, sp: 0, cp: 0 });
    expect(
      currencyFromCopperKeepingLargeCoins(990_000, {
        ad: 1,
        pp: 5,
        gp: 0,
        sp: 0,
        cp: 0,
      }),
    ).toEqual({ ad: 0, pp: 5, gp: 9400, sp: 0, cp: 0 });
  });

  it("parses one compact signed wallet adjustment exactly", () => {
    expect(parseCurrencyAdjustment("20pp")).toBe(200_000);
    expect(parseCurrencyAdjustment(" -15 gp ")).toBe(-1_500);
    expect(parseCurrencyAdjustment("+73 SP")).toBe(730);
    expect(parseCurrencyAdjustment("0 ad")).toBe(0);
    expect(() => parseCurrencyAdjustment("15")).toThrow("such as");
    expect(() => parseCurrencyAdjustment("1 gp; 2 sp")).toThrow("such as");
    expect(() => parseCurrencyAdjustment("9007199254740991 ad")).toThrow(
      "too large",
    );
  });

  it("credits carried funds and deducts carried before stored atomically", () => {
    const carried = currencyFromCopper(1_000);
    const stored = currencyFromCopper(2_000);
    expect(adjustWalletCurrency(carried, stored, 500)).toEqual({
      carried: currencyFromCopper(1_500),
      stored,
    });
    expect(adjustWalletCurrency(carried, stored, -1_500)).toEqual({
      carried: currencyFromCopper(0),
      stored: currencyFromCopper(1_500),
    });
    expect(() => adjustWalletCurrency(carried, stored, -3_001)).toThrow(
      "Not enough funds",
    );
    expect(() =>
      adjustWalletCurrency(carried, stored, Number.MAX_SAFE_INTEGER),
    ).toThrow("too large");
  });

  it("inherits the latest legacy wallet text at or below the requested level", () => {
    const leveled: CharacterBuild = {
      ...build,
      effectiveLevel: 4,
      textStrings: {
        "_PER_LEVEL_1_Carried Money": "5 gp",
        "_PER_LEVEL_1_Stored Money": "20 gp",
        "_PER_LEVEL_3_Carried Money": "2 gp; 5 sp",
        "_PER_LEVEL_5_Carried Money": "99 gp",
      },
    };
    expect(resolveCharacterWallet(leveled, "carried")).toEqual({
      amount: { ad: 0, pp: 0, gp: 2, sp: 5, cp: 0 },
      sourceLevel: 3,
    });
    expect(resolveCharacterWallet(leveled, "stored")).toEqual({
      amount: { ad: 0, pp: 0, gp: 20, sp: 0, cp: 0 },
      sourceLevel: 1,
    });
    expect(resolveCharacterWallet(leveled, "carried", 2).sourceLevel).toBe(1);
  });

  it("recognizes wallet text keys and nothing else", () => {
    expect(isWalletTextKey(characterWalletTextKey(1, "carried"))).toBe(true);
    expect(isWalletTextKey(characterWalletTextKey(30, "stored"))).toBe(true);
    expect(isWalletTextKey("_PER_LEVEL_1_Sneak Attack Die")).toBe(false);
    expect(isWalletTextKey("Name")).toBe(false);
    expect(isWalletTextKey("_PER_LEVEL_1_Carried Money Extra")).toBe(false);
  });

  it("recognizes freeform character detail/note keys and nothing else", () => {
    expect(isFreeformCharacterDetailTextKey("Name")).toBe(true);
    expect(isFreeformCharacterDetailTextKey("Player")).toBe(true);
    expect(isFreeformCharacterDetailTextKey("Age")).toBe(true);
    expect(
      isFreeformCharacterDetailTextKey("NOTE_Session and Campaign Notes"),
    ).toBe(true);
    expect(isFreeformCharacterDetailTextKey("_INTERNAL_MainHandWeapon")).toBe(
      false,
    );
    expect(isFreeformCharacterDetailTextKey("Sneak Attack Die")).toBe(false);
    expect(
      isFreeformCharacterDetailTextKey(characterWalletTextKey(1, "carried")),
    ).toBe(false);
  });

  it("equips exact holdings across slots and synchronizes equipped counts", () => {
    const weapon = {
      ...inventoryEntry("weapon", 2),
      equippedQuantity: 1,
      equippedSlots: [
        { slot: "main-hand" as const, quantityIndex: 0 },
        { slot: "off-hand" as const, quantityIndex: 0 },
      ],
    };
    const rings = {
      ...inventoryEntry("rings", 2),
      equippedQuantity: 1,
      equippedSlots: [{ slot: "ring-1" as const, quantityIndex: 0 }],
    };
    const equipped = applyCharacterCommand(
      { ...build, inventory: [weapon, rings] },
      {
        kind: "equip-inventory",
        entryId: "rings",
        assignments: [
          { slot: "ring-1", quantityIndex: 0 },
          { slot: "main-hand", quantityIndex: 1 },
          { slot: "off-hand", quantityIndex: 1 },
        ],
      },
    );
    expect(equipped.inventory[0]).toMatchObject({
      id: "weapon",
      equippedQuantity: 0,
      equippedSlots: [],
    });
    expect(equipped.inventory[1]).toMatchObject({
      id: "rings",
      equippedQuantity: 2,
    });
    expect(equipped.inventory[1]?.equippedSlots).toHaveLength(3);
    expect(weapon.equippedSlots).toHaveLength(2);

    const sold = applyCharacterCommand(equipped, {
      kind: "sell-inventory",
      entryId: "rings",
      priceCopper: 100,
      percentage: 20,
    });
    expect(sold.inventory[1]).toMatchObject({
      id: "rings",
      quantity: 1,
      equippedQuantity: 1,
      equippedSlots: [{ slot: "ring-1", quantityIndex: 0 }],
    });
  });

  it("retains equipped copies first and preserves inventory row order", () => {
    const first = inventoryEntry("first");
    const rings = {
      ...inventoryEntry("rings", 3),
      equippedQuantity: 1,
      equippedSlots: [{ slot: "ring-1" as const, quantityIndex: 2 }],
    };
    const last = inventoryEntry("last");
    const updated = applyCharacterCommand(
      { ...build, inventory: [first, rings, last] },
      {
        kind: "put-inventory",
        entry: inventoryEntryWithQuantity(rings, 2),
      },
    );
    expect(updated.inventory.map(({ id }) => id)).toEqual([
      "first",
      "rings",
      "last",
    ]);
    expect(updated.inventory[1]).toMatchObject({
      quantity: 2,
      equippedQuantity: 1,
      equippedSlots: [{ slot: "ring-1", quantityIndex: 1 }],
    });

    const removed = applyCharacterCommand(updated, {
      kind: "put-inventory",
      entry: inventoryEntryWithQuantity(updated.inventory[1]!, 0),
    });
    expect(removed.inventory.map(({ id }) => id)).toEqual(["first", "last"]);
  });

  it("purchases from carried then stored money and sells the exact holding", () => {
    const leveled: CharacterBuild = {
      ...build,
      effectiveLevel: 4,
      textStrings: {
        "_PER_LEVEL_1_Carried Money": "8 gp",
        "_PER_LEVEL_1_Stored Money": "10 gp",
        "_PER_LEVEL_3_Carried Money": "1 gp",
      },
    };
    const purchased = applyCharacterCommand(leveled, {
      kind: "purchase-inventory",
      entry: inventoryEntry("arrows", 2),
      priceCopper: 100,
    });
    expect(purchased.inventory.map(({ id }) => id)).toEqual(["arrows"]);
    expect(purchased.textStrings).toMatchObject({
      "_PER_LEVEL_1_Carried Money": "8 gp",
      "_PER_LEVEL_1_Stored Money": "10 gp",
      "_PER_LEVEL_3_Carried Money": "1 gp",
      "_PER_LEVEL_4_Carried Money": "0 gp",
      "_PER_LEVEL_4_Stored Money": "9 gp",
    });
    expect(purchased.textStrings["Carried Money"]).toBeUndefined();

    const sold = applyCharacterCommand(purchased, {
      kind: "sell-inventory",
      entryId: "arrows",
      priceCopper: 100,
      percentage: 50,
    });
    expect(sold.inventory).toMatchObject([{ id: "arrows", quantity: 1 }]);
    expect(sold.textStrings["_PER_LEVEL_4_Carried Money"]).toBe("5 sp");
    expect(sold.textStrings["_PER_LEVEL_4_Stored Money"]).toBe("9 gp");

    const soldAgain = applyCharacterCommand(sold, {
      kind: "sell-inventory",
      entryId: "arrows",
      priceCopper: 100,
      percentage: 50,
    });
    expect(soldAgain.inventory).toEqual([]);
    expect(soldAgain.textStrings["_PER_LEVEL_4_Carried Money"]).toBe("1 gp");
  });

  it("can keep automatic purchase and sale normalization in gold", () => {
    const wealthy: CharacterBuild = {
      ...build,
      textStrings: { "_PER_LEVEL_1_Carried Money": "1 ad; 10000 gp" },
      inventory: [inventoryEntry("gem")],
    };
    const sold = applyCharacterCommand(wealthy, {
      kind: "sell-inventory",
      entryId: "gem",
      priceCopper: 20_000,
      percentage: 100,
      keepLargeAmountsInGold: true,
    });
    expect(sold.textStrings["_PER_LEVEL_1_Carried Money"]).toBe(
      "1 ad; 10200 gp",
    );
    const purchased = applyCharacterCommand(sold, {
      kind: "purchase-inventory",
      entry: inventoryEntry("purchase"),
      priceCopper: 1_110_000,
      keepLargeAmountsInGold: true,
    });
    expect(purchased.textStrings["_PER_LEVEL_1_Carried Money"]).toBe("9100 gp");
  });

  it("rejects invalid inventory transactions before changing a build", () => {
    const funded: CharacterBuild = {
      ...build,
      textStrings: { "_PER_LEVEL_1_Carried Money": "1 gp" },
    };
    expect(() =>
      applyCharacterCommand(funded, {
        kind: "purchase-inventory",
        entry: inventoryEntry("too-many", 2),
        priceCopper: 100,
      }),
    ).toThrow("Insufficient currency");
    expect(funded.inventory).toEqual([]);
    expect(() =>
      applyCharacterCommand(
        { ...funded, inventory: [inventoryEntry("zero", 0)] },
        {
          kind: "sell-inventory",
          entryId: "zero",
          priceCopper: 100,
          percentage: 20,
        },
      ),
    ).toThrow("Sale count");
    expect(() =>
      applyCharacterCommand(
        { ...funded, inventory: [inventoryEntry("one")] },
        {
          kind: "equip-inventory",
          entryId: "one",
          assignments: [{ slot: "head", quantityIndex: 1 }],
        },
      ),
    ).toThrow("quantity index");
    expect(() =>
      applyCharacterCommand(funded, {
        kind: "purchase-inventory",
        entry: inventoryEntry("bad-price"),
        priceCopper: 0.5,
      }),
    ).toThrow("Price");
    expect(() =>
      applyCharacterCommand(
        { ...funded, inventory: [inventoryEntry("one")] },
        {
          kind: "sell-inventory",
          entryId: "one",
          priceCopper: 100,
          percentage: 25 as 20,
        },
      ),
    ).toThrow("Sale percentage");
  });

  it("keeps the historical occurrence when retraining into a later frame", () => {
    const oldChoice = {
      id: "old-feat",
      identity: { definitionId: "OLD", name: "Old", type: "Feat" },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const withHistory: CharacterBuild = {
      ...build,
      levels: [
        {
          ...build.levels[0]!,
          root: { ...build.levels[0]!.root, children: [oldChoice] },
        },
        {
          level: 2,
          root: {
            ...build.levels[0]!.root,
            id: "level-2",
            acquiredLevel: 2,
            children: [],
          },
        },
      ],
    };
    const changed = new CharacterTransaction(withHistory).dispatch({
      kind: "retrain",
      parentId: "level-2",
      index: 0,
      replacesId: "old-feat",
      replacement: { ...oldChoice, id: "new-feat", acquiredLevel: 2 },
    });
    expect(changed.levels[0]?.root.children[0]?.id).toBe("old-feat");
    expect(changed.levels[1]?.root.children[0]).toMatchObject({
      id: "new-feat",
      replacesId: "old-feat",
    });
  });
});

describe("coin-aware wallet adjustments", () => {
  const coins = (overrides: Partial<CurrencyAmount> = {}): CurrencyAmount => ({
    ...ZERO_CURRENCY,
    ...overrides,
  });

  it("parses the coin and signed count typed", () => {
    expect(parseCoinAdjustment("-1pp")).toEqual({ coin: "pp", count: -1 });
    expect(parseCoinAdjustment(" 20 GP ")).toEqual({ coin: "gp", count: 20 });
    expect(() => parseCoinAdjustment("lots")).toThrow();
  });

  it("spends and adds the typed coin without converting others", () => {
    const carried = coins({ pp: 3, gp: 250 });
    expect(
      adjustWalletCoins(carried, ZERO_CURRENCY, { coin: "pp", count: -1 }),
    ).toEqual({ carried: coins({ pp: 2, gp: 250 }), stored: ZERO_CURRENCY });
    expect(
      adjustWalletCoins(carried, ZERO_CURRENCY, { coin: "sp", count: 5 }),
    ).toEqual({
      carried: coins({ pp: 3, gp: 250, sp: 5 }),
      stored: ZERO_CURRENCY,
    });
  });

  it("spends carried coins before stored ones", () => {
    expect(
      adjustWalletCoins(coins({ gp: 10 }), coins({ gp: 50 }), {
        coin: "gp",
        count: -30,
      }),
    ).toEqual({ carried: coins(), stored: coins({ gp: 30 }) });
  });

  it("makes change only for a shortfall, breaking the nearest larger coin", () => {
    expect(
      adjustWalletCoins(coins({ ad: 1, pp: 1, gp: 5 }), ZERO_CURRENCY, {
        coin: "gp",
        count: -15,
      }),
    ).toEqual({
      // 5 gp spent, then 1 pp broken for the other 10 gp: 90 gp change.
      carried: coins({ ad: 1, gp: 90 }),
      stored: ZERO_CURRENCY,
    });
    expect(
      adjustWalletCoins(coins({ sp: 25 }), ZERO_CURRENCY, {
        coin: "gp",
        count: -2,
      }),
    ).toEqual({ carried: coins({ sp: 5 }), stored: ZERO_CURRENCY });
    expect(() =>
      adjustWalletCoins(coins({ gp: 1 }), ZERO_CURRENCY, {
        coin: "pp",
        count: -1,
      }),
    ).toThrow("Not enough funds");
  });
});

describe("characterDisplayName", () => {
  it("prefers the edited build name over the import-time title", () => {
    expect(
      characterDisplayName({
        build: { ...build, textStrings: { Name: "Ingi the Bold" } },
        title: "Ingi",
      }),
    ).toBe("Ingi the Bold");
  });

  it("falls back to the title when the build name is blank", () => {
    expect(
      characterDisplayName({
        build: { ...build, textStrings: { Name: "  " } },
        title: "Ingi",
      }),
    ).toBe("Ingi");
  });
});

describe("buildElementNames", () => {
  it("reads selected element names from the build up to its level", () => {
    expect(buildElementNames(build, "Level")).toEqual(["1"]);
    expect(buildElementNames({ ...build, effectiveLevel: 0 }, "Level")).toEqual(
      [],
    );
  });
});
