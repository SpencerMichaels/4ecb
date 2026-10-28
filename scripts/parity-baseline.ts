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
 *   pnpm parity:baseline --jobs 4        # worker threads (default: CPUs,
 *                                        # capped at one per 1.5 GB free)
 *
 * Characters import as the app imports them by default, matching saved IDs
 * the pack lacks to same-named records (D096). They are evaluated on a pool
 * of worker threads, each loading the pack once; the output (file order,
 * latest.json, the console diff, the exit code) is the same for any job
 * count. A full run of 43 characters takes about 1.5 minutes with 8 jobs
 * (`--jobs 1` evaluates in this process: about 5 minutes, 1-20 s per
 * character).
 *
 * Exits 1 when a mismatch key appears that the baseline did not have, or a
 * baseline character is missing from a full run.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";

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

interface WorkerSetup {
  readonly packPath: string;
  readonly matchMissingByName: boolean;
}

type WorkerReply =
  | { readonly kind: "ready" }
  | {
      readonly kind: "done";
      readonly index: number;
      readonly character: CharacterBaseline;
    }
  | {
      readonly kind: "failed";
      readonly index: number;
      readonly message: string;
      readonly stack?: string;
    };

async function evaluateFile(
  file: string,
  entities: Awaited<ReturnType<typeof loadPackEntities>>,
  matchMissingByName: boolean,
): Promise<CharacterBaseline> {
  const xml = await readFile(resolve(file), "utf8");
  return summarize(
    file,
    compareCharacterParity(xml, entities, { matchMissingByName }),
  );
}

/** A pool worker: loads the pack once, then evaluates files on request. */
async function workerMain(): Promise<void> {
  const port = parentPort!;
  const { packPath, matchMissingByName } = workerData as WorkerSetup;
  const entities = await loadPackEntities(packPath);
  port.on("message", (request: { index: number; file: string }) => {
    evaluateFile(request.file, entities, matchMissingByName).then(
      (character) =>
        port.postMessage({
          kind: "done",
          index: request.index,
          character,
        } satisfies WorkerReply),
      (error: unknown) =>
        port.postMessage({
          kind: "failed",
          index: request.index,
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof Error && error.stack !== undefined
            ? { stack: error.stack }
            : {}),
        } satisfies WorkerReply),
    );
  });
  port.postMessage({ kind: "ready" } satisfies WorkerReply);
}

/** About what one worker holds: the decoded pack plus evaluation caches. */
const WORKER_MEMORY_BYTES = 1.5 * 1024 ** 3;

function defaultJobs(files: number): number {
  const memoryJobs = Math.floor(
    process.availableMemory() / WORKER_MEMORY_BYTES,
  );
  return Math.max(1, Math.min(availableParallelism(), files, memoryJobs));
}

/**
 * Evaluates the files on `jobs` worker threads, handing each worker the next
 * file as it finishes one, largest file first (a rough cost estimate, so the
 * slowest characters don't start last), and returns the results in file
 * order. A failed character fails the run, as the sequential run would at
 * that file.
 */
async function evaluateInWorkers(
  files: readonly string[],
  setup: WorkerSetup,
  jobs: number,
): Promise<CharacterBaseline[]> {
  const results: (CharacterBaseline | undefined)[] = files.map(() => undefined);
  const failures = new Map<number, Error>();
  const sizes = await Promise.all(
    files.map(async (file) => (await stat(resolve(file))).size),
  );
  const queue = files
    .map((_, index) => index)
    .sort((a, b) => sizes[b]! - sizes[a]! || a - b);
  let next = 0;
  const run = (worker: Worker) =>
    new Promise<void>((resolveWorker, rejectWorker) => {
      const send = () => {
        if (next >= files.length) {
          resolveWorker();
          return;
        }
        const index = queue[next]!;
        next += 1;
        worker.postMessage({ index, file: files[index] });
      };
      worker.on("message", (reply: WorkerReply) => {
        if (reply.kind === "done") results[reply.index] = reply.character;
        else if (reply.kind === "failed") {
          const error = new Error(`${files[reply.index]}: ${reply.message}`);
          if (reply.stack !== undefined) error.stack = reply.stack;
          failures.set(reply.index, error);
        }
        send();
      });
      worker.on("error", rejectWorker);
      worker.on("exit", (code) => {
        if (code !== 0) rejectWorker(new Error(`worker exited with ${code}`));
      });
    });
  const workers = Array.from(
    { length: Math.min(jobs, files.length) },
    () => new Worker(new URL(import.meta.url), { workerData: setup }),
  );
  try {
    await Promise.all(workers.map(run));
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  const firstFailure = [...failures].sort(([a], [b]) => a - b)[0];
  if (firstFailure !== undefined) throw firstFailure[1];
  return results.map((character, index) => {
    if (character === undefined)
      throw new Error(`No result for ${files[index]}`);
    return character;
  });
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
  const jobsIndex = args.indexOf("--jobs");
  const jobsArgument = jobsIndex >= 0 ? Number(args[jobsIndex + 1]) : undefined;
  if (
    jobsArgument !== undefined &&
    (!Number.isInteger(jobsArgument) || jobsArgument < 1)
  )
    throw new Error("--jobs needs a positive whole number");
  const explicit = args.filter(
    (arg, index) =>
      !arg.startsWith("--") &&
      (packIndex < 0 || index !== packIndex + 1) &&
      (jobsIndex < 0 || index !== jobsIndex + 1),
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
  const jobs = jobsArgument ?? defaultJobs(files.length);
  const characters: CharacterBaseline[] = [];
  if (jobs === 1) {
    const entities = await loadPackEntities(packPath);
    for (const file of files)
      characters.push(await evaluateFile(file, entities, matchMissingByName));
  } else {
    characters.push(
      ...(await evaluateInWorkers(
        files,
        { packPath, matchMissingByName },
        jobs,
      )),
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

if (isMainThread) await main();
else await workerMain();
