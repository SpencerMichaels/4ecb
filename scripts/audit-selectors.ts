/**
 * Private audit of the rule-language conditions the evaluator decides
 * (postmortem of `SLOT:off hand`, D100: a selector that never matched
 * anything went unnoticed for months because nothing flags a condition that
 * is never true).
 *
 * For every distinct condition operand in a pack it records whether the
 * modern engine evaluates it true and false at least once:
 *
 * - `selector`: `wearing`/`not-wearing` operands (statadd, textstring,
 *   modify). Decided by `equipmentPredicate` (native HasLoot) on every
 *   sample character (natural: rules the character owns) and broadcast:
 *   every operand against every evaluated equipment state, of the samples
 *   and of generated probe characters that equip each weapon, armor, shield
 *   and implement record in each hand arrangement (main hand, off hand,
 *   both hands, versatile two-handed, the same weapon twice, a main weapon
 *   with each off-hand weapon or shield, the alternate slot), on a Medium
 *   and a Small character. Operands the matcher has no branch for are
 *   flagged `unrecognized`.
 * - `requires`: every expression's natural result on the samples, broadcast
 *   against every sample's owned elements, and each term's satisfiability
 *   against the whole pack (a term no record can meet is never true).
 * - `zero` / `non-zero` / `statmin`: whether gated statadds applied.
 * - `statlink`: link targets (`+X`, `-X`, `ABILITYMOD(X)`) no statadd in the
 *   pack defines and no evaluation ever filled.
 * - `select-category`: select filters no record of the select's type meets.
 * - `select-ref`: `modify`/`drop` `select=` names no select defines.
 * - `modify-target`: `modify name=` targets no record resolves.
 * - `attribute`: rule attributes the parser doesn't read (a condition the
 *   engine silently ignores).
 *
 * Instrumented through the opt-in condition trace
 * (`packages/rules-engine/src/condition-trace.ts`); no matcher logic is
 * duplicated here. Writes tmp/selectors/report.json and report.md, and
 * prints flagged operands. Known false alarms are listed in `TRIAGED` with
 * a reason; anything else flagged exits 1.
 *
 *   pnpm audit:selectors [--pack PACK.4ecp] [--no-probes] [FILE.dnd4e ...]
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";

import type { ContentEntity } from "@4ecb/content-domain";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  equipmentPredicate,
  equipmentSelectorBranch,
  evaluateCharacter,
  evaluateRequires,
  isGroupItemSet,
  isItemSetEntity,
  matchesCategory,
  parseCategoryExpression,
  parseRequires,
  parseRules,
  projectBuildForEvaluation,
  setConditionTrace,
  sharedRulesIndex,
  type CharacterInventoryEntry,
  type ConditionKind,
  type EquipmentState,
  type EvaluationInput,
  type ExpressionContext,
  type RequiresExpression,
} from "@4ecb/rules-engine";

import { loadPackEntities } from "./legacy-parity";

const OUTPUT_DIR = "tmp/selectors";
const SAMPLE_DIRS = [
  "sample-chars",
  "CharacterBuilder/SampleChars/SampleHeroes",
];

const key = (value: string) => value.trim().toLocaleLowerCase();

type FlagKind =
  | "selector"
  | "requires"
  | "zero"
  | "non-zero"
  | "statmin"
  | "statlink"
  | "select-category"
  | "select-ref"
  | "modify-target"
  | "attribute";

interface Triaged {
  readonly kind: FlagKind;
  /** Exact operand (case-insensitive) or a pattern. */
  readonly operand: string | RegExp;
  readonly flags?: readonly string[];
  readonly reason: string;
}

/**
 * Flagged operands reviewed as false alarms: impossible on the corpus (an
 * item, element or combination nobody can own) or correct as they are.
 * Every entry says why. Real bugs are fixed, not listed here.
 */
