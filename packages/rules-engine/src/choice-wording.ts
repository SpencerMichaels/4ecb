import type { ContentEntity } from "@4ecb/content-domain";

import { ABILITY_SCORE_NAMES } from "./ability-scores";
import { parseRules } from "./ir";

/**
 * How a choice is worded for the player: what it asks for ("Damage Type")
 * and the instruction to make it ("Choose a damage type"). The single source
 * for the Shop's item-choice pages, the Equipment tab's right-click menu,
 * the Build tab's option tables and the builder's open-choice issues.
 */
export interface ChoiceWordingSlot {
  /** The select's element type, or the Build tab's presentation of it. */
  readonly type: string;
  /** The select's authored label ("Choose Resistance Type"), if any. */
  readonly label?: string;
}

/** A candidate as far as wording needs it. */
export type ChoiceWordingCandidate = Pick<ContentEntity, "id" | "name"> &
  Partial<Pick<ContentEntity, "rules">>;

/**
 * Select types that are only the content's internal containers for a
 * feature's own options (a Fighting Style's styles, an Armor of Adaptable
 * Resistance's damage types, a breath power's ability): the type says
 * nothing to the player, so the choice is named from its candidates.
 */
const INTERNAL_CHOICE_TYPES = new Set([
  "class feature",
  "racial trait",
  "trait package",
  "countsasrace",
]);

/** Whether `type` is an internal container type the player never sees. */
export function isInternalChoiceType(type: string): boolean {
  return INTERNAL_CHOICE_TYPES.has(type.trim().toLocaleLowerCase());
}

const DAMAGE_TYPES = [
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
];

const DEFENSES = ["ac", "fortitude", "reflex", "will"];

/** The rules' fixed vocabularies a family of options can differ by. */
const VARYING_TERM_SUBJECTS: readonly {
  readonly subject: string;
  readonly terms: ReadonlySet<string>;
}[] = [
  {
    subject: "Ability Score",
    terms: new Set(ABILITY_SCORE_NAMES.map((name) => name.toLocaleLowerCase())),
  },
  { subject: "Damage Type", terms: new Set(DAMAGE_TYPES) },
  { subject: "Defense", terms: new Set(DEFENSES) },
];

/** Grant types a player recognizes as the thing an option gives. */
const PLAYER_GRANT_TYPES: Readonly<Record<string, string>> = {
  power: "Power",
  feat: "Feat",
  proficiency: "Proficiency",
};

/** The part of each name the others don't share ("Armor of Adaptable
 * Resistance +1 (Acid)" → "Acid"), or undefined when names are identical. */
function varyingNameParts(names: readonly string[]): string[] | undefined {
  const first = names[0];
  if (first === undefined || names.length < 2) return undefined;
  let prefix = 0;
  while (
    prefix < first.length &&
    names.every((name) => name[prefix] === first[prefix])
  )
    prefix += 1;
  // Whole words only: "(Fire)" and "(Force)" share "(", not "(F".
  while (prefix > 0 && /[\p{L}\p{N}]/u.test(first[prefix - 1]!)) prefix -= 1;
  let suffix = 0;
  while (
    names.every(
      (name) =>
        name.length - suffix > prefix &&
        name[name.length - 1 - suffix] === first[first.length - 1 - suffix],
    )
  )
    suffix += 1;
  while (suffix > 0 && /[\p{L}\p{N}]/u.test(first[first.length - suffix]!))
    suffix -= 1;
  const parts = names.map((name) =>
    name
      .slice(prefix, name.length - suffix)
      .replace(/^[\s(]+|[\s)]+$/g, "")
      .trim()
      .toLocaleLowerCase(),
  );
  return parts.some((part) => part === "") ? undefined : parts;
}

/**
 * What a choice's candidates have in common, as the player would name it:
 * - every candidate's name differs from the others only by an ability
 *   ("Powerful Breath Strength" …) → "Ability Score", a damage type
 *   ("Armor of Adaptable Resistance +1 (Acid)" …) → "Damage Type", or a
 *   defense ("Hybrid Warlord Fortitude" …) → "Defense";
 * - else every candidate's only rule grants one power ("Harper Pin (heroic
 *   tier) (Tymora's luck)" → Tymora's Luck), feat or proficiency → "Power",
 *   "Feat", "Proficiency".
 * Undefined when the candidates share nothing this clear (fewer than two
 * candidates never name a choice).
 */
export function choiceSubjectFromCandidates(
  candidates: readonly ChoiceWordingCandidate[],
): string | undefined {
  if (candidates.length < 2) return undefined;
  const parts = varyingNameParts(candidates.map(({ name }) => name));
  if (parts !== undefined)
    for (const { subject, terms } of VARYING_TERM_SUBJECTS)
      if (parts.every((part) => terms.has(part))) return subject;
  const grantTypes = candidates.map((candidate) => {
    if (candidate.rules === undefined) return undefined;
    const rules = parseRules(candidate.id, candidate.rules);
    const only = rules[0];
    return rules.length === 1 && only?.kind === "grant"
      ? PLAYER_GRANT_TYPES[only.type?.trim().toLocaleLowerCase() ?? ""]
      : undefined;
  });
  const grantType = grantTypes[0];
  return grantType !== undefined &&
    grantTypes.every((type) => type === grantType)
    ? grantType
    : undefined;
}

/**
 * What a choice asks for, as the player reads it: its authored label
 * without a leading "Choose" ("Resistance Type"); else, for an internal
 * container type, what its candidates have in common ("Damage Type") or
 * "Option"; else its type ("Language").
 */
export function choiceName(
  slot: ChoiceWordingSlot,
  candidates: readonly ChoiceWordingCandidate[] = [],
): string {
  const label = slot.label?.trim().replace(/^choose\s+/i, "");
  if (label !== undefined && label !== "") return label;
  if (!isInternalChoiceType(slot.type)) return slot.type.trim();
  return choiceSubjectFromCandidates(candidates) ?? "Option";
}

function withArticle(noun: string): string {
  // "a utility power", "a unique item": a "yoo" sound takes "a".
  const an = /^[aeiou]/i.test(noun) && !/^u(?:ni|s[eu]|ti)/i.test(noun);
  return `${an ? "an" : "a"} ${noun}`;
}

/** The instruction to make a choice: its authored label ("Choose
 * Resistance Type"), else "Choose a damage type", "Choose an option",
 * "Choose a language". */
export function choiceHeading(
  slot: ChoiceWordingSlot,
  candidates: readonly ChoiceWordingCandidate[] = [],
): string {
  const label = slot.label?.trim();
  if (label !== undefined && label !== "")
    return /^choose\s/i.test(label) ? label : `Choose ${label}`;
  return `Choose ${withArticle(choiceName(slot, candidates).toLocaleLowerCase())}`;
}
