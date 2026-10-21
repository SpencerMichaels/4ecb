import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CharacterTransaction,
  isCharacterRecord,
  newNativeCharacterRecord,
} from "@4ecb/character-domain";
import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
} from "@4ecb/legacy-dnd4e";
import { commandForEvaluatedChoice } from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

import {
  assertNoRemovedOccurrences,
  candidateFor,
  evaluate,
  key,
  levelDefinition,
  loadPack,
  occurrenceFor,
  replacementCommand,
  replacementIntegrity,
} from "./native-character";

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
  const pack = await loadPack(packArgument);
  const preference = { preferred: preferredDefinitionIds };
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
                  pack.entities,
                  byId,
                  current,
                  preference,
                  serial,
                )
              : undefined,
          definition:
            choice.type === "Replacement"
              ? undefined
              : candidateFor(choice, byId, current, preference),
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
        const after = transaction.dispatch(replacement.command);
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
  const reimported = importDnd4e(xml);
  const comparison = compareEditedDnd4eRoundTrip(saved.build, reimported.build);
  if (!comparison.equivalent) throw new Error(comparison.differences.join(" "));
  for (const [ability, expected] of Object.entries(saved.build.baseAbilities)) {
    const actual = reimported.snapshot.abilities[ability];
    if (actual !== expected)
      throw new Error(
        `Edited export CharacterSheet base ability ${ability} is ${String(actual)}; expected ${expected}.`,
      );
  }
  const occurrenceTokens = [
    ...xml.matchAll(/<RulesElement\b[^>]*\bcharelem="([^"]+)"/g),
  ].map((match) => match[1]);
  if (new Set(occurrenceTokens).size !== occurrenceTokens.length)
    throw new Error("Edited export contains duplicate charelem tokens.");
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