const TRIAGED: readonly Triaged[] = [
  {
    kind: "requires",
    operand: "!Armor Proficiency ()",
    reason:
      "Barding: no barding proficiency exists, so the non-proficiency penalty always applies (audit:requires DELIBERATE).",
  },
  {
    kind: "requires",
    operand: /^!No (Properties|Powers \([^)]*\)): The Nine Swords of Tyr$/,
    reason:
      'A dead "!No ...: The Nine Swords of Tyr" guard (no such type or record): the item always grants its property and power cards, as published (audit:requires DELIBERATE).',
  },
  {
    kind: "requires",
    operand: /^ID_INTERNAL_ARENA_WEAPON_/,
    reason:
      "Arena Weapon Feat Fixing: dead alternatives in an OR (light mace, short spear, lance, unarmed attack have no Arena Weapon record); the rest still match (audit:requires DELIBERATE).",
  },
  {
    kind: "requires",
    operand: /\|\|/,
    reason:
      "An empty alternative from a doubled `||` matches nothing; the other alternatives still decide the OR (native MeetsRequires reads the empty token the same way).",
  },
  {
    kind: "statlink",
    operand: "Hybrid Power Points",
    reason:
      "No record defines the stat in native either (0); Psionic Dabbler's hybrid power points need an owner decision on a content correction.",
  },
  {
    kind: "statlink",
    operand: "constition modifier",
    reason:
      'Stalwart Assault\'s conditional melee damage misspells "Constitution modifier"; native shows the same 0. Content correction pending an owner decision (D091).',
  },
  {
    kind: "select-category",
    operand: "Power|ID_FMP_CLASS_9,daily,lightning,4",
    reason:
      "Tome of Striking Lightning +1: the pack has no wizard daily lightning power of level 4 or lower, so the select is empty in native too.",
  },
  {
    kind: "select-category",
    operand: "Feat|NOFEATSFORYOU",
    reason: "Companion Class: a deliberately empty feat choice.",
  },
  {
    kind: "modify-target",
    operand: /^(this|BaseItem)$/i,
    reason:
      "Context targets: `this` is the providing record and `BaseItem` the holding's base record (item-fields CONTEXT_TARGETS, evaluator overlay()).",
  },
  {
    kind: "modify-target",
    operand:
      /^(Predator's Strike|Command's Strike|Overhwleming Strike|Ghost Sounds) \(Power\)$|^Catkcha \(Weapon\)$/,
    reason:
      "Misspelled targets (Predator Strike, Commander's Strike, Overwhelming Strike, Ghost Sound, Chatkcha): native finds nothing either. Content correction pending an owner decision (D091).",
  },
];

// ---------------------------------------------------------------------------
// Static inventory of the pack's conditions.

interface Use {
  readonly record: string;
  readonly statement: string;
}

interface Tally {
  natural: { true: number; false: number };
  broadcast: { true: number; false: number };
  characters: Set<string>;
}

const newTally = (): Tally => ({
  natural: { true: 0, false: 0 },
  broadcast: { true: 0, false: 0 },
  characters: new Set(),
});

interface Inventory {
  readonly selectors: Map<string, { operand: string; uses: Use[] }>;
  readonly requires: Map<string, { operand: string; uses: Use[] }>;
  readonly gated: Map<string, { kind: "zero" | "non-zero"; uses: Use[] }>;
  readonly statmins: Map<string, Use[]>;
  readonly links: Map<string, { operand: string; uses: Use[] }>;
  readonly statNames: Set<string>;
  readonly selects: Map<
    string,
    { type: string; category: string; uses: Use[] }
  >;
  readonly selectNames: Set<string>;
  readonly selectRefs: Map<string, { operand: string; uses: Use[] }>;
  readonly modifyTargets: Map<
    string,
    { name: string; type: string | undefined; uses: Use[] }
  >;
  readonly attributes: Map<string, Use[]>;
}

function push<T>(map: Map<string, T>, id: string, create: () => T): T {
  let value = map.get(id);
  if (value === undefined) {
    value = create();
    map.set(id, value);
  }
  return value;
}

/** A statadd value's link target, as native ParseStatAdd reads one: a
 *  digit after the sign makes a literal (`+1d6` is 1). */
function linkTarget(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^[+-]?\d/.test(trimmed)) return undefined;
  const ability = /^[+-]?(?:ABILITYMOD|MINONEMOD|HALFMOD)\((.+)\)$/i.exec(
    trimmed,
  );
  if (ability?.[1] !== undefined) return ability[1];
  const link = /^[+-](.+)$/.exec(trimmed);
  return link?.[1];
}

