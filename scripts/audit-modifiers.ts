/**
 * Private modifier-kind audit. Collects every `statadd`, `modify` and
 * `textstring` an exact pack uses, normalizes the targets into shapes
 * (`apps/content-tool/src/modifier-shapes.ts`), and asks the rules engine,
 * by evaluation rather than by grepping, whether each shape does anything.
 *
 * For each shape a few representative rules are copied onto a synthetic
 * carrier record (with `requires` and `Level` removed: gating is audited by
 * `audit:requires`) and the carrier is added to a base character imported
 * from a legacy comparison file. Records the stat name refers to (a power, a
 * weapon, an implement, a magic item or augment named as a limiter, a power
 * carrying the named keywords) are added to both the baseline and the probe,
 * so only the rule differs. The probe then compares the evaluated stats,
 * the evaluated power variants and the evaluated sheet model:
 *
 * - `power`: an attack or damage line changed;
 * - `sheet`: the sheet model shows a different value or text;
 * - `stat-only`: the engine recorded and applied the contribution, but no
 *   total, power or sheet value reads that stat name (written, never read);
 * - `not-applied:<reason>`: recorded but not applied (`conditional`,
 *   `equipment`, `typed-stacking`, `zero-gate`) and nothing else changed;
 * - `text-only` / `overlay-only`: a textstring or field overlay recorded
 *   with no visible effect; `overlay-unmatched`: the overlay found no target;
 * - `absent`: the engine dropped the rule entirely.
 *
 * A shape is `applied` when every example surfaced on some base, `partial`
 * when some did, and `ignored` when none did. Equipment selectors
 * (`wearing` / `not-wearing`) are probed separately with a matching item
 * equipped. The JSON report and a ranked Markdown summary go to ignored
 * `tmp/audit/`.
 *
 *   pnpm audit:modifiers [PACK.4ecp] [--examples N] [--base FILE.dnd4e]...
 *                        [--shapes N] [--kind statadd|modify|textstring]
 *                        [--match REGEX] [--jobs N]
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  evaluateCharacter,
  freeRitualAllowanceTexts,
  grantedKnownRecords,
  pendingFreebeeItems,
  projectBuildForEvaluation,
  type CharacterInventoryEntry,
  type EvaluatedCharacter,
  type EvaluationInput,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

import {
  classifyTag,
  collectModifierUses,
  groupByShape,
  key,
  linkedStatNames,
  modifierShape,
  qualifierShapes,
  representativeUses,
  shapeVocabulary,
  type ModifierUse,
  type ShapeVocabulary,
} from "../apps/content-tool/src/modifier-shapes";
import { loadPack } from "./native-character";

const DEFAULT_BASES = [
  "sample-chars/oleander_9.dnd4e",
  "CharacterBuilder/SampleChars/SampleHeroes/Drizzt.dnd4e",
  "sample-chars/Hu Sheng-Ming Level 8.dnd4e",
];
const OUTPUT_DIRECTORY = "tmp/audit";
const PROBE_OCCURRENCE = "audit:probe";
const CARRIER_NAME = "Audit probe";
/** Inventory entry id of an equipped provider clone. */
const CLONE_ITEM = "audit:item:clone";

interface Options {
  readonly packPath: string;
  readonly bases: readonly string[];
  readonly examples: number;
  readonly shapeLimit: number | undefined;
  readonly kinds: ReadonlySet<string> | undefined;
  readonly match: RegExp | undefined;
  readonly jobs: number;
  readonly shard:
    { readonly index: number; readonly count: number } | undefined;
  readonly out: string | undefined;
}

function parseOptions(argv: readonly string[]): Options {
  let packPath = "tmp/content/full-local.4ecp";
  const bases: string[] = [];
  let examples = 3;
  let shapeLimit: number | undefined;
  const kinds = new Set<string>();
  let jobs = Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2)));
  let shard: Options["shard"];
  let out: string | undefined;
  let match: RegExp | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    const next = () => {
      const value = argv[(index += 1)];
      if (value === undefined) throw new Error(`${argument} needs a value`);
      return value;
    };
    if (argument === "--base") bases.push(next());
    else if (argument === "--examples") examples = Number(next());
    else if (argument === "--shapes") shapeLimit = Number(next());
    else if (argument === "--kind") kinds.add(key(next()));
    else if (argument === "--match") match = new RegExp(next(), "iu");
    else if (argument === "--jobs") jobs = Number(next());
    else if (argument === "--out") out = next();
    else if (argument === "--shard") {
      const [index, count] = next().split("/").map(Number);
      shard = { index: index ?? 0, count: count ?? 1 };
    } else packPath = argument;
  }
  return {
    packPath,
    bases: bases.length === 0 ? DEFAULT_BASES : bases,
    examples,
    shapeLimit,
    kinds: kinds.size === 0 ? undefined : kinds,
    match,
    jobs,
    shard,
    out,
  };
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

