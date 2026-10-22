/**
 * Private visual-review harness for docs/visual-review-checklist.md. Builds a
 * small set of review characters from an exact pack (native characters
 * through the character-domain commands, plus imported legacy samples), writes
 * them to one character backup the app restores with their IDs, and writes a
 * self-contained review page that links each checklist item to the character
 * and page where it can be seen. Outputs stay in ignored tmp/.
 *
 *   pnpm review:build [--pack=tmp/content/full-local.4ecp]
 *     [--out=tmp/visual-review] [--base=http://localhost:5173]
 *     [--only=slug,...]
 *
 * The characters are bound to a re-identified copy of the pack
 * (`visual-review-<digest>`, same entities), so it installs beside any other
 * revision of the same pack ID, and to the browser profile made of that pack
 * alone, so they open without a content-update issue once it is the only
 * enabled content. `--only` rebuilds the named characters and reuses the
 * others from the previous run's cache (same pack only). The checklist is
 * read on every run; items no character covers are printed and listed at
 * the end of the page.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gzip as gzipCallback } from "node:zlib";

import {
  CharacterTransaction,
  EQUIPMENT_SLOT_IDS,
  buildElementNames,
  isCharacterRecord,
  newCharacterRecord,
  newNativeCharacterRecord,
  type BuildOccurrence,
  type CharacterBuild,
  type CharacterCommand,
  type CharacterProfileBinding,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  composeContentPacks,
  encodeContentPack,
  validateContentPack,
  type ContentPack,
} from "@4ecb/content-pack";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  commandForEvaluatedChoice,
  ritualAllowances,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

import {
  ACTIVE_PROFILE_ID,
  ACTIVE_PROFILE_NAME,
} from "../apps/web/src/content-profile-ui";
import {
  compatibleBaseItems,
  inventoryEntryForEntity,
  inventoryLoadoutToggle,
  loadoutChangeCommand,
} from "../apps/web/src/equipment-ui";
import { freebeeGiftCommand } from "../apps/web/src/freebee-gifts";
import {
  assertNoRemovedOccurrences,
  candidateFor,
  evaluate,
  key,
  levelDefinition,
  loadPack,
  occurrenceFor,
  replacementCommand,
  type CandidatePreference,
} from "./native-character";
import { reviewPlan, type ReviewPlan } from "./visual-review-plan";
import { renderReviewPage, parseChecklist } from "./visual-review-page";

const gzip = promisify(gzipCallback);
const ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;
const ABILITY_SCORES = [18, 16, 14, 12, 11, 10];
const MAX_PASSES_PER_LEVEL = 256;
const CHECKLIST_PATH = "docs/visual-review-checklist.md";

/* ------------------------------------------------------------------ */
/* Character specifications                                            */
/* ------------------------------------------------------------------ */

/** A definition to prefer, optionally only from a level on (and avoided before). */
export type Preference =
  string | { readonly id: string; readonly from: number };

export interface ItemSpec {
  readonly id: string;
  /** Base item for an enchantment or a magic weapon/armor; by name or ID. */
  readonly base?: string;
  readonly equip?: boolean;
}

export interface NativeSpec {
  readonly kind: "native";
  readonly slug: string;
  readonly title: string;
  readonly level: number;
  /** Class (or both hybrid classes) whose key abilities get the high scores. */
  readonly classes: readonly string[];
  readonly preferred: readonly Preference[];
  readonly excluded?: readonly string[];
  /** Definitions a power swap must never replace. */
  readonly keep?: readonly string[];
  readonly text?: Readonly<Record<string, string>>;
  readonly items?: readonly ItemSpec[];
  /** Rituals learned free from the named allowance provider (by name). */
  readonly freeRituals?: readonly { name: string; allowance: string }[];
  /** Give the free items the app would give on first open. Default true. */
  readonly giveFreeItems?: boolean;
  /** Extra grab-bag elements (house-ruled). */
  readonly grabbag?: readonly string[];
  readonly expectLegal: boolean;
  /** Definitions the review needs; reported when the build lacks one. */
  readonly required: readonly string[];
}

