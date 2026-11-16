/**
 * The part of a magic item's description that says what it does, which the
 * printed card prints after the item's rules (owner, 2026-11-16: "the
 * printable cards are for mechanics, not flavor"): an artifact's
 * concordance table and the concordance states after it ("Pleased (16–20)"
 * … "Moving On"), and a cursed item's curse rules. Goals, roleplaying, an
 * intelligent item's communication and persona and any other lore stay in
 * the builder pane only. The legacy-wotc import finds it once, at pack
 * build, and stores it as {@link ITEM_RULES_TEXT_FIELD} (versioned JSON);
 * sheet-model's item card reads it back with {@link readItemRulesText}.
 */

/** The internal field holding a magic item's printed description part. */
export const ITEM_RULES_TEXT_FIELD = "_Item Rules Text IR";
/** Bump when the detection or the stored shape changes. */
export const ITEM_RULES_TEXT_VERSION = 1;

export interface ItemRulesText {
  readonly version: typeof ITEM_RULES_TEXT_VERSION;
  /** What the text is: an artifact's concordance and states, or a
   *  cursed item's curse rules. */
  readonly kind: "concordance" | "curse";
  /** The description from that part on, exactly as authored. */
  readonly text: string;
}

/** A record's stored rules text; undefined without the field (no such part,
 *  a pack built before it, another version). */
export function readItemRulesText(
  specifics: readonly { readonly name: string; readonly value: string }[],
): ItemRulesText | undefined {
  const raw = specifics.find(
    (specific) => specific.name === ITEM_RULES_TEXT_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<ItemRulesText>;
    return parsed.version === ITEM_RULES_TEXT_VERSION &&
      (parsed.kind === "concordance" || parsed.kind === "curse") &&
      typeof parsed.text === "string" &&
      parsed.text.trim() !== ""
      ? (parsed as ItemRulesText)
      : undefined;
  } catch {
    return undefined;
  }
}
