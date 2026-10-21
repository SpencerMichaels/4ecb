import type { ContentEntity } from "@4ecb/content-domain";
import {
  FAMILIAR_HIT_POINTS,
  familiarDefenses,
  familiarSpeed,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

/**
 * A familiar's card (legacy `FamiliarBlock` panel), with the general familiar
 * rules from Arcane Power the content does not encode: the master's defenses,
 * 1 hit point and Tiny size. See docs/familiar-card-proposal.md.
 */
export interface SheetFamiliarCard {
  readonly kind: "familiar";
  readonly id: string;
  readonly name: string;
  readonly size: string;
  readonly tier?: string;
  /** Base speed with companion bonuses, then any secondary speed. */
  readonly speed?: string;
  readonly senses?: string;
  readonly defenses: {
    readonly ac?: number;
    readonly fortitude?: number;
    readonly reflex?: number;
    readonly will?: number;
  };
  readonly hitPoints: number;
  readonly constantBenefits?: string;
  readonly activeBenefits?: string;
  readonly quirks?: string;
  readonly description?: string;
  readonly source: string;
}

/** Cards for creatures that accompany the character; beast companions later. */
export type SheetCompanionCard = SheetFamiliarCard;

/** The familiar rules every familiar shares, in brief (Arcane Power). */
export const FAMILIAR_RULES_REMINDER =
  "A missed attack never damages it. Uses your skill and ability check " +
  "bonuses; can't attack or flank. Minor action: switch between passive (on " +
  "your person; can't be targeted or damaged) and active (spend a move " +
  "action to move it its speed; stays within 20 squares).";

function field(entity: ContentEntity, name: string): string | undefined {
  const value = entity.specifics
    .find(
      (specific) =>
        specific.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    ?.value.trim();
  return value === undefined || value === "" ? undefined : value;
}

/** Community cards lead a list with a "See Below:" placeholder line. */
function withoutSeeBelow(value: string | undefined): string | undefined {
  const rest = value?.replace(/^see below:?\s*/i, "");
  return rest === "" ? undefined : rest;
}

export function isFamiliarEntity(entity: ContentEntity): boolean {
  return entity.type.trim().toLocaleLowerCase() === "familiar";
}

/** The card for a familiar with its master's evaluated statistics. */
export function sheetFamiliarCard(
  entity: ContentEntity,
  stats: Readonly<Record<string, EvaluatedStat>>,
): SheetFamiliarCard {
  const speed = [
    familiarSpeed(field(entity, "Speed"), stats),
    field(entity, "Secondary Speed"),
  ]
    .filter(Boolean)
    .join(", ");
  const defenses = familiarDefenses(stats);
  const optional = {
    tier: field(entity, "Tier"),
    speed: speed === "" ? undefined : speed,
    senses: field(entity, "Senses"),
    // Community-coded familiars (the Widow of Arach-Tinilith spiderling) name
    // the benefits as their printed headings and keep their lore as flavor.
    constantBenefits:
      field(entity, "Constant Benefits") ??
      withoutSeeBelow(field(entity, "Passive Benefits")),
    activeBenefits: field(entity, "Power") ?? field(entity, "Active Benefits"),
    quirks: field(entity, "Quirks"),
    description:
      entity.description.trim() || entity.flavor?.trim() || undefined,
  };
  return {
    kind: "familiar",
    id: entity.id,
    name: entity.name,
    size: field(entity, "Size") ?? "Tiny",
    defenses: Object.fromEntries(
      Object.entries(defenses).filter(([, value]) => value !== undefined),
    ),
    hitPoints: FAMILIAR_HIT_POINTS,
    source: entity.source,
    ...Object.fromEntries(
      Object.entries(optional).filter(([, value]) => value !== undefined),
    ),
  };
}