export interface ImportSpec {
  readonly kind: "import";
  readonly slug: string;
  readonly title: string;
  readonly source: string;
  readonly items?: readonly ItemSpec[];
  /** Imported legality, reported but not enforced (legacy content). */
  readonly expectLegal?: boolean;
  readonly required: readonly string[];
}

export type CharacterSpec = NativeSpec | ImportSpec;

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

interface Args {
  readonly packPath: string;
  readonly outDir: string;
  readonly base: string | undefined;
  readonly only: readonly string[] | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const option = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    packPath: resolve(option("pack") ?? "tmp/content/full-local.4ecp"),
    outDir: resolve(option("out") ?? "tmp/visual-review"),
    base: option("base"),
    only: option("only")?.split(",").filter(Boolean),
  };
}

/* ------------------------------------------------------------------ */
/* Review content pack                                                 */
/* ------------------------------------------------------------------ */

const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

/** content-pack's digestInput (private there); validated after use. */
function digestInput(pack: ContentPack): string {
  const { manifest } = pack;
  return JSON.stringify({
    format: pack.format,
    manifest: {
      formatVersion: manifest.formatVersion,
      packId: manifest.packId,
      name: manifest.name,
      gameSystem: manifest.gameSystem,
      sourceKey: manifest.sourceKey,
      recordCount: manifest.recordCount,
      typeCounts: manifest.typeCounts,
      accounting: manifest.accounting,
      diagnosticCounts: manifest.diagnosticCounts,
    },
    entities: pack.entities,
    rejected: pack.rejected,
    rawTopLevel: pack.rawTopLevel,
    diagnostics: pack.diagnostics,
  });
}

/** The same pack under a review pack ID and name. */
async function reidentify(pack: ContentPack): Promise<ContentPack> {
  const digest = pack.manifest.contentDigest.slice(0, 12);
  const unsigned: ContentPack = {
    ...pack,
    manifest: {
      ...pack.manifest,
      packId: `visual-review-${digest}`,
      name: `Visual review content (${pack.manifest.packId} ${digest})`,
      contentDigest: "",
    },
  };
  const result: ContentPack = {
    ...unsigned,
    manifest: {
      ...unsigned.manifest,
      contentDigest: sha256(digestInput(unsigned)),
    },
  };
  const validation = await validateContentPack(result);
  if (!validation.valid)
    throw new Error(`Review pack is invalid: ${validation.errors.join("; ")}`);
  return result;
}

/** The binding the app gives a character created while the review pack
 *  is the only enabled content (pack-repository activateProfile). */
async function profileBinding(pack: ContentPack): Promise<{
  binding: CharacterProfileBinding;
  entities: readonly ContentEntity[];
}> {
  const suffix = sha256(
    `${pack.manifest.packId}:${pack.manifest.contentDigest}`,
  ).slice(0, 12);
  const packId = `profile:${ACTIVE_PROFILE_ID.slice(0, 40)}:${suffix}`;
  const composed = await composeContentPacks([pack], {
    packId,
    name: ACTIVE_PROFILE_NAME,
  });
  return {
    binding: {
      packId,
      contentDigest: composed.pack.manifest.contentDigest,
      layers: composed.layers,
      resolutionPolicy: composed.resolutionPolicy,
    },
    entities: composed.pack.entities,
  };
}

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

interface Context {
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly binding: CharacterProfileBinding;
  readonly now: string;
}

export interface BuiltCharacter {
  readonly slug: string;
  readonly record: CharacterRecord;
  readonly facts: CharacterFacts;
}

