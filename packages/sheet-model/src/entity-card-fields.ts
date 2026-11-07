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

interface Fields {
  /** An authored specific's trimmed value (any case; the first non-empty
   *  one of `names`), or undefined. */
  readonly value: (...names: string[]) => string | undefined;
  /** A placement showing (or dropping) the first of `names` with a value. */
  readonly at: (
    label: string,
    place: CardFieldPlace,
    ...names: string[]
  ) => CardFieldPlacement;
  /** Whether the record grants a power, which has its own card. */
  readonly grantsPower: boolean;
}

/** "Immortality" (or "Immortality?") heading an epic destiny's Immortality
 *  text repeats its label; any other first line ("Living the Destiny") is
 *  a heading of its own and stays. */
export function immortalityText(value: string | undefined): string | undefined {
  return value
    ?.replace(/^\s*Immortality\s*\??[ \t]*(?:\r?\n|(?=[A-Z]))/u, "")
    .trim();
}

/** Usage and level of a class feature or racial trait: its fold heading or
 *  level tag shows the level, and a granted power's card its usage. */
const featurePlacements = (fields: Fields): readonly CardFieldPlacement[] => [
  fields.at("Level", "drop", "Level"),
  ...(fields.grantsPower ? [fields.at("Usage", "drop", "type")] : []),
];

/** A paragon path's, epic destiny's, theme's or trait package's legacy
 *  "Power Name" (the class's word for powers, "Spells") says nothing to a
 *  player; its prerequisite is the card's own "Prerequisite:" line. */
const pathPlacements = (fields: Fields): readonly CardFieldPlacement[] => [
  fields.at("Power Name", "drop", "Power Name"),
  {
    label: "Immortality",
    value: immortalityText(fields.value("Immortality")),
    place: "body",
    specifics: ["Immortality"],
  },
];

/** "Striker" from a class's "Striker. You deal…" (and "Defender and
 *  Striker", "Martial and Primal"): the role or source it leads with. */
export function classLeadPhrase(value: string | undefined): string | undefined {
  const lead = value?.trim().split(".")[0]?.trim();
  return lead === "" ? undefined : lead;
}

/** A class's or hybrid class's traits box: its role and power source, its
 *  hit points and surges (owner: "HP · Level · Surges"), and its defense
 *  bonuses up top; its key abilities, proficiencies, skills and build
 *  options, which can run to sentences, in the body. */
const classPlacements = (fields: Fields): readonly CardFieldPlacement[] => [
  {
    label: "Role",
    value: classLeadPhrase(fields.value("Role")),
    place: 1,
    specifics: ["Role"],
  },
  {
    label: "Source",
    value: classLeadPhrase(fields.value("Power Source")),
    place: 1,
    specifics: ["Power Source"],
  },
  fields.at("HP", 2, "Hit Points at 1st Level"),
  fields.at("Level", 2, "Hit Points per Level Gained"),
  fields.at("Surges", 2, "Healing Surges"),
  fields.at("Defenses", 3, "Bonus to Defense"),
  fields.at("Abilities", "body", "Key Abilities"),
  fields.at("Secondary", "body", "Secondary Abilities"),
  fields.at("Armor", "body", "Armor Proficiencies"),
  fields.at("Weapons", "body", "Weapon Proficiencies"),
  fields.at("Implements", "body", "Implements"),
  fields.at("Trained", "body", "Trained Skills"),
  fields.at("Class skills", "body", "Class Skills"),
  fields.at("Builds", "body", "Build Options"),
  fields.at("Hybrid talents", "body", "Hybrid Talent Options"),
  fields.at("Power Name", "drop", "Power Name"),
];

/** The per-type placements; a type not listed has none. */
const PLACEMENTS: Readonly<
  Record<string, (fields: Fields) => readonly CardFieldPlacement[]>
