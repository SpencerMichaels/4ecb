import { describe, expect, it } from "vitest";

import { SHEET_SECTION_IDS } from "@4ecb/character-domain";

import { isSheetPlayCard, sheetCardDeck } from "./card-deck";
import type { SheetCard } from "./index";
import type { SheetItemSetCard } from "./item-set-card";
import { applySheetLayout, orderedCards } from "./sheet-layout";

const power = (id: string): SheetCard => ({
  kind: "power",
  id,
  name: id,
  usage: "At-Will",
  fields: [],
});
const item = (id: string, extra: Partial<SheetCard> = {}): SheetCard => ({
  kind: "item",
  id,
  name: id,
  fields: [],
  ...extra,
});
const set: SheetItemSetCard = {
  kind: "item-set",
  id: "SET",
  name: "Synthetic Set",
  group: false,
  pieces: 2,
  pieceIds: ["PIECE_A", "PIECE_B"],
  benefits: [],
};
const model = {
  powers: [power("ARC"), power("BOLT")],
  companions: [],
  items: [
    item("PIECE_A", { holdingId: "a" }),
    item("PIECE_B", { holdingId: "b", hiddenByDefault: true }),
    item("CACHED", { hiddenByDefault: true }),
  ],
  itemSets: [set],
};
const keys = (entries: readonly { readonly key: string }[]) =>
  entries.map(({ key }) => key);

describe("applySheetLayout", () => {
  it("prints the default deck without a layout", () => {
    const resolved = applySheetLayout(model, undefined);
    expect(keys(resolved.deck)).toEqual(
      keys(sheetCardDeck(model).filter(({ defaultShown }) => defaultShown)),
    );
    expect(keys(resolved.deck)).toEqual([
      "play:character",
      "play:skills",
      "power:arc",
      "power:bolt",
      "item:a",
      "item-set:set",
    ]);
    expect(
      resolved.cards.map(({ key, shown }) => [key, shown]).slice(4),
    ).toEqual([
      ["item:a", true],
      ["item-set:set", true],
      ["item:b", false],
      ["item:def:cached", false],
    ]);
    expect(resolved.hiddenSections.size).toBe(0);
    expect(resolved.sectionOrder).toEqual(SHEET_SECTION_IDS);
    expect(resolved.sectionCopies).toEqual({
      scratchpad: 1,
      "session-notes": 1,
    });
  });

  it("hides and shows cards from the layout, and items from their holdings", () => {
    const resolved = applySheetLayout(
      model,
      {
        version: 1,
        hiddenCards: ["power:arc", "play:skills", "item:a", "power:gone"],
        shownCards: ["item:def:cached"],
        hiddenSections: ["summary", "scratchpad"],
        sectionOrder: ["cards"],
        sectionCopies: { "session-notes": 2 },
      },
      { itemCardsShown: new Map([["b", true]]) },
    );
    // `item:a` is a holding card: its flag, not the layout, decides.
    expect(keys(resolved.deck)).toEqual([
      "play:character",
      "power:bolt",
      "item:a",
      "item:b",
      "item-set:set",
      "item:def:cached",
    ]);
    expect(resolved.cards.find(({ key }) => key === "item:b")?.holdingId).toBe(
      "b",
    );
    expect([...resolved.hiddenSections]).toEqual(["summary", "scratchpad"]);
    expect(resolved.sectionOrder[0]).toBe("cards");
    expect(resolved.sectionCopies).toEqual({
      scratchpad: 1,
      "session-notes": 2,
    });
    expect(resolved.sectionOrder).toHaveLength(SHEET_SECTION_IDS.length);
  });

  it("orders the deck by the stored card order before the deck is cut", () => {
    const resolved = applySheetLayout(model, {
      version: 1,
      cardOrder: ["item:a", "power:gone", "power:bolt", "play:character"],
      hiddenCards: ["power:bolt"],
    });
    // Listed cards keep their stored relative order; unlisted ones follow
    // their nearest default predecessor (play:skills after play:character,
    // power:arc after play:skills); the vanished key is ignored. The hidden
    // card keeps its place among every card and only leaves the printed
    // deck.
    expect(keys(resolved.cards)).toEqual([
      "item:a",
      "item-set:set",
      "item:b",
      "item:def:cached",
      "power:bolt",
      "play:character",
      "play:skills",
      "power:arc",
    ]);
    expect(keys(resolved.deck)).toEqual([
      "item:a",
      "item-set:set",
      "play:character",
      "play:skills",
      "power:arc",
    ]);
    expect(resolved.defaultCardOrder).toEqual(
      keys(applySheetLayout(model, undefined).cards),
    );
  });

  it("places new cards after their nearest default predecessor", () => {
    const deck = ["a", "b", "c", "d", "e"].map((key) => ({ key }));
    expect(keys(orderedCards(deck, []))).toEqual(["a", "b", "c", "d", "e"]);
    // a and e were reordered; b, c and d are new since the order was saved.
    expect(keys(orderedCards(deck, ["e", "a"]))).toEqual([
      "e",
      "a",
      "b",
      "c",
      "d",
    ]);
    // A new first card opens the deck.
    expect(keys(orderedCards(deck, ["c", "b", "x"]))).toEqual([
      "a",
      "c",
      "d",
      "e",
      "b",
    ]);
  });

  it("moves a set card when the holding flags hide its pieces", () => {
    const resolved = applySheetLayout(model, undefined, {
      itemCardsShown: new Map([["a", false]]),
    });
    expect(keys(resolved.deck).slice(-1)).toEqual(["item-set:set"]);
    expect(
      resolved.deck.some(
        ({ card }) => !isSheetPlayCard(card) && card.id === "PIECE_A",
      ),
    ).toBe(false);
  });
});