export interface CharacterFacts {
  readonly level: number;
  readonly identity: Readonly<Record<string, string>>;
  readonly complete: boolean;
  readonly legal: boolean;
  readonly expectLegal: boolean | undefined;
  readonly diagnostics: readonly string[];
  /** Required definitions, with whether the build has each. */
  readonly required: readonly { id: string; name: string; present: boolean }[];
  readonly familiar?: string;
  readonly companion?: string;
  readonly equipped: readonly string[];
  readonly known: readonly string[];
  readonly powers: number;
  /** False when the backup can't carry it (see finish). */
  readonly restorable: boolean;
}

const ITEM_TYPES = new Set(["weapon", "armor", "gear", "magic item"]);

/** A definition by ID, else an item by exact name. */
function lookup(context: Context, idOrName: string): ContentEntity {
  const byId = context.byId.get(key(idOrName));
  if (byId !== undefined) return byId;
  const byName = context.entities.find(
    (entity) =>
      ITEM_TYPES.has(key(entity.type)) && key(entity.name) === key(idOrName),
  );
  if (byName === undefined) throw new Error(`No definition ${idOrName}`);
  return byName;
}

function keyAbilities(classes: readonly ContentEntity[]): string[] {
  const named = classes.flatMap(
    (entity) =>
      entity.specifics
        .find((specific) => key(specific.name) === "key abilities")
        ?.value.split(/[,;]|\band\b/)
        .map((part) => part.trim())
        .filter((part) => (ABILITIES as readonly string[]).includes(part)) ??
      [],
  );
  return [...new Set([...named, ...ABILITIES])];
}

function preferenceId(preference: Preference): string {
  return typeof preference === "string" ? preference : preference.id;
}

class NativeBuilder {
  transaction: CharacterTransaction;
  serial = 1;
  readonly poisoned = new Set<string>();
  readonly problems: string[] = [];

  constructor(
    readonly context: Context,
    readonly spec: NativeSpec,
    readonly record: CharacterRecord,
  ) {
    this.transaction = new CharacterTransaction(record.build);
  }

  get build(): CharacterBuild {
    return this.transaction.current;
  }

  id(kind: string): string {
    return `review:${this.spec.slug}:${kind}:${this.serial++}`;
  }

  dispatch(command: CharacterCommand): void {
    this.transaction.dispatch(command);
  }

  entity(idOrName: string): ContentEntity {
    return lookup(this.context, idOrName);
  }

  preferenceAt(level: number): {
    preferred: Set<string>;
    excluded: Set<string>;
  } {
    const preferred = new Set<string>();
    const excluded = new Set<string>([
      ...(this.spec.excluded ?? []).map(key),
      ...this.poisoned,
    ]);
    for (const preference of this.spec.preferred) {
      const id = key(preferenceId(preference));
      if (typeof preference === "string" || preference.from <= level)
        preferred.add(id);
      else excluded.add(id);
    }
    return { preferred, excluded };
  }

  evaluateLevel(level: number, openReplacements: readonly string[]) {
    return evaluate(this.build, this.context.entities, {
      candidateDetailLevels: [level],
      candidateDetailReplacementChoiceIds: openReplacements,
      includePowers: false,
    });
  }

  wantsOptional(choice: EvaluatedChoice, preference: CandidatePreference) {
    return choice.candidates.some(
      (candidate) =>
        candidate.eligible &&
        preference.preferred.has(key(candidate.definitionId)) &&
        !(preference.excluded?.has(key(candidate.definitionId)) ?? false),
    );
  }

