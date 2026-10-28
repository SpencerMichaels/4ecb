import { describe, expect, it } from "vitest";
import {
  applyCharacterCommand,
  boundAugmentHolding,
  currentInventoryHoldings,
  parseLegacyLootId,
  serializeLegacyLootId,
  isCharacterRecord,
  isCharacterRecordWithBuildV2,
  newCharacterRecord,
  settleInventory,
  upgradeCharacterBuild,
  type BuildInventoryEntry,
  type CharacterBuild,
  type CharacterBuildV2,
} from "./index";

function row(
  id: string,
  level: number,
  item: string,
  quantity: number,
  equippedQuantity: number,
  extra: Partial<BuildInventoryEntry> = {},
): BuildInventoryEntry {
  const elements =
    item === "gouge"
      ? [
          { definitionId: "ID_GOUGE", name: "Gouge", type: "Weapon" },
          {
            definitionId: "ID_WAY_LEADER",
            name: "Way-Leader Weapon +1",
            type: "Magic Item",
          },
        ]
      : [
          {
            definitionId: `ID_${item.toUpperCase()}`,
            name: item,
            type: "Gear",
          },
        ];
  return {
    id,
    acquiredLevel: level,
    quantity,
    equippedQuantity,
    elements,
    showPowerCard: true,
    overrides: {},
    legality: "rules-legal",
    ...extra,
  };
}

/** Hu Sheng-Ming's pattern: level 5 purchases, level 6 swaps and a sale. */
const huHistory: readonly BuildInventoryEntry[] = [
  row("legacy:loot:5:0", 5, "gouge", 1, 1),
  row("legacy:loot:5:1", 5, "belt", 1, 1),
  row("legacy:loot:5:2", 5, "symbol", 1, 0),
  row("legacy:loot:6:0", 6, "belt", -1, -1),
  row("legacy:loot:6:1", 6, "gouge", 0, -1),
  row("legacy:loot:6:2", 6, "symbol", 0, 1),
  row("legacy:loot:7:0", 7, "sunrod", 0, 0),
];

const base: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 8,
  levels: [],
  grabbag: [],
  inventory: [],
  known: [],
  alternates: [],
  baseAbilities: {},
  textStrings: { "_PER_LEVEL_8_Carried Money": "100 gp" },
};

function settled(): CharacterBuild {
  return { ...base, ...settleInventory(huHistory) };
}

function holding(build: CharacterBuild, name: string) {
  return build.inventory.find((entry) =>
    entry.elements.some((element) => element.name === name),
  );
}

