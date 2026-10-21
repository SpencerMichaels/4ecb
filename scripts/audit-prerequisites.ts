/**
 * Private prerequisite-coverage measurement. Internalizes every record's
 * machine-read `Prereqs` against an exact content pack and counts the clauses
 * the parser leaves unverified, grouped by distinct clause. It also reports
 * every split that cuts through a name or phrase: a known record name holding
 * a connector (comma, `and`, `or`) that no single parsed clause contains,
 * a legacy whole-clause phrase broken into fragments, and (for review) the
 * adjacent split fragments that are both unverified. It also fails on clauses
 * a split left meaningless: an unverified alternative that resolves once the
 * words it shares with the first or last alternative are distributed to it
 * ("Any martial or divine class"), a "<name> class" clause naming no class,
 * a part read as another type than the "trained in" / "proficiency with"
 * prefix carried to it, and an ignored alternative of an `or` (legacy drops
 * it, so the other side must hold). The pack and the output stay private.
 *
 *   tsx scripts/audit-prerequisites.ts [PACK.4ecp] [--limit=N] [--json=PATH]
 *     [--parser=PATH]   internalize with another prerequisites module
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  internalizePrerequisite as currentParser,
  type PrerequisiteContext,
  type PrerequisiteIr,
} from "@4ecb/rules-engine";

type Parser = typeof currentParser;

const decompress = promisify(gunzip);

function unverifiedLeaves(ir: PrerequisiteIr): string[] {
  if (ir.kind === "all" || ir.kind === "any")
    return ir.children.flatMap(unverifiedLeaves);
  return ir.kind === "unverified" ? [ir.text] : [];
}

function leaves(ir: PrerequisiteIr): string[] {
  return ir.kind === "all" || ir.kind === "any"
    ? ir.children.flatMap(leaves)
    : [ir.text];
}

function lower(text: string): string {
  return text
    .toLocaleLowerCase()
    .replaceAll("_", " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text the block grammar splits at. */
const CONNECTOR = /,|\s(?:and|or)\s/;

/**
 * Clauses legacy InternalizeBlock matches whole before LineParse splits it
 * (decoded literals; `pnpm audit:legacy-special-cases
 * --show=InternalizeBlock` and `--show=HarperTraining`).
 */
const LEGACY_WHOLE_CLAUSES = [
  "membership in the circle of smoke and whispers",
  "training in any two of diplomacy, insight, nature, or stealth",
];

function occurs(source: string, phrase: string): boolean {
  let start = source.indexOf(phrase);
  while (start >= 0) {
    const before = source[start - 1] ?? " ";
    const after = source[start + phrase.length] ?? " ";
    if (!/[\p{L}\p{N}'-]/u.test(before) && !/[\p{L}\p{N}'-]/u.test(after))
      return true;
    start = source.indexOf(phrase, start + 1);
  }
  return false;
}

/** Adjacent unverified leaves of one connective: a possible cut phrase. */
function unverifiedPairs(ir: PrerequisiteIr): string[] {
  if (ir.kind !== "all" && ir.kind !== "any") return [];
  const pairs: string[] = [];
  for (let index = 1; index < ir.children.length; index += 1) {
    const left = ir.children[index - 1];
    const right = ir.children[index];
    if (left?.kind === "unverified" && right?.kind === "unverified")
      pairs.push(`${left.text} | ${right.text}`);
  }
  return [...pairs, ...ir.children.flatMap(unverifiedPairs)];
}

/** Words an alternative may share with another: none when bracketed. */
function shareableWords(text: string): string[] {
  const words = text.replace(/[.]$/, "").trim().split(/\s+/);
  return words.some((word) => /[()[\]]/.test(word)) ? [] : words;
}

const CLASS_TYPES = new Set(["class", "hybrid class", "countsasclass"]);

interface Lookup {
  readonly byName: ReadonlyMap<string, readonly ContentEntity[]>;
  readonly byId: ReadonlyMap<string, ContentEntity>;
}

function namedTypes(lookup: Lookup, name: string): Set<string> {
  return new Set(
    (lookup.byName.get(lower(name)) ?? []).map((entity) => lower(entity.type)),
  );
}

