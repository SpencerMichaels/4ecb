import {
  ASSOCIATE_STAT_BLOCK_FIELD,
  readAssociateStatBlock,
  type AssociateAbilityName,
  type AssociateDefenseValues,
  type AssociateStatBlock,
} from "./associate-stat-block";

/**
 * A creature's stat block stored on a content record (D110): a mount's
 * `_Monster` block today, a summoned creature's later. The legacy-wotc import
 * parses the text once, at pack build, into the internal field
 * {@link CREATURE_STAT_BLOCK_FIELD} (versioned JSON); sheet-model reads it
 * back with {@link readCreatureStatBlock}. Two shapes:
 *
 * - `fixed`: a published monster block with its own numbers ("Riding Horse -
 *   Level 1 Brute", "HP 36; Bloodied 18", "Str 19 (+4)"), stored as printed.
 * - `master`: a creature written relative to its owner ("HP your bloodied
 *   value", "your level + 5 vs. AC"; the Celestial steeds), stored as an
 *   associate stat block (D107) whose numbers rules-engine
 *   `associateStatistics` works out from the owner's evaluated stats.
 */

/** The internal field holding the parsed stat block. */
export const CREATURE_STAT_BLOCK_FIELD = "_Creature Stat Block";
/** Bump when the stored shape or the parse changes; an older pack's field is
 *  ignored. */
export const CREATURE_STAT_BLOCK_VERSION = 1;

/** A power-icon letter of a monster block: m basic melee, M melee, R ranged,
 *  C close, A area. */
export type CreatureAttackKind =
  "basic-melee" | "melee" | "ranged" | "close" | "area";

/** A labeled part of an entry's text ("Trigger", "Effect (Free Action)"), or
 *  plain text. */
export interface CreatureEntryLine {
  readonly label?: string;
  readonly text: string;
}

/**
 * A power or trait of a monster block: "m Kick (standard; At-Will) ▪ Poison"
 * then its text.
 */
export interface CreatureEntry {
  readonly name: string;
  readonly attackKind?: CreatureAttackKind;
  /** The title's parenthesis, as printed: "standard, at-will", "while
   *  mounted by a friendly rider of 5th level or higher; at-will". */
  readonly usage?: string;
  /** After the title's "▪": "Mount, Poison". */
  readonly keywords?: string;
  readonly lines: readonly CreatureEntryLine[];
}

export interface CreatureAbilityScore {
  readonly score: number;
  /** As printed: a monster's modifier includes half its level. */
  readonly modifier: number;
}

export interface FixedCreatureStatBlock {
  readonly kind: "fixed";
  /** The block's own name: "Horse, Sea". */
  readonly name: string;
  readonly level?: number;
  /** "Brute", "Elite Skirmisher", "Minion Skirmisher". */
  readonly role?: string;
  readonly xp?: number;
  readonly size?: string;
  /** "natural beast (mount)". */
  readonly creatureType?: string;
  readonly initiative: number;
  readonly perception: number;
  /** "low-light vision", "tremorsense 10". */
  readonly senses?: string;
  readonly hitPoints: number;
  /** As printed; a minion has none. */
  readonly bloodied?: number;
  /** "a missed attack never damages a minion." */
  readonly hitPointsNote?: string;
  readonly defenses: AssociateDefenseValues;
  /** A defense's printed condition: "AC 29 against opportunity attacks". */
  readonly defensesNote?: string;
  /** "Immune fear (while bloodied only)", "Resist 10 cold, 10 fire",
   *  "Saving Throws +2", "Action Points 1". */
  readonly defenseTraits?: readonly string[];
  /** "10", "4, fly 10", "swim 11", "6, climb 6 (spider climb)". */
  readonly speed: string;
  readonly entries: readonly CreatureEntry[];
  readonly alignment?: string;
  /** Absent when the block prints "-". */
  readonly languages?: string;
  /** "Stealth +14". */
  readonly skills?: string;
  readonly abilities: Readonly<
    Record<AssociateAbilityName, CreatureAbilityScore>
  >;
  /** A "Description:" paragraph inside the block (Rage Drake). */
  readonly description?: string;
}

export interface MasterCreatureStatBlock {
  readonly kind: "master";
  readonly name: string;
  readonly block: AssociateStatBlock;
}

export type CreatureStatBlock = (
  FixedCreatureStatBlock | MasterCreatureStatBlock
) & { readonly version: typeof CREATURE_STAT_BLOCK_VERSION };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stat block stored on a record, or undefined when the record has none
 * (no block, or a pack built before D110) or the stored version is another.
 * The pack is verified and immutable, so only the envelope is checked.
 */
export function readCreatureStatBlock(
  specifics: readonly { readonly name: string; readonly value: string }[],
): CreatureStatBlock | undefined {
  const raw = specifics.find(
    (specific) => specific.name === CREATURE_STAT_BLOCK_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== CREATURE_STAT_BLOCK_VERSION ||
      typeof parsed.name !== "string"
    )
      return undefined;
    if (parsed.kind === "fixed")
      return isRecord(parsed.defenses) &&
        isRecord(parsed.abilities) &&
        Array.isArray(parsed.entries)
        ? (parsed as unknown as CreatureStatBlock)
        : undefined;
    if (parsed.kind === "master" && isRecord(parsed.block)) {
      const block = readAssociateStatBlock([
        {
          name: ASSOCIATE_STAT_BLOCK_FIELD,
          value: JSON.stringify(parsed.block),
        },
      ]);
      return block === undefined
        ? undefined
        : {
            version: CREATURE_STAT_BLOCK_VERSION,
            kind: "master",
            name: parsed.name,
            block,
          };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
