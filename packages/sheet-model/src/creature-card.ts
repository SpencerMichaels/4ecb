import {
  powerAttackSlots,
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
  type AssociateStatisticsLine,
  type EvaluatedPower,
  type EvaluatedStat,
  type PowerCommand,
} from "@4ecb/rules-engine";

/**
 * A creature's card (D110): a creature stat block stored on a content record
 * (`_Creature Stat Block`), in the companion card frame: a mount holding's
 * creature, or the creature a summon power describes (D111). A published
 * block's numbers are
 * printed as stored; an owner-relative block's come from rules-engine
 * `associateStatistics` over the owner's evaluated stats, as an associate's
 * do (D107). The text is the stat block's, never abbreviated or reworded.
 */
export type SheetCreatureOrigin =
  | {
      readonly kind: "mount";
      /** The inventory holding the creature belongs to; absent for a
       *  builder candidate (Shop, catalog) that no holding owns yet. */
      readonly holdingId?: string;
    }
  | {
      readonly kind: "summon";
      /** The summon power whose record carries the creature (D111). */
      readonly powerId: string;
    };

/** A summoned creature's command as the summoner rolls it (D111), when
 *  its text does not print the numbers itself: the engine's row. */
export interface SheetCreatureRoll {
  /** "+12 vs. Fortitude". */
  readonly attack: string;
  /** "1d8+7 fire". */
  readonly damage?: string;
}

/** A trait or power of the creature, with its numbers worked out. */
export interface SheetCreatureEntry extends AssociateStatisticsEntry {
  /** A published block's power icon: basic melee, melee, ranged, close,
   *  area. */
  readonly attackKind?: CreatureAttackKind;
  readonly roll?: SheetCreatureRoll;
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
  /** A summoned creature's power's usage ("Daily"), shown in the type bar
   *  (D111). */
  readonly usage?: string;
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
  /** The power-text personalizer a summon's commands take, as its power
   *  card's text does ("Intelligence modifier (+5)"): lines whose numbers
   *  the stat block does not work out itself. */
  readonly personalize?: (text: string) => string;
  /** A summoned creature's command rows from the rules engine
   *  ({@link summonCommandRows}, D111): they replace the stat block's own
   *  attack and damage numbers, or print beside a command's text. */
  readonly commands?: readonly PowerCommand[];
  /** The summon power's usage, for the type bar. */
  readonly usage?: string;
}

const signedBonus = (value: number) => `${value < 0 ? "" : "+"}${value}`;

/**
 * The command rows a summon power's creature card shows (D111): those of
 * the row its power card would show (the equipped main-hand one, else the
 * equipped one, else the first; `proficientOnly` as the card's option),
 * or the power's own for a power with no rows.
 */
export function summonCommandRows(
  power: EvaluatedPower | undefined,
  proficientOnly = false,
): readonly PowerCommand[] | undefined {
  if (power === undefined) return undefined;
  const variants = power.variants.filter(
    (variant) => !proficientOnly || variant.proficient,
  );
  return defaultPowerVariant(variants)?.commands ?? power.commands;
}

/** The row a power card leads with: the equipped main-hand one, else the
 *  equipped one, else the first. */
export function defaultPowerVariant<
  Variant extends { readonly equipped?: boolean; readonly hand?: string },
>(variants: readonly Variant[]): Variant | undefined {
  return (
    variants.find(
      (variant) => variant.equipped === true && variant.hand === "main",
    ) ??
    variants.find((variant) => variant.equipped === true) ??
    variants[0]
  );
}

/**
 * Whether a summon power's attack rows belong to its creature card (D111):
 * its creature has commands the summoner rolls, and every attack field of
 * the power (the one legacy computes a row from, " Opportunity Attack") is
 * one the creature card shows. A power with its own attack (Servant of the
 * Staff) keeps its rows.
 */
export function summonRowsOnCreature(
  entity: ContentEntity | undefined,
): boolean {
  if (entity === undefined) return false;
  const block = readCreatureStatBlock(entity.specifics);
  if (
    block?.kind !== "master" ||
    !block.block.powers.some((power) => power.roll !== undefined)
  )
    return false;
  const shown = new Set(block.powerFields ?? []);
  return powerAttackSlots(entity.specifics).every(
    ([ordinal, role]) =>
      role !== "attack" ||
      shown.has(
        entity.specifics.find((field) => field.ordinal === ordinal)?.name ?? "",
      ),
  );
}

