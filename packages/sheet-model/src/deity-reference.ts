import type { ContentEntity } from "@4ecb/content-domain";

const key = (value: string) => value.trim().toLocaleLowerCase();

/** The deity's Character Reference entry: its domains, then its text. */
export interface SheetDeityReference {
  readonly id: string;
  readonly name: string;
  /** The domains the deity grants, in its `Domains` order. */
  readonly domains: readonly { readonly id: string; readonly name: string }[];
  readonly description: string;
  readonly source: string;
}

/**
 * A deity's domains: the Domain records its `Domains` field names (the same
 * records its rules grant). Domains are lore only; they carry no rules.
 */
export function deityDomains(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): readonly ContentEntity[] {
  const ids =
    deity.specifics.find((specific) => key(specific.name) === "domains")
      ?.value ?? "";
  const seen = new Set<string>();
  return ids.split(",").flatMap((id) => {
    const domain = id.trim() === "" ? undefined : lookup(id.trim());
    if (
      domain === undefined ||
      key(domain.type) !== "domain" ||
      seen.has(key(domain.id))
    )
      return [];
    seen.add(key(domain.id));
    return [domain];
  });
}

/** "Love, Moon, Trickery", or undefined for a deity without domains. */
export function deityDomainsText(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): string | undefined {
  const names = deityDomains(deity, lookup).map(({ name }) => name.trim());
  return names.length === 0 ? undefined : names.join(", ");
}

/**
 * The deities a deity counts as (D116): the CountsAsDeity records its rules
 * grant, by the records' own names, in grant order. Lookups by ID only, so
 * a card reads its own rules, never the pack.
 */
export function deityCountsAs(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): readonly ContentEntity[] {
  const seen = new Set<string>();
  return deity.rules.flatMap((rule) => {
    if (key(rule.name) !== "grant") return [];
    const attribute = (name: string) =>
      rule.attributes.find((candidate) => key(candidate.name) === name)?.value;
    const granted = attribute("name");
    if (
      granted === undefined ||
      key(attribute("type") ?? "") !== "countsasdeity"
    )
      return [];
    const record = lookup(granted.trim());
    if (
      record === undefined ||
      key(record.type) !== "countsasdeity" ||
      seen.has(key(record.id))
    )
      return [];
    seen.add(key(record.id));
    return [record];
  });
}

/** "The Raven Queen, Kelemvor", or undefined for a deity counting as none. */
export function deityCountsAsText(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): string | undefined {
  const names = deityCountsAs(deity, lookup).map(({ name }) => name.trim());
  return names.length === 0 ? undefined : names.join(", ");
}

export function sheetDeityReference(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): SheetDeityReference {
  return {
    id: deity.id,
    name: deity.name,
    domains: deityDomains(deity, lookup).map(({ id, name }) => ({ id, name })),
    description: deity.description.trim(),
    source: deity.source,
  };
}
