/**
 * Displayed prerequisite lines with renamed records' current names (D116,
 * record aliases): a campaign that renames Shadar-kai to Fetchling keeps
 * "Shadar-kai" as an alias, and the line a player reads says "Fetchling".
 *
 * The displayed line (`displayPrerequisites`: usually the authored print
 * line, which may reword or drop clauses of the rule text) keeps its
 * wording; only an old name the internalized rule text resolves to the
 * renamed record is swapped, inside whatever clause names it ("fluent in
 * Supernal", "warforged race"). Lines are computed once per content set,
 * where the engine internalizes prerequisites, and travel with the
 * evaluation (`EvaluatedCharacter.prerequisiteLines`).
 */
import {
  contentCache,
  displayPrerequisites,
  entityNames,
  type ContentEntity,
} from "@4ecb/content-domain";

import {
  internalizePrerequisite,
  prerequisiteReferences,
  type PrerequisiteReference,
} from "./prerequisites";

/** A displayed line that keeps an old name it names more often than the
 *  rule text resolves it, so which occurrences are references is unknown. */
export interface PrerequisiteRenameDiagnostic {
  readonly entityId: string;
  /** The record's displayed line, unchanged for this name. */
  readonly line: string;
  /** The old name (an alias) the line keeps. */
  readonly name: string;
  /** Occurrences of the name in the line, outside clauses naming other
   *  records. */
  readonly occurrences: number;
  /** Clauses of the rule text that resolve the name to its record. */
  readonly references: number;
}

export interface PrerequisiteDisplayLines {
  /** The displayed line by record ID, only for records whose line changes. */
  readonly lines: Readonly<Record<string, string>>;
  readonly diagnostics: readonly PrerequisiteRenameDiagnostic[];
}

const NONE: PrerequisiteDisplayLines = { lines: {}, diagnostics: [] };

/** Letters, digits, apostrophes and hyphens continue a word: "Half-Giant"
 *  does not name Giant. */
const WORD = "[\\p{L}\\p{N}'\\u2019-]";

interface AliasMatcher {
  readonly pattern: RegExp;
  /** Lower-cased alias → its spelling. */
  readonly aliases: ReadonlyMap<string, string>;
}

function escaped(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Matches any alias as whole words, ignoring case, longest first (so a
 *  renamed "Deva Heritage" wins over a renamed "Deva"). */
function aliasMatcher(
  entities: readonly ContentEntity[],
): AliasMatcher | undefined {
  const aliases = new Map<string, string>();
  for (const entity of entities)
    for (const alias of entity.aliases ?? [])
      if (!aliases.has(alias.toLocaleLowerCase()))
        aliases.set(alias.toLocaleLowerCase(), alias);
  if (aliases.size === 0) return undefined;
  const alternatives = [...aliases.values()]
    .sort((left, right) => right.length - left.length)
    .map(escaped)
    .join("|");
  return {
    pattern: new RegExp(`(?<!${WORD})(?:${alternatives})(?!${WORD})`, "giu"),
    aliases,
  };
}

interface Match {
  readonly start: number;
  readonly end: number;
  /** Lower-cased alias. */
  readonly alias: string;
  readonly text: string;
}

function matches(text: string, matcher: AliasMatcher): Match[] {
  // matchAll starts at the shared pattern's lastIndex.
  matcher.pattern.lastIndex = 0;
  return [...text.matchAll(matcher.pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    alias: match[0].toLocaleLowerCase(),
    text: match[0],
  }));
}

/** Where `text` occurs in `line` as whole words, ignoring case. */
function occurrences(
  line: string,
  text: string,
): { start: number; end: number }[] {
  const pattern = new RegExp(
    `(?<!${WORD})${escaped(text.trim())}(?!${WORD})`,
    "giu",
  );
  return text.trim() === ""
    ? []
    : [...line.matchAll(pattern)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
      }));
}

/**
 * The current name in the occurrence's case style. The books lower-case
 * race names in running text ("11th level, shadar-kai, avenger class",
 * "Any race except warforged"), and a renamed race keeps that style: an
 * all-lower-case occurrence gets the lower-cased name, an all-capitals one
 * the capitalized name; otherwise (the alias as spelled, or title case
 * such as "Shadar-Kai") the name as the record spells it, with the
 * occurrence's leading capital.
 */
function casedLike(occurrence: string, name: string): string {
  const lower = occurrence.toLocaleLowerCase();
  const upper = occurrence.toLocaleUpperCase();
  if (lower === upper) return name;
  if (occurrence === lower) return name.toLocaleLowerCase();
  if (occurrence === upper && occurrence.length > 1)
    return name.toLocaleUpperCase();
  const first = occurrence.charAt(0);
  return first === first.toLocaleUpperCase() && first !== lower.charAt(0)
    ? name.charAt(0).toLocaleUpperCase() + name.slice(1)
    : name;
}

