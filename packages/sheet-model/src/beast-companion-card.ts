import type { ContentEntity } from "@4ecb/content-domain";
import {
  BEAST_ABILITY_NAMES,
  type EvaluatedBeastCompanion,
  type EvaluatedPower,
} from "@4ecb/rules-engine";

/**
 * A beast companion's card (legacy `BeastBlock` panel): every number comes
 * from the evaluated `beastCompanion` statistics (rules-engine
 * `beastCompanionStatistics`). See docs/companion-card-proposal.md.
 */
export interface SheetBeastCompanionCard {
  readonly kind: "beast";
  readonly id: string;
  readonly occurrenceId: string;
  /** The player's name for the beast (`_COMPANION_NAME`), else the category. */
  readonly name: string;
  /** `_COMPANION_APPEARANCE`, the legacy panel's species line. */
  readonly appearance?: string;
  /** The record: Bear, Wolf, Vadalis-bred Griffon, … */
  readonly category: string;
  readonly level: number;
  readonly size?: string;
  readonly speed?: string;
  readonly vision: string;
  readonly defenses: {
    readonly ac: number;
    readonly fortitude: number;
    readonly reflex: number;
    readonly will: number;
  };
  readonly hitPoints: number;
  readonly bloodied: number;
  readonly healingSurgeValue: number;
  /** Surges per day; absent when it spends its master's (`sharesHealingSurges`). */
  readonly healingSurges?: number;
  readonly sharesHealingSurges: boolean;
  readonly hitPointsFromMasterBloodied: boolean;
  readonly abilities: readonly {
    readonly name: string;
    readonly score: number;
    readonly modifier: number;
  }[];
  /** The basic attack summary: "Claw +12 vs. AC · 1d12+4 damage". */
  readonly attack: {
    readonly name: string;
    readonly attackBonus: number;
    readonly defense: string;
    readonly damage: string;
  };
  readonly savingThrows?: number;
  readonly resistances?: readonly {
    readonly type: string;
    readonly value: number;
  }[];
  readonly skills: readonly {
    readonly name: string;
    readonly total: number;
    readonly trained: boolean;
  }[];
  /** Situational bonuses, like a power card's additional effects. */
  readonly notes: readonly {
    readonly text: string;
    readonly source: string;
    readonly provenanceId: string;
  }[];
  /** The record's special rules: Charge, Combat Advantage, Power, … */
  readonly traits: readonly { readonly label: string; readonly text: string }[];
  readonly commands: string;
  readonly description?: string;
  readonly source: string;
}

/** Martial Power p. 41, in brief. */
export const BEAST_COMPANION_COMMANDS =
  "Attack or defend: standard action. Move: move action. Opportunity " +
  "attack: immediate interrupt. Uses second wind when you do; adjacent, " +
  "spend a minor action and one of your healing surges to heal it.";

/** Heroes of the Forgotten Kingdoms p. 90, in brief. */
export const SENTINEL_COMPANION_COMMANDS =
  "Commanding it takes the same action as the action it takes. Shares " +
  "your healing surges and initiative.";

const TRAIT_FIELDS = [
  "Charge",
  "Combat Advantage",
  "Opportunity Attacks",
  "Power",
  "Companion Power",
  "Mount Companion",
  "Quirks",
] as const;

