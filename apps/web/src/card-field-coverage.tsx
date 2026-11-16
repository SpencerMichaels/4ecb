/**
 * Which of a content record's authored fields each card surface shows: the
 * printed card, the builder's panel card (`CandidateDetailCard`: the panel
 * power/item/familiar card or the `reference-entity-card`), and the printed
 * reference entry (`references`). Each surface is rendered by the app's own
 * components and functions; a field counts as shown when its text appears
 * in the surface's text. Used by the private `pnpm audit:card-fields` sweep
 * and the public guard test (`card-field-coverage.test.tsx`).
 */
import { Fragment, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EvaluatedCharacter } from "@4ecb/rules-engine";
import { readItemRulesText } from "@4ecb/content-domain";
import {
  displayPrerequisites,
  isUserFacingSpecific,
  type ContentEntity,
} from "@4ecb/content-domain";
import {
  createSheetPowerCardFinder,
  creatureRecord,
  itemCardBesideCreature,
  sheetCreatureCard,
  deityFeature,
  featureReferenceDescription,
  featureReferenceFields,
  isFamiliarEntity,
  learnedReference,
  learnedReferenceKindOf,
  sheetDeityReference,
  sheetFamiliarCard,
  sheetItemCard,
  type CharacterSheetModel,
  type OverviewFeature,
  type SheetLearnedReference,
  classLeadPhrase,
  withoutDanglingChoiceLeadIn,
  FORMULA_ITEM_PRICE,
} from "@4ecb/sheet-model";

import {
  BuilderCardContext,
  authoredBuilderCardSettings,
  type BuilderCardSettings,
} from "./BuilderCards";
import { CandidateDetailCard } from "./CandidateDetail";
import { CreatureCard } from "./CreatureCard";
import { candidateReferenceIndex } from "./CandidateSelectionTable";
import { isItemEntity } from "./EntityCard";
import { ItemDetail } from "./EquipmentWorkspace";
import { FamiliarCard } from "./FamiliarCard";
import { ItemCard } from "./ItemCard";
import { PowerCard } from "./PowerCard";
import {
  isNamedEnhancement,
  printItemPower,
  printItemPowerClauses,
} from "./print-item-presentation";
import {
  bandShowsAttackLine,
  fallbackPrintAttacks,
  printAttackHeader,
} from "./print-power-attacks";
import { references } from "./SheetOverview";

export type CardSurface = "print" | "panel" | "reference";
export const CARD_SURFACES: readonly CardSurface[] = [
  "print",
  "panel",
  "reference",
];

/** A surface's text: its visible text, and the labels only icons carry
 *  (`aria-label`, `title`). */
export interface SurfaceText {
  readonly text: string;
  readonly labels: string;
}

/** The surfaces a record renders on; a surface it never reaches is absent. */
export type SurfaceTexts = Partial<Record<CardSurface, SurfaceText>>;

const key = (value: string) => value.trim().toLocaleLowerCase();

/** Feature groups whose records print a reference entry (the sheet's
 *  features section, less Theme and Language, which have none). */
const REFERENCE_GROUPS: ReadonlyMap<string, string> = new Map([
  ["racial trait", "Racial Trait"],
  ["class feature", "Class Feature"],
  ["feat", "Feat"],
  ["background", "Background"],
  ["paragon path", "Paragon Path"],
  ["epic destiny", "Epic Destiny"],
]);

const ENTITY_TEXT: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X"))
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#"))
      return String.fromCodePoint(Number(name.slice(1)));
    return ENTITY_TEXT[name.toLowerCase()] ?? whole;
  });
}

