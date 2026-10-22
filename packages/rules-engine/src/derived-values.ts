import type { EvaluatedContribution, EvaluatedStat } from "./stats";

/** 4E ability modifier: (score − 10) / 2, rounded down. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Half the character level, rounded down. */
export function halfLevel(level: number): number {
  return Math.floor(level / 2);
}

/** Bloodied value: half of maximum hit points (legacy PanelModelHitPoints). */
export function bloodiedValue(
  hitPoints: number | undefined,
): number | undefined {
  return hitPoints === undefined ? undefined : Math.floor(hitPoints / 2);
}

/**
 * Healing surge value shown on sheets: a quarter of maximum hit points plus the
 * native "Healing Surge Value" stat, which is an additive bonus rather than the
 * total (legacy PanelModelHitPoints.Update and SecondWindCard).
 */
export function healingSurgeValue(
  hitPoints: number | undefined,
  bonus: number | undefined,
): number | undefined {
  return hitPoints === undefined
    ? undefined
    : Math.floor(hitPoints / 4) + (bonus ?? 0);
}

function numericStat(
  stats: Readonly<Record<string, EvaluatedStat>>,
  name: string,
): number | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  const stat = Object.entries(stats).find(
    ([candidate]) => candidate.trim().toLocaleLowerCase() === wanted,
  )?.[1];
  const value = Number(stat?.value);
  return stat === undefined || !Number.isFinite(value) ? undefined : value;
}

export function evaluatedHealingSurgeValue(
  stats: Readonly<Record<string, EvaluatedStat>>,
): number | undefined {
  return healingSurgeValue(
    numericStat(stats, "Hit Points"),
    numericStat(stats, "Healing Surge Value"),
  );
}

/** The stat prefix of a companion kind (legacy `FamiliarBlock`, `BeastBlock`). */
export type CompanionKind = "FAMILIAR" | "BEAST";

const COMPANION_PREFIXES = (kind: CompanionKind) =>
  ["ALLY", "COMPANION", kind] as const;

/**
 * A companion's bonus to one of its statistics: the character's `ALLY.`,
 * `COMPANION.` and kind-specific (`FAMILIAR.`, `BEAST.`) stats, summed as
 * legacy `CompanionStatBlock.GetCompanionStat` does.
 */
export function companionStatBonus(
  stats: Readonly<Record<string, EvaluatedStat>>,
  kind: CompanionKind,
  stat: string,
): number {
  return COMPANION_PREFIXES(kind).reduce(
    (total, prefix) => total + (numericStat(stats, `${prefix}.${stat}`) ?? 0),
    0,
  );
}

/**
 * A familiar's speed: its authored base speed plus companion speed bonuses
 * (legacy `FamiliarBlock.Speed`). A base that is not a whole number is shown
 * as authored, without bonuses, as legacy does.
 */
export function familiarSpeed(
  baseSpeed: string | undefined,
  stats: Readonly<Record<string, EvaluatedStat>>,
): string | undefined {
  const base = baseSpeed?.trim();
  if (base === undefined || base === "") return undefined;
  if (!/^[+-]?\d+$/.test(base)) return base;
  return String(Number(base) + companionStatBonus(stats, "FAMILIAR", "Speed"));
}

export interface FamiliarDefenses {
  readonly ac: number | undefined;
  readonly fortitude: number | undefined;
  readonly reflex: number | undefined;
  readonly will: number | undefined;
}

/**
 * A familiar uses its master's defenses (Arcane Power, "Familiar Attributes"),
 * plus companion bonuses to that defense such as Vigorous Familiar's +1 AC.
 */
export function familiarDefenses(
  stats: Readonly<Record<string, EvaluatedStat>>,
): FamiliarDefenses {
  const defense = (stat: string, alias: string) => {
    const own = numericStat(stats, stat) ?? numericStat(stats, alias);
    return own === undefined
      ? undefined
      : own + companionStatBonus(stats, "FAMILIAR", stat);
  };
  return {
    ac: defense("AC", "Armor Class"),
    fortitude: defense("Fortitude Defense", "Fortitude"),
    reflex: defense("Reflex Defense", "Reflex"),
    will: defense("Will Defense", "Will"),
  };
}

/** A familiar has 1 hit point (Arcane Power, "Familiar Attributes"). */
export const FAMILIAR_HIT_POINTS = 1;

/** The six ability names, in the legacy stat-block order. */
export const BEAST_ABILITY_NAMES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;
export type BeastAbilityName = (typeof BEAST_ABILITY_NAMES)[number];

