import type { ContentEntity } from "@4ecb/content-domain";
import {
  isGroupItemSet,
  isItemSetEntity,
  itemSetBenefitPieceCount,
  itemSetBenefits,
  itemSetPartyPieces,
  type EvaluatedItemSet,
} from "@4ecb/rules-engine";

const key = (value: string) => value.trim().toLocaleLowerCase();

/** One benefit of an item set, by the pieces it needs. */
export interface SheetItemSetBenefit {
  readonly id: string;
  readonly pieceCount: number;
  readonly text: string;
  /** Unlocked by the set's piece count (legacy `ItemSetBenefit.Qualifies`). */
  readonly active: boolean;
}

/**
 * The legacy CharTracker "Item Set" card (`PowerCardItemSetInfo`): the set's
 * benefits by piece count, the unlocked ones marked, for a set the character
 * owns pieces of.
 */
export interface SheetItemSetCard {
  readonly kind: "item-set";
  readonly id: string;
  readonly name: string;
  readonly tier?: string;
  /** Benefits count the pieces the whole group wields. */
  readonly group: boolean;
  /** The set's piece count (equipped pieces; a group set's party count). */
  readonly pieces: number;
  /** A group set's entered party count ("<set> Set Count"); absent while
   *  unset, when the card leaves a blank to write in and dims nothing. */
  readonly partyPieces?: number;
  /** Definitions of the set's pieces, matched against item cards' IDs. */
  readonly pieceIds: readonly string[];
  readonly benefits: readonly SheetItemSetBenefit[];
  readonly description?: string;
  readonly source?: string;
}

const field = (entity: ContentEntity, name: string) =>
  entity.specifics
    .find((specific) => key(specific.name) === key(name))
    ?.value.trim() || undefined;

/** The set a piece belongs to (its `_Item_Set_ID`). */
export function itemSetOf(
  piece: ContentEntity | undefined,
  lookup: (id: string) => ContentEntity | undefined,
): ContentEntity | undefined {
  const id = piece === undefined ? undefined : field(piece, "_Item_Set_ID");
  const set = id === undefined ? undefined : lookup(id);
  return isItemSetEntity(set) ? set : undefined;
}

/** A set's card, with the evaluated count (0 when no piece is equipped). */
export function sheetItemSetCard(
  set: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
  evaluated: readonly EvaluatedItemSet[] | undefined,
  /** The build's textstrings, holding a group set's party count. */
  textStrings: Readonly<Record<string, string>> = {},
): SheetItemSetCard {
  const state = evaluated?.find(({ setId }) => key(setId) === key(set.id));
  const active = new Set(state?.activeBenefitIds.map(key) ?? []);
  const tier = field(set, "Tier");
  const description = set.description.trim();
  const group = isGroupItemSet(set);
  const partyPieces = group
    ? itemSetPartyPieces(set.id, textStrings)
    : undefined;
  return {
    kind: "item-set",
    id: set.id,
    name: set.name,
    ...(tier === undefined ? {} : { tier }),
    group,
    pieces: state?.pieces ?? 0,
    ...(partyPieces === undefined ? {} : { partyPieces }),
    pieceIds: (field(set, "Set Items") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    benefits: itemSetBenefits(set, { get: lookup })
      .map((benefit) => ({
        id: benefit.id,
        pieceCount: itemSetBenefitPieceCount(benefit),
        text: benefit.description.trim(),
        active: active.has(key(benefit.id)),
      }))
      .sort((left, right) => left.pieceCount - right.pieceCount),
    ...(description ? { description } : {}),
    ...(set.source ? { source: set.source } : {}),
  };
}

/**
 * One card per set the character owns at least one piece of, in the order
 * its first piece is held.
 */
export function sheetItemSetCards(
  ownedItems: readonly (readonly ContentEntity[])[],
  lookup: (id: string) => ContentEntity | undefined,
  evaluated: readonly EvaluatedItemSet[] | undefined,
  textStrings: Readonly<Record<string, string>> = {},
): SheetItemSetCard[] {
  const sets = new Map<string, ContentEntity>();
  for (const entities of ownedItems)
    for (const entity of entities) {
      const set = itemSetOf(entity, lookup);
      if (set !== undefined && !sets.has(key(set.id)))
        sets.set(key(set.id), set);
    }
  return [...sets.values()].map((set) =>
    sheetItemSetCard(set, lookup, evaluated, textStrings),
  );
}
