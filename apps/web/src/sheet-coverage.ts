/**
 * Sheet completeness and choice reachability for generated characters
 * (docs/coverage-audit-proposal.md, steps 3 and 4). Pure functions used by the
 * private `pnpm audit:coverage-matrix`; public tests use synthetic data.
 */
import type { ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";
import {
  SHEET_IDENTITY_TYPES,
  type CharacterSheetModel,
} from "@4ecb/sheet-model";

import {
  contentTypeCoverage,
  type ContentTypeCoverage,
  type SheetSurface,
} from "./content-type-coverage";
import { isItemEntity } from "./EntityCard";

const key = (value: string) => value.trim().toLocaleLowerCase();

/** What a built sheet shows, indexed for occurrence lookups. */
export interface SheetIndex {
  /** Feature labels by group (content type), lower-cased. */
  readonly features: ReadonlyMap<string, ReadonlySet<string>>;
  /** Identity values by the content type that fills them, lower-cased. */
  readonly identity: ReadonlyMap<string, ReadonlySet<string>>;
  readonly powerIds: ReadonlySet<string>;
  readonly powerNames: ReadonlySet<string>;
  readonly itemIds: ReadonlySet<string>;
  readonly itemNames: readonly string[];
  readonly referenceIds: ReadonlySet<string>;
  readonly referenceNames: ReadonlySet<string>;
  readonly companionIds: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
  /** Definitions chosen under a listed feature, shown on its row. */
  readonly choiceIds: ReadonlySet<string>;
  /** Proficiency definitions the proficiency list shows or covers. */
  readonly proficiencyIds: ReadonlySet<string>;
}

export function sheetIndex(sheet: CharacterSheetModel): SheetIndex {
  const features = new Map<string, Set<string>>();
  for (const group of sheet.features) {
    const labels = features.get(key(group.group)) ?? new Set<string>();
    for (const entry of group.entries) labels.add(key(entry.label));
    features.set(key(group.group), labels);
  }
  const identity = new Map<string, Set<string>>();
  const addIdentity = (type: string, value: string) =>
    identity.set(
      key(type),
      (identity.get(key(type)) ?? new Set<string>()).add(key(value)),
    );
  for (const { label, value } of sheet.identity)
    for (const [type, detailName] of SHEET_IDENTITY_TYPES) {
      if (detailName !== label) continue;
      addIdentity(type, value);
      // A hybrid's classes share the Class line ("Hybrid Cleric / Hybrid Rogue").
      if (type === "Class")
        for (const part of value.split(" / "))
          addIdentity("Hybrid Class", part);
    }
  const ids = (values: readonly { readonly id?: string }[]) =>
    new Set(values.flatMap(({ id }) => (id === undefined ? [] : [key(id)])));
  return {
    features,
    identity,
    powerIds: ids(sheet.powers),
    powerNames: new Set(sheet.powers.map(({ name }) => key(name))),
    itemIds: ids(sheet.items),
    itemNames: sheet.items.map(({ name }) => key(name)),
    referenceIds: ids(sheet.learnedReferences),
    referenceNames: new Set(
      sheet.learnedReferences.map(({ name }) => key(name)),
    ),
    companionIds: ids(sheet.companions),
    skills: new Set(sheet.skills.map(({ label }) => key(label))),
    choiceIds: ids(
      sheet.features.flatMap(({ entries }) =>
        entries.flatMap(({ choices }) => choices ?? []),
      ),
    ),
    proficiencyIds: new Set(
      (sheet.proficiencies ?? []).flatMap(({ definitionIds }) =>
        definitionIds.map(key),
      ),
    ),
  };
}

function selectsHybridClasses(entity: ContentEntity): boolean {
  return entity.rules.some(
    (rule) =>
      key(rule.name) === "select" &&
      rule.attributes.some(
        ({ name, value }) =>
          key(name) === "type" && key(value) === "hybrid class",
      ),
  );
}

/** Every sheet surface that shows the entity. */
export function sheetSurfacesOf(
  entity: ContentEntity,
  index: SheetIndex,
): SheetSurface[] {
  const id = key(entity.id);
  const name = key(entity.name);
  const surfaces: SheetSurface[] = [];
  if (index.features.get(key(entity.type))?.has(name) === true)
    surfaces.push("features");
  if (
    index.identity.get(key(entity.type))?.has(name) === true ||
    // The hybrid marker class (it selects the hybrid classes) is shown as
    // the hybrid classes on the Class line.
    (key(entity.type) === "class" &&
      selectsHybridClasses(entity) &&
      (index.identity.get("hybrid class")?.size ?? 0) > 1)
  )
    surfaces.push("identity");
  // An augmentable power's cards are its augment versions.
  const augmentVersions =
    entity.specifics
      .find((specific) => key(specific.name) === "_augmentversions")
      ?.value.split(",")
      .map(key)
      .filter(Boolean) ?? [];
  if (
    index.powerIds.has(id) ||
    augmentVersions.some((version) => index.powerIds.has(version)) ||
    (key(entity.type) === "power" && index.powerNames.has(name))
  )
    surfaces.push("powers");
  if (
    index.itemIds.has(id) ||
    // A composed item's card names its base item ("Dagger +1 Flaming").
    (isItemEntity(entity) &&
      name.length > 0 &&
      index.itemNames.some((item) => item.includes(name)))
  )
    surfaces.push("items");
  if (index.referenceIds.has(id) || index.referenceNames.has(name))
    surfaces.push("references");
  if (index.companionIds.has(id)) surfaces.push("companions");
  if (index.proficiencyIds.has(id)) surfaces.push("proficiencies");
  // Naming a choice on its feature's row ("Pact Choice: Fey Pact") counts
  // only for what no other surface shows.
  if (surfaces.length === 0 && index.choiceIds.has(id))
    surfaces.push("choices");
  if (key(entity.type) === "skill" && index.skills.has(name))
    surfaces.push("skills");
  return surfaces;
}

export type PresenceStatus =
  /** Shown on at least one sheet surface. */
  | "presented"
  /** Not shown, but the registry says it is internal or applied. */
  | "accounted"
  /** Not shown, and the registry expects it shown, or marks it a gap. */
  | "unpresented"
  /** The occurrence names a definition the pack does not have. */
  | "missing-definition";

export interface OccurrencePresence {
  readonly definitionId: string;
  readonly name: string;
  readonly type: string;
  readonly occurrences: number;
  readonly provider?: {
    readonly id: string;
    readonly name: string;
    readonly type: string;
  };
  readonly surfaces: readonly SheetSurface[];
  readonly coverage: ContentTypeCoverage | undefined;
  readonly status: PresenceStatus;
}

/**
 * One row per active definition (occurrences of the same definition merge,
 * since the sheet shows it once), with the first occurrence's provider.
 */
export function sheetPresence(
  occurrences: readonly CharacterOccurrence[],
  entities: ReadonlyMap<string, ContentEntity>,
  sheet: CharacterSheetModel,
): OccurrencePresence[] {
  const index = sheetIndex(sheet);
  const byOccurrence = new Map(occurrences.map((value) => [value.id, value]));
  const rows = new Map<string, OccurrencePresence>();
  for (const occurrence of occurrences) {
    const definitionKey = key(occurrence.definitionId);
    const existing = rows.get(definitionKey);
    if (existing !== undefined) {
      rows.set(definitionKey, {
        ...existing,
        occurrences: existing.occurrences + 1,
      });
      continue;
    }
    const entity = entities.get(definitionKey);
    const parent =
      occurrence.parentId === undefined
        ? undefined
        : byOccurrence.get(occurrence.parentId);
    const providerEntity =
      parent === undefined ? undefined : entities.get(key(parent.definitionId));
    const provider =
      parent === undefined
        ? undefined
        : {
            id: parent.definitionId,
            name: providerEntity?.name ?? parent.definitionId,
            type: providerEntity?.type ?? "",
          };
    if (entity === undefined) {
      rows.set(definitionKey, {
        definitionId: occurrence.definitionId,
        name: occurrence.definitionId,
        type: "",
        occurrences: 1,
        ...(provider === undefined ? {} : { provider }),
        surfaces: [],
        coverage: undefined,
        status: "missing-definition",
      });
      continue;
    }
    const surfaces = sheetSurfacesOf(entity, index);
    const coverage = contentTypeCoverage(entity.type);
    const status: PresenceStatus =
      surfaces.length > 0
        ? "presented"
        : coverage?.kind === "internal" || coverage?.kind === "applied"
          ? "accounted"
          : "unpresented";
    rows.set(definitionKey, {
      definitionId: entity.id,
      name: entity.name,
      type: entity.type.trim(),
      occurrences: 1,
      ...(provider === undefined ? {} : { provider }),
      surfaces,
      coverage,
      status,
    });
  }
  return [...rows.values()];
}

/** Per content type, across every generated sheet. */
export interface TypePresenceTally {
  /** Character-definition pairs (a definition counts once per sheet). */
  rows: number;
  presented: number;
  surfaces: Partial<Record<SheetSurface, number>>;
}

export function tallyPresence(
  tallies: Map<string, TypePresenceTally>,
  rows: readonly OccurrencePresence[],
): void {
  for (const row of rows) {
    if (row.status === "missing-definition") continue;
    const tally = tallies.get(row.type) ?? {
      rows: 0,
      presented: 0,
      surfaces: {},
    };
    tally.rows += 1;
    if (row.surfaces.length > 0) tally.presented += 1;
    for (const surface of row.surfaces)
      tally.surfaces[surface] = (tally.surfaces[surface] ?? 0) + 1;
    tallies.set(row.type, tally);
  }
}

/** Adds another run's tallies (e.g. a parallel worker's). */
export function mergeTallies(
  tallies: Map<string, TypePresenceTally>,
  entries: Iterable<readonly [string, TypePresenceTally]>,
): void {
  for (const [type, other] of entries) {
    const tally = tallies.get(type) ?? { rows: 0, presented: 0, surfaces: {} };
    tally.rows += other.rows;
    tally.presented += other.presented;
    for (const [surface, count] of Object.entries(other.surfaces) as [
      SheetSurface,
      number,
    ][])
      tally.surfaces[surface] = (tally.surfaces[surface] ?? 0) + count;
    tallies.set(type, tally);
  }
}

export interface RegistryFinding {
  readonly type: string;
  readonly problem: string;
  readonly rows: number;
  readonly presented: number;
}

/**
 * Registry claims the generated sheets contradict: a presented type that
 * never shows (or never on a claimed surface), and a gap, internal or
 * applied type that does show.
 */
export function registryFindings(
  tallies: ReadonlyMap<string, TypePresenceTally>,
  coverageOf: (
    type: string,
  ) => ContentTypeCoverage | undefined = contentTypeCoverage,
): RegistryFinding[] {
  const findings: RegistryFinding[] = [];
  for (const [type, tally] of [...tallies].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const coverage = coverageOf(type);
    const finding = (problem: string) =>
      findings.push({
        type,
        problem,
        rows: tally.rows,
        presented: tally.presented,
      });
    if (coverage === undefined) {
      finding("not in the registry");
      continue;
    }
    if (coverage.kind === "presented") {
      if (tally.presented === 0) {
        finding(
          `registered presented (${coverage.surfaces.join(", ")}), but never on a generated sheet`,
        );
        continue;
      }
      const unseen = coverage.surfaces.filter(
        (surface) => (tally.surfaces[surface] ?? 0) === 0,
      );
      if (unseen.length > 0)
        finding(`registered on ${unseen.join(", ")}, never seen there`);
      // A choice named on its feature's row is incidental for any type.
      const unclaimed = (Object.keys(tally.surfaces) as SheetSurface[]).filter(
        (surface) =>
          surface !== "choices" && !coverage.surfaces.includes(surface),
      );
      if (unclaimed.length > 0)
        finding(`also shown on unregistered ${unclaimed.join(", ")}`);
    } else if (
      tally.presented >
      (coverage.kind === "gap" ? 0 : (tally.surfaces.choices ?? 0))
    )
      // An applied or internal row named only as a choice on its feature's
      // row still has only its registered effect (a Skill Training choice).
      finding(
        `registered ${coverage.kind}, but shown on ${Object.keys(tally.surfaces).join(", ")} ` +
          `for ${tally.presented} of ${tally.rows}`,
      );
  }
  return findings;
}

/** A select rule's identity in the content: provider definition and ordinal. */
export function choiceRuleKey(
  providerDefinitionId: string,
  ruleOrdinal: number,
): string {
  return `${key(providerDefinitionId)}#${ruleOrdinal}`;
}

export interface ChoiceReach {
  /** Evaluations that offered the choice with full candidate detail. */
  offered: number;
  /** Most eligible candidates any offer had. */
  maxEligible: number;
  /** Offers where the audit could pick a candidate. */
  fillable: number;
  /** Example characters that were offered it. */
  examples: string[];
}

/** Accumulates offers per select rule across generated characters. */
export class ChoiceReachability {
  readonly reach = new Map<string, ChoiceReach>();

  record(
    ruleKey: string,
    character: string,
    eligible: number,
    fillable: boolean,
  ): void {
    const value = this.reach.get(ruleKey) ?? {
      offered: 0,
      maxEligible: 0,
      fillable: 0,
      examples: [],
    };
    value.offered += 1;
    value.maxEligible = Math.max(value.maxEligible, eligible);
    if (fillable) value.fillable += 1;
    if (value.examples.length < 3 && !value.examples.includes(character))
      value.examples.push(character);
    this.reach.set(ruleKey, value);
  }

  get(ruleKey: string): ChoiceReach | undefined {
    return this.reach.get(ruleKey);
  }

  /** Adds another run's offers (e.g. a parallel worker's). */
  merge(entries: Iterable<readonly [string, ChoiceReach]>): void {
    for (const [ruleKey, other] of entries) {
      const value = this.reach.get(ruleKey);
      if (value === undefined) {
        this.reach.set(ruleKey, { ...other, examples: [...other.examples] });
        continue;
      }
      value.offered += other.offered;
      value.maxEligible = Math.max(value.maxEligible, other.maxEligible);
      value.fillable += other.fillable;
      for (const example of other.examples)
        if (value.examples.length < 3 && !value.examples.includes(example))
          value.examples.push(example);
    }
  }
}

export interface Grouped<T> {
  readonly key: string;
  readonly count: number;
  readonly examples: readonly T[];
}

/** Groups values by key, most frequent first, keeping a few examples each. */
export function groupCounts<T>(
  values: Iterable<T>,
  keyOf: (value: T) => string,
  exampleLimit = 3,
): Grouped<T>[] {
  const groups = new Map<string, { count: number; examples: T[] }>();
  for (const value of values) {
    const groupKey = keyOf(value);
    const group = groups.get(groupKey) ?? { count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < exampleLimit) group.examples.push(value);
    groups.set(groupKey, group);
  }
  return [...groups]
    .map(([groupKey, group]) => ({ key: groupKey, ...group }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
