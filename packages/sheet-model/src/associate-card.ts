import type { ContentEntity } from "@4ecb/content-domain";
import {
  BEAST_ABILITY_NAMES,
  type AssociateStatistics,
  type AssociateStatisticsEntry,
  type EvaluatedAssociate,
} from "@4ecb/rules-engine";

/**
 * An associate's card (D107): a creature from an Associate record, in the
 * companion card frame. Every number comes from the evaluated associate
 * (rules-engine `associateStatistics`); the text is its stat block's.
 */
export interface SheetAssociateCard {
  readonly kind: "associate";
  readonly id: string;
  readonly name: string;
  /** "Fey Beast Companion", "Summoned Creature", "Elemental Companion". */
  readonly role?: string;
  /** A fixed-level creature's level. */
  readonly level?: number;
  /** "Medium fey beast". */
  readonly identity?: string;
  readonly defenses: AssociateStatistics["defenses"];
  /** "Your defenses, not including any temporary bonuses or penalties". */
  readonly defensesNote?: string;
  /** "Resist 10 fire", "Vulnerable 5 fire", "Immune petrification". */
  readonly defenseTraits?: readonly string[];
  readonly hitPoints: number;
  /** What its hit points are, when they are its master's value. */
  readonly hitPointsFrom?: string;
  readonly bloodied?: number;
  /** "a missed attack never damages the companion". */
  readonly hitPointsNote?: string;
  /** "none, but you can spend a healing surge for the … if …". */
  readonly healingSurges?: string;
  readonly initiative?: number;
  readonly perception?: number;
  readonly speed?: string;
  readonly senses?: string;
  readonly abilities?: readonly {
    readonly name: string;
    readonly score: number;
    readonly modifier: number;
  }[];
  readonly traits: readonly AssociateStatisticsEntry[];
  readonly powers: readonly AssociateStatisticsEntry[];
  /** Trailing stat-block lines ("Alignment: …  Languages: …"). */
  readonly other?: readonly string[];
  readonly source: string;
  /** The occurrences that give it (and, for an inert community card, the
   *  feature that grants the card): page-1 reminders from these are what the
   *  card shows. */
  readonly provenanceIds: readonly string[];
}

const HIT_POINTS_FROM: Readonly<
  Record<AssociateStatistics["hitPointsSource"], string | undefined>
> = {
  "master-bloodied": "Your bloodied value",
  "master-surge-value": "Your healing surge value",
  fixed: undefined,
};

const capitalized = (text: string) =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function sheetAssociateCard(
  entity: ContentEntity,
  associate: EvaluatedAssociate,
  provenanceIds: readonly string[] = associate.providerIds,
): SheetAssociateCard {
  const { block, statistics } = associate;
  const identity = [block.size, block.creatureType].filter(Boolean).join(" ");
  const defensesNote =
    block.defenses.kind === "master"
      ? capitalized(
          ["your defenses", block.defensesNote].filter(Boolean).join(", "),
        )
      : undefined;
  const optional = {
    role: block.role,
    level: block.level,
    identity: identity === "" ? undefined : identity,
    defensesNote,
    defenseTraits: block.defenseTraits,
    hitPointsFrom: HIT_POINTS_FROM[statistics.hitPointsSource],
    bloodied: statistics.bloodied,
    hitPointsNote:
      block.hitPointsNote === undefined
        ? undefined
        : capitalized(block.hitPointsNote),
    healingSurges:
      block.healingSurges === undefined
        ? undefined
        : capitalized(block.healingSurges),
    initiative: statistics.initiative,
    perception: statistics.perception,
    speed: block.speed,
    senses: block.senses === undefined ? undefined : capitalized(block.senses),
    abilities:
      statistics.abilities === undefined
        ? undefined
        : BEAST_ABILITY_NAMES.map((name) => ({
            name,
            ...statistics.abilities![name],
          })),
    other: block.other,
  };
  return {
    kind: "associate",
    id: entity.id,
    name: entity.name,
    defenses: statistics.defenses,
    hitPoints: statistics.hitPoints,
    traits: statistics.traits,
    powers: statistics.powers,
    source: entity.source,
    provenanceIds,
    ...Object.fromEntries(
      Object.entries(optional).filter(([, value]) => value !== undefined),
    ),
  };
}

/** Everything the card says, as one text: what a page-1 reminder from the
 *  card's providers must not go beyond to count as shown (D107). */
export function associateCardText(card: SheetAssociateCard): string {
  return [
    card.name,
    card.role,
    card.identity,
    `AC Fortitude Reflex Will defenses hit points ${card.hitPoints}`,
    card.initiative === undefined ? undefined : "initiative",
    card.perception === undefined ? undefined : "Perception",
    card.speed === undefined ? undefined : `speed ${card.speed}`,
    card.senses,
    card.defensesNote,
    ...(card.defenseTraits ?? []),
    card.hitPointsNote,
    card.healingSurges === undefined
      ? undefined
      : `healing surges ${card.healingSurges}`,
    ...[...card.traits, ...card.powers].flatMap((entry) => [
      entry.name,
      entry.keywords,
      entry.usage,
      ...entry.lines.map((line) =>
        [line.label, line.text].filter(Boolean).join(": "),
      ),
    ]),
    ...(card.other ?? []),
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(". ");
}
