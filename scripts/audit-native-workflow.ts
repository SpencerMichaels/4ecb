import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import {
  CharacterTransaction,
  isCharacterRecord,
  newNativeCharacterRecord,
  type BuildOccurrence,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { decodeContentPack } from "@4ecb/content-pack";
import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
} from "@4ecb/legacy-dnd4e";
import {
  commandForEvaluatedChoice,
  evaluateCharacter,
  evaluatePrerequisite,
  findBuildChildIndex,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

const decompress = promisify(gunzip);

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function levelDefinition(
  entities: readonly ContentEntity[],
  level: number,
): ContentEntity {
  const id = `id_internal_level_${level}`;
  const definition = entities.find((entity) => key(entity.id) === id);
  if (definition === undefined || key(definition.type) !== "level")
    throw new Error(`Content profile has no canonical level ${level} record`);
  return definition;
}

function occurrenceFor(
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

function findOccurrence(
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

function replacementIntegrity(build: CharacterBuild): {
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

function assertNoRemovedOccurrences(
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

function candidateFor(
  choice: EvaluatedChoice,
  entitiesById: ReadonlyMap<string, ContentEntity>,
  evaluation: EvaluatedCharacter,
  preferredDefinitionIds: ReadonlySet<string>,
): ContentEntity | undefined {
  const prerequisiteContext = prerequisiteContextFor(evaluation, entitiesById);
  return choice.candidates
    .filter((candidate) => candidate.eligible)
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
        Number(!preferredDefinitionIds.has(key(left.candidate.id))) -
          Number(!preferredDefinitionIds.has(key(right.candidate.id))) ||
        Number(left.prerequisite === "unverified") -
          Number(right.prerequisite === "unverified") ||
        left.candidate.rules.filter((rule) =>
          ["grant", "select", "replace"].includes(key(rule.name)),
        ).length -
          right.candidate.rules.filter((rule) =>
            ["grant", "select", "replace"].includes(key(rule.name)),
          ).length ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0]?.candidate;
}

function prerequisiteContextFor(
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

function replacementCommand(
  build: CharacterBuild,
  choice: EvaluatedChoice,
  entitiesById: ReadonlyMap<string, ContentEntity>,
  evaluation: EvaluatedCharacter,
  preferredDefinitionIds: ReadonlySet<string>,
  serial: number,
) {
  const provider = findOccurrence(build, choice.providerOccurrenceId);
  if (provider === undefined) return undefined;
  const providerEntity =
    provider.identity.definitionId === undefined
      ? undefined
      : entitiesById.get(key(provider.identity.definitionId));
  const prerequisiteContext = prerequisiteContextFor(evaluation, entitiesById);
  const option = (choice.replacementOptions ?? [])
    .flatMap((value) =>
      value.candidates
        .filter((candidate) => candidate.eligible)
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
        Number(!preferredDefinitionIds.has(key(left.candidate.id))) -
          Number(!preferredDefinitionIds.has(key(right.candidate.id))) ||
        Number(left.prerequisite === "unverified") -
          Number(right.prerequisite === "unverified") ||
        left.value.replacesOccurrenceId.localeCompare(
          right.value.replacesOccurrenceId,
        ) ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0];
  if (option?.candidate === undefined) return undefined;
  return {
    kind: "retrain" as const,
    parentId: provider.id,
    index: findBuildChildIndex(
      provider,
      providerEntity,
      choice.ruleOrdinal,
      choice.index,
    ),
    replacesId: option.value.replacesOccurrenceId,
    replacement: occurrenceFor(
      option.candidate,
      provider.acquiredLevel,
      serial,
    ),
  };
}

function evaluate(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
): EvaluatedCharacter {
  const result = evaluateCharacter(
    projectBuildForEvaluation(build, entities),
    entities,
  );
  if (!result.converged)
    throw new Error(
      `Rules evaluation did not converge at level ${result.level}`,
    );
  return result;
}

async function main(): Promise<void> {
  const packArgument = process.argv[2];
  if (packArgument === undefined)
    throw new Error(
      "Usage: pnpm audit:native-workflow PACK.4ecp [--max-level=N] [--output=CHARACTER.dnd4e] [PREFERRED_DEFINITION_ID ...]",
    );
  const extraArguments = process.argv.slice(3);
  const maxLevelArgument = extraArguments.find((value) =>
    value.startsWith("--max-level="),
  );
  const maxLevel = Number(maxLevelArgument?.split("=")[1] ?? 30);
  if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 30)
    throw new Error("--max-level must be an integer from 1 through 30");
  const outputArgument = extraArguments.find((value) =>
    value.startsWith("--output="),
  );
  const outputPath = outputArgument?.slice("--output=".length);
  if (outputArgument !== undefined && outputPath === "")
    throw new Error("--output requires a path");
  const requestedDefinitionIds = extraArguments.filter(
    (value) =>
      !value.startsWith("--max-level=") && !value.startsWith("--output="),
  );
  const preferredDefinitionIds = new Set(requestedDefinitionIds.map(key));
  const encoded = await readFile(resolve(packArgument));
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const byId = new Map(pack.entities.map((entity) => [key(entity.id), entity]));
  const firstLevel = levelDefinition(pack.entities, 1);
  const record = newNativeCharacterRecord(
    "Deterministic workflow audit",
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
      id: "audit:native-character",
      occurrenceId: "audit:level:1",
      now: "2000-01-01T00:00:00.000Z",
    },
  );
  const transaction = new CharacterTransaction(record.build);
  let serial = 1;
  let resolvedChoices = 0;
  let retrainings = 0;
  const levelEvidence: Array<{
    level: number;
    choices: number;
    diagnostics: number;
    complete: boolean;
    legal: boolean;
  }> = [];

  for (let level = 1; level <= maxLevel; level += 1) {
    process.stderr.write(`Auditing level ${level}...\n`);
    if (level > 1) {
      const definition = levelDefinition(pack.entities, level);
      transaction.dispatch({
        kind: "add-level",
        frame: {
          level,
          root: occurrenceFor(definition, level, serial++),
        },
      });
    }
    for (let attempt = 0; attempt < 512; attempt += 1) {
      const current = evaluate(transaction.current, pack.entities);
      const unresolvedChoices = current.choices.filter(
        (candidate) =>
          !candidate.optional && candidate.selectedOccurrenceId === undefined,
      );
      if (unresolvedChoices.length === 0) {
        levelEvidence.push({
          level,
          choices: current.choices.length,
          diagnostics: current.diagnostics.length,
          complete: current.complete,
          legal: current.legal,
        });
        process.stderr.write(
          `Level ${level}: ${current.complete ? "complete" : "incomplete"}, ${current.legal ? "legal" : "legality findings"}, ${current.choices.length} active choices.\n`,
        );
        break;
      }
      const resolution = unresolvedChoices
        .map((choice) => ({
          choice,
          replacement:
            choice.type === "Replacement"
              ? replacementCommand(
                  transaction.current,
                  choice,
                  byId,
                  current,
                  preferredDefinitionIds,
                  serial,
                )
              : undefined,
          definition:
            choice.type === "Replacement"
              ? undefined
              : candidateFor(choice, byId, current, preferredDefinitionIds),
        }))
        .find(
          ({ replacement, definition }) =>
            replacement !== undefined || definition !== undefined,
        );
      if (resolution === undefined) {
        const blocked = unresolvedChoices.map((choice) => {
          const provider = current.occurrences.find(
            (occurrence) => occurrence.id === choice.providerOccurrenceId,
          );
          return {
            id: choice.id,
            type: choice.type,
            provider,
            sourceRule:
              provider === undefined
                ? undefined
                : byId.get(key(provider.definitionId))?.rules[
                    choice.ruleOrdinal
                  ],
            candidates: choice.candidates.slice(0, 12),
          };
        });
        throw new Error(
          `No required choice can currently be resolved at level ${level}: ${JSON.stringify(blocked)}`,
        );
      }
      const { choice, replacement, definition } = resolution;
      if (replacement !== undefined) {
        const before = transaction.current;
        const after = transaction.dispatch(replacement);
        assertNoRemovedOccurrences(before, after, `Resolving ${choice.id}`);
        serial += 1;
        retrainings += 1;
        resolvedChoices += 1;
        continue;
      }
      if (definition === undefined)
        throw new Error(`Internal audit resolution error for ${choice.id}`);
      const provider = current.occurrences.find(
        (occurrence) => occurrence.id === choice.providerOccurrenceId,
      );
      const selected = occurrenceFor(
        definition,
        provider?.acquiredLevel ?? level,
        serial++,
      );
      const command = commandForEvaluatedChoice(
        transaction.current,
        choice,
        current.occurrences,
        pack.entities,
        selected,
        () => `audit:placeholder:${serial++}`,
      );
      if (command === undefined)
        throw new Error(
          `Choice provider ${choice.providerOccurrenceId} cannot be materialized at level ${level}`,
        );
      const before = transaction.current;
      const after = transaction.dispatch(command);
      assertNoRemovedOccurrences(before, after, `Resolving ${choice.id}`);
      resolvedChoices += 1;
      if ((attempt + 1) % 10 === 0)
        process.stderr.write(
          `Level ${level}: resolved ${attempt + 1} choices; ${choice.type} ${choice.id} -> ${definition.id}.\n`,
        );
      if (attempt === 511)
        throw new Error(
          `Choice resolution exceeded its bound at level ${level}`,
        );
    }
    if (levelEvidence.at(-1)?.level !== level)
      throw new Error(`Choice resolution exceeded its bound at level ${level}`);
  }

  const equipment = pack.entities
    .filter((entity) => key(entity.type) === "weapon")
    .toSorted((left, right) => left.id.localeCompare(right.id))[0];
  if (equipment === undefined) throw new Error("Content profile has no weapon");
  transaction.dispatch({
    kind: "put-inventory",
    entry: {
      id: "audit:inventory:1",
      acquiredLevel: maxLevel,
      quantity: 1,
      equippedQuantity: 1,
      elements: [
        {
          definitionId: equipment.id,
          name: equipment.name,
          type: equipment.type,
        },
      ],
      name: equipment.name,
      showPowerCard: true,
      overrides: {},
      legality: "rules-legal",
    },
  });

  const saved = JSON.parse(
    JSON.stringify({ ...record, build: transaction.current }),
  ) as unknown;
  if (!isCharacterRecord(saved))
    throw new Error("Serialized level-30 record failed the domain decoder");
  const finalEvaluation = evaluate(saved.build, pack.entities);
  const replacementLinks = replacementIntegrity(saved.build);
  if (replacementLinks.missingTargets.length > 0)
    throw new Error(
      `Replacement links target removed occurrences: ${replacementLinks.missingTargets.join(", ")}`,
    );
  const sheet = buildEvaluatedSheetModel(
    saved.snapshot,
    saved.build,
    finalEvaluation,
    pack.entities,
  );
  const xml = exportEditedDnd4e({
    target: "legacy-builder-0.07a",
    envelope: saved.legacy,
    snapshot: saved.snapshot,
    build: saved.build,
    evaluation: finalEvaluation,
    content: pack.entities,
  });
  const comparison = compareEditedDnd4eRoundTrip(
    saved.build,
    importDnd4e(xml).build,
  );
  if (!comparison.equivalent) throw new Error(comparison.differences.join(" "));
  if (outputPath !== undefined)
    await writeFile(resolve(outputPath), xml, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        packId: pack.manifest.packId,
        contentDigest: pack.manifest.contentDigest,
        records: pack.entities.length,
        request: {
          maxLevel,
          preferredDefinitionIds: requestedDefinitionIds,
        },
        levels: saved.build.levels.length,
        resolvedChoices,
        retrainings,
        replacementLinks,
        inventory: {
          owned: saved.build.inventory[0]?.quantity,
          equipped: saved.build.inventory[0]?.equippedQuantity,
        },
        evaluation: {
          complete: finalEvaluation.complete,
          legal: finalEvaluation.legal,
          converged: finalEvaluation.converged,
          diagnostics: finalEvaluation.diagnostics.length,
          diagnosticCodes: Object.fromEntries(
            [...new Set(finalEvaluation.diagnostics.map(({ code }) => code))]
              .toSorted()
              .map((code) => [
                code,
                finalEvaluation.diagnostics.filter(
                  (diagnostic) => diagnostic.code === code,
                ).length,
              ]),
          ),
          diagnosticDetails: finalEvaluation.diagnostics.map((diagnostic) => ({
            severity: diagnostic.severity,
            code: diagnostic.code,
            message: diagnostic.message,
            ...(diagnostic.occurrenceId === undefined
              ? {}
              : { occurrenceId: diagnostic.occurrenceId }),
            ...(diagnostic.ruleOrdinal === undefined
              ? {}
              : { ruleOrdinal: diagnostic.ruleOrdinal }),
          })),
          powers: finalEvaluation.powers.length,
        },
        sheet: {
          source: sheet.source,
          powers: sheet.powers.length,
          items: sheet.items.length,
        },
        persistence: "domain-decode-passed",
        export: "semantic-round-trip-passed",
        exportPath: outputPath === undefined ? undefined : resolve(outputPath),
        levelEvidence,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