describe("current inventory holdings (D097)", () => {
  it("folds per-level loot into what the character owns now", () => {
    const build = settled();
    expect(
      build.inventory.map(({ id, quantity, equippedQuantity }) => [
        id,
        quantity,
        equippedQuantity,
      ]),
    ).toEqual([
      ["legacy:loot:5:0", 1, 0],
      ["legacy:loot:5:2", 1, 1],
    ]);
    expect(holding(build, "belt")).toBeUndefined();
    // The original transactions are kept verbatim for export.
    expect(build.inventoryHistory).toBe(huHistory);
  });

  it("equips a historical purchase so the current state changes", () => {
    const equipped = applyCharacterCommand(settled(), {
      kind: "equip-inventory",
      entryId: "legacy:loot:5:0",
      assignments: [
        { slot: "main-hand", quantityIndex: 0 },
        { slot: "off-hand", quantityIndex: 0 },
      ],
    });
    expect(holding(equipped, "Gouge")).toMatchObject({
      quantity: 1,
      equippedQuantity: 1,
      equippedSlots: [
        { slot: "main-hand", quantityIndex: 0 },
        { slot: "off-hand", quantityIndex: 0 },
      ],
    });
    // Unequipping returns it to carried, still owned.
    const unequipped = applyCharacterCommand(equipped, {
      kind: "equip-inventory",
      entryId: "legacy:loot:5:0",
      assignments: [],
    });
    expect(holding(unequipped, "Gouge")).toMatchObject({
      quantity: 1,
      equippedQuantity: 0,
    });
    expect(unequipped.inventoryHistory).toBe(huHistory);
  });

  it("buys a sold-off item again as a new holding", () => {
    const bought = applyCharacterCommand(settled(), {
      kind: "purchase-inventory",
      entry: row("web:belt", 8, "belt", 1, 0),
      priceCopper: 5000,
    });
    expect(holding(bought, "belt")).toMatchObject({
      id: "web:belt",
      quantity: 1,
      equippedQuantity: 0,
    });
    expect(bought.textStrings["_PER_LEVEL_8_Carried Money"]).toBe("50 gp");
  });

  it("adds a repeated purchase to the owned holding, keeping its slots", () => {
    const owned: CharacterBuild = {
      ...base,
      inventory: [
        row("dagger", 1, "dagger", 1, 1, {
          equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
        }),
      ],
    };
    const bought = applyCharacterCommand(owned, {
      kind: "purchase-inventory",
      entry: row("dagger-2", 8, "dagger", 2, 0),
      priceCopper: 200,
    });
    expect(bought.inventory).toHaveLength(1);
    expect(bought.inventory[0]).toMatchObject({
      id: "dagger",
      quantity: 3,
      equippedQuantity: 1,
      equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
    });
    const sold = applyCharacterCommand(bought, {
      kind: "sell-inventory",
      entryId: "dagger",
      priceCopper: 200,
      percentage: 50,
    });
    expect(sold.inventory[0]).toMatchObject({ quantity: 2 });
    const fewer = applyCharacterCommand(sold, {
      kind: "put-inventory",
      entry: {
        ...sold.inventory[0]!,
        quantity: 0,
        equippedQuantity: 0,
        equippedSlots: [],
      },
    });
    expect(fewer.inventory).toEqual([]);
  });

  it("joins an edited holding that becomes another owned item", () => {
    const build: CharacterBuild = {
      ...base,
      inventory: [row("a", 1, "rope", 1, 0), row("b", 2, "torch", 2, 0)],
    };
    const edited = applyCharacterCommand(build, {
      kind: "put-inventory",
      entry: { ...row("b", 2, "rope", 2, 0) },
    });
    expect(edited.inventory.map(({ id, quantity }) => [id, quantity])).toEqual([
      ["a", 3],
    ]);
  });

  it("keeps an over-equipped sum owned and drops what sums to nothing", () => {
    const holdings = currentInventoryHoldings([
      row("x:1", 1, "torch", 0, 1),
      row("x:2", 1, "sunrod", 2, 0),
      row("x:3", 3, "sunrod", -2, 0),
      row("x:4", 4, "rope", 0, -1),
    ]);
    expect(
      holdings.map(({ id, quantity, equippedQuantity }) => [
        id,
        quantity,
        equippedQuantity,
      ]),
    ).toEqual([["x:1", 1, 1]]);
  });

  it("re-indexes exact slots when concrete duplicates merge", () => {
    const holdings = currentInventoryHoldings([
      row("r:1", 1, "ring", 1, 1, {
        equippedSlots: [{ slot: "ring-1", quantityIndex: 0 }],
      }),
      row("r:2", 2, "ring", 2, 1, {
        equippedSlots: [{ slot: "ring-2", quantityIndex: 1 }],
      }),
    ]);
    expect(holdings).toEqual([
      expect.objectContaining({
        id: "r:1",
        quantity: 3,
        equippedQuantity: 2,
        equippedSlots: [
          { slot: "ring-1", quantityIndex: 0 },
          { slot: "ring-2", quantityIndex: 2 },
        ],
      }),
    ]);
    const current = [row("solo", 1, "rope", 1, 0)];
    expect(currentInventoryHoldings(current)).toBe(current);
  });

  it("upgrades a format-2 build idempotently and validates its history", () => {
    const { inventoryHistory: _history, ...rest } = base;
    void _history;
    const v2: CharacterBuildV2 = {
      ...rest,
      formatVersion: 2,
      inventory: huHistory,
    };
    const upgraded = upgradeCharacterBuild(v2);
    expect(upgraded.formatVersion).toBe(3);
    expect(upgraded.inventory).toEqual(settled().inventory);
    expect(upgraded.inventoryHistory).toEqual(huHistory);
    expect(upgradeCharacterBuild(upgraded)).toBe(upgraded);
    // A build of concrete holdings records no history.
    const plain = upgradeCharacterBuild({
      ...v2,
      inventory: [row("rope", 1, "rope", 1, 0)],
    });
    expect(plain.inventoryHistory).toBeUndefined();

    const record = newCharacterRecord(
      { format: "dnd4e", sourceXml: "<D20Character/>" },
      {
        details: {},
        abilities: {},
        stats: {},
        selectedRules: [],
        powers: [],
        loot: [],
        textStrings: {},
        levelCount: 8,
        source: "legacy-cache",
      },
      upgraded,
      { id: "hu", now: "2026-10-24T00:00:00.000Z" },
    );
    expect(isCharacterRecord(record)).toBe(true);
    expect(isCharacterRecord({ ...record, build: v2 })).toBe(false);
    expect(isCharacterRecordWithBuildV2({ ...record, build: v2 })).toBe(true);
  });
});

