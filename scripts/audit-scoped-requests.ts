/**
 * Scoped-request sweep over the private corpus. The web builder asks the
 * rules engine for presentation-scoped evaluations (full option lists only
 * for what the open tab shows, `builderEvaluationPlan`); every other audit
 * evaluates unscoped, so a scoped request that leaves out data a visible
 * editor needs (every Build-tab power swap's empty "New power" step, fixed
 * in e0633d5d) slips past them. For every save, every tab and, on the Build
 * and Retraining tabs, every reached level (Retraining with each level's
 * editor open), this evaluates the editor's requests as it builds them and
 * the same horizons unscoped, and lists every shown choice whose options,
 * replacement targets or gains differ, every differing Overview or issue
 * page, and any non-presentation difference (`scopedRequestGaps`).
 *
 *   pnpm audit:scoped-requests                 # sample-chars
 *   pnpm audit:scoped-requests FILE.dnd4e ...  # only these
 *   pnpm audit:scoped-requests --heroes        # also the SampleHeroes
 *   pnpm audit:scoped-requests --pack P.4ecp   # the "full" profile's pack
 *   pnpm audit:scoped-requests --shard 0/4     # every 4th save (parallel runs)
 *
 * Saves use `pnpm parity:baseline`'s content profiles
 * (tmp/parity/content-profiles.json). Prints a line per gap and counts by
 * tab, kind and choice type; writes tmp/audit/scoped-requests.json. Exit
 * code 1 when any gap is found.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

import { importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  evaluateCharacter,
  type EvaluatedCharacter,
  type EvaluationInput,
} from "@4ecb/rules-engine";

import {
  characterDetailLevels,
  type BuilderEvaluationState,
} from "../apps/web/src/builder-evaluation-plan";
import {
  builderEvaluations,
  scopedRequestGaps,
  type ScopedRequestGap,
} from "../apps/web/src/builder-scoped-requests";
import {
  levelRetrain,
  planningEvaluationHorizon,
  retrainingChoicesByLevel,
} from "../apps/web/src/builder-ui";

import type { BuilderWorkspaceTab } from "../apps/web/src/routes";

import {
  DEFAULT_PROFILE,
  PLAYER_CHARACTERS,
  SAMPLE_HEROES,
  dnd4eFiles,
  loadPackEntities,
  readContentProfiles,
} from "./legacy-parity";

type Entities = Awaited<ReturnType<typeof loadPackEntities>>;

/** Tabs whose requests don't depend on the selected level. */
const LEVEL_FREE_TABS: readonly BuilderWorkspaceTab[] = [
  "overview",
  "details",
  "equipment",
  "shop",
  "diagnostics",
];

