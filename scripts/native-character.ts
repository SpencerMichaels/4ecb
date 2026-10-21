/**
 * Shared machinery for the private audits that build native characters from
 * an exact pack (`audit:native-workflow`, `audit:coverage-matrix`): loading a
 * pack, materializing occurrences, choosing prerequisite-aware candidates,
 * retraining, and evaluating.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import type {
  BuildOccurrence,
  CharacterBuild,
  CharacterCommand,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { decodeContentPack, type ContentPack } from "@4ecb/content-pack";
import {
  commandForEvaluatedChoice,
  evaluateCharacter,
  evaluatePrerequisite,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
  type EvaluatedChoice,
  type EvaluationInput,
} from "@4ecb/rules-engine";

const decompress = promisify(gunzip);

export function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export async function loadPack(path: string): Promise<ContentPack> {
  const encoded = await readFile(resolve(path));
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  return decodeContentPack(bytes.toString("utf8"));
}

export function levelDefinition(
  entities: readonly ContentEntity[],
  level: number,
): ContentEntity {
  const id = `id_internal_level_${level}`;
  const definition = entities.find((entity) => key(entity.id) === id);
  if (definition === undefined || key(definition.type) !== "level")
    throw new Error(`Content profile has no canonical level ${level} record`);
  return definition;
}

export function occurrenceFor(
  definition: ContentEntity,
  acquiredLevel: number,
  serial: number,
): BuildOccurrence {
  return {
    id: `audit:occurrence:${serial}`,
    identity: {
      definitionId: definition.id,
      name: definition.name,
      type: definition.type,
    },
    acquiredLevel,
    legality: "rules-legal",
    children: [],
    unresolved: false,
  };
}

export function findOccurrence(
  build: CharacterBuild,
  id: string,
): BuildOccurrence | undefined {
  const visit = (value: BuildOccurrence): BuildOccurrence | undefined =>
    value.id === id
      ? value
      : value.children.map(visit).find((child) => child !== undefined);
  return [...build.levels.map((frame) => frame.root), ...build.grabbag]
    .map(visit)
    .find((value) => value !== undefined);
}

export function replacementIntegrity(build: CharacterBuild): {
  readonly replacements: number;
  readonly missingTargets: readonly string[];
} {
  const occurrences: BuildOccurrence[] = [];
  const visit = (occurrence: BuildOccurrence) => {
    occurrences.push(occurrence);
    occurrence.children.forEach(visit);
  };
  build.levels.forEach((frame) => visit(frame.root));
  build.grabbag.forEach(visit);
  build.alternates.forEach((alternate) => visit(alternate.choice));
  const ids = new Set(occurrences.map(({ id }) => id));
  const replacements = occurrences.filter(
    ({ replacesId }) => replacesId !== undefined,
  );
  return {
    replacements: replacements.length,
    missingTargets: replacements.flatMap(({ id, replacesId }) =>
      replacesId !== undefined && !ids.has(replacesId)
        ? [`${id} -> ${replacesId}`]
        : [],
    ),
  };
}

function occurrenceIds(
  build: CharacterBuild,
  includeUnresolved = true,
): Set<string> {
  const ids = new Set<string>();
  const visit = (occurrence: BuildOccurrence) => {
    if (includeUnresolved || !occurrence.unresolved) ids.add(occurrence.id);
    occurrence.children.forEach(visit);
  };
  build.levels.forEach((frame) => visit(frame.root));
  build.grabbag.forEach(visit);
  build.alternates.forEach((alternate) => visit(alternate.choice));
  return ids;
}

export function assertNoRemovedOccurrences(
  before: CharacterBuild,
  after: CharacterBuild,
  action: string,
): void {
  const afterIds = occurrenceIds(after);
  const missing = [...occurrenceIds(before, false)].filter(
    (id) => !afterIds.has(id),
  );
  if (missing.length > 0) {
    const details = new Map<string, string>();
    const visit = (occurrence: BuildOccurrence, path: string) => {
      details.set(
        occurrence.id,
        `${path} (${occurrence.identity.definitionId ?? occurrence.identity.name})`,
      );
      occurrence.children.forEach((child, index) =>
        visit(child, `${path}.children[${index}]`),
      );
    };
    before.levels.forEach((frame, index) =>
      visit(frame.root, `levels[${index}].root`),
    );
    before.grabbag.forEach((occurrence, index) =>
      visit(occurrence, `grabbag[${index}]`),
    );
    throw new Error(
      `${action} removed saved occurrences: ${missing.map((id) => `${id} at ${details.get(id) ?? "unknown"}`).join(", ")}`,
    );
  }
}

export function prerequisiteContextFor(
  evaluation: EvaluatedCharacter,
  entitiesById: ReadonlyMap<string, ContentEntity>,
) {
  const owned = evaluation.occurrences.flatMap((occurrence) => {
    const entity = entitiesById.get(key(occurrence.definitionId));
    return entity === undefined ? [] : [entity];
  });
  const abilities = Object.fromEntries(
    [
      "Strength",
      "Constitution",
      "Dexterity",
      "Intelligence",
      "Wisdom",
      "Charisma",
    ].map((ability) => {
      const value = evaluation.stats[ability]?.value;
      return [ability, typeof value === "number" ? value : 0];
    }),
  );
  return { owned, level: evaluation.level, abilities };
}

/**
 * Candidate ordering beyond the requested definitions: `covered` reports
 * definitions an earlier character already exercised, which sort after the
 * rest. The native-workflow audit passes none.
 */
