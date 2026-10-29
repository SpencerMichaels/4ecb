import type { SheetCompanionCard } from "./familiar-card";
import type { CharacterSheetModel, SheetCard } from "./index";
import type { SheetItemSetCard } from "./item-set-card";
import { classifyPowerCard, powerActionRank } from "./power-classification";

/** The Play data and Skills cards, rendered from the whole sheet model. */
export interface SheetPlayCard {
  readonly kind: "play-character" | "play-skills";
}

export type SheetDeckCard =
  SheetCard | SheetCompanionCard | SheetItemSetCard | SheetPlayCard;

/** The deck's runs, in order; the sheet editor heads its card list by them. */
export type SheetDeckGroup = "play" | "companions" | "powers" | "items";

export const SHEET_DECK_GROUPS: readonly SheetDeckGroup[] = [
  "play",
  "companions",
  "powers",
  "items",
];

export interface SheetDeckEntry {
  /**
   * Stable across level-ups, retrains of other choices and content text
   * changes: built from provenance (definition, holding or set IDs), never
   * from card text, except a legacy cache card with no ID (D099).
   */
  readonly key: string;
  readonly group: SheetDeckGroup;
  readonly card: SheetDeckCard;
  /** False for an item whose holding asks for no card (`showPowerCard`). */
  readonly defaultShown: boolean;
}

export const isSheetPlayCard = (card: SheetDeckCard): card is SheetPlayCard =>
  card.kind === "play-character" || card.kind === "play-skills";

/** Rules-reference "powers" (applied effects), indexed apart from powers. */
export const isRulesReferencePower = (card: SheetCard) =>
  classifyPowerCard(card).feature;

