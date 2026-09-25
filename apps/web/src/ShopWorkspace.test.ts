import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BuildInventoryEntry } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  acquisitionDialogPages,
  compatibleChoiceType,
  isComplexItemChoice,
  preferredShopBrowse,
  readShopSessionPreferences,
  retainedShopFilter,
  shopKnownFilterMatches,
  ShopWorkspace,
  writeShopSessionPreferences,
} from "./ShopWorkspace";

const potion: ContentEntity = {
  id: "PUBLIC_POTION",
  name: "Public Potion",
  type: "Magic Item",
  source: "Public fixture",
  sources: ["Public fixture"],
  attributes: [],
  categories: [],
  flavor: "",
  description: "A public synthetic consumable.",
  specifics: [
    {
      name: "Magic Item Type",
      value: "Potion",
      extraAttributes: [],
      ordinal: 0,
    },
    { name: "Level", value: "1", extraAttributes: [], ordinal: 1 },
    { name: "Gold", value: "10", extraAttributes: [], ordinal: 2 },
  ],
  rules: [],
  extensions: [],
  provenance: { sourceKey: "public-shop", sourceOrdinal: 0 },
};

const ownedPotion: BuildInventoryEntry = {
  id: "PUBLIC_HOLDING",
  acquiredLevel: 1,
  quantity: 2,
  equippedQuantity: 0,
  elements: [
    {
      definitionId: potion.id,
      name: potion.name,
      type: potion.type,
    },
  ],
  overrides: {},
  legality: "rules-legal",
};

