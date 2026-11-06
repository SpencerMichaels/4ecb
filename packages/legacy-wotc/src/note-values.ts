import {
  NOTE_VALUES_FIELD,
  NOTE_VALUES_VERSION,
  type AssociateAbilityName,
  type NoteSegment,
  type NoteValue,
  type NoteValueConstant,
  type NoteValueStep,
  type NoteValueTerm,
  type NoteValues,
  type ParsedNote,
  type RuleStatement,
  type SpecificField,
} from "@4ecb/content-domain";

/**
 * Parses the character-dependent values in a feature's one-line note once,
 * at pack build (D112; the stored shape is content-domain `note-values.ts`).
 * Only what the note itself writes is read: tier tables ("+1/+2/+3 (by
 * tier)", "+1 damage per tier"), level steps ("(+2 at 11th, +3 at 21st
 * level)", "(+3 at epic)"), ability modifiers ("Dex mod", "your Con or Int
 * modifier") and one-half the level. The full text is read only for a note
 * that leaves a bonus's value to it ("gain a bonus to damage rolls" beside
 * "a bonus to damage rolls equal to your Constitution modifier"). A clause
 * that is only a bonus to a defense, initiative, speed or a skill, which the
 * record's own unconditional stat additions put on the sheet, is marked
 * applied.
 */

const ABILITIES: readonly (readonly [RegExp, AssociateAbilityName])[] = [
  [/^str/i, "Strength"],
  [/^con/i, "Constitution"],
  [/^dex/i, "Dexterity"],
  [/^int/i, "Intelligence"],
  [/^wis/i, "Wisdom"],
  [/^cha/i, "Charisma"],
];
const ABBR =
  "(?:str(?:ength)?|con(?:stitution)?|dex(?:terity)?|int(?:elligence)?|wis(?:dom)?|cha(?:risma)?)";
const ABIL = `(?:your\\s+)?${ABBR}(?:(?:\\s*,\\s*(?:or\\s+)?|\\s+or\\s+)${ABBR})*\\s+mod(?:ifier)?(?![a-z])`;
const HALF = "(?:one[- ]?half|half)\\s+(?:of\\s+)?(?:your\\s+)?level(?![a-z])";
const CONST = "\\d+(?:d\\d+|\\[W\\])?(?![\\d/a-z])";
const TIER_VALUE = "\\+?\\d+(?:d\\d+|\\[W\\])?";
const TIER = `${TIER_VALUE}\\s*\\/\\s*${TIER_VALUE}\\s*\\/\\s*${TIER_VALUE}(?![\\d/])(?:\\s*\\((?:by|per)\\s+tier\\)|\\s+(?:by|per)\\s+tier)?`;
const TERM = `(?:${TIER}|${ABIL}|${HALF}|${CONST})`;
/** A term, or one in brackets ("2 + [Cha mod]"). */
const BRACKETED = `(?:\\[${TERM}\\]|${TERM})`;
const SUM = `${BRACKETED}(?:\\s*\\+\\s*${BRACKETED})*`;
/** Not someone else's modifier ("its Con modifier", "that power's"). */
const NOT_OTHERS =
  "(?<!(?:['’]s|\\bits|\\btheir|\\bhis|\\bher|\\brelevant|\\bsame|\\bhighest|\\blowest|\\btwice|\\d+x)\\s*(?:your\\s+)?)";
/** An ability used in place of another ("Use Strength modifier for AC") is
 *  no value. */
const NOT_SUBSTITUTED =
  "(?<!\\b(?:use|uses|using|substitute|instead\\s+of|in\\s+place\\s+of)\\s+(?:your\\s+)?)(?<!\\+\\s+)";
