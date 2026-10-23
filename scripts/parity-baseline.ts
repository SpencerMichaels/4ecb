/**
 * Standing legacy-parity check (private corpus). Evaluates every legacy
 * comparison character against one pack, writes per-character match counts
 * (cached stats, power attack/damage, power usage and action type) and
 * mismatch keys to tmp/parity/latest.json, and diffs them against the
 * accepted baseline tmp/parity/baseline.json. Both files are ignored by git.
 *
 *   pnpm parity:baseline                 # compare with the baseline
 *   pnpm parity:baseline --accept        # ...then make this run the baseline
 *   pnpm parity:baseline --pack P.4ecp   # another pack
 *   pnpm parity:baseline FILE.dnd4e ...  # only these characters (no accept)
 *   pnpm parity:baseline --no-name-matching  # keep saved IDs the pack lacks
 *
 * Characters import as the app imports them by default, matching saved IDs
 * the pack lacks to same-named records (D096).
 *
 * Exits 1 when a mismatch key appears that the baseline did not have, or a
 * baseline character is missing from a full run.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { compareCharacterParity, loadPackEntities } from "./legacy-parity";

const PLAYER_CHARACTERS = "sample-chars";
const SAMPLE_HEROES = "CharacterBuilder/SampleChars/SampleHeroes";
const OUTPUT_DIR = "tmp/parity";

interface CharacterBaseline {
  readonly file: string;
  readonly character: string;
  readonly complete: boolean;
  readonly legal: boolean;
  readonly errors: number;
  readonly warnings: number;
  readonly stats: { matching: number; comparable: number };
  readonly powers: { matching: number; comparable: number };
  /** Cached Power Usage / Action Type against the sheet card (absent in older baselines). */
  readonly usage?: { matching: number; comparable: number };
  readonly action?: { matching: number; comparable: number };
  /**
   * `stat <name>: <expected> -> <actual>`,
   * `power <name> [<equipment>] <field>: ...`, `usage <name>: ...` and
   * `action <name>: ...`.
   */
  readonly mismatches: readonly string[];
}

interface Baseline {
  readonly generatedAt: string;
  readonly pack: { path: string; sha256: string };
  readonly totals: {
    stats: { matching: number; comparable: number };
    powers: { matching: number; comparable: number };
    usage?: { matching: number; comparable: number };
    action?: { matching: number; comparable: number };
  };
  readonly characters: readonly CharacterBaseline[];
}

async function dnd4eFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".dnd4e"))
    .map((entry) => relative(".", join(entry.parentPath, entry.name)))
    .sort();
}

const show = (value: unknown) =>
  value === undefined || value === null ? "none" : String(value);

function summarize(
  file: string,
  report: ReturnType<typeof compareCharacterParity>,
): CharacterBaseline {
  return {
    file,
    character: report.character ?? "",
    complete: report.evaluation.complete,
    legal: report.evaluation.legal,
    errors: report.evaluation.diagnosticCounts.error ?? 0,
    warnings: report.evaluation.diagnosticCounts.warning ?? 0,
    stats: {
      matching: report.cachedNumericParity.matching,
      comparable: report.cachedNumericParity.comparable,
    },
    powers: {
      matching: report.cachedPowerParity.matchingFields,
      comparable: report.cachedPowerParity.comparableFields,
    },
    usage: {
      matching: report.cachedPowerTypeParity.usage.matching,
      comparable: report.cachedPowerTypeParity.usage.comparable,
    },
    action: {
      matching: report.cachedPowerTypeParity.action.matching,
      comparable: report.cachedPowerTypeParity.action.comparable,
    },
    mismatches: [
      ...report.cachedNumericParity.mismatches.map(
        (stat) =>
          `stat ${stat.name}: ${show(stat.expected)} -> ${show(stat.actual)}`,
      ),
      ...report.cachedPowerParity.mismatches.map(
        (power) =>
          `power ${power.power} [${power.equipment}] ${power.field}: ${show(power.expected)} -> ${show(power.actual)}`,
      ),
      ...[
        ...report.cachedPowerTypeParity.usage.mismatches,
        ...report.cachedPowerTypeParity.action.mismatches,
      ].map(
        (power) =>
          `${power.field} ${power.power}: ${power.expected} -> ${show(power.actual)}`,
      ),
    ],
  };
}

const ratio = (part: { matching: number; comparable: number }) =>
  `${part.matching}/${part.comparable}`;

