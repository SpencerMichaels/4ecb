import { type ContentEntity, countsAsRecords } from "@4ecb/content-domain";

import {
  layoutCardFields,
  type CardField,
  type CardFieldLayout,
} from "./entity-card-fields";

const key = (value: string) => value.trim().toLocaleLowerCase();

/** The deity's Character Reference entry: its domains, then its text. */
export interface SheetDeityReference {
  readonly id: string;
  readonly name: string;
  /** The domains the deity grants, in its `Domains` order. */
  readonly domains: readonly { readonly id: string; readonly name: string }[];
  /** Its card's fields (`deityCardFields`), subheader then body, in order. */
  readonly fields: readonly DeityField[];
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
 * grant, by the records' own names, in grant order. One with the deity's own
 * name is left out (a campaign's Asmodeus counting as the stock Asmodeus
 * says nothing). Lookups by ID only, so a card reads its own rules, never
 * the pack.
 */
export function deityCountsAs(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): readonly ContentEntity[] {
  return countsAsRecords(deity, lookup, "CountsAsDeity");
}

/** "The Raven Queen, Kelemvor", or undefined for a deity counting as none. */
export function deityCountsAsText(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): string | undefined {
  const names = deityCountsAs(deity, lookup).map(({ name }) => name.trim());
  return names.length === 0 ? undefined : names.join(", ");
}

export type DeityField = CardField;

/** A deity card's fields: its subheader lines, then labelled body lines
 *  above its description. */
export type DeityCardFields = CardFieldLayout;

/**
 * A deity card's common fields (owner, 2026-11-06), with one-word labels.
 * The subheader holds fields whose size does not vary widely: the short
 * Alignment, then Pantheon, on line 1; Domains (two or three names) on
 * line 2; any Counts as (D116; one of the deity's own name left out; one
 * to four deity names) on line 3. A field placed `"body"` is a labelled
 * line at the top of the body instead, above the description, so moving
 * one is a change to its placement here. Empty fields and lines are left
 * out. The printed reference entry lists the same fields, in this order.
 */
export function deityCardFields(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): DeityCardFields {
  const specific = (name: string) =>
    deity.specifics
      .find((field) => key(field.name) === key(name))
      ?.value.trim();
  return layoutCardFields([
    { label: "Alignment", value: specific("Alignment"), place: 1 },
    { label: "Pantheon", value: specific("Pantheon"), place: 1 },
    { label: "Domains", value: deityDomainsText(deity, lookup), place: 2 },
    { label: "Counts as", value: deityCountsAsText(deity, lookup), place: 3 },
  ]);
}

/** The card's subheader lines (`deityCardFields`). */
export function deitySubheaderRows(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): readonly (readonly DeityField[])[] {
  return deityCardFields(deity, lookup).subheader;
}

/** The specifics (by lowercase name) `deityCardFields` shows, which the
 *  card's generic field list therefore leaves out. */
export const DEITY_SUBHEADER_SPECIFICS: ReadonlySet<string> = new Set([
  "alignment",
  "pantheon",
  "domains",
]);

export function sheetDeityReference(
  deity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): SheetDeityReference {
  const fields = deityCardFields(deity, lookup);
  return {
    id: deity.id,
    name: deity.name,
    domains: deityDomains(deity, lookup).map(({ id, name }) => ({ id, name })),
    fields: [...fields.subheader.flat(), ...fields.body],
    description: deity.description.trim(),
    source: deity.source,
  };
}