  /** Fills every required choice, and optional ones a preferred
   *  definition can fill; returns the choices left unfilled. */
  resolveLevel(level: number): EvaluatedChoice[] {
    const preference = this.preferenceAt(level);
    const openReplacements = new Set<string>();
    const attempted = new Set<string>();
    const unstable = new Set<string>();
    let batch: { start: CharacterBuild; picks: string[] } | undefined;
    let singleStep = false;
    for (let pass = 0; pass < MAX_PASSES_PER_LEVEL; pass += 1) {
      let current: EvaluatedCharacter;
      try {
        current = this.evaluateLevel(level, [...openReplacements]);
      } catch (error) {
        if (batch === undefined || batch.picks.length === 0) throw error;
        this.transaction = new CharacterTransaction(batch.start);
        if (batch.picks.length === 1) {
          this.poisoned.add(key(batch.picks[0]!));
          preference.excluded.add(key(batch.picks[0]!));
          this.problems.push(
            `level ${level}: ${batch.picks[0]!} kept evaluation from converging`,
          );
        }
        singleStep = true;
        batch = undefined;
        continue;
      }
      batch = undefined;
      const pending = current.choices.filter(
        (choice) =>
          choice.selectedOccurrenceId === undefined &&
          !unstable.has(choice.id) &&
          (!choice.optional ||
            (key(choice.type) !== "replacement" &&
              !attempted.has(choice.id) &&
              this.wantsOptional(choice, preference))),
      );
      const unfilled = pending.filter((choice) => !choice.optional);
      if (pending.length === 0) return [];
      const closed = unfilled.filter(
        (choice) =>
          key(choice.type) === "replacement" &&
          !openReplacements.has(choice.id),
      );
      if (closed.length > 0) {
        closed.forEach(({ id }) => openReplacements.add(id));
        continue;
      }
      const excluded = new Set(preference.excluded);
      const thisBatch = { start: this.build, picks: [] as string[] };
      batch = thisBatch;
      let dispatched = 0;
      for (const choice of pending) {
        if (singleStep && dispatched > 0) break;
        if (choice.optional) attempted.add(choice.id);
        const choicePreference = { ...preference, excluded };
        const before = this.build;
        try {
          if (key(choice.type) === "replacement") {
            const kept = new Set((this.spec.keep ?? []).map(key));
            const keptOccurrences = new Set(
              current.occurrences
                .filter(({ definitionId }) => kept.has(key(definitionId)))
                .map(({ id }) => id),
            );
            const replacement = replacementCommand(
              before,
              {
                ...choice,
                replacementOptions: (choice.replacementOptions ?? []).filter(
                  ({ replacesOccurrenceId }) =>
                    !keptOccurrences.has(replacesOccurrenceId),
                ),
              },
              this.context.entities,
              this.context.byId,
              current,
              choicePreference,
              this.serial,
            );
            if (replacement === undefined) continue;
            this.serial += 1;
            excluded.add(key(replacement.definitionId));
            this.dispatch(replacement.command);
            thisBatch.picks.push(replacement.definitionId);
          } else {
            const definition = candidateFor(
              choice,
              this.context.byId,
              current,
              choicePreference,
            );
            if (definition === undefined) continue;
            excluded.add(key(definition.id));
            const provider = current.occurrences.find(
              (occurrence) => occurrence.id === choice.providerOccurrenceId,
            );
            const selected: BuildOccurrence = {
              ...occurrenceFor(
                definition,
                provider?.acquiredLevel ?? level,
                this.serial,
              ),
              id: this.id("occurrence"),
            };
            const command = commandForEvaluatedChoice(
              before,
              choice,
              current.occurrences,
              this.context.entities,
              selected,
              () => this.id("placeholder"),
            );
            if (command === undefined) {
              this.problems.push(
                `level ${level}: cannot materialize ${choice.type} ${choice.id}`,
              );
              continue;
            }
            this.dispatch(command);
            thisBatch.picks.push(definition.id);
          }
          dispatched += 1;
          try {
            assertNoRemovedOccurrences(
              before,
              this.build,
              `Resolving ${choice.type} ${choice.id}`,
            );
          } catch {
            unstable.add(choice.id);
          }
        } catch (error) {
          this.problems.push(
            `level ${level}: ${choice.type} ${choice.id}: ${(error as Error).message}`,
          );
        }
      }
      if (dispatched === 0) return unfilled;
    }
    this.problems.push(`level ${level}: choice resolution hit its pass bound`);
    return [];
  }

  addLevel(level: number): void {
    const definition = levelDefinition(this.context.entities, level);
    this.dispatch({
      kind: "add-level",
      frame: {
        level,
        root: { ...occurrenceFor(definition, level, 0), id: this.id("level") },
      },
    });
  }