function statement(
  name: string,
  attributes: Readonly<Record<string, string>>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function carrier(
  id: string,
  rules: readonly RuleStatement[],
  template?: ContentEntity,
): ContentEntity {
  return {
    id,
    name: template?.name ?? CARRIER_NAME,
    type: template?.type ?? "Internal",
    source: "",
    sources: [],
    attributes: [],
    categories: template?.categories ?? [],
    specifics: template?.specifics ?? [],
    rules: rules.map((rule, ordinal) => ({ ...rule, ordinal })),
    description: "",
    extensions: [],
    provenance: { sourceKey: "audit-modifiers", sourceOrdinal: 0 },
  };
}

/** The rule as authored, minus `requires`/`Level`; typed constants are
 *  raised so they win their stacking group on any base. */
function probeRule(use: ModifierUse): RuleStatement {
  const attributes: Record<string, string> = {};
  for (const attribute of use.rule.attributes) {
    const name = key(attribute.name);
    if (name === "requires" || name === "level") continue;
    attributes[attribute.name] = attribute.value;
  }
  if (use.kind === "statadd") {
    const valueName = Object.keys(attributes).find(
      (name) => key(name) === "value",
    );
    const value = valueName === undefined ? undefined : attributes[valueName];
    const typed = (use.attributes.type ?? "").trim() !== "";
    if (
      valueName !== undefined &&
      value !== undefined &&
      typed &&
      /^[+-]?\d+$/u.test(value.trim()) &&
      Number(value) !== 0
    )
      attributes[valueName] = Number(value) < 0 ? "-7" : "+7";
  }
  return statement(use.rule.name, attributes, 0);
}

interface Lookups {
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly byName: ReadonlyMap<string, ContentEntity>;
  readonly powers: readonly ContentEntity[];
  readonly weapons: readonly ContentEntity[];
  /** Magic implements, lowest level first. */
  readonly implements: readonly ContentEntity[];
}

function lookups(entities: readonly ContentEntity[]): Lookups {
  const byId = new Map(entities.map((entity) => [key(entity.id), entity]));
  const byName = new Map<string, ContentEntity>();
  const preferred = ["power", "weapon", "magic item", "superior implement"];
  for (const entity of entities) {
    const current = byName.get(key(entity.name));
    if (
      current === undefined ||
      (!preferred.includes(key(current.type)) &&
        preferred.includes(key(entity.type)))
    )
      byName.set(key(entity.name), entity);
  }
  const attackPower = (entity: ContentEntity) =>
    key(entity.type) === "power" &&
    /\d+d\d+|\[W\]/iu.test(field(entity, "Hit") ?? "") &&
    (field(entity, "Attack") ?? "").trim() !== "";
  return {
    byId,
    byName,
    powers: entities
      .filter(attackPower)
      .toSorted(
        (left, right) =>
          Number(key(field(left, "Power Usage") ?? "") !== "at-will") -
            Number(key(field(right, "Power Usage") ?? "") !== "at-will") ||
          Number(field(left, "Level") ?? 0) -
            Number(field(right, "Level") ?? 0) ||
          left.id.localeCompare(right.id),
      ),
    weapons: entities.filter((entity) => key(entity.type) === "weapon"),
    implements: entities
      .filter(
        (entity) =>
          key(entity.type) === "magic item" &&
          /^\+\d/u.test(field(entity, "Enhancement") ?? "") &&
          /^(orb|rod|staff|tome|totem|wand|holy symbol|ki focus)$/iu.test(
            field(entity, "Magic Item Type") ?? "",
          ),
      )
      .toSorted(
        (left, right) =>
          Number(field(left, "Level") ?? 0) -
            Number(field(right, "Level") ?? 0) ||
          left.id.localeCompare(right.id),
      ),
  };
}

interface BaseCharacter {
  readonly label: string;
  readonly build: CharacterBuild;
  readonly snapshot: ReturnType<typeof importDnd4e>["snapshot"];
  readonly input: EvaluationInput;
}

/** Context records a probe adds to both its baseline and itself. */
interface ProbeContext {
  readonly grants: readonly ContentEntity[];
  readonly items: readonly ContentEntity[];
  readonly augments: readonly ContentEntity[];
  readonly notes: readonly string[];
  /** A power the stat name itself names (`<power id>:damage`). */
  readonly namedPower?: ContentEntity;
}

const EMPTY_CONTEXT: ProbeContext = {
  grants: [],
  items: [],
  augments: [],
  notes: [],
};

const GRANTABLE = new Set([
  "power",
  "class feature",
  "racial trait",
  "feat",
  "paragon path",
  "epic destiny",
]);
const ITEM_TYPES = new Set([
  "weapon",
  "armor",
  "magic item",
  "superior implement",
  "gear",
]);

function entityFor(tag: string, lookup: Lookups): ContentEntity | undefined {
  const value = key(tag).replace(/ association$/u, "");
  return lookup.byId.get(value) ?? lookup.byName.get(value);
}

function isAugment(entity: ContentEntity): boolean {
  return /augment|dragonshard/iu.test(field(entity, "Magic Item Type") ?? "");
}

/** Records a stat name names (powers, items, keyword carriers). */
function statContext(
  name: string,
  vocabulary: ShapeVocabulary,
  lookup: Lookups,
): ProbeContext {
  const trimmed = name.trim().replace(/^(ally|beast|familiar|summon)\./iu, "");
  const colon = trimmed.indexOf(":");
  if (colon <= 0) {
    const entity = /^id_/iu.test(trimmed)
      ? lookup.byId.get(key(trimmed.split(" ")[0] ?? ""))
      : undefined;
    return entity !== undefined && GRANTABLE.has(key(entity.type))
      ? { ...EMPTY_CONTEXT, grants: [entity] }
      : EMPTY_CONTEXT;
  }
  const left = trimmed.slice(0, colon);
  const right = trimmed.slice(colon + 1);
  if (/^(resist|freebee|check|vulnerable|immune)$/iu.test(left))
    return EMPTY_CONTEXT;
  const limiter = /^[^()]+?\s*\((.*)\)\s*$/u.exec(right)?.[1];
  const grants: ContentEntity[] = [];
  const items: ContentEntity[] = [];
  const augments: ContentEntity[] = [];
  const notes: string[] = [];
  let namedPower: ContentEntity | undefined;
  const keywordTags: string[] = [];
  const attackTypes: string[] = [];
  const addItem = (entity: ContentEntity) => {
    if (isAugment(entity)) augments.push(entity);
    else items.push(entity);
  };
  for (const tag of [...left.split(","), ...(limiter ? [limiter] : [])]) {
    const value = key(tag);
    if (value === "") continue;
    const tagClass = classifyTag(value, vocabulary);
    if (tagClass === "<damage type>" || tagClass === "<keyword>") {
      keywordTags.push(value);
      continue;
    }
    if (["melee", "ranged", "close", "area"].includes(value)) {
      attackTypes.push(value);
      continue;
    }
    if (value === "implement" || value === "weapon") {
      keywordTags.push(value);
      continue;
    }
    if (tagClass === "<weapon group>") {
      const group = value.replace(/ group$/u, "");
      const weapon = lookup.weapons.find((candidate) =>
        (field(candidate, "Group") ?? "")
          .split(",")
          .some((entry) => key(entry) === group),
      );
      if (weapon === undefined) notes.push(`no weapon in group ${group}`);
      else items.push(weapon);
      continue;
    }
    if (tagClass === "<implement kind>") {
      // A magic implement of that kind: mundane "<Kind> Implement" gear is
      // not an implement loadout, so it would hide the bonus.
      const kind = value.replace(/ implement$/u, "");
      const implement = lookup.implements.find(
        (candidate) => key(field(candidate, "Magic Item Type") ?? "") === kind,
      );
      if (implement === undefined) notes.push(`no magic ${kind} implement`);
      else items.push(implement);
      continue;
    }
    const entity = entityFor(value, lookup);
    if (entity === undefined) continue;
    if (ITEM_TYPES.has(key(entity.type))) addItem(entity);
    else if (GRANTABLE.has(key(entity.type))) {
      grants.push(entity);
      if (key(entity.type) === "power") namedPower ??= entity;
    } else notes.push(`${entity.type} ${entity.name} not added`);
  }
  if (
    (keywordTags.length > 0 || attackTypes.length > 0) &&
    !grants.some((entity) => key(entity.type) === "power")
  ) {
    const power = lookup.powers.find((candidate) => {
      const keywords = new Set(
        (field(candidate, "Keywords") ?? "").split(",").map(key),
      );
      const attackType = key(field(candidate, "Attack Type") ?? "");
      return (
        keywordTags.every((tag) => keywords.has(tag)) &&
        attackTypes.every((tag) => attackType.includes(tag))
      );
    });
    if (power === undefined)
      notes.push(`no attack power with ${[...keywordTags, ...attackTypes]}`);
    else grants.push(power);
  }
  return {
    grants,
    items,
    augments,
    notes,
    ...(namedPower === undefined ? {} : { namedPower }),
  };
}

function modifyContext(
  use: ModifierUse,
  lookup: Lookups,
): ProbeContext | string {
  const attributes = use.attributes;
  if (attributes.select !== undefined) return "select-target";
  const name = key(attributes.name ?? "");
  if (name === "") return EMPTY_CONTEXT;
  if (name === "this" || name === "baseitem") return EMPTY_CONTEXT;
  const target =
    lookup.byId.get(name) ??
    [...lookup.byId.values()].find(
      (entity) =>
        key(entity.name) === name &&
        (attributes.type === undefined ||
          key(entity.type) === key(attributes.type)),
    );
  if (target === undefined) return "unresolved-target";
  if (ITEM_TYPES.has(key(target.type)))
    return { ...EMPTY_CONTEXT, items: [target] };
  return { ...EMPTY_CONTEXT, grants: [target] };
}

/**
 * The provider a `this`/`BaseItem` modify targets, cloned so the rule can be
 * toggled: an item is equipped, anything else granted.
 */
function providerClone(
  use: ModifierUse,
  lookup: Lookups,
): { entity: ContentEntity; as: "item" | "grant" } | undefined {
  if (use.kind !== "modify") return undefined;
  const name = key(use.attributes.name ?? "");
  const provider = lookup.byId.get(key(use.entityId));
  if ((name !== "this" && name !== "baseitem") || provider === undefined)
    return undefined;
  return {
    entity: provider,
    as: ITEM_TYPES.has(key(provider.type)) ? "item" : "grant",
  };
}

/** Whether an occurrence, contribution or overlay id belongs to the probe. */
function isProbeProvider(id: string): boolean {
  return id.startsWith(PROBE_OCCURRENCE) || id.startsWith(CLONE_ITEM);
}

/** Companion stat prefixes and whether a base has that companion. */
const COMPANION_STATS: readonly {
  readonly prefix: RegExp;
  readonly name: string;
  readonly present: (evaluation: EvaluatedCharacter) => boolean;
}[] = [
  {
    prefix: /^beast\./iu,
    name: "beast companion",
    present: (evaluation) => evaluation.beastCompanion !== undefined,
  },
  {
    prefix: /^(?:familiar|companion|summon|spirit)\./iu,
    name: "familiar or companion",
    present: () => false,
  },
];

interface ProbeSpec {
  readonly index: number;
  readonly use: ModifierUse;
  readonly shape: string;
  readonly context: ProbeContext;
  readonly baselineId: string;
  readonly probeId: string;
  /** When set, the probe toggles a clone of this provider. */
  readonly cloneOf?: ContentEntity;
  /** The clone is equipped (item) or granted by the carrier. */
  readonly cloneAs?: "item" | "grant";
  /** A power the stat name names, whose line must exist to observe it. */
  readonly linePower?: {
    readonly id: string;
    readonly field: "attack" | "damage";
  };
  readonly skipped?: string;
}

type Outcome =
  | "power"
  | "sheet"
  | "stat-only"
  | "editor"
  | "text-only"
  | "overlay-only"
  | "overlay-unmatched"
  | "absent"
  | `not-applied:${string}`
  | `not-probed:${string}`;

/** Visible somewhere: a power line, the sheet, or an editor consumer. */
const SURFACED: ReadonlySet<Outcome> = new Set(["power", "sheet", "editor"]);

interface ProbeResult {
  readonly entityId: string;
  readonly entityName: string;
  readonly entityType: string;
  readonly rule: string;
  readonly outcome: Outcome;
  readonly base?: string;
  readonly perBase: Readonly<Record<string, Outcome>>;
  readonly evidence: readonly string[];
  readonly contextNotes: readonly string[];
}

function ruleText(rule: RuleStatement): string {
  return `<${rule.name} ${rule.attributes
    .map((attribute) => `${attribute.name}="${attribute.value}"`)
    .join(" ")}/>`;
}

function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (value === null || typeof value !== "object") {
    out.set(path, String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flatten(entry, `${path}[${index}]`, out));
    return;
  }
  for (const [name, entry] of Object.entries(value)) {
    if (
      /^(?:provenanceId|occurrenceId|providerOccurrenceId|definitionId|id)$/u.test(
        name,
      )
    )
      continue;
    flatten(entry, `${path}.${name}`, out);
  }
}

