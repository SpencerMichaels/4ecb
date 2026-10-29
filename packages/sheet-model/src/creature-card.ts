import {
  readCreatureStatBlock,
  type ContentEntity,
  type CreatureAttackKind,
  type CreatureStatBlock,
} from "@4ecb/content-domain";
import {
  associateStatistics,
  BEAST_ABILITY_NAMES,
  type AssociateStatistics,
  type AssociateStatisticsEntry,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

/**
 * A creature's card (D110): a creature stat block stored on a content record
 * (`_Creature Stat Block`), in the companion card frame. A mount holding's
 * creature today; a summon power's later. A published block's numbers are
 * printed as stored; an owner-relative block's come from rules-engine
 * `associateStatistics` over the owner's evaluated stats, as an associate's
 * do (D107). The text is the stat block's, never abbreviated or reworded.
 */
export type SheetCreatureOrigin = {
  readonly kind: "mount";
  /** The inventory holding the creature belongs to; absent for a builder
   *  candidate (Shop, catalog) that no holding owns yet. */
  readonly holdingId?: string;
};

/** A trait or power of the creature, with its numbers worked out. */
export interface SheetCreatureEntry extends AssociateStatisticsEntry {
  /** A published block's power icon: basic melee, melee, ranged, close,
   *  area. */
  readonly attackKind?: CreatureAttackKind;
}

/**
 * When a creature's whole card overflows the printed card at the minimum text
 * size, print shows it as two cards (D110): `stats` (identity, defenses and
 * hit points, abilities, traits, load) and `actions` (its attacks and other
 * actions). A card with no `part` is the whole creature.
 */
export type SheetCreatureCardPart = "stats" | "actions";

export interface SheetCreatureCard {
  readonly kind: "creature";
  /** The record carrying the stat block. */
  readonly id: string;
  readonly origin: SheetCreatureOrigin;
  readonly part?: SheetCreatureCardPart;
  /** The holding's name ("Warhorse"). */
  readonly name: string;
  /** A published block's level and role ("Brute", "Minion Skirmisher"). */
  readonly level?: number;
  readonly role?: string;
  /** "Large natural beast (mount)". */
  readonly identity?: string;
  readonly defenses: AssociateStatistics["defenses"];
  /** "Your defenses, not including any temporary bonuses or penalties";
   *  a published block's condition ("AC 29 against opportunity attacks"). */
  readonly defensesNote?: string;
  /** "Resist 10 cold", "Saving Throws +2", "Action Points 1". */
  readonly defenseTraits?: readonly string[];
  readonly hitPoints: number;
  /** What its hit points are, when they are its owner's value. */
  readonly hitPointsFrom?: string;
  readonly bloodied?: number;
  /** "A missed attack never damages a minion." */
  readonly hitPointsNote?: string;
  /** "None, but you can spend a healing surge for the steed if …". */
  readonly healingSurges?: string;
  readonly initiative?: number;
  readonly perception?: number;
  readonly speed?: string;
  readonly senses?: string;
  readonly abilities?: readonly {
    readonly name: string;
    readonly score: number;
    readonly modifier: number;
  }[];
  /** "Stealth +14". */
  readonly skills?: string;
  readonly languages?: string;
  /** Passive traits and auras: the stats part. */
  readonly traits: readonly SheetCreatureEntry[];
  /** Attacks and other actions: the actions part. */
  readonly actions: readonly SheetCreatureEntry[];
  /** An owner-relative block's trailing lines ("Alignment: …"). */
  readonly other?: readonly string[];
  /**
   * The record's description, unless it repeats the stat block (the
   * Celestial steeds): flavor and a load table. The builder shows it whole;
   * the printed card keeps only its tables (D110).
   */
  readonly description?: string;
  readonly source: string;
  /** The occurrences that give the creature: page-1 reminders from these
   *  are what the card shows (none for a mount holding). */
  readonly provenanceIds: readonly string[];
}

const HIT_POINTS_FROM: Readonly<
  Record<AssociateStatistics["hitPointsSource"], string | undefined>
> = {
  "master-bloodied": "Your bloodied value",
  "master-surge-value": "Your healing surge value",
  fixed: undefined,
};

const capitalized = (text: string) =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** A published block's usage that names an action ("standard, at-will",
 *  "move; while mounted …", "Move Action; at-will"); the rest are traits
 *  ("while mounted by a friendly rider of 5th level or higher; at-will"). */