describe("Shop workspace", () => {
  it("defaults first-time Shop browsing to Adventuring gear", () => {
    const emptyStorage = { getItem: () => null };
    expect(preferredShopBrowse("items", emptyStorage)).toBe("adventuring-gear");
    expect(preferredShopBrowse("armor-shields", emptyStorage)).toBe(
      "armor-shields",
    );
  });

  it("round-trips the complete filter and sort configuration for the session", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const preferences = {
      browse: "weapons" as const,
      search: "axe",
      slot: "Held",
      subtype: "Axe",
      affordable: false,
      proficient: false,
      knownOnly: true,
      advancedOpen: true,
      legacy: "Magic Weapons",
      source: "Public fixture",
      rarity: "Common",
      tier: "Heroic",
      sort: { column: "price" as const, direction: "descending" as const },
    };

    writeShopSessionPreferences(preferences, storage);

    expect(readShopSessionPreferences(storage)).toEqual(preferences);
    expect(preferredShopBrowse("items", storage)).toBe("weapons");
  });

  it("falls back safely when saved Shop preferences are invalid", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          browse: "not-a-category",
          search: 42,
          affordable: "yes",
          sort: { column: "damage", direction: "sideways" },
        }),
    };

    expect(readShopSessionPreferences(storage)).toMatchObject({
      browse: "adventuring-gear",
      search: "",
      affordable: true,
      sort: { column: "name", direction: "ascending" },
    });
  });

  it("retains only filter values represented by the current Browse result", () => {
    expect(retainedShopFilter("Head", ["Head", "Neck"], false)).toBe("Head");
    expect(retainedShopFilter("Head", ["Neck"], false)).toBe("");
    expect(retainedShopFilter("Head", ["Head"], true)).toBe("");
  });

  it("applies Known only while browsing learnable records", () => {
    expect(shopKnownFilterMatches(true, true, false)).toBe(false);
    expect(shopKnownFilterMatches(false, true, false)).toBe(true);
    expect(shopKnownFilterMatches(true, false, false)).toBe(true);
  });

  it("orders the acquisition dialog's pages with item-owned choices before a physical pairing", () => {
    expect(acquisitionDialogPages(0, 0)).toEqual([]);
    expect(acquisitionDialogPages(1, 0)).toEqual([
      { kind: "item-choice", slotIndex: 0 },
    ]);
    expect(acquisitionDialogPages(0, 2)).toEqual([{ kind: "physical" }]);
    expect(acquisitionDialogPages(1, 2)).toEqual([
      { kind: "item-choice", slotIndex: 0 },
      { kind: "physical" },
    ]);
    // A single unambiguous physical option still gets its own page today —
    // beginAcquire only skips the dialog outright when nothing needs asking.
    expect(acquisitionDialogPages(1, 1)).toEqual([
      { kind: "item-choice", slotIndex: 0 },
      { kind: "physical" },
    ]);
  });

  it("gives each item-owned choice slot its own page, in slot order", () => {
    expect(acquisitionDialogPages(2, 0)).toEqual([
      { kind: "item-choice", slotIndex: 0 },
      { kind: "item-choice", slotIndex: 1 },
    ]);
    expect(acquisitionDialogPages(3, 1)).toEqual([
      { kind: "item-choice", slotIndex: 0 },
      { kind: "item-choice", slotIndex: 1 },
      { kind: "item-choice", slotIndex: 2 },
      { kind: "physical" },
    ]);
  });

  it("treats only Power candidates as complex enough for the detail-card layout", () => {
    expect(isComplexItemChoice([{ type: "Power" }])).toBe(true);
    expect(isComplexItemChoice([{ type: "power" }])).toBe(true);
    expect(
      isComplexItemChoice([{ type: "Class Feature" }, { type: "Power" }]),
    ).toBe(true);
    expect(isComplexItemChoice([{ type: "Class Feature" }])).toBe(false);
    expect(isComplexItemChoice([{ type: "Language" }])).toBe(false);
    expect(isComplexItemChoice([])).toBe(false);
  });

  it("uses physical subtypes outside implement Standard/Superior choices", () => {
    const longsword = {
      ...potion,
      id: "PUBLIC_LONGSWORD",
      name: "Public Longsword",
      type: "Weapon",
      specifics: [
        {
          name: "Group",
          value: "Heavy blade",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    expect(compatibleChoiceType(longsword, false)).toBe("Heavy blade");
    expect(compatibleChoiceType(longsword, true)).toBe("Superior");
  });

  it("renders the approved unified browse and acquisition controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ShopWorkspace, {
        browse: "all",
        characterLevel: 1,
        entities: [potion],
        inventory: [],
        ownedDefinitions: [],
        walletCopper: 100_000,
        onInspect: vi.fn(),
        onAcquire: vi.fn(),
        onBrowseChange: vi.fn(),
      }),
    );

    expect(markup).toContain("All items");
    expect(markup).toContain("Alchemical formulas");
    expect(markup).toContain("Implement enchantments");
    expect(markup).toContain('aria-pressed="true">Affordable');
    expect(markup).toContain('aria-pressed="true">Proficient');
    expect(markup).toContain('aria-label="Buy Public Potion"');
    expect(markup).toContain('aria-label="Give Public Potion"');
    expect(markup).not.toContain("Acquire");
  });

  it("treats owned quantity-bearing items as holdings rather than known records", () => {
    const markup = renderToStaticMarkup(
      createElement(ShopWorkspace, {
        browse: "consumables",
        characterLevel: 1,
        entities: [potion],
        inventory: [ownedPotion],
        ownedDefinitions: [],
        walletCopper: 100_000,
        onInspect: vi.fn(),
        onAcquire: vi.fn(),
        onBrowseChange: vi.fn(),
      }),
    );

    expect(markup).not.toContain(">Known<");
    expect(markup).not.toMatch(/aria-label="Buy Public Potion"[^>]*disabled/);
    expect(markup).not.toMatch(/aria-label="Give Public Potion"[^>]*disabled/);
  });

  it("disables a subtype filter that has only one represented value", () => {
    const ammunition = {
      ...potion,
      id: "PUBLIC_AMMUNITION",
      name: "Public Ammunition",
      specifics: [
        {
          name: "Magic Item Type",
          value: "Ammunition",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(ShopWorkspace, {
        browse: "ammunition",
        characterLevel: 1,
        entities: [ammunition],
        inventory: [],
        ownedDefinitions: [],
        walletCopper: 100_000,
        onInspect: vi.fn(),
        onAcquire: vi.fn(),
        onBrowseChange: vi.fn(),
      }),
    );

    expect(markup).toMatch(
      /Subtype<select disabled=""[^>]*><option>—<\/option>/,
    );
    expect(markup).not.toContain("All subtypes");
  });
});