/** A leaf that names something checkable (not a misread). */
function leafResolves(ir: PrerequisiteIr, lookup: Lookup): boolean {
  if (ir.kind === "unverified") return false;
  if (ir.kind === "class")
    return [...namedTypes(lookup, ir.value)].some((type) =>
      CLASS_TYPES.has(type),
    );
  if (ir.kind === "training")
    return namedTypes(lookup, ir.value).has("skill training");
  return true;
}

function treeResolves(ir: PrerequisiteIr, lookup: Lookup): boolean {
  return ir.kind === "all" || ir.kind === "any"
    ? ir.children.every((child) => treeResolves(child, lookup))
    : leafResolves(ir, lookup);
}

/**
 * Unverified alternatives of an `or` that resolve once the last
 * alternative's trailing words or the first one's leading words are
 * distributed to them: a shared-word ellipsis the parser split apart.
 */
function distributableFragments(
  ir: PrerequisiteIr,
  internalize: (text: string) => PrerequisiteIr | undefined,
  lookup: Lookup,
): string[] {
  if (ir.kind !== "all" && ir.kind !== "any") return [];
  const found: string[] = [];
  if (ir.kind === "any" && ir.children.length > 1) {
    const first = shareableWords(ir.children[0]?.text ?? "");
    const last = shareableWords(ir.children.at(-1)?.text ?? "");
    ir.children.forEach((child, index) => {
      if (child.kind !== "unverified") return;
      const own = child.text.replace(/[.]$/, "").trim();
      const tails =
        index < ir.children.length - 1
          ? last.slice(1).map((_, offset) => last.slice(offset + 1))
          : [];
      const heads =
        index > 0
          ? first.slice(1).map((_, offset) => first.slice(0, offset + 1))
          : [];
      const candidates = [
        ...tails.map((tail) => [own, ...tail]),
        ...heads.map((head) => [...head, own]),
      ].map((words) => words.join(" "));
      const resolved = candidates.find((candidate) => {
        const read = internalize(candidate);
        return read !== undefined && treeResolves(read, lookup);
      });
      if (resolved !== undefined) found.push(`${ir.text} -> ${resolved}`);
    });
  }
  return [
    ...found,
    ...ir.children.flatMap((child) =>
      distributableFragments(child, internalize, lookup),
    ),
  ];
}

/** "<name> class" clauses that no class, hybrid class or CountsAsClass names. */
function unknownClasses(ir: PrerequisiteIr, lookup: Lookup): string[] {
  if (ir.kind === "all" || ir.kind === "any")
    return ir.children.flatMap((child) => unknownClasses(child, lookup));
  return ir.kind === "class" && !leafResolves(ir, lookup) ? [ir.text] : [];
}

const CARRIED_PREFIXES: readonly (readonly [RegExp, string])[] = [
  [
    /^(?:you must (?:be trained|have training) in|trained in|training in)\s/i,
    "skill training",
  ],
  [/^(?:proficiency with|proficient with|can use the)\s/i, "proficiency"],
];

/** Every legacy prefix (`InternalizeBlock` Prefixes), for where one ends. */
const ANY_PREFIX =
  /^(?:training in|trained in|you must be trained in|you must have training in|must worship|you must worship|worship|follower of|affiliated with|proficiency with|proficient with|can use the|fluent in|be a|must have the|have the|you must have the|either)\s/i;

/** Whether a carried type could read this part (a record of it exists). */
function carriable(text: string, type: string, lookup: Lookup): boolean {
  const name = lower(text).replace(/[.]$/, "");
  if (type === "skill training")
    return namedTypes(lookup, name).has("skill training");
  const base = name
    .replace(/^(?:the|any|a|an)\s+/, "")
    .replace(/\s+(?:armor|shields?)$/, "");
  return (
    namedTypes(lookup, base).has("weapon group") ||
    [...lookup.byName.keys()].some(
      (key) =>
        key.endsWith(`proficiency (${base})`) &&
        namedTypes(lookup, key).has("proficiency"),
    )
  );
}

/**
 * Parts after a "trained in" / "proficiency with" part, with no prefix of
 * their own, that the parser read as a record of another type although one
 * of the carried type exists: legacy carries the prefix's type to them
 * (CreateElementPrereq).
 */