  baseFor(entity: ContentEntity, wanted: string | undefined) {
    const candidates = compatibleBaseItems(entity, this.context.entities);
    if (wanted === undefined) return candidates[0];
    return (
      candidates.find(
        (candidate) =>
          key(candidate.id) === key(wanted) ||
          key(candidate.name) === key(wanted),
      ) ?? this.entity(wanted)
    );
  }

  addItem(spec: ItemSpec): void {
    addItem(this, spec, this.build.effectiveLevel);
  }

  learnFree(name: string, allowanceProvider: string): void {
    const ritual = this.context.entities.find(
      (entity) =>
        key(entity.type) === "ritual" && key(entity.name) === key(name),
    );
    if (ritual === undefined) throw new Error(`No ritual named ${name}`);
    const evaluation = evaluate(this.build, this.context.entities, {
      candidateDetailLevels: [],
    });
    const allowance = ritualAllowances(evaluation, (id) =>
      this.context.byId.get(key(id)),
    ).find((candidate) => key(candidate.provider) === key(allowanceProvider));
    if (allowance === undefined)
      throw new Error(`${this.spec.slug}: no ${allowanceProvider} allowance`);
    this.dispatch({
      kind: "learn-known",
      entry: {
        id: this.id("known"),
        acquiredLevel: 1,
        element: {
          definitionId: ritual.id,
          name: ritual.name,
          type: ritual.type,
        },
        acquisition: "free",
        allowance: allowance.key,
      },
      priceCopper: 0,
    });
  }
}

/** Adds an inventory holding and, when asked, equips it the way the
 *  Equipment tab's Loadout toggle does. */
function addItem(
  builder: {
    readonly context: Context;
    readonly build: CharacterBuild;
    id(kind: string): string;
    dispatch(command: CharacterCommand): void;
    entity(id: string): ContentEntity;
    baseFor(
      entity: ContentEntity,
      wanted: string | undefined,
    ): ContentEntity | undefined;
    readonly problems: string[];
  },
  spec: ItemSpec,
  level: number,
): void {
  const entity = builder.entity(spec.id);
  const kind = key(entity.type);
  const needsBase =
    spec.base !== undefined ||
    (kind === "magic item" &&
      compatibleBaseItems(entity, builder.context.entities).length > 0);
  const base = needsBase ? builder.baseFor(entity, spec.base) : undefined;
  const entry = {
    ...inventoryEntryForEntity(entity, Math.min(level, 30), base),
    id: builder.id("item"),
  };
  builder.dispatch({ kind: "put-inventory", entry });
  if (spec.equip !== true) return;
  const toggle = inventoryLoadoutToggle(
    builder.build.inventory,
    builder.context.byId,
    entry.id,
    EQUIPMENT_SLOT_IDS,
  );
  if (toggle.kind !== "equip") {
    builder.problems.push(`${entity.name}: cannot equip (${toggle.kind})`);
    return;
  }
  const command = loadoutChangeCommand(
    builder.build.inventory,
    builder.context.byId,
    entry.id,
    toggle.slots,
  );
  if (command !== undefined) builder.dispatch(command);
}

function giveFreeItems(
  transaction: CharacterTransaction,
  context: Context,
): void {
  const evaluation = evaluate(transaction.current, context.entities, {
    candidateDetailLevels: [],
  });
  const command = freebeeGiftCommand(
    transaction.current,
    evaluation,
    context.byId,
  );
  if (command !== undefined) transaction.dispatch(command);
}