const bump = (map: Map<string, number>, name: string) =>
  map.set(name, (map.get(name) ?? 0) + 1);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const at = args.indexOf(flag);
    return at < 0 ? undefined : args[at + 1];
  };
  const fullPack = valueOf("--pack") ?? "tmp/content/full-local.4ecp";
  // "K/N": only every Nth save from the Kth (0-based), for parallel runs.
  const [shard, shards] = (valueOf("--shard") ?? "0/1").split("/").map(Number);
  const flagValues = new Set(
    ["--pack", "--shard"].flatMap((flag) => {
      const at = args.indexOf(flag);
      return at < 0 ? [] : [at + 1];
    }),
  );
  const explicit = args
    .filter((arg, index) => !arg.startsWith("--") && !flagValues.has(index))
    .map((file) => relative(".", resolve(file)));
  const files = (
    explicit.length > 0
      ? explicit
      : [
          ...(await dnd4eFiles(PLAYER_CHARACTERS)),
          ...(args.includes("--heroes") ? await dnd4eFiles(SAMPLE_HEROES) : []),
        ]
  ).filter((_, index) => index % shards! === shard);
  if (files.length === 0) throw new Error("No legacy characters found");
  const profiles = await readContentProfiles();
  const packs = new Map<string, Entities>();
  const all: (ScopedRequestGap & { readonly save: string })[] = [];
  const byKind = new Map<string, number>();
  const savesWithGaps = new Set<string>();
  let states = 0;
  for (const file of files) {
    const profile = profiles.characters.get(file) ?? DEFAULT_PROFILE;
    const path =
      profile === DEFAULT_PROFILE ? fullPack : profiles.packs.get(profile)!;
    let entities = packs.get(path);
    if (entities === undefined) {
      entities = await loadPackEntities(path);
      packs.set(path, entities);
    }
    const byId = new Map(
      entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
    );
    const xml = await readFile(resolve(file), "utf8");
    const { build } = importDnd4e(xml, { matchMissingDefinitionsIn: entities });
    const memo = new Map<string, EvaluatedCharacter>();
    // Only the last few of each kind are kept (least recently used goes):
    // a level-30 save's exhaustive evaluations outgrow a 6 GB heap
    // otherwise. Run such a save alone with NODE_OPTIONS=
    // --max-old-space-size=14000.
    const scopedMemo = new Map<string, EvaluatedCharacter>();
    let evaluations = 0;
    const evaluate = (input: EvaluationInput) => {
      const unscoped = input.candidateDetailLevels === undefined;
      const cache = unscoped ? memo : scopedMemo;
      const memoKey = JSON.stringify(input);
      let result = cache.get(memoKey);
      if (result === undefined) {
        result = evaluateCharacter(input, entities);
        evaluations += 1;
      } else cache.delete(memoKey);
      cache.set(memoKey, result);
      if (cache.size > 4) cache.delete(cache.keys().next().value!);
      return result;
    };
    const save = `${basename(file, ".dnd4e")}${profile === DEFAULT_PROFILE ? "" : ` [${profile}]`}`;
    const level = build.effectiveLevel;
    const stateFor = (
      workspace: BuilderWorkspaceTab,
      selectedLevel: number,
      expandedReplacementChoiceId?: string,
    ): BuilderEvaluationState => {
      const planningHorizon = planningEvaluationHorizon(build, selectedLevel);
      const base: BuilderEvaluationState = {
        workspace,
        currentLevel: level,
        selectedLevel,
        planningHorizon,
        characterDetailLevels: [],
        expandedReplacementChoiceId,
      };
      // The editor requests the Details tab's levels from the previous
      // planning evaluation; any evaluation lists the same choices.
      const planning = builderEvaluations(
        build,
        entities,
        base,
        evaluate,
      ).planning;
      return {
        ...base,
        characterDetailLevels: characterDetailLevels(planning),
      };
    };
    const checks: BuilderEvaluationState[] = [];
    for (const workspace of LEVEL_FREE_TABS)
      checks.push(stateFor(workspace, level));
    for (let selected = 1; selected <= level; selected += 1)
      checks.push(stateFor("build", selected));
    const retraining = stateFor("retraining", level);
    const planning = builderEvaluations(
      build,
      entities,
      retraining,
      evaluate,
    ).planning;
    for (const [rowLevel, choices] of retrainingChoicesByLevel(
      planning,
      level,
    )) {
      checks.push(stateFor("retraining", rowLevel));
      // The open editor requests its level's retrain (or first) choice.
      const choice =
        levelRetrain(choices, planning, byId)?.choice ?? choices[0];
      if (choice !== undefined)
        checks.push(stateFor("retraining", rowLevel, choice.id));
    }
    const gaps = checks.flatMap((state) =>
      scopedRequestGaps({ build, entities, byId, state, evaluate }),
    );
    states += checks.length;
    console.log(
      `## ${file} [${profile}] L${level}: ${checks.length} tab states, ${gaps.length} gap(s), ${evaluations} evaluations`,
    );
    for (const gap of gaps) {
      console.log(
        `  ${gap.workspace} L${gap.selectedLevel} ${gap.kind}${gap.choiceType === undefined ? "" : ` [${gap.choiceType}]`}${gap.choiceId === undefined ? "" : ` ${gap.choiceId}`}: ${gap.detail}`,
      );
      bump(
        byKind,
        `${gap.workspace} ${gap.kind}${gap.choiceType === undefined ? "" : ` [${gap.choiceType}]`}`,
      );
      all.push({ ...gap, save });
      savesWithGaps.add(save);
    }
  }
  console.log(
    `\n${files.length} saves, ${states} tab states: ${all.length} gap(s) in ${savesWithGaps.size} save(s)`,
  );
  for (const [name, count] of [...byKind].sort((a, b) => b[1] - a[1]))
    console.log(`  ${count}x ${name}`);
  await mkdir("tmp/audit", { recursive: true });
  await writeFile(
    shards === 1
      ? "tmp/audit/scoped-requests.json"
      : `tmp/audit/scoped-requests.${shard}-of-${shards}.json`,
    `${JSON.stringify(all, null, 2)}\n`,
  );
  if (all.length > 0) process.exitCode = 1;
}

await main();
