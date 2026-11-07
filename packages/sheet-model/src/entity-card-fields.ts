import type { ContentEntity } from "@4ecb/content-domain";

const key = (value: string) => value.trim().toLocaleLowerCase();

/** A labelled field of a card: "Tier: Heroic". */
export interface CardField {
  readonly label: string;
  readonly value: string;
}

/**
 * Where a card shows a field (owner, 2026-11-06): on a subheader line under
 * its title (1-based, "·" between a line's fields), as a labelled line in
 * its body, or nowhere ("drop": a duplicate of the title, type bar, header
 * bands, footer, fold heading or level tag, or legacy junk).
 */
export type CardFieldPlace = number | "body" | "drop";

export interface CardFieldPlacement {
  /** The one-word label the card prints. */
  readonly label: string;
  /** Its text; empty or undefined leaves the field out. */
  readonly value: string | undefined;
  readonly place: CardFieldPlace;
  /** The authored specifics (any case) this entry shows or drops, which the
   *  card's generic field list therefore leaves out. */
  readonly specifics?: readonly string[];
}

/** A card's fields: its subheader lines, then labelled body lines. */
export interface CardFieldLayout {
  readonly subheader: readonly (readonly CardField[])[];
  readonly body: readonly CardField[];
}

/**
 * Lays placements out: each subheader line holds its fields in placement
 * order, lines in number order; body fields keep their order. Fields
 * without a value, and lines left empty, are left out. The deity, ritual
 * and every entity card share it, so moving a field is a change to its
 * placement entry only.
 */
export function layoutCardFields(
  placements: readonly CardFieldPlacement[],
): CardFieldLayout {
  const present = placements.flatMap((placement) => {
    const value = placement.value?.trim();
    return value === undefined || value === "" || placement.place === "drop"
      ? []
      : [{ field: { label: placement.label, value }, place: placement.place }];
  });
  const lines = [
    ...new Set(
      present.flatMap(({ place }) =>
        typeof place === "number" ? [place] : [],
      ),
    ),
  ].sort((left, right) => left - right);
  return {
    subheader: lines.map((line) =>
      present.flatMap(({ field, place }) => (place === line ? [field] : [])),
    ),
    body: present.flatMap(({ field, place }) =>
      place === "body" ? [field] : [],
    ),
  };
}

/** An entity card's field layout, and the specifics it accounts for. */
export interface EntityCardFields extends CardFieldLayout {
  /** Lowercase names of the specifics placed or dropped. */
  readonly placed: ReadonlySet<string>;
}

type Specific = (...names: string[]) => string | undefined;

/** The per-type placements; a type not listed has none. */
const PLACEMENTS: Readonly<
  Record<string, (specific: Specific) => readonly CardFieldPlacement[]>
> = {
  // A feat's tier and kind are short and bounded; its powers list and
  // rule text vary, so they are body lines (its prerequisite is the
  // card's own "Prerequisite:" line above the text).
  feat: (specific) => [
    {
      label: "Tier",
      value: specific("Tier"),
      place: 1,
      specifics: ["Tier"],
    },
    {
      label: "Type",
      value: specific("type"),
      place: 1,
      specifics: ["type"],
    },
    {
      label: "Powers",
      value: specific("Associated Powers"),
      place: "body",
      specifics: ["Associated Powers"],
    },
    {
      label: "Associated Power Info",
      value: specific("Associated Power Info"),
      place: "body",
      specifics: ["Associated Power Info"],
    },
    {
      label: "Special",
      value: specific("Special"),
      place: "body",
      specifics: ["Special"],
    },
  ],
};

/**
 * An entity card's fields (owner, 2026-11-06): the subheader holds only
 * short fields whose size does not vary widely, one-word labels, never a
 * short field after a variable one on a line; phrases and sentences are
 * labelled body lines; nothing the card already shows elsewhere (title,
 * type bar, footer, fold heading, level tag) appears again. Undefined for
 * a type without placements: its card lists its specifics as authored.
 * Deities have their own (`deityCardFields`), items theirs
 * (`print-item-presentation.ts`).
 */
export function entityCardFields(
  entity: ContentEntity,
): EntityCardFields | undefined {
  const placementsFor = PLACEMENTS[key(entity.type)];
  if (placementsFor === undefined) return undefined;
  const specific: Specific = (...names) => {
    // A name matches in any case ("type" and "Type" are one field); the
    // first authored value wins.
    for (const name of names)
      for (const field of entity.specifics)
        if (key(field.name) === key(name) && field.value.trim())
          return field.value.trim();
    return undefined;
  };
  const placements = placementsFor(specific);
  return {
    ...layoutCardFields(placements),
    placed: new Set(
      placements.flatMap((placement) => (placement.specifics ?? []).map(key)),
    ),
  };
}
