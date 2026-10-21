import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { projectBuildForEvaluation } from "./build-projection";
import { parseRules } from "./ir";
import {
  evaluateCharacter,
  type EngineDiagnostic,
  type EvaluatedCharacter,
  type EvaluationProgress,
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
  /** Missing records named from the source content, for plain-language display. */
  readonly missingDefinitions: readonly {
    readonly id: string;
    readonly name?: string;
    readonly type?: string;
  }[];
  readonly changedDefinitionIds: readonly string[];
  /** Changed records named from the new content, for plain-language display. */
  readonly changedDefinitions: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
  }[];
  /** Saved selections the old content granted but the new content no longer
   *  does (e.g. a corrected trait that stops granting a power). Adoption removes
   *  them; anything the old content did not visibly grant is never listed. */
  readonly removedSelections: readonly {
    readonly occurrenceId: string;
    readonly name: string;
    readonly type?: string;
    readonly providerName: string;
    readonly providerType: string;
  }[];
  readonly source?: ProfileEvaluationSummary;
  readonly target: ProfileEvaluationSummary;
  readonly statChanges: readonly ProfileMigrationValueChange[];
  readonly powerChanges: readonly ProfileMigrationPowerChange[];
  readonly newDiagnosticCodes: readonly string[];
  readonly resolvedDiagnosticCodes: readonly string[];
  readonly targetDiagnostics: readonly EngineDiagnostic[];
}

/** Progress of one of the preview's two evaluations (new content first). */
export interface ProfileMigrationProgress extends EvaluationProgress {
  readonly evaluation: "target" | "source";
}

export interface ProfileMigrationOptions {
  readonly onProgress?: (progress: ProfileMigrationProgress) => void;
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
  build.known.forEach((entry) => add(entry.element.definitionId));
  return [...ids.values()].sort((left, right) => left.localeCompare(right));
}

function grants(
  provider: ContentEntity | undefined,
  child: { readonly definitionId?: string; readonly name: string },
): boolean {
  const names = [child.definitionId, child.name].flatMap((name) =>
    name === undefined ? [] : [key(name)],
  );
  return (
    provider !== undefined &&
    parseRules(provider.id, provider.rules).some(
      (rule) => rule.kind === "grant" && names.includes(key(rule.name)),
    )
  );
}

function removedSelections(
  build: CharacterBuild,
  sourceById: ReadonlyMap<string, ContentEntity>,
  targetById: ReadonlyMap<string, ContentEntity>,
): ProfileMigrationPreview["removedSelections"] {
  const removed: {
    occurrenceId: string;
    name: string;
    type?: string;
    providerName: string;
    providerType: string;
  }[] = [];
  const visit = (occurrence: CharacterBuild["grabbag"][number]) => {
    const providerId = key(occurrence.identity.definitionId ?? "");
    const before = sourceById.get(providerId);
    const after = targetById.get(providerId);
    for (const child of occurrence.children) {
      if (
        after !== undefined &&
        grants(before, child.identity) &&
        !grants(after, child.identity)
      )
        removed.push({
          occurrenceId: child.id,
          name: child.identity.name,
          ...(child.identity.type === undefined
            ? {}
            : { type: child.identity.type }),
          providerName: after.name,
          providerType: after.type,
        });
      visit(child);
    }
  };
  build.levels.forEach((frame) => visit(frame.root));
  build.grabbag.forEach(visit);
  return removed;
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
  options: ProfileMigrationOptions = {},
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
    {
      onProgress: (progress) =>
        options.onProgress?.({ ...progress, evaluation: "target" }),
    },
  );
  const sourceEvaluation =
    sourceEntities === undefined
      ? undefined
      : evaluateCharacter(
          projectBuildForEvaluation(build, sourceEntities),
          sourceEntities,
          {
            onProgress: (progress) =>
              options.onProgress?.({ ...progress, evaluation: "source" }),
          },
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
    missingDefinitions: missingDefinitionIds.map((id) => {
      const entity = sourceById?.get(key(id));
      return {
        id,
        ...(entity === undefined
          ? {}
          : { name: entity.name, type: entity.type }),
      };
    }),
    changedDefinitionIds,
    changedDefinitions: changedDefinitionIds.flatMap((id) => {
      const entity = targetById.get(key(id));
      return entity === undefined
        ? []
        : [{ id, name: entity.name, type: entity.type }];
    }),
    removedSelections:
      sourceById === undefined
        ? []
        : removedSelections(build, sourceById, targetById),
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
