/**
 * Private generated-character coverage matrix (docs/coverage-audit-proposal.md,
 * steps 3 and 4). Builds deterministic native characters that together take
 * every Class, Hybrid Class, Race, Theme, Paragon Path and Epic Destiny the
 * pack lets them, and checks at each snapshot level that every active
 * occurrence reaches a sheet surface, which evaluation errors remain, and
 * which `select` rules were offered and fillable. Reports stay ignored.
 *
 *   pnpm audit:coverage-matrix [PACK.4ecp] [--levels=1,11,21,30] [--limit=N]
 *     [--only=LINE,...]
 *     [--out=DIR]
 *
 * Main lines rotate classes (then hybrid pairs), races and themes, and are
 * built through the highest snapshot level. Paragon paths and epic destinies a
 * line did not take are covered by forking an eligible line's level-10 (or
 * level-20) build into level 11 (or 21); forks are snapshotted only there.
 * Every choice, optional ones included, takes the first eligible candidate,
 * preferring definitions no earlier character has had.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CharacterTransaction,
  newNativeCharacterRecord,
  type BuildOccurrence,
  type CharacterBuild,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  commandForEvaluatedChoice,
  evaluatePrerequisite,
  parseRules,
  type EngineDiagnostic,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

import { legacyChoiceSection } from "../apps/web/src/builder-ui";
import { contentTypeCoverage } from "../apps/web/src/content-type-coverage";
import {
  ChoiceReachability,
  choiceRuleKey,
  mergeTallies,
  type ChoiceReach,
  groupCounts,
  registryFindings,
  sheetPresence,
  tallyPresence,
  type OccurrencePresence,
  type TypePresenceTally,
} from "../apps/web/src/sheet-coverage";
import {
  assertNoRemovedOccurrences,
  candidateFor,
  evaluate,
  key,
  levelDefinition,
  loadPack,
  occurrenceFor,
  prerequisiteContextFor,
  replacementCommand,
  type CandidatePreference,
} from "./native-character";

const ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;
const ABILITY_SCORES = [18, 16, 14, 12, 11, 10];
const HYBRID_CLASS_ID = "id_internal_class_hybrid";
const MAX_ITERATIONS_PER_LEVEL = 256;

interface Args {
  readonly packPath: string;
  readonly outDir: string;
  readonly levels: readonly number[];
  readonly limit: number | undefined;
  /** Parallel worker processes; results depend on it, so it has a fixed default. */
  readonly jobs: number;
  /** 1-based main-line numbers to run alone (for debugging one line). */
  readonly only: readonly number[] | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const option = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const levels = (option("levels") ?? "1,11,21,30")
    .split(",")
    .map(Number)
    .toSorted((a, b) => a - b);
  if (
    levels.some((level) => !Number.isInteger(level) || level < 1 || level > 30)
  )
    throw new Error("--levels must list integers from 1 through 30");
  const limitText = option("limit");
  const limit = limitText === undefined ? undefined : Number(limitText);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
    throw new Error("--limit must be a positive integer");
  return {
    packPath: resolve(
      argv.find((arg) => !arg.startsWith("--")) ??
        "tmp/content/full-local.4ecp",
    ),
    outDir: resolve(option("out") ?? "tmp/coverage-matrix"),
    levels: [...new Set(levels)],
    limit,
    only: option("only")?.split(",").map(Number),
    jobs: Number(option("jobs") ?? 4),
  };
}

/** One generated character's plan. */
interface Plan {
  readonly label: string;
  /** Definitions this character prefers over every other candidate. */
  readonly preferred: readonly string[];
  readonly abilities: Readonly<Record<string, number>>;
}

interface Snapshot {
  readonly character: string;
  readonly level: number;
  readonly identity: Readonly<Record<string, string>>;
  readonly complete: boolean;
  readonly legal: boolean;
  readonly occurrences: number;
  readonly unpresented: number;
  readonly errors: number;
  /** Required choices the audit could not fill (each also a choice.required error). */
  readonly unfilledChoices: number;
}

interface ErrorRecord {
  readonly character: string;
  readonly level: number;
  readonly code: string;
  readonly message: string;
  readonly provider: string;
}

interface UnpresentedRecord {
  readonly character: string;
  readonly level: number;
  readonly row: OccurrencePresence;
  /** For powers: whether the evaluation produced the power at all. */
  readonly note?: string;
}

interface AuditProblem {
  readonly character: string;
  readonly level: number;
  readonly kind: string;
  readonly detail: string;
}

/** Key abilities in the order a class card lists them. */
function keyAbilities(classes: readonly ContentEntity[]): string[] {
  const named = classes.flatMap(
    (entity) =>
      entity.specifics
        .find((specific) => key(specific.name) === "key abilities")
        ?.value.split(/[,;]|\band\b/)
        .map((part) => part.trim())
        .filter((part): part is (typeof ABILITIES)[number] =>
          (ABILITIES as readonly string[]).includes(part),
        ) ?? [],
  );
  return [...new Set([...named, ...ABILITIES])];
}

function abilitiesFor(classes: readonly ContentEntity[]) {
  return Object.fromEntries(
    keyAbilities(classes).map((ability, index) => [
      ability,
      ABILITY_SCORES[index] ?? 10,
    ]),
  );
}

function byName(left: ContentEntity, right: ContentEntity): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

class MatrixRun {
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly covered = new Set<string>();
  readonly reachability = new ChoiceReachability();
  readonly snapshots: Snapshot[] = [];
  readonly errors: ErrorRecord[] = [];
  readonly unpresented: UnpresentedRecord[] = [];
  readonly problems: AuditProblem[] = [];
  readonly tallies = new Map<string, TypePresenceTally>();
  /** Eligible paragon paths (11) and epic destinies (21) per main line. */
  readonly eligibleAt = new Map<number, Map<string, Set<string>>>();
  readonly weapons: readonly ContentEntity[];
  readonly armors: readonly ContentEntity[];
  readonly magicItems: readonly ContentEntity[];
  readonly rituals: readonly ContentEntity[];
  evaluations = 0;

  problem(problem: AuditProblem): void {
    this.problems.push(problem);
    process.stderr.write(
      `  ${problem.kind} at level ${problem.level}: ${problem.detail.slice(0, 200)}\n`,
    );
  }

  constructor(
    entities: readonly ContentEntity[],
    readonly record: CharacterRecord,
  ) {
    this.entities = entities;
    this.byId = new Map(entities.map((entity) => [key(entity.id), entity]));
    const ofType = (type: string) =>
      entities
        .filter((entity) => key(entity.type) === type)
        .toSorted((a, b) => a.id.localeCompare(b.id));
    this.weapons = ofType("weapon");
    this.armors = ofType("armor");
    this.magicItems = ofType("magic item");
    this.rituals = ofType("ritual");
  }

