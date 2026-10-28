/**
 * An associate's stat block (D107): the creature an Associate record
 * describes only in prose ("HP your bloodied value", "Defenses your
 * defenses", "Attack: Melee 1 (one creature); your level + 5 vs. AC").
 *
 * The legacy-wotc import parses each Associate record's description once,
 * at pack build, and stores the result on the record as the internal field
 * {@link ASSOCIATE_STAT_BLOCK_FIELD} (versioned JSON). The rules engine reads
 * it back with {@link readAssociateStatBlock} and works out the numbers that
 * depend on the master (rules-engine `associateStatistics`). Nothing here is
 * a rule of its own: every value is the stat block's, as printed.
 */

/** The internal field holding the parsed stat block on an Associate record. */
export const ASSOCIATE_STAT_BLOCK_FIELD = "_Associate Stat Block";
/** Bump when the stored shape changes; an older pack's field is ignored. */
export const ASSOCIATE_STAT_BLOCK_VERSION = 1;

export type AssociateAbilityName =
  | "Strength"
  | "Constitution"
  | "Dexterity"
  | "Intelligence"
  | "Wisdom"
  | "Charisma";

export type AssociateDefenseName = "ac" | "fortitude" | "reflex" | "will";

export type AssociateDefenseValues = Readonly<
  Record<AssociateDefenseName, number>
>;

/** "HP your bloodied value" / "your healing surge value" / "HP 40". */
export type AssociateHitPoints =
  | { readonly kind: "master-bloodied" }
  | { readonly kind: "master-surge-value" }
  | { readonly kind: "fixed"; readonly value: number };

/**
 * "Defenses your defenses (+2 to AC and Fortitude), not including any
 * temporary bonuses or penalties" (`master`, with per-defense bonuses);
 * "(Add your level to each defense) AC 15, Fortitude 13, …" (`level`);
 * "AC 28, Fortitude 24, …" (`fixed`, a fixed-level creature).
 */
export type AssociateDefenses =
  | {
      readonly kind: "master";
      readonly bonus: AssociateDefenseValues;
    }
  | { readonly kind: "level"; readonly base: AssociateDefenseValues }
  | { readonly kind: "fixed"; readonly values: AssociateDefenseValues };

/** "Initiative equal to yours", "Perception equal to yours +2". */
export interface AssociateMasterCheck {
  readonly bonus: number;
}

/** One term of a damage expression after its dice. */
export type AssociateDamageTerm =
  | { readonly kind: "flat"; readonly value: number }
  | { readonly kind: "dice"; readonly dice: string }
  | { readonly kind: "half-level" }
  | { readonly kind: "level" }
  /** "your Wisdom modifier"; several abilities: "your Strength or Charisma
   *  modifier", one of them. */
  | {
      readonly kind: "ability";
      readonly abilities: readonly AssociateAbilityName[];
    }
  | { readonly kind: "highest-ability" };

/**
 * The damage of a hit line: "1d8 + one-half your level", its damage type
 * words ("fire", "lightning and thunder") and, for a level step, whether it
 * replaces the expression or adds to it.
 */
export interface AssociateDamage {
  readonly terms: readonly AssociateDamageTerm[];
  readonly damageType?: string;
}

/** "Level 21: 2d8 + one-half your level damage." */
export interface AssociateDamageStep {
  readonly level: number;
  readonly damage: AssociateDamage;
  /** The step's own text after its damage, if any. */
  readonly rest?: string;
}

/** "Melee 1 (one creature); your level + 5 vs. AC". */
export interface AssociateAttack {
  /** "Melee 1 (one creature)". */
  readonly range: string;
  /** Absent when the line prints none (Quasit's Vengeful Temptation). */
  readonly bonus?:
    | { readonly kind: "level"; readonly plus: number }
    | { readonly kind: "fixed"; readonly value: number };
  readonly defense?: string;
}

/** A labeled line of a power or trait: Trigger, Effect, Attack, Hit, … */
export interface AssociateLine {
  /** "Attack", "Hit", "Effect (Free Action)"; absent for plain text. */
  readonly label?: string;
  readonly text: string;
  readonly attack?: AssociateAttack;
  /** A hit line's leading damage expression; `rest` follows "damage". */
  readonly damage?: AssociateDamage;
  readonly rest?: string;
  /** Level steps of this hit line ("Level 21: …"), lowest first. */
  readonly steps?: readonly AssociateDamageStep[];
}

/** A trait (an aura, a passive benefit) or a power of the stat block. */
export interface AssociateEntry {
  readonly name: string;
  /** "teleportation", "fire"; as printed in the title's parentheses. */
  readonly keywords?: string;
  /** "At-Will", "Encounter", "At-Will (1/round)", "Recharge (…)". */
  readonly usage?: string;
  readonly aura?: number;
  readonly lines: readonly AssociateLine[];
}

export interface AssociatePower extends AssociateEntry {
  /** The stat-block section: Standard, Minor, Move, Triggered, … */
  readonly action: string;
}

export interface AssociateStatBlock {
  readonly version: typeof ASSOCIATE_STAT_BLOCK_VERSION;
  /** "Fey Beast Companion", "Summoned Creature", "Elemental Companion". */
  readonly role?: string;
  /** A fixed-level creature ("Level 12 Summoned Creature"). */
  readonly level?: number;
  /** "Medium", "Large", … */
  readonly size?: string;
  /** "fey beast", "elemental magical beast (air)". */
  readonly creatureType?: string;
  readonly hitPoints: AssociateHitPoints;
  /** The rest of the HP line: "a missed attack never damages the companion". */
  readonly hitPointsNote?: string;
  /** "none, but you can spend a healing surge for the … if …". */
  readonly healingSurges?: string;
  readonly defenses: AssociateDefenses;
  /** "not including any temporary bonuses or penalties". */
  readonly defensesNote?: string;
  /** "Resist 10 fire", "Vulnerable 5 fire", "Immune petrification". */
  readonly defenseTraits?: readonly string[];
  readonly initiative?: AssociateMasterCheck;
  readonly perception?: AssociateMasterCheck;
  /** "7", "6, fly 8", "0, fly 6 (hover; altitude limit 2)"; "" when the
   *  stat block prints the label with no value. */
  readonly speed?: string;
  readonly senses?: string;
  readonly traits: readonly AssociateEntry[];
  readonly powers: readonly AssociatePower[];
  readonly abilities?: Readonly<Record<AssociateAbilityName, number>>;
  /** Trailing lines such as "Alignment: Chaotic Evil  Languages: …". */
  readonly other?: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stat block stored on an Associate record, or undefined when the record
 * has none (a pack built before D107) or the stored version is another.
 * The pack is verified and immutable, so only the envelope is checked.
 */
export function readAssociateStatBlock(
  specifics: readonly { readonly name: string; readonly value: string }[],
): AssociateStatBlock | undefined {
  const raw = specifics.find(
    (specific) => specific.name === ASSOCIATE_STAT_BLOCK_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== ASSOCIATE_STAT_BLOCK_VERSION ||
      !isRecord(parsed.hitPoints) ||
      !isRecord(parsed.defenses) ||
      !Array.isArray(parsed.traits) ||
      !Array.isArray(parsed.powers)
    )
      return undefined;
    return parsed as unknown as AssociateStatBlock;
  } catch {
    return undefined;
  }
}
