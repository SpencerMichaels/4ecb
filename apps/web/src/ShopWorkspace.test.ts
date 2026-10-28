import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BuildInventoryEntry } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  acquisitionDialogPages,
  compatibleChoiceType,
  isComplexItemChoice,
  itemChoicePages,
  preferredShopBrowse,
  readShopSessionPreferences,
  resolveItemChoiceOccurrences,
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

function selectRule(type: string, category?: string): RuleStatement {
  return {
    name: "select",
    attributes: [
      { name: "type", value: type },
      { name: "number", value: "1" },
      ...(category === undefined
        ? []
        : [{ name: "Category", value: category }]),
    ],
    text: "",
    children: [],
    ordinal: 0,
  };
}

function nestedChoiceEntity(
  id: string,
  name: string,
  type: string,
  options: {
    readonly categories?: readonly string[];
    readonly rules?: readonly RuleStatement[];
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [...(options.categories ?? [])],
    flavor: "",
    description: "A public synthetic record.",
    specifics: [],
    rules: [...(options.rules ?? [])],
    extensions: [],
    provenance: { sourceKey: "public-shop", sourceOrdinal: 0 },
  };
}

// Mirrors the real "Genasi Soul Armor -> Ashfall Evasion -> key ability"
// case: an item-owned Power choice whose chosen candidate has its own
// further choice (which ability governs it), rather than a fully-simple
// choice like a resistance type.
const soulArmor = nestedChoiceEntity(
  "PUBLIC_SOUL_ARMOR",
  "Public Soul Armor",
  "Magic Item",
  { rules: [selectRule("Power", "Soul Power")] },
);
const ashfallEvasion = nestedChoiceEntity(
  "PUBLIC_ASHFALL_EVASION",
  "Ashfall Evasion",
  "Power",
  {
    categories: ["Soul Power"],
    rules: [selectRule("Racial Trait", "Key Ability")],
  },
);
const simplePower = nestedChoiceEntity(
  "PUBLIC_SIMPLE_POWER",
  "Public Simple Power",
  "Power",
  { categories: ["Soul Power"] },
);
const ashfallWisdom = nestedChoiceEntity(
  "PUBLIC_ASHFALL_WISDOM",
  "Ashfall Evasion (Wisdom)",
  "Racial Trait",
  { categories: ["Key Ability"] },
);
const ashfallCharisma = nestedChoiceEntity(
  "PUBLIC_ASHFALL_CHARISMA",
  "Ashfall Evasion (Charisma)",
  "Racial Trait",
  { categories: ["Key Ability"] },
);
const nestedChoiceEntities = [
  soulArmor,
  ashfallEvasion,
  simplePower,
  ashfallWisdom,
  ashfallCharisma,
];

describe("Shop workspace", () => {
  it("defaults first-time Shop browsing to All items", () => {
    const emptyStorage = { getItem: () => null };
    expect(preferredShopBrowse("items", emptyStorage)).toBe("all");
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
      browse: "all",
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
    expect(acquisitionDialogPages([], 0)).toEqual([]);
    expect(acquisitionDialogPages([[0]], 0)).toEqual([
      { kind: "item-choice", slotPath: [0] },
    ]);
    expect(acquisitionDialogPages([], 2)).toEqual([{ kind: "physical" }]);
    expect(acquisitionDialogPages([[0]], 2)).toEqual([
      { kind: "item-choice", slotPath: [0] },
      { kind: "physical" },
    ]);
    // A single unambiguous physical option still gets its own page today —
    // beginAcquire only skips the dialog outright when nothing needs asking.
    expect(acquisitionDialogPages([[0]], 1)).toEqual([
      { kind: "item-choice", slotPath: [0] },
      { kind: "physical" },
    ]);
  });

  it("gives each item-owned choice slot its own page, in slot order", () => {
    expect(acquisitionDialogPages([[0], [1]], 0)).toEqual([
      { kind: "item-choice", slotPath: [0] },
      { kind: "item-choice", slotPath: [1] },
    ]);
    expect(acquisitionDialogPages([[0], [1], [2]], 1)).toEqual([
      { kind: "item-choice", slotPath: [0] },
      { kind: "item-choice", slotPath: [1] },
      { kind: "item-choice", slotPath: [2] },
      { kind: "physical" },
    ]);
  });

  it("adds a page for a chosen candidate's own further choice, nested beneath it", () => {
    expect(acquisitionDialogPages([[0], [0, 0]], 1)).toEqual([
      { kind: "item-choice", slotPath: [0] },
      { kind: "item-choice", slotPath: [0, 0] },
      { kind: "physical" },
    ]);
  });

  it("only shows a nested item-choice page once its parent choice picks a candidate that needs one", () => {
    // Nothing chosen yet: just the top-level Power slot.
    expect(
      itemChoicePages(soulArmor, nestedChoiceEntities, 1, new Map()).map(
        (info) => info.path,
      ),
    ).toEqual([[0]]);

    // Chose a power with no further choice of its own: still just one page.
    expect(
      itemChoicePages(
        soulArmor,
        nestedChoiceEntities,
        1,
        new Map([["0", simplePower.id]]),
      ).map((info) => info.path),
    ).toEqual([[0]]);

    // Chose Ashfall Evasion, which has its own key-ability choice: a second,
    // nested page appears for it.
    const withAshfallEvasion = itemChoicePages(
      soulArmor,
      nestedChoiceEntities,
      1,
      new Map([["0", ashfallEvasion.id]]),
    );
    expect(withAshfallEvasion.map((info) => info.path)).toEqual([[0], [0, 0]]);
    expect(
      withAshfallEvasion[1]?.candidates.map((candidate) => candidate.id),
    ).toEqual(expect.arrayContaining([ashfallWisdom.id, ashfallCharisma.id]));
  });

  it("stores a candidate's own resolved choice nested under it, not flat", () => {
    const resolved = resolveItemChoiceOccurrences(
      soulArmor,
      nestedChoiceEntities,
      1,
      new Map([
        ["0", ashfallEvasion.id],
        ["0.0", ashfallWisdom.id],
      ]),
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.identity.definitionId).toBe(ashfallEvasion.id);
    expect(resolved[0]?.children).toHaveLength(1);
    expect(resolved[0]?.children[0]?.identity.definitionId).toBe(
      ashfallWisdom.id,
    );
    expect(resolved[0]?.children[0]?.children).toEqual([]);
  });

  it("ignores a stale nested selection left over from a since-changed parent choice", () => {
    const resolved = resolveItemChoiceOccurrences(
      soulArmor,
      nestedChoiceEntities,
      1,
      new Map([
        ["0", simplePower.id],
        // Leftover from when Ashfall Evasion was chosen at this slot; simplePower
        // has no choices of its own, so this must not resurface as an answer.
        ["0.0", ashfallWisdom.id],
      ]),
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.identity.definitionId).toBe(simplePower.id);
    expect(resolved[0]?.children).toEqual([]);
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
    // Learning catalogs live in the Rituals tab, not Shop.
    expect(markup).not.toContain("Alchemical formulas");
    expect(markup).not.toContain("Martial practices");
    expect(markup).toContain("Implement enchantments");
    expect(markup).toMatch(
      /aria-pressed="true"><svg[^>]*lucide-coins[\s\S]*?<\/svg> Affordable/,
    );
    expect(markup).toMatch(
      /aria-pressed="true"><svg[^>]*lucide-badge-check[\s\S]*?<\/svg> Proficient/,
    );
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
      /Subtype<\/span><select disabled=""[^>]*><option>—<\/option>/,
    );
    expect(markup).not.toContain("All subtypes");
  });
});