function differences(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .map((path) => `${path}: ${before.get(path)} -> ${after.get(path)}`);
}

interface Evaluated {
  readonly evaluation: EvaluatedCharacter;
  readonly powers: ReadonlyMap<string, string>;
  /** Engine outputs the editor reads besides the sheet: freebee gifts,
   *  granted known records, free-ritual allowances. */
  readonly editor: ReadonlyMap<string, string>;
  sheet?: ReadonlyMap<string, string>;
}

class Prober {
  readonly #entities: readonly ContentEntity[];
  readonly #baselines = new Map<string, Evaluated>();
  readonly #lookup: Lookups;

  constructor(entities: readonly ContentEntity[], lookup: Lookups) {
    this.#entities = entities;
    this.#lookup = lookup;
  }

  #input(base: BaseCharacter, spec: ProbeSpec, probe: boolean) {
    const carrierId = probe ? spec.probeId : spec.baselineId;
    const inventory: CharacterInventoryEntry[] = [...base.input.inventory];
    const baseWeapon = inventory.find(
      (entry) =>
        entry.equippedQuantity > 0 &&
        key(
          this.#lookup.byId.get(key(entry.definitionIds[0] ?? ""))?.type ?? "",
        ) === "weapon",
    )?.definitionIds[0];
    const baseArmor = inventory.find(
      (entry) =>
        entry.equippedQuantity > 0 &&
        key(
          this.#lookup.byId.get(key(entry.definitionIds[0] ?? ""))?.type ?? "",
        ) === "armor",
    )?.definitionIds[0];
    const itemEntry = (entity: ContentEntity, id: string, entryId: string) => {
      const magicType = key(field(entity, "Magic Item Type") ?? "");
      const pair =
        key(entity.type) !== "magic item"
          ? undefined
          : magicType.includes("weapon")
            ? (baseWeapon ?? this.#lookup.byName.get("longsword")?.id)
            : magicType.includes("armor")
              ? (baseArmor ?? this.#lookup.byName.get("leather armor")?.id)
              : undefined;
      return {
        id: entryId,
        definitionIds: pair === undefined ? [id] : [pair, id],
        quantity: 1,
        equippedQuantity: 1,
        acquiredLevel: 1,
      } satisfies CharacterInventoryEntry;
    };
    spec.context.items.forEach((entity, serial) =>
      inventory.push(itemEntry(entity, entity.id, `audit:item:${serial}`)),
    );
    if (spec.cloneOf !== undefined && spec.cloneAs === "item")
      inventory.push(itemEntry(spec.cloneOf, carrierId, CLONE_ITEM));
    if (spec.context.augments.length > 0) {
      const augment = spec.context.augments[0]!;
      const binding = `<CharLootID><baseID>${augment.id}</baseID></CharLootID>`;
      for (const [index, entry] of inventory.entries())
        if (entry.equippedQuantity > 0)
          inventory[index] = {
            ...entry,
            overrides: { ...entry.overrides, augment: binding },
          };
      inventory.push({
        id: "audit:augment",
        definitionIds: [augment.id],
        quantity: 1,
        equippedQuantity: 0,
        acquiredLevel: 1,
      });
    }
    return {
      ...base.input,
      candidateDetailLevels: [],
      inventory,
      occurrences: [
        ...base.input.occurrences,
        ...(spec.cloneAs !== "item"
          ? [
              {
                id: PROBE_OCCURRENCE,
                definitionId: carrierId,
                acquiredLevel: 1,
                kind: "grabbag" as const,
              },
            ]
          : []),
      ],
    } satisfies EvaluationInput;
  }

  #evaluate(base: BaseCharacter, spec: ProbeSpec, probe: boolean): Evaluated {
    const evaluation = evaluateCharacter(
      this.#input(base, spec, probe),
      this.#entities,
    );
    const powers = new Map<string, string>();
    flatten(evaluation.powers, "", powers);
    const lookup = (id: string) => this.#lookup.byId.get(key(id));
    const editor = new Map<string, string>();
    flatten(
      {
        freebees: pendingFreebeeItems(base.build, evaluation, lookup),
        known: grantedKnownRecords(evaluation, lookup),
        rituals: freeRitualAllowanceTexts(evaluation),
      },
      "",
      editor,
    );
    return { evaluation, powers, editor };
  }

