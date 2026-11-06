/**
 * Record aliases ("also known as", D116 amendment): other names a record is
 * known by, typically the stock name a campaign renamed it from (Deva →
 * Aasimar). Everything that matches records by name matches an alias as
 * the record's own name. Aliases come from a campaign's `name` field patch
 * (the stock name is kept) or from an authored "Also Known As" specific,
 * parsed once at pack build into `ContentEntity.aliases`.
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
 * Every name the record is known by: its name, then its aliases. The one
 * place name lookups read names from, so an alias matches wherever a name
 * does.
 */
export function entityNames(
  entity: Pick<ContentEntity, "name" | "aliases">,
): readonly string[] {
  return entity.aliases === undefined || entity.aliases.length === 0
    ? [entity.name]
    : [entity.name, ...entity.aliases];
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
