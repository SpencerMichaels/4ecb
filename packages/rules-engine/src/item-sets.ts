import type { ContentEntity } from "@4ecb/content-domain";

import type { CharacterOccurrence } from "./evaluator";
import { parseRules } from "./ir";
import { StatAccumulator } from "./stats";

/**
 * Item sets (legacy native `Sets` and `GroupSetCounts`, run after loot
 * execution). Each executing set piece adds 1 to the stat "<set id> Set
 * Count", typed by its base item so two copies of one piece count once. A
 * group set's pieces add to "<set id> Equipped Count" instead, and its count
 * is the "<set id> Set Count" textstring (the party's pieces), applied only
 * while the character has a piece. Every benefit whose "Piece Count" the
 * count reaches becomes an element of the character, so its rules apply.
 */
export interface EvaluatedItemSet {
  readonly setId: string;
  /** The set's piece count, as the legacy `ItemSetCount`. */
  readonly pieces: number;
  /** Benefits the count unlocks, in the set's `Benefits` order. */
  readonly activeBenefitIds: readonly string[];
  /**
   * A group set with an equipped piece and an entered party count: the
   * party's pieces, which native GroupSetCounts (`-Module-.cs` ~19691)
   * adds to the "<set id> Set Count" stat that benefits link (Heirlooms of
   * Mazgorax's bonuses). Native adds nothing without the textstring.
   */
  readonly partyPieces?: number;
}

interface EntityIndex {
  get(id: string): ContentEntity | undefined;
}

const SET_COUNT = / set count$/iu;
const EQUIPPED_COUNT = / equipped count$/iu;

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

export function isItemSetEntity(entity: ContentEntity | undefined): boolean {
  return entity !== undefined && key(entity.type) === "item set";
}

/** A set whose benefits count the whole group's pieces (Tier "Group"). */
export function isGroupItemSet(entity: ContentEntity): boolean {
  return key(field(entity, "Tier") ?? "") === "group";
}

/**
 * The textstring holding a group set's party piece count ("<set id> Set
 * Count"): the character's existing key when one matches (ignoring case),
 * else the canonical name.
 */
export function itemSetPartyCountName(
  setId: string,
  textStrings: Readonly<Record<string, string>> = {},
): string {
  const name = `${setId} Set Count`;
  return (
    Object.keys(textStrings).find((other) => key(other) === key(name)) ?? name
  );
}

/**
 * The party's pieces of a group set, from its "<set id> Set Count"
 * textstring; undefined while unset or unreadable.
 */
export function itemSetPartyPieces(
  setId: string,
  textStrings: Readonly<Record<string, string>>,
): number | undefined {
  const value = Number.parseInt(
    textStrings[itemSetPartyCountName(setId, textStrings)] ?? "",
    10,
  );
  return Number.isFinite(value) ? value : undefined;
}

/** The set's benefit records in their authored order. */
export function itemSetBenefits(
  set: ContentEntity,
  index: EntityIndex,
): readonly ContentEntity[] {
  return (field(set, "Benefits") ?? "").split(",").flatMap((id) => {
    const benefit = id.trim() === "" ? undefined : index.get(id.trim());
    return benefit === undefined ? [] : [benefit];
  });
}

/** A benefit's "Piece Count", or 0 when unreadable (legacy `int.Parse`). */
export function itemSetBenefitPieceCount(benefit: ContentEntity): number {
  const value = Number.parseInt(field(benefit, "Piece Count") ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * The sets the given (executing) occurrences hold pieces of, with their
 * counts and unlocked benefits, plus one occurrence per unlocked benefit not
 * already among `occurrences`.
 */
export function evaluateItemSets(
  occurrences: readonly CharacterOccurrence[],
  index: EntityIndex,
  textStrings: Readonly<Record<string, string>>,
): {
  readonly itemSets: readonly EvaluatedItemSet[];
  readonly benefitOccurrences: readonly CharacterOccurrence[];
} {
  const counts = new StatAccumulator();
  const sets = new Map<string, { set: ContentEntity; level: number }>();
  for (const occurrence of occurrences) {
    const entity = index.get(occurrence.definitionId);
    if (entity === undefined) continue;
    for (const rule of parseRules(entity.id, entity.rules)) {
      if (rule.kind !== "statadd") continue;
      const suffix =
        SET_COUNT.exec(rule.name) ?? EQUIPPED_COUNT.exec(rule.name);
      if (suffix === null) continue;
      const set = index.get(rule.name.slice(0, suffix.index));
      if (!isItemSetEntity(set) || set === undefined) continue;
      counts.add({
        id: `${occurrence.id}:${rule.source.ordinal}`,
        stat: rule.name,
        value: rule.value,
        providerId: occurrence.id,
        providerName: entity.name,
        ...(rule.bonusType === undefined ? {} : { bonusType: rule.bonusType }),
      });
      const previous = sets.get(key(set.id));
      sets.set(key(set.id), {
        set,
        level: Math.max(previous?.level ?? 1, occurrence.acquiredLevel),
      });
    }
  }
  const owned = new Set(
    occurrences.map(({ definitionId }) => key(definitionId)),
  );
  const numeric = (value: number | string) =>
    typeof value === "number" ? value : Number.parseInt(value, 10) || 0;
  const itemSets: EvaluatedItemSet[] = [];
  const benefitOccurrences: CharacterOccurrence[] = [];
  for (const { set, level } of sets.values()) {
    let pieces = numeric(counts.evaluate(`${set.id} Set Count`).value);
    const partyPieces =
      isGroupItemSet(set) &&
      numeric(counts.evaluate(`${set.id} Equipped Count`).value) !== 0
        ? itemSetPartyPieces(set.id, textStrings)
        : undefined;
    pieces += partyPieces ?? 0;
    const active = itemSetBenefits(set, index).filter(
      (benefit) => pieces >= itemSetBenefitPieceCount(benefit),
    );
    itemSets.push({
      setId: set.id,
      pieces,
      activeBenefitIds: active.map(({ id }) => id),
      ...(partyPieces === undefined ? {} : { partyPieces }),
    });
    for (const benefit of active)
      if (!owned.has(key(benefit.id)))
        benefitOccurrences.push({
          id: `item-set:${set.id}:${benefit.id}`,
          definitionId: benefit.id,
          acquiredLevel: level,
          kind: "inventory",
        });
  }
  return { itemSets, benefitOccurrences };
}