function field(entity: ContentEntity, name: string): string | undefined {
  const value = entity.specifics
    .find(
      (specific) =>
        specific.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    ?.value.trim();
  return value === undefined || value === "" ? undefined : value;
}

function grantedPowerIds(entity: ContentEntity): string[] {
  return entity.rules.flatMap((rule) => {
    if (rule.name !== "grant") return [];
    const attribute = (name: string) =>
      rule.attributes.find(
        (candidate) => candidate.name.toLocaleLowerCase() === name,
      )?.value;
    return attribute("type")?.trim().toLocaleLowerCase() === "power"
      ? [attribute("name") ?? ""]
      : [];
  });
}

/**
 * The card for the evaluated beast companion. The basic attack line reads the
 * evaluated attack power the record grants when it has the beast's numbers
 * (the sentinel's attack steps up through power overlays at 13th and 23rd
 * level), else the derived attack bonus and damage.
 */
export function sheetBeastCompanionCard(
  entity: ContentEntity,
  beast: EvaluatedBeastCompanion,
  options: {
    readonly textStrings?: Readonly<Record<string, string>>;
    readonly powers?: readonly EvaluatedPower[];
  } = {},
): SheetBeastCompanionCard {
  const statistics = beast.statistics;
  const text = (name: string) =>
    options.textStrings?.[name]?.trim() || undefined;
  const granted = new Set(
    grantedPowerIds(entity).map((id) => id.trim().toLocaleLowerCase()),
  );
  const attackPower = (options.powers ?? [])
    .filter((power) => granted.has(power.definitionId.toLocaleLowerCase()))
    .map((power) => power.variants[0])
    .find(
      (variant) =>
        variant?.attacker === "beast" &&
        variant.attackBonus !== undefined &&
        variant.damage !== undefined,
    );
  const traits = TRAIT_FIELDS.flatMap((label) => {
    const value = field(entity, label);
    if (value === undefined) return [];
    // Content repeats "Charge: …" in Power; keep one copy.
    const repeated =
      label === "Power" &&
      TRAIT_FIELDS.some(
        (other) =>
          other !== "Power" &&
          field(entity, other) !== undefined &&
          value.toLocaleLowerCase() ===
            `${other}: ${field(entity, other)}`.toLocaleLowerCase(),
      );
    return repeated ? [] : [{ label, text: value }];
  });
  const optional = {
    appearance: text("_COMPANION_APPEARANCE"),
    size: field(entity, "Size"),
    speed: statistics.speed,
    healingSurges: statistics.sharesHealingSurges
      ? undefined
      : statistics.healingSurgesPerDay,
    savingThrows:
      statistics.savingThrows === 0 ? undefined : statistics.savingThrows,
    resistances:
      statistics.resistances.length === 0 ? undefined : statistics.resistances,
    description:
      entity.description.trim() || entity.flavor?.trim() || undefined,
  };
  return {
    kind: "beast",
    id: entity.id,
    occurrenceId: beast.occurrenceId,
    name: text("_COMPANION_NAME") ?? entity.name,
    category: entity.name,
    level: statistics.level,
    vision: statistics.vision,
    defenses: statistics.defenses,
    hitPoints: statistics.hitPoints,
    bloodied: statistics.bloodied,
    healingSurgeValue: statistics.healingSurgeValue,
    sharesHealingSurges: statistics.sharesHealingSurges,
    hitPointsFromMasterBloodied: statistics.hitPointsFromMasterBloodied,
    abilities: BEAST_ABILITY_NAMES.map((name) => ({
      name,
      ...statistics.abilities[name],
    })),
    attack: {
      name: field(entity, "Attack") ?? "Attack",
      attackBonus: attackPower?.attackBonus ?? statistics.attackBonus,
      defense: attackPower?.defense ?? "AC",
      damage: attackPower?.damage ?? statistics.damage.expression,
    },
    skills: statistics.skills.map(({ name, total, trained }) => ({
      name,
      total,
      trained,
    })),
    notes: statistics.conditionalBonuses.map((bonus) => ({
      text: `${/^[+-]/.test(bonus.value) ? "" : "+"}${bonus.value} ${bonus.stat} ${bonus.condition}.`,
      source: bonus.source,
      provenanceId: bonus.provenanceId,
    })),
    traits,
    commands: statistics.sharesHealingSurges
      ? SENTINEL_COMPANION_COMMANDS
      : BEAST_COMPANION_COMMANDS,
    source: entity.source,
    ...Object.fromEntries(
      Object.entries(optional).filter(([, value]) => value !== undefined),
    ),
  };
}