/** Nor the second of a list the match would start inside. */
const NOT_LISTED = `(?<!\\b${ABBR}(?:\\s*,\\s*(?:or\\s+)?|\\s+or\\s+))`;
const EXPRESSION = new RegExp(
  `${NOT_OTHERS}${NOT_SUBSTITUTED}${NOT_LISTED}(?<![\\w/.\\[])(\\+(?:\\s+(?=\\[))?)?(\\[)?(\\+)?(${SUM})(\\])?(?!\\s+(?:instead|in\\s+place)\\b)`,
  "gi",
);
const TERM_AT = new RegExp(`(${TIER})|(${ABIL})|(${HALF})|(${CONST})`, "iy");
const PLUS_AT = /\s*\+\s*/y;
const PER_TIER =
  /(?<![\w/.])(\+)?(\d+)(d\d+|\[W\])?((?:\s+[a-z]+){0,2}?)(?:\s+per\s+tier|\s*\(per\s+tier\))/gi;
const LEVEL_REF =
  "(?:(?:the\\s+)?(?:paragon|epic)(?:\\s+tier)?|(?:level|lvl)\\.?\\s*\\d+\\+?|\\d+(?:st|nd|rd|th)(?:[- ]level)?(?:\\s+(?:level|lv\\b))?)";
const STEP = `(?:increases?\\s+to\\s+)?\\+?${SUM}\\s+at\\s+${LEVEL_REF}`;
const STEP_LIST = `${STEP}(?:\\s*[,;]?\\s*(?:and\\s+)?${STEP})*`;
/** "(+2 at 11th, +3 at 21st level)", or after a comma at the clause's end
 *  ("Add Cha mod to damage, +2 at 11th, +4 at 21st") or "or" ("Deal 1d6
 *  extra damage, or 2d6 at level 21") at the clause's end. */
const STEPS = new RegExp(
  `\\s*\\(\\s*(${STEP_LIST})\\s*\\)|(?:,\\s*|,?\\s+or\\s+(?:by\\s+)?)(${STEP_LIST})(?=\\s*(?:[.;]|$))`,
  "gi",
);
const STEP_PARTS = new RegExp(
  `(?:increases?\\s+to\\s+)?(\\+)?(${SUM})\\s+at\\s+(${LEVEL_REF})`,
  "gi",
);

function constant(text: string): NoteValueConstant {
  const match = /^(\d+)(?:d(\d+)|(\[W\]))?$/i.exec(text.replace(/^\+/, ""));
  if (match === null) return { kind: "flat", value: 0 };
  const count = Number(match[1]);
  if (match[2] !== undefined)
    return { kind: "dice", count, die: `d${match[2]}` };
  if (match[3] !== undefined) return { kind: "dice", count, die: "[W]" };
  return { kind: "flat", value: count };
}

function abilities(text: string): AssociateAbilityName[] {
  const names = text
    .replace(/^your\s+/i, "")
    .replace(/\s+mod(?:ifier)?$/i, "")
    .split(/\s*,\s*(?:or\s+)?|\s+or\s+/i);
  return names.flatMap((name) => {
    const found = ABILITIES.find(([pattern]) => pattern.test(name.trim()));
    return found === undefined ? [] : [found[1]];
  });
}

/** The terms of a sum ("5/10/15 (by tier) + Wis modifier"). */
function terms(written: string): NoteValueTerm[] {
  // Brackets group a term ("[Cha mod]"); "[W]" is a die.
  const sum = written.replace(/\[(?!W\])/gi, "").replace(/(?<!\[W)\]/gi, "");
  const result: NoteValueTerm[] = [];
  let at = 0;
  while (at < sum.length) {
    TERM_AT.lastIndex = at;
    const match = TERM_AT.exec(sum);
    if (match === null) break;
    const [whole, tier, ability, half, value] = match;
    if (tier !== undefined) {
      const values = tier
        .replace(/\s*\(?(?:by|per)\s+tier\)?$/i, "")
        .split(/\s*\/\s*/)
        .map(constant);
      result.push({
        kind: "tier",
        values: [values[0]!, values[1]!, values[2]!],
      });
    } else if (ability !== undefined)
      result.push({ kind: "ability", abilities: abilities(ability) });
    else if (half !== undefined) result.push({ kind: "half-level" });
    else if (value !== undefined) result.push(constant(value));
    at += whole.length;
    PLUS_AT.lastIndex = at;
    const plus = PLUS_AT.exec(sum);
    if (plus === null) break;
    at += plus[0].length;
  }
  return result;
}

