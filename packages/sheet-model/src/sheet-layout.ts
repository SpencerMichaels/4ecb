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
import {
  CREATURE_ACTIONS_KEY_SUFFIX,
  type SheetCreatureCard,
} from "./creature-card";
import type { CharacterSheetModel, SheetCard } from "./index";
import type { OverviewReminderCandidate } from "./overview";

export interface SheetLayoutCard extends SheetDeckEntry {
  /** Whether the card prints under this layout. */
  readonly shown: boolean;
  /**
   * The inventory holding whose `showPowerCard` flag controls this item
   * card; absent for every card the layout's own lists control.
   */
  readonly holdingId?: string;
  /**
   * The key the layout stores for this card when it differs from `key`: a
   * split creature's actions card (D110) is hidden, shown and moved with
   * its stats card, under the creature's one key.
   */
  readonly layoutKey?: string;
}

export interface SheetLayoutReminder extends OverviewReminderCandidate {
  /** Whether the reminder prints on page 1 under this layout. */
  readonly shown: boolean;
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
  /** Every page-1 reminder candidate in page order, shown or not; page 1
   *  prints the shown ones. */
  readonly reminders: readonly SheetLayoutReminder[];
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
 *
 * Page-1 reminders: an explicit "hide" drops one, an explicit "show" keeps
 * it, otherwise its `defaultShown` applies. Hiding a card never changes a
 * reminder.
 */
export function applySheetLayout(
  model: Pick<CharacterSheetModel, "powers" | "items" | "companions"> &
    Partial<Pick<CharacterSheetModel, "itemSets" | "overview">>,
  layout: SheetLayout | undefined,
  options: {
    readonly itemCardsShown?: ReadonlyMap<string, boolean>;
    /** Creature cards (by deck key) whose whole card overflows the printed
     *  card at the minimum text size: each prints as a stats card and an
     *  actions card (D110). */
    readonly splitCreatures?: ReadonlySet<string>;
  } = {},
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
  const cards = orderedCards(defaultCards, layout?.cardOrder ?? []).flatMap(
    (entry): SheetLayoutCard[] => {
      const holdingId = holdingOf(entry);
      const card: SheetLayoutCard = {
        ...entry,
        shown: shown(entry),
        ...(holdingId === undefined ? {} : { holdingId }),
      };
      return entry.card.kind === "creature" &&
        options.splitCreatures?.has(entry.key) === true
        ? splitCreatureCard(card, entry.card)
        : [card];
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
    reminders: reminderCandidates(model.overview).map((reminder) => {
      const choice = layout?.reminders?.[reminder.id];
      return {
        ...reminder,
        shown: choice === undefined ? reminder.defaultShown : choice === "show",
      };
    }),
  };
}

/** The overview's reminder candidates; a model without them (built before
 * candidates existed) offers its printed reminders, each shown. */
function reminderCandidates(
  overview: CharacterSheetModel["overview"],
): readonly OverviewReminderCandidate[] {
  if (overview === undefined) return [];
  return (
    overview.reminderCandidates ??
    (overview.summaryReminders ?? overview.reminders).map(
      (reminder, index) => ({
        ...reminder,
        id: `unlisted:${index}`,
        defaultShown: true,
      }),
    )
  );
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

/** A creature's stats card then its actions card, in the creature's deck
 *  place; the actions card follows its stats card wherever it moves. */
function splitCreatureCard(
  entry: SheetLayoutCard,
  card: SheetCreatureCard,
): SheetLayoutCard[] {
  return [
    { ...entry, card: { ...card, part: "stats" } },
    {
      ...entry,
      key: `${entry.key}${CREATURE_ACTIONS_KEY_SUFFIX}`,
      layoutKey: entry.key,
      card: { ...card, part: "actions" },
    },
  ];
}

/** The key a sheet layout stores for a card (hidden cards, card order). */
export const sheetLayoutCardKey = (
  card: Pick<SheetLayoutCard, "key" | "layoutKey">,
) => card.layoutKey ?? card.key;
