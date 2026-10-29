import type { BuildInventoryEntry } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

/**
 * Packaged gear (legacy CharacterLootItem): Arrows and Arrow, Crossbow Bolts
 * and Crossbow Bolt, Sling Bullets and Sling Bullet, Journeybreads and
 * Journeybread. A `_RelatedElement` pair whose "count" lot sizes differ is
 * stored as two holdings (native rows, each with its own price and weight)
 * and shown as one row of the pair's total units (owner decision, D108).
 */

const key = (value: string) => value.trim().toLocaleLowerCase();

function specific(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((field) => key(field.name) === key(name))?.value;
}

/** Legacy CharacterLootItem.GetLotSize: the item's "count" field, else 1. */
export function lotSize(entity: ContentEntity): number {
  const count = Number.parseInt(specific(entity, "count") ?? "", 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

export interface InventoryPackagePair {
  /** The single item (lot size 1 for every content pair). */
  readonly single: ContentEntity;
  readonly singleLot: number;
  /** The package (Arrows, 30 arrows). */
  readonly pack: ContentEntity;
  readonly packLot: number;
}

/**
 * The package pair `entity` belongs to (legacy IsPackageRelated: its
 * `_RelatedElement` resolves, and the two lot sizes are not both 1).
 * `find` resolves the reference as native FindRulesElement does: by
 * internal ID, else by name.
 */
export function inventoryPackagePair(
  entity: ContentEntity,
  find: (reference: string) => ContentEntity | undefined,
): InventoryPackagePair | undefined {
  const reference = specific(entity, "_RelatedElement")?.trim();
  const related = reference ? find(reference) : undefined;
  if (related === undefined) return undefined;
  const [lot, relatedLot] = [lotSize(entity), lotSize(related)];
  if (lot === relatedLot) return undefined;
  return lot > relatedLot
    ? { single: related, singleLot: relatedLot, pack: entity, packLot: lot }
    : { single: entity, singleLot: lot, pack: related, packLot: relatedLot };
}

/** A content finder by ID (lowercase map key) or, failing that, by name. */
export function contentReferenceFinder(
  byId: ReadonlyMap<string, ContentEntity>,
): (reference: string) => ContentEntity | undefined {
  let byName: Map<string, ContentEntity> | undefined;
  return (reference) => {
    const found = byId.get(key(reference));
    if (found !== undefined) return found;
    if (byName === undefined) {
      byName = new Map();
      for (const entity of byId.values())
        if (!byName.has(key(entity.name))) byName.set(key(entity.name), entity);
    }
    return byName.get(key(reference));
  };
}

/** The record a plain holding holds (no enchantment, custom name or choices). */
export function plainHoldingDefinitionId(
  entry: BuildInventoryEntry,
): string | undefined {
  const [element, ...rest] = entry.elements;
  return element === undefined ||
    rest.length > 0 ||
    entry.name !== undefined ||
    (element.children?.length ?? 0) > 0
    ? undefined
    : element.definitionId;
}

/** The plain holding of one record, if owned. */
export function plainHoldingOf(
  inventory: readonly BuildInventoryEntry[],
  entity: ContentEntity,
): BuildInventoryEntry | undefined {
  const id = key(entity.id);
  return inventory.find((entry) => {
    const definitionId = plainHoldingDefinitionId(entry);
    return definitionId !== undefined && key(definitionId) === id;
  });
}

/** One owned package pair, presented as a single inventory row. */
export interface InventoryPackageGroup {
  readonly pair: InventoryPackagePair;
  readonly packHolding?: BuildInventoryEntry;
  readonly singleHolding?: BuildInventoryEntry;
  /** The holding that stands for the row: the package, else the singles. */
  readonly representative: BuildInventoryEntry;
  /** Both holdings' units (Arrows ×1 and Arrow ×5: 35). */
  readonly units: number;
  /** The row's name: the package's (plural) name. */
  readonly name: string;
}

/**
 * The owned package pairs, keyed by each member holding's ID (both members
 * map to the same group). Holdings with quantity 0 are ignored.
 */
export function inventoryPackageGroups(
  inventory: readonly BuildInventoryEntry[],
  resolve: (definitionId: string) => ContentEntity | undefined,
  find: (reference: string) => ContentEntity | undefined = resolve,
): ReadonlyMap<string, InventoryPackageGroup> {
  const owned = inventory.filter(({ quantity }) => quantity > 0);
  const groups = new Map<string, InventoryPackageGroup>();
  for (const entry of owned) {
    if (groups.has(entry.id)) continue;
    const definitionId = plainHoldingDefinitionId(entry);
    const entity =
      definitionId === undefined ? undefined : resolve(definitionId);
    const pair =
      entity === undefined ? undefined : inventoryPackagePair(entity, find);
    if (pair === undefined) continue;
    const packHolding = plainHoldingOf(owned, pair.pack);
    const singleHolding = plainHoldingOf(owned, pair.single);
    const representative = packHolding ?? singleHolding ?? entry;
    const group: InventoryPackageGroup = {
      pair,
      ...(packHolding === undefined ? {} : { packHolding }),
      ...(singleHolding === undefined ? {} : { singleHolding }),
      representative,
      units:
        (packHolding?.quantity ?? 0) * pair.packLot +
        (singleHolding?.quantity ?? 0) * pair.singleLot,
      name: pair.pack.name,
    };
    for (const member of [packHolding, singleHolding])
      if (member !== undefined) groups.set(member.id, group);
  }
  return groups;
}

/**
 * Package and single counts holding `units` (legacy PackageManipulation):
 * as many full packages as fit, the rest as singles.
 */
export function packageSplit(
  pair: InventoryPackagePair,
  units: number,
): { readonly packs: number; readonly singles: number } {
  const whole = Math.max(0, Math.floor(units));
  return {
    packs: Math.floor(whole / pair.packLot),
    singles: Math.floor((whole % pair.packLot) / pair.singleLot),
  };
}
