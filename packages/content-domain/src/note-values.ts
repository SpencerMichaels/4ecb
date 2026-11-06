import type { AssociateAbilityName } from "./associate-stat-block";

/**
 * The character-dependent values in a feature's one-line note (D112): a
 * feat's, class feature's or racial trait's `Short Description` or
 * `_CS_ShortDescription` text that the page-1 "Remember in play" reminders
 * print. Notes write tiered and ability-based values generically ("+1/+2/+3
 * (by tier) to damage", "Deal 2 + Dex mod extra damage (4 + Dex mod at 11th
 * level, 6 + Dex mod at 21st)", "resistance to poison (5 + one-half your
 * level)"), or leave the value to the full text ("creatures summoned gain a
 * bonus to damage rolls" beside "… equal to your Constitution modifier").
 *
 * The legacy-wotc import parses each note once, at pack build, and stores
 * the segments on the record as {@link NOTE_VALUES_FIELD} (versioned JSON).
 * The sheet reads them back with {@link readNoteValues} and prints each value
 * at the character's level and ability modifiers (rules-engine
 * `noteValueText`); a clause the record's own unconditional stat additions
 * already put on the sheet ("+2/+3/+4 (by tier) to Will") is marked applied
 * and left out.
 */

/** The internal field holding a record's parsed note values. */
export const NOTE_VALUES_FIELD = "_Note Values IR";
/** Bump when the parse or the stored shape changes. */
export const NOTE_VALUES_VERSION = 2;

/** A number or dice ("1d8", "1[W]": `count` of `die`). */
export type NoteValueConstant =
  | { readonly kind: "flat"; readonly value: number }
  | { readonly kind: "dice"; readonly count: number; readonly die: string };

export type NoteValueTerm =
  | NoteValueConstant
  /** "+1/+2/+3 (by tier)": the heroic, paragon and epic values. */
  | {
      readonly kind: "tier";
      readonly values: readonly [
        NoteValueConstant,
        NoteValueConstant,
        NoteValueConstant,
      ];
    }
  /** "+1 damage per tier", "1[W] per tier": times 1, 2 or 3 by tier. */
  | { readonly kind: "per-tier"; readonly value: NoteValueConstant }
  /** "one-half your level". */
  | { readonly kind: "half-level" }
  /** "Dex mod", "your Constitution modifier"; "Con or Int modifier": the
   *  highest of them. */
  | {
      readonly kind: "ability";
      readonly abilities: readonly AssociateAbilityName[];
    };

/** "(4 + Dex mod at 11th level)": from `level`, the value is `terms`
 *  instead, or (`add`, "Con mod (+5 at 11th)") the base plus `terms`. */
export interface NoteValueStep {
  readonly level: number;
  readonly terms: readonly NoteValueTerm[];
  readonly add: boolean;
}

export interface NoteValue {
  readonly terms: readonly NoteValueTerm[];
  readonly steps?: readonly NoteValueStep[];
  /** Printed with a sign ("+3"): the note wrote one, or it is a bonus. */
  readonly signed: boolean;
}

/** A note's pieces in order: its own text, a value, or a clause the
 *  record's stat additions apply (left out of the reminder). */
export type NoteSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "value"; readonly value: NoteValue }
  | { readonly kind: "applied"; readonly text: string };

export interface ParsedNote {
  /** The note text exactly as the record writes it. */
  readonly text: string;
  readonly segments: readonly NoteSegment[];
}

export interface NoteValues {
  readonly version: typeof NOTE_VALUES_VERSION;
  readonly notes: readonly ParsedNote[];
}

/**
 * The parsed note for `text` on a record, or undefined when the record has
 * none (no values in it, a pack built before D112, another version).
 */
export function readNoteValues(
  specifics: readonly { readonly name: string; readonly value: string }[],
  text: string,
): ParsedNote | undefined {
  const raw = specifics.find(
    (specific) => specific.name === NOTE_VALUES_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<NoteValues>;
    if (parsed.version !== NOTE_VALUES_VERSION || !Array.isArray(parsed.notes))
      return undefined;
    return parsed.notes.find((note) => note.text === text);
  } catch {
    return undefined;
  }
}