function delta(
  now: { matching: number; comparable: number } | undefined,
  before: { matching: number; comparable: number } | undefined,
) {
  if (now === undefined) return "n/a";
  if (before === undefined) return ratio(now);
  const change = now.matching - before.matching;
  const comparable =
    now.comparable === before.comparable
      ? ""
      : ` (comparable ${before.comparable} -> ${now.comparable})`;
  return `${ratio(now)}${change === 0 ? "" : ` (${change > 0 ? "+" : ""}${change})`}${comparable}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const accept = args.includes("--accept");
  const matchMissingByName = !args.includes("--no-name-matching");
  const packIndex = args.indexOf("--pack");
  const packPath =
    packIndex >= 0
      ? (args[packIndex + 1] ?? "")
      : "tmp/content/full-local.4ecp";
  const explicit = args.filter(
    (arg, index) =>
      !arg.startsWith("--") && (packIndex < 0 || index !== packIndex + 1),
  );
  if (accept && explicit.length > 0)
    throw new Error("--accept needs a full run (no character arguments)");
  const files =
    explicit.length > 0
      ? explicit
      : [
          ...(await dnd4eFiles(PLAYER_CHARACTERS)),
          ...(await dnd4eFiles(SAMPLE_HEROES)),
        ];
  if (files.length === 0) throw new Error("No legacy characters found");

  const packBytes = await readFile(resolve(packPath));
  const entities = await loadPackEntities(packPath);
  const characters: CharacterBaseline[] = [];
  for (const file of files) {
    const xml = await readFile(resolve(file), "utf8");
    characters.push(
      summarize(
        file,
        compareCharacterParity(xml, entities, { matchMissingByName }),
      ),
    );
  }
  const sum = (
    pick: (
      character: CharacterBaseline,
    ) => { matching: number; comparable: number } | undefined,
  ) =>
    characters.reduce(
      (total, character) => ({
        matching: total.matching + (pick(character)?.matching ?? 0),
        comparable: total.comparable + (pick(character)?.comparable ?? 0),
      }),
      { matching: 0, comparable: 0 },
    );
  const latest: Baseline = {
    generatedAt: new Date().toISOString(),
    pack: {
      path: packPath,
      sha256: createHash("sha256").update(packBytes).digest("hex"),
    },
    totals: {
      stats: sum((character) => character.stats),
      powers: sum((character) => character.powers),
      usage: sum((character) => character.usage),
      action: sum((character) => character.action),
    },
    characters,
  };
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    join(OUTPUT_DIR, "latest.json"),
    `${JSON.stringify(latest, null, 2)}\n`,
  );

  const baselinePath = join(OUTPUT_DIR, "baseline.json");
  const baseline: Baseline | undefined = existsSync(baselinePath)
    ? (JSON.parse(await readFile(baselinePath, "utf8")) as Baseline)
    : undefined;
  const before = new Map(
    baseline?.characters.map((character) => [character.file, character]),
  );
  if (baseline !== undefined && baseline.pack.sha256 !== latest.pack.sha256)
    console.log(
      `Note: the baseline used another pack (${baseline.pack.path}, ${baseline.pack.sha256.slice(0, 12)}).`,
    );

  let regressions = 0;
  for (const character of characters) {
    const previous = before.get(character.file);
    const known = new Set(previous?.mismatches ?? []);
    const current = new Set(character.mismatches);
    const added = character.mismatches.filter((key) => !known.has(key));
    const fixed = [...known].filter((key) => !current.has(key));
    if (previous !== undefined) regressions += added.length;
    const state = character.complete ? "" : " incomplete";
    console.log(
      `${character.file}: stats ${delta(character.stats, previous?.stats)}, powers ${delta(character.powers, previous?.powers)}, usage ${delta(character.usage, previous?.usage)}, action ${delta(character.action, previous?.action)}${state}${character.errors > 0 ? `, ${character.errors} error(s)` : ""}`,
    );
    if (previous === undefined) {
      if (baseline !== undefined) console.log("  (not in the baseline)");
      continue;
    }
    for (const key of added) console.log(`  + ${key}`);
    for (const key of fixed) console.log(`  - ${key}`);
  }
  if (explicit.length === 0 && baseline !== undefined) {
    const now = new Set(characters.map((character) => character.file));
    for (const character of baseline.characters)
      if (!now.has(character.file)) {
        regressions += 1;
        console.log(`${character.file}: missing from this run`);
      }
  }
  console.log(
    `Total: stats ${delta(latest.totals.stats, baseline?.totals.stats)}, powers ${delta(latest.totals.powers, baseline?.totals.powers)}, usage ${delta(latest.totals.usage, baseline?.totals.usage)}, action ${delta(latest.totals.action, baseline?.totals.action)}`,
  );
  console.log(`Wrote ${join(OUTPUT_DIR, "latest.json")}`);
  if (accept) {
    await writeFile(baselinePath, `${JSON.stringify(latest, null, 2)}\n`);
    console.log(`Accepted as ${baselinePath}`);
  } else if (baseline === undefined) {
    console.log("No baseline yet: run with --accept to record one.");
  }
  if (regressions > 0 && !accept) {
    console.log(`${regressions} new mismatch(es) against the baseline.`);
    process.exitCode = 1;
  }
}

await main();