/**
 * The current name `alias` (lower-cased) is renamed to among the records a
 * clause resolves to: the record that has it as an alias. None when one of
 * them (other than a counts-as alternate, which keeps the stock name for
 * hybrids and stand-ins) still has it as its own name: a kept stock
 * Primordial beside a campaign tongue also known as Primordial.
 */
function renamedTo(
  definitions: readonly ContentEntity[],
  alias: string,
): string | undefined {
  if (
    definitions.some(
      (definition) =>
        !/^countsas/iu.test(definition.type.trim()) &&
        definition.name.toLocaleLowerCase() === alias,
    )
  )
    return undefined;
  return definitions.find((definition) =>
    entityNames(definition)
      .slice(1)
      .some((name) => name.toLocaleLowerCase() === alias),
  )?.name;
}

/**
 * `line` with each old name (an alias) swapped for its record's current
 * name where the rule's clauses (`references`) resolve it to that record.
 * A clause resolving to other records ("Emergent Primordial", "Warforged
 * Juggernaut") masks its text in the line. A name is swapped only when the
 * line has no more unmasked occurrences of it than clauses resolving it,
 * and only to one current name; otherwise none of its occurrences change
 * and `ambiguous` reports it.
 */
function renamedPrerequisiteLine(
  line: string,
  references: readonly PrerequisiteReference[],
  matcher: AliasMatcher,
): {
  readonly line: string;
  readonly ambiguous: readonly {
    readonly name: string;
    readonly occurrences: number;
    readonly references: number;
  }[];
} {
  const resolved = new Map<string, Set<string>>();
  const referenceCounts = new Map<string, number>();
  const masks: { start: number; end: number }[] = [];
  for (const reference of references)
    for (const match of matches(reference.text, matcher)) {
      const name = renamedTo(reference.definitions, match.alias);
      if (name === undefined) {
        // A clause naming other records masks its text; an unresolved
        // clause masks nothing, so its old name counts as unresolved.
        if (reference.definitions.length > 0)
          masks.push(...occurrences(line, reference.text));
        continue;
      }
      const names = resolved.get(match.alias) ?? new Set<string>();
      names.add(name);
      resolved.set(match.alias, names);
      referenceCounts.set(
        match.alias,
        (referenceCounts.get(match.alias) ?? 0) + 1,
      );
    }
  const inLine = matches(line, matcher).filter(
    (match) =>
      !masks.some((mask) => mask.start <= match.start && match.end <= mask.end),
  );
  const byAlias = new Map<string, Match[]>();
  for (const match of inLine)
    byAlias.set(match.alias, [...(byAlias.get(match.alias) ?? []), match]);
  const swaps: { match: Match; name: string }[] = [];
  const ambiguous: {
    name: string;
    occurrences: number;
    references: number;
  }[] = [];
  for (const [alias, found] of byAlias) {
    const names = [...(resolved.get(alias) ?? [])];
    const count = referenceCounts.get(alias) ?? 0;
    if (found.length > count || names.length > 1)
      ambiguous.push({
        name: matcher.aliases.get(alias) ?? alias,
        occurrences: found.length,
        references: count,
      });
    else
      for (const match of found)
        swaps.push({ match, name: casedLike(match.text, names[0]!) });
  }
  let result = line;
  for (const { match, name } of swaps.sort(
    (left, right) => right.match.start - left.match.start,
  ))
    result = result.slice(0, match.start) + name + result.slice(match.end);
  return { line: result, ambiguous };
}

/**
 * The displayed prerequisite lines of a content set that name renamed
 * records, by their current names, and the lines left unchanged because
 * the old name is ambiguous. Built once per content set; a set without
 * aliases (every stock pack) has none, without internalizing anything.
 */
export const prerequisiteDisplayLines = contentCache(
  "prerequisite-display-lines",
  (entities): PrerequisiteDisplayLines => {
    const matcher = aliasMatcher(entities);
    if (matcher === undefined) return NONE;
    const lines: Record<string, string> = {};
    const diagnostics: PrerequisiteRenameDiagnostic[] = [];
    for (const entity of entities) {
      const line = displayPrerequisites(entity);
      if (line === undefined) continue;
      matcher.pattern.lastIndex = 0;
      if (!matcher.pattern.test(line)) continue;
      const ir = internalizePrerequisite(entity.prerequisites, {
        owned: [],
        level: 1,
        abilities: {},
        definitions: entities,
        subject: entity,
      });
      const renamed = renamedPrerequisiteLine(
        line,
        ir === undefined ? [] : prerequisiteReferences(ir, entities),
        matcher,
      );
      if (renamed.line !== line) lines[entity.id] = renamed.line;
      for (const ambiguous of renamed.ambiguous)
        diagnostics.push({ entityId: entity.id, line, ...ambiguous });
    }
    return Object.keys(lines).length === 0 && diagnostics.length === 0
      ? NONE
      : { lines, diagnostics };
  },
);
