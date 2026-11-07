/**
 * Situational bonuses a record grants only in its prose: "You gain a +5 feat
 * bonus to Arcana, Insight, History, and Dungeoneering checks as they relate
 * to aberrant creatures or their works" (a feat with no rules), "a +2 bonus
 * to any skill check made to detect a trap, hazard, or secret door" beside
 * a flat Dungeoneering statadd. A conditional statadd puts such a bonus in
 * the sheet's Conditional modifiers pane; these have none, so the legacy-wotc
 * import parses each record's own text once, at pack build, and stores the
 * standing ones — no duration, no action trigger, granted to the character
 * itself — that the record's own stat additions do not carry, as
 * {@link PROSE_BONUSES_FIELD} (versioned JSON). The sheet reads them back
 * with {@link readProseBonuses} and lists them in the same panes as a
 * conditional statadd (sheet-model `proseConditionalModifiers`).
 */

/** The internal field holding a record's prose-only bonuses. */
export const PROSE_BONUSES_FIELD = "_Prose Bonuses IR";
/** Bump when the parse or the stored shape changes. */
export const PROSE_BONUSES_VERSION = 1;

/** What a prose bonus modifies, as the sheet's panes group it. */
export type ProseBonusTarget =
  /** A skill by its canonical name ("Perception"). */
  | { readonly kind: "skill"; readonly name: string }
  /** "AC", "Fortitude", "Reflex" or "Will". */
  | { readonly kind: "defense"; readonly name: string }
  | { readonly kind: "initiative" }
  | { readonly kind: "speed" }
  | { readonly kind: "saving-throws" }
  | { readonly kind: "death-saves" }
  /** Checks no single stat holds: "skill checks", "Strength checks",
   *  "checks" (to escape a grab). `name` is the sheet's label. */
  | { readonly kind: "checks"; readonly name: string }
  /** A resistance ("fire", "all damage"). */
  | { readonly kind: "resist"; readonly name: string };

export interface ProseBonus {
  /** The bonus as the sheet prints it, in the record's own words from the
   *  amount on ("+2 item bonus to saving throws against fear or charm
   *  effects"), a leading condition moved after it ("… while you are under
   *  the effects of razorclaw shifting") and targets a stat addition already
   *  carries left out. */
  readonly text: string;
  /** The signed amount (-5 for a penalty). */
  readonly amount: number;
  /** "feat", "item", "power"…; absent for an untyped bonus. */
  readonly bonusType?: string;
  readonly targets: readonly ProseBonusTarget[];
}

export interface ProseBonuses {
  readonly version: typeof PROSE_BONUSES_VERSION;
  readonly bonuses: readonly ProseBonus[];
}

/** A record's stored prose bonuses; empty without the field (none found, a
 *  pack built before it, another version). */
export function readProseBonuses(
  specifics: readonly { readonly name: string; readonly value: string }[],
): readonly ProseBonus[] {
  const raw = specifics.find(
    (specific) => specific.name === PROSE_BONUSES_FIELD,
  )?.value;
  if (raw === undefined) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProseBonuses>;
    return parsed.version === PROSE_BONUSES_VERSION &&
      Array.isArray(parsed.bonuses)
      ? parsed.bonuses
      : [];
  } catch {
    return [];
  }
}
