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
 *   pnpm parity:baseline --no-profiles   # every save on --pack (see below)
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
 * Exits 1 when a mismatch key appears that the baseline did not have on a
 * `sample-chars/` save (current-builder saves, the canonical baseline), or a
 * baseline character is missing from a full run. SampleHeroes were saved by
 * older builders, so their new keys are reported as informational only.
 *
 * Content profiles. Some players' legacy builders ran stock WotC data
 * (no CBLoader parts), so their saves differ from our full pack in content,
 * not engine. tmp/parity/content-profiles.json (ignored) maps such saves to
 * another pack:
 *
 *   { "packs": { "stock": "tmp/content/stock-local.4ecp" },
 *     "characters": { "sample-chars/X.dnd4e": "stock",
 *                     "sample-chars/Y.dnd4e": "full" } }
 *
 * "full" is the run's pack (--pack); "stock" defaults to the pack that
 * `scripts/build-private-content.sh --stock` builds. A mapped save's counts,
 * keys and regressions come from its profile's pack; it is also evaluated on
 * the run's pack, shown as an informational "full pack" line (stored as
 * `defaultPack` in latest.json) that never fails the run. A character whose
 * profile differs from its baseline entry is not compared until re-accepted.
 * `--no-profiles` evaluates every save on the run's pack.
 *
 * With CBLoader/Cache present, the run also suggests (never applies) profiles
 * for unmapped `sample-chars/` saves: a save whose `legality="houserule"`
 * placeholders are CBLoader-only IDs (absent from combined.dnd40.original.xml,
 * present in combined.dnd40.merged.xml) and which saved no other CBLoader-only
 * ID was probably made on stock data; placeholders beside real CBLoader IDs
 * mean partial parts (keep on "full"). Mapping a save, to either profile,
 * silences its suggestion.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";

import {
  CONTENT_PROFILES,
  DEFAULT_PROFILE,
  PLAYER_CHARACTERS,
  SAMPLE_HEROES,
  compareCharacterParity,
  dnd4eFiles,
  loadPackEntities,
  readContentProfiles,
} from "./legacy-parity";

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
  /** Cached weapon-row order against the evaluated main hand (absent in older baselines). */
  readonly mainHand?: { matching: number; comparable: number };
  /**
   * `stat <name>: <expected> -> <actual>`,
   * `power <name> [<equipment>] <field>: ...`, `usage <name>: ...`,
   * `action <name>: ...` and `main hand <name>: <first cached row> -> <evaluated main hand>`.
   */
  readonly mismatches: readonly string[];
  /** The content profile the counts and keys come from; absent: the run's pack. */
  readonly profile?: string;
  /** For a profiled save, the informational evaluation on the run's pack. */
  readonly defaultPack?: PackEvaluation;
}

type PackEvaluation = Omit<
  CharacterBaseline,
  "file" | "character" | "profile" | "defaultPack"
>;

