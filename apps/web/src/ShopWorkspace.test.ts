import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BuildInventoryEntry } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  compatibleChoiceType,
  retainedShopFilter,
  shopKnownFilterMatches,
  ShopWorkspace,
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
});
