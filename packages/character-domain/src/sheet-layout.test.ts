import { describe, expect, it } from "vitest";

import {
  normalizeSheetLayout,
  SHEET_SECTION_IDS,
  sheetSectionCopies,
  sheetSectionOrder,
  withHoldingCardsShown,
  withSheetCardOrder,
  withSheetCardsShown,
  withSheetReminderShown,
  withSheetSectionCopies,
  withSheetSectionOrder,
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

  it("lists every section in default print order, the overview first", () => {
    expect(SHEET_SECTION_IDS).toEqual([
      "summary",
      "scratchpad",
      "reference:features",
      "reference:items",
      "reference:power-index",
      "reference:rituals",
      "reference:profile",
      "cards",
      "session-notes",
    ]);
  });

  it("stores a section order only when it differs from the default", () => {
    const order = [
      "cards",
      ...SHEET_SECTION_IDS.filter((id) => id !== "cards"),
    ] as const;
    const reordered = withSheetSectionOrder(undefined, order);
    expect(reordered).toEqual({ version: 1, sectionOrder: order });
    expect(normalizeSheetLayout(JSON.parse(JSON.stringify(reordered)))).toEqual(
      reordered,
    );
    expect(withSheetSectionOrder(reordered, SHEET_SECTION_IDS)).toBeUndefined();
    // Leniently: unknown and repeated ids drop, missing ones follow in
    // default order.
    expect(
      normalizeSheetLayout({
        version: 1,
        sectionOrder: ["session-notes", "page-1", 3, "session-notes", "cards"],
      })?.sectionOrder,
    ).toEqual([
      "session-notes",
      "cards",
      ...SHEET_SECTION_IDS.filter(
        (id) => id !== "session-notes" && id !== "cards",
      ),
    ]);
    expect(sheetSectionOrder(undefined)).toEqual(SHEET_SECTION_IDS);
    // Hiding and ordering combine.
    expect(withSheetSectionShown(reordered, "summary", false)).toEqual({
      version: 1,
      hiddenSections: ["summary"],
      sectionOrder: order,
    });
  });

  it("stores section copies only above 1, dropping invalid counts", () => {
    const two = withSheetSectionCopies(undefined, "scratchpad", 2);
    expect(two).toEqual({ version: 1, sectionCopies: { scratchpad: 2 } });
    expect(normalizeSheetLayout(JSON.parse(JSON.stringify(two)))).toEqual(two);
    expect(sheetSectionCopies(two, "scratchpad")).toBe(2);
    expect(sheetSectionCopies(two, "session-notes")).toBe(1);
    expect(sheetSectionCopies(two, "summary")).toBe(1);
    expect(withSheetSectionCopies(two, "scratchpad", 1)).toBeUndefined();
    expect(
      normalizeSheetLayout({
        version: 1,
        sectionCopies: {
          scratchpad: 2.5,
          "session-notes": 0,
          summary: 3,
          cards: "4",
        },
      }),
    ).toBeUndefined();
    expect(
      normalizeSheetLayout({
        version: 1,
        sectionCopies: { "session-notes": 3, scratchpad: -1 },
        hiddenSections: ["scratchpad"],
      }),
    ).toEqual({
      version: 1,
      hiddenSections: ["scratchpad"],
      sectionCopies: { "session-notes": 3 },
    });
  });

  it("stores a card order only when it differs from the default, keeping vanished keys", () => {
    const defaults = ["play:character", "play:skills", "power:a", "item:b"];
    const moved = ["power:a", "play:character", "play:skills", "item:b"];
    const ordered = withSheetCardOrder(undefined, moved, defaults);
    expect(ordered).toEqual({ version: 1, cardOrder: moved });
    expect(normalizeSheetLayout(JSON.parse(JSON.stringify(ordered)))).toEqual(
      ordered,
    );
    // Back to the default order stores nothing.
    expect(withSheetCardOrder(ordered, defaults, defaults)).toBeUndefined();
    // Leniently: non-strings and repeats drop.
    expect(
      normalizeSheetLayout({
        version: 1,
        cardOrder: ["power:a", 3, null, "power:a", "", "item:b"],
      }),
    ).toEqual({ version: 1, cardOrder: ["power:a", "item:b"] });
    expect(
      normalizeSheetLayout({ version: 1, cardOrder: "x" }),
    ).toBeUndefined();
    // A stored card that left the deck keeps its place after the key it
    // followed, so it comes back there.
    const withGone = withSheetCardOrder(
      undefined,
      ["power:gone", "power:a", "play:character", "power:x", "item:b"],
      ["play:character", "power:a", "power:gone", "power:x", "item:b"],
    );
    expect(
      withSheetCardOrder(
        withGone,
        ["power:a", "item:b", "play:character", "power:x"],
        ["play:character", "power:a", "power:x", "item:b"],
      )?.cardOrder,
    ).toEqual(["power:gone", "power:a", "item:b", "play:character", "power:x"]);
    // Ordering combines with hiding.
    expect(
      withSheetCardsShown(
        ordered,
        [{ key: "power:a", defaultShown: true }],
        false,
      ),
    ).toEqual({
      version: 1,
      hiddenCards: ["power:a"],
      cardOrder: moved,
    });
  });

  it("round-trips a hidden overview", () => {
    const hidden = withSheetSectionShown(undefined, "summary", false);
    expect(hidden).toEqual({ version: 1, hiddenSections: ["summary"] });
    expect(normalizeSheetLayout(JSON.parse(JSON.stringify(hidden)))).toEqual(
      hidden,
    );
    expect(withSheetSectionShown(hidden, "summary", true)).toBeUndefined();
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

  it("stores reminder choices only as deltas from their defaults", () => {
    expect(
      normalizeSheetLayout({
        version: 1,
        reminders: {
          "feature:a": "hide",
          "effect:b": "show",
          "item:c": "pin",
          "": "hide",
          ["x".repeat(600)]: "hide",
        },
      }),
    ).toEqual({
      version: 1,
      reminders: { "feature:a": "hide", "effect:b": "show" },
    });
    expect(normalizeSheetLayout({ version: 1, reminders: [] })).toBeUndefined();
    const detected = { id: "feature:a", defaultShown: true };
    const rider = { id: "effect:b", defaultShown: false };
    const hidden = withSheetReminderShown(undefined, detected, false);
    expect(hidden).toEqual({ version: 1, reminders: { "feature:a": "hide" } });
    const both = withSheetReminderShown(hidden, rider, true);
    expect(both).toEqual({
      version: 1,
      reminders: { "feature:a": "hide", "effect:b": "show" },
    });
    expect(normalizeSheetLayout(JSON.parse(JSON.stringify(both)))).toEqual(
      both,
    );
    // Back to a default: the choice is dropped, and so is an empty layout.
    expect(withSheetReminderShown(both, rider, false)).toEqual(hidden);
    expect(withSheetReminderShown(hidden, detected, true)).toBeUndefined();
    // Choices for reminders that vanished are kept, not pruned.
    expect(
      withSheetReminderShown(
        { version: 1, reminders: { "feature:gone": "hide" } },
        rider,
        true,
      ),
    ).toEqual({
      version: 1,
      reminders: { "feature:gone": "hide", "effect:b": "show" },
    });
  });
});