const ACTION_USAGE =
  /^(?:standard|move|minor|free|immediate|opportunity|triggered|no action)\b/i;

const MONSTER_FIELD = "_monster";

const comparable = (text: string) =>
  text.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase();

/** The record's `_Monster` text, the source of its stored block. */
function monsterText(entity: ContentEntity): string | undefined {
  const value = entity.specifics.find(
    (field) => field.name.trim().toLocaleLowerCase() === MONSTER_FIELD,
  )?.value;
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

/**
 * Whether the record's description only repeats its stat block's body (the
 * Celestial steeds and the Silver Dragon Steed print the block a second time
 * as their description), so no surface shows it twice.
 */
export function descriptionRepeatsStatBlock(entity: ContentEntity): boolean {
  const monster = monsterText(entity);
  const description = entity.description.trim();
  if (monster === undefined || description.length === 0) return false;
  const body = monster
    .split(/\r\n|\r|\n/)
    .slice(2)
    .join(" ");
  return comparable(description) === comparable(body);
}

/** The stat block of the last of an item's records that carries one. */
export function creatureRecord(
  entities: readonly (ContentEntity | undefined)[],
):
  | { readonly entity: ContentEntity; readonly block: CreatureStatBlock }
  | undefined {
  for (const entity of [...entities].reverse()) {
    if (entity === undefined) continue;
    const block = readCreatureStatBlock(entity.specifics);
    if (block !== undefined) return { entity, block };
  }
  return undefined;
}

export interface SheetCreatureCardInput {
  readonly entity: ContentEntity;
  readonly block: CreatureStatBlock;
  readonly origin: SheetCreatureOrigin;
  /** The holding's name; defaults to the record's. */
  readonly name?: string;
  /** The owner's evaluated stats and level, for an owner-relative block. */
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly level: number;
  readonly provenanceIds?: readonly string[];
}

const defined = <Value extends object>(value: Value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );

export function sheetCreatureCard(
  input: SheetCreatureCardInput,
): SheetCreatureCard {
  const { entity, block } = input;
  const description = descriptionRepeatsStatBlock(entity)
    ? undefined
    : entity.description.trim() || undefined;
  const common = {
    kind: "creature" as const,
    id: entity.id,
    origin: input.origin,
    name: input.name ?? entity.name,
    source: entity.source,
    provenanceIds: input.provenanceIds ?? [],
  };
  if (block.kind === "fixed") {
    const entries = block.entries.map((entry): SheetCreatureEntry => ({
      name: entry.name,
      ...defined({
        keywords: entry.keywords,
        usage: entry.usage,
        attackKind: entry.attackKind,
      }),
      lines: entry.lines.map((line) => ({
        ...(line.label === undefined ? {} : { label: line.label }),
        text: line.text,
      })),
    }));
    const isAction = (entry: SheetCreatureEntry) =>
      entry.attackKind !== undefined || ACTION_USAGE.test(entry.usage ?? "");
    const identity = [block.size, block.creatureType].filter(Boolean).join(" ");
    return {
      ...common,
      defenses: block.defenses,
      hitPoints: block.hitPoints,
      traits: entries.filter((entry) => !isAction(entry)),
      actions: entries.filter(isAction),
      ...defined({
        level: block.level,
        role: block.role,
        identity: identity === "" ? undefined : identity,
        defensesNote: block.defensesNote,
        defenseTraits: block.defenseTraits,
        bloodied: block.bloodied,
        hitPointsNote:
          block.hitPointsNote === undefined
            ? undefined
            : capitalized(block.hitPointsNote),
        initiative: block.initiative,
        perception: block.perception,
        speed: block.speed,
        senses:
          block.senses === undefined ? undefined : capitalized(block.senses),
        abilities: BEAST_ABILITY_NAMES.map((name) => ({
          name,
          ...block.abilities[name],
        })),
        skills: block.skills,
        languages: block.languages,
        description,
      }),
    };
  }
  const associate = block.block;
  const statistics = associateStatistics({
    block: associate,
    stats: input.stats,
    level: input.level,
  });
  const identity = [associate.size, associate.creatureType]
    .filter(Boolean)
    .join(" ");
  return {
    ...common,
    defenses: statistics.defenses,
    hitPoints: statistics.hitPoints,
    traits: statistics.traits,
    actions: statistics.powers,
    ...defined({
      level: associate.level,
      role: associate.role,
      identity: identity === "" ? undefined : identity,
      defensesNote:
        associate.defenses.kind === "master"
          ? capitalized(
              ["your defenses", associate.defensesNote]
                .filter(Boolean)
                .join(", "),
            )
          : associate.defensesNote,
      defenseTraits: associate.defenseTraits,
      hitPointsFrom: HIT_POINTS_FROM[statistics.hitPointsSource],
      bloodied: statistics.bloodied,
      hitPointsNote:
        associate.hitPointsNote === undefined
          ? undefined
          : capitalized(associate.hitPointsNote),
      healingSurges:
        associate.healingSurges === undefined
          ? undefined
          : capitalized(associate.healingSurges),
      initiative: statistics.initiative,
      perception: statistics.perception,
      speed: associate.speed,
      senses:
        associate.senses === undefined
          ? undefined
          : capitalized(associate.senses),
      abilities:
        statistics.abilities === undefined
          ? undefined
          : BEAST_ABILITY_NAMES.map((name) => ({
              name,
              ...statistics.abilities![name],
            })),
      other: associate.other,
      description,
    }),
  };
}

/** The deck key of a creature's card (D099 stable provenance keys); the
 *  actions half of a split creature adds {@link CREATURE_ACTIONS_KEY_SUFFIX}. */
export function sheetCreatureCardKeyBase(card: SheetCreatureCard): string {
  return card.origin.holdingId === undefined
    ? `creature:${card.origin.kind}:def:${card.id.trim().toLocaleLowerCase()}`
    : `creature:${card.origin.kind}:${card.origin.holdingId}`;
}

export const CREATURE_ACTIONS_KEY_SUFFIX = ":actions";

/** Everything the card says, as one text: what a page-1 reminder from the
 *  creature's providers must not go beyond to count as shown. */
export function creatureCardText(card: SheetCreatureCard): string {
  return [
    card.name,
    card.role,
    card.identity,
    `AC Fortitude Reflex Will defenses hit points ${card.hitPoints}`,
    card.initiative === undefined ? undefined : "initiative",
    card.perception === undefined ? undefined : "Perception",
    card.speed === undefined ? undefined : `speed ${card.speed}`,
    card.senses,
    card.defensesNote,
    ...(card.defenseTraits ?? []),
    card.hitPointsNote,
    card.healingSurges === undefined
      ? undefined
      : `healing surges ${card.healingSurges}`,
    card.skills,
    card.languages,
    ...[...card.traits, ...card.actions].flatMap((entry) => [
      entry.name,
      entry.keywords,
      entry.usage,
      ...entry.lines.map((line) =>
        [line.label, line.text].filter(Boolean).join(": "),
      ),
    ]),
    ...(card.other ?? []),
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(". ");
}

/** The card's title: an actions card names itself apart from its stats
 *  card ("Warhorse — Actions"), never as a continuation. */
export function creatureCardTitle(card: SheetCreatureCard): string {
  return card.part === "actions" ? `${card.name} — Actions` : card.name;
}