  #sheet(base: BaseCharacter, evaluated: Evaluated) {
    if (evaluated.sheet === undefined) {
      const sheet = new Map<string, string>();
      try {
        flatten(
          buildEvaluatedSheetModel(
            base.snapshot,
            base.build,
            evaluated.evaluation,
            this.#entities,
          ),
          "",
          sheet,
        );
      } catch (error) {
        sheet.set("<error>", String(error));
      }
      evaluated.sheet = sheet;
    }
    return evaluated.sheet;
  }

  #baseline(base: BaseCharacter, spec: ProbeSpec): Evaluated {
    const cacheKey = `${base.label}\0${spec.baselineId}`;
    const cached = this.#baselines.get(cacheKey);
    if (cached !== undefined) return cached;
    const evaluated = this.#evaluate(base, spec, false);
    this.#baselines.set(cacheKey, evaluated);
    return evaluated;
  }

  probe(
    base: BaseCharacter,
    spec: ProbeSpec,
  ): { outcome: Outcome; evidence: string[] } {
    const baseline = this.#baseline(base, spec);
    const probed = this.#evaluate(base, spec, true);
    if (!probed.evaluation.converged)
      return { outcome: "not-probed:nonconvergent", evidence: [] };
    const powerDiff = differences(baseline.powers, probed.powers);
    if (powerDiff.length > 0)
      return { outcome: "power", evidence: powerDiff.slice(0, 3) };
    const editorDiff = differences(baseline.editor, probed.editor);
    if (editorDiff.length > 0)
      return { outcome: "editor", evidence: editorDiff.slice(0, 3) };
    const contributions = Object.values(probed.evaluation.stats).flatMap(
      (stat) =>
        stat.contributions
          .filter((contribution) => isProbeProvider(contribution.id))
          .map((contribution) => ({ stat: stat.name, contribution })),
    );
    const statDiff = Object.entries(probed.evaluation.stats).flatMap(
      ([name, stat]) =>
        String(baseline.evaluation.stats[name]?.value ?? 0) ===
        String(stat.value)
          ? []
          : [
              `${name}: ${baseline.evaluation.stats[name]?.value} -> ${stat.value}`,
            ],
    );
    const textDiff =
      JSON.stringify(baseline.evaluation.textStrings) !==
      JSON.stringify(probed.evaluation.textStrings);
    const overlays = probed.evaluation.overlays.filter((overlay) =>
      isProbeProvider(overlay.providerOccurrenceId),
    );
    const anything =
      statDiff.length > 0 ||
      textDiff ||
      overlays.length > 0 ||
      probed.evaluation.overlays.length !==
        baseline.evaluation.overlays.length ||
      contributions.length > 0;
    if (anything) {
      const sheetDiff = differences(
        this.#sheet(base, baseline),
        this.#sheet(base, probed),
      );
      if (sheetDiff.length > 0)
        return { outcome: "sheet", evidence: sheetDiff.slice(0, 3) };
    }
    if (spec.use.kind === "statadd") {
      const companion = COMPANION_STATS.find(({ prefix }) =>
        prefix.test(spec.use.attributes.name ?? ""),
      );
      if (companion !== undefined && !companion.present(probed.evaluation))
        return {
          outcome: `not-probed:no ${companion.name} on base`,
          evidence: [],
        };
      const line = spec.linePower;
      if (line !== undefined) {
        const power = probed.evaluation.powers.find(
          (candidate) => key(candidate.definitionId) === key(line.id),
        );
        const observable = power?.variants.some((variant) =>
          line.field === "attack"
            ? variant.attackBonus !== undefined
            : variant.damage !== undefined,
        );
        if (observable !== true)
          return {
            outcome: `not-probed:power has no ${line.field} line`,
            evidence: [
              power === undefined ? "power not evaluated" : power.name,
            ],
          };
      }
      const applied = contributions.filter(
        ({ contribution }) => contribution.applied,
      );
      if (applied.length > 0 || statDiff.length > 0)
        return {
          outcome: "stat-only",
          evidence: [
            ...statDiff.slice(0, 3),
            ...applied.map(
              ({ stat, contribution }) =>
                `${stat} += ${contribution.numericValue ?? contribution.value}`,
            ),
          ].slice(0, 3),
        };
      const reason = contributions[0]?.contribution.reason;
      if (reason !== undefined)
        return {
          outcome: `not-applied:${reason}`,
          evidence: contributions.map(({ stat }) => stat).slice(0, 1),
        };
      return { outcome: "absent", evidence: [] };
    }
    if (spec.use.kind === "textstring")
      return textDiff
        ? { outcome: "text-only", evidence: [] }
        : { outcome: "absent", evidence: [] };
    if (overlays.length === 0) return { outcome: "absent", evidence: [] };
    return overlays.some((overlay) => overlay.targetDefinitionIds.length > 0)
      ? {
          outcome: "overlay-only",
          evidence: overlays
            .map((overlay) => overlay.targetDefinitionIds.join(","))
            .slice(0, 2),
        }
      : { outcome: "overlay-unmatched", evidence: [] };
  }
}

