/**
 * Power text IR: what the rules engine reads from a power's Attack, Hit and
 * Effect prose, parsed once. The legacy-wotc import parses every Power
 * record's attack, hit and effect fields (and every `modify` value that
 * replaces one) at pack build and stores the result on the record as the
 * internal field {@link POWER_TEXT_FIELD} (versioned JSON, keyed by the exact
 * text). The rules engine looks a field's effective text up there and only
 * resolves what depends on the character: the level step, the weapon in hand
 * (thrown, ranged), ability modifiers and bonuses.
 *
 * Every fact here is a pure function of one text; the parsers are the ones
 * the engine used to run on each evaluation (native CalcStatVsDefense,
 * AttackPowerModRepl, HigherLevelDamage/ParseIncreaseLine, ParseWeaponDmg,
 * ParseAbilityMod, CalcDamage, WhichAttack), moved here unchanged. The engine
 * still parses text the pack does not carry (a pack built before this field,
 * a house rule's `modify`), memoized by text.
 */

import type { PowerFieldBonuses } from "./power-field-bonuses";
import { PREREQUISITE_IR_FIELD } from "./prerequisite-ir";

/** The internal field holding a record's parsed power texts. */
export const POWER_TEXT_FIELD = "_Power Text IR";
/** Bump when the stored shape or any parse changes; an older pack's field
 *  is then ignored and the engine parses the text itself. 3: a summoned
 *  creature's command rolls (D111). */
export const POWER_TEXT_VERSION = 3;

export const POWER_TEXT_ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

export type PowerTextAbility = (typeof POWER_TEXT_ABILITIES)[number];

/** A power's attack, hit and attack-type fields in authored order (native
 *  field names: "Attack", "Secondary Hit", "Tertiary Targets", …): the
 *  field's ordinal on the record (SpecificField.ordinal), what an attack
 *  reads it as, and the attack ordinal it belongs to. */
export type PowerAttackSlot = readonly [
  specific: number,
  role: "target" | "attack" | "hit" | "attack-type",
  ordinal: number,
];

/** The "+N" an attack line adds, by level (native CalcStatVsDefense and
 *  AttackPowerModRepl). */
export interface AttackBonusIr {
  /** "+ 1 per enemy adjacent to you vs." (Valiant Strike): always 0. */
  readonly perAdjacentEnemy?: true;
  /** The first line's signed "<ability> + N" / "<ability> -N". */
  readonly base?: number;
  /** An exact native AttackPowerModRepl increase line's tier values. */
  readonly tier?: { readonly paragon?: number; readonly epic: number };
  /** "Level 11: … + 4", "Increase to +4 bonus at 11th level", in order;
   *  the last one at or below the level wins. */
  readonly steps?: readonly {
    readonly level: number;
    readonly bonus: number;
  }[];
}

/** One attack line as a weapon row reads it (after the thrown/dual split). */
export interface AttackLineIr {
  /** The defense after "vs." (ATTACK_LINE_PATTERN); absent: "Unknown". */
  readonly defense?: string;
  /** "Beast's attack bonus + N vs. AC": the line's own "+N" (0 if none). */
  readonly beastBonus?: number;
  /** "Your level + 5 vs. Will": a summoned creature's fixed attack. */
  readonly levelAttack?: { readonly bonus: number; readonly defense: string };
  /** The special phrase left of " vs": "Highest Mental Ability", "your
   *  highest ability", "Chosen Ability". */
  readonly special?: "highest-mental" | "highest" | "chosen";
  /** The abilities the line names (whole words). */
  readonly abilities?: readonly PowerTextAbility[];
  /** "Primary ability" left of " vs". */
  readonly primaryAbility?: true;
  readonly bonus: AttackBonusIr;
}

/** An attack line after the thrown-weapon alternative: one line, or a dual
 *  power's melee and ranged alternatives (native WhichAttack). */
export type AttackChoiceIr =
  | { readonly line: AttackLineIr }
  | { readonly alternatives: readonly [AttackLineIr, AttackLineIr] };

/** An Attack field's text. */
export interface AttackFieldIr {
  /** Names a defense ("vs. AC"): an attack line at all. */
  readonly isAttack: boolean;
  /** Hawk's Talon's power bonus sentence (native ExtractPowerMods). */
  readonly wisdomPowerBonus?: true;
  /** Valiant Strike's "+ 1 per enemy adjacent to you vs." anywhere. */
  readonly perAdjacentEnemy?: true;
  /** Mentions a beast ("beast's"). */
  readonly beast?: true;
  /** Names the off-hand / main weapon. */
  readonly offHand?: true;
  readonly mainWeapon?: true;
  /** The defenses its "vs." phrases name (AC, Fortitude, Reflex, Will). */
  readonly defenses?: readonly string[];
  /** The line as authored, for a power not yet part of the character;
   *  absent when it is `other`'s single line (`authoredAttackLine`). */
  readonly raw?: AttackLineIr;
  /** With a thrown weapon, when "<A> (thrown weapon) or <B>" differs. */
  readonly thrown?: AttackChoiceIr;
  /** With any other weapon (or always, without that phrase). */
  readonly other: AttackChoiceIr;
}