function inventory(entities: readonly ContentEntity[]): Inventory {
  const result: Inventory = {
    selectors: new Map(),
    requires: new Map(),
    gated: new Map(),
    statmins: new Map(),
    links: new Map(),
    statNames: new Set(),
    selects: new Map(),
    selectNames: new Set(),
    selectRefs: new Map(),
    modifyTargets: new Map(),
    attributes: new Map(),
  };
  for (const entity of entities) {
    const record = `${entity.id} (${entity.name})`;
    // Native GroupSetCounts fills a group set's Set Count stat.
    if (isItemSetEntity(entity) && isGroupItemSet(entity))
      result.statNames.add(key(`${entity.id} Set Count`));
    for (const rule of parseRules(entity.id, entity.rules)) {
      const statement = rule.source.original.name;
      const use = { record, statement };
      for (const attribute of rule.source.unknownAttributes)
        push(
          result.attributes,
          `${key(statement)}.${key(attribute.name)}`,
          () => [],
        ).push(use);
      if (rule.requires !== undefined)
        push(result.requires, key(rule.requires), () => ({
          operand: rule.requires!,
          uses: [],
        })).uses.push(use);
      switch (rule.kind) {
        case "statadd": {
          result.statNames.add(key(rule.name));
          if (rule.zero !== undefined || rule.nonZero !== undefined) {
            const kind = rule.zero !== undefined ? "zero" : "non-zero";
            push(
              result.gated,
              `${kind}:${entity.name}|${key(rule.name)}`,
              () => ({
                kind,
                uses: [],
              }),
            ).uses.push(use);
          }
          if (rule.statMinimum !== undefined)
            push(
              result.statmins,
              `${entity.name}|${rule.name}|${rule.statMinimum}`,
              () => [],
            ).push(use);
          const target = linkTarget(rule.value);
          if (target !== undefined)
            push(result.links, key(target), () => ({
              operand: target,
              uses: [],
            })).uses.push(use);
          break;
        }
        case "statalias":
          result.statNames.add(key(rule.alias));
          result.statNames.add(key(rule.name));
          break;
        case "select":
          if (rule.name !== undefined) result.selectNames.add(key(rule.name));
          if (rule.category !== undefined)
            push(
              result.selects,
              `${key(rule.type)}|${key(rule.category)}`,
              () => ({ type: rule.type, category: rule.category!, uses: [] }),
            ).uses.push(use);
          break;
        case "modify":
          if (rule.select !== undefined)
            push(result.selectRefs, key(rule.select), () => ({
              operand: rule.select!,
              uses: [],
            })).uses.push(use);
          if (rule.name !== undefined && rule.select === undefined)
            push(
              result.modifyTargets,
              `${key(rule.name)}|${key(rule.type ?? "")}`,
              () => ({ name: rule.name!, type: rule.type, uses: [] }),
            ).uses.push(use);
          break;
        case "drop":
          if (rule.select !== undefined)
            push(result.selectRefs, key(rule.select), () => ({
              operand: rule.select!,
              uses: [],
            })).uses.push(use);
          break;
        default:
          break;
      }
      for (const attribute of ["wearing", "not-wearing"]) {
        const value = rule.source.original.attributes
          .find(({ name }) => key(name) === attribute)
          ?.value.trim();
        if (value === undefined || value.length === 0) continue;
        push(result.selectors, key(value), () => ({
          operand: value,
          uses: [],
        })).uses.push({ record, statement: `${statement} ${attribute}` });
      }
    }
  }
  return result;
}

/** Selector operands that name a record (no colon). */
function nameSelectors(found: Inventory): string[] {
  return [...found.selectors.values()]
    .map(({ operand }) => operand)
    .filter((operand) => equipmentSelectorBranch(operand) === "name");
}

// ---------------------------------------------------------------------------
// Characters: the samples, then generated equipment probes.

async function sampleFiles(args: readonly string[]): Promise<string[]> {
  const explicit = args.filter((arg) => arg.endsWith(".dnd4e"));
  if (explicit.length > 0) return explicit;
  const files: string[] = [];
  for (const directory of SAMPLE_DIRS) {
    if (!existsSync(directory)) continue;
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    files.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".dnd4e"))
        .map((entry) => relative(".", join(entry.parentPath, entry.name))),
    );
  }
  return files.sort();
}

interface Probe {
  readonly label: string;
  readonly inventory: readonly CharacterInventoryEntry[];
}

function field(entity: ContentEntity, name: string): string {
  return (
    entity.specifics.find((specific) => key(specific.name) === key(name))
      ?.value ?? ""
  );
}

function holding(
  id: string,
  definitionId: string,
  slots: readonly [string, number][],
  options: { quantity?: number; twoHanded?: boolean } = {},
): CharacterInventoryEntry {
  const quantity =
    options.quantity ?? Math.max(1, ...slots.map(([, index]) => index + 1));
  return {
    id,
    definitionIds: [definitionId],
    quantity,
    equippedQuantity: quantity,
    acquiredLevel: 1,
    equippedSlots: slots.map(([slot, quantityIndex]) => ({
      slot: slot as never,
      quantityIndex,
    })),
    ...(options.twoHanded === true ? { wieldedTwoHanded: true } : {}),
  };
}