describe("wielding a versatile weapon (D101)", () => {
  const sword = row("sword", 1, "sword", 1, 1, {
    equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
  });
  const shield = row("shield", 1, "shield", 1, 1, {
    equippedSlots: [{ slot: "off-hand", quantityIndex: 0 }],
  });
  const build: CharacterBuild = { ...base, inventory: [sword, shield] };

  it("takes both hand slots two-handed and lets go of the off hand one-handed", () => {
    const twoHanded = applyCharacterCommand(build, {
      kind: "set-inventory-wielding",
      entryId: "sword",
      twoHanded: true,
    });
    expect(twoHanded.inventory[0]).toMatchObject({
      wieldedTwoHanded: true,
      equippedQuantity: 1,
      equippedSlots: [
        { slot: "main-hand", quantityIndex: 0 },
        { slot: "off-hand", quantityIndex: 0 },
      ],
    });
    // The shield is displaced from the off hand.
    expect(twoHanded.inventory[1]).toMatchObject({
      equippedQuantity: 0,
      equippedSlots: [],
    });

    const oneHanded = applyCharacterCommand(twoHanded, {
      kind: "set-inventory-wielding",
      entryId: "sword",
      twoHanded: false,
    });
    expect(oneHanded.inventory[0]).toMatchObject({
      wieldedTwoHanded: false,
      equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
    });
    expect(
      isCharacterRecord(
        newCharacterRecord(
          { format: "dnd4e", sourceXml: "<D20Character/>" },
          {
            details: {},
            abilities: {},
            stats: {},
            selectedRules: [],
            powers: [],
            loot: [],
            textStrings: {},
            levelCount: 1,
            source: "legacy-cache",
          },
          oneHanded,
        ),
      ),
    ).toBe(true);
  });

  it("only records the choice for an imported holding without exact slots", () => {
    const imported: CharacterBuild = {
      ...base,
      inventory: [row("sword", 1, "sword", 1, 1)],
    };
    const result = applyCharacterCommand(imported, {
      kind: "set-inventory-wielding",
      entryId: "sword",
      twoHanded: true,
    });
    expect(result.inventory[0]?.wieldedTwoHanded).toBe(true);
    expect(result.inventory[0]?.equippedSlots).toBeUndefined();
  });
});

