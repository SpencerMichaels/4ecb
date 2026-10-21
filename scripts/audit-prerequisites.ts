/**
 * Private prerequisite-coverage measurement. Internalizes every record's
 * machine-read `Prereqs` against an exact content pack and counts the clauses
 * the parser leaves unverified, grouped by distinct clause. It also reports
 * every split that cuts through a name or phrase: a known record name holding
 * a connector (comma, `and`, `or`) that no single parsed clause contains,
 * a legacy whole-clause phrase broken into fragments, and (for review) the
 * adjacent split fragments that are both unverified. The pack and the output
 * stay private.
 *
 *   tsx scripts/audit-prerequisites.ts [PACK.4ecp] [--limit=N] [--json=PATH]
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
import {
  internalizePrerequisite,
  type PrerequisiteIr,
} from "@4ecb/rules-engine";

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
  const cutNames = new Map<string, Finding>();
  const cutPhrases = new Map<string, Finding>();
  const suspectPairs = new Map<string, Finding>();
  let records = 0;
  let unverifiedRecords = 0;
  for (const subject of definitions) {
    if (subject.prerequisites === undefined) continue;
    const ir = internalizePrerequisite(subject.prerequisites, {
      owned: [],
      level: 1,
      abilities: {},
      definitions,
      subject,
    });
    if (ir === undefined) continue;
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
          unverifiedPairs: pairs,
        },
        null,
        2,
      )}\n`,
    );
  if (names.uses > 0 || phrases.uses > 0) process.exitCode = 1;
}

await main();
