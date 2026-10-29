/**
 * Stored prerequisite IR: a record's `prerequisites` text internalized once,
 * at pack build (`content-tool build`, through the rules engine's
 * `withStoredPrerequisiteIr`), into the internal field
 * {@link PREREQUISITE_IR_FIELD} (versioned JSON).
 *
 * Unlike the power text IR, an internalized prerequisite depends on the
 * whole content set it was resolved against (names resolve to record IDs
 * over every record). The field therefore carries a stamp of that set's
 * record IDs; the engine uses it only when internalizing against a set with
 * the same stamp, and otherwise internalizes the text itself (cached per
 * content set). Composing several packs into one profile drops the field
 * ({@link withoutStoredPrerequisiteIr}): a later layer may replace a record
 * under the same ID, which the stamp cannot see.
 */

import type { ContentEntity, SpecificField } from "./index";

/** The internal field holding a record's internalized prerequisite. */
export const PREREQUISITE_IR_FIELD = "_Prerequisite IR";
/** Bump when the stored shape or internalizing changes; an older pack's
 *  field is then ignored and the engine internalizes the text itself. */
export const PREREQUISITE_IR_VERSION = 1;

export interface StoredPrerequisiteIr {
  readonly version: number;
  /** {@link prerequisiteDefinitionSetStamp} of the set it was resolved against. */
  readonly definitions: string;
  /** The exact `prerequisites` text internalized. */
  readonly text: string;
  /** The rules engine's `PrerequisiteIr`. */
  readonly ir: unknown;
}

function fnv1a(value: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * An order-independent stamp of a content set's record IDs: its size and
 * two 32-bit sums of per-ID hashes. Profile composition reorders records,
 * which does not change what a prerequisite resolves to.
 */
export function prerequisiteDefinitionSetStamp(
  definitions: readonly Pick<ContentEntity, "id">[],
): string {
  let first = 0;
  let second = 0;
  for (const { id } of definitions) {
    first = (first + fnv1a(id, 0x811c9dc5)) >>> 0;
    second = (second + fnv1a(id, 0x050c5d1f)) >>> 0;
  }
  return `${definitions.length}:${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}

/** The set size a stamp records, to reject a mismatch without hashing. */
export function prerequisiteStampSize(stamp: string): number {
  return Number.parseInt(stamp.slice(0, stamp.indexOf(":")), 10);
}

/** The stored prerequisite IR envelope, or undefined when the record has
 *  none (or no fields at all: a minimal synthetic record) or it has another
 *  version. The pack is verified and immutable, so only the envelope is
 *  checked. */
export function readStoredPrerequisiteIr(
  specifics:
    readonly { readonly name: string; readonly value: string }[] | undefined,
): StoredPrerequisiteIr | undefined {
  const raw = specifics?.find(
    (specific) => specific.name === PREREQUISITE_IR_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return undefined;
    const stored = parsed as Partial<StoredPrerequisiteIr>;
    if (
      stored.version !== PREREQUISITE_IR_VERSION ||
      typeof stored.definitions !== "string" ||
      typeof stored.text !== "string" ||
      typeof stored.ir !== "object" ||
      stored.ir === null
    )
      return undefined;
    return stored as StoredPrerequisiteIr;
  } catch {
    return undefined;
  }
}

/** The field storing `ir` for this record, appended after its own fields. */
export function storedPrerequisiteIrField(
  specifics: readonly SpecificField[],
  stored: Omit<StoredPrerequisiteIr, "version">,
): SpecificField {
  return {
    name: PREREQUISITE_IR_FIELD,
    value: JSON.stringify({ version: PREREQUISITE_IR_VERSION, ...stored }),
    extraAttributes: [],
    ordinal:
      specifics.reduce(
        (highest, specific) => Math.max(highest, specific.ordinal),
        -1,
      ) + 1,
  };
}

/** The record without its stored prerequisite IR (the same object when it
 *  has none). */
export function withoutStoredPrerequisiteIr<T extends ContentEntity>(
  entity: T,
): T {
  if (!entity.specifics.some(({ name }) => name === PREREQUISITE_IR_FIELD))
    return entity;
  return {
    ...entity,
    specifics: entity.specifics.filter(
      ({ name }) => name !== PREREQUISITE_IR_FIELD,
    ),
  };
}