/** Static markup's visible text and its icon labels. */
export function markupText(markup: string): SurfaceText {
  const labels = [...markup.matchAll(/\s(?:aria-label|title)="([^"]*)"/g)].map(
    (match) => decodeEntities(match[1] ?? ""),
  );
  const text = decodeEntities(
    markup
      .replace(/<(?:br|\/p|\/li|\/div|\/h\d|\/tr|\/section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  return { text, labels: labels.join("\n") };
}

function render(element: ReactElement): SurfaceText {
  return markupText(renderToStaticMarkup(element));
}

/** Every string a reference entry's parts hold (labels, paragraphs, list
 *  items, table cells). */
function partStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(partStrings);
  if (value !== null && typeof value === "object")
    return Object.entries(value).flatMap(([name, child]) =>
      name === "kind" ? [] : partStrings(child),
    );
  return [];
}

function referenceModel(
  features: readonly OverviewFeature[],
  learned: readonly SheetLearnedReference[],
): CharacterSheetModel {
  return {
    source: "authoritative-evaluation",
    identity: [],
    abilities: [],
    defenses: [],
    resources: [],
    senses: [],
    skills: [],
    equipment: [],
    features: [],
    powers: [],
    items: [],
    companions: [],
    learnedReferences: learned,
    notes: [],
    currency: [],
    overview: { features, inventory: [] } as unknown as NonNullable<
      CharacterSheetModel["overview"]
    >,
  };
}

/** The printed reference entry of a feature, deity or known record, or
 *  undefined for a record that has none. */
function referenceEntryText(
  entity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): SurfaceText | undefined {
  const type = key(entity.type);
  const group = REFERENCE_GROUPS.get(type);
  let features: OverviewFeature[] = [];
  let learned: SheetLearnedReference[] = [];
  if (group !== undefined) {
    const description = featureReferenceDescription(entity);
    const fields = featureReferenceFields(entity, group, description);
    features = [
      {
        id: entity.id,
        name: entity.name,
        group,
        summary: description,
        description,
        fields,
        source: entity.source,
        fullTextAvailable: Boolean(description || fields.length),
      },
    ];
  } else if (type === "deity")
    features = [deityFeature(sheetDeityReference(entity, lookup))];
  else if (type === "ritual")
    learned = [
      learnedReference(
        learnedReferenceKindOf(
          entity.specifics.find((field) => key(field.name) === "category")
            ?.value,
        ),
        entity.name,
        entity,
      ),
    ];
  else return undefined;
  const entries = references(referenceModel(features, learned)).filter(
    (entry) => entry.id === entity.id || entry.id === `learned:${entity.id}`,
  );
  return {
    text: entries
      .flatMap((entry) => [
        entry.name,
        entry.choice ?? "",
        ...partStrings(entry.parts),
      ])
      .join("\n"),
    labels: "",
  };
}

/** The content a record's cards look other records up in. */
export interface CardFieldContent {
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
}

/**
 * A character-free evaluation: the sheet's own power-card finder over it
 * builds a power's card as the sheet would for a power the character
 * doesn't own (authored fields, an augmentable power's versions folded
 * into one card, D118), keeping every feature clause (an unconverged
 * evaluation hides none) and every level's text (level 0).
 */
const NO_CHARACTER = {
  converged: false,
  level: 0,
  stats: {},
  overlays: [],
  powers: [],
  occurrences: [],
  choices: [],
  activeDefinitionIds: [],
  activeDefinitions: [],
} as unknown as EvaluatedCharacter;

const panelSettings = new WeakMap<
  readonly ContentEntity[],
  BuilderCardSettings
>();

function cardSettings(content: CardFieldContent): BuilderCardSettings {
  const cached = panelSettings.get(content.entities);
  if (cached !== undefined) return cached;
  const finder = createSheetPowerCardFinder(NO_CHARACTER, content.entities);
  const settings: BuilderCardSettings = {
    ...authoredBuilderCardSettings(0),
    powerCardFor: (entity) => finder(entity, undefined),
    // Every creature a record carries, owner-relative ones too (their
    // numbers unresolved): the creature card is where a summon power's
    // creature fields print (D111).
    creatureCardFor: (name, entities, origin = { kind: "mount" }) => {
      const record = creatureRecord(entities);
      return record === undefined
        ? undefined
        : sheetCreatureCard({
            ...record,
            origin,
            name: origin.kind === "summon" ? record.block.name : name,
            stats: {},
            level: 1,
          });
    },
  };
  panelSettings.set(content.entities, settings);
  return settings;
}

/**
 * A record's text on each surface it reaches. Cards are built without a
 * character (authored formulas, every level's text: level 0 keeps each
 * "Level N:" tier).
 */
export function cardSurfaceTexts(
  entity: ContentEntity,
  content: CardFieldContent,
): SurfaceTexts {
  const lookup = (id: string) => content.byId.get(key(id));
  const settings = cardSettings(content);
  const surfaces: { -readonly [S in CardSurface]?: SurfaceText } = {};
  const type = key(entity.type);
  if (type === "power") {
    const creature = settings.creatureCardFor(entity.name, [entity], {
      kind: "summon",
      powerId: entity.id,
    });
    surfaces.print = render(
      createElement(
        Fragment,
        null,
        createElement(PowerCard, {
          card: settings.powerCardFor(entity),
          characterLevel: 0,
        }),
        creature === undefined
          ? null
          : createElement(CreatureCard, { card: creature }),
      ),
    );
  } else if (isItemEntity(entity)) {
    // A mount's creature card carries what its item card leaves to it
    // (D110).
    const creature = settings.creatureCardFor(entity.name, [entity]);
    surfaces.print = render(
      createElement(
        Fragment,
        null,
        createElement(ItemCard, {
          card: itemCardBesideCreature(
            sheetItemCard({ name: entity.name, entities: [entity] }),
            creature,
          ),
        }),
        creature === undefined
          ? null
          : createElement(CreatureCard, { card: creature }),
      ),
    );
  } else if (isFamiliarEntity(entity))
    surfaces.print = render(
      createElement(FamiliarCard, { card: sheetFamiliarCard(entity, {}) }),
    );
  // An item's builder pane is the Inventory/Shop detail (its card, its
  // creature, the powers it grants, its set); anything else's is the
  // option detail card.
  surfaces.panel = render(
    createElement(
      BuilderCardContext.Provider,
      { value: settings },
      isItemEntity(entity)
        ? createElement(ItemDetail, {
            item: { entities: [entity], displayName: entity.name },
            byId: content.byId,
          })
        : createElement(CandidateDetailCard, {
            entity,
            references: candidateReferenceIndex(content.byId),
          }),
    ),
  );
  const reference = referenceEntryText(entity, lookup);
  if (reference !== undefined) surfaces.reference = reference;
  return surfaces;
}

/** How a surface shows a field. */
export type FieldPresence =
  | "verbatim"
  | "normalized"
  | "reworded"
  // In another form a card deliberately prints it in (`CARD_FIELD_MERGES`).
  | "merged"
  | "icon"
  | "missing"
  // Missing, deliberately (`CARD_FIELD_ALLOWLIST`).
  | "hidden";

export type FieldKind = "specific" | "description" | "flavor" | "prerequisites";

export interface FieldCoverage {
  readonly kind: FieldKind;
  /** The specific's name as authored (trimmed), or the kind. */
  readonly name: string;
  readonly value: string;
  /** Not user-facing content (`isUserFacingSpecific`): `_` fields, legacy
   *  bookkeeping, ID lists. */
  readonly internal: boolean;
  readonly surfaces: Partial<Record<CardSurface, FieldPresence>>;
}

const plain = (value: string) =>
  decodeEntities(value.replace(/<[^>]+>/g, " "))
    .toLocaleLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** Case, punctuation, digit grouping ("4,200") and the cards' deliberate
 *  abbreviations ("CON" for "your Constitution modifier", "Fort", "Ref")
 *  left out. */
const alnum = (value: string) =>
  plain(value)
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(
      /\b(?:your\s+)?(str|con|dex|int|wis|cha)(?:ength|stitution|terity|elligence|dom|risma)?(?:\s+modifier)?\b/g,
      "$1",
    )
    .replace(/\bfortitude\b/g, "fort")
    .replace(/\breflex\b/g, "ref")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const words = (value: string) =>
  alnum(value)
    .split(" ")
    .filter((word) => word.length > 0);

interface PreparedSurface {
  readonly plain: string;
  readonly alnum: string;
  readonly words: ReadonlySet<string>;
  readonly labels: string;
}

function prepare(surface: SurfaceText): PreparedSurface {
  const alnumText = ` ${alnum(surface.text)} `;
  return {
    plain: plain(surface.text),
    alnum: alnumText,
    words: new Set(alnumText.split(" ")),
    labels: ` ${alnum(surface.labels)} `,
  };
}

/** The share of a value's distinct words a surface shows that counts it as
 *  shown reworded (punctuation, "(+N)" annotations, joined lists). */
const REWORDED_SHARE = 0.85;

const contains = (surface: PreparedSurface, value: string) => {
  const normalized = alnum(value);
  return normalized !== "" && surface.alnum.includes(` ${normalized} `);
};

function presence(
  value: string,
  surface: PreparedSurface,
  names: readonly string[],
  merged: readonly string[],
): FieldPresence {
  if (surface.plain.includes(plain(value))) return "verbatim";
  if ([value, ...names].some((candidate) => contains(surface, candidate)))
    return "normalized";
  // A form with nothing left (a lead-in the card drops whole) shows as
  // deliberately as any.
  if (merged.some((form) => alnum(form) === "" || contains(surface, form)))
    return "merged";
  const distinct = [...new Set(words(value))];
  const shown = distinct.filter((word) => surface.words.has(word)).length;
  if (
    distinct.length > 0 &&
    (shown === distinct.length ||
      (distinct.length >= 3 && shown / distinct.length >= REWORDED_SHARE))
  )
    return "reworded";
  if (
    [value, ...names].some((candidate) => {
      const normalized = alnum(candidate);
      return normalized !== "" && surface.labels.includes(` ${normalized} `);
    })
  )
    return "icon";
  return "missing";
}

/** Names of the records a value lists by ID ("ID_FMP_CLASS_1"), which a
 *  card shows by name. */
function referencedNames(
  value: string,
  lookup: (id: string) => ContentEntity | undefined,
): string[] {
  return value.split(/\s*[,;]\s*/).flatMap((token) => {
    const record = token.trim() ? lookup(token) : undefined;
    return record === undefined ? [] : [record.name];
  });
}

/** A rule about some records' field: which types, fields, surfaces and
 *  values it covers, and why. */
export interface CardFieldRule {
  /** Lowercase content types; every type when absent. */
  readonly types?: readonly string[];
  /** Specific names (any case), or "(description)", "(flavor)",
   *  "(prerequisites)". */
  readonly fields: readonly string[];
  /** The surfaces it covers; every surface the record reaches when absent. */
  readonly surfaces?: readonly CardSurface[];
  /** Only values matching this. */
  readonly values?: RegExp;
  /** Only records this holds for. */
  readonly records?: (entity: ContentEntity) => boolean;
  readonly reason: string;
}

/** A field a card prints in another form: the text to look for instead. */
export interface CardFieldMerge extends CardFieldRule {
  readonly form: (value: string, entity: ContentEntity) => string | undefined;
}

const ITEM_TYPES = [
  "armor",
  "gear",
  "item set",
  "magic item",
  "ritual",
  "ritual scroll",
  "superior implement",
  "weapon",
];
const FEATURE_TYPES = [
  "class feature",
  "racial trait",
  "feat",
  "background",
  "paragon path",
  "epic destiny",
];
const ATTACK_LINES = [
  "Attack",
  "Primary Attack",
  "Secondary Attack",
  "Tertiary Attack",
];
const specificValue = (entity: ContentEntity, name: string) =>
  entity.specifics.find((field) => key(field.name) === key(name))?.value;

/** Deliberate merges: the field shows, in another form. */
export const CARD_FIELD_MERGES: readonly CardFieldMerge[] = [
  {
    types: ITEM_TYPES,
    fields: ["(description)"],
    surfaces: ["print"],
    reason:
      "a printed card prints only the description's mechanics: an artifact's concordance and states, a cursed item's curse rules (_Item Rules Text IR; owner, 2026-11-16)",
    form: (_value, entity) => readItemRulesText(entity.specifics)?.text,
  },
  {
    types: ["weapon"],
    fields: ["Armor Category"],
    reason: 'a shield weapon\'s subheader "Shield Light" (owner, 2026-11-16)',
    form: (value) => `Shield ${value.trim().replace(/\s*shields?$/i, "")}`,
  },
  {
    types: ["gear"],
    fields: ["count"],
    reason:
      'the card title, "Arrows (30)", when more than one (owner, 2026-11-16)',
    form: (value, entity) => `${entity.name} (${value.trim()})`,
  },
  {
    types: ["power"],
    fields: ATTACK_LINES,
    reason:
      'the attack band: the ability (an ability choice resolved for the character, "INT vs Fort" before evaluation) against the defense',
    // Only a line the band shows all of (`bandShowsAttackLine`, every
    // level's text): any other line prints as a rule.
    form: (value) => {
      if (!bandShowsAttackLine(value, 0)) return undefined;
      const [attack] = fallbackPrintAttacks(
        { kind: "power", name: "", fields: [{ label: "Attack", value }] },
        undefined,
      );
      return attack === undefined ? undefined : printAttackHeader(attack);
    },
  },
  {
    types: ITEM_TYPES,
    fields: [
      "Power",
      "Utility Power",
      "Attack Power",
      "Power (Daily)",
      "Power (Encounter)",
    ],
    reason:
      "the item power's heading (action, usage, keywords) and text (printItemPower)",
    form: (value, entity) =>
      printItemPower({ label: "Power", value }) === undefined
        ? undefined
        : (printItemPowerClauses(
            printItemPower({ label: "Power", value })!.text,
          ).at(-1)?.value ?? entity.name),
  },
  {
    types: ITEM_TYPES,
    fields: ["Critical"],
    reason: 'the subheader\'s "Crit" stat, its dice',
    form: (value) => value.match(/^\+?\d+d\d+/)?.[0],
  },
  {
    types: ITEM_TYPES,
    fields: ["Enhancement"],
    reason:
      'the "+N" in the item\'s name, when it is that kind\'s standard phrase ("+2 AC"; isNamedEnhancement)',
    form: (value, entity) =>
      isNamedEnhancement(value, entity.name) ? entity.name : undefined,
  },
  {
    types: ["magic item"],
    fields: ["Magic Item Type"],
    reason: 'the type bar and footer ("Arms item" for "Arms Slot Item")',
    form: (value) => value.replace(/\s+slot\b/i, ""),
  },
  {
    types: ["ritual"],
    fields: ["Component Cost"],
    reason:
      "an alchemical formula's \"See Alchemical Item\" cost is the created item's price, with its Creates line (_Formula Items IR)",
    values: /^see\b/i,
    form: () => FORMULA_ITEM_PRICE,
  },
  {
    types: ["class", "hybrid class"],
    fields: ["Role", "Power Source"],
    reason:
      'the subheader\'s "Role · Source" keeps the lead word only ("Defender"; owner, 2026-11-16); the rest of the sentence is the class\'s pitch',
    form: (value) => classLeadPhrase(value),
  },
  {
    types: FEATURE_TYPES,
    fields: ["(description)"],
    surfaces: ["reference"],
    reason:
      'the reference entry drops a closing "choose one of the following" whose list it doesn\'t print (the pick is in its heading)',
    form: (value) => withoutDanglingChoiceLeadIn(value),
  },
];

const PLAY_ONLY =
  "printed cards are play-only (legacy prints flavor only with its Show Flavor Text option); the builder pane shows it in the flavor band";

/** Fields a surface deliberately leaves out. */
export const CARD_FIELD_ALLOWLIST: readonly CardFieldRule[] = [
  {
    fields: ["(flavor)"],
    surfaces: ["print"],
    reason: PLAY_ONLY,
  },
  {
    fields: ["(flavor)"],
    surfaces: ["reference"],
    reason:
      "the printed reference entry is the rules text; flavor stays in the builder pane",
  },
  {
    types: ["familiar"],
    fields: ["(description)", "(prerequisites)"],
    surfaces: ["print"],
    reason:
      "the printed familiar card is mechanics only (D110 amendment); the builder pane shows both",
  },
  {
    types: [...FEATURE_TYPES, "companion", "trait package"],
    fields: ["Short Description"],
    reason:
      "page 1's feature rows and reminders print it (featureNoteText); cards and reference entries print the full description it abbreviates",
  },
  {
    types: ["class feature", "racial trait"],
    fields: ["Level"],
    reason:
      "the builder's level fold and the reference entry's level tag show it (featurePlacements)",
  },
  {
    types: ["class feature", "racial trait"],
    fields: ["Type", "type"],
    values:
      /^(?:at-will|encounter|daily|utility|attack|feature)\b(?:\s*\(special\))?$/i,
    reason:
      "a feature that grants a power: the power's own card shows its usage and type",
  },
  {
    types: ["feat", "class feature", "background"],
    fields: ["Tier", "Type", "type", "Campaign"],
    surfaces: ["reference"],
    reason:
      "selection metadata the builder card's subheader shows; the reference entry is the rules text",
  },
  {
    types: ["background"],
    fields: ["Common Knowledge", "Common Kowledge", "(description)"],
    surfaces: ["reference"],
    reason:
      "lore: a background's reference entry prints its mechanics only (benefit, skills, languages)",
  },
  {
    types: ["background"],
    fields: ["Campaign"],
    values: /^general$/i,
    reason: 'the "General" campaign says nothing (entity-card-fields)',
  },
  {
    types: ["paragon path", "epic destiny", "theme", "trait package", "class"],
    fields: ["Power Name"],
    reason:
      'the class\'s word for powers ("Spells") says nothing to a player (pathPlacements)',
  },
  {
    types: ["class feature"],
    fields: ["Powers"],
    surfaces: ["reference"],
    reason: "the powers it grants print as their own cards",
  },
  {
    types: ["weapon", "armor", "gear", "superior implement"],
    fields: ["Full Text"],
    reason:
      "the legacy book stat block, which the card's structured fields reproduce",
  },
  {
    types: ["weapon", "armor", "magic item", "superior implement", "gear"],
    fields: ["Item Slot"],
    values: /^(?:off-hand|main hand|two-hands|hands?)$/i,
    reason:
      "a held item's hand slot is its kind's (Hands, an implement), not a worn slot the footer names",
  },
  {
    types: ["ritual scroll"],
    fields: ["type"],
    reason:
      "the scroll's record kind; the card names what it holds (its title, type bar)",
  },
  {
    types: ["power"],
    fields: ["Power Type"],
    values: /^(?:attack|feature)$/i,
    reason:
      'the attack band shows it\'s an attack (owner, 2026-11-16: the type bar stays "<usage> power"; a utility\'s says "Utility power")',
  },
  {
    types: ["power"],
    fields: ["Power Usage"],
    records: (entity) => specificValue(entity, "Rules Item") !== undefined,
    reason: "a rules reference prints as a Feature, with no usage",
  },
  {
    types: ["power"],
    records: (entity) => specificValue(entity, "_AugmentParent") !== undefined,
    fields: [
      "Hit",
      "Effect",
      "Keyword",
      "Attack Type",
      "Move Action",
      "Immediate Interrupt",
      "Standard Action",
    ],
    reason:
      "an augment version's card is its parent's, which prints the parent's authored augment block (D118)",
  },
  {
    types: ["power"],
    fields: ["Attack Type"],
    values: /^You move each knights/,
    reason:
      "content error: a second Attack Type field holding an effect clause (Knights of Unyielding Valor)",
  },
  {
    types: ["power"],
    fields: ["(description)"],
    surfaces: ["print"],
    reason:
      "a power's book sidebar is descriptive text: the builder pane's flavor band shows it (owner, 2026-11-16); printed cards print it only when it is the rules (no rule fields)",
  },
  {
    types: ITEM_TYPES,
    fields: ["(description)"],
    surfaces: ["print"],
    records: (entity) => readItemRulesText(entity.specifics) === undefined,
    reason:
      "printed cards are for mechanics, not flavor (owner, 2026-11-16): the builder pane shows an item's description after its rules; a printed card prints it only when the card has no rules (a mundane item's text) or its mechanics part (_Item Rules Text IR)",
  },
  {
    types: ["gear"],
    fields: ["count"],
    values: /^[01]$/,
    reason: "a purchase of one names no count",
  },
];

function ruleFor<Rule extends CardFieldRule>(
  rules: readonly Rule[],
  entity: ContentEntity,
  kind: FieldKind,
  name: string,
  value: string,
  surface: CardSurface,
): Rule[] {
  const type = key(entity.type);
  const field = kind === "specific" ? key(name) : `(${kind})`;
  return rules.filter(
    (rule) =>
      (rule.types === undefined || rule.types.includes(type)) &&
      (rule.surfaces === undefined || rule.surfaces.includes(surface)) &&
      (rule.values === undefined || rule.values.test(value.trim())) &&
      (rule.records === undefined || rule.records(entity)) &&
      rule.fields.some((candidate) => key(candidate) === field),
  );
}

/** The allowance hiding a record's field on a surface, if any. */
export function cardFieldAllowance(
  entity: ContentEntity,
  kind: FieldKind,
  name: string,
  value: string,
  surface: CardSurface,
): CardFieldRule | undefined {
  return ruleFor(CARD_FIELD_ALLOWLIST, entity, kind, name, value, surface)[0];
}

/** Each of a record's non-empty fields, and how each surface shows it. */
export function cardFieldCoverage(
  entity: ContentEntity,
  surfaces: SurfaceTexts,
  content: CardFieldContent,
): FieldCoverage[] {
  const lookup = (id: string) => content.byId.get(key(id));
  const prepared = Object.entries(surfaces).map(
    ([surface, text]) => [surface as CardSurface, prepare(text)] as const,
  );
  const coverage = (
    kind: FieldKind,
    name: string,
    value: string,
    internal: boolean,
  ): FieldCoverage => {
    const names = referencedNames(value, lookup);
    return {
      kind,
      name,
      value,
      internal,
      surfaces: Object.fromEntries(
        prepared.map(([surface, text]) => {
          const merged = ruleFor(
            CARD_FIELD_MERGES,
            entity,
            kind,
            name,
            value,
            surface,
          ).flatMap((merge) => merge.form(value, entity) ?? []);
          const shown = presence(value, text, names, merged);
          return [
            surface,
            shown === "missing" &&
            cardFieldAllowance(entity, kind, name, value, surface) !== undefined
              ? "hidden"
              : shown,
          ];
        }),
      ),
    };
  };
  // A value of only punctuation (a legacy heading's "­") says nothing.
  const says = (value: string) => /[\p{L}\p{N}]/u.test(value);
  const fields: FieldCoverage[] = entity.specifics.flatMap((specific) =>
    !says(specific.value)
      ? []
      : [
          coverage(
            "specific",
            specific.name.trim(),
            specific.value,
            !isUserFacingSpecific(specific),
          ),
        ],
  );
  if (says(entity.description))
    fields.push(
      coverage("description", "description", entity.description, false),
    );
  if (entity.flavor !== undefined && says(entity.flavor))
    fields.push(coverage("flavor", "flavor", entity.flavor, false));
  // The prerequisite line cards print (its print form, else its rule).
  const prerequisites = displayPrerequisites(entity);
  if (prerequisites !== undefined && says(prerequisites))
    fields.push(
      coverage("prerequisites", "prerequisites", prerequisites, false),
    );
  return fields;
}