/** A hit text's damage expression, as one weapon row reads it. */
export interface DamageClauseIr {
  /** "N[B]" or a beast's ability modifier: the beast deals the damage. */
  readonly beastHit?: true;
  /** Each N[W] term of the expression, "(off-hand …)" ones flagged. */
  readonly weaponTerms?: readonly {
    readonly count: number;
    readonly offhand?: true;
  }[];
  /** The clause's first "NdM". */
  readonly fixedDice?: string;
  /** Native CalcDamage's "+ NdM" terms in the "+ …" chain after the first
   *  N[W] term ("1[W] + 1d8 + Wisdom modifier"): ParseAbilityMod appends
   *  each to the weapon dice. */
  readonly weaponAddedDice?: readonly string[];
  /** Native CalcDamage's dice-less flat damage constant. */
  readonly flatBase?: number;
  /** "<Ability> modifier" terms of the expression (beast's ones removed). */
  readonly modifierAbilities?: readonly PowerTextAbility[];
  /** "highest ability modifier", "chosen ability modifier", "ability
   *  modifier", in that precedence. */
  readonly abilityPhrase?: "highest" | "chosen" | "ability";
  /** Abilities the expression names at all. */
  readonly listedAbilities?: readonly PowerTextAbility[];
  /** The expression has an " or ". */
  readonly hasOr?: true;
  /** Abilities written "twice [your] X modifier". */
  readonly twice?: readonly PowerTextAbility[];
  /** The expression's "+ N … damage". */
  readonly powerDamageBonus?: number;
  /** Lower-cased damage types ("fire and radiant"). */
  readonly damageType?: string;
  /** The same expression as a beast companion's damage (native
   *  FigureWeaponDice with is_beast, ParseBeastAbilityMod). */
  readonly beast: {
    /** "N[B]" count, else the first "NdM" of the expression. */
    readonly beastDice?: number;
    readonly fixedDice?: string;
    /** Each "beast's X modifier" in order; "ability" for the record's. */
    readonly beastAbilities?: readonly (PowerTextAbility | "ability")[];
    /** The character's own "X modifier" terms. */
    readonly ownAbilities?: readonly PowerTextAbility[];
    /** Flat "+ N" terms. */
    readonly flatBonus?: number;
  };
}

/** Native SpecialCase hit lines CalcDamage cannot parse (`-Module-.cs`
 *  ~24430). */
export type SpecialHitIr =
  | "strength-modifier"
  | "as-above"
  | "damage-you-took"
  | "ongoing-10"
  | "ongoing-10-dexterity"
  | "warlocks-bargain"
  | "final-reproach";

/** A hit line after the thrown-weapon alternative. */
export interface HitVariantIr {
  readonly special?: SpecialHitIr;
  readonly ongoing?: true;
  /** One clause, or a "(melee …) or … (ranged …)" line's melee and ranged
   *  clauses. */
  readonly clauses:
    readonly [DamageClauseIr] | readonly [DamageClauseIr, DamageClauseIr];
}

export type PowerRecoveryKind =
  "temporary-hit-points" | "healing-surge" | "healing";

export interface PowerRecoveryIr {
  readonly kind: PowerRecoveryKind;
  readonly expression: string;
}

/** One hit line a level selects. */
export interface HitLineIr {
  /** Mentions "damage". */
  readonly damage?: true;
  /** "your beast's Strength modifier": a beast companion's damage. */
  readonly companionAbility?: true;
  /** "N[B]" or a companion ability: the beast deals the damage. */
  readonly beastHit?: true;
  /** Names the off-hand / main weapon. */
  readonly offHand?: true;
  readonly mainWeapon?: true;
  readonly recoveries?: readonly PowerRecoveryIr[];
  /** With a thrown weapon, when "<A> (thrown weapon) or <B>" differs. */
  readonly thrown?: HitVariantIr;
  readonly other: HitVariantIr;
}

/** A Hit field's text: the line each level reads (native
 *  HigherLevelDamage: a "Level N:" line, else an increase sentence's
 *  clause, else the first line). The last step at or below the level
 *  applies; the first has no `from`. */
export interface HitFieldIr {
  /** The whole text names a beast companion's ability modifier. */
  readonly companionAbility?: true;
  readonly steps: readonly {
    readonly from?: number;
    readonly line: HitLineIr;
  }[];
}

/** Every facet of one text the engine may read it as. */
export interface PowerTextEntry {
  readonly attack?: AttackFieldIr;
  readonly hit?: HitFieldIr;
  /** An Effect field's healing and temporary hit point expressions. */
  readonly recoveries?: readonly PowerRecoveryIr[];
}

/** The stored field: a power's attack slots and its parsed texts. */
export interface PowerTextStore {
  readonly version: typeof POWER_TEXT_VERSION;
  readonly slots?: readonly PowerAttackSlot[];
  /** A field names a "summoned creature" (Servant of the Staff's stat
   *  block). */
  readonly summonedCreature?: true;
  /** Its native field riders (CalcMisc, CalcBeast, CalcBonuses). */
  readonly fieldBonuses?: PowerFieldBonuses;
  readonly texts: Readonly<Record<string, PowerTextEntry>>;
}

const lower = (value: string) => value.trim().toLocaleLowerCase();

/** `{ [key]: values }`, or nothing for none: the stored IR omits empty
 *  lists and zero numbers. */
function listed<K extends string, T>(
  key: K,
  values: readonly T[],
): Partial<Record<K, readonly T[]>> {
  return values.length === 0
    ? {}
    : ({ [key]: values } as Record<K, readonly T[]>);
}

function nonZero<K extends string>(
  key: K,
  value: number,
): Partial<Record<K, number>> {
  return value === 0 ? {} : ({ [key]: value } as Record<K, number>);
}

