import { describe, expect, it } from "vitest";

import { isSheetPlayCard, sheetCardDeck } from "./card-deck";
import type { SheetCard } from "./index";
import type { SheetItemSetCard } from "./item-set-card";
import { applySheetLayout } from "./sheet-layout";

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
  });

  it("hides and shows cards from the layout, and items from their holdings", () => {
    const resolved = applySheetLayout(
      model,
      {
        version: 1,
        hiddenCards: ["power:arc", "play:skills", "item:a", "power:gone"],
        shownCards: ["item:def:cached"],
        hiddenSections: ["scratchpad"],
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
    expect([...resolved.hiddenSections]).toEqual(["scratchpad"]);
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