const variable = (value: readonly NoteValueTerm[]) =>
  value.some((term) => term.kind !== "flat" && term.kind !== "dice");
const flatOnly = (value: readonly NoteValueTerm[]) =>
  value.every((term) => term.kind === "flat" || term.kind === "dice");

function levelOf(reference: string): number {
  if (/paragon/i.test(reference)) return 11;
  if (/epic/i.test(reference)) return 21;
  return Number(/\d+/.exec(reference)?.[0] ?? 0);
}

interface Found {
  start: number;
  end: number;
  value: NoteValue;
  /** A plain number: a base a level step can attach to, never printed
   *  as a value on its own. */
  plain: boolean;
  /** Words kept between a per-tier number and "per tier". */
  words?: string;
}

/** A value's text continues "Dex modifier in squares": "3 squares". */
const IN_UNITS =
  /^\s+in(?=\s+(?:[a-z]+\s+)?(?:squares?|sq\b|temp|temporary|hp|hps|hit|damage|ongoing|radiant|necrotic|fire|cold|psychic|thunder|lightning|acid|poison|force))/i;

/** One clause's segments (no applied test). */
function clauseSegments(clause: string, description: string): NoteSegment[] {
  const found: Found[] = [];
  const overlaps = (start: number, end: number) =>
    found.some((other) => start < other.end && end > other.start);
  for (const match of clause.matchAll(PER_TIER)) {
    const [, sign, count, die, words = ""] = match;
    const start = match.index;
    const value = constant(`${count}${die ?? ""}`);
    found.push({
      start,
      end: start + match[0].length,
      value: {
        terms: [{ kind: "per-tier", value }],
        signed: sign !== undefined,
      },
      plain: false,
      // The words between the number and "per tier" stay ("+2 damage").
      words,
    });
  }
  for (const match of clause.matchAll(EXPRESSION)) {
    const [, plus, open, sign, sum = "", close] = match;
    let start = match.index;
    let end = start + match[0].length;
    if (open !== undefined && close === undefined) start += 1;
    if (close !== undefined && open === undefined) end -= 1;
    if (overlaps(start, end)) continue;
    const parsed = terms(sum);
    if (parsed.length === 0) continue;
    const bonus = /^\s+(?:[a-z]+\s+)?bonus\b/i.test(clause.slice(end));
    found.push({
      start,
      end,
      value: {
        terms: parsed,
        signed: plus !== undefined || sign !== undefined || bonus,
      },
      plain: !variable(parsed),
    });
  }
  found.sort((a, b) => a.start - b.start);
  // Level steps attach to the nearest value before them.
  const removed: { start: number; end: number }[] = [];
  for (const match of clause.matchAll(STEPS)) {
    const start = match.index;
    const base = found.filter((entry) => entry.end <= start).at(-1);
    if (base === undefined || base.value.steps !== undefined) continue;
    const steps: NoteValueStep[] = [];
    let compatible = true;
    for (const part of (match[1] ?? match[2] ?? "").matchAll(STEP_PARTS)) {
      const stepTerms = terms(part[2] ?? "");
      const add =
        part[1] !== undefined &&
        !flatOnly(base.value.terms) &&
        flatOnly(stepTerms);
      if (flatOnly(base.value.terms) !== flatOnly(stepTerms) && !add)
        compatible = false;
      steps.push({ level: levelOf(part[3] ?? ""), terms: stepTerms, add });
    }
    if (!compatible || steps.length === 0) continue;
    base.value = { ...base.value, steps };
    base.plain = false;
    removed.push({ start, end: start + match[0].length });
  }
  // A bonus the note leaves to the full text.
  const inside = (entry: Found) =>
    removed.some((span) => entry.start >= span.start && entry.end <= span.end);
  const values = found.filter((entry) => !entry.plain && !inside(entry));
  const vague = /\ba(\s+)bonus\s+to\s+(?:the\s+)?([a-z]+)/i.exec(clause);
  if (vague !== null && !overlaps(vague.index, vague.index + vague[0].length)) {
    const word = vague[2]!;
    const matches = [
      ...description.matchAll(
        new RegExp(
          `\\bbonus\\s+to\\s+(?:the\\s+)?(?:your\\s+)?${word}\\b[^.]*?\\bequal\\s+to\\s+(?:your\\s+)?(${SUM})`,
          "gi",
        ),
      ),
    ];
    const parsed = matches.length === 1 ? terms(matches[0]![1] ?? "") : [];
    if (variable(parsed) && !/\bincreases?\b/i.test(description)) {
      const start = vague.index + 1 + vague[1]!.length;
      values.push({
        start,
        end: start,
        value: { terms: parsed, signed: true },
        plain: false,
      });
      values.sort((a, b) => a.start - b.start);
    }
  }
  if (values.length === 0) return [{ kind: "text", text: clause }];
  const segments: NoteSegment[] = [];
  let at = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last?.kind === "text")
      segments[segments.length - 1] = { kind: "text", text: last.text + text };
    else segments.push({ kind: "text", text });
  };
  const textBetween = (from: number, to: number) => {
    let text = "";
    for (let index = from; index < to; index++)
      if (!removed.some((span) => index >= span.start && index < span.end))
        text += clause[index];
    return text;
  };
  for (const entry of values) {
    pushText(textBetween(at, entry.start));
    segments.push({ kind: "value", value: entry.value });
    if (entry.words) pushText(entry.words);
    // A filled bonus is inserted before "bonus": keep its space.
    if (entry.start === entry.end) pushText(" ");
    at = entry.end;
    if (variable(entry.value.terms) || entry.value.steps) {
      const unit = IN_UNITS.exec(clause.slice(at));
      if (unit !== null) at += unit[0].length;
    }
  }
  pushText(textBetween(at, clause.length));
  // "(by tier)" or "per tier" written apart from its value.
  const tiered = values.some((entry) =>
    entry.value.terms.some(
      (term) => term.kind === "tier" || term.kind === "per-tier",
    ),
  );
  return tiered
    ? segments.map((segment) =>
        segment.kind === "text"
          ? {
              kind: "text",
              text: segment.text.replace(
                /\s*\((?:by|per)\s+tier\)|\s+(?:by|per)\s+tier\b/gi,
                "",
              ),
            }
          : segment,
      )
    : segments;
}

