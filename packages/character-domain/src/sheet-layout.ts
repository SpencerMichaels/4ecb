import type { BuildInventoryEntry } from "./build";

/**
 * A character's printed-sheet layout (D099): presentation choices layered on
 * the generated sheet, never build input. It stores only deltas from the
 * default sheet, so new cards and sections get default behavior, and keys
 * that vanish (a card that temporarily leaves the deck) are ignored, not
 * pruned. Item cards are the exception: whether a holding prints its card is
 * the holding's legacy `showPowerCard` flag, so it round-trips to the old
 * builder.
 */

/** The full-reference page groups, in print order. */
export const SHEET_REFERENCE_GROUP_IDS = [
  "features",
  "items",
  "power-index",
  "rituals",
  "profile",
] as const;

export type SheetReferenceGroupId = (typeof SHEET_REFERENCE_GROUP_IDS)[number];

/** Optional sheet sections; page 1 always prints. */
export type SheetSectionId =
  "scratchpad" | "session-notes" | `reference:${SheetReferenceGroupId}`;

export const SHEET_SECTION_IDS: readonly SheetSectionId[] = [
  "scratchpad",
  ...SHEET_REFERENCE_GROUP_IDS.map((group) => `reference:${group}` as const),
  "session-notes",
];

export interface SheetLayout {
  readonly version: 1;
  /** Sections left out of the printed sheet. */
  readonly hiddenSections?: readonly SheetSectionId[];
  /** Deck card keys (sheet-model `sheetCardDeck`) left out of the deck. */
  readonly hiddenCards?: readonly string[];
  /** Keys of cards hidden by default that print anyway. */
  readonly shownCards?: readonly string[];
}

const MAX_ENTRIES = 2000;
const MAX_KEY_LENGTH = 512;

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result = new Set<string>();
  for (const entry of value) {
    if (result.size >= MAX_ENTRIES) break;
    if (
      typeof entry === "string" &&
      entry.length > 0 &&
      entry.length <= MAX_KEY_LENGTH
    )
      result.add(entry);
  }
  return [...result];
}

const isSectionId = (value: string): value is SheetSectionId =>
  SHEET_SECTION_IDS.some((id) => id === value);

/**
 * A stored layout, leniently: malformed entries are dropped rather than
 * failing the record, and an empty layout is `undefined` (the defaults).
 */
export function normalizeSheetLayout(value: unknown): SheetLayout | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const hiddenSections = strings(record.hiddenSections).filter(isSectionId);
  const hiddenCards = strings(record.hiddenCards);
  const shownCards = strings(record.shownCards);
  if (
    hiddenSections.length === 0 &&
    hiddenCards.length === 0 &&
    shownCards.length === 0
  )
    return undefined;
  return {
    version: 1,
    ...(hiddenSections.length === 0 ? {} : { hiddenSections }),
    ...(hiddenCards.length === 0 ? {} : { hiddenCards }),
    ...(shownCards.length === 0 ? {} : { shownCards }),
  };
}

/** Shows or hides one optional section. */
export function withSheetSectionShown(
  layout: SheetLayout | undefined,
  section: SheetSectionId,
  shown: boolean,
): SheetLayout | undefined {
  const others = (layout?.hiddenSections ?? []).filter((id) => id !== section);
  return normalizeSheetLayout({
    ...layout,
    hiddenSections: shown ? others : [...others, section],
  });
}

/**
 * Shows or hides deck cards (not item holdings' cards, which use the
 * holding's flag). `defaultShown` says whether each card prints by default,
 * so only the delta is stored.
 */
export function withSheetCardsShown(
  layout: SheetLayout | undefined,
  cards: readonly { readonly key: string; readonly defaultShown: boolean }[],
  shown: boolean,
): SheetLayout | undefined {
  const keys = new Set(cards.map(({ key }) => key));
  const hiddenCards = (layout?.hiddenCards ?? []).filter(
    (key) => !keys.has(key),
  );
  const shownCards = (layout?.shownCards ?? []).filter((key) => !keys.has(key));
  for (const card of cards)
    if (card.defaultShown && !shown) hiddenCards.push(card.key);
    else if (!card.defaultShown && shown) shownCards.push(card.key);
  return normalizeSheetLayout({ ...layout, hiddenCards, shownCards });
}

/**
 * Sets holdings' legacy `showPowerCard` flags: whether each prints an item
 * card. Presentation only — evaluation input never carries the flag.
 */
export function withHoldingCardsShown(
  inventory: readonly BuildInventoryEntry[],
  holdingIds: readonly string[],
  shown: boolean,
): BuildInventoryEntry[] {
  const ids = new Set(holdingIds);
  return inventory.map((entry) =>
    ids.has(entry.id) ? { ...entry, showPowerCard: shown } : entry,
  );
}