interface Baseline {
  readonly generatedAt: string;
  readonly pack: { path: string; sha256: string };
  /** The packs of the content profiles this run used, by profile name. */
  readonly profiles?: Readonly<
    Record<string, { path: string; sha256: string }>
  >;
  readonly totals: {
    stats: { matching: number; comparable: number };
    powers: { matching: number; comparable: number };
    usage?: { matching: number; comparable: number };
    action?: { matching: number; comparable: number };
    mainHand?: { matching: number; comparable: number };
  };
  readonly characters: readonly CharacterBaseline[];
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
    mainHand: {
      matching: report.cachedPowerParity.mainHand.matching,
      comparable: report.cachedPowerParity.mainHand.comparable,
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
      ...report.cachedPowerParity.mainHand.mismatches.map(
        (power) =>
          `main hand ${power.power}: ${power.expected} -> ${power.actual}`,
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

/**
 * Evaluates each (file, pack) task, one worker pool per pack in turn (so a
 * worker holds one pack), and returns the results in task order.
 */
async function evaluateTasks(
  tasks: readonly { file: string; pack: string }[],
  matchMissingByName: boolean,
  jobsArgument: number | undefined,
): Promise<CharacterBaseline[]> {
  const results: (CharacterBaseline | undefined)[] = tasks.map(() => undefined);
  const byPack = new Map<string, number[]>();
  tasks.forEach((task, index) =>
    byPack.set(task.pack, [...(byPack.get(task.pack) ?? []), index]),
  );
  for (const [packPath, indexes] of byPack) {
    const files = indexes.map((index) => tasks[index]!.file);
    const jobs = jobsArgument ?? defaultJobs(files.length);
    let evaluated: CharacterBaseline[];
    if (jobs === 1) {
      const entities = await loadPackEntities(packPath);
      evaluated = [];
      for (const file of files)
        evaluated.push(await evaluateFile(file, entities, matchMissingByName));
    } else {
      evaluated = await evaluateInWorkers(
        files,
        { packPath, matchMissingByName },
        jobs,
      );
    }
    indexes.forEach((index, position) => {
      results[index] = evaluated[position];
    });
  }
  return results.map((result, index) => {
    if (result === undefined)
      throw new Error(`No result for ${tasks[index]!.file}`);
    return result;
  });
}

function packEvaluation(character: CharacterBaseline): PackEvaluation {
  const evaluation: Record<string, unknown> = { ...character };
  for (const key of ["file", "character", "profile", "defaultPack"])
    delete evaluation[key];
  return evaluation as unknown as PackEvaluation;
}

const sha256 = async (path: string) =>
  createHash("sha256")
    .update(await readFile(resolve(path)))
    .digest("hex");

const LEGACY_BASE_XML = "CBLoader/Cache/combined.dnd40.original.xml";
const LEGACY_MERGED_XML = "CBLoader/Cache/combined.dnd40.merged.xml";

interface ContentGeneration {
  /** CBLoader-only IDs saved as `legality="houserule"` placeholders. */
  readonly placeholders: readonly string[];
  /** CBLoader-only IDs saved as real (non-houserule) records. */
  readonly partRecords: number;
}

/**
 * Which CBLoader-only records (in the merged cache, not the stock data) each
 * save references, and how. Undefined when the CBLoader cache is absent.
 */
async function contentGenerations(
  files: readonly string[],
): Promise<Map<string, ContentGeneration> | undefined> {
  if (!existsSync(LEGACY_BASE_XML) || !existsSync(LEGACY_MERGED_XML))
    return undefined;
  const ids = async (path: string) =>
    new Set(
      Array.from(
        (await readFile(path, "utf8")).matchAll(/internal-id="([^"]+)"/g),
        (match) => match[1]!,
      ),
    );
  const stock = await ids(LEGACY_BASE_XML);
  const merged = await ids(LEGACY_MERGED_XML);
  const generations = new Map<string, ContentGeneration>();
  for (const file of files) {
    const xml = await readFile(resolve(file), "utf8");
    const placeholders = new Set<string>();
    const partRecords = new Set<string>();
    for (const [element] of xml.matchAll(/<RulesElement\b[^>]*>/g)) {
      const id = /internal-id="([^"]+)"/.exec(element)?.[1];
      if (id === undefined || stock.has(id) || !merged.has(id)) continue;
      (/legality="houserule"/.test(element) ? placeholders : partRecords).add(
        id,
      );
    }
    generations.set(file, {
      placeholders: [...placeholders].sort(),
      partRecords: partRecords.size,
    });
  }
  return generations;
}

/** Prints content-profile suggestions for canonical saves; never applies them. */
function printProfileSuggestions(
  generations: ReadonlyMap<string, ContentGeneration>,
  mapped: ReadonlyMap<string, string>,
): void {
  const lines: string[] = [];
  const noPartIds: string[] = [];
  for (const [file, generation] of generations) {
    if (file.startsWith(SAMPLE_HEROES)) continue;
    const profile = mapped.get(file);
    const placeholders = `${generation.placeholders.slice(0, 3).join(", ")}${generation.placeholders.length > 3 ? ", ..." : ""}`;
    if (profile !== undefined) {
      if (profile !== DEFAULT_PROFILE && generation.partRecords > 0)
        lines.push(
          `  ${file}: mapped to "${profile}" but saved ${generation.partRecords} CBLoader-only record(s); check the mapping`,
        );
      continue;
    }
    if (generation.placeholders.length > 0 && generation.partRecords === 0)
      lines.push(
        `  ${file}: "stock"? CBLoader-only IDs saved only as houserule placeholders (${placeholders})`,
      );
    else if (generation.placeholders.length > 0)
      lines.push(
        `  ${file}: partial CBLoader parts? houserule placeholders (${placeholders}) beside ${generation.partRecords} saved CBLoader-only record(s); "full" unless a closer pack exists`,
      );
    else if (generation.partRecords === 0) noPartIds.push(file);
  }
  if (noPartIds.length > 0)
    lines.push(
      `  "stock"? (weaker: no CBLoader-only IDs saved at all): ${noPartIds.map((file) => basename(file, ".dnd4e")).join(", ")}`,
    );
  if (lines.length === 0) return;
  console.log(
    `Content profile suggestions (not applied; map a save in ${CONTENT_PROFILES} to silence it):`,
  );
  for (const line of lines) console.log(line);
}