const isAbility = (name: string) =>
  POWER_TEXT_ABILITIES.some((ability) => lower(ability) === lower(name));

/* ---------------------------------------------------------------- slots */

const attackOrdinals = new Map([
  ["primary", 1],
  ["secondary", 2],
  ["tertiary", 3],
  ["quaternary", 4],
]);

function attackOrdinal(name: string): number | undefined {
  const match = name
    .trim()
    .match(/^(primary|secondary|tertiary|quaternary)\s+/i);
  return match?.[1] === undefined
    ? undefined
    : attackOrdinals.get(lower(match[1]));
}

/**
 * The fields an attack reads, with the attack ordinal each belongs to: a
 * "Secondary …" name sets the ordinal for the fields after it.
 */
export function powerAttackSlots(
  specifics: readonly {
    readonly name: string;
    readonly ordinal: number;
  }[],
): PowerAttackSlot[] {
  const slots: PowerAttackSlot[] = [];
  let activeOrdinal = 1;
  for (const specific of [...specifics].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const name = specific.name.trim();
    const namedOrdinal = attackOrdinal(name);
    if (namedOrdinal !== undefined) activeOrdinal = namedOrdinal;
    const ordinal = namedOrdinal ?? activeOrdinal;
    const slot = (role: PowerAttackSlot[1]) =>
      slots.push([specific.ordinal, role, ordinal]);
    if (/targets?$/i.test(name)) slot("target");
    if (/attack$/i.test(name)) slot("attack");
    if (/^(?:(?:primary|secondary|tertiary|quaternary)\s+)?hit$/i.test(name))
      slot("hit");
    if (/attack type$/i.test(name)) slot("attack-type");
  }
  return slots;
}

/** A field of the record names a "summoned creature". */
export function namesSummonedCreature(
  specifics: readonly { readonly name: string; readonly value: string }[],
): boolean {
  return specifics.some(
    (specific) =>
      specific.name !== POWER_TEXT_FIELD &&
      specific.name !== PREREQUISITE_IR_FIELD &&
      /\bsummoned creature\b/i.test(specific.value),
  );
}

/* --------------------------------------------------------- attack lines */

/**
 * Native ExtractPowerMods (`-Module-.cs` ~23703): this exact attack-line
 * sentence (Hawk's Talon) adds a power bonus equal to the Wisdom modifier.
 */
const WISDOM_POWER_BONUS_SENTENCE =
  ". Gain a power bonus to this attack equal to your Wisdom modifier.";

function withoutExtractedPowerBonus(line: string): string {
  const start = line
    .toLocaleLowerCase()
    .indexOf(WISDOM_POWER_BONUS_SENTENCE.toLocaleLowerCase());
  return start < 0
    ? line
    : `${line.slice(0, start)}.${line.slice(start + WISDOM_POWER_BONUS_SENTENCE.length)}`;
}

/**
 * "<Ability> (thrown weapon) or <Ability>" (Reactive Shot's attack and hit
 * lines): a thrown weapon takes the first ability, any other weapon the
 * second, for attack and damage alike. Divergence (D105, Martial Power 2
 * p41): native WhichAttack splits this at ") or " by ranged-ness, so a bow
 * attacks with Dexterity but its damage reads the first ability, Strength,
 * which the text contradicts.
 */
export function thrownWeaponAlternative(
  line: string,
  thrownWeapon: boolean,
): string {
  return line.replace(
    /\b([A-Za-z]+) \(thrown weapon\) or ([A-Za-z]+)\b/giu,
    (whole, thrown: string, other: string) =>
      isAbility(thrown) && isAbility(other)
        ? thrownWeapon
          ? thrown
          : other
        : whole,
  );
}

/**
 * Native WhichAttack/IsDualPower (`-Module-.cs` ~23628): a dual power's
 * attack line splits at its first ") or " (else " with a melee weapon or
 * two "); a ranged weapon takes the second alternative, anything else the
 * first. Only lines naming both a melee and a ranged alternative split.
 */