function buildNative(context: Context, spec: NativeSpec): BuiltCharacter {
  const started = Date.now();
  const first = levelDefinition(context.entities, 1);
  const record = newNativeCharacterRecord(
    spec.title,
    { definitionId: first.id, name: first.name, type: first.type },
    context.binding,
    {
      id: `visual-review-${spec.slug}`,
      occurrenceId: `review:${spec.slug}:level:1`,
      now: context.now,
    },
  );
  const builder = new NativeBuilder(context, spec, record);
  const classes = spec.classes.map((id) => builder.entity(id));
  keyAbilities(classes).forEach((ability, index) =>
    builder.dispatch({
      kind: "set-base-ability",
      ability,
      value: ABILITY_SCORES[index] ?? 10,
    }),
  );
  for (const [name, value] of Object.entries(spec.text ?? {}))
    builder.dispatch({ kind: "set-text", name, value });
  for (let level = 1; level <= spec.level; level += 1) {
    if (level > 1) builder.addLevel(level);
    const unfilled = builder.resolveLevel(level);
    if (unfilled.length > 0)
      builder.problems.push(
        `level ${level}: unfilled ${unfilled.map((choice) => choice.type).join(", ")}`,
      );
    builder.transaction = new CharacterTransaction(builder.build);
    process.stderr.write(
      `  ${spec.slug}: level ${level} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`,
    );
  }
  for (const item of spec.items ?? []) builder.addItem(item);
  for (const ritual of spec.freeRituals ?? [])
    builder.learnFree(ritual.name, ritual.allowance);
  if (spec.giveFreeItems !== false) giveFreeItems(builder.transaction, context);
  let build = builder.build;
  if (spec.grabbag !== undefined && spec.grabbag.length > 0)
    build = {
      ...build,
      grabbag: [
        ...build.grabbag,
        ...spec.grabbag.map((id) => ({
          ...occurrenceFor(builder.entity(id), build.effectiveLevel, 0),
          id: builder.id("grabbag"),
          legality: "houserule" as const,
        })),
      ],
    };
  const saved = { ...record, build };
  builder.problems.forEach((problem) =>
    process.stderr.write(`  ${spec.slug}: ${problem}\n`),
  );
  return finish(context, spec, saved);
}

function buildImport(context: Context, spec: ImportSpec, xml: string) {
  const imported = importDnd4e(xml);
  const record = newCharacterRecord(
    imported.envelope,
    imported.snapshot,
    imported.build,
    {
      id: `visual-review-${spec.slug}`,
      now: context.now,
      profileBinding: context.binding,
    },
  );
  const transaction = new CharacterTransaction(record.build);
  let serial = 1;
  const problems: string[] = [];
  const builder = {
    context,
    get build() {
      return transaction.current;
    },
    id: (kind: string) => `review:${spec.slug}:${kind}:${serial++}`,
    dispatch: (command: CharacterCommand) => {
      transaction.dispatch(command);
    },
    entity: (id: string) => lookup(context, id),
    baseFor: (entity: ContentEntity, wanted: string | undefined) => {
      const candidates = compatibleBaseItems(entity, context.entities);
      return wanted === undefined
        ? candidates[0]
        : candidates.find(
            (candidate) =>
              key(candidate.id) === key(wanted) ||
              key(candidate.name) === key(wanted),
          );
    },
    problems,
  };
  for (const item of spec.items ?? [])
    addItem(builder, item, transaction.current.effectiveLevel);
  transaction.dispatch({ kind: "set-text", name: "Name", value: spec.title });
  problems.forEach((problem) =>
    process.stderr.write(`  ${spec.slug}: ${problem}\n`),
  );
  return finish(context, spec, {
    ...record,
    title: spec.title,
    build: transaction.current,
  });
}

