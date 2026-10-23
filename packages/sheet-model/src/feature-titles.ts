import type { LegacyRuleElement } from "@4ecb/character-domain";

const key = (value: string) => value.trim().toLocaleLowerCase();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The character's one class, when it has exactly one: a single Class
 * element, no Hybrid Class, and no Multiclass marker (which every
 * multiclass feat grants). Hybrids and multiclass characters leave it
 * undefined, since there a feature's class name ("Hexblade Utility Power"
 * next to "Fighter Utility Power") says which class it belongs to.
 * CountsAsClass is no sign of a second class: a class counts as itself and
 * its parent (a hexblade counts as Hexblade and Warlock).
 */
export function soleClassName(
  selections: readonly Pick<LegacyRuleElement, "type" | "name">[],
): string | undefined {
  const types = (type: string) =>
    selections.filter((selection) => key(selection.type) === type);
  if (types("hybrid class").length || types("multiclass").length)
    return undefined;
  const classes = [
    ...new Set(types("class").map(({ name }) => name.trim())),
  ].filter(Boolean);
  return classes.length === 1 ? classes[0] : undefined;
}

/**
 * A feature row's heading beside its "Level N" tag. A leading "Level N"
 * that repeats the tag goes ("Level 1 Guardian Feature" tagged Level 1 reads
 * "Guardian Feature"). On a class feature named that way, the class name
 * after the level goes too when it is the character's only class: "Level 2
 * Hexblade Utility Power" reads "Utility Power". A feature whose own name
 * starts with the class ("Barbarian Agility", "Fighter Talents") keeps it,
 * as do a level that differs from the tag, a possessive ("Warlock's
 * Curse"), and a hybrid's or multiclass character's features.
 */
export function featureRowTitle(
  name: string,
  options: {
    readonly level?: number | undefined;
    readonly classFeature?: boolean;
    readonly soleClass?: string | undefined;
  },
): string {
  const trimmed = name.trim();
  const level = /^level\s+(\d+)\s+(?=\S)/i.exec(trimmed);
  if (level === null || Number(level[1]) !== options.level) return trimmed;
  let title = trimmed.slice(level[0].length);
  if (options.classFeature && options.soleClass?.trim()) {
    const prefix = new RegExp(
      `^${escape(options.soleClass.trim())}\\s+(?=\\S)`,
      "iu",
    ).exec(title);
    if (prefix !== null) title = title.slice(prefix[0].length);
  }
  return title;
}

/**
 * A closing sentence that only introduces a choice list the row does not
 * show: "You gain one of the following utility powers of your choice.",
 * "Choose one of the following fighter talents.", "You add two of the
 * following powers to your spellbook." It names "the following" and either
 * a count of them or a choice. Granted lists ("You also gain the following
 * powers.") are not choices and stay.
 */
const CHOICE_LEAD_IN =
  /(?:^|(?<=[.!?:])\s+)([^.!?:]*\bthe following\b[^.!?:]*[.:])\s*$/iu;
const CHOICE_WORDS =
  /\b(?:(?:one|two|three|four|five|six|any|either) of the following|choose|choice|chosen|pick|select)\b/iu;

/** The text less a dangling choice lead-in at its end; "" if that was all. */
export function withoutDanglingChoiceLeadIn(text: string): string {
  const match = CHOICE_LEAD_IN.exec(text.trimEnd());
  if (match === null || !CHOICE_WORDS.test(match[1]!)) return text;
  return text.trimEnd().slice(0, match.index).trimEnd();
}