  /**
   * With a level, candidates are detailed only for that level's choices and
   * the listed replacement choices, and powers are skipped; without one, the
   * evaluation is the sheet's.
   */
  evaluate(
    build: CharacterBuild,
    level: number | undefined,
    replacementChoiceIds: readonly string[] = [],
  ) {
    this.evaluations += 1;
    return evaluate(
      build,
      this.entities,
      level === undefined
        ? { candidateDetailLevels: [] }
        : {
            candidateDetailLevels: [level],
            candidateDetailReplacementChoiceIds: replacementChoiceIds,
            includePowers: false,
          },
    );
  }

  providerDefinition(
    evaluation: EvaluatedCharacter,
    occurrenceId: string | undefined,
  ): ContentEntity | undefined {
    if (occurrenceId === undefined) return undefined;
    const occurrence = evaluation.occurrences.find(
      ({ id }) => id === occurrenceId,
    );
    return occurrence === undefined
      ? undefined
      : this.byId.get(key(occurrence.definitionId));
  }

  /** Eligible candidates the audit would also accept (prerequisite not failed). */
  pickable(choice: EvaluatedChoice, evaluation: EvaluatedCharacter): string[] {
    const context = prerequisiteContextFor(evaluation, this.byId);
    return choice.candidates.flatMap((candidate) => {
      if (!candidate.eligible) return [];
      const entity = this.byId.get(key(candidate.definitionId));
      if (entity === undefined) return [];
      return evaluatePrerequisite(entity.prerequisites, context).status ===
        "failed"
        ? []
        : [entity.id];
    });
  }
}

interface CharacterState {
  transaction: CharacterTransaction;
  /** Picks whose evaluation did not converge; never picked again. */
  readonly poisoned: Set<string>;
  serial: number;
  /** Optional choices already attempted once. */
  readonly attempted: Set<string>;
  /** Per choice id: rule key, best eligible count, and whether fillable. */
  readonly offers: Map<
    string,
    { ruleKey: string; eligible: number; fillable: boolean }
  >;
}

function newState(build: CharacterBuild, serial: number): CharacterState {
  return {
    transaction: new CharacterTransaction(build),
    poisoned: new Set(),
    serial,
    attempted: new Set(),
    offers: new Map(),
  };
}

/** Resolves every open choice at `level`; returns the choices left unfilled. */
function resolveLevel(
  run: MatrixRun,
  state: CharacterState,
  level: number,
  preference: CandidatePreference,
  character: string,
  lineIndex: number | undefined,
): EvaluatedChoice[] {
  // Offers of this level; only choices still offered when the level settles
  // count (an early pass can offer a choice the class later removes).
  const offers = new Map<
    string,
    { ruleKey: string; eligible: number; fillable: boolean }
  >();
  const settle = (current: EvaluatedChoice[], unfilled: EvaluatedChoice[]) => {
    const offered = new Set(current.map(({ id }) => id));
    for (const [id, offer] of offers)
      if (offered.has(id)) state.offers.set(`${level}:${id}`, offer);
    return unfilled;
  };
  // Required replacements whose candidate lists are evaluated; costly, so
  // only while this level resolves them.
  const openReplacements = new Set<string>();
  let last: EvaluatedChoice[] = [];
  let unfilled: EvaluatedChoice[] = [];
  // The last batch of picks, undone if its evaluation fails to converge: a
  // failed batch is retried one pick at a time to find the culprit.
  let batch:
    { start: CharacterBuild; picks: string[]; attempted: string[] } | undefined;
  let singleStep = false;
  // Choices whose resolution removed earlier picks; retrying them oscillates.
  const unstable = new Set<string>();
  for (
    let iteration = 0;
    iteration < MAX_ITERATIONS_PER_LEVEL;
    iteration += 1
  ) {
    let current: EvaluatedCharacter;
    try {
      current = run.evaluate(state.transaction.current, level, [
        ...openReplacements,
      ]);
    } catch (error) {
      if (batch === undefined || batch.picks.length === 0) throw error;
      state.transaction = new CharacterTransaction(batch.start);
      batch.attempted.forEach((id) => state.attempted.delete(id));
      if (batch.picks.length === 1) {
        state.poisoned.add(key(batch.picks[0]!));
        run.problem({
          character,
          level,
          kind: "nonconvergent-pick",
          detail: `${batch.picks[0]!}: ${(error as Error).message}`,
        });
      }
      singleStep = true;
      batch = undefined;
      continue;
    }
    batch = undefined;
    last = [...current.choices];
    for (const occurrence of current.occurrences)
      run.covered.add(key(occurrence.definitionId));
    for (const choice of current.choices) {
      if (choice.level !== level) continue;
      const provider = run.providerDefinition(
        current,
        choice.providerOccurrenceId,
      );
      if (provider === undefined) continue;
      const destiny =
        lineIndex !== undefined &&
        (key(choice.type) === "paragon path" ||
          key(choice.type) === "epic destiny");
      const offer = offers.get(choice.id) ?? {
        ruleKey: choiceRuleKey(provider.id, choice.ruleOrdinal),
        eligible: 0,
        fillable: false,
      };
      offer.eligible = Math.max(
        offer.eligible,
        choice.candidates.filter(({ eligible }) => eligible).length,
      );
      offers.set(choice.id, offer);
      // Prerequisite checks are costly; skip them once an offer is fillable.
      if (offer.fillable && !destiny) continue;
      const pickable = run.pickable(choice, current);
      offer.fillable ||=
        choice.selectedOccurrenceId !== undefined ||
        pickable.length > 0 ||
        (choice.replacementOptions ?? []).some((option) =>
          option.candidates.some(({ eligible }) => eligible),
        );
      if (destiny) {
        const byLine = run.eligibleAt.get(level) ?? new Map();
        const ids = byLine.get(String(lineIndex)) ?? new Set<string>();
        pickable.forEach((id) => ids.add(key(id)));
        byLine.set(String(lineIndex), ids);
        run.eligibleAt.set(level, byLine);
      }
    }
    const pending = current.choices.filter(
      (choice) =>
        choice.selectedOccurrenceId === undefined &&
        !unstable.has(choice.id) &&
        (!choice.optional ||
          (key(choice.type) !== "replacement" &&
            !state.attempted.has(choice.id))),
    );
    unfilled = pending.filter((choice) => !choice.optional);
    if (pending.length === 0) return settle(last, []);
    // Required replacements list their candidates only once opened.
    const closed = unfilled.filter(
      (choice) =>
        key(choice.type) === "replacement" && !openReplacements.has(choice.id),
    );
    if (closed.length > 0) {
      closed.forEach(({ id }) => openReplacements.add(id));
      continue;
    }
    const excluded = new Set<string>(state.poisoned);
    let dispatched = 0;
    const thisBatch = {
      start: state.transaction.current,
      picks: [] as string[],
      attempted: [] as string[],
    };
    batch = thisBatch;
    for (const choice of pending) {
      if (singleStep && dispatched > 0) break;
      if (choice.optional && !state.attempted.has(choice.id)) {
        state.attempted.add(choice.id);
        thisBatch.attempted.push(choice.id);
      }
      const choicePreference = { ...preference, excluded };
      try {
        const before = state.transaction.current;
        if (key(choice.type) === "replacement") {
          const replacement = replacementCommand(
            before,
            choice,
            run.entities,
            run.byId,
            current,
            choicePreference,
            state.serial,
          );
          if (replacement === undefined) continue;
          excluded.add(key(replacement.definitionId));
          state.serial += 1;
          state.transaction.dispatch(replacement.command);
          thisBatch.picks.push(replacement.definitionId);
        } else {
          const definition = candidateFor(
            choice,
            run.byId,
            current,
            choicePreference,
          );
          if (definition === undefined) continue;
          excluded.add(key(definition.id));
          const provider = current.occurrences.find(
            (occurrence) => occurrence.id === choice.providerOccurrenceId,
          );
          const selected = occurrenceFor(
            definition,
            provider?.acquiredLevel ?? level,
            state.serial++,
          );
          const command = commandForEvaluatedChoice(
            before,
            choice,
            current.occurrences,
            run.entities,
            selected,
            () => `audit:placeholder:${state.serial++}`,
          );
          if (command === undefined) {
            run.problem({
              character,
              level,
              kind: "unmaterializable-choice",
              detail: `${choice.type} ${choice.id}`,
            });
            continue;
          }
          state.transaction.dispatch(command);
          thisBatch.picks.push(definition.id);
        }
        dispatched += 1;
        try {
          assertNoRemovedOccurrences(
            before,
            state.transaction.current,
            `Resolving ${choice.type} ${choice.id}`,
          );
        } catch (error) {
          unstable.add(choice.id);
          const message = (error as Error).message;
          run.problem({
            character,
            level,
            kind: "removed-occurrences",
            detail:
              message.length > 400 ? `${message.slice(0, 400)}…` : message,
          });
        }
      } catch (error) {
        run.problem({
          character,
          level,
          kind: "dispatch-failed",
          detail: `${choice.type} ${choice.id}: ${(error as Error).message}`,
        });
      }
    }
    if (dispatched === 0) return settle(last, unfilled);
  }
  run.problem({
    character,
    level,
    kind: "iteration-bound",
    detail: `Choice resolution exceeded ${MAX_ITERATIONS_PER_LEVEL} passes`,
  });
  return settle(last, unfilled);
}