function dualAttackAlternatives(
  line: string,
): readonly [string, string] | undefined {
  const twoWeapons = / with a melee weapon or two /i.exec(line);
  if (twoWeapons !== null)
    return [
      line.slice(0, twoWeapons.index),
      line.slice(twoWeapons.index + twoWeapons[0].length),
    ];
  if (!/\(melee[^]*\sor\s[^]*\(ranged/i.test(line)) return undefined;
  const split = line.toLowerCase().indexOf(") or ");
  return split < 0
    ? undefined
    : [line.slice(0, split + 1), line.slice(split + ") or ".length)];
}

const ATTACK_LINE_PATTERN = /^(.*?)\s+vs\.?\s+([A-Za-z]+)/i;
/** Legacy CalcBAB: an attack line made with "Beast's attack bonus". */
const BEAST_ATTACK_LINE = /^\s*(?:your\s+)?beast(?:'s)?\s+attack\s+bonus\b/i;
/** A summoned creature's fixed attack line: "your level + 5 vs. Will". */
const LEVEL_ATTACK_LINE =
  /^\s*(?:your\s+)?level\s*\+\s*(\d+)\s+vs\.?\s+([A-Za-z]+)/i;
/**
 * Native CalcStatVsDefense (-Module-.cs ~23818): an attack stat ending
 * "+ 1 per enemy adjacent to you" (Valiant Strike) adds no number.
 */
const PER_ADJACENT_ENEMY_ATTACK =
  /\+\s*1 per enemy adjacent to you\s+vs\.?\s/iu;

/**
 * Native AttackPowerModRepl (D20RulesEngine `-Module-.cs`, around 23530):
 * exact increase lines whose 11th- and 21st-level bonuses the generic parse
 * would only half read. The value replaces the line's `+N`.
 */
const NATIVE_INCREASE_LINES: readonly {
  readonly text: string;
  readonly paragon: number;
  readonly epic: number;
}[] = [
  {
    text: "Increase to +6 at 11th level, +8 at 21st level.",
    paragon: 6,
    epic: 8,
  },
  {
    text: "Increase to +6 bonus at 11th level and +8 bonus at 21st level.",
    paragon: 6,
    epic: 8,
  },
  {
    text: "Increase the bonus to attack rolls to +4 at 11th level and +6 at 21st level",
    paragon: 4,
    epic: 6,
  },
  {
    text: "Increase to +4 bonus at 11th level, and to +6 at 21st level",
    paragon: 4,
    epic: 6,
  },
  {
    text: "Increase to +4 bonus at 11th level, and to +6 bonus at 21st level",
    paragon: 4,
    epic: 6,
  },
];

function attackBonus(line: string): AttackBonusIr {
  const normalized = lower(line.replace(/\s+/g, " "));
  const native = NATIVE_INCREASE_LINES.find(({ text }) =>
    normalized.includes(lower(text)),
  );
  const firstLine = line.split("\n")[0] ?? line;
  // Native CalcStatVsDefense (-Module-.cs ~23811) reads a signed number
  // after any word of the attack stat: '+' adds, '-' or '–' subtracts.
  // "Strength + 2", "Your highest ability modifier + 6", "Your highest
  // ability score +9", "Strength -2 vs. AC", "Dexterity – 2 vs. AC".
  const signed = firstLine.match(
    /(?:ability|strength|constitution|dexterity|intelligence|wisdom|charisma)(?:\s+score)?(?:\s+modifier)?\s*([+\-–])\s*(\d+)/i,
  );
  const base =
    signed === null ? 0 : (signed[1] === "+" ? 1 : -1) * Number(signed[2]);
  const steps: { level: number; bonus: number }[] = [];
  for (const match of line.matchAll(
    /(?:Level\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+level)?\s*:\s*[^\n]*?\+\s*(\d+)|Increase\s+to\s+\+(\d+)\s+bonus\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/gi,
  )) {
    const threshold = Number(match[1] ?? match[4]);
    const candidate = Number(match[2] ?? match[3]);
    if (Number.isFinite(candidate))
      steps.push({ level: threshold, bonus: candidate });
  }
  return {
    ...(PER_ADJACENT_ENEMY_ATTACK.test(firstLine)
      ? { perAdjacentEnemy: true as const }
      : {}),
    ...nonZero("base", base),
    ...(native === undefined
      ? {}
      : { tier: { paragon: native.paragon, epic: native.epic } }),
    ...listed("steps", steps),
  };
}

function attackLine(line: string): AttackLineIr {
  const attack = line.match(ATTACK_LINE_PATTERN);
  const left = (attack?.[1] ?? "").trim();
  const level = LEVEL_ATTACK_LINE.exec(line);
  const special = /^highest mental ability$/i.test(left)
    ? ("highest-mental" as const)
    : /^(?:your\s+)?highest ability\b/i.test(left)
      ? ("highest" as const)
      : /^chosen ability\b/i.test(left)
        ? ("chosen" as const)
        : undefined;
  return {
    ...(attack?.[2] === undefined ? {} : { defense: attack[2] }),
    ...(BEAST_ATTACK_LINE.test(line)
      ? {
          beastBonus: Number(
            /attack\s+bonus\s*\+\s*(\d+)/i.exec(line)?.[1] ?? 0,
          ),
        }
      : {}),
    ...(level === null
      ? {}
      : {
          levelAttack: {
            bonus: Number(level[1]),
            defense: level[2] ?? "Unknown",
          },
        }),
    ...(special === undefined ? {} : { special }),
    ...listed(
      "abilities",
      POWER_TEXT_ABILITIES.filter((ability) =>
        new RegExp(`\\b${ability}\\b`, "i").test(line),
      ),
    ),
    ...(/primary ability/i.test(attack?.[1] ?? "")
      ? { primaryAbility: true as const }
      : {}),
    bonus: attackBonus(line),
  };
}

function attackChoice(line: string): AttackChoiceIr {
  const alternatives = dualAttackAlternatives(line);
  return alternatives === undefined
    ? { line: attackLine(line) }
    : {
        alternatives: [
          attackLine(alternatives[0]),
          attackLine(alternatives[1]),
        ],
      };
}

const defenseNames = ["AC", "Fortitude", "Reflex", "Will"] as const;

const OFF_HAND = /\boff[- ]hand(?: weapon)?\b/i;
const MAIN_WEAPON = /\bmain(?:[- ]hand)? weapon\b/i;

/** An Attack field's text, parsed. */
export function parseAttackField(value: string): AttackFieldIr {
  const line = value.trim();
  const stripped = withoutExtractedPowerBonus(line);
  const thrown = thrownWeaponAlternative(stripped, true);
  const other = thrownWeaponAlternative(stripped, false);
  const defenses = new Set<string>();
  for (const match of line.matchAll(/\bvs\.?\s+([A-Za-z]+)/gi)) {
    const defense = defenseNames.find((name) =>
      lower(name).startsWith(lower(match[1]!).slice(0, 3)),
    );
    if (defense !== undefined) defenses.add(defense);
  }
  const otherChoice = attackChoice(other);
  return {
    isAttack: /\bvs\.?\s+[A-Za-z]+/i.test(value),
    ...(line
      .toLocaleLowerCase()
      .includes(WISDOM_POWER_BONUS_SENTENCE.toLocaleLowerCase())
      ? { wisdomPowerBonus: true as const }
      : {}),
    ...(PER_ADJACENT_ENEMY_ATTACK.test(line)
      ? { perAdjacentEnemy: true as const }
      : {}),
    ...(/\bbeast(?:'s)?\b/i.test(line) ? { beast: true as const } : {}),
    ...(OFF_HAND.test(line) ? { offHand: true as const } : {}),
    ...(MAIN_WEAPON.test(line) ? { mainWeapon: true as const } : {}),
    ...listed("defenses", [...defenses]),
    ...(other === line && "line" in otherChoice
      ? {}
      : { raw: attackLine(line) }),
    ...(thrown === other ? {} : { thrown: attackChoice(thrown) }),
    other: otherChoice,
  };
}

/** The attack line as authored (`AttackFieldIr.raw`). */
export function authoredAttackLine(field: AttackFieldIr): AttackLineIr {
  return (
    field.raw ??
    ("line" in field.other ? field.other.line : field.other.alternatives[0])
  );
}

/* ------------------------------------------------------------ hit lines */

/**
 * Native ParseIncreaseLine (D20RulesEngine `-Module-.cs`, around 24512):
 * exact increase sentences it rewrites before parsing. Kelemvor's Judgment
 * omits "level" after later thresholds, which the parse needs to step on;
 * the dragonborn and genasi breath lines lead with an attack bonus.
 */
const NATIVE_INCREASE_REWRITES: readonly {
  readonly text: string;
  readonly rewrite: string;
}[] = [
  {
    text: "Increase damage to 2d12 at 5th level, 3d12 at 11th, 4d12 at 15th, 5d12 at 21st, and 6d12 at 25th.",
    rewrite:
      "Increase damage to 2d12 + wisdom modifier damage at 5th level, 3d12 + wisdom modifier damage at 11th level, 4d12 + wisdom modifier damage at 15th level, 5d12 + wisdom modifier damage at 21st level, and 6d12 + wisdom modifier damage at 25th level.",
  },
  {
    text: "Increase damage to 2d12 + Wisdom modifier at 5th level, 3d12 + Wisdom modifier at 11th, 4d12 + Wisdom modifier at 15th, 5d12 + Wisdom modifier at 21st, and 6d12 + Wisdom modifier at 25th.",
    rewrite:
      "Increase damage to 2d12 + Wisdom modifier at 5th level, 3d12 + Wisdom modifier at 11th level, 4d12 + Wisdom modifier at 15th level, 5d12 + Wisdom modifier at 21st level, and 6d12 + Wisdom modifier at 25th level.",
  },
  {
    text: "Increase to +4 bonus and 2d6 + Constitution modifier damage at 11th level, and to +6 bonus and 3d6 + Constitution modifier damage at 21st level.",
    rewrite:
      "Increase damage to 2d6 + Constitution modifier damage at 11th level, and 3d6 + Constitution modifier damage at 21st level.",
  },
  {
    text: "Increase to +4 bonus and 2d6 + Dexterity modifier damage at 11th level, and to +6 bonus and 3d6 + Dexterity modifier damage at 21st level.",
    rewrite:
      "Increase damage to 2d6 + Dexterity modifier damage at 11th level, and 3d6 + Dexterity modifier damage at 21st level.",
  },
];

/**
 * Native HigherLevelDamage → ParseIncreaseLine: from the first "Increase
 * damage to " (else "Increase to "), anywhere in the hit text and in any
 * case, each clause from its first digit up to " at N" replaces the damage
 * once the character reaches level N; the next clause starts at the
 * following " level". Each clause with its threshold, in order.
 */
function increaseClauses(
  hit: string,
): { readonly threshold: number; readonly damage: string }[] {
  const lowered = hit.toLowerCase();
  let start = lowered.indexOf("increase damage to ");
  if (start < 0) start = lowered.indexOf("increase to ");
  if (start < 0) return [];
  const sentence = hit.slice(start).replace(/\r\n/g, "\n");
  let rest =
    NATIVE_INCREASE_REWRITES.find(({ text }) => lower(text) === lower(sentence))
      ?.rewrite ?? sentence;
  const clauses: { threshold: number; damage: string }[] = [];
  for (;;) {
    const digit = rest.search(/\d/);
    if (digit < 0) break;
    let clause = rest.slice(digit);
    // Divergence (D105): native takes the clause from its first digit, so
    // a "+4 bonus and 2d8 + ... damage" clause it does not rewrite (Sun
    // Flare, Improved Razor Storm) reads as "4 bonus and 2d8 ..."; the
    // power text and native's own breath rewrites mean the damage after it.
    const bonusLead =
      rest[digit - 1] === "+" ? /^\d+\s+bonus,?\s+and\s+/i.exec(clause) : null;
    if (bonusLead !== null) clause = clause.slice(bonusLead[0].length);
    const at = clause.toLowerCase().indexOf(" at ");
    if (at < 0) break;
    const threshold = /^\d+/.exec(clause.slice(at + 4))?.[0];
    if (threshold !== undefined)
      clauses.push({
        threshold: Number(threshold),
        damage: clause.slice(0, at),
      });
    const next = clause.toLowerCase().indexOf(" level", at);
    if (next < 0) break;
    rest = clause.slice(next);
  }
  return clauses;
}

/** The hit line a level reads: native HigherLevelDamage (a "Level N:" line,
 *  which wins over an increase sentence, else the increase clause, else
 *  the first line). */
function hitLineAtLevel(value: string, level: number): string {
  const first = value.split("\n")[0] ?? "";
  let selected: string | undefined;
  let selectedLevel = 0;
  for (const line of value.split("\n").slice(1)) {
    const match = line.match(/^Level\s+(\d+):\s*(.*)$/i);
    if (
      match?.[1] !== undefined &&
      match[2] !== undefined &&
      Number(match[1]) <= level &&
      Number(match[1]) >= selectedLevel
    ) {
      selectedLevel = Number(match[1]);
      selected = match[2];
    }
  }
  if (selected !== undefined) return selected;
  let damage: string | undefined;
  for (const clause of increaseClauses(value))
    if (level >= clause.threshold) damage = clause.damage;
  return damage ?? first;
}

/** Every level at which `hitLineAtLevel` may change. */
function hitLevelThresholds(value: string): number[] {
  const thresholds = new Set<number>();
  for (const line of value.split("\n").slice(1)) {
    const match = line.match(/^Level\s+(\d+):\s*(.*)$/i);
    if (match?.[1] !== undefined && match[2] !== undefined)
      thresholds.add(Number(match[1]));
  }
  for (const clause of increaseClauses(value)) thresholds.add(clause.threshold);
  return [...thresholds].sort((left, right) => left - right);
}

function hasCompanionAbilityDamage(hitLine: string): boolean {
  return /\b(?:your\s+)?beast(?:'s)?\s+(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\b/i.test(
    hitLine,
  );
}

function withoutCompanionAbilityDamage(value: string): string {
  return value.replace(
    /\b(?:your\s+)?beast(?:'s)?\s+(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\b/gi,
    "",
  );
}

function isBeastHit(hit: string): boolean {
  return /\d+\s*\[B\]/i.test(hit) || hasCompanionAbilityDamage(hit);
}

/** "beast's Strength modifier", "your beast's ability modifier", and the
 *  content's "beast Strength's modifier" typo. */
const BEAST_ABILITY_DAMAGE =
  /\b(?:your\s+)?beast(?:'s)?\s+(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma|ability)(?:'s)?\s+modifier\b/gi;

const DAMAGE_TYPES =
  /\b(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)(?:\s*(?:,|and|or)\s*(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder))*\b/i;

/**
 * Native CalcDamage for a damage expression without dice: the hit text up to
 * its first " damage" (none when a sentence ends before it) whose first word
 * is a number ("10 damage") or a modifier ("Wisdom modifier damage"), though
 * an "ongoing 10" rider follows; Sudden Slime's "Ability modifier acid
 * damage" is the highest ability modifier (ParseAbilityMod). The
 * expression's own constant, or undefined when it is not flat damage.
 */
function nativeFlatDamageBase(hitClause: string): number | undefined {
  const end = hitClause.toLocaleLowerCase().indexOf(" damage");
  if (end < 0) return undefined;
  const sentence = hitClause.indexOf(".");
  if (sentence >= 0 && sentence < end) return undefined;
  const expression = hitClause.slice(0, end).trim();
  if (/\d+d\d+|\[[WB]\]/iu.test(expression)) return undefined;
  const leading = /^(\d+)(?:\s|$)/u.exec(expression)?.[1];
  if (leading !== undefined) return Number(leading);
  if (
    new RegExp(
      `^(?:twice\\s+)?(?:${POWER_TEXT_ABILITIES.join("|")}|ability|highest) modifier\\b`,
      "iu",
    ).test(expression)
  )
    return 0;
  return undefined;
}

/** Native ParseWeaponDmg's N[W] terms, "(off-hand …)" ones flagged. D105:
 *  also "(off-hand)" (Deceptive Steel) and "(off-hand end)" (Binding
 *  Cahulaks). */
const WEAPON_TERM = /(\d*)\[W\]( \(off-hand(?: weapon| end)?\))?/giu;

/**
 * Native CalcDamage (`-Module-.cs` ~24860-24930): after the first damage
 * term it reads consecutive "+ <word>" terms (skipping "your"/"twice", an
 * "(off-hand weapon)" and a following " modifier "), stopping at anything
 * else ("plus", "or", "damage"). ParseAbilityMod's digit branch (~24364)
 * appends a dice word ("1d8") to the damage; this returns those words.
 */
function weaponAddedDice(expression: string): readonly string[] {
  const first = /\d*\[W\]( \(off-hand(?: weapon| end)?\))?/iu.exec(expression);
  if (first === null) return [];
  let rest = expression.slice(first.index + first[0].length);
  const dice: string[] = [];
  for (;;) {
    const term = /^\s*\+\s*(\S+)/u.exec(rest);
    if (term === null) break;
    let word = term[1] ?? "";
    rest = rest.slice(term[0].length);
    while (/^(?:your|twice)$/iu.test(word)) {
      const next = /^\s*(\S+)/u.exec(rest);
      if (next === null) break;
      word = next[1] ?? "";
      rest = rest.slice(next[0].length);
    }
    if (/^\d+d\d+$/iu.test(word)) dice.push(word);
    rest = rest.replace(/^ \(off-hand weapon\)/iu, "");
    if (/^ modifier\s/iu.test(rest)) rest = rest.replace(/^ modifier/iu, "");
  }
  return dice;
}

function damageClause(clause: string): DamageClauseIr {
  const expression = clause.split(/\bdamage\b/iu)[0] ?? "";
  const expressionTerms = [...expression.matchAll(WEAPON_TERM)];
  const weaponTerms =
    expressionTerms.length > 0
      ? expressionTerms
      : [...clause.matchAll(WEAPON_TERM)].slice(0, 1);
  const fixedDice = clause.match(/(\d+d\d+)/i)?.[1];
  const flatBase = nativeFlatDamageBase(clause);
  const primary = withoutCompanionAbilityDamage(expression);
  const modifierAbilities = POWER_TEXT_ABILITIES.filter((ability) =>
    new RegExp(`\\b${ability} modifier\\b`, "i").test(primary),
  );
  const abilityPhrase = /\bhighest ability(?:\s+score)?\s+modifier\b/i.test(
    primary,
  )
    ? ("highest" as const)
    : /\bchosen ability modifier\b/i.test(primary)
      ? ("chosen" as const)
      : /\bability modifier\b/i.test(primary)
        ? ("ability" as const)
        : undefined;
  const damageType = expression.match(DAMAGE_TYPES)?.[0];
  // Native CalcDamage parses only the damage expression: the hit line up
  // to its first "damage".
  const powerDamageBonus = Number(
    `${expression} damage`.match(/\+\s*(\d+)\s+(?:[a-z]+\s+)*damage\b/i)?.[1] ??
      0,
  );
  const beastDice = expression.match(/(\d+)\s*\[B\]/i);
  const beastFixed =
    beastDice === null ? expression.match(/(\d+d\d+)/i)?.[1] : undefined;
  const beastAbilities = [...expression.matchAll(BEAST_ABILITY_DAMAGE)].map(
    (match) =>
      POWER_TEXT_ABILITIES.find(
        (ability) => lower(ability) === lower(match[1] ?? ""),
      ) ?? ("ability" as const),
  );
  const ownClause = expression.replace(BEAST_ABILITY_DAMAGE, "");
  return {
    ...(isBeastHit(clause) ? { beastHit: true as const } : {}),
    ...listed(
      "weaponTerms",
      weaponTerms.map((term) => ({
        count: Number(term[1] || 1),
        ...(term[2] === undefined ? {} : { offhand: true as const }),
      })),
    ),
    ...(fixedDice === undefined ? {} : { fixedDice }),
    ...listed("weaponAddedDice", weaponAddedDice(expression)),
    ...(flatBase === undefined ? {} : { flatBase }),
    ...listed("modifierAbilities", modifierAbilities),
    ...(abilityPhrase === undefined ? {} : { abilityPhrase }),
    ...listed(
      "listedAbilities",
      POWER_TEXT_ABILITIES.filter((ability) =>
        new RegExp(`\\b${ability}\\b`, "i").test(primary),
      ),
    ),
    ...(/\bor\b/i.test(primary) ? { hasOr: true as const } : {}),
    ...listed(
      "twice",
      POWER_TEXT_ABILITIES.filter((ability) =>
        new RegExp(`\\btwice\\s+(?:your\\s+)?${ability} modifier\\b`, "i").test(
          primary,
        ),
      ),
    ),
    ...nonZero("powerDamageBonus", powerDamageBonus),
    ...(damageType === undefined ? {} : { damageType: lower(damageType) }),
    beast: {
      ...(beastDice === null ? {} : { beastDice: Number(beastDice[1]) }),
      ...(beastFixed === undefined ? {} : { fixedDice: beastFixed }),
      ...listed("beastAbilities", beastAbilities),
      ...listed(
        "ownAbilities",
        POWER_TEXT_ABILITIES.filter((ability) =>
          new RegExp(`\\b${ability} modifier\\b`, "i").test(ownClause),
        ),
      ),
      // Flat additions: "1d8 + 2 + your Wisdom modifier", "2d8 + 4".
      ...nonZero(
        "flatBonus",
        [...expression.matchAll(/\+\s*(\d+)\b(?!\s*(?:\[|d\d))/gi)]
          .map((match) => Number(match[1]))
          .reduce((sum, value) => sum + value, 0),
      ),
    },
  };
}

/**
 * Native SpecialCase (-Module-.cs ~24430): the exact hit lines whose damage
 * CalcDamage cannot parse. (Its by-name cases stay in the engine.)
 */
function specialHit(hitLine: string): SpecialHitIr | undefined {
  const hit = lower(hitLine);
  if (hit.startsWith("deal damage equal to your strength modifier,"))
    return "strength-modifier";
  if (hit.startsWith("you deal damage based on the level of the rage power"))
    return "as-above";
  // Deathly Retort.
  if (
    hit ===
    "the target takes necrotic damage equal to the damage you took from the attack."
  )
    return "damage-you-took";
  if (
    hit === "the target takes ongoing 10 radiant damage (save ends)." ||
    hit ===
      "the target is stunned and takes ongoing 10 poison damage (save ends both)." ||
    hit.startsWith("ongoing 10 poison damage (save ends).")
  )
    return "ongoing-10";
  if (
    hit ===
    "the target is slowed and takes ongoing damage equal to 10 + your dexterity modifier (save ends both)."
  )
    return "ongoing-10-dexterity";
  // Warlock's Bargain.
  if (
    hit ===
    "you take damage equal to your level, and the target takes 3d10 + constitution modifier damage plus extra damage equal to one-half your level."
  )
    return "warlocks-bargain";
  // Final Reproach.
  if (
    hit ===
    "whenever the target deals damage with an attack before the end of your next turn, it takes 15 force damage and is dazed until the end of your next turn."
  )
    return "final-reproach";
  return undefined;
}

function hitVariant(hitLine: string): HitVariantIr {
  const special = specialHit(hitLine);
  const clauses = /\(melee[^]*\sor\s[^]*\(ranged/i.test(hitLine)
    ? hitLine.split(/\s+or\s+/i)
    : [hitLine];
  return {
    ...(special === undefined ? {} : { special }),
    ...(/\bongoing\b/i.test(hitLine) ? { ongoing: true as const } : {}),
    clauses:
      clauses.length > 1
        ? [damageClause(clauses[0] ?? ""), damageClause(clauses.at(-1) ?? "")]
        : [damageClause(hitLine)],
  };
}

/** Healing, healing-surge and temporary hit point sentences of a text. */
export function parseRecoveries(value: string): PowerRecoveryIr[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((expression) => expression.trim())
    .filter(Boolean)
    .flatMap((expression) => {
      const kind = /temporary hit points/i.test(expression)
        ? ("temporary-hit-points" as const)
        : /healing surge/i.test(expression)
          ? ("healing-surge" as const)
          : /regain(?:s)?\s+(?:all of (?:your|his|her|their)\s+)?hit points/i.test(
                expression,
              )
            ? ("healing" as const)
            : undefined;
      return kind === undefined ? [] : [{ kind, expression }];
    });
}

/** One (level-selected) hit line, parsed. */
export function parseHitLine(line: string): HitLineIr {
  const thrown = thrownWeaponAlternative(line, true);
  const other = thrownWeaponAlternative(line, false);
  return {
    ...(/\bdamage\b/i.test(line) ? { damage: true as const } : {}),
    ...(hasCompanionAbilityDamage(line)
      ? { companionAbility: true as const }
      : {}),
    ...(isBeastHit(line) ? { beastHit: true as const } : {}),
    ...(OFF_HAND.test(line) ? { offHand: true as const } : {}),
    ...(MAIN_WEAPON.test(line) ? { mainWeapon: true as const } : {}),
    ...listed("recoveries", parseRecoveries(line)),
    ...(thrown === other ? {} : { thrown: hitVariant(thrown) }),
    other: hitVariant(other),
  };
}

/** A Hit field's text, parsed into the line each level reads. */
export function parseHitField(value: string): HitFieldIr {
  const steps: { from?: number; line: HitLineIr }[] = [];
  let previous: string | undefined;
  const levels = [undefined, ...hitLevelThresholds(value)];
  for (const from of levels) {
    // Below every threshold, -1 reads what any lower level reads.
    const line = hitLineAtLevel(value, from ?? -1);
    if (line === previous) continue;
    previous = line;
    steps.push({
      ...(from === undefined ? {} : { from }),
      line: parseHitLine(line),
    });
  }
  return {
    ...(hasCompanionAbilityDamage(value)
      ? { companionAbility: true as const }
      : {}),
    steps,
  };
}

/** The text of each `parseHitField` step, in the same order: the line each
 *  step parsed (`audit:power-text` compares it with the step's IR). */
export function hitFieldStepTexts(
  value: string,
): { readonly from?: number; readonly text: string }[] {
  const texts: { from?: number; text: string }[] = [];
  for (const from of [undefined, ...hitLevelThresholds(value)]) {
    const text = hitLineAtLevel(value, from ?? -1);
    if (text === texts.at(-1)?.text) continue;
    texts.push({ ...(from === undefined ? {} : { from }), text });
  }
  return texts;
}

/** The step a level reads. */
export function hitLineAt(field: HitFieldIr, level: number): HitLineIr {
  let line = field.steps[0]!.line;
  for (const step of field.steps)
    if (step.from === undefined || step.from <= level) line = step.line;
  return line;
}

/** Every facet of a text, as the pack stores it. */
export function parsePowerText(
  value: string,
  facets: {
    readonly attack?: boolean;
    readonly hit?: boolean;
    readonly recoveries?: boolean;
  },
): PowerTextEntry {
  return {
    ...(facets.attack === true ? { attack: parseAttackField(value) } : {}),
    ...(facets.hit === true ? { hit: parseHitField(value) } : {}),
    ...(facets.recoveries === true
      ? { recoveries: parseRecoveries(value) }
      : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The parsed texts stored on a record, or undefined when it has none (a
 * pack built before this field) or the stored version is another. The pack
 * is verified and immutable, so only the envelope is checked.
 */
export function readPowerTextStore(
  specifics: readonly { readonly name: string; readonly value: string }[],
): PowerTextStore | undefined {
  const raw = specifics.find(
    (specific) => specific.name === POWER_TEXT_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== POWER_TEXT_VERSION ||
      !isRecord(parsed.texts)
    )
      return undefined;
    return parsed as unknown as PowerTextStore;
  } catch {
    return undefined;
  }
}