function uncarriedTypes(ir: PrerequisiteIr, lookup: Lookup): string[] {
  if (ir.kind !== "all" && ir.kind !== "any") return [];
  const found: string[] = [];
  let carried: string | undefined;
  for (const child of ir.children) {
    const prefix = CARRIED_PREFIXES.find(([pattern]) =>
      pattern.test(child.text),
    );
    if (prefix !== undefined) carried = prefix[1];
    else if (ANY_PREFIX.test(child.text)) carried = undefined;
    else if (
      carried !== undefined &&
      child.kind === "element" &&
      !child.negated &&
      child.definitionIds.some(
        (id) => lower(lookup.byId.get(id)?.type ?? "") !== carried,
      ) &&
      carriable(child.text, carried, lookup)
    )
      found.push(`${child.text} (${carried}) in ${ir.text}`);
  }
  return [
    ...found,
    ...ir.children.flatMap((child) => uncarriedTypes(child, lookup)),
  ];
}

/** `or` nodes with an ignored alternative (legacy Ignore drops out). */
function ignoredAlternatives(ir: PrerequisiteIr): string[] {
  if (ir.kind !== "all" && ir.kind !== "any") return [];
  const own =
    ir.kind === "any" &&
    ir.children.some((child) => child.kind === "ignored") &&
    ir.children.some((child) => child.kind !== "ignored")
      ? [ir.text]
      : [];
  return [...own, ...ir.children.flatMap(ignoredAlternatives)];
}

interface Finding {
  uses: number;
  examples: string[];
}

function record(
  findings: Map<string, Finding>,
  key: string,
  example: string,
): void {
  const entry = findings.get(key) ?? { uses: 0, examples: [] };
  entry.uses += 1;
  if (entry.examples.length < 3) entry.examples.push(example);
  findings.set(key, entry);
}