function flushOffers(run: MatrixRun, state: CharacterState, character: string) {
  for (const offer of state.offers.values())
    run.reachability.record(
      offer.ruleKey,
      character,
      offer.eligible,
      offer.fillable,
    );
  state.offers.clear();
}

function snapshot(
  run: MatrixRun,
  state: CharacterState,
  level: number,
  character: string,
  unfilled: readonly EvaluatedChoice[],
): void {
  const build = state.transaction.current;
  const evaluation = run.evaluate(build, undefined);
  const sheet = buildEvaluatedSheetModel(
    run.record.snapshot,
    build,
    evaluation,
    run.entities,
  );
  const rows = sheetPresence(evaluation.occurrences, run.byId, sheet);
  tallyPresence(run.tallies, rows);
  const missing = rows.filter(
    (row) =>
      row.status === "unpresented" || row.status === "missing-definition",
  );
  const evaluatedPowers = new Set(
    evaluation.powers.map(({ definitionId }) => key(definitionId)),
  );
  for (const row of missing)
    run.unpresented.push({
      character,
      level,
      row,
      ...(key(row.type) === "power"
        ? {
            note: evaluatedPowers.has(key(row.definitionId))
              ? "evaluated, no card"
              : "not an evaluated power",
          }
        : {}),
    });
  const errors = evaluation.diagnostics.filter(
    (diagnostic: EngineDiagnostic) => diagnostic.severity === "error",
  );
  for (const diagnostic of errors) {
    const provider = run.providerDefinition(
      evaluation,
      diagnostic.occurrenceId,
    );
    run.errors.push({
      character,
      level,
      code: diagnostic.code,
      message: diagnostic.message,
      provider:
        provider === undefined
          ? (diagnostic.occurrenceId ?? "(none)")
          : `${provider.type}: ${provider.name}`,
    });
  }
  run.snapshots.push({
    character,
    level,
    identity: Object.fromEntries(
      sheet.identity
        .filter(({ label }) =>
          ["Race", "Class", "Theme", "ParagonPath", "EpicDestiny"].includes(
            label,
          ),
        )
        .map(({ label, value }) => [label, value]),
    ),
    complete: evaluation.complete,
    legal: evaluation.legal,
    occurrences: evaluation.occurrences.length,
    unpresented: missing.length,
    errors: errors.length,
    unfilledChoices: unfilled.length,
  });
}

function addLevel(run: MatrixRun, state: CharacterState, level: number) {
  const definition = levelDefinition(run.entities, level);
  state.transaction.dispatch({
    kind: "add-level",
    frame: { level, root: occurrenceFor(definition, level, state.serial++) },
  });
}

/** One weapon, armor, magic item and ritual per line, rotating through each. */
function equip(run: MatrixRun, state: CharacterState, lineIndex: number) {
  const pick = (values: readonly ContentEntity[], step: number) =>
    values[(lineIndex * step) % Math.max(1, values.length)];
  const items = [
    pick(run.weapons, 7),
    pick(run.armors, 3),
    pick(run.magicItems, 101),
  ].filter((item): item is ContentEntity => item !== undefined);
  // A ritual is a known record, not gear.
  const ritual = pick(run.rituals, 13);
  if (ritual !== undefined)
    state.transaction.dispatch({
      kind: "learn-known",
      entry: {
        id: "audit:known:1",
        acquiredLevel: 1,
        element: {
          definitionId: ritual.id,
          name: ritual.name,
          type: ritual.type,
        },
        acquisition: "free",
      },
      priceCopper: 0,
    });
  items.forEach((item, index) =>
    state.transaction.dispatch({
      kind: "put-inventory",
      entry: {
        id: `audit:inventory:${index + 1}`,
        acquiredLevel: 1,
        quantity: 1,
        equippedQuantity: 1,
        elements: [{ definitionId: item.id, name: item.name, type: item.type }],
        name: item.name,
        showPowerCard: true,
        overrides: {},
        legality: "rules-legal",
      },
    }),
  );
}

/**
 * Main-line plans. `selectable` (from a level-1 probe) drops options no
 * character can take, such as the Unselectable "Any Class"; the axes keep
 * every entity so the report lists those as uncovered.
 */
