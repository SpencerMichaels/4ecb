/**
 * Stored formula items: the item versions an alchemical formula creates.
 *
 * Adventurer's Vault prints a formula above the item it makes, with the
 * item's level table below, so its Component Cost reads "See below" (or
 * "See Alchemical Item"): the market price of the version you create. The
 * content stores that item as one record per version ("Acidic Fire (level
 * 5)", "Lodret Leaf (heroic tier)"). The pack build links each such formula
 * to those records once ({@link withStoredFormulaItems}) and stores the
 * versions on the formula as {@link FORMULA_ITEMS_FIELD} (versioned JSON),
 * which the sheet reads back with {@link readFormulaItems}.
 *
 * Like the stored prerequisite IR the link depends on other records of the
 * set, so composing several packs recomputes it over the composed records
 * (a later layer may add, replace or rename a version).
 */

import type { ContentEntity, SpecificField } from "./index";

/** The internal field holding a formula's created item versions. */
export const FORMULA_ITEMS_FIELD = "_Formula Items IR";
/** Bump when the matching or the stored shape changes. */
export const FORMULA_ITEMS_VERSION = 1;

export interface FormulaItemVersion {
  /** The version's record ID. */
  readonly id: string;
  readonly level: number;
  /** Its market price in gold pieces. */
  readonly gold: number;
}

export interface FormulaItems {
  readonly version: typeof FORMULA_ITEMS_VERSION;
  /** The created item's name without its version ("Acidic Fire"). */
  readonly name: string;
  /** By level. */
  readonly items: readonly FormulaItemVersion[];
}

/** "Acidic Fire (level 5)", "Lodret Leaf (heroic tier)". */
const VERSION_NAME =
  /^(.+?)\s*\(\s*(?:level\s+\d+|(?:heroic|paragon|epic)\s+tier)\s*\)\s*$/iu;
/** A cost that sends the reader to the item ("See below", "See Alchemical
 *  Item", "see alchemical item Eyesting"), not a value. */
const COST_IS_ITEM_PRICE = /^\s*see\b/iu;

const key = (value: string) => value.trim().toLocaleLowerCase();

function specific(entity: ContentEntity, name: string): string | undefined {
  const wanted = key(name);
  return entity.specifics.find((field) => key(field.name) === wanted)?.value;
}

function amount(value: string | undefined): number | undefined {
  const text = value?.replaceAll(",", "").trim();
  if (text === undefined || !/^\d+(?:\.\d+)?$/u.test(text)) return undefined;
  return Number(text);
}

/** The formula's created versions, or undefined when it has none (no
 *  field, a pack built before it, another version). */
export function readFormulaItems(
  specifics:
    readonly { readonly name: string; readonly value: string }[] | undefined,
): FormulaItems | undefined {
  const raw = specifics?.find(
    (field) => field.name === FORMULA_ITEMS_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<FormulaItems>;
    if (
      parsed.version !== FORMULA_ITEMS_VERSION ||
      typeof parsed.name !== "string" ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0
    )
      return undefined;
    return parsed as FormulaItems;
  } catch {
    return undefined;
  }
}

/** An alchemical formula whose Component Cost is the created item's price. */
function pricedByItem(entity: ContentEntity): boolean {
  return (
    key(entity.type) === "ritual" &&
    key(specific(entity, "type") ?? "") === "alchemical formula" &&
    COST_IS_ITEM_PRICE.test(specific(entity, "Component Cost") ?? "")
  );
}

function withoutField<T extends ContentEntity>(entity: T): T {
  if (!entity.specifics.some(({ name }) => name === FORMULA_ITEMS_FIELD))
    return entity;
  return {
    ...entity,
    specifics: entity.specifics.filter(
      ({ name }) => name !== FORMULA_ITEMS_FIELD,
    ),
  };
}

/**
 * The records with each alchemical formula whose cost is "See below" (or
 * another "See …" reference) linked to the item versions named after it,
 * stored as {@link FORMULA_ITEMS_FIELD}; any older field is replaced. A
 * formula without versions gets none. Pack build and multi-layer profile
 * composition only; the sheet reads the stored field.
 */
export function withStoredFormulaItems<T extends ContentEntity>(
  entities: readonly T[],
): T[] {
  const versions = new Map<
    string,
    { name: string; items: FormulaItemVersion[] }
  >();
  for (const entity of entities) {
    if (key(entity.type) === "ritual") continue;
    const base = VERSION_NAME.exec(entity.name)?.[1];
    if (base === undefined) continue;
    const level = amount(specific(entity, "Level"));
    const gold = amount(specific(entity, "Gold"));
    if (level === undefined || gold === undefined) continue;
    let entry = versions.get(key(base));
    if (entry === undefined) {
      entry = { name: base.trim(), items: [] };
      versions.set(key(base), entry);
    }
    // Two sources' records of one version ("Universal Solvent (heroic
    // tier)" and "(Level 10)") list it once, by the lower ID.
    const same = entry.items.findIndex(
      (item) => item.level === level && item.gold === gold,
    );
    if (same < 0) entry.items.push({ id: entity.id, level, gold });
    else if (entity.id.localeCompare(entry.items[same]!.id) < 0)
      entry.items[same] = { id: entity.id, level, gold };
  }
  return entities.map((entity) => {
    const own = withoutField(entity);
    const created = pricedByItem(own) ? versions.get(key(own.name)) : undefined;
    if (created === undefined) return own;
    const value: FormulaItems = {
      version: FORMULA_ITEMS_VERSION,
      name: created.name,
      items: [...created.items].sort(
        (left, right) =>
          left.level - right.level || left.id.localeCompare(right.id),
      ),
    };
    const field: SpecificField = {
      name: FORMULA_ITEMS_FIELD,
      value: JSON.stringify(value),
      extraAttributes: [],
      ordinal:
        own.specifics.reduce(
          (highest, candidate) => Math.max(highest, candidate.ordinal),
          -1,
        ) + 1,
    };
    return { ...own, specifics: [...own.specifics, field] };
  });
}