/**
 * A creature's entries with the engine's command rows (D111): a stat-block
 * line that prints its attack or damage takes the row's numbers; a command
 * written as one text (a special command) gets the row beside it.
 */
function withCommandRows(
  entries: readonly AssociateStatisticsEntry[],
  blockEntries: readonly {
    readonly lines: readonly {
      readonly attack?: { readonly range: string };
      readonly rest?: string;
    }[];
  }[],
  commands: readonly PowerCommand[] | undefined,
): SheetCreatureEntry[] {
  if (commands === undefined || commands.length === 0) return [...entries];
  return entries.map((entry, index): SheetCreatureEntry => {
    const row = commands.find((command) => command.entry === index);
    if (row === undefined) return entry;
    const damage =
      row.damage === undefined
        ? undefined
        : [row.damage, row.damageType].filter(Boolean).join(" ");
    const attack = `${signedBonus(row.attackBonus)} vs. ${row.defense}`;
    const block = blockEntries[index];
    let placed = false;
    const lines = entry.lines.map(
      (line, lineIndex): AssociateStatisticsLine => {
        const source = block?.lines[lineIndex];
        if (line.attackBonus !== undefined && source?.attack !== undefined) {
          placed = true;
          return {
            ...line,
            text: `${source.attack.range}; ${attack}`,
            attackBonus: row.attackBonus,
            defense: row.defense,
          };
        }
        if (line.damage !== undefined && damage !== undefined) {
          return {
            ...line,
            text: `${damage} damage${source?.rest ?? ""}`,
            damage,
          };
        }
        return line;
      },
    );
    return placed
      ? { ...entry, lines }
      : {
          ...entry,
          roll: { attack, ...(damage === undefined ? {} : { damage }) },
        };
  });
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
  const personalize = input.personalize;
  const personalized = (
    entries: readonly AssociateStatisticsEntry[],
  ): SheetCreatureEntry[] =>
    personalize === undefined
      ? [...entries]
      : entries.map((entry) => ({
          ...entry,
          lines: entry.lines.map((line) =>
            line.attackBonus !== undefined || line.damage !== undefined
              ? line
              : { ...line, text: personalize(line.text) },
          ),
        }));
  return {
    ...common,
    defenses: statistics.defenses,
    hitPoints: statistics.hitPoints,
    traits: personalized(statistics.traits),
    actions: withCommandRows(
      personalized(statistics.powers),
      associate.powers,
      input.commands,
    ),
    ...(input.usage === undefined ? {} : { usage: input.usage }),
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
  if (card.origin.kind === "summon")
    return `creature:summon:${card.origin.powerId.trim().toLocaleLowerCase()}`;
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
      entry.roll === undefined
        ? undefined
        : [entry.roll.attack, entry.roll.damage].filter(Boolean).join(" "),
    ]),
    ...(card.other ?? []),
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(". ");
}

/** The type bar's label: what kind of creature the card shows, with a
 *  summon power's usage ("Summoned creature · Daily", D111). */
export function creatureCardTypeLabel(card: SheetCreatureCard): string {
  if (card.origin.kind !== "summon") return "Mount";
  return card.usage === undefined || card.usage === ""
    ? "Summoned creature"
    : `Summoned creature · ${card.usage}`;
}

/**
 * The fields of a summon power's record that its creature card shows (D111):
 * the power card leaves them out. Empty for any other record.
 */
export function summonCreatureFieldNames(
  entity: ContentEntity | undefined,
): ReadonlySet<string> {
  if (entity === undefined) return new Set();
  const block = readCreatureStatBlock(entity.specifics);
  return new Set(block?.kind === "master" ? (block.powerFields ?? []) : []);
}

/** The card's title: an actions card names itself apart from its stats
 *  card ("Warhorse — Actions"), never as a continuation. */
export function creatureCardTitle(card: SheetCreatureCard): string {
  return card.part === "actions" ? `${card.name} — Actions` : card.name;
}
