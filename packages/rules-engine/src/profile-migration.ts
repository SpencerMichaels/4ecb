import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { projectBuildForEvaluation } from "./build-projection";
import {
  evaluateCharacter,
  type EngineDiagnostic,
  type EvaluatedCharacter,
} from "./evaluator";

export interface ProfileMigrationValueChange {
  readonly name: string;
  readonly before?: number | string;
  readonly after?: number | string;
}

export interface ProfileMigrationPowerChange {
  readonly definitionId: string;
  readonly before?: string;
  readonly after?: string;
}

export interface ProfileEvaluationSummary {
  readonly converged: boolean;
  readonly complete: boolean;
  readonly legal: boolean;
  readonly activeDefinitionCount: number;
  readonly choiceCount: number;
  readonly powerCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface ProfileMigrationPreview {
  readonly sourceAvailable: boolean;
  readonly referencedDefinitionCount: number;
  readonly missingDefinitionIds: readonly string[];
  readonly changedDefinitionIds: readonly string[];
  readonly source?: ProfileEvaluationSummary;
  readonly target: ProfileEvaluationSummary;
  readonly statChanges: readonly ProfileMigrationValueChange[];
  readonly powerChanges: readonly ProfileMigrationPowerChange[];
  readonly newDiagnosticCodes: readonly string[];
  readonly resolvedDiagnosticCodes: readonly string[];
  readonly targetDiagnostics: readonly EngineDiagnostic[];
}

function key(value: string): string {
  return value.toLocaleLowerCase();
}

function referencedDefinitionIds(build: CharacterBuild): string[] {
  const ids = new Map<string, string>();
  const add = (id: string | undefined) => {
    if (id !== undefined) ids.set(key(id), id);
  };
  const visit = (occurrence: CharacterBuild["grabbag"][number]) => {
    add(occurrence.identity.definitionId);
    occurrence.children.forEach(visit);
  };
  build.levels.forEach((frame) => visit(frame.root));
  build.grabbag.forEach(visit);
  build.alternates.forEach((alternate) => {
    add(alternate.provider.definitionId);
    visit(alternate.choice);
  });
  build.inventory.forEach((entry) =>
    entry.elements.forEach((element) => add(element.definitionId)),
  );
  return [...ids.values()].sort((left, right) => left.localeCompare(right));
}

function entityFingerprint(entity: ContentEntity): string {
  return JSON.stringify({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    attributes: entity.attributes,
    categories: entity.categories,
    flavor: entity.flavor,
    prerequisites: entity.prerequisites,
    printPrerequisites: entity.printPrerequisites,
    specifics: entity.specifics,
    rules: entity.rules,
    description: entity.description,
    extensions: entity.extensions,
  });
}

function summary(evaluation: EvaluatedCharacter): ProfileEvaluationSummary {
  return {
    converged: evaluation.converged,
    complete: evaluation.complete,
    legal: evaluation.legal,
    activeDefinitionCount: evaluation.activeDefinitionIds.length,
    choiceCount: evaluation.choices.length,
    powerCount: evaluation.powers.length,
    errorCount: evaluation.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ).length,
    warningCount: evaluation.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    ).length,
  };
}

function diagnosticCodes(evaluation: EvaluatedCharacter): Set<string> {
  return new Set(evaluation.diagnostics.map((diagnostic) => diagnostic.code));
}

function powerSignatures(evaluation: EvaluatedCharacter): Map<string, string> {
  return new Map(
    evaluation.powers.map((power) => [
      key(power.definitionId),
      JSON.stringify(power),
    ]),
  );
}

/**
 * Evaluates one durable build against a prospective immutable content profile.
 * The source profile is optional because an imported backup may refer to a pack
 * revision that is no longer installed. Missing source data is reported rather
 * than silently treating the target as equivalent.
 */
export function previewProfileMigration(
  build: CharacterBuild,
  sourceEntities: readonly ContentEntity[] | undefined,
  targetEntities: readonly ContentEntity[],
): ProfileMigrationPreview {
  const referenced = referencedDefinitionIds(build);
  const targetById = new Map(
    targetEntities.map((entity) => [key(entity.id), entity]),
  );
  const sourceById =
    sourceEntities === undefined
      ? undefined
      : new Map(sourceEntities.map((entity) => [key(entity.id), entity]));
  const missingDefinitionIds = referenced.filter(
    (id) => !targetById.has(key(id)),
  );
  const changedDefinitionIds =
    sourceById === undefined
      ? []
      : referenced.filter((id) => {
          const before = sourceById.get(key(id));
          const after = targetById.get(key(id));
          return (
            before !== undefined &&
            after !== undefined &&
            entityFingerprint(before) !== entityFingerprint(after)
          );
        });

  const targetEvaluation = evaluateCharacter(
    projectBuildForEvaluation(build, targetEntities),
    targetEntities,
  );
  const sourceEvaluation =
    sourceEntities === undefined
      ? undefined
      : evaluateCharacter(
          projectBuildForEvaluation(build, sourceEntities),
          sourceEntities,
        );

  const statChanges =
    sourceEvaluation === undefined
      ? []
      : [
          ...new Set([
            ...Object.keys(sourceEvaluation.stats),
            ...Object.keys(targetEvaluation.stats),
          ]),
        ]
          .sort((left, right) => left.localeCompare(right))
          .flatMap<ProfileMigrationValueChange>((name) => {
            const before = sourceEvaluation.stats[name]?.value;
            const after = targetEvaluation.stats[name]?.value;
            return before === after
              ? []
              : [
                  {
                    name,
                    ...(before === undefined ? {} : { before }),
                    ...(after === undefined ? {} : { after }),
                  },
                ];
          });

  const sourcePowers =
    sourceEvaluation === undefined
      ? new Map<string, string>()
      : powerSignatures(sourceEvaluation);
  const targetPowers = powerSignatures(targetEvaluation);
  const powerChanges =
    sourceEvaluation === undefined
      ? []
      : [...new Set([...sourcePowers.keys(), ...targetPowers.keys()])]
          .sort((left, right) => left.localeCompare(right))
          .flatMap<ProfileMigrationPowerChange>((definitionId) => {
            const before = sourcePowers.get(definitionId);
            const after = targetPowers.get(definitionId);
            return before === after
              ? []
              : [
                  {
                    definitionId,
                    ...(before === undefined ? {} : { before }),
                    ...(after === undefined ? {} : { after }),
                  },
                ];
          });
  const sourceCodes =
    sourceEvaluation === undefined
      ? new Set<string>()
      : diagnosticCodes(sourceEvaluation);
  const targetCodes = diagnosticCodes(targetEvaluation);

  return {
    sourceAvailable: sourceEntities !== undefined,
    referencedDefinitionCount: referenced.length,
    missingDefinitionIds,
    changedDefinitionIds,
    ...(sourceEvaluation === undefined
      ? {}
      : { source: summary(sourceEvaluation) }),
    target: summary(targetEvaluation),
    statChanges,
    powerChanges,
    newDiagnosticCodes:
      sourceEvaluation === undefined
        ? []
        : [...targetCodes]
            .filter((code) => !sourceCodes.has(code))
            .sort((left, right) => left.localeCompare(right)),
    resolvedDiagnosticCodes:
      sourceEvaluation === undefined
        ? []
        : [...sourceCodes]
            .filter((code) => !targetCodes.has(code))
            .sort((left, right) => left.localeCompare(right)),
    targetDiagnostics: targetEvaluation.diagnostics,
  };
}