export interface CandidatePreference {
  readonly preferred: ReadonlySet<string>;
  readonly covered?: (definitionId: string) => boolean;
  /** Definitions to skip outright (e.g. already picked in the same batch). */
  readonly excluded?: ReadonlySet<string>;
}

const STRUCTURAL_RULES = ["grant", "select", "replace"];

function structuralRuleCount(entity: ContentEntity): number {
  return entity.rules.filter((rule) =>
    STRUCTURAL_RULES.includes(key(rule.name)),
  ).length;
}

function preferenceOrder(
  preference: CandidatePreference,
  left: { candidate: ContentEntity; prerequisite: string },
  right: { candidate: ContentEntity; prerequisite: string },
): number {
  const covered = preference.covered ?? (() => false);
  return (
    Number(!preference.preferred.has(key(left.candidate.id))) -
      Number(!preference.preferred.has(key(right.candidate.id))) ||
    Number(covered(left.candidate.id)) - Number(covered(right.candidate.id)) ||
    Number(left.prerequisite === "unverified") -
      Number(right.prerequisite === "unverified")
  );
}

export function candidateFor(
  choice: EvaluatedChoice,
  entitiesById: ReadonlyMap<string, ContentEntity>,
  evaluation: EvaluatedCharacter,
  preference: CandidatePreference,
): ContentEntity | undefined {
  const prerequisiteContext = prerequisiteContextFor(evaluation, entitiesById);
  return choice.candidates
    .filter(
      (candidate) =>
        candidate.eligible &&
        !(preference.excluded?.has(key(candidate.definitionId)) ?? false),
    )
    .map((candidate) => entitiesById.get(key(candidate.definitionId)))
    .filter((candidate): candidate is ContentEntity => candidate !== undefined)
    .map((candidate) => ({
      candidate,
      prerequisite: evaluatePrerequisite(
        candidate.prerequisites,
        prerequisiteContext,
      ).status,
    }))
    .filter(({ prerequisite }) => prerequisite !== "failed")
    .toSorted(
      (left, right) =>
        preferenceOrder(preference, left, right) ||
        structuralRuleCount(left.candidate) -
          structuralRuleCount(right.candidate) ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0]?.candidate;
}

/**
 * A command that fills a replacement choice, and the definition it gains.
 * The provider may be a generated grant (an Essentials class feature); the
 * command then materializes it beneath its nearest saved ancestor.
 */
export function replacementCommand(
  build: CharacterBuild,
  choice: EvaluatedChoice,
  entities: readonly ContentEntity[],
  entitiesById: ReadonlyMap<string, ContentEntity>,
  evaluation: EvaluatedCharacter,
  preference: CandidatePreference,
  serial: number,
): { command: CharacterCommand; definitionId: string } | undefined {
  const provider = evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  if (provider === undefined) return undefined;
  const prerequisiteContext = prerequisiteContextFor(evaluation, entitiesById);
  const option = (choice.replacementOptions ?? [])
    .flatMap((value) =>
      value.candidates
        .filter(
          (candidate) =>
            candidate.eligible &&
            !(preference.excluded?.has(key(candidate.definitionId)) ?? false),
        )
        .map((candidate) => entitiesById.get(key(candidate.definitionId)))
        .filter(
          (candidate): candidate is ContentEntity => candidate !== undefined,
        )
        .map((candidate) => ({
          value,
          candidate,
          prerequisite: evaluatePrerequisite(
            candidate.prerequisites,
            prerequisiteContext,
          ).status,
        }))
        .filter(({ prerequisite }) => prerequisite !== "failed"),
    )
    .toSorted(
      (left, right) =>
        preferenceOrder(preference, left, right) ||
        left.value.replacesOccurrenceId.localeCompare(
          right.value.replacesOccurrenceId,
        ) ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0];
  if (option?.candidate === undefined) return undefined;
  const replacement = {
    ...occurrenceFor(option.candidate, provider.acquiredLevel, serial),
    replacesId: option.value.replacesOccurrenceId,
  };
  const command = commandForEvaluatedChoice(
    build,
    choice,
    evaluation.occurrences,
    entities,
    replacement,
    (index) => `${replacement.id}:placeholder:${index}`,
  );
  return command === undefined
    ? undefined
    : { command, definitionId: option.candidate.id };
}

export function evaluate(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
  options: Pick<
    EvaluationInput,
    | "candidateDetailLevels"
    | "candidateDetailReplacementChoiceIds"
    | "includePowers"
  > = {},
): EvaluatedCharacter {
  const result = evaluateCharacter(
    { ...projectBuildForEvaluation(build, entities), ...options },
    entities,
  );
  if (!result.converged)
    throw new Error(
      `Rules evaluation did not converge at level ${result.level}`,
    );
  return result;
}