> = {
  // A feat's tier and kind are short and bounded; its powers list and
  // rule text vary, so they are body lines (its prerequisite is the
  // card's own "Prerequisite:" line above the text).
  feat: (fields) => [
    fields.at("Tier", 1, "Tier"),
    fields.at("Type", 1, "type"),
    fields.at("Powers", "body", "Associated Powers"),
    fields.at("Associated Power Info", "body", "Associated Power Info"),
    fields.at("Special", "body", "Special"),
  ],
  // A background's campaign and kind ("Forgotten Realms · Geography"):
  // the "General" campaign says nothing, nor does the kind "Campaign" next
  // to a campaign's name. Its skills and languages can be sentences
  // ("…the knowledge skill that best relates to your enemy"); its Benefit
  // and Common Knowledge are the card's own sections.
  background: (fields) => {
    const campaign = fields.value("Campaign");
    const type = fields.value("type");
    return [
      {
        label: "Campaign",
        value:
          campaign?.toLocaleLowerCase() === "general" ? undefined : campaign,
        place: 1,
        specifics: ["Campaign"],
      },
      {
        label: "Type",
        value: type?.toLocaleLowerCase() === "campaign" ? undefined : type,
        place: 1,
        specifics: ["type"],
      },
      fields.at("Skills", "body", "Associated Skills"),
      fields.at("Languages", "body", "Associated Languages"),
    ];
  },
  // A race's traits box: size, speed and vision (fixed size first), then
  // height and weight up top; its ability, language and skill lists
  // ("+2 Wisdom; +2 Intelligence or +2 Charisma", "Common, choice of two
  // others") vary, so they are body lines.
  race: (fields) => [
    fields.at("Size", 1, "Size"),
    fields.at("Speed", 1, "Speed"),
    fields.at("Vision", 1, "Vision"),
    fields.at("Height", 2, "Average Height"),
    fields.at("Weight", 2, "Average Weight"),
    fields.at("Abilities", "body", "Ability Scores"),
    fields.at("Languages", "body", "Languages"),
    fields.at("Skills", "body", "Skill Bonuses"),
  ],
  class: classPlacements,
  // A skill's key ability, one word.
  skill: (fields) => [fields.at("Ability", 1, "Key Ability")],
  "hybrid class": classPlacements,
  "class feature": featurePlacements,
  "racial trait": featurePlacements,
  "paragon path": pathPlacements,
  "epic destiny": pathPlacements,
  theme: pathPlacements,
  "trait package": pathPlacements,
  // Its piece count is in its name ("Aleheart Companions' Gear (2)").
  "item set benefit": (fields) => [
    fields.at("Piece Count", "drop", "Piece Count"),
  ],
  // Its power's usage, action, keywords, trigger and effect are that
  // power's own card (`godFragmentPowerCard`).
  "god fragment": (fields) => [
    // Its quirks are three words ("Abrasive, intimidating, lively"); its
    // constant benefit is a sentence.
    fields.at("Quirks", 1, "Quirks"),
    fields.at("Constant Benefits", "body", "Constant Benefits"),
    fields.at("Usage", "drop", "Power Usage"),
    fields.at("Action", "drop", "Action Type"),
    fields.at("Keywords", "drop", "Keywords"),
    fields.at("Trigger", "drop", "Trigger"),
    fields.at("Effect", "drop", "Effect"),
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
  const placements = entityCardFieldPlacements(entity);
  return placements === undefined
    ? undefined
    : {
        ...layoutCardFields(placements),
        placed: new Set(
          placements.flatMap((placement) =>
            (placement.specifics ?? []).map(key),
          ),
        ),
      };
}

/** The placements behind `entityCardFields`, with the specifics each one
 *  shows or drops (the printed reference entry filters them its own way). */
export function entityCardFieldPlacements(
  entity: ContentEntity,
): readonly CardFieldPlacement[] | undefined {
  const placementsFor = PLACEMENTS[key(entity.type)];
  if (placementsFor === undefined) return undefined;
  const value = (...names: string[]) => {
    // A name matches in any case ("type" and "Type" are one field); the
    // first authored value wins.
    for (const name of names)
      for (const field of entity.specifics)
        if (key(field.name) === key(name) && field.value.trim())
          return field.value.trim();
    return undefined;
  };
  return placementsFor({
    value,
    at: (label, place, ...names) => ({
      label,
      value: value(...names),
      place,
      specifics: names,
    }),
    grantsPower: value("Powers", "_DisplayPowers") !== undefined,
  });
}
