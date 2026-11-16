/**
 * Stored power mentions: the powers a feat's or magic item's text names as
 * the one it changes ("When you hit with your abjure undead class
 * feature, …", Wrenching Abjuration; "If you use your second wind when you
 * are bloodied, …", Battleforged Armor). Many such feats have no rules a
 * power card could pick up, so the sheet prints the feat's note among that
 * power's Additional Effects instead of as a page-1 reminder (D126).
 *
 * The pack build matches each feat's description and each magic item's
 * Property against every Power record's name once
 * ({@link withStoredPowerMentions}) and stores the names on the feat or
 * item as {@link POWER_MENTIONS_FIELD} (versioned JSON), which the sheet
 * reads back with {@link readPowerMentions}. Like the stored formula items
 * the match depends on other records of the set, so composing several
 * packs recomputes it over the composed records.
 *
 * A name counts only where the text marks it as a power the character
 * uses: "<name> power" / "class feature" / "racial power" / "attack
 * power" / "utility power", or for a name of several words "your <name>"
 * ("your shield" is the item). At each place the longest such name wins
 * ("your cloud of darkness" is not Darkness). A sentence that gains the
 * power ("swap … for the <name> power", "choose/gain the <name> power") and
 * a power the record itself grants are no mention: its card is the
 * record's own.
 */

import { entityNames } from "./aliases";
import type { ContentEntity } from "./index";

/** The internal field holding the power names a record mentions. */
export const POWER_MENTIONS_FIELD = "_Power Mentions IR";
/** Bump when the matching or the stored shape changes. */
export const POWER_MENTIONS_VERSION = 2;

export interface PowerMentions {
  readonly version: typeof POWER_MENTIONS_VERSION;
  /** The mentioned powers' names, as the pack spells them, in text order. */
  readonly powers: readonly string[];
}

const MENTIONING_TYPES = new Set(["feat", "magic item"]);
const AFTER_NAME =
  /^ (?:power|class feature|racial power|attack power|utility power)\b/u;