interface ShapeReport {
  readonly shape: string;
  readonly kind: string;
  readonly status: "applied" | "partial" | "ignored" | "not-probed";
  readonly entityCount: number;
  readonly ruleCount: number;
  readonly distinctNames: number;
  readonly exampleNames: readonly string[];
  readonly outcomes: Readonly<Record<string, number>>;
  readonly probes: readonly ProbeResult[];
}

function shapeStatus(probes: readonly ProbeResult[]): ShapeReport["status"] {
  const probed = probes.filter(
    (probe) => !probe.outcome.startsWith("not-probed"),
  );
  if (probed.length === 0) return "not-probed";
  const surfaced = probed.filter((probe) => SURFACED.has(probe.outcome));
  if (surfaced.length === probed.length) return "applied";
  return surfaced.length > 0 ? "partial" : "ignored";
}

interface SelectorReport {
  readonly shape: string;
  readonly entityCount: number;
  readonly examples: readonly {
    readonly selector: string;
    readonly item?: string;
    readonly result:
      "recognized" | "not-recognized" | "no-matching-item" | "not-probed";
  }[];
}

function matchingItem(
  selector: string,
  lookup: Lookups,
  entities: readonly ContentEntity[],
): ContentEntity | undefined {
  const value = key(selector);
  const prefixed = /^([a-z-]+):(.*)$/u.exec(value);
  const operand = (prefixed?.[2] ?? "").trim();
  const terms = operand
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term !== "" && !term.startsWith("!"));
  const has = (entity: ContentEntity, term: string) =>
    [
      entity.name,
      entity.type,
      ...entity.categories,
      ...[
        "Armor Type",
        "Armor Category",
        "Weapon Category",
        "Group",
        "Properties",
        "Weapon Property",
        "Item Slot",
        "Hands Required",
        "Magic Item Type",
      ].flatMap((name) => (field(entity, name) ?? "").split(",")),
    ].some((entry) => key(entry) === term || key(entry).startsWith(term));
  switch (prefixed?.[1]) {
    case "armor":
      return entities.find(
        (entity) =>
          key(entity.type) === "armor" &&
          terms.every((term) => has(entity, term)),
      );
    case "weapon":
    case "only-weapon":
      return lookup.weapons.find((entity) =>
        terms.every((term) => has(entity, term)),
      );
    case "implement":
      return entities.find(
        (entity) =>
          /implement|holy symbol|ki focus|orb|rod|staff|tome|totem|wand/iu.test(
            `${field(entity, "Magic Item Type") ?? ""} ${entity.name}`,
          ) &&
          ITEM_TYPES.has(key(entity.type)) &&
          terms.every((term) => has(entity, term)),
      );
    case "slot":
      return entities.find(
        (entity) =>
          ITEM_TYPES.has(key(entity.type)) &&
          key(field(entity, "Item Slot") ?? "") === operand,
      );
    case "versatile":
    case "defensive":
      return lookup.weapons.find((entity) => has(entity, prefixed?.[1] ?? ""));
    case undefined:
      return lookup.byName.get(value);
    default:
      return undefined;
  }
}