/** Character-sheet usage groups, then the same action hierarchy as power tables. */
export function sortedPowerCards(cards: readonly SheetCard[]): SheetCard[] {
  const classifications = new Map(
    cards.map((card) => [card, classifyPowerCard(card)]),
  );
  const group = (card: SheetCard) => {
    const classification = classifications.get(card)!;
    if (classification.feature) return -1;
    switch (classification.usage) {
      case "at-will":
        return card.universal ? 1 : 0;
      case "encounter":
        return 2;
      case "daily":
        return 3;
      default:
        return 4;
    }
  };
  const utility = (card: SheetCard) =>
    Number(classifications.get(card)!.utility);
  return [...cards].sort(
    (a, b) =>
      group(a) - group(b) ||
      utility(a) - utility(b) ||
      powerActionRank(a.actionType) - powerActionRank(b.actionType) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

const keyPart = (value: string) => value.trim().toLocaleLowerCase();

/**
 * The power cards the deck prints, in `sortedPowerCards` order: a movement
 * technique a full discipline's card already prints (`movementTechnique`)
 * gets no card of its own. Legacy prints both; the owner chose one copy
 * (D099). A technique owned without its discipline keeps its card.
 */
export function deckPowerCards(cards: readonly SheetCard[]): SheetCard[] {
  const folded = new Set(
    cards.flatMap(({ movementTechnique }) =>
      movementTechnique === undefined ? [] : [keyPart(movementTechnique.id)],
    ),
  );
  return sortedPowerCards(
    cards.filter(
      (card) =>
        card.id === undefined ||
        card.movementTechnique !== undefined ||
        !folded.has(keyPart(card.id)),
    ),
  );
}

/**
 * Keys for one run of cards, in the model's own order: the provenance key,
 * else a `name:` fallback, with `#n` from the second card sharing a key.
 */
function keyed<Card>(
  cards: readonly Card[],
  base: (card: Card) => string,
): Map<Card, string> {
  const seen = new Map<string, number>();
  const keys = new Map<Card, string>();
  for (const card of cards) {
    const key = base(card);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    keys.set(card, count === 1 ? key : `${key}#${count}`);
  }
  return keys;
}

/** A power's key: its definition (universal cards have fixed IDs). */
export const sheetPowerCardKeyBase = (card: SheetCard) =>
  card.id === undefined
    ? `power:name:${keyPart(card.name)}`
    : `power:${keyPart(card.id)}`;

/** An item's key: its holding, else (legacy cache) its definition or name. */
export const sheetItemCardKeyBase = (card: SheetCard) =>
  card.holdingId !== undefined
    ? `item:${card.holdingId}`
    : card.id !== undefined
      ? `item:def:${keyPart(card.id)}`
      : `item:name:${keyPart(card.name)}`;

/**
 * The printed card deck in order with stable keys: the Play data and Skills
 * cards, the beast companion then familiars (companion card proposal, owner
 * answer 5), the special Action Point and Second Wind cards (as in the legacy
 * builder), the other powers (`deckPowerCards`), then items with each item
 * set's card after its last shown piece's card (legacy CharTracker; a set
 * with no shown piece card closes the deck).
 *
 * Every card is listed, including items whose holding asks for no card
 * (`defaultShown: false`); `applySheetLayout` decides what prints. `shown`
 * says which item cards print, for item set placement; it defaults to
 * `defaultShown`.
 */
export function sheetCardDeck(
  model: Pick<CharacterSheetModel, "powers" | "items" | "companions"> &
    Partial<Pick<CharacterSheetModel, "itemSets">>,
  shown: (entry: SheetDeckEntry) => boolean = (entry) => entry.defaultShown,
): SheetDeckEntry[] {
  const powerKeys = keyed(model.powers, sheetPowerCardKeyBase);
  const itemKeys = keyed(model.items, sheetItemCardKeyBase);
  const companionKeys = keyed(
    model.companions,
    (card) => `companion:${keyPart(card.id)}`,
  );
  const setKeys = keyed(
    model.itemSets ?? [],
    (card) => `item-set:${keyPart(card.id)}`,
  );
  const powerCards = deckPowerCards(model.powers);
  const specialCardRank = (card: SheetCard) =>
    ["action point", "second wind"].indexOf(card.name.trim().toLowerCase());
  const specialCards = powerCards
    .filter((card) => card.universal && specialCardRank(card) >= 0)
    .sort((a, b) => specialCardRank(a) - specialCardRank(b));
  const power = (card: SheetCard): SheetDeckEntry => ({
    key: powerKeys.get(card)!,
    group: "powers",
    card,
    defaultShown: true,
  });
  const items = model.items.map((card): SheetDeckEntry => ({
    key: itemKeys.get(card)!,
    group: "items",
    card,
    defaultShown: card.hiddenByDefault !== true,
  }));
  const after = new Map<number, SheetDeckEntry[]>();
  const trailing: SheetDeckEntry[] = [];
  for (const set of model.itemSets ?? []) {
    const entry: SheetDeckEntry = {
      key: setKeys.get(set)!,
      group: "items",
      card: set,
      defaultShown: true,
    };
    const pieces = new Set(set.pieceIds.map(keyPart));
    let last = -1;
    items.forEach((item, index) => {
      const { id } = item.card as SheetCard;
      if (id !== undefined && pieces.has(keyPart(id)) && shown(item))
        last = index;
    });
    if (last < 0) trailing.push(entry);
    else after.set(last, [...(after.get(last) ?? []), entry]);
  }
  return [
    {
      key: "play:character",
      group: "play",
      card: { kind: "play-character" },
      defaultShown: true,
    },
    {
      key: "play:skills",
      group: "play",
      card: { kind: "play-skills" },
      defaultShown: true,
    },
    ...model.companions.map((card): SheetDeckEntry => ({
      key: companionKeys.get(card)!,
      group: "companions",
      card,
      defaultShown: true,
    })),
    ...specialCards.map(power),
    ...powerCards.filter((card) => !specialCards.includes(card)).map(power),
    ...items.flatMap((item, index) => [item, ...(after.get(index) ?? [])]),
    ...trailing,
  ];
}
