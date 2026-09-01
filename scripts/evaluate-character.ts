import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

const decompress = promisify(gunzip);

async function main(): Promise<void> {
  const characterPath = process.argv[2];
  if (characterPath === undefined)
    throw new Error(
      "Usage: pnpm evaluate:character CHARACTER.dnd4e [PACK.4ecp]",
    );
  const packPath = resolve(process.argv[3] ?? "tmp/content/full-local.4ecp");
  const [xml, encoded] = await Promise.all([
    readFile(resolve(characterPath), "utf8"),
    readFile(packPath),
  ]);
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const imported = importDnd4e(xml);
  const input = projectBuildForEvaluation(imported.build, pack.entities);
  const started = performance.now();
  const evaluated = evaluateCharacter(input, pack.entities);
  const elapsedMilliseconds = performance.now() - started;
  const cachedStats = Object.entries(imported.snapshot.stats).flatMap(
    ([name, value]) => {
      const expected = Number(value);
      const evaluatedStat = evaluated.stats[name];
      const actual = evaluatedStat?.value;
      return Number.isFinite(expected) && typeof actual === "number"
        ? [
            {
              name,
              expected,
              actual,
              matches: expected === actual,
              applied: evaluatedStat.contributions
                .filter((contribution) => contribution.applied)
                .map((contribution) => ({
                  provider: contribution.providerName,
                  value: contribution.numericValue ?? contribution.value,
                  type: contribution.bonusType ?? "untyped",
                })),
            },
          ]
        : [];
    },
  );
  const evaluatedPowers = new Map(
    evaluated.powers.map((power) => [power.definitionId, power]),
  );
  const powerComparisons = imported.snapshot.powers.flatMap((cachedPower) => {
    const power =
      (cachedPower.id === undefined
        ? undefined
        : evaluatedPowers.get(cachedPower.id)) ??
      evaluated.powers.find((candidate) => candidate.name === cachedPower.name);
    return cachedPower.weapons.flatMap((cachedWeapon) => {
      const variant = power?.variants.find(
        (candidate) => candidate.equipmentName === cachedWeapon.name,
      );
      const fields = [
        ...(cachedWeapon.attackBonus === undefined
          ? []
          : [
              {
                field: "attack",
                expected: cachedWeapon.attackBonus,
                actual:
                  variant?.attackBonus === undefined
                    ? undefined
                    : String(variant.attackBonus),
              },
            ]),
        ...(cachedWeapon.damage === undefined
          ? []
          : [
              {
                field: "damage",
                expected: cachedWeapon.damage,
                actual: variant?.damage,
              },
            ]),
      ];
      return fields.map((comparison) => ({
        power: cachedPower.name,
        equipment: cachedWeapon.name,
        ...comparison,
        matches: comparison.expected === comparison.actual,
      }));
    });
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        character: imported.snapshot.details.name,
        input: {
          level: input.level,
          savedOccurrences: input.occurrences.length,
          inventory: input.inventory.length,
        },
        evaluation: {
          elapsedMilliseconds: Math.round(elapsedMilliseconds * 10) / 10,
          converged: evaluated.converged,
          iterations: evaluated.iterations,
          occurrences: evaluated.occurrences.length,
          choices: evaluated.choices.length,
          unresolvedChoices: evaluated.choices.filter(
            (choice) =>
              !choice.optional && choice.selectedOccurrenceId === undefined,
          ).length,
          stats: Object.keys(evaluated.stats).length,
          complete: evaluated.complete,
          legal: evaluated.legal,
          diagnosticCounts: Object.fromEntries(
            ["error", "warning", "info"].map((severity) => [
              severity,
              evaluated.diagnostics.filter(
                (diagnostic) => diagnostic.severity === severity,
              ).length,
            ]),
          ),
        },
        cachedNumericParity: {
          comparable: cachedStats.length,
          matching: cachedStats.filter((stat) => stat.matches).length,
          mismatches: cachedStats.filter((stat) => !stat.matches).slice(0, 50),
        },
        cachedPowerParity: {
          powers: evaluated.powers.length,
          variants: evaluated.powers.reduce(
            (sum, power) => sum + power.variants.length,
            0,
          ),
          comparableFields: powerComparisons.length,
          matchingFields: powerComparisons.filter(
            (comparison) => comparison.matches,
          ).length,
          mismatches: powerComparisons
            .filter((comparison) => !comparison.matches)
            .slice(0, 100),
          unsupported: evaluated.powers
            .filter((power) => power.unsupported.length > 0)
            .map((power) => ({
              power: power.name,
              reasons: power.unsupported,
            })),
        },
        diagnostics: evaluated.diagnostics.slice(0, 100),
      },
      null,
      2,
    )}\n`,
  );
}

await main();