/** Every hand/body arrangement of the pack's equippable records. */
function probes(
  entities: readonly ContentEntity[],
  nameSelectors: readonly string[],
): Probe[] {
  const weapons = entities.filter(
    (entity) => key(entity.type) === "weapon" && !/^large\s/i.test(entity.name),
  );
  const armors = entities.filter((entity) => key(entity.type) === "armor");
  const shields = armors.filter((entity) =>
    /shield/i.test(field(entity, "Armor Type") + entity.name),
  );
  const bodyArmors = armors.filter((entity) => !shields.includes(entity));
  const implements_ = [
    ...entities.filter((entity) => key(entity.type) === "superior implement"),
    ...entities.filter(
      (entity) =>
        key(entity.type) === "gear" &&
        /implement|holy symbol|totem|ki focus/i.test(entity.name),
    ),
  ];
  // One magic implement of each Magic Item Type.
  const implementTypes = new Map<string, ContentEntity>();
  for (const entity of entities)
    if (
      key(entity.type) === "magic item" &&
      /^(rod|staff|wand|orb|totem|tome|holy symbol|ki focus)$/i.test(
        field(entity, "Magic Item Type"),
      )
    )
      implementTypes.set(key(field(entity, "Magic Item Type")), entity);
  implements_.push(...implementTypes.values());
  const twoHanded = (weapon: ContentEntity) =>
    /two/i.test(field(weapon, "Hands Required"));
  const offHand = (weapon: ContentEntity) =>
    /off-hand/i.test(field(weapon, "Properties"));
  const versatile = (weapon: ContentEntity) =>
    /versatile/i.test(field(weapon, "Properties"));
  const alternate = (entity: ContentEntity) =>
    field(entity, "_AlternateSlot").trim();
  const main = weapons.find((weapon) => key(weapon.name) === "longsword");
  const dagger = weapons.find((weapon) => key(weapon.name) === "dagger");
  const result: Probe[] = [{ label: "nothing equipped", inventory: [] }];
  for (const weapon of weapons) {
    if (twoHanded(weapon)) {
      result.push({
        label: `${weapon.name} in both hands`,
        inventory: [
          holding("w", weapon.id, [
            ["main-hand", 0],
            ["off-hand", 0],
          ]),
        ],
      });
      continue;
    }
    result.push({
      label: `${weapon.name} in the main hand`,
      inventory: [holding("w", weapon.id, [["main-hand", 0]])],
    });
    result.push({
      label: `${weapon.name} in the off hand`,
      inventory: [holding("w", weapon.id, [["off-hand", 0]])],
    });
    result.push({
      label: `two ${weapon.name}`,
      inventory: [
        holding("w", weapon.id, [
          ["main-hand", 0],
          ["off-hand", 1],
        ]),
      ],
    });
    if (versatile(weapon))
      result.push({
        label: `${weapon.name} two-handed`,
        inventory: [
          holding(
            "w",
            weapon.id,
            [
              ["main-hand", 0],
              ["off-hand", 0],
            ],
            { twoHanded: true },
          ),
        ],
      });
    if (main !== undefined && offHand(weapon))
      result.push({
        label: `${main.name} and ${weapon.name}`,
        inventory: [
          holding("m", main.id, [["main-hand", 0]]),
          holding("w", weapon.id, [["off-hand", 0]]),
        ],
      });
    if (dagger !== undefined && !offHand(weapon))
      result.push({
        label: `${weapon.name} and ${dagger.name}`,
        inventory: [
          holding("w", weapon.id, [["main-hand", 0]]),
          holding("d", dagger.id, [["off-hand", 0]]),
        ],
      });
    const slot = alternate(weapon);
    if (slot.length > 0)
      result.push({
        label: `${weapon.name} in its alternate slot (${slot})`,
        inventory: [
          holding("w", weapon.id, [[key(slot), 0]]),
          ...(main === undefined
            ? []
            : [holding("m", main.id, [["main-hand", 0]])]),
        ],
      });
  }
  for (const armor of bodyArmors)
    result.push({
      label: `${armor.name} worn`,
      inventory: [holding("a", armor.id, [["body", 0]])],
    });
  for (const shield of shields)
    result.push({
      label: `${shield.name} with a longsword`,
      inventory: [
        holding("s", shield.id, [["off-hand", 0]]),
        ...(main === undefined
          ? []
          : [holding("m", main.id, [["main-hand", 0]])]),
      ],
    });
  for (const implement of implements_) {
    result.push({
      label: `${implement.name} in the main hand`,
      inventory: [holding("i", implement.id, [["main-hand", 0]])],
    });
    result.push({
      label: `${implement.name} in the off hand with a longsword`,
      inventory: [
        holding("i", implement.id, [["off-hand", 0]]),
        ...(main === undefined
          ? []
          : [holding("m", main.id, [["main-hand", 0]])]),
      ],
    });
  }
  // Records a name selector (no colon: native HasLoot compares the base
  // record name) names, placed where the loadout puts them.
  const names = new Set(nameSelectors.map(key));
  for (const entity of entities)
    if (names.has(key(entity.name)) && field(entity, "Item Slot") !== "")
      result.push({
        label: `${entity.name} equipped`,
        inventory: [
          {
            id: "n",
            definitionIds: [entity.id],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
      });
  return result;
}

// ---------------------------------------------------------------------------

interface Recorder {
  current: string;
  tallies: Map<string, Tally>;
  readonly states: {
    equipment: EquipmentState;
    expressions: ExpressionContext;
  }[];
  broadcasting: boolean;
}

function tallyKey(kind: ConditionKind, operand: string): string {
  return `${kind}\u0000${key(operand)}`;
}

function record(
  recorder: Recorder,
  kind: ConditionKind,
  operand: string,
  result: boolean,
  mode: "natural" | "broadcast",
): void {
  const tally = push(recorder.tallies, tallyKey(kind, operand), newTally);
  tally[mode][result ? "true" : "false"] += 1;
  if (result) tally.characters.add(recorder.current);
}

// ---------------------------------------------------------------------------
// Evaluation jobs, run on a pool of worker threads (each loads the pack).

type Job =
  | { readonly kind: "sample"; readonly file: string }
  | { readonly kind: "probe"; readonly base: string; readonly probe: number };

/** One tally as it crosses threads: key, natural T/F, broadcast T/F. */
type WireTally = [string, number, number, number, number];

interface JobResult {
  readonly label: string;
  readonly tallies: readonly WireTally[];
  readonly level?: number;
  readonly small?: boolean;
  readonly error?: string;
}

interface WorkerSetup {
  readonly pack: string;
}

interface JobContext {
  readonly entities: readonly ContentEntity[];
  readonly selectors: readonly string[];
  readonly requires: readonly {
    operand: string;
    expression: RequiresExpression;
  }[];
  readonly probes: readonly Probe[];
  readonly inputs: Map<string, EvaluationInput>;
  readonly recorder: Recorder;
}

async function jobContext(pack: string): Promise<JobContext> {
  const entities = await loadPackEntities(pack);
  const found = inventory(entities);
  const recorder: Recorder = {
    current: "",
    tallies: new Map(),
    states: [],
    broadcasting: false,
  };
  setConditionTrace({
    condition(kind, operand, result) {
      record(
        recorder,
        kind,
        operand,
        result,
        recorder.broadcasting ? "broadcast" : "natural",
      );
    },
    evaluationState(state) {
      recorder.states.push(state);
    },
  });
  return {
    entities,
    selectors: [...found.selectors.values()].map(({ operand }) => operand),
    requires: [...found.requires.values()].map(({ operand }) => ({
      operand,
      expression: parseRequires(operand),
    })),
    probes: probes(entities, nameSelectors(found)),
    inputs: new Map(),
    recorder,
  };
}

async function sampleInput(
  context: JobContext,
  file: string,
): Promise<EvaluationInput> {
  let input = context.inputs.get(file);
  if (input === undefined) {
    const imported = importDnd4e(await readFile(file, "utf8"), {
      matchMissingDefinitionsIn: context.entities,
    });
    input = {
      ...projectBuildForEvaluation(imported.build, context.entities),
      includePowers: false,
    };
    context.inputs.set(file, input);
  }
  return input;
}

async function runJob(context: JobContext, job: Job): Promise<JobResult> {
  const { recorder, entities } = context;
  recorder.tallies = new Map();
  recorder.states.length = 0;
  const label =
    job.kind === "sample"
      ? job.file
      : `probe on ${job.base}: ${context.probes[job.probe]?.label ?? ""}`;
  recorder.current = label;
  const wire = (): WireTally[] =>
    [...recorder.tallies].map(([id, tally]) => [
      id,
      tally.natural.true,
      tally.natural.false,
      tally.broadcast.true,
      tally.broadcast.false,
    ]);
  try {
    const base = await sampleInput(
      context,
      job.kind === "sample" ? job.file : job.base,
    );
    const input =
      job.kind === "sample"
        ? base
        : {
            ...base,
            inventory: context.probes[job.probe]?.inventory ?? [],
            candidateDetailLevels: [],
          };
    const evaluated = evaluateCharacter(input, entities);
    // Every selector against the final equipment state, and (samples)
    // every requires against the character's owned elements.
    const state = recorder.states.at(-1);
    if (state !== undefined) {
      recorder.broadcasting = true;
      for (const operand of context.selectors)
        equipmentPredicate(state.equipment, operand);
      recorder.broadcasting = false;
      if (job.kind === "sample")
        for (const { operand, expression } of context.requires)
          record(
            recorder,
            "requires",
            operand,
            evaluateRequires(expression, state.expressions),
            "broadcast",
          );
    }
    return {
      label,
      tallies: wire(),
      level: input.level,
      small: evaluated.loadoutSlotContext.small,
    };
  } catch (error) {
    return { label, tallies: [], error: String(error) };
  }
}

async function workerMain(): Promise<void> {
  const port = parentPort!;
  const context = await jobContext((workerData as WorkerSetup).pack);
  port.on("message", (request: { index: number; job: Job }) => {
    void runJob(context, request.job).then((result) =>
      port.postMessage({ index: request.index, result }),
    );
  });
  port.postMessage({ ready: true });
}

const WORKER_MEMORY_BYTES = 1.5 * 1024 ** 3;

/** Runs the jobs on `jobs` workers, each taking the next job when free. */
async function runJobs(
  jobs: readonly Job[],
  setup: WorkerSetup,
  threads: number,
  progress: () => void,
): Promise<JobResult[]> {
  const results: (JobResult | undefined)[] = jobs.map(() => undefined);
  let next = 0;
  const run = (worker: Worker) =>
    new Promise<void>((resolveWorker, rejectWorker) => {
      const send = () => {
        if (next >= jobs.length) {
          resolveWorker();
          return;
        }
        const index = next;
        next += 1;
        worker.postMessage({ index, job: jobs[index] });
      };
      worker.on(
        "message",
        (reply: { ready?: true; index?: number; result?: JobResult }) => {
          if (reply.index !== undefined) {
            results[reply.index] = reply.result;
            progress();
          }
          send();
        },
      );
      worker.on("error", rejectWorker);
      worker.on("exit", (code) => {
        if (code !== 0) rejectWorker(new Error(`worker exited with ${code}`));
      });
    });
  const workers = Array.from(
    { length: Math.max(1, Math.min(threads, jobs.length)) },
    () => new Worker(new URL(import.meta.url), { workerData: setup }),
  );
  try {
    await Promise.all(workers.map(run));
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  return results.map(
    (result, index) =>
      result ?? { label: String(index), tallies: [], error: "no result" },
  );
}

/** The pack-satisfiability of each term of a requires expression. */
function unsatisfiableTerms(
  expression: RequiresExpression,
  context: ExpressionContext,
): string[] {
  switch (expression.kind) {
    case "owned":
      return evaluateRequires(expression, context) ? [] : [expression.token];
    case "category":
      return evaluateRequires(expression, context)
        ? []
        : [
            `${expression.type}:${expression.expression.groups
              .map((group) =>
                group.alternatives
                  .map((term) => `${term.negated ? "!" : ""}${term.value}`)
                  .join("|"),
              )
              .join(",")}`,
          ];
    case "not":
      return unsatisfiableTerms(expression.operand, context);
    case "and":
    case "or":
      return expression.operands.flatMap((operand) =>
        unsatisfiableTerms(operand, context),
      );
  }
}

interface Finding {
  readonly kind: FlagKind;
  readonly operand: string;
  readonly flags: readonly string[];
  readonly detail: string;
  readonly uses: readonly Use[];
  readonly triaged?: string;
}

function triage(finding: Omit<Finding, "triaged">): Finding {
  const entry = TRIAGED.find(
    (candidate) =>
      candidate.kind === finding.kind &&
      (typeof candidate.operand === "string"
        ? key(candidate.operand) === key(finding.operand)
        : candidate.operand.test(finding.operand)) &&
      (candidate.flags === undefined ||
        finding.flags.every((flag) => candidate.flags!.includes(flag))),
  );
  return entry === undefined ? finding : { ...finding, triaged: entry.reason };
}

const describe = (tally: Tally | undefined) =>
  tally === undefined
    ? "never evaluated"
    : `natural ${tally.natural.true}T/${tally.natural.false}F, broadcast ${tally.broadcast.true}T/${tally.broadcast.false}F`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const pack = option("--pack") ?? "tmp/content/full-local.4ecp";
  const withProbes = !args.includes("--no-probes");
  const threads = Number(
    option("--jobs") ??
      Math.max(
        1,
        Math.min(
          availableParallelism(),
          Math.floor(process.availableMemory() / WORKER_MEMORY_BYTES),
        ),
      ),
  );
  const entities = await loadPackEntities(pack);
  const index = sharedRulesIndex(entities);
  const found = inventory(entities);
  const requiresExpressions = [...found.requires.values()].map((entry) => ({
    operand: entry.operand,
    expression: parseRequires(entry.operand),
  }));
  const tallies = new Map<string, Tally>();
  let failures = 0;
  const merge = (results: readonly JobResult[]) => {
    for (const result of results) {
      if (result.error !== undefined) {
        failures += 1;
        console.error(`${result.label}: ${result.error}`);
      }
      for (const [
        id,
        naturalTrue,
        naturalFalse,
        broadTrue,
        broadFalse,
      ] of result.tallies) {
        const tally = push(tallies, id, newTally);
        tally.natural.true += naturalTrue;
        tally.natural.false += naturalFalse;
        tally.broadcast.true += broadTrue;
        tally.broadcast.false += broadFalse;
        if (naturalTrue + broadTrue > 0 && tally.characters.size < 5)
          tally.characters.add(result.label);
      }
    }
  };
  const tick = () => process.stderr.write(".");

  const files = await sampleFiles(args);
  const samples = await runJobs(
    files.map((file) => ({ kind: "sample", file })),
    { pack },
    threads,
    tick,
  );
  merge(samples);
  process.stderr.write(`\n${files.length} characters\n`);

  let probeCount = 0;
  if (withProbes) {
    // The lowest-level Medium and Small samples carry the probes.
    const byLevel = samples
      .map((result, at) => ({ result, file: files[at]! }))
      .filter(({ result }) => result.error === undefined)
      .sort((a, b) => (a.result.level ?? 0) - (b.result.level ?? 0));
    const bases = [
      byLevel.find(({ result }) => result.small !== true),
      byLevel.find(({ result }) => result.small === true),
    ].flatMap((base) => (base === undefined ? [] : [base.file]));
    const count = probes(entities, nameSelectors(found)).length;
    const jobs: Job[] = bases.flatMap((base) =>
      Array.from({ length: count }, (_, probe) => ({
        kind: "probe" as const,
        base,
        probe,
      })),
    );
    let done = 0;
    const results = await runJobs(jobs, { pack }, threads, () => {
      done += 1;
      if (done % 50 === 0) tick();
    });
    merge(results);
    probeCount = results.filter((result) => result.error === undefined).length;
    process.stderr.write(`\n${probeCount} probes on ${bases.join(", ")}\n`);
  }

  // -------------------------------------------------------------------------
  const tally = (kind: ConditionKind, operand: string) =>
    tallies.get(tallyKey(kind, operand));
  const findings: Finding[] = [];
  const both = (value: Tally | undefined) => ({
    true: (value?.natural.true ?? 0) + (value?.broadcast.true ?? 0),
    false: (value?.natural.false ?? 0) + (value?.broadcast.false ?? 0),
  });

  for (const { operand, uses } of found.selectors.values()) {
    const value = tally("selector", operand);
    const counts = both(value);
    const branch = equipmentSelectorBranch(operand);
    const flags = [
      ...(branch === "unrecognized" ? ["unrecognized"] : []),
      ...(counts.true === 0 ? ["never-true"] : []),
      ...(counts.false === 0 ? ["never-false"] : []),
    ];
    if (flags.length > 0)
      findings.push(
        triage({
          kind: "selector",
          operand,
          flags,
          detail: `branch ${branch}; ${describe(value)}`,
          uses,
        }),
      );
  }

  // Requires: each term against the whole pack as if owned at level 30.
  const everything: ExpressionContext = {
    owned: entities,
    level: 30,
    categoryAliases: index.categoryAliases,
    categoryValuesFor: (entity) => index.categoryValues(entity),
  };
  let requiresNaturalTrue = 0;
  let requiresReached = 0;
  for (const { operand, expression } of requiresExpressions) {
    const value = tally("requires", operand);
    if ((value?.natural.true ?? 0) + (value?.natural.false ?? 0) > 0)
      requiresReached += 1;
    if ((value?.natural.true ?? 0) > 0) requiresNaturalTrue += 1;
    const terms = unsatisfiableTerms(expression, everything);
    if (terms.length > 0)
      findings.push(
        triage({
          kind: "requires",
          operand,
          flags: ["unsatisfiable-term"],
          detail: `terms no record meets: ${terms.join("; ")}; ${describe(value)}`,
          uses: found.requires.get(key(operand))?.uses ?? [],
        }),
      );
  }

  for (const [id, { kind, uses }] of found.gated) {
    const operand = id.slice(kind.length + 1);
    const value = tally(kind, operand);
    if (value === undefined) continue;
    const flags = [
      ...(value.natural.true === 0 ? ["never-true"] : []),
      ...(value.natural.false === 0 ? ["never-false"] : []),
    ];
    if (flags.length > 0 && value.natural.true + value.natural.false > 0)
      findings.push(
        triage({ kind, operand, flags, detail: describe(value), uses }),
      );
  }

  for (const [operand, uses] of found.statmins) {
    const [record, stat, minimum] = operand.split("|");
    const value = tally("statmin", `${record}|${stat}|${minimum}`);
    if (value === undefined) continue;
    const flags = [
      ...(value.natural.true === 0 ? ["never-true"] : []),
      ...(value.natural.false === 0 ? ["never-false"] : []),
    ];
    if (flags.length > 0)
      findings.push(
        triage({
          kind: "statmin",
          operand,
          flags,
          detail: describe(value),
          uses,
        }),
      );
  }

  for (const { operand, uses } of found.links.values()) {
    const value = tally("statlink", operand);
    if (found.statNames.has(key(operand)) || (value?.natural.true ?? 0) > 0)
      continue;
    findings.push(
      triage({
        kind: "statlink",
        operand,
        flags: ["undefined-stat"],
        detail: `no statadd defines it; ${describe(value)}`,
        uses,
      }),
    );
  }

  // Select filters: the candidates of the select's type the filter admits.
  const byType = new Map<string, ContentEntity[]>();
  for (const entity of entities)
    push(byType, key(entity.type), () => []).push(entity);
  for (const { type, category, uses } of found.selects.values()) {
    const expression = parseCategoryExpression(category);
    const candidates = byType.get(key(type)) ?? [];
    const admitted = candidates.filter((candidate) =>
      matchesCategory(candidate, expression, everything),
    ).length;
    const value = tally("select-category", `${type}|${category}`);
    if (admitted === 0 && (value?.natural.true ?? 0) === 0)
      findings.push(
        triage({
          kind: "select-category",
          operand: `${type}|${category}`,
          flags: ["no-candidate"],
          detail: `${candidates.length} ${type} records, none admitted; ${describe(value)}`,
          uses,
        }),
      );
  }

  for (const { operand, uses } of found.selectRefs.values())
    if (!found.selectNames.has(key(operand)))
      findings.push(
        triage({
          kind: "select-ref",
          operand,
          flags: ["no-such-select"],
          detail: "no select statement has this name",
          uses,
        }),
      );

  for (const { name, type, uses } of found.modifyTargets.values())
    if (index.find(name, type) === undefined && index.find(name) === undefined)
      findings.push(
        triage({
          kind: "modify-target",
          operand: type === undefined ? name : `${name} (${type})`,
          flags: ["unresolved"],
          detail: "no record has this name or ID",
          uses,
        }),
      );

  for (const [operand, uses] of found.attributes)
    findings.push(
      triage({
        kind: "attribute",
        operand,
        flags: ["unread"],
        detail: "the rule parser does not read this attribute",
        uses,
      }),
    );

  // -------------------------------------------------------------------------
  const selectorCounts = [...found.selectors.values()].map(({ operand }) =>
    both(tally("selector", operand)),
  );
  const coverage = {
    characters: files.length,
    probes: probeCount,
    failures,
    selectors: {
      distinct: found.selectors.size,
      true: selectorCounts.filter((value) => value.true > 0).length,
      false: selectorCounts.filter((value) => value.false > 0).length,
      both: selectorCounts.filter((value) => value.true > 0 && value.false > 0)
        .length,
    },
    requires: {
      distinct: found.requires.size,
      reachedOnSamples: requiresReached,
      trueOnSamples: requiresNaturalTrue,
      broadcastTrue: requiresExpressions.filter(
        ({ operand }) => (tally("requires", operand)?.broadcast.true ?? 0) > 0,
      ).length,
    },
    gated: {
      distinct: found.gated.size,
      reached: [...found.gated].filter(([id, { kind }]) =>
        tally(kind, id.slice(kind.length + 1)),
      ).length,
    },
    statmin: {
      distinct: found.statmins.size,
      reached: [...found.statmins.keys()].filter((operand) =>
        tally("statmin", operand),
      ).length,
    },
    statlinks: found.links.size,
    selects: found.selects.size,
    selectRefs: found.selectRefs.size,
    modifyTargets: found.modifyTargets.size,
  };
  const open = findings.filter((finding) => finding.triaged === undefined);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    join(OUTPUT_DIR, "report.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        pack,
        coverage,
        findings,
        selectors: [...found.selectors.values()].map(({ operand, uses }) => {
          const value = tally("selector", operand);
          return {
            operand,
            branch: equipmentSelectorBranch(operand),
            natural: value?.natural,
            broadcast: value?.broadcast,
            trueFor: [...(value?.characters ?? [])].slice(0, 5),
            uses: uses.length,
          };
        }),
      },
      null,
      2,
    )}\n`,
  );
  const lines = [
    "# Condition coverage audit",
    "",
    "```json",
    JSON.stringify(coverage, null, 2),
    "```",
    "",
    ...(["open", "triaged"] as const).flatMap((group) => [
      `## ${group === "open" ? "Open" : "Triaged"} findings`,
      "",
      ...findings
        .filter((finding) =>
          group === "open"
            ? finding.triaged === undefined
            : finding.triaged !== undefined,
        )
        .map(
          (finding) =>
            `- **${finding.kind}** \`${finding.operand}\` [${finding.flags.join(", ")}] ${finding.detail}; ${finding.uses.length} uses (${finding.uses
              .slice(0, 3)
              .map((use) => use.record)
              .join(
                "; ",
              )})${finding.triaged === undefined ? "" : ` — ${finding.triaged}`}`,
        ),
      "",
    ]),
  ];
  await writeFile(join(OUTPUT_DIR, "report.md"), `${lines.join("\n")}\n`);
  console.log(JSON.stringify(coverage, null, 2));
  const byKind = new Map<string, number>();
  for (const finding of open)
    byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  console.log(
    `${findings.length} findings, ${open.length} open (${[...byKind]
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ")}); see ${OUTPUT_DIR}/report.md`,
  );
  if (open.length > 0 || failures > 0) process.exitCode = 1;
}

if (isMainThread) await main();
else await workerMain();