/**
 * A field only 4ecb reads (content/corrections/99-companions.part): the
 * companion's hit points are its master's bloodied value (Heroes of the
 * Forgotten Kingdoms, sentinel animal companion).
 */
export const COMPANION_HIT_POINTS_FIELD = "_Hit Points";
export const COMPANION_BLOODIED_HIT_POINTS = "bloodied";

function fieldValue(
  fields: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  const value = Object.entries(fields)
    .find(([candidate]) => candidate.trim().toLocaleLowerCase() === wanted)?.[1]
    ?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function leadingNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A beast companion record: a Companion with the Martial Power stat fields,
 * an attack bonus and a `[B]` damage die (legacy `BeastBlock`). A structural
 * test, so it holds for any content that follows the format.
 */
export function isBeastCompanionFields(
  fields: Readonly<Record<string, string>>,
): boolean {
  return (
    fieldValue(fields, "Attack Bonus") !== undefined &&
    fieldValue(fields, "Damage") !== undefined
  );
}

export interface BeastCompanionAbility {
  readonly score: number;
  readonly modifier: number;
}

export interface BeastCompanionDamageAbility {
  readonly ability: BeastAbilityName;
  /** "beast": the beast's own score; "master": the character's (sentinel). */
  readonly owner: "beast" | "master";
  readonly modifier: number;
}

export interface BeastCompanionSkill {
  readonly name: string;
  readonly ability: string;
  readonly trained: boolean;
  /** The companion's misc bonuses (`BEAST.<skill> misc`, …). */
  readonly bonus: number;
  readonly total: number;
}

/** A situational companion bonus, shown as a note (legacy drops them). */
export interface BeastCompanionConditionalBonus {
  /** The statistic, without its `BEAST.`/`ALLY.`/`COMPANION.` prefix. */
  readonly stat: string;
  readonly value: string;
  readonly condition: string;
  readonly source: string;
  readonly provenanceId: string;
}

export interface BeastCompanionStatistics {
  /** The beast's level is its master's (Martial Power p. 39). */
  readonly level: number;
  readonly abilities: Readonly<Record<BeastAbilityName, BeastCompanionAbility>>;
  readonly defenses: {
    readonly ac: number;
    readonly fortitude: number;
    readonly reflex: number;
    readonly will: number;
  };
  readonly hitPoints: number;
  /** True when the hit points are the master's bloodied value (sentinel). */
  readonly hitPointsFromMasterBloodied: boolean;
  readonly bloodied: number;
  readonly healingSurgeValue: number;
  /** Two plus bonuses (Martial Power p. 39; Sturdy Beast); 0 when shared. */
  readonly healingSurgesPerDay: number;
  /** The sentinel's companion spends its master's surges. */
  readonly sharesHealingSurges: boolean;
  /** Base speed with companion bonuses, then any secondary speed. */
  readonly speed?: string;
  readonly vision: string;
  readonly attackBonus: number;
  readonly damage: {
    /** The `[B]` die: the dice of the `Damage` field. */
    readonly die: string;
    /** A flat bonus the field adds ("1d8 + 2", sentinel paragon tier). */
    readonly bonus: number;
    readonly abilities: readonly BeastCompanionDamageAbility[];
    readonly modifier: number;
    /** "1d8+3", as power damage is written. */
    readonly expression: string;
  };
  readonly savingThrows: number;
  readonly resistances: readonly {
    readonly type: string;
    readonly value: number;
  }[];
  /** Trained skills, then skills with a companion bonus. */
  readonly skills: readonly BeastCompanionSkill[];
  readonly conditionalBonuses: readonly BeastCompanionConditionalBonus[];
  /** The applied contributions behind these numbers, for provenance. */
  readonly contributions: readonly EvaluatedContribution[];
}

export interface BeastCompanionSkillInput {
  readonly name: string;
  readonly keyAbility: string;
  readonly trained: boolean;
}

function evaluatedStat(
  stats: Readonly<Record<string, EvaluatedStat>>,
  name: string,
): EvaluatedStat | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  return Object.entries(stats).find(
    ([candidate]) => candidate.trim().toLocaleLowerCase() === wanted,
  )?.[1];
}

const BEAST_DEFENSE_STATS = [
  ["ac", "Armor Class", ["AC", "Armor Class"]],
  ["fortitude", "Fortitude Defense", ["Fortitude Defense", "Fortitude"]],
  ["reflex", "Reflex Defense", ["Reflex Defense", "Reflex"]],
  ["will", "Will Defense", ["Will Defense", "Will"]],
] as const;

function formatModifierDamage(die: string, modifier: number): string {
  return modifier === 0 ? die : `${die}${modifier > 0 ? "+" : ""}${modifier}`;
}