const counts = (
  character: PackEvaluation,
  previous: PackEvaluation | undefined,
) =>
  `stats ${delta(character.stats, previous?.stats)}, powers ${delta(character.powers, previous?.powers)}, usage ${delta(character.usage, previous?.usage)}, action ${delta(character.action, previous?.action)}, main hand ${delta(character.mainHand, previous?.mainHand)}${character.complete ? "" : " incomplete"}${character.errors > 0 ? `, ${character.errors} error(s)` : ""}`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const accept = args.includes("--accept");
  const matchMissingByName = !args.includes("--no-name-matching");
  const useProfiles = !args.includes("--no-profiles");
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
  const explicit = args
    .filter(
      (arg, index) =>
        !arg.startsWith("--") &&
        (packIndex < 0 || index !== packIndex + 1) &&
        (jobsIndex < 0 || index !== jobsIndex + 1),
    )
    .map((file) => relative(".", resolve(file)));
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

  const contentProfiles = await readContentProfiles();
  const profileOf = (file: string) =>
    useProfiles
      ? (contentProfiles.characters.get(file) ?? DEFAULT_PROFILE)
      : DEFAULT_PROFILE;
  const usedProfiles = [
    ...new Set(files.map(profileOf).filter((p) => p !== DEFAULT_PROFILE)),
  ].sort();
  for (const profile of usedProfiles) {
    const path = contentProfiles.packs.get(profile)!;
    if (!existsSync(path))
      throw new Error(
        `The "${profile}" content profile's pack ${path} is missing` +
          (profile === "stock"
            ? ": build it with scripts/build-private-content.sh --stock"
            : "") +
          " (or run with --no-profiles)",
      );
  }

  // Primary evaluations (each save on its profile's pack), then the
  // informational run's-pack evaluations of the profiled saves.
  const tasks = [
    ...files.map((file) => {
      const profile = profileOf(file);
      return {
        file,
        pack:
          profile === DEFAULT_PROFILE
            ? packPath
            : contentProfiles.packs.get(profile)!,
      };
    }),
    ...files
      .filter((file) => profileOf(file) !== DEFAULT_PROFILE)
      .map((file) => ({ file, pack: packPath })),
  ];
  const evaluated = await evaluateTasks(
    tasks,
    matchMissingByName,
    jobsArgument,
  );
  const informational = new Map(
    evaluated
      .slice(files.length)
      .map((character) => [character.file, packEvaluation(character)]),
  );
  const characters: CharacterBaseline[] = evaluated
    .slice(0, files.length)
    .map((character) => {
      const profile = profileOf(character.file);
      if (profile === DEFAULT_PROFILE) return character;
      return {
        ...character,
        profile,
        defaultPack: informational.get(character.file)!,
      };
    });

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
  const profilePacks: Record<string, { path: string; sha256: string }> = {};
  for (const profile of usedProfiles) {
    const path = contentProfiles.packs.get(profile)!;
    profilePacks[profile] = { path, sha256: await sha256(path) };
  }
  const latest: Baseline = {
    generatedAt: new Date().toISOString(),
    pack: { path: packPath, sha256: await sha256(packPath) },
    ...(usedProfiles.length > 0 ? { profiles: profilePacks } : {}),
    totals: {
      stats: sum((character) => character.stats),
      powers: sum((character) => character.powers),
      usage: sum((character) => character.usage),
      action: sum((character) => character.action),
      mainHand: sum((character) => character.mainHand),
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
  for (const [profile, pack] of Object.entries(latest.profiles ?? {})) {
    const previous = baseline?.profiles?.[profile];
    if (previous !== undefined && previous.sha256 !== pack.sha256)
      console.log(
        `Note: the baseline used another "${profile}" pack (${previous.path}, ${previous.sha256.slice(0, 12)}).`,
      );
  }

  let regressions = 0;
  for (const character of characters) {
    const previous = before.get(character.file);
    const profile = character.profile ?? DEFAULT_PROFILE;
    const previousProfile = previous?.profile ?? DEFAULT_PROFILE;
    const sameProfile = profile === previousProfile;
    const comparedTo = sameProfile ? previous : undefined;
    const canonical = !character.file.startsWith(SAMPLE_HEROES);
    console.log(
      `${character.file}${profile === DEFAULT_PROFILE ? "" : ` [${profile}]`}: ${counts(character, comparedTo)}`,
    );
    if (character.defaultPack !== undefined) {
      const defaultKeys = new Set(character.defaultPack.mismatches);
      const contentOnly = [...defaultKeys].filter(
        (key) => !character.mismatches.includes(key),
      ).length;
      const previousDefault =
        previous?.defaultPack ??
        (previousProfile === DEFAULT_PROFILE ? previous : undefined);
      console.log(
        `  on the ${DEFAULT_PROFILE} pack (informational): ${counts(character.defaultPack, previousDefault)}; ${contentOnly} mismatch(es) only there`,
      );
    }
    if (previous === undefined) {
      if (baseline !== undefined) console.log("  (not in the baseline)");
      continue;
    }
    if (!sameProfile) {
      console.log(
        `  (content profile ${previousProfile} -> ${profile}: not compared; re-accept the baseline)`,
      );
      continue;
    }
    const known = new Set(previous.mismatches);
    const current = new Set(character.mismatches);
    const added = character.mismatches.filter((key) => !known.has(key));
    const fixed = [...known].filter((key) => !current.has(key));
    if (canonical) regressions += added.length;
    for (const key of added)
      console.log(
        `  + ${key}${canonical ? "" : " (older-builder save; informational)"}`,
      );
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
    `Total: stats ${delta(latest.totals.stats, baseline?.totals.stats)}, powers ${delta(latest.totals.powers, baseline?.totals.powers)}, usage ${delta(latest.totals.usage, baseline?.totals.usage)}, action ${delta(latest.totals.action, baseline?.totals.action)}, main hand ${delta(latest.totals.mainHand, baseline?.totals.mainHand)}`,
  );
  const generations = await contentGenerations(files);
  if (generations !== undefined)
    printProfileSuggestions(generations, contentProfiles.characters);
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