function linePlans(
  entities: readonly ContentEntity[],
  selectable: (entity: ContentEntity) => boolean,
): { plans: Plan[]; axes: Record<string, ContentEntity[]> } {
  const ofType = (type: string) =>
    entities.filter((entity) => key(entity.type) === type).toSorted(byName);
  const axes = {
    Class: ofType("class").filter(
      (entity) => key(entity.id) !== HYBRID_CLASS_ID,
    ),
    "Hybrid Class": ofType("hybrid class"),
    Race: ofType("race"),
    Theme: ofType("theme"),
    "Paragon Path": ofType("paragon path"),
    "Epic Destiny": ofType("epic destiny"),
  };
  const classes = axes.Class.filter(selectable);
  const hybrids = axes["Hybrid Class"].filter(selectable);
  const races = axes.Race.filter(selectable);
  const themes = axes.Theme.filter(selectable);
  const classSpecs: {
    label: string;
    ids: string[];
    classes: ContentEntity[];
  }[] = classes.map((entity) => ({
    label: entity.name,
    ids: [entity.id],
    classes: [entity],
  }));
  for (const pair of hybridPairs(hybrids)) {
    classSpecs.push({
      label: pair.map(({ name }) => name).join(" / "),
      ids: [HYBRID_CLASS_ID, ...pair.map(({ id }) => id)],
      classes: pair,
    });
  }
  const count = Math.max(classSpecs.length, races.length, themes.length);
  const plans = Array.from({ length: count }, (_, index): Plan => {
    const spec = classSpecs[index % classSpecs.length]!;
    const race = races[index % races.length]!;
    const theme = themes[index % themes.length]!;
    return {
      label: `L${String(index + 1).padStart(3, "0")}`,
      preferred: [...spec.ids, race.id, theme.id],
      abilities: abilitiesFor(spec.classes),
    };
  });
  return { plans, axes };
}

/** Whether either hybrid class's prerequisites rule out the other (Hybrid
 * Blackguard, Hybrid Cavalier and Hybrid Paladin exclude each other). */
function hybridsExclude(left: ContentEntity, right: ContentEntity): boolean {
  const excludes = (entity: ContentEntity, other: ContentEntity) =>
    (entity.prerequisites ?? "")
      .split(/[,;]/)
      .some((part) => key(part) === `!${key(other.id)}`);
  return excludes(left, right) || excludes(right, left);
}

/**
 * Pairs hybrid classes in order, each with the next unpaired class that it
 * can legally combine with; an odd one out pairs with the first compatible
 * class.
 */
function hybridPairs(hybrids: readonly ContentEntity[]): ContentEntity[][] {
  const unpaired = [...hybrids];
  const pairs: ContentEntity[][] = [];
  while (unpaired.length > 0) {
    const first = unpaired.shift()!;
    const index = unpaired.findIndex((other) => !hybridsExclude(first, other));
    const partner =
      index >= 0
        ? unpaired.splice(index, 1)[0]
        : hybrids.find(
            (other) => other !== first && !hybridsExclude(first, other),
          );
    if (partner !== undefined) pairs.push([first, partner]);
  }
  return pairs;
}

/** "Race Class (Theme)" from a build's chosen occurrences. */
function characterName(build: CharacterBuild): string {
  const names = new Map<string, string[]>();
  const visit = (occurrence: BuildOccurrence) => {
    const type = key(occurrence.identity.type ?? "");
    if (["race", "class", "hybrid class", "theme"].includes(type))
      names.set(type, [
        ...(names.get(type) ?? []),
        occurrence.identity.name ?? "?",
      ]);
    occurrence.children.forEach(visit);
  };
  build.levels.forEach((frame) => visit(frame.root));
  const classes = names.get("hybrid class") ??
    names.get("class") ?? ["no class"];
  return `${names.get("race")?.[0] ?? "no race"} ${classes.join("/")} (${names.get("theme")?.[0] ?? "no theme"})`;
}

interface Setup {
  readonly pack: Awaited<ReturnType<typeof loadPack>>;
  readonly entities: readonly ContentEntity[];
  readonly record: CharacterRecord;
  readonly run: MatrixRun;
  readonly plans: readonly Plan[];
  readonly axes: Record<string, ContentEntity[]>;
}

async function setup(packPath: string): Promise<Setup> {
  const pack = await loadPack(packPath);
  const entities = pack.entities;
  const firstLevel = levelDefinition(entities, 1);
  const record = newNativeCharacterRecord(
    "Coverage matrix audit",
    {
      definitionId: firstLevel.id,
      name: firstLevel.name,
      type: firstLevel.type,
    },
    {
      packId: pack.manifest.packId,
      contentDigest: pack.manifest.contentDigest,
    },
    {
      id: "audit:coverage-matrix",
      occurrenceId: "audit:level:1",
      now: "2000-01-01T00:00:00.000Z",
    },
  );
  const run = new MatrixRun(entities, record);
  // Level-1 probe: which classes, races and themes a new character may take.
  const probe = run.evaluate(record.build, 1);
  const probeContext = prerequisiteContextFor(probe, run.byId);
  const probed = new Map(
    probe.choices.flatMap((choice) =>
      choice.candidates.map(
        (candidate) =>
          [key(candidate.definitionId), candidate.eligible] as const,
      ),
    ),
  );
  const { plans, axes } = linePlans(
    entities,
    (entity) =>
      probed.get(key(entity.id)) ??
      evaluatePrerequisite(entity.prerequisites, probeContext).status !==
        "failed",
  );
  return { pack, entities, record, run, plans, axes };
}

/** A build a fork starts from: a main line just before level 11 or 21. */
interface ForkBase {
  readonly lineNumber: number;
  readonly level: number;
  readonly build: CharacterBuild;
  readonly serial: number;
  readonly attempted: readonly string[];
  readonly poisoned: readonly string[];
}

interface ForkTask {
  readonly type: string;
  readonly optionId: string;
  readonly optionName: string;
  readonly lineLabel: string;
  readonly base: ForkBase;
}

interface WorkerTasks {
  readonly packPath: string;
  readonly levels: readonly number[];
  readonly lines: readonly { readonly number: number; readonly plan: Plan }[];
  readonly forks: readonly ForkTask[];
  /** Definitions earlier phases covered, preferred against. */
  readonly covered: readonly string[];
}

interface WorkerResult {
  readonly covered: readonly string[];
  readonly reach: readonly (readonly [string, ChoiceReach])[];
  readonly snapshots: readonly Snapshot[];
  readonly errors: readonly ErrorRecord[];
  readonly unpresented: readonly UnpresentedRecord[];
  readonly problems: readonly AuditProblem[];
  readonly tallies: readonly (readonly [string, TypePresenceTally])[];
  readonly evaluations: number;
  /** Per fork level, per line number: eligible paragon paths / destinies. */
  readonly eligibleAt: readonly (readonly [
    number,
    readonly (readonly [number, readonly string[]])[],
  ])[];
  readonly forkBases: readonly ForkBase[];
  readonly labels: readonly (readonly [number, string])[];
  readonly forks: readonly { type: string; id: string; outcome: string }[];
}