describe("binding a dragonshard augment (CharLootAugment)", () => {
  const staff = row("staff", 1, "staff", 1, 1);
  const wand = row("wand", 1, "wand", 1, 0);
  const shard = row("shard", 1, "shard", 1, 0);
  const build: CharacterBuild = { ...base, inventory: [staff, wand, shard] };
  const ids = (entry: BuildInventoryEntry) =>
    entry.elements.flatMap(({ definitionId }) =>
      definitionId === undefined ? [] : [definitionId],
    );
  const carried = (result: CharacterBuild, host: string) => {
    const entry = result.inventory.find(({ id }) => id === host)!;
    return boundAugmentHolding(entry, result.inventory, ids)?.id;
  };

  it("attaches, moves and detaches an augment as a semantic choice", () => {
    const attached = applyCharacterCommand(build, {
      kind: "set-inventory-augment",
      hostEntryId: "staff",
      augmentEntryId: "shard",
    });
    expect(attached.inventory[0]?.augmentEntryId).toBe("shard");
    expect(carried(attached, "staff")).toBe("shard");
    // Attaching the only copy elsewhere moves it.
    const moved = applyCharacterCommand(attached, {
      kind: "set-inventory-augment",
      hostEntryId: "wand",
      augmentEntryId: "shard",
    });
    expect(carried(moved, "staff")).toBeUndefined();
    expect(moved.inventory[0]?.augmentEntryId).toBeNull();
    expect(carried(moved, "wand")).toBe("shard");
    const detached = applyCharacterCommand(moved, {
      kind: "set-inventory-augment",
      hostEntryId: "wand",
      augmentEntryId: null,
    });
    expect(carried(detached, "wand")).toBeUndefined();
    // The original build is untouched and the result is a valid record.
    expect(build.inventory[0]?.augmentEntryId).toBeUndefined();
    expect(
      isCharacterRecord(
        newCharacterRecord(
          { format: "dnd4e", sourceXml: "<D20Character/>" },
          {
            details: {},
            abilities: {},
            stats: {},
            selectedRules: [],
            powers: [],
            loot: [],
            textStrings: {},
            levelCount: 1,
            source: "legacy-cache",
          },
          detached,
        ),
      ),
    ).toBe(true);
  });

  it("keeps one binding per owned copy", () => {
    const twoShards: CharacterBuild = {
      ...base,
      inventory: [staff, wand, { ...shard, quantity: 2 }],
    };
    const both = applyCharacterCommand(
      applyCharacterCommand(twoShards, {
        kind: "set-inventory-augment",
        hostEntryId: "staff",
        augmentEntryId: "shard",
      }),
      {
        kind: "set-inventory-augment",
        hostEntryId: "wand",
        augmentEntryId: "shard",
      },
    );
    expect(carried(both, "staff")).toBe("shard");
    expect(carried(both, "wand")).toBe("shard");
  });

  it("follows an imported CharLootID until a modern choice is made", () => {
    const serialized = serializeLegacyLootId({ baseId: "ID_SHARD" });
    const imported: CharacterBuild = {
      ...base,
      inventory: [
        { ...staff, overrides: { augment: serialized } },
        wand,
        shard,
      ],
    };
    expect(parseLegacyLootId(serialized)).toEqual({ baseId: "ID_SHARD" });
    expect(carried(imported, "staff")).toBe("shard");
    // Only an owned augment resolves, as FindLoot searches owned loot.
    expect(
      carried(
        { ...imported, inventory: imported.inventory.slice(0, 2) },
        "staff",
      ),
    ).toBeUndefined();
    const moved = applyCharacterCommand(imported, {
      kind: "set-inventory-augment",
      hostEntryId: "wand",
      augmentEntryId: "shard",
    });
    expect(carried(moved, "staff")).toBeUndefined();
    expect(carried(moved, "wand")).toBe("shard");
  });

  it("rejects binding a holding to itself or an unknown augment", () => {
    expect(() =>
      applyCharacterCommand(build, {
        kind: "set-inventory-augment",
        hostEntryId: "shard",
        augmentEntryId: "shard",
      }),
    ).toThrow(/itself/);
    expect(() =>
      applyCharacterCommand(build, {
        kind: "set-inventory-augment",
        hostEntryId: "staff",
        augmentEntryId: "missing",
      }),
    ).toThrow(/not found/);
  });
});