function report(title: string, findings: Map<string, Finding>, limit: number) {
  const sorted = [...findings].sort(
    (left, right) =>
      right[1].uses - left[1].uses || left[0].localeCompare(right[0]),
  );
  const uses = sorted.reduce((sum, [, entry]) => sum + entry.uses, 0);
  console.log(`${title}: ${uses} uses; distinct: ${sorted.length}`);
  for (const [key, entry] of sorted.slice(0, limit))
    console.log(
      `${String(entry.uses).padStart(4)}  ${key}  [${entry.examples.join("; ")}]`,
    );
  return {
    uses,
    distinct: sorted.length,
    findings: Object.fromEntries(sorted),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const packPath = args.find((arg) => !arg.startsWith("--"));
  const limit = Number(
    args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 60,
  );
  const jsonPath = args.find((arg) => arg.startsWith("--json="))?.slice(7);
  const parserPath = args.find((arg) => arg.startsWith("--parser="))?.slice(9);
  const internalizePrerequisite: Parser =
    parserPath === undefined
      ? currentParser
      : (
          (await import(resolve(parserPath))) as {
            internalizePrerequisite: Parser;
          }
        ).internalizePrerequisite;
  const encoded = await readFile(
    resolve(packPath ?? "tmp/content/full-local.4ecp"),
  );
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const definitions = pack.entities;
  const clauses = new Map<string, { uses: number; examples: string[] }>();
  const connectorNames = [
    ...new Set(
      definitions
        .map((definition) => lower(definition.name))
        .filter((name) => CONNECTOR.test(name)),
    ),
  ];
  const lookup: Lookup = {
    byName: definitions.reduce((map, definition) => {
      const key = lower(definition.name);
      map.set(key, [...(map.get(key) ?? []), definition]);
      return map;
    }, new Map<string, ContentEntity[]>()),
    byId: new Map(definitions.map((definition) => [definition.id, definition])),
  };
  const fragments = new Map<string, Finding>();
  const classMisreads = new Map<string, Finding>();
  const typeMisreads = new Map<string, Finding>();
  const droppedIgnores = new Map<string, Finding>();
  const cutNames = new Map<string, Finding>();
  const cutPhrases = new Map<string, Finding>();
  const suspectPairs = new Map<string, Finding>();
  let records = 0;
  let unverifiedRecords = 0;
  for (const subject of definitions) {
    if (subject.prerequisites === undefined) continue;
    const context: PrerequisiteContext = {
      owned: [],
      level: 1,
      abilities: {},
      definitions,
      subject,
    };
    const ir = internalizePrerequisite(subject.prerequisites, context);
    if (ir === undefined) continue;
    for (const fragment of distributableFragments(
      ir,
      (text) => internalizePrerequisite(text, context),
      lookup,
    ))
      record(fragments, lower(fragment), `${subject.id} "${subject.name}"`);
    for (const clause of unknownClasses(ir, lookup))
      record(classMisreads, lower(clause), `${subject.id} "${subject.name}"`);
    for (const clause of uncarriedTypes(ir, lookup))
      record(typeMisreads, lower(clause), `${subject.id} "${subject.name}"`);
    for (const clause of ignoredAlternatives(ir))
      record(droppedIgnores, lower(clause), `${subject.id} "${subject.name}"`);
    records += 1;
    const label = `${subject.id} ${subject.type} "${subject.name}"`;
    const source = lower(subject.prerequisites);
    const clauseTexts = leaves(ir).map(lower);
    // A split cut a name when no single clause holds the whole name.
    for (const name of connectorNames)
      if (
        occurs(source, name) &&
        !clauseTexts.some((clause) => occurs(clause, name))
      )
        record(cutNames, name, label);
    // A split cut a legacy whole clause when a clause is a piece of it.
    for (const phrase of LEGACY_WHOLE_CLAUSES)
      if (
        occurs(source, phrase) &&
        clauseTexts.some(
          (clause) =>
            clause.length < phrase.length &&
            phrase.includes(clause.replace(/[.]$/, "")),
        )
      )
        record(cutPhrases, phrase, label);
    for (const pair of unverifiedPairs(ir))
      record(suspectPairs, lower(pair), label);
    const unverified = unverifiedLeaves(ir);
    if (unverified.length > 0) unverifiedRecords += 1;
    for (const leaf of unverified) {
      const key = leaf.trim().replace(/[.]$/, "").toLocaleLowerCase();
      const entry = clauses.get(key) ?? { uses: 0, examples: [] };
      entry.uses += 1;
      if (entry.examples.length < 3)
        entry.examples.push(`${subject.id} ${subject.type} "${subject.name}"`);
      clauses.set(key, entry);
    }
  }
  const sorted = [...clauses].sort(
    (left, right) =>
      right[1].uses - left[1].uses || left[0].localeCompare(right[0]),
  );
  const uses = sorted.reduce((sum, [, entry]) => sum + entry.uses, 0);
  console.log(
    `${records} records with prerequisites; ${unverifiedRecords} with unverified clauses`,
  );
  console.log(`unverified clause uses: ${uses}; distinct: ${sorted.length}`);
  for (const [clause, entry] of sorted.slice(0, limit))
    console.log(
      `${String(entry.uses).padStart(4)}  ${clause}  [${entry.examples.join("; ")}]`,
    );
  console.log("");
  const names = report(
    "split inside a known name (should be 0)",
    cutNames,
    limit,
  );
  const phrases = report(
    "split inside a legacy whole clause (should be 0)",
    cutPhrases,
    limit,
  );
  const distributable = report(
    "alternative missing its shared words (should be 0)",
    fragments,
    limit,
  );
  const classes = report(
    "class clause naming no class (should be 0)",
    classMisreads,
    limit,
  );
  const types = report(
    "part read as another type than its carried prefix (should be 0)",
    typeMisreads,
    limit,
  );
  const ignores = report(
    "ignored alternative kept in an or (should be 0)",
    droppedIgnores,
    limit,
  );
  const pairs = report(
    "adjacent unverified split fragments (review)",
    suspectPairs,
    limit,
  );
  if (jsonPath !== undefined)
    await writeFile(
      jsonPath,
      `${JSON.stringify(
        {
          uses,
          distinct: sorted.length,
          clauses: Object.fromEntries(sorted),
          splitNames: names,
          splitPhrases: phrases,
          sharedWordFragments: distributable,
          classMisreads: classes,
          carriedTypeMisreads: types,
          ignoredAlternatives: ignores,
          unverifiedPairs: pairs,
        },
        null,
        2,
      )}\n`,
    );
  if (
    [names, phrases, distributable, classes, types, ignores].some(
      (finding) => finding.uses > 0,
    )
  )
    process.exitCode = 1;
}

await main();