interface ShardResult {
  readonly bases: readonly string[];
  readonly reports: readonly ShapeReport[];
  readonly selectors: readonly SelectorReport[];
}

async function probeShard(
  options: Options,
  shard: { readonly index: number; readonly count: number },
): Promise<ShardResult> {
  const pack = await loadPack(options.packPath);
  const vocabulary = shapeVocabulary(pack.entities);
  const lookup = lookups(pack.entities);
  const uses = collectModifierUses(pack.entities);
  const groups = groupByShape(uses, (use) => modifierShape(use, vocabulary))
    .filter(
      (group) =>
        (options.kinds === undefined || options.kinds.has(group.kind)) &&
        (options.match === undefined || options.match.test(group.shape)),
    )
    .slice(0, options.shapeLimit)
    .filter((_, index) => index % shard.count === shard.index);
  const qualifierGroups =
    shard.index === 0
      ? groupByShape(uses, (use) => qualifierShapes(use, vocabulary))
      : [];

  // Phase 1: probe specs and their carriers, so one entity array (and one
  // shared rules index) serves every evaluation.
  const carriers: ContentEntity[] = [];
  const baselineIds = new Map<string, string>();
  const specs = new Map<string, ProbeSpec[]>();
  let serial = 0;
  for (const group of groups) {
    const list: ProbeSpec[] = [];
    for (const use of representativeUses(group, options.examples)) {
      const index = serial++;
      const probeId = `AUDIT_PROBE_${index}`;
      const cloned = providerClone(use, lookup);
      const clone = cloned?.as === "item" ? cloned.entity : undefined;
      const context =
        use.kind === "modify"
          ? modifyContext(use, lookup)
          : statContext(use.attributes.name ?? "", vocabulary, lookup);
      if (typeof context === "string") {
        list.push({
          index,
          use,
          shape: group.shape,
          context: EMPTY_CONTEXT,
          baselineId: "",
          probeId,
          skipped: context,
        });
        continue;
      }
      const contextRules = context.grants.map((entity, ordinal) =>
        statement("grant", { name: entity.id, type: entity.type }, ordinal),
      );
      const grantClone = (id: string) =>
        cloned?.as === "grant"
          ? [
              statement(
                "grant",
                { name: id, type: cloned.entity.type },
                contextRules.length,
              ),
            ]
          : [];
      if (cloned?.as === "grant") {
        carriers.push(
          carrier(`AUDIT_CLONE_BASE_${index}`, [], cloned.entity),
          carrier(
            `AUDIT_CLONE_PROBE_${index}`,
            [probeRule(use)],
            cloned.entity,
          ),
        );
      }
      const signature = JSON.stringify([
        context.grants.map(({ id }) => id),
        context.items.map(({ id }) => id),
        context.augments.map(({ id }) => id),
        cloned === undefined ? "" : index,
      ]);
      let baselineId = baselineIds.get(signature);
      if (baselineId === undefined) {
        baselineId = `AUDIT_BASELINE_${baselineIds.size}`;
        baselineIds.set(signature, baselineId);
        carriers.push(
          carrier(
            baselineId,
            [...contextRules, ...grantClone(`AUDIT_CLONE_BASE_${index}`)],
            clone,
          ),
        );
      }
      carriers.push(
        carrier(
          probeId,
          cloned?.as === "grant"
            ? [...contextRules, ...grantClone(`AUDIT_CLONE_PROBE_${index}`)]
            : [...contextRules, probeRule(use)],
          clone,
        ),
      );
      const lineField = /:(attack|damage)\b/iu
        .exec(use.attributes.name ?? "")?.[1]
        ?.toLocaleLowerCase();
      list.push({
        index,
        use,
        shape: group.shape,
        context,
        baselineId,
        probeId,
        ...(cloned === undefined
          ? {}
          : { cloneOf: cloned.entity, cloneAs: cloned.as }),
        ...(use.kind === "statadd" &&
        context.namedPower !== undefined &&
        (lineField === "attack" || lineField === "damage")
          ? { linePower: { id: context.namedPower.id, field: lineField } }
          : {}),
      });
    }
    specs.set(group.shape, list);
  }
  const entities = [...pack.entities, ...carriers];
  const bases: BaseCharacter[] = [];
  for (const path of options.bases) {
    const imported = importDnd4e(await readFile(resolve(path), "utf8"));
    bases.push({
      label: imported.snapshot.details.name ?? path,
      build: imported.build,
      snapshot: imported.snapshot,
      input: projectBuildForEvaluation(imported.build, entities),
    });
  }
  const prober = new Prober(entities, lookup);

  // Phase 2: probe each example on each base until it surfaces.
  const reports: ShapeReport[] = [];
  const started = performance.now();
  let done = 0;
  const total = [...specs.values()].reduce((sum, list) => sum + list.length, 0);
  for (const group of groups) {
    const probes: ProbeResult[] = [];
    for (const spec of specs.get(group.shape) ?? []) {
      done += 1;
      const common = {
        entityId: spec.use.entityId,
        entityName: spec.use.entityName,
        entityType: spec.use.entityType,
        rule: ruleText(spec.use.rule),
        contextNotes: [
          ...spec.context.grants.map(
            (entity) => `+${entity.type} ${entity.name}`,
          ),
          ...spec.context.items.map((entity) => `+item ${entity.name}`),
          ...spec.context.augments.map((entity) => `+augment ${entity.name}`),
          ...(spec.cloneOf === undefined
            ? []
            : [`clone of ${spec.cloneOf.name}`]),
          ...spec.context.notes,
        ],
      };
      if (spec.skipped !== undefined) {
        probes.push({
          ...common,
          outcome: `not-probed:${spec.skipped}`,
          perBase: {},
          evidence: [],
        });
        continue;
      }
      const perBase: Record<string, Outcome> = {};
      let best: { outcome: Outcome; evidence: string[]; base?: string } = {
        outcome: "absent",
        evidence: [],
      };
      const rank = (outcome: Outcome) =>
        SURFACED.has(outcome)
          ? 3
          : outcome === "stat-only" ||
              outcome === "overlay-only" ||
              outcome === "text-only"
            ? 2
            : outcome === "absent"
              ? 0
              : 1;
      for (const base of bases) {
        let result: { outcome: Outcome; evidence: string[] };
        try {
          result = prober.probe(base, spec);
        } catch (error) {
          result = {
            outcome: "not-probed:error",
            evidence: [String(error).slice(0, 200)],
          };
        }
        perBase[base.label] = result.outcome;
        if (
          rank(result.outcome) > rank(best.outcome) ||
          best.base === undefined
        )
          best = { ...result, base: base.label };
        if (SURFACED.has(result.outcome)) break;
      }
      probes.push({
        ...common,
        outcome: best.outcome,
        ...(best.base === undefined ? {} : { base: best.base }),
        perBase,
        evidence: best.evidence,
      });
    }
    const outcomes: Record<string, number> = {};
    for (const probe of probes)
      outcomes[probe.outcome] = (outcomes[probe.outcome] ?? 0) + 1;
    reports.push({
      shape: group.shape,
      kind: group.kind,
      status: shapeStatus(probes),
      entityCount: group.entityCount,
      ruleCount: group.uses.length,
      distinctNames: group.names.size,
      exampleNames: [...group.names.keys()].slice(0, 6),
      outcomes,
      probes,
    });
    if (done % 50 < (specs.get(group.shape)?.length ?? 1))
      process.stderr.write(
        `shard ${shard.index}: probed ${done}/${total} examples (${Math.round((performance.now() - started) / 1000)}s)\n`,
      );
  }

  // Equipment selectors: a statadd gated on the selector, with an item the
  // selector should match equipped (wearing) or the same item (not-wearing).
  const selectorReports: SelectorReport[] = [];
  const selectorCarriers: ContentEntity[] = [];
  const selectorSpecs: {
    shape: string;
    selector: string;
    negate: boolean;
    item?: ContentEntity;
    probeId: string;
  }[] = [];
  for (const group of qualifierGroups) {
    const match = /^(statadd|textstring) (wearing|not-wearing)=/u.exec(
      group.shape,
    );
    if (match === null) continue;
    const attribute = match[2] ?? "wearing";
    const seen = new Set<string>();
    for (const use of group.uses) {
      const selector = use.attributes[attribute] ?? "";
      if (seen.has(key(selector)) || seen.size >= options.examples) continue;
      seen.add(key(selector));
      const probeId = `AUDIT_SELECTOR_${selectorSpecs.length}`;
      const item = matchingItem(selector, lookup, pack.entities);
      selectorCarriers.push(
        carrier(probeId, [
          statement(
            "statadd",
            {
              name: "Audit Selector Probe",
              value: "+1",
              [attribute]: selector,
            },
            0,
          ),
        ]),
      );
      selectorSpecs.push({
        shape: group.shape,
        selector,
        negate: attribute === "not-wearing",
        ...(item === undefined ? {} : { item }),
        probeId,
      });
    }
  }
  const selectorEntities = [...pack.entities, ...selectorCarriers];
  const selectorBase = bases[0];
  const selectorInput: EvaluationInput | undefined =
    selectorBase === undefined
      ? undefined
      : {
          ...projectBuildForEvaluation(selectorBase.build, selectorEntities),
          candidateDetailLevels: [],
          includePowers: false,
        };
  const selectorResults = new Map<
    string,
    SelectorReport["examples"][number][]
  >();
  for (const spec of selectorSpecs) {
    const list = selectorResults.get(spec.shape) ?? [];
    selectorResults.set(spec.shape, list);
    if (spec.item === undefined || selectorInput === undefined) {
      list.push({
        selector: spec.selector,
        // Dual selectors need two matching items; not modeled here.
        result: /^dual-/iu.test(spec.selector.trim())
          ? "not-probed"
          : "no-matching-item",
      });
      continue;
    }
    const pair =
      key(spec.item.type) === "magic item" &&
      /weapon/iu.test(field(spec.item, "Magic Item Type") ?? "")
        ? lookup.byName.get("longsword")?.id
        : key(spec.item.type) === "magic item" &&
            /armor/iu.test(field(spec.item, "Magic Item Type") ?? "")
          ? lookup.byName.get("leather armor")?.id
          : undefined;
    const input = selectorInput;
    // Only the probe item is equipped, so the selector sees it alone.
    const evaluated = evaluateCharacter(
      {
        ...input,
        inventory: [
          ...input.inventory.map((entry) => ({
            ...entry,
            equippedQuantity: 0,
          })),
          {
            id: "audit:selector-item",
            definitionIds:
              pair === undefined ? [spec.item.id] : [pair, spec.item.id],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        occurrences: [
          ...input.occurrences,
          {
            id: PROBE_OCCURRENCE,
            definitionId: spec.probeId,
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
      },
      selectorEntities,
    );
    const contribution =
      evaluated.stats["Audit Selector Probe"]?.contributions[0];
    const applied = contribution?.applied === true;
    list.push({
      selector: spec.selector,
      item: spec.item.name,
      result:
        contribution === undefined
          ? "not-probed"
          : applied !== spec.negate
            ? "recognized"
            : "not-recognized",
    });
  }
  for (const group of qualifierGroups) {
    const examples = selectorResults.get(group.shape);
    if (examples === undefined) continue;
    selectorReports.push({
      shape: group.shape,
      entityCount: group.entityCount,
      examples,
    });
  }

  return {
    bases: bases.map(({ label }) => label),
    reports,
    selectors: selectorReports,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const started = performance.now();
  if (options.shard !== undefined) {
    const result = await probeShard(options, options.shard);
    await writeFile(
      options.out ?? `${OUTPUT_DIRECTORY}/modifiers.shard.json`,
      JSON.stringify(result),
    );
    return;
  }
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const results =
    options.jobs <= 1
      ? [await probeShard(options, { index: 0, count: 1 })]
      : await runShards(options);
  const reports = results
    .flatMap((result) => result.reports)
    .toSorted(
      (left, right) =>
        right.entityCount - left.entityCount ||
        left.shape.localeCompare(right.shape),
    );
  const selectorReports = results.flatMap((result) => result.selectors);
  const bases = results[0]?.bases ?? [];
  const pack = await loadPack(options.packPath);
  const vocabulary = shapeVocabulary(pack.entities);
  const uses = collectModifierUses(pack.entities);
  const linked = linkedStatNames(uses);
  const qualifierGroups = groupByShape(uses, (use) =>
    qualifierShapes(use, vocabulary),
  );
  const neverRead = reports
    .filter((report) => report.kind === "statadd")
    .flatMap((report) =>
      report.probes
        .filter((probe) => probe.outcome === "stat-only")
        .map((probe) => {
          const name = /name="([^"]*)"/u.exec(probe.rule)?.[1] ?? "";
          return {
            name,
            shape: report.shape,
            entityCount: report.entityCount,
            linkedBy: linked.get(key(name)) ?? 0,
          };
        }),
    )
    .filter(
      (entry, index, all) =>
        all.findIndex((other) => key(other.name) === key(entry.name)) === index,
    );

  const qualifierSummary = qualifierGroups.map((group) => ({
    shape: group.shape,
    entityCount: group.entityCount,
    ruleCount: group.uses.length,
  }));
  const summary = {
    pack: options.packPath,
    bases,
    elapsedSeconds: Math.round((performance.now() - started) / 1000),
    totals: {
      uses: uses.length,
      shapes: reports.length,
      byStatus: Object.fromEntries(
        ["applied", "partial", "ignored", "not-probed"].map((status) => [
          status,
          reports.filter((report) => report.status === status).length,
        ]),
      ),
    },
    shapes: reports,
    selectors: selectorReports,
    qualifiers: qualifierSummary,
    neverRead,
  };
  await writeFile(
    `${OUTPUT_DIRECTORY}/modifiers.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    `${OUTPUT_DIRECTORY}/modifiers.md`,
    markdown(summary, reports, selectorReports),
  );
  process.stdout.write(
    `${JSON.stringify({ ...summary.totals, elapsedSeconds: summary.elapsedSeconds, report: `${OUTPUT_DIRECTORY}/modifiers.md` })}\n`,
  );
}

/** Runs `options.jobs` shard processes and collects their results. */
async function runShards(options: Options): Promise<ShardResult[]> {
  const passthrough = process.argv
    .slice(2)
    .filter(
      (argument, index, all) =>
        argument !== "--jobs" && all[index - 1] !== "--jobs",
    );
  return Promise.all(
    Array.from({ length: options.jobs }, (_, index) => {
      const out = `${OUTPUT_DIRECTORY}/modifiers.shard-${index}.json`;
      return new Promise<ShardResult>((done, fail) => {
        const child = spawn(
          process.execPath,
          [
            ...process.execArgv,
            process.argv[1]!,
            ...passthrough,
            "--shard",
            `${index}/${options.jobs}`,
            "--out",
            out,
          ],
          { stdio: ["ignore", "inherit", "inherit"] },
        );
        child.on("error", fail);
        child.on("exit", (code) => {
          if (code !== 0) {
            fail(new Error(`shard ${index} exited with ${code}`));
            return;
          }
          readFile(out, "utf8")
            .then((text) => done(JSON.parse(text) as ShardResult))
            .catch(fail);
        });
      });
    }),
  );
}
function markdown(
  summary: {
    pack: string;
    bases: readonly string[];
    neverRead: readonly {
      name: string;
      shape: string;
      entityCount: number;
      linkedBy: number;
    }[];
  },
  reports: readonly ShapeReport[],
  selectors: readonly SelectorReport[],
): string {
  const gaps = reports.filter(
    (report) => report.status === "ignored" || report.status === "partial",
  );
  const lines = [
    "# Modifier-kind audit",
    "",
    `Pack: \`${summary.pack}\`. Bases: ${summary.bases.join(", ")}.`,
    "",
    "## Ignored or partially applied shapes (ranked by entities)",
    "",
    "| Entities | Rules | Status | Shape | Outcomes | Example |",
    "| ---: | ---: | --- | --- | --- | --- |",
    ...gaps.map((report) => {
      const example =
        report.probes.find((probe) => !SURFACED.has(probe.outcome)) ??
        report.probes[0];
      return `| ${report.entityCount} | ${report.ruleCount} | ${report.status} | \`${report.shape}\` | ${Object.entries(
        report.outcomes,
      )
        .map(([outcome, count]) => `${outcome}×${count}`)
        .join(
          ", ",
        )} | ${example === undefined ? "" : `${example.entityName}: \`${example.rule.replaceAll("|", "\\|")}\``} |`;
    }),
    "",
    "## Equipment selectors",
    "",
    "| Entities | Shape | Results |",
    "| ---: | --- | --- |",
    ...selectors.map(
      (report) =>
        `| ${report.entityCount} | \`${report.shape}\` | ${report.examples
          .map(
            (example) =>
              `${example.selector} → ${example.result}${example.item ? ` (${example.item})` : ""}`,
          )
          .join("; ")} |`,
    ),
    "",
    "## Stat names written but never read",
    "",
    "Probed names whose contribution applied but changed no total, power or",
    "sheet value. `linked by` counts statadds elsewhere whose value links to",
    "the name (read only through those).",
    "",
    "| Name | Shape | Shape entities | Linked by |",
    "| --- | --- | ---: | ---: |",
    ...summary.neverRead.map(
      (entry) =>
        `| ${entry.name} | \`${entry.shape}\` | ${entry.entityCount} | ${entry.linkedBy} |`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

await main();