/**
 * A beast companion's statistics (legacy `BeastBlock`, Martial Power
 * pp. 38–42, Heroes of the Forgotten Kingdoms pp. 89–90): the chosen
 * record's fields plus the character's evaluated companion stats, with the
 * beast at its master's level. Every surface reads these numbers.
 *
 * Abilities are the `Companion.<Ability>` stats (the record's own statadds,
 * Companion Ability Increase picks and the tier +1s). For a candidate record
 * that is not chosen, pass `candidate`: its fields replace the contributions
 * of the providers it would replace (the currently chosen beast).
 */
export function beastCompanionStatistics(input: {
  readonly fields: Readonly<Record<string, string>>;
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly level: number;
  readonly skills?: readonly BeastCompanionSkillInput[];
  readonly candidate?: { readonly replacedProviderIds: readonly string[] };
}): BeastCompanionStatistics {
  const { fields, stats, level } = input;
  const bonus = (stat: string) => companionStatBonus(stats, "BEAST", stat);
  const read: EvaluatedStat[] = [];
  const track = (name: string) => {
    const stat = evaluatedStat(stats, name);
    if (stat !== undefined && !read.includes(stat)) read.push(stat);
  };
  const trackCompanion = (stat: string) => {
    for (const prefix of COMPANION_PREFIXES("BEAST"))
      track(`${prefix}.${stat}`);
  };

  const replaced = new Set(input.candidate?.replacedProviderIds ?? []);
  const abilities = Object.fromEntries(
    BEAST_ABILITY_NAMES.map((ability) => {
      const statName = `Companion.${ability}`;
      track(statName);
      const score =
        input.candidate === undefined
          ? (numericStat(stats, statName) ?? leadingNumber(fields[ability]))
          : leadingNumber(fieldValue(fields, ability)) +
            (evaluatedStat(stats, statName)?.contributions ?? [])
              .filter(
                (contribution) =>
                  contribution.applied &&
                  !replaced.has(contribution.providerId),
              )
              .reduce(
                (total, contribution) =>
                  total + (contribution.numericValue ?? 0),
                0,
              );
      return [ability, { score, modifier: abilityModifier(score) }];
    }),
  ) as Record<BeastAbilityName, BeastCompanionAbility>;

  const defense = (fieldName: string, statNames: readonly string[]) => {
    for (const stat of statNames) trackCompanion(stat);
    return (
      leadingNumber(fieldValue(fields, fieldName)) +
      level +
      statNames.reduce((total, stat) => total + bonus(stat), 0)
    );
  };
  const defenses = Object.fromEntries(
    BEAST_DEFENSE_STATS.map(([id, fieldName, statNames]) => [
      id,
      defense(fieldName, statNames),
    ]),
  ) as BeastCompanionStatistics["defenses"];

  trackCompanion("Hit Points");
  const fromBloodied =
    fieldValue(fields, COMPANION_HIT_POINTS_FIELD)?.toLocaleLowerCase() ===
    COMPANION_BLOODIED_HIT_POINTS;
  if (fromBloodied) track("Hit Points");
  const hitPoints =
    (fromBloodied
      ? (bloodiedValue(numericStat(stats, "Hit Points")) ?? 0)
      : leadingNumber(fieldValue(fields, "Hit Points at 1st Level")) +
        level *
          leadingNumber(fieldValue(fields, "Hit Points per Level Gained"))) +
    bonus("Hit Points");
  trackCompanion("Healing Surge Value");
  trackCompanion("Healing Surges");
  const healingSurgesPerDay = Math.max(0, 2 + bonus("Healing Surges"));

  const baseSpeed = fieldValue(fields, "Speed");
  trackCompanion("Speed");
  const speedNumber = leadingNumber(baseSpeed);
  const speed = [
    baseSpeed === undefined
      ? undefined
      : speedNumber !== 0 && /^[+-]?\d+$/.test(baseSpeed)
        ? String(speedNumber + bonus("Speed"))
        : baseSpeed,
    fieldValue(fields, "Secondary Speed"),
  ]
    .filter(Boolean)
    .join(", ");

  trackCompanion("attack rolls");
  const attackBonus =
    level +
    leadingNumber(fieldValue(fields, "Attack Bonus")) +
    bonus("attack rolls");

  // "Strength", or the sentinel's "your Wisdom + your Constitution".
  const abilityField = fieldValue(fields, "Ability Score") ?? "";
  const damageAbilities = BEAST_ABILITY_NAMES.flatMap(
    (ability): BeastCompanionDamageAbility[] => {
      const match = new RegExp(`\\b(your\\s+)?${ability}\\b`, "i").exec(
        abilityField,
      );
      if (match === null) return [];
      if (match[1] === undefined)
        return [
          { ability, owner: "beast", modifier: abilities[ability].modifier },
        ];
      track(`${ability} modifier`);
      return [
        {
          ability,
          owner: "master",
          modifier: numericStat(stats, `${ability} modifier`) ?? 0,
        },
      ];
    },
  ).sort(
    (left, right) =>
      abilityField.search(new RegExp(left.ability, "i")) -
      abilityField.search(new RegExp(right.ability, "i")),
  );
  const damageModifier = damageAbilities.reduce(
    (total, ability) => total + ability.modifier,
    0,
  );
  // The field may add a flat bonus: "1d8 + 2" (sentinel paragon overlay).
  const damageField = fieldValue(fields, "Damage") ?? "";
  const die = /\d+d\d+/i.exec(damageField)?.[0] ?? damageField;
  const damageBonus = [
    ...damageField.matchAll(/\+\s*(\d+)\b(?!\s*d\d)/gi),
  ].reduce((total, match) => total + Number(match[1]), 0);

  trackCompanion("Saving Throws");
  const resistances = Object.keys(stats).flatMap((name) => {
    const match = /^(?:ALLY|COMPANION|BEAST)\.resist:(.+)$/i.exec(name.trim());
    if (match === null) return [];
    track(name);
    return [match[1]!.trim().toLocaleLowerCase()];
  });
  const resistanceTotals = [...new Set(resistances)].flatMap((type) => {
    const value = bonus(`resist:${type}`);
    return value === 0 ? [] : [{ type, value }];
  });

  const halfLevelBonus = halfLevel(level);
  const skills = (input.skills ?? []).flatMap(
    (skill): BeastCompanionSkill[] => {
      trackCompanion(`${skill.name} misc`);
      trackCompanion(skill.name);
      const skillBonus = bonus(`${skill.name} misc`) + bonus(skill.name);
      if (!skill.trained && skillBonus === 0) return [];
      const ability = BEAST_ABILITY_NAMES.find(
        (name) =>
          name.toLocaleLowerCase() === skill.keyAbility.toLocaleLowerCase(),
      );
      const modifier = ability === undefined ? 0 : abilities[ability].modifier;
      return [
        {
          name: skill.name,
          ability: skill.keyAbility,
          trained: skill.trained,
          bonus: skillBonus,
          // The general creature rule (Monster Manual, Player's Handbook
          // p. 178): ability modifier + one-half level, +5 when trained.
          total:
            modifier + halfLevelBonus + (skill.trained ? 5 : 0) + skillBonus,
        },
      ];
    },
  );
  skills.sort(
    (left, right) =>
      Number(right.trained) - Number(left.trained) ||
      left.name.localeCompare(right.name),
  );

  // Every companion-prefixed situational bonus is a note, as page 1 lists
  // conditional bonuses (owner answer 2, docs/companion-card-proposal.md).
  const conditionalBonuses = Object.entries(stats).flatMap(([name, stat]) => {
    const match = /^(?:ALLY|COMPANION|BEAST)\.(.+)$/i.exec(name.trim());
    if (match === null) return [];
    return stat.contributions.flatMap(
      (contribution): BeastCompanionConditionalBonus[] =>
        !contribution.applied &&
        contribution.reason === "conditional" &&
        contribution.condition !== undefined
          ? [
              {
                stat: match[1]!.trim(),
                value: contribution.value,
                condition: contribution.condition,
                source: contribution.providerName,
                provenanceId: contribution.id,
              },
            ]
          : [],
    );
  });

  return {
    level,
    abilities,
    defenses,
    hitPoints,
    hitPointsFromMasterBloodied: fromBloodied,
    bloodied: bloodiedValue(hitPoints) ?? 0,
    healingSurgeValue:
      healingSurgeValue(hitPoints, bonus("Healing Surge Value")) ?? 0,
    healingSurgesPerDay,
    sharesHealingSurges: healingSurgesPerDay === 0,
    ...(speed === "" ? {} : { speed }),
    vision: "Low-light",
    attackBonus,
    damage: {
      die,
      bonus: damageBonus,
      abilities: damageAbilities,
      modifier: damageModifier,
      expression: formatModifierDamage(die, damageBonus + damageModifier),
    },
    savingThrows: bonus("Saving Throws"),
    resistances: resistanceTotals,
    skills,
    conditionalBonuses,
    contributions: read.flatMap((stat) =>
      stat.contributions.filter((contribution) => contribution.applied),
    ),
  };
}