function runLine(
  context: Setup,
  levels: readonly number[],
  lineNumber: number,
  plan: Plan,
  forkBases: ForkBase[],
): string {
  const { run, record } = context;
  const lineStarted = Date.now();
  const maxLevel = levels.at(-1)!;
  const snapshotLevels = new Set(levels);
  const state = newState(record.build, 1);
  for (const [ability, value] of Object.entries(plan.abilities))
    state.transaction.dispatch({ kind: "set-base-ability", ability, value });
  equip(run, state, lineNumber - 1);
  // Drop carried items until the empty character converges; report each
  // item whose removal alone made it converge.
  const converges = () => {
    try {
      run.evaluate(state.transaction.current, 1);
      return true;
    } catch {
      return false;
    }
  };
  const carried = [...state.transaction.current.inventory];
  const drop = (entry: (typeof carried)[number]) => ({
    command: { kind: "remove-inventory" as const, entryId: entry.id },
    definitionId: entry.elements[0]?.definitionId ?? entry.id,
    name: entry.name ?? "",
  });
  // Magic items and rituals first: they carry the most rules.
  const dropOrder = [
    ...carried.slice(2).map(drop),
    ...state.transaction.current.known.map((entry) => ({
      command: { kind: "remove-known" as const, id: entry.id },
      definitionId: entry.element.definitionId ?? entry.id,
      name: entry.element.name,
    })),
    ...carried.slice(0, 2).reverse().map(drop),
  ];
  for (const { command, definitionId, name } of dropOrder) {
    if (converges()) break;
    state.transaction.dispatch(command);
    if (converges())
      run.problem({
        character: plan.label,
        level: 1,
        kind: "nonconvergent-item",
        detail: `${definitionId} (${name}) keeps a level-1 character from converging`,
      });
  }
  const preference: CandidatePreference = {
    preferred: new Set(plan.preferred.map(key)),
    covered: (definitionId) => run.covered.has(key(definitionId)),
  };
  let label = plan.label;
  let level = 1;
  try {
    for (; level <= maxLevel; level += 1) {
      if (level > 1) addLevel(run, state, level);
      const unfilled = resolveLevel(
        run,
        state,
        level,
        preference,
        label,
        lineNumber,
      );
      // Drop undo history; only the current build matters.
      state.transaction = new CharacterTransaction(state.transaction.current);
      if (level === 1)
        label = `${plan.label} ${characterName(state.transaction.current)}`;
      if (snapshotLevels.has(level))
        snapshot(run, state, level, label, unfilled);
      // Keep the builds forks start from (paragon at 11, epic at 21).
      for (const forkLevel of [11, 21])
        if (level === forkLevel - 1 && snapshotLevels.has(forkLevel))
          forkBases.push({
            lineNumber,
            level: forkLevel,
            build: state.transaction.current,
            serial: state.serial,
            attempted: [...state.attempted],
            poisoned: [...state.poisoned],
          });
    }
  } catch (error) {
    run.problem({
      character: label,
      level,
      kind: "character-aborted",
      detail: (error as Error).message,
    });
  }
  flushOffers(run, state, label);
  process.stderr.write(
    `${label}: ${((Date.now() - lineStarted) / 1000).toFixed(1)}s\n`,
  );
  return label;
}

function runFork(context: Setup, task: ForkTask): string {
  const { run } = context;
  const { base } = task;
  const state: CharacterState = {
    transaction: new CharacterTransaction(base.build),
    poisoned: new Set(base.poisoned),
    serial: base.serial,
    attempted: new Set(base.attempted),
    offers: new Map(),
  };
  const label = `${task.lineLabel} → ${task.optionName}`;
  try {
    addLevel(run, state, base.level);
    const unfilled = resolveLevel(
      run,
      state,
      base.level,
      {
        preferred: new Set([key(task.optionId)]),
        covered: (definitionId) => run.covered.has(key(definitionId)),
      },
      label,
      undefined,
    );
    snapshot(run, state, base.level, label, unfilled);
  } catch (error) {
    run.problem({
      character: label,
      level: base.level,
      kind: "character-aborted",
      detail: (error as Error).message,
    });
  }
  flushOffers(run, state, label);
  return run.covered.has(key(task.optionId))
    ? "forked"
    : "fork did not take it";
}

/** Worker mode: run the task file's lines and forks, write the raw results. */
async function worker(taskPath: string, resultPath: string): Promise<void> {
  const tasks = JSON.parse(await readFile(taskPath, "utf8")) as WorkerTasks;
  const context = await setup(tasks.packPath);
  const { run } = context;
  tasks.covered.forEach((id) => run.covered.add(id));
  const forkBases: ForkBase[] = [];
  const labels: [number, string][] = [];
  for (const { number, plan } of tasks.lines)
    labels.push([
      number,
      runLine(context, tasks.levels, number, plan, forkBases),
    ]);
  const forks = tasks.forks.map((task) => ({
    type: task.type,
    id: task.optionId,
    outcome: runFork(context, task),
  }));
  const result: WorkerResult = {
    covered: [...run.covered],
    reach: [...run.reachability.reach],
    snapshots: run.snapshots,
    errors: run.errors,
    unpresented: run.unpresented,
    problems: run.problems,
    tallies: [...run.tallies],
    evaluations: run.evaluations,
    eligibleAt: [...run.eligibleAt].map(([level, byLine]) => [
      level,
      [...byLine].map(([line, ids]) => [Number(line), [...ids]] as const),
    ]),
    forkBases,
    labels,
    forks,
  };
  await writeFile(resultPath, JSON.stringify(result));
}

/** Runs task shards in parallel worker processes. */
async function runWorkers(
  shards: readonly WorkerTasks[],
  directory: string,
  phase: string,
): Promise<WorkerResult[]> {
  await mkdir(directory, { recursive: true });
  return Promise.all(
    shards.map(async (tasks, index) => {
      const taskPath = resolve(directory, `${phase}-${index}.tasks.json`);
      const resultPath = resolve(directory, `${phase}-${index}.result.json`);
      await writeFile(taskPath, JSON.stringify(tasks));
      await new Promise<void>((done, fail) => {
        const child = spawn(
          process.execPath,
          [
            ...process.execArgv,
            process.argv[1]!,
            `--worker=${taskPath}`,
            `--result=${resultPath}`,
          ],
          { stdio: ["ignore", "inherit", "inherit"] },
        );
        child.on("error", fail);
        child.on("exit", (code) =>
          code === 0
            ? done()
            : fail(new Error(`${phase} worker ${index} exited with ${code}`)),
        );
      });
      const result = JSON.parse(
        await readFile(resultPath, "utf8"),
      ) as WorkerResult;
      await rm(taskPath);
      await rm(resultPath);
      return result;
    }),
  );
}

function mergeResults(run: MatrixRun, results: readonly WorkerResult[]) {
  for (const result of results) {
    result.covered.forEach((id) => run.covered.add(id));
    run.reachability.merge(result.reach);
    run.snapshots.push(...result.snapshots);
    run.errors.push(...result.errors);
    run.unpresented.push(...result.unpresented);
    run.problems.push(...result.problems);
    mergeTallies(run.tallies, result.tallies);
    run.evaluations += result.evaluations;
    for (const [level, byLine] of result.eligibleAt) {
      const merged = run.eligibleAt.get(level) ?? new Map();
      for (const [line, ids] of byLine) merged.set(String(line), new Set(ids));
      run.eligibleAt.set(level, merged);
    }
  }
}