const DEFENSES = ["ac", "fortitude", "reflex", "will"];
const SKILLS = [
  "acrobatics",
  "arcana",
  "athletics",
  "bluff",
  "diplomacy",
  "dungeoneering",
  "endurance",
  "heal",
  "history",
  "insight",
  "intimidate",
  "nature",
  "perception",
  "religion",
  "stealth",
  "streetwise",
  "thievery",
];
const TARGET = `(?:${[...DEFENSES, "initiative", "speed", ...SKILLS].join("|")})(?:\\s+(?:defense|checks?))?`;
const APPLIED_CLAUSE = new RegExp(
  `^\\s*\\+(?:${SUM})\\s+(?:(?:feat|item|power|racial|untyped)\\s+)?(?:bonus\\s+)?to\\s+(?:your\\s+)?(${TARGET}(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)${TARGET})*)\\s*$`,
  "i",
);
/** A requirement that only names a level or tier. */
const LEVEL_ONLY =
  /^\s*(?:\d+\s+level|level\s+\d+|(?:heroic|paragon|epic)\s+tier)\s*$/i;

/** The stats the record adds to with no condition beyond level or tier. */
function unconditionalStats(rules: readonly RuleStatement[]): Set<string> {
  const stats = new Set<string>();
  for (const rule of rules) {
    if (rule.name.toLocaleLowerCase() !== "statadd") continue;
    const attribute = (name: string) =>
      rule.attributes.find((entry) => entry.name.toLocaleLowerCase() === name)
        ?.value;
    if (attribute("wearing") !== undefined) continue;
    if (attribute("not-wearing") !== undefined) continue;
    const requires = attribute("requires");
    if (
      requires !== undefined &&
      !requires.split("&").every((part) => LEVEL_ONLY.test(part))
    )
      continue;
    for (const name of (attribute("name") ?? "").split(","))
      stats.add(
        name
          .trim()
          .toLocaleLowerCase()
          .replace(/\s+(?:defense|checks?)$/, ""),
      );
  }
  return stats;
}