const WORD = /[a-z0-9][a-z0-9'-]*/gu;
/** The sentence so far makes the power one the character gains. */
const ACQUIRING = /\b(?:swap|retrain|replace)\b|\b(?:for|choose|gain) the $/u;

const key = (value: string) => value.trim().toLocaleLowerCase();
/** Lower case, straight apostrophes, single spaces. */
const normalized = (value: string) =>
  value.toLocaleLowerCase().replace(/[‘’]/gu, "'").replace(/\s+/gu, " ").trim();

/** The mentioned power names, or undefined when the record has none (no
 *  field, a pack built before it, another version). */
export function readPowerMentions(
  specifics:
    readonly { readonly name: string; readonly value: string }[] | undefined,
): readonly string[] | undefined {
  const raw = specifics?.find(
    (field) => field.name === POWER_MENTIONS_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<PowerMentions>;
    if (
      parsed.version !== POWER_MENTIONS_VERSION ||
      !Array.isArray(parsed.powers) ||
      parsed.powers.length === 0
    )
      return undefined;
    return parsed.powers;
  } catch {
    return undefined;
  }
}

/** The text a record's mentions are read from: a feat's description, a
 *  magic item's Property fields. */
function mentioningText(entity: ContentEntity): string {
  if (key(entity.type) === "feat") return entity.description;
  return entity.specifics
    .filter((field) => key(field.name) === "property")
    .map((field) => field.value)
    .join("\n");
}

interface PowerNameIndex {
  /** By first word: the normalized names, longest first, with the pack's
   *  spelling. */
  readonly byFirstWord: ReadonlyMap<
    string,
    readonly { readonly name: string; readonly display: string }[]
  >;
  /** By power record ID (lower case): its normalized names. */
  readonly namesById: ReadonlyMap<string, readonly string[]>;
}

function powerNameIndex(entities: readonly ContentEntity[]): PowerNameIndex {
  const display = new Map<string, string>();
  const namesById = new Map<string, readonly string[]>();
  for (const entity of entities) {
    if (key(entity.type) !== "power") continue;
    const names = entityNames(entity)
      .map((name) => [normalized(name), name.trim()] as const)
      .filter(([name]) => name !== "");
    namesById.set(
      key(entity.id),
      names.map(([name]) => name),
    );
    for (const [name, spelled] of names)
      if (!display.has(name)) display.set(name, spelled);
  }
  const byFirstWord = new Map<string, { name: string; display: string }[]>();
  for (const [name, spelled] of display) {
    const first = name.match(WORD)?.[0];
    if (first === undefined || !name.startsWith(first)) continue;
    const list = byFirstWord.get(first) ?? [];
    list.push({ name, display: spelled });
    byFirstWord.set(first, list);
  }
  for (const list of byFirstWord.values())
    list.sort((left, right) => right.name.length - left.name.length);
  return { byFirstWord, namesById };
}

/** The power names a text mentions, in text order, once each. */
function mentionsIn(text: string, index: PowerNameIndex): string[] {
  const source = normalized(text);
  const found: string[] = [];
  let resumeAt = 0;
  for (const match of source.matchAll(WORD)) {
    const start = match.index;
    if (start < resumeAt) continue;
    if (start > 0 && /[a-z0-9'-]/u.test(source[start - 1]!)) continue;
    for (const candidate of index.byFirstWord.get(match[0]) ?? []) {
      const end = start + candidate.name.length;
      if (
        !source.startsWith(candidate.name, start) ||
        /[a-z0-9'-]/u.test(source[end] ?? "")
      )
        continue;
      const before = source.slice(0, start);
      // A one-word name ("shield", "virtue") is a common word: only
      // "<name> power" names the power.
      const named =
        AFTER_NAME.test(source.slice(end)) ||
        (before.endsWith("your ") && candidate.name.includes(" "));
      if (!named) continue;
      resumeAt = end;
      // Gaining the power is no rider on it: "swap one … power you know
      // for the entangling whip attack power", "choose the Power Strike
      // power as a regular encounter attack power".
      const sentence = before.slice(
        Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n")) + 1,
      );
      if (ACQUIRING.test(sentence)) break;
      if (!found.includes(candidate.display)) found.push(candidate.display);
      break;
    }
  }
  return found;
}

/** The normalized names of the powers a record's `grant` rules give. */
function grantedPowerNames(
  entity: ContentEntity,
  index: PowerNameIndex,
): Set<string> {
  const granted = new Set<string>();
  for (const rule of entity.rules) {
    if (key(rule.name) !== "grant") continue;
    const id = rule.attributes.find(
      (attribute) => key(attribute.name) === "name",
    )?.value;
    for (const name of id === undefined
      ? []
      : (index.namesById.get(key(id)) ?? []))
      granted.add(name);
  }
  return granted;
}

function withoutField<T extends ContentEntity>(entity: T): T {
  if (!entity.specifics.some(({ name }) => name === POWER_MENTIONS_FIELD))
    return entity;
  return {
    ...entity,
    specifics: entity.specifics.filter(
      ({ name }) => name !== POWER_MENTIONS_FIELD,
    ),
  };
}

/**
 * The records with each feat and magic item that mentions a power storing
 * the names as {@link POWER_MENTIONS_FIELD}; any older field is replaced.
 * Pack build and multi-layer profile composition only; the sheet reads the
 * stored field.
 */
export function withStoredPowerMentions<T extends ContentEntity>(
  entities: readonly T[],
): T[] {
  const index = powerNameIndex(entities);
  return entities.map((entity) => {
    if (!MENTIONING_TYPES.has(key(entity.type))) return withoutField(entity);
    const granted = grantedPowerNames(entity, index);
    const own = normalized(entity.name);
    const powers = mentionsIn(mentioningText(entity), index).filter(
      (name) => !granted.has(normalized(name)) && normalized(name) !== own,
    );
    const base = withoutField(entity);
    if (powers.length === 0) return base;
    const stored: PowerMentions = { version: POWER_MENTIONS_VERSION, powers };
    return {
      ...base,
      specifics: [
        ...base.specifics,
        {
          name: POWER_MENTIONS_FIELD,
          value: JSON.stringify(stored),
          extraAttributes: [],
          ordinal:
            base.specifics.reduce(
              (max, field) => Math.max(max, field.ordinal),
              -1,
            ) + 1,
        },
      ],
    };
  });
}