function finish(
  context: Context,
  spec: CharacterSpec,
  candidate: CharacterRecord,
): BuiltCharacter {
  const decoded = JSON.parse(JSON.stringify(candidate)) as unknown;
  // A record the domain decoder rejects can't go in a backup (restore
  // validates every record); an imported one is then imported by hand.
  const restorable = isCharacterRecord(decoded);
  if (!restorable && spec.kind === "native")
    throw new Error(`${spec.slug}: record failed the domain decoder`);
  const saved = restorable ? decoded : candidate;
  const evaluation = evaluate(saved.build, context.entities);
  const sheet = buildEvaluatedSheetModel(
    saved.snapshot,
    saved.build,
    evaluation,
    context.entities,
  );
  const active = new Set(
    evaluation.occurrences.map(({ definitionId }) => key(definitionId)),
  );
  const powers = new Set(
    evaluation.powers.map(({ definitionId }) => key(definitionId)),
  );
  const known = new Set(
    saved.build.known.flatMap(({ element }) =>
      element.definitionId === undefined ? [] : [key(element.definitionId)],
    ),
  );
  const inventory = new Set(
    saved.build.inventory.flatMap(({ elements }) =>
      elements.flatMap(({ definitionId }) =>
        definitionId === undefined ? [] : [key(definitionId)],
      ),
    ),
  );
  const nameOf = (id: string) => context.byId.get(key(id))?.name ?? id;
  const identity = Object.fromEntries(
    sheet.identity
      .filter(({ value }) => value.trim() !== "")
      .map(({ label, value }) => [label, value]),
  );
  // Chosen or granted (a theme's familiar is granted).
  const occurrenceName = (type: string) =>
    buildElementNames(saved.build, type)[0] ??
    evaluation.occurrences
      .map(({ definitionId }) => context.byId.get(key(definitionId)))
      .find((entity) => entity !== undefined && key(entity.type) === key(type))
      ?.name;
  const facts: CharacterFacts = {
    level: evaluation.level,
    identity,
    complete: evaluation.complete,
    legal: evaluation.legal,
    expectLegal: spec.expectLegal,
    diagnostics: evaluation.diagnostics
      .filter(({ severity }) => severity !== "info")
      .map(({ severity, code, message }) => `${severity} ${code}: ${message}`),
    required: spec.required.map((id) => ({
      id,
      name: nameOf(id),
      present:
        active.has(key(id)) ||
        powers.has(key(id)) ||
        known.has(key(id)) ||
        inventory.has(key(id)),
    })),
    ...(occurrenceName("Familiar") === undefined
      ? {}
      : { familiar: occurrenceName("Familiar")! }),
    ...(occurrenceName("Companion") === undefined
      ? {}
      : { companion: occurrenceName("Companion")! }),
    equipped: saved.build.inventory
      .filter(({ equippedQuantity }) => equippedQuantity > 0)
      .map(
        (entry) =>
          entry.name ?? entry.elements.map(({ name }) => name).join(" + "),
      ),
    known: saved.build.known.map(({ element }) => element.name),
    powers: evaluation.powers.length,
    restorable,
  };
  return { slug: spec.slug, record: saved, facts };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function detectBase(): Promise<string> {
  for (const port of [5173, 5174, 5175, 5176]) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) return `http://localhost:${port}`;
    } catch {
      // Not listening.
    }
  }
  return "http://localhost:5173";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(resolve(args.outDir, "cache"), { recursive: true });
  process.stderr.write(`Loading ${args.packPath}...\n`);
  const source = await loadPack(args.packPath);
  const reviewPack = await reidentify(source);
  const packFile = resolve(args.outDir, "review-content.4ecp");
  await writeFile(
    packFile,
    await gzip(Buffer.from(encodeContentPack(reviewPack)), { level: 9 }),
  );
  const { binding, entities } = await profileBinding(reviewPack);
  const context: Context = {
    entities,
    byId: new Map(entities.map((entity) => [key(entity.id), entity])),
    binding,
    now: new Date().toISOString(),
  };
  const plan: ReviewPlan = reviewPlan();
  const built: BuiltCharacter[] = [];
  for (const spec of plan.characters) {
    const cachePath = resolve(args.outDir, "cache", `${spec.slug}.json`);
    if (
      args.only !== undefined &&
      !args.only.includes(spec.slug) &&
      existsSync(cachePath)
    ) {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as {
        packDigest: string;
        built: BuiltCharacter;
      };
      if (cached.packDigest === reviewPack.manifest.contentDigest) {
        built.push(cached.built);
        continue;
      }
    }
    process.stderr.write(`Building ${spec.slug}...\n`);
    const character =
      spec.kind === "native"
        ? buildNative(context, spec)
        : buildImport(
            context,
            spec,
            await readFile(resolve(spec.source), "utf8"),
          );
    await writeFile(
      cachePath,
      JSON.stringify({
        packDigest: reviewPack.manifest.contentDigest,
        built: character,
      }),
    );
    built.push(character);
  }
  for (const review of plan.reviews)
    for (const variant of review.variants ?? []) {
      const original = built.find(({ slug }) => slug === review.spec.slug);
      if (original === undefined) continue;
      built.push({
        slug: variant.slug,
        facts: original.facts,
        record: {
          ...original.record,
          id: `visual-review-${variant.slug}`,
          title: variant.title,
          build: {
            ...original.record.build,
            textStrings: {
              ...original.record.build.textStrings,
              Name: variant.title,
            },
          },
          profileBinding:
            variant.binding === "update"
              ? {
                  packId: reviewPack.manifest.packId,
                  contentDigest: reviewPack.manifest.contentDigest,
                }
              : {
                  packId: "visual-review-missing-content",
                  contentDigest: "0".repeat(64),
                },
        },
      });
    }

  const characters = built
    .filter(({ facts }) => facts.restorable)
    .map(({ record }) => record);
  for (const { slug, facts } of built)
    if (!facts.restorable)
      process.stdout.write(
        `${slug}: the domain decoder rejects the imported record, so it is not in the backup; the page explains importing it by hand.\n`,
      );
  const backup = {
    format: "4ecb-character-backup" as const,
    version: 2 as const,
    exportedAt: context.now,
    characterCount: characters.length,
    // browser-storage characterPayloadDigest.
    payloadDigest: sha256(JSON.stringify(characters)),
    characters,
  };
  const backupFile = resolve(args.outDir, "review-characters.4ecb");
  await writeFile(backupFile, `${JSON.stringify(backup, null, 2)}\n`);

  const checklist = parseChecklist(await readFile(CHECKLIST_PATH, "utf8"));
  const base = args.base ?? (await detectBase());
  const { html, unmapped, unknownKeys } = renderReviewPage({
    plan,
    built,
    checklist,
    base,
    packFile,
    backupFile,
    reviewPack: reviewPack.manifest,
    sourcePack: source.manifest,
    generatedAt: context.now,
  });
  const pageFile = resolve(args.outDir, "index.html");
  await writeFile(pageFile, html);

  let failures = 0;
  for (const { slug, facts } of built) {
    const legalNote =
      facts.expectLegal === undefined || facts.expectLegal === facts.legal
        ? ""
        : ` (expected ${facts.expectLegal ? "legal" : "not legal"})`;
    const missing = facts.required.filter(({ present }) => !present);
    process.stdout.write(
      `${slug}: level ${facts.level}, ${facts.complete ? "complete" : "INCOMPLETE"}, ${facts.legal ? "legal" : "not legal"}${legalNote}${missing.length > 0 ? `; MISSING ${missing.map(({ name }) => name).join(", ")}` : ""}\n`,
    );
    if (!facts.complete || legalNote !== "" || missing.length > 0) {
      failures += 1;
      facts.diagnostics
        .slice(0, 8)
        .forEach((line) => process.stdout.write(`    ${line}\n`));
    }
  }
  process.stdout.write(
    `\nWrote ${backupFile}\n      ${packFile}\n      ${pageFile}\n`,
  );
  process.stdout.write(
    `Checklist: ${checklist.length} items, ${unmapped.length} unmapped.\n`,
  );
  unmapped.forEach((item) =>
    process.stdout.write(`  unmapped: ${item.title}\n`),
  );
  unknownKeys.forEach((name) =>
    process.stdout.write(`  plan names a missing checklist item: ${name}\n`),
  );
  if (failures > 0)
    process.stdout.write(`${failures} character(s) need attention.\n`);
}

await main();
