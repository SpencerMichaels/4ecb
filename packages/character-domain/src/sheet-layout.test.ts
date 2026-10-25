import { describe, expect, it } from "vitest";

import {
  normalizeSheetLayout,
  SHEET_SECTION_IDS,
  withHoldingCardsShown,
  withSheetCardsShown,
  withSheetSectionShown,
} from "./sheet-layout";

describe("sheet layout", () => {
  it("normalizes leniently and treats an empty layout as the defaults", () => {
    expect(normalizeSheetLayout(undefined)).toBeUndefined();
    expect(normalizeSheetLayout("layout")).toBeUndefined();
    expect(normalizeSheetLayout([])).toBeUndefined();
    expect(normalizeSheetLayout({ version: 1 })).toBeUndefined();
    expect(
      normalizeSheetLayout({
        version: 9,
        hiddenSections: ["scratchpad", "reference:items", "page-1", 4],
        hiddenCards: ["power:a", "power:a", "", null, "x".repeat(600)],
        shownCards: "item:a",
        future: true,
      }),
    ).toEqual({
      version: 1,
      hiddenSections: ["scratchpad", "reference:items"],
      hiddenCards: ["power:a"],
    });
  });

  it("lists every optional section, page 1 excluded", () => {
    expect(SHEET_SECTION_IDS).toEqual([
      "scratchpad",
      "reference:features",
      "reference:items",
      "reference:power-index",
      "reference:rituals",
      "reference:profile",
      "session-notes",
    ]);
  });

  it("stores only deltas from the default sheet", () => {
    const hidden = withSheetSectionShown(undefined, "scratchpad", false);
    expect(hidden).toEqual({ version: 1, hiddenSections: ["scratchpad"] });
    expect(withSheetSectionShown(hidden, "scratchpad", true)).toBeUndefined();

    const cards = [
      { key: "power:a", defaultShown: true },
      { key: "item:def:b", defaultShown: false },
    ];
    const allShown = withSheetCardsShown(undefined, cards, true);
    expect(allShown).toEqual({ version: 1, shownCards: ["item:def:b"] });
    const allHidden = withSheetCardsShown(allShown, cards, false);
    expect(allHidden).toEqual({ version: 1, hiddenCards: ["power:a"] });
    // A vanished card's choice is kept for when it returns.
    expect(
      withSheetCardsShown(
        { version: 1, hiddenCards: ["power:gone"] },
        [cards[0]!],
        false,
      ),
    ).toEqual({ version: 1, hiddenCards: ["power:gone", "power:a"] });
  });

  it("sets holdings' card flags without touching other holdings", () => {
    const entry = (id: string) => ({
      id,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [],
      overrides: {},
      legality: "rules-legal" as const,
    });
    const inventory = [entry("a"), entry("b")];
    const updated = withHoldingCardsShown(inventory, ["b"], false);
    expect(updated[0]).toBe(inventory[0]);
    expect(updated[1]).toEqual({ ...entry("b"), showPowerCard: false });
  });
});
