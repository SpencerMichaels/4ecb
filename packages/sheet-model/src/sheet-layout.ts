import {
  SHEET_COPYABLE_SECTION_IDS,
  SHEET_SECTION_IDS,
  sheetSectionCopies,
  sheetSectionOrder,
  type SheetCopyableSectionId,
  type SheetLayout,
  type SheetSectionId,
} from "@4ecb/character-domain";

import { sheetCardDeck, type SheetDeckEntry } from "./card-deck";
import type { CharacterSheetModel, SheetCard } from "./index";

export interface SheetLayoutCard extends SheetDeckEntry {
  /** Whether the card prints under this layout. */
  readonly shown: boolean;
  /**
   * The inventory holding whose `showPowerCard` flag controls this item
   * card; absent for every card the layout's own lists control.
   */
  readonly holdingId?: string;
}

export interface ResolvedSheetLayout {
  /** The printed deck, in order (chunked into 9-card pages by print). */
  readonly deck: readonly SheetDeckEntry[];
  /** Every deck card in deck order, shown or not, for the sheet editor. */
  readonly cards: readonly SheetLayoutCard[];
  /** The same cards' keys in default deck order (no player ordering), for
   *  storing a new order as a delta (`withSheetCardOrder`). */
  readonly defaultCardOrder: readonly string[];
  readonly hiddenSections: ReadonlySet<SheetSectionId>;
  /** Every section, hidden or not, in print order. */
  readonly sectionOrder: readonly SheetSectionId[];
  /** How many copies of each repeatable section print (at least 1). */
  readonly sectionCopies: Readonly<Record<SheetCopyableSectionId, number>>;
}

/**
 * Applies a character's sheet layout (D099) to its sheet model. It only
 * selects and orders model output — it never computes a value, and hiding a
 * card leaves the model (scratchpad usage boxes, power index) unchanged.
 *
 * Item cards with a holding follow `itemCardsShown` (the holdings' current
 * `showPowerCard` flags, applied after evaluation), else the card's
 * `hiddenByDefault`; every other card follows the layout's deltas. The
 * layout's `cardOrder` orders every card, shown or hidden (`orderedCards`),
 * before print cuts the deck into 9-card pages.
 */
export function applySheetLayout(
  model: Pick<CharacterSheetModel, "powers" | "items" | "companions"> &
    Partial<Pick<CharacterSheetModel, "itemSets">>,
  layout: SheetLayout | undefined,
  options: { readonly itemCardsShown?: ReadonlyMap<string, boolean> } = {},
): ResolvedSheetLayout {
  const hiddenCards = new Set(layout?.hiddenCards ?? []);
  const shownCards = new Set(layout?.shownCards ?? []);
  const holdingOf = (entry: SheetDeckEntry) =>
    entry.card.kind === "item"
      ? (entry.card as SheetCard).holdingId
      : undefined;
  const shown = (entry: SheetDeckEntry) => {
    const holdingId = holdingOf(entry);
    if (holdingId !== undefined)
      return options.itemCardsShown?.get(holdingId) ?? entry.defaultShown;
    return entry.defaultShown
      ? !hiddenCards.has(entry.key)
      : shownCards.has(entry.key);
  };
  const defaultCards = sheetCardDeck(model, shown);
  const cards = orderedCards(defaultCards, layout?.cardOrder ?? []).map(
    (entry): SheetLayoutCard => {
      const holdingId = holdingOf(entry);
      return {
        ...entry,
        shown: shown(entry),
        ...(holdingId === undefined ? {} : { holdingId }),
      };
    },
  );
  const hiddenSections = new Set(
    (layout?.hiddenSections ?? []).filter((id) =>
      SHEET_SECTION_IDS.includes(id),
    ),
  );
  return {
    deck: cards
      .filter((card) => card.shown)
      .map(({ key, group, card, defaultShown }) => ({
        key,
        group,
        card,
        defaultShown,
      })),
    cards,
    defaultCardOrder: defaultCards.map(({ key }) => key),
    hiddenSections,
    sectionOrder: sheetSectionOrder(layout?.sectionOrder),
    sectionCopies: Object.fromEntries(
      SHEET_COPYABLE_SECTION_IDS.map((section) => [
        section,
        sheetSectionCopies(layout, section),
      ]),
    ) as Record<SheetCopyableSectionId, number>,
  };
}

/**
 * The deck in the player's order (D099, plan §4 "Card order merge"): cards
 * the stored order lists keep its relative order; a card it does not list
 * (new since the order was saved) follows its nearest default-order
 * predecessor, or opens the deck when it has none. Stored keys of cards no
 * longer in the deck are ignored. Shown and hidden cards are ordered alike,
 * so a hidden card keeps its place.
 */
export function orderedCards<Entry extends { readonly key: string }>(
  defaultOrder: readonly Entry[],
  stored: readonly string[],
): Entry[] {
  if (stored.length === 0) return [...defaultOrder];
  const byKey = new Map(defaultOrder.map((entry) => [entry.key, entry]));
  const result = [...new Set(stored)].flatMap((key) => {
    const entry = byKey.get(key);
    return entry === undefined ? [] : [entry];
  });
  const listed = new Set(result);
  defaultOrder.forEach((entry, index) => {
    if (listed.has(entry)) return;
    const predecessor = defaultOrder[index - 1];
    const at = predecessor === undefined ? -1 : result.indexOf(predecessor);
    result.splice(at + 1, 0, entry);
  });
  return result;
}
