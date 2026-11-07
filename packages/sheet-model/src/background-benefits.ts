import { getAttribute, type ContentEntity } from "@4ecb/content-domain";

/**
 * A chosen background benefit on page 1's "Remember in play" (owner,
 * 2026-11-07): a reroll, Terrain Walk, a skill substitution or any other
 * mechanical benefit the player uses at the table. What the build already
 * applies is left out — class skills, languages, proficiencies, starting
 * hit points and flat skill or initiative bonuses — and a benefit with
 * nothing else is no reminder. Conditional bonuses stay here only until a
 * more specific pane shows them (the overview's reminder dedup).
 */

const key = (value: string) => value.trim().toLocaleLowerCase();

/** A background's own Benefit, when the background implements it itself
 *  (statadds, modifies: "Shifter - The Dalelands") rather than offering it
 *  as one of its choices (a "… Benefit" Background Choice, chosen on the
 *  group's own "Background benefit" row). */
export function inherentBackgroundBenefit(
  entity: ContentEntity,
): string | undefined {
  const inherent = entity.rules.some(
    (rule) =>
      !(
        key(rule.name) === "grant" &&
        key(getAttribute(rule.attributes, "type") ?? "") ===
          "background association"
      ),
  );
  if (!inherent) return undefined;
  return (
    entity.specifics
      .find((field) => key(field.name) === "benefit")
      ?.value.trim() || undefined
  );
}

/** Clauses the build applies by itself. */
const BUILD_TIME: readonly RegExp[] = [
  // Class skills and languages.
  /\badd(?:s|ing)?\b.*\bto your (?:list of )?(?:class skills?|languages?|known languages)\b/i,
  /\b(?:to your|your list of) (?:known )?languages(?: known)?\b/i,
  /\b(?:know|learn|gain|speak|read)s?\b.*\blanguages?\b/i,
  /\badditional language\b/i,
  /\bspeak, read,? and write\b|\bfluently\b/i,
  // A value's level steps ("At 11th level, these values improve to …").
  /^at \d+(?:st|nd|rd|th) level\b/i,
  // Resistances without a circumstance: the sheet's own resistance lines.
  /^(?:you\s+)?(?:also\s+)?(?:gain|have)\s+resist\s+\d+\s+\w+(?:\s*,?\s*(?:and\s+)?resist\s+\d+\s+\w+)*$/i,
  // Proficiency and starting hit points.
  /\bproficien(?:t|cy)\b/i,
  /\b(?:starting|initial) hit points\b|\bhealing surges is still\b/i,
];

/** A flat bonus the sheet's numbers already include: "you gain a +1 bonus
 *  to Perception and Insight checks", "+2 bonus to Acrobatics and
 *  Diplomacy", with no circumstance. */
const FLAT_BONUS =
  /^(?:(?:and|also|you|then|give yourself|gain|gains|receive|a|an)\s+)*[+-]\s?\d+\s+(?:\w+\s+)?bonus\s+(?:to|on)\s+(?:all\s+)?[\w\s,]*?(?:checks?)?$/i;
const CIRCUMSTANCE =
  /\b(?:when|whenever|while|if|unless|against|until|made|related|with|during|for|to (?!your\b)[a-z]+)\b/i;

/** Whether a background benefit has something to remember in play. */
export function backgroundPlayBenefit(text: string): boolean {
  const clauses = text
    .replace(/\([^()]*\)/g, " ")
    .split(
      /(?<=[.!?])\s+|\n+|;\s*|,\s+(?:and\s+)?(?=you\b|gain\b|add\b|learn\b)/i,
    )
    .map((clause) =>
      clause
        .trim()
        .replace(/\s*[.!?]+$/, "")
        .replace(/^(?:and|also)\s+/i, ""),
    )
    .filter(Boolean);
  return clauses.some(
    (clause) =>
      !BUILD_TIME.some((pattern) => pattern.test(clause)) &&
      !(
        FLAT_BONUS.test(clause) &&
        !CIRCUMSTANCE.test(clause.replace(/^.*?\bbonus\s+(?:to|on)\s+/i, ""))
      ),
  );
}