function appliedClause(clause: string, stats: ReadonlySet<string>): boolean {
  const match = APPLIED_CLAUSE.exec(clause);
  if (match === null) return false;
  const targets = (match[1] ?? "")
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((target) =>
      target
        .trim()
        .toLocaleLowerCase()
        .replace(/\s+(?:defense|checks?)$/, ""),
    );
  return targets.length > 0 && targets.every((target) => stats.has(target));
}

/** A note's segments, or undefined when it has no value to work out and no
 *  applied clause. */
export function parseNote(
  text: string,
  description: string,
  rules: readonly RuleStatement[],
): ParsedNote | undefined {
  const stats = unconditionalStats(rules);
  // Clauses split at semicolons, each keeping its separator.
  const clauses = text.split(/(?<=;\s*)(?=\S)/);
  const segments: NoteSegment[] = [];
  let changed = false;
  for (const clause of clauses) {
    const body = clause.replace(/;\s*$/, "");
    const separator = clause.slice(body.length);
    if (appliedClause(body, stats)) {
      segments.push({ kind: "applied", text: clause });
      changed = true;
      continue;
    }
    const parts = clauseSegments(body, description);
    if (parts.some((part) => part.kind === "value")) changed = true;
    segments.push(...parts);
    if (separator) segments.push({ kind: "text", text: separator });
  }
  if (!changed) return undefined;
  const merged: NoteSegment[] = [];
  for (const segment of segments) {
    const last = merged.at(-1);
    if (segment.kind === "text" && last?.kind === "text")
      merged[merged.length - 1] = {
        kind: "text",
        text: last.text + segment.text,
      };
    else merged.push(segment);
  }
  return { text, segments: merged };
}

const NOTE_TYPES = new Set(["feat", "class feature", "racial trait"]);

/** The record's {@link NOTE_VALUES_FIELD}, appended after its own fields:
 *  its `Short Description` and `_CS_ShortDescription` notes (the text
 *  before an "@"), when either has a value. */
export function noteValuesField(
  type: string,
  specifics: readonly SpecificField[],
  description: string,
  rules: readonly RuleStatement[],
  ordinal: number,
): SpecificField | undefined {
  if (!NOTE_TYPES.has(type.trim().toLocaleLowerCase())) return undefined;
  const field = (name: string) =>
    specifics.find(
      (specific) =>
        specific.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )?.value;
  const texts = [
    field("_CS_ShortDescription")?.split("@")[0],
    field("Short Description"),
  ].filter((text): text is string => Boolean(text?.trim()));
  const notes: ParsedNote[] = [];
  for (const text of new Set(texts)) {
    const note = parseNote(text, description, rules);
    if (note !== undefined) notes.push(note);
  }
  if (notes.length === 0) return undefined;
  const value: NoteValues = { version: NOTE_VALUES_VERSION, notes };
  return {
    name: NOTE_VALUES_FIELD,
    value: JSON.stringify(value),
    extraAttributes: [],
    ordinal,
  };
}
