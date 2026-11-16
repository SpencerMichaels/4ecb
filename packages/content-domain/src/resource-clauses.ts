/**
 * Item property sentences that only work for a character with a resource
 * the item doesn't grant: "While you have at least 1 power point, you gain
 * a +1 item bonus to speed" (Quicksilver Armor), "You can spend 1 power
 * point as a free action ..." (Boots of Resolute Reflexes, whose first
 * sentence applies to anyone), "When you use a Channel Divinity power, ..."
 * (Astral Fire Armor). The legacy-wotc import finds them once, at pack
 * build, in each record's Property fields, and stores them as
 * {@link RESOURCE_CLAUSES_FIELD} (versioned JSON); the printed sheet reads
 * them back with {@link readResourceClauses} and, when the player asks for
 * it, leaves out those whose resource the character lacks (sheet-model
 * `withoutInapplicableClauses`).
 */

/** The internal field holding a record's resource-dependent sentences. */
export const RESOURCE_CLAUSES_FIELD = "_Resource Clauses IR";
/** Bump when the detection or the stored shape changes. */
export const RESOURCE_CLAUSES_VERSION = 1;

/** A resource a property sentence depends on. */
export type ClauseResource = "power-points" | "channel-divinity";

export interface ResourceClause {
  /** The field's name as authored ("Property"). */
  readonly field: string;
  /** Which of the record's fields of that name (1-based). */
  readonly occurrence: number;
  /** The sentence exactly as it appears in the field's value. */
  readonly text: string;
  readonly resource: ClauseResource;
}

export interface ResourceClauses {
  readonly version: typeof RESOURCE_CLAUSES_VERSION;
  readonly clauses: readonly ResourceClause[];
}

/** A record's stored resource clauses; empty without the field (none
 *  found, a pack built before it, another version). */
export function readResourceClauses(
  specifics: readonly { readonly name: string; readonly value: string }[],
): readonly ResourceClause[] {
  const raw = specifics.find(
    (specific) => specific.name === RESOURCE_CLAUSES_FIELD,
  )?.value;
  if (raw === undefined) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ResourceClauses>;
    return parsed.version === RESOURCE_CLAUSES_VERSION &&
      Array.isArray(parsed.clauses)
      ? parsed.clauses
      : [];
  } catch {
    return [];
  }
}
