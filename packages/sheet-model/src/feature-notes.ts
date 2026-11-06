import { readNoteValues, type ContentEntity } from "@4ecb/content-domain";
import { noteValueText, type EvaluatedStat } from "@4ecb/rules-engine";

/**
 * The sheet's one-line note for a feature, feat or racial trait, as the
 * legacy sheet's features panels write it (`NoteHolder.GetShortDescription`,
 * CharTracker/NoteHolder.cs). `_CS_ShortDescription` is a sheet-only override
 * of `Short Description`: `text@Feature` shows `text` unless the character
 * owns the class feature `Feature` (Weapon Mastery gives way to Paragon
 * Weapon Mastery), and a bare `@` never shows the feature (choice
 * placeholders such as "Level 1 Mage Encounter Powers"). An empty override
 * keeps the short description. Records marked `InternalOnly` never show.
 */

const key = (value: string) => value.trim().toLocaleLowerCase();

function specific(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((field) => key(field.name) === key(name))?.value;
}

function sheetOverride(entity: ContentEntity):
  | {
      readonly text: string;
      /** The class feature that supersedes the note; "" for always. */
      readonly supersededBy?: string;
    }
  | undefined {
  const value = specific(entity, "_CS_ShortDescription");
  if (value === undefined) return undefined;
  const at = value.indexOf("@");
  return at === -1
    ? { text: value }
    : { text: value.slice(0, at), supersededBy: value.slice(at + 1) };
}

/** The note text, before the ownership test: the override, else the short
 * description. */
export function featureNoteText(entity: ContentEntity): string {
  const override = sheetOverride(entity)?.text;
  return override || specific(entity, "Short Description") || "";
}

/**
 * Whether the sheet leaves the feature out. `ownsClassFeature` answers for a
 * class feature name (legacy `FindCharElement` on the class feature type,
 * which matches an ID or a name).
 */
export function featureNoteHidden(
  entity: ContentEntity,
  ownsClassFeature: (nameOrId: string) => boolean,
): boolean {
  if (specific(entity, "InternalOnly")) return true;
  const supersededBy = sheetOverride(entity)?.supersededBy;
  if (supersededBy === undefined) return false;
  return supersededBy.trim() === "" || ownsClassFeature(supersededBy.trim());
}

/**
 * A feature note as a page-1 reminder prints it (D112): each value the
 * pack build parsed out of it (`_Note Values IR`) at the character's level
 * and ability modifiers ("+1/+2/+3 (by tier) to damage" at 12th level is
 * "+2 to damage"), and without the clauses the record's own stat additions
 * already put on the sheet ("+2/+3/+4 (by tier) to Will; make saving
 * throw…" is "Make saving throw…"). A note without parsed values is
 * unchanged; every number comes from rules-engine `noteValueText`.
 */
export function featureReminderText(
  entity: ContentEntity,
  text: string,
  level: number,
  stats: Readonly<Record<string, EvaluatedStat>>,
): string {
  const note = readNoteValues(entity.specifics, text);
  if (note === undefined) return text;
  const resolved = note.segments
    .map((segment) =>
      segment.kind === "text"
        ? segment.text
        : segment.kind === "value"
          ? noteValueText(segment.value, level, stats)
          : "",
    )
    .join("")
    .replace(/^[\s;,]+/, "")
    .replace(/[\s;,]+$/, "");
  return note.segments[0]?.kind === "applied"
    ? resolved.charAt(0).toLocaleUpperCase() + resolved.slice(1)
    : resolved;
}
