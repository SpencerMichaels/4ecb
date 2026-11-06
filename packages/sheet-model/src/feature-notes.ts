import { readNoteValues, type ContentEntity } from "@4ecb/content-domain";
import {
  noteValueAmount,
  noteValueText,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

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
 * throw…" is "Make saving throw…"). A clause whose bonus works out at 0
 * or less goes too: it does nothing at the current numbers (Player's
 * Handbook: "A bonus refers to positive values. If a feat adds your
 * Dexterity modifier to damage, it won't do anything if your Dexterity
 * modifier isn't positive."; owner, 2026-11-05), so a note left with no
 * clause is no reminder (""). A note without parsed values is unchanged;
 * every number comes from rules-engine `noteValueText`.
 */
export function featureReminderText(
  entity: ContentEntity,
  text: string,
  level: number,
  stats: Readonly<Record<string, EvaluatedStat>>,
): string {
  const note = readNoteValues(entity.specifics, text);
  if (note === undefined) return text;
  // Clauses end at a semicolon or a sentence's full stop ("Add Wis mod to
  // opportunity attacks. Hit ends foe's movement …" keeps its second
  // sentence); an applied clause is one of its own.
  const clauses: { text: string; dropped: boolean }[] = [
    { text: "", dropped: false },
  ];
  const current = () => clauses[clauses.length - 1]!;
  for (const segment of note.segments) {
    if (segment.kind === "applied") {
      clauses.push({ text: "", dropped: true }, { text: "", dropped: false });
    } else if (segment.kind === "value") {
      const amount = noteValueAmount(segment.value, level, stats);
      if (amount !== undefined && amount <= 0) current().dropped = true;
      current().text += noteValueText(segment.value, level, stats);
    } else
      for (const [index, part] of segment.text
        .split(/(?<=;)|(?<=\.)(?=\s+[A-Z])/)
        .entries()) {
        if (index > 0) clauses.push({ text: "", dropped: false });
        current().text += part;
      }
  }
  const kept = clauses.filter((clause) => !clause.dropped);
  const resolved = kept
    .map((clause) => clause.text)
    .join("")
    .replace(/^[\s;,]+/, "")
    .replace(/[\s;,]+$/, "");
  return kept[0] !== clauses[0] || clauses[0]!.text.trim() === ""
    ? resolved.charAt(0).toLocaleUpperCase() + resolved.slice(1)
    : resolved;
}