/** Round-robin shards, so each worker gets a mix of early and late lines. */
function shard<T>(values: readonly T[], jobs: number): T[][] {
  const shards = Array.from(
    { length: Math.min(jobs, values.length) },
    () => [] as T[],
  );
  values.forEach((value, index) => shards[index % shards.length]!.push(value));
  return shards;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const workerTask = argv.find((arg) => arg.startsWith("--worker="));
  if (workerTask !== undefined) {
    const resultPath = argv
      .find((arg) => arg.startsWith("--result="))
      ?.slice("--result=".length);
    if (resultPath === undefined) throw new Error("--worker needs --result");
    await worker(workerTask.slice("--worker=".length), resultPath);
    return;
  }
  const args = parseArgs(argv);
  const started = Date.now();
  const context = await setup(args.packPath);
  const { pack, entities, run, plans, axes } = context;
  const lines = (
    args.only === undefined
      ? plans.slice(0, args.limit ?? plans.length)
      : plans.filter((_, index) => args.only?.includes(index + 1))
  ).map((plan) => ({ number: Number(plan.label.slice(1)), plan }));
  const workDirectory = resolve(args.outDir, "work");

  // Phase 1: main lines.
  const lineResults = await runWorkers(
    shard(lines, args.jobs).map((shardLines) => ({
      packPath: args.packPath,
      levels: args.levels,
      lines: shardLines,
      forks: [],
      covered: [],
    })),
    workDirectory,
    "lines",
  );
  mergeResults(run, lineResults);
  const labels = new Map(lineResults.flatMap((result) => result.labels));
  const forkBases = lineResults.flatMap((result) => result.forkBases);
  let characters = lines.length;

  // Phase 2: forks for paragon paths and epic destinies no line took.
  const forkResults: { type: string; id: string; outcome: string }[] = [];
  const forkTasks: ForkTask[] = [];
  const covered = (definitionId: string) => run.covered.has(key(definitionId));
  for (const [forkLevel, type] of [
    [11, "Paragon Path"],
    [21, "Epic Destiny"],
  ] as const) {
    const bases = forkBases
      .filter((base) => base.level === forkLevel)
      .toSorted((a, b) => a.lineNumber - b.lineNumber);
    if (bases.length === 0) continue;
    const eligible = run.eligibleAt.get(forkLevel) ?? new Map();
    for (const option of axes[type] ?? []) {
      if (covered(option.id)) continue;
      const base = bases.find((candidate) =>
        eligible.get(String(candidate.lineNumber))?.has(key(option.id)),
      );
      if (base === undefined) {
        forkResults.push({ type, id: option.id, outcome: "never eligible" });
        continue;
      }
      if (args.limit !== undefined && characters >= args.limit) {
        forkResults.push({ type, id: option.id, outcome: "over --limit" });
        continue;
      }
      characters += 1;
      forkTasks.push({
        type,
        optionId: option.id,
        optionName: option.name,
        lineLabel: labels.get(base.lineNumber) ?? `L${base.lineNumber}`,
        base,
      });
    }
  }
  if (forkTasks.length > 0) {
    const results = await runWorkers(
      shard(forkTasks, args.jobs).map((shardForks) => ({
        packPath: args.packPath,
        levels: args.levels,
        lines: [],
        forks: shardForks,
        covered: [...run.covered],
      })),
      workDirectory,
      "forks",
    );
    mergeResults(run, results);
    forkResults.push(...results.flatMap((result) => result.forks));
  }
  await rm(workDirectory, { recursive: true, force: true });
  // Deterministic order whatever the sharding.
  const byCharacter = (
    a: { character: string; level: number },
    b: { character: string; level: number },
  ) => a.character.localeCompare(b.character) || a.level - b.level;
  run.snapshots.sort(byCharacter);
  run.errors.sort(byCharacter);
  run.unpresented.sort(byCharacter);
  run.problems.sort(byCharacter);
  const runtimeSeconds = (Date.now() - started) / 1000;

  // Choice reachability over every select rule in the content.
  const choices = entities.flatMap((entity) =>
    parseRules(entity.id, entity.rules).flatMap((rule) =>
      rule.kind === "select"
        ? [
            {
              ruleKey: choiceRuleKey(entity.id, rule.source.ordinal),
              provider: `${entity.type}: ${entity.name}`,
              providerId: entity.id,
              type: rule.type,
              category: rule.category,
              name: rule.name,
              optional: rule.optional,
              section: legacyChoiceSection({
                type: rule.type,
                ...(rule.spellbook === undefined
                  ? {}
                  : { spellbook: rule.spellbook }),
              } as EvaluatedChoice),
              reach: run.reachability.get(
                choiceRuleKey(entity.id, rule.source.ordinal),
              ),
            },
          ]
        : [],
    ),
  );
  const offered = choices.filter((choice) => choice.reach !== undefined);
  const neverFillable = offered.filter(
    (choice) => (choice.reach?.fillable ?? 0) === 0,
  );
  const otherSection = choices.filter((choice) => choice.section === "Other");

  const axisCoverage = Object.fromEntries(
    Object.entries(axes).map(([type, options]) => [
      type,
      {
        total: options.length,
        covered: options.filter((option) => covered(option.id)).length,
        uncovered: options
          .filter((option) => !covered(option.id))
          .map((option) => `${option.name} (${option.id})`),
      },
    ]),
  );
  const unpresentedByType = groupCounts(
    run.unpresented,
    ({ row }) =>
      row.status === "missing-definition" ? "(missing definition)" : row.type,
    3,
  );
  const unpresentedByProvider = groupCounts(
    run.unpresented,
    ({ row }) =>
      `${row.type || "(missing definition)"} ← ${row.provider === undefined ? "(root)" : `${row.provider.type}: ${row.provider.name}`}`,
    3,
  );
  const errorsByCode = groupCounts(run.errors, ({ code }) => code, 3);
  const errorsByProvider = groupCounts(
    run.errors,
    ({ code, provider }) => `${code} ← ${provider}`,
    3,
  );
  const registry = registryFindings(run.tallies);
  const problemsByKind = groupCounts(run.problems, ({ kind }) => kind, 5);

  const report = {
    pack: {
      path: args.packPath,
      packId: pack.manifest.packId,
      contentDigest: pack.manifest.contentDigest,
      records: entities.length,
    },
    request: { levels: args.levels, limit: args.limit },
    runtimeSeconds,
    evaluations: run.evaluations,
    characters,
    lines: lines.length,
    snapshots: run.snapshots,
    axisCoverage,
    forks: forkResults,
    unpresentedByType: unpresentedByType.map((group) => ({
      type: group.key,
      count: group.count,
      characters: new Set(
        run.unpresented
          .filter(
            ({ row }) => (row.type || "(missing definition)") === group.key,
          )
          .map(({ character }) => character),
      ).size,
      definitions: new Set(
        run.unpresented
          .filter(
            ({ row }) => (row.type || "(missing definition)") === group.key,
          )
          .map(({ row }) => row.definitionId),
      ).size,
      registry: contentTypeCoverage(group.key),
      notes: Object.fromEntries(
        groupCounts(
          run.unpresented.filter(
            ({ row, note }) =>
              note !== undefined &&
              (row.type || "(missing definition)") === group.key,
          ),
          ({ note }) => note ?? "",
        ).map(({ key: note, count }) => [note, count]),
      ),
      examples: group.examples.map(
        ({ character, level, row, note }) =>
          `${row.name} (${row.definitionId}${note === undefined ? "" : `, ${note}`}) — ${character} @${level}`,
      ),
    })),
    unpresentedByProvider: unpresentedByProvider.map((group) => ({
      key: group.key,
      count: group.count,
      examples: group.examples.map(
        ({ character, level, row }) => `${row.name} — ${character} @${level}`,
      ),
    })),
    errorsByCode: errorsByCode.map((group) => ({
      code: group.key,
      count: group.count,
      characters: new Set(
        run.errors
          .filter(({ code }) => code === group.key)
          .map(({ character }) => character),
      ).size,
      examples: group.examples,
    })),
    errorsByProvider: errorsByProvider.map((group) => ({
      key: group.key,
      count: group.count,
      examples: group.examples.map(
        ({ character, level, message }) =>
          `${message} — ${character} @${level}`,
      ),
    })),
    registry,
    typeTallies: Object.fromEntries(
      [...run.tallies].sort(([a], [b]) => a.localeCompare(b)),
    ),
    choices: {
      selectRules: choices.length,
      offered: offered.length,
      neverOffered: choices.length - offered.length,
      neverFillable: neverFillable.map(({ reach, ...choice }) => ({
        ...choice,
        offers: reach?.offered,
        examples: reach?.examples,
      })),
      otherSection: otherSection.map(({ reach, ...choice }) => ({
        ...choice,
        offered: reach !== undefined,
      })),
      neverOfferedByType: groupCounts(
        choices.filter((choice) => choice.reach === undefined),
        (choice) => choice.type,
        3,
      ).map((group) => ({
        type: group.key,
        count: group.count,
        examples: group.examples.map(
          (choice) =>
            `${choice.provider}${choice.category === undefined ? "" : ` [${choice.category}]`}`,
        ),
      })),
    },
    auditProblems: problemsByKind.map((group) => ({
      kind: group.key,
      count: group.count,
      examples: group.examples,
    })),
  };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(
    resolve(args.outDir, "coverage-matrix.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    resolve(args.outDir, "coverage-matrix.md"),
    markdownReport(report),
  );
  console.log(
    `${characters} characters (${lines.length} lines), ${run.snapshots.length} sheets, ` +
      `${run.evaluations} evaluations in ${runtimeSeconds.toFixed(0)}s. ` +
      `${run.unpresented.length} unpresented, ${run.errors.length} errors, ` +
      `${neverFillable.length} never-fillable choices. Reports in ${args.outDir}.`,
  );
}

type Report = {
  readonly pack: { path: string; contentDigest: string; packId: string };
  readonly request: { levels: readonly number[]; limit: number | undefined };
  readonly runtimeSeconds: number;
  readonly characters: number;
  readonly lines: number;
  readonly snapshots: readonly Snapshot[];
  readonly axisCoverage: Record<
    string,
    { total: number; covered: number; uncovered: string[] }
  >;
  readonly forks: readonly { type: string; id: string; outcome: string }[];
  readonly unpresentedByType: readonly {
    type: string;
    count: number;
    characters: number;
    definitions: number;
    registry: ReturnType<typeof contentTypeCoverage>;
    notes: Readonly<Record<string, number>>;
    examples: readonly string[];
  }[];
  readonly unpresentedByProvider: readonly {
    key: string;
    count: number;
    examples: readonly string[];
  }[];
  readonly errorsByCode: readonly {
    code: string;
    count: number;
    characters: number;
    examples: readonly ErrorRecord[];
  }[];
  readonly errorsByProvider: readonly {
    key: string;
    count: number;
    examples: readonly string[];
  }[];
  readonly registry: ReturnType<typeof registryFindings>;
  readonly choices: {
    selectRules: number;
    offered: number;
    neverOffered: number;
    neverFillable: readonly {
      provider: string;
      type: string;
      category: string | undefined;
      name: string | undefined;
      optional: boolean;
      section: string;
      offers: number | undefined;
      examples: readonly string[] | undefined;
    }[];
    otherSection: readonly {
      provider: string;
      type: string;
      category: string | undefined;
      offered: boolean;
    }[];
    neverOfferedByType: readonly {
      type: string;
      count: number;
      examples: readonly string[];
    }[];
  };
  readonly auditProblems: readonly {
    kind: string;
    count: number;
    examples: readonly AuditProblem[];
  }[];
};

/** A one-line triage hint per D089: content correction, code, or registry. */
function unpresentedFix(
  type: string,
  registry: ReturnType<typeof contentTypeCoverage>,
): string {
  if (type === "(missing definition)")
    return "Content correction: the grant names a definition the pack lacks.";
  if (registry === undefined) return "Registry: classify this type.";
  if (registry.kind === "gap")
    return `Code (sheet surface), known gap: ${registry.note}`;
  if (registry.kind === "presented")
    return `Code: registered on ${registry.surfaces.join(", ")}, but the sheet omits these; fix the surface or narrow the registry.`;
  return "Registry review.";
}

function errorFix(code: string): string {
  if (code === "grant.missing-target")
    return "Content correction: point the grant at an existing ID (or drop it).";
  if (code === "audit.required-choice-unfillable")
    return "Content correction (category/prereqs) unless the engine filters candidates wrongly; check the choice's candidates.";
  if (code.startsWith("choice."))
    return "Check the choice's candidates; content correction if the category matches nothing.";
  if (code.includes("definition"))
    return "Content correction: missing definition.";
  return "Triage: trace the rule that raises it.";
}

function markdownReport(report: Report): string {
  const cell = (value: string | number | undefined) =>
    String(value ?? "")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ");
  const pct = (part: number, total: number) =>
    total === 0 ? "—" : `${Math.round((part / total) * 100)}%`;
  const incomplete = report.snapshots.filter((value) => !value.complete).length;
  const illegal = report.snapshots.filter((value) => !value.legal).length;
  const lines: string[] = [
    "# Coverage matrix",
    "",
    `Pack: ${report.pack.path} (${report.pack.packId}, digest ${report.pack.contentDigest.slice(0, 12)})`,
    "",
    `${report.characters} characters (${report.lines} main lines, ${report.characters - report.lines} forks), ` +
      `${report.snapshots.length} sheets at levels ${report.request.levels.join(", ")}` +
      `${report.request.limit === undefined ? "" : ` (--limit=${report.request.limit})`}, ` +
      `${report.runtimeSeconds.toFixed(0)}s. ${incomplete} sheets incomplete, ${illegal} not rules-legal.`,
    "",
    "## Axis coverage",
    "",
    "| Axis | Covered | Total | Uncovered (first 8) |",
    "| --- | --- | --- | --- |",
    ...Object.entries(report.axisCoverage).map(
      ([type, value]) =>
        `| ${type} | ${value.covered} (${pct(value.covered, value.total)}) | ${value.total} | ${cell(value.uncovered.slice(0, 8).join(", "))} |`,
    ),
    "",
    `Forks: ${groupCounts(
      report.forks,
      (fork) => `${fork.type}: ${fork.outcome}`,
    )
      .map((group) => `${group.key} ${group.count}`)
      .join("; ")}.`,
    "",
    "## Ranked gaps",
    "",
    "Ranked by characters affected. Rows are character sheets × definitions",
    "(a definition counts once per sheet).",
    "",
  ];
  type Gap = { weight: number; text: string };
  const gaps: Gap[] = [
    ...report.unpresentedByType.map((group) => ({
      weight: group.characters,
      text:
        `**Unpresented ${group.type}** — ${group.characters} characters, ${group.count} rows, ${group.definitions} definitions` +
        ` (registry: ${group.registry?.kind ?? "missing"}). ` +
        (Object.keys(group.notes).length === 0
          ? ""
          : `${Object.entries(group.notes)
              .map(([note, count]) => `${count} ${note}`)
              .join(", ")}. `) +
        `Examples: ${group.examples.join("; ")}. ` +
        `Fix: ${unpresentedFix(group.type, group.registry)}`,
    })),
    ...report.errorsByCode.map((group) => ({
      weight: group.characters,
      text:
        `**Evaluation error ${group.code}** — ${group.characters} characters, ${group.count} occurrences. ` +
        `Examples: ${group.examples
          .map(
            (error) =>
              `${error.message} [${error.provider}] — ${error.character} @${error.level}`,
          )
          .join("; ")}. Fix: ${errorFix(group.code)}`,
    })),
    ...(report.choices.neverFillable.length === 0
      ? []
      : [
          {
            weight: report.choices.neverFillable.length,
            text:
              `**Choices offered but never fillable** — ${report.choices.neverFillable.length} select rules. ` +
              `Examples: ${report.choices.neverFillable
                .slice(0, 4)
                .map(
                  (choice) =>
                    `${choice.provider} → ${choice.type}${choice.category === undefined ? "" : ` [${choice.category}]`}`,
                )
                .join(
                  "; ",
                )}. Fix: content correction (category, Unselectable) unless candidate filtering is wrong.`,
          },
        ]),
    ...(report.registry.length === 0
      ? []
      : [
          {
            weight: report.registry.length,
            text:
              `**Registry contradicted by generated sheets** — ${report.registry.length} types: ` +
              `${report.registry.map((finding) => `${finding.type} (${finding.problem})`).join("; ")}. ` +
              "Fix: registry update, or code where the sheet should show it.",
          },
        ]),
  ].sort((a, b) => b.weight - a.weight);
  lines.push(...gaps.map((gap, index) => `${index + 1}. ${gap.text}`), "");

  lines.push(
    "## Unpresented occurrences by type and provider",
    "",
    "| Type ← provider | Rows | Examples |",
    "| --- | --- | --- |",
    ...report.unpresentedByProvider
      .slice(0, 60)
      .map(
        (group) =>
          `| ${cell(group.key)} | ${group.count} | ${cell(group.examples.slice(0, 2).join("; "))} |`,
      ),
    "",
    "## Evaluation errors by code and provider",
    "",
    "| Code ← provider | Count | Examples |",
    "| --- | --- | --- |",
    ...report.errorsByProvider
      .slice(0, 60)
      .map(
        (group) =>
          `| ${cell(group.key)} | ${group.count} | ${cell(group.examples.slice(0, 2).join("; "))} |`,
      ),
    "",
    "## Registry cross-check",
    "",
    ...(report.registry.length === 0
      ? ["No contradictions."]
      : report.registry.map(
          (finding) =>
            `- **${finding.type}**: ${finding.problem} (${finding.presented}/${finding.rows} rows shown)`,
        )),
    "",
    "## Choice reachability",
    "",
    `${report.choices.selectRules} select rules; ${report.choices.offered} offered to some generated character ` +
      `(${pct(report.choices.offered, report.choices.selectRules)}); ` +
      `${report.choices.neverFillable.length} offered but never fillable.`,
    "",
    "### Offered but never fillable",
    "",
    "| Provider | Type | Category / name | Optional | Section | Offers | Example |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.choices.neverFillable.map(
      (choice) =>
        `| ${cell(choice.provider)} | ${cell(choice.type)} | ${cell([choice.category, choice.name].filter(Boolean).join(" / "))} | ${choice.optional ? "yes" : ""} | ${choice.section} | ${choice.offers ?? 0} | ${cell(choice.examples?.[0])} |`,
    ),
    "",
    "### Choices in the builder's Other section",
    "",
    ...(report.choices.otherSection.length === 0
      ? ["None."]
      : groupCounts(report.choices.otherSection, (choice) => choice.type).map(
          (group) =>
            `- ${group.key}: ${group.count} select rules (${group.examples
              .map(
                (choice) =>
                  `${choice.provider}${choice.offered ? "" : ", not offered"}`,
              )
              .join("; ")})`,
        )),
    "",
    "### Never offered, by choice type",
    "",
    "Not reached by any generated character (often options of uncovered",
    "classes, items, or later choices); for triage, not necessarily broken.",
    "",
    "| Type | Select rules | Examples |",
    "| --- | --- | --- |",
    ...report.choices.neverOfferedByType.map(
      (group) =>
        `| ${cell(group.type)} | ${group.count} | ${cell(group.examples.join("; "))} |`,
    ),
    "",
    "## Audit problems",
    "",
    ...(report.auditProblems.length === 0
      ? ["None."]
      : report.auditProblems.map(
          (group) =>
            `- **${group.kind}** (${group.count}): ${group.examples
              .slice(0, 2)
              .map(
                (problem) =>
                  `${problem.character} @${problem.level}: ${problem.detail.slice(0, 300)}`,
              )
              .join("; ")}`,
        )),
    "",
    "## Snapshots",
    "",
    "| Character | Level | Complete | Legal | Occurrences | Unpresented | Errors |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.snapshots.map(
      (value) =>
        `| ${cell(value.character)} | ${value.level} | ${value.complete ? "yes" : "no"} | ${value.legal ? "yes" : "no"} | ${value.occurrences} | ${value.unpresented} | ${value.errors} |`,
    ),
    "",
  );
  return lines.join("\n");
}

await main();
