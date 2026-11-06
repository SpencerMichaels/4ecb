/**
 * Record aliases ("also known as", D116 amendment): other names a record is
 * known by, typically the stock name a campaign renamed it from (Deva →
 * Aasimar). Everything that matches records by name matches an alias as
 * the record's own name. Aliases come from a campaign's `name` field patch
 * (the stock name is kept) or from an authored "Also Known As" specific,
 * parsed once at pack build into `ContentEntity.aliases`.
 *
 * An alternate name (`ContentEntity.alternateName`) is a setting's second
 * name for a record that keeps its own: a campaign's `alternateName` patch
 * (Shadar-kai, called Fetchling in Pathfinder). Lookups match it like an
 * alias; the builder titles the record "Shadar-kai (Fetchling)".
 */
import type { ContentEntity } from "./index";

/** The authored specific listing a record's aliases, comma-separated. */
export const ALSO_KNOWN_AS_FIELD = "Also Known As";

/** Most aliases one record carries. */
export const MAX_ENTITY_ALIASES = 32;
/** Longest alias (as a record name). */
export const MAX_ENTITY_ALIAS_LENGTH = 120;

/** Whether a specific's name is the "Also Known As" field. */
export function isAlsoKnownAsField(name: string): boolean {
  return (
    name.trim().toLocaleLowerCase() === ALSO_KNOWN_AS_FIELD.toLocaleLowerCase()
  );
}

/**
 * Aliases in canonical form: trimmed, inner whitespace collapsed, empty
 * ones, the record's own name and repeats (ignoring case) dropped, in the
 * order given.
 */
export function normalizedAliases(
  aliases: readonly string[],
  name: string,
): string[] {
  const seen = new Set([name.trim().toLocaleLowerCase()]);
  const result: string[] = [];
  for (const raw of aliases) {
    const alias = raw.trim().replace(/\s+/gu, " ");
    const key = alias.toLocaleLowerCase();
    if (alias === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

/** An "Also Known As" value's names (comma-separated). */
export function parseAlsoKnownAs(value: string, name: string): string[] {
  return normalizedAliases(value.split(","), name);
}

/** Problems with a record's aliases, for pack validation. */
export function entityAliasErrors(
  entity: Pick<ContentEntity, "id" | "name" | "aliases">,
): string[] {
  const { aliases } = entity;
  if (aliases === undefined) return [];
  const label = `Entity ${entity.id} aliases`;
  if (aliases.length === 0) return [`${label} are empty (omit the field)`];
  if (aliases.length > MAX_ENTITY_ALIASES)
    return [`${label}: at most ${MAX_ENTITY_ALIASES}`];
  const errors: string[] = [];
  for (const alias of aliases)
    if (
      alias.length === 0 ||
      alias.length > MAX_ENTITY_ALIAS_LENGTH ||
      alias !== alias.trim() ||
      /\p{Cc}/u.test(alias)
    )
      errors.push(
        `${label}: ${JSON.stringify(alias)} is not 1-${MAX_ENTITY_ALIAS_LENGTH} trimmed characters without control characters`,
      );
  if (
    errors.length === 0 &&
    normalizedAliases(aliases, entity.name).length !== aliases.length
  )
    errors.push(`${label} repeat each other or the name`);
  return errors;
}

/**
 * Problems with a record's alternate name, for pack validation: one name of
 * 1-120 trimmed characters without control characters, other than the
 * record's name and aliases (ignoring case).
 */
export function entityAlternateNameErrors(
  entity: Pick<ContentEntity, "id" | "name" | "aliases" | "alternateName">,
): string[] {
  const { alternateName } = entity;
  if (alternateName === undefined) return [];
  const label = `Entity ${entity.id} alternate name`;
  if (
    alternateName.length === 0 ||
    alternateName.length > MAX_ENTITY_ALIAS_LENGTH ||
    alternateName !== alternateName.trim() ||
    /\p{Cc}/u.test(alternateName)
  )
    return [
      `${label} ${JSON.stringify(alternateName)} is not 1-${MAX_ENTITY_ALIAS_LENGTH} trimmed characters without control characters`,
    ];
  const folded = alternateName.toLocaleLowerCase();
  return [entity.name, ...(entity.aliases ?? [])].some(
    (name) => name.trim().toLocaleLowerCase() === folded,
  )
    ? [`${label} ${alternateName} repeats the record's name or an alias`]
    : [];
}

/**
 * Every name the record is known by: its name, then its aliases, then its
 * alternate name. The one place name lookups read names from, so an alias
 * or alternate name matches wherever a name does.
 */
export function entityNames(
  entity: Pick<ContentEntity, "name" | "aliases" | "alternateName">,
): readonly string[] {
  const hasAliases = entity.aliases !== undefined && entity.aliases.length > 0;
  if (!hasAliases && entity.alternateName === undefined) return [entity.name];
  return [
    entity.name,
    ...(entity.aliases ?? []),
    ...(entity.alternateName === undefined ? [] : [entity.alternateName]),
  ];
}

/** The record's other names (aliases and alternate name), for search. */
export function entityOtherNames(
  entity: Pick<ContentEntity, "name" | "aliases" | "alternateName">,
): readonly string[] {
  return entityNames(entity).slice(1);
}

/**
 * The record's title in builder tables and card headings: its name, with a
 * campaign's alternate name in parentheses ("Shadar-kai (Fetchling)").
 */
export function entityTitle(
  entity: Pick<ContentEntity, "name" | "alternateName">,
): string {
  return entity.alternateName === undefined
    ? entity.name
    : `${entity.name} (${entity.alternateName})`;
}

/** The record with a setting's alternate name (a campaign patch). */
export function withAlternateName<T extends ContentEntity>(
  entity: T,
  alternateName: string,
): T {
  return { ...entity, alternateName };
}

/**
 * The record renamed to `name`, keeping its former name as an alias (a
 * campaign's `name` patch): Deva renamed to Aasimar is also known as Deva.
 * A former alias that is now the name is dropped from the aliases.
 */
export function renamedEntity<T extends ContentEntity>(
  entity: T,
  name: string,
): T {
  const aliases = normalizedAliases(
    [...(entity.aliases ?? []), entity.name],
    name,
  );
  const { aliases: _previous, ...rest } = entity;
  void _previous;
  return (
    aliases.length === 0 ? { ...rest, name } : { ...rest, name, aliases }
  ) as T;
}
