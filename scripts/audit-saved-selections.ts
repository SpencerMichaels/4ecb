/**
 * Saved-selection invariant over the private corpus. For every legacy save,
 * on the pack its content profile names, every element the save holds must
 * be active in the modern evaluation or accounted for by a stated reason;
 * anything else is a silent drop. Active modern elements the save never held
 * are listed as extras. The statuses and causes are documented in
 * packages/legacy-dnd4e/src/saved-selection-audit.ts.
 *
 *   pnpm audit:saved-selections                 # sample-chars + SampleHeroes
 *   pnpm audit:saved-selections FILE.dnd4e ...  # only these
 *   pnpm audit:saved-selections --verbose       # also list accounted elements
 *   pnpm audit:saved-selections --pack P.4ecp   # the "full" profile's pack
 *
 * Saves import as `pnpm parity:baseline` imports them (name matching on) and
 * use its content profiles (tmp/parity/content-profiles.json). Per save it
 * prints DROP (silent drops), LOOT (holdings legacy has and modern lacks or
 * cannot resolve), EXTRA (with its cause) and LEGACY-ACTIVE (accounted for,
 * yet legacy applied it); then a cross-save summary for sample-chars
 * (canonical) and the SampleHeroes (older builders, informational). It is a
 * triage report, not a gate: the exit code is always 0.
 */
import { readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

import { auditSavedSelections, importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import {
  DEFAULT_PROFILE,
  PLAYER_CHARACTERS,
  SAMPLE_HEROES,
  dnd4eFiles,
  loadPackEntities,
  readContentProfiles,
} from "./legacy-parity";

type Entities = Awaited<ReturnType<typeof loadPackEntities>>;

interface Tally {
  saves: number;
  elements: number;
  active: number;
  accounted: number;
  silent: number;
  blank: number;
  loot: number;
  lootMissing: number;
  lootSilent: number;
  extras: number;
  extrasUnexplained: number;
  readonly statuses: Map<string, number>;
  readonly causes: Map<string, number>;
  /** Finding -> saves, for the cross-save summary. */
  readonly findings: Map<string, Set<string>>;
}

const newTally = (): Tally => ({
  saves: 0,
  elements: 0,
  active: 0,
  accounted: 0,
  silent: 0,
  blank: 0,
  loot: 0,
  lootMissing: 0,
  lootSilent: 0,
  extras: 0,
  extrasUnexplained: 0,
  statuses: new Map(),
  causes: new Map(),
  findings: new Map(),
});

const bump = (map: Map<string, number>, name: string) =>
  map.set(name, (map.get(name) ?? 0) + 1);

function printTally(label: string, tally: Tally): void {
  console.log(
    `\n${label}: ${tally.saves} saves; ${tally.elements} saved elements (${tally.active} active, ${tally.accounted} accounted, ${tally.silent} silent drops), ${tally.blank} blank slots; ${tally.loot} holdings (${tally.lootMissing} missing from the pack, ${tally.lootSilent} silent drops); ${tally.extras} extras (${tally.extrasUnexplained} unexplained)`,
  );
  console.log(
    `  saved elements: ${[...tally.statuses].map(([name, count]) => `${name} ${count}`).join(", ")}`,
  );
  console.log(
    `  extras: ${[...tally.causes].map(([name, count]) => `${name} ${count}`).join(", ")}`,
  );
  const findings = [...tally.findings].sort(
    ([a, aSaves], [b, bSaves]) =>
      bSaves.size - aSaves.size || a.localeCompare(b),
  );
  for (const [finding, saves] of findings)
    console.log(`  ${saves.size}x ${finding}: ${[...saves].join(", ")}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const packIndex = args.indexOf("--pack");
  const fullPack =
    packIndex >= 0
      ? (args[packIndex + 1] ?? "")
      : "tmp/content/full-local.4ecp";
  const explicit = args
    .filter(
      (arg, index) =>
        !arg.startsWith("--") && (packIndex < 0 || index !== packIndex + 1),
    )
    .map((file) => relative(".", resolve(file)));
  const files =
    explicit.length > 0
      ? explicit
      : [
          ...(await dnd4eFiles(PLAYER_CHARACTERS)),
          ...(await dnd4eFiles(SAMPLE_HEROES)),
        ];
  if (files.length === 0) throw new Error("No legacy characters found");
  const profiles = await readContentProfiles();
  const packPath = (file: string) => {
    const profile = profiles.characters.get(file) ?? DEFAULT_PROFILE;
    return profile === DEFAULT_PROFILE
      ? { profile, path: fullPack }
      : { profile, path: profiles.packs.get(profile)! };
  };
  const packs = new Map<string, Entities>();
  const canonical = newTally();
  const informational = newTally();
  for (const file of files) {
    const { profile, path } = packPath(file);
    let entities = packs.get(path);
    if (entities === undefined) {
      entities = await loadPackEntities(path);
      packs.set(path, entities);
    }
    const xml = await readFile(resolve(file), "utf8");
    const imported = importDnd4e(xml, { matchMissingDefinitionsIn: entities });
    const evaluated = evaluateCharacter(
      {
        ...projectBuildForEvaluation(imported.build, entities),
        candidateDetailLevels: [],
      },
      entities,
    );
    const audit = auditSavedSelections(imported, evaluated, entities);
    const isInformational = !file.startsWith(`${PLAYER_CHARACTERS}/`);
    const tally = isInformational ? informational : canonical;
    const save = `${basename(file, ".dnd4e")}${profile === DEFAULT_PROFILE ? "" : ` [${profile}]`}`;
    const note = (finding: string) =>
      tally.findings.set(
        finding,
        (tally.findings.get(finding) ?? new Set()).add(save),
      );
    const silent = audit.elements.filter((e) => e.status === "silent-drop");
    const accounted = audit.elements.filter(
      (e) => e.status !== "active" && e.status !== "silent-drop",
    );
    const lootOff = audit.loot.filter((l) => l.status !== "present");
    const unexplained = audit.extras.filter((e) => e.cause === "unexplained");
    tally.saves += 1;
    tally.elements += audit.elements.length;
    tally.active += audit.elements.length - accounted.length - silent.length;
    tally.accounted += accounted.length;
    tally.silent += silent.length;
    tally.blank += audit.blankSlots;
    tally.loot += audit.loot.length;
    tally.lootMissing += lootOff.filter(
      (l) => l.status === "diagnostic",
    ).length;
    tally.lootSilent += lootOff.filter(
      (l) => l.status === "silent-drop",
    ).length;
    tally.extras += audit.extras.length;
    tally.extrasUnexplained += unexplained.length;
    for (const element of audit.elements) bump(tally.statuses, element.status);
    for (const extra of audit.extras) bump(tally.causes, extra.cause);
    console.log(
      `\n## ${file} [${profile}]${isInformational ? " (informational)" : ""}: ${audit.elements.length} elements, ${accounted.length} accounted, ${silent.length} silent drop(s); ${audit.loot.length} holdings, ${lootOff.length} off; ${audit.extras.length} extra(s), ${unexplained.length} unexplained; ${audit.blankSlots} blank slot(s)${evaluated.converged ? "" : "; NOT CONVERGED"}`,
    );
    for (const element of silent) {
      console.log(
        `  DROP ${element.name} (${element.type}, ${element.definitionId}) L${element.level}${element.droppedUnder === undefined ? "" : ` under dropped ${element.droppedUnder}`}: ${element.path}`,
      );
      if (element.droppedUnder === undefined)
        note(`silent drop ${element.name} (${element.type})`);
    }
    for (const entry of lootOff) {
      console.log(
        `  LOOT ${entry.status} ${entry.name} [${entry.definitionIds.join(" + ")}] ${entry.detail ?? ""}`,
      );
      note(`loot ${entry.status} ${entry.name}`);
    }
    for (const extra of audit.extras) {
      if (extra.cause === "under-extra" && !verbose) continue;
      console.log(
        `  EXTRA ${extra.cause} ${extra.name} (${extra.type}, ${extra.definitionId}) ${extra.kind} from ${extra.provider}${extra.detail === undefined ? "" : `; ${extra.detail}`}`,
      );
      if (extra.cause !== "under-extra")
        note(
          `extra ${extra.cause} ${extra.name} (${extra.type}) from ${extra.provider}${extra.detail === undefined ? "" : `; ${extra.detail}`}`,
        );
    }
    // Accounted for, yet legacy applied it: the stated reason disagrees with
    // the oracle, so it is worth a look even though it is not silent.
    for (const element of accounted) {
      if (!element.legacyActive) continue;
      console.log(
        `  LEGACY-ACTIVE ${element.status} ${element.name} (${element.type}) L${element.level}${element.detail === undefined ? "" : `: ${element.detail}`}`,
      );
      note(
        `inactive but legacy-active (${element.status}) ${element.name} (${element.type})`,
      );
    }
    if (verbose)
      for (const element of accounted)
        console.log(
          `  ok ${element.status} ${element.name} (${element.type}) L${element.level}${element.detail === undefined ? "" : `: ${element.detail}`}`,
        );
  }
  printTally("sample-chars (canonical)", canonical);
  if (informational.saves > 0)
    printTally("Other saves (informational)", informational);
}

await main();