describe("Shop catalog in learning mode", () => {
  const ritual: ContentEntity = {
    ...potion,
    id: "PUBLIC_RITUAL",
    name: "Public Rite",
    type: "Ritual",
    specifics: [
      { name: "Level", value: "1", extraAttributes: [], ordinal: 0 },
      { name: "Market Price", value: "50 gp", extraAttributes: [], ordinal: 1 },
      { name: "type", value: "Ritual", extraAttributes: [], ordinal: 2 },
    ],
  };
  const formula: ContentEntity = {
    ...ritual,
    id: "PUBLIC_FORMULA",
    name: "Public Formula",
    specifics: [
      ...ritual.specifics.slice(0, 2),
      {
        name: "type",
        value: "Alchemical Formula",
        extraAttributes: [],
        ordinal: 2,
      },
    ],
  };
  const render = (knownDefinitionIds: ReadonlySet<string>) =>
    renderToStaticMarkup(
      createElement(ShopWorkspace, {
        mode: "learning",
        browse: "rituals",
        characterLevel: 1,
        entities: [potion, ritual, formula],
        inventory: [],
        ownedDefinitions: [],
        walletCopper: 100_000,
        knownDefinitionIds,
        onInspect: vi.fn(),
        onAcquire: vi.fn(),
        onBrowseChange: vi.fn(),
        onLearn: vi.fn(),
      }),
    );

  it("offers only the learning catalogs, with Buy and Learn free", () => {
    const markup = render(new Set());
    expect(markup).toContain('aria-label="Buy Public Rite"');
    expect(markup).toContain('aria-label="Learn Public Rite free"');
    expect(markup).not.toContain("Public Potion");
    expect(markup).not.toContain("Public Formula");
    expect(markup).toContain("Alchemical formulas");
    expect(markup).not.toContain("All items");
    expect(markup).toMatch(/aria-pressed="false">.*Known<\/button>/);
  });

  it("prices rituals at the character's Ritual Cost Modifier percent (legacy LootCost)", () => {
    const markup = renderToStaticMarkup(
      createElement(ShopWorkspace, {
        mode: "learning",
        browse: "rituals",
        characterLevel: 1,
        entities: [ritual],
        inventory: [],
        ownedDefinitions: [],
        walletCopper: 100_000,
        ritualCostPercent: 50,
        onInspect: vi.fn(),
        onAcquire: vi.fn(),
        onBrowseChange: vi.fn(),
        onLearn: vi.fn(),
      }),
    );
    expect(markup).toContain(">25 gp</td>");
    expect(markup).not.toContain(">50 gp</td>");
  });

  it("marks known records, learned or granted, and disables learning them", () => {
    const markup = render(new Set(["public_ritual"]));
    expect(markup).toContain(">Known</td>");
    expect(markup).toMatch(/aria-label="Buy Public Rite"[^>]*disabled/);
    expect(markup).toMatch(/aria-label="Learn Public Rite free"[^>]*disabled/);
  });
});
