import type { ContentEntity } from "@4ecb/content-domain";

import type { SheetCard, SheetValue } from "./index";

const key = (value: string) => value.trim().toLocaleLowerCase();

const field = (entity: ContentEntity, name: string) =>
  entity.specifics
    .find((specific) => key(specific.name) === key(name))
    ?.value.trim() || undefined;

/** A god fragment (Dragon 382), chosen through a feat such as Awaken God
 *  Fragment. Its record is not a Power: its ability lives in its fields. */
export function isGodFragmentEntity(
  entity: ContentEntity | undefined,
): entity is ContentEntity {
  return entity !== undefined && key(entity.type) === "god fragment";
}

/** What the fragment always grants (its "Constant Benefits" field). */
export function godFragmentConstantBenefits(
  entity: ContentEntity,
): string | undefined {
  return isGodFragmentEntity(entity)
    ? field(entity, "Constant Benefits")
    : undefined;
}

/** Clauses of the fragment's ability, in published power-block order. */
const ABILITY_CLAUSES = ["Trigger", "Effect"] as const;

/**
 * The fragment's ability as a power card, built from its own fields the way
 * the Action Point and Second Wind cards are synthesized: usage, action,
 * keywords, trigger and effect. A fragment without a usage and an action
 * has no ability to card.
 */
export function godFragmentPowerCard(
  entity: ContentEntity,
): SheetCard | undefined {
  if (!isGodFragmentEntity(entity)) return undefined;
  const usage = field(entity, "Power Usage");
  const actionType = field(entity, "Action Type");
  if (usage === undefined || actionType === undefined) return undefined;
  const keywords = field(entity, "Keywords");
  const fields: SheetValue[] = ABILITY_CLAUSES.flatMap((label) => {
    const value = field(entity, label);
    return value === undefined ? [] : [{ label, value }];
  });
  return {
    id: entity.id,
    kind: "power",
    name: entity.name,
    usage,
    actionType,
    ...(keywords === undefined ? {} : { keywords }),
    fields,
    ...(entity.flavor?.trim() ? { flavor: entity.flavor.trim() } : {}),
    ...(entity.source ? { source: entity.source } : {}),
  };
}

/** One card per god fragment the character has, in occurrence order. */
export function godFragmentPowerCards(
  entities: readonly ContentEntity[],
): SheetCard[] {
  const seen = new Set<string>();
  return entities.flatMap((entity) => {
    if (seen.has(key(entity.id))) return [];
    seen.add(key(entity.id));
    const card = godFragmentPowerCard(entity);
    return card === undefined ? [] : [card];
  });
}
