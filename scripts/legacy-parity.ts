/**
 * Compares the modern evaluation of a legacy `.dnd4e` character with the
 * calculated caches the legacy builder saved in it (StatBlock and
 * PowerStats). Shared by `pnpm evaluate:character` (one character, full
 * detail) and `pnpm parity:baseline` (every comparison character, baselined).
 * Private-corpus tooling: it reads whatever pack and characters it is given.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
type ContentEntity = ReturnType<typeof decodeContentPack>["entities"][number];
import {
  importDnd4e,
  legacyEquipmentIdentityMatches,
  legacyPowerValueMatches,
} from "@4ecb/legacy-dnd4e";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

const decompress = promisify(gunzip);

export async function loadPackEntities(
  packPath: string,
): Promise<readonly ContentEntity[]> {
  const encoded = await readFile(resolve(packPath));
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  return decodeContentPack(bytes.toString("utf8")).entities;
}

export function compareCharacterParity(
  xml: string,
  entities: readonly ContentEntity[],
) {
  const imported = importDnd4e(xml);
  const input = projectBuildForEvaluation(imported.build, entities);
  const started = performance.now();
  const evaluated = evaluateCharacter(input, entities);
  const elapsedMilliseconds = performance.now() - started;
  // Legacy's Weight stat is TallyLoot's inventory weight plus rule
  // contributions. The evaluated stat holds only the rules; the sheet adds
  // the inventory, so compare what the sheet shows (without coins). Missing
  // item definitions leave it unknown (null).
  const sheetGearWeight = evaluated.converged
    ? (buildEvaluatedSheetModel(
        imported.snapshot,
        imported.build,
        evaluated,
        entities,
        { countCoinWeight: false },
      ).encumbrance?.carriedWeight ?? null)
    : null;
  const cachedStats = Object.entries(imported.snapshot.stats).flatMap(
    ([name, value]) => {
      const expected = Number(value);
      const evaluatedStat = evaluated.stats[name];
      const actual = name === "Weight" ? sheetGearWeight : evaluatedStat?.value;
      return Number.isFinite(expected) &&
        (typeof actual === "number" || actual === null)
        ? [
            {
              name,
              expected,
              actual,
              matches: expected === actual,
              applied: (evaluatedStat?.contributions ?? [])
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
  // Legacy PowerStats also writes a row for a Healing-keyword power without
  // a Hit line (D20Workspace.PowerStats): AttackStat Unknown, no damage, an
  // attack of half level plus untyped attack bonuses. It is a placeholder,
  // not an attack; the modern engine has no attack row for such a power and
  // the .dnd4e writer regenerates the placeholder on export (D094).
  const legacyPlaceholderRows: { power: string; equipment: string }[] = [];
  const powerComparisons = imported.snapshot.powers.flatMap((cachedPower) => {
    const power =
      (cachedPower.id === undefined
        ? undefined
        : evaluatedPowers.get(cachedPower.id)) ??
      evaluated.powers.find((candidate) => candidate.name === cachedPower.name);
    return cachedPower.weapons.flatMap((cachedWeapon) => {
      const variant = power?.variants.find((candidate) =>
        legacyEquipmentIdentityMatches(cachedWeapon, {
          equipmentName: candidate.equipmentName,
          definitionIds: candidate.definitionIds ?? [],
        }),
      );
      if (
        cachedWeapon.attackStat === "Unknown" &&
        cachedWeapon.damage === undefined &&
        (variant === undefined || variant.attackBonus === undefined)
      ) {
        legacyPlaceholderRows.push({
          power: cachedPower.name,
          equipment: cachedWeapon.name,
        });
        return [];
      }
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
        definitionId: cachedPower.id,
        equipment: cachedWeapon.name,
        ...comparison,
        powerFound: power !== undefined,
        availableEquipment:
          power?.variants.map((candidate) => candidate.equipmentName) ?? [],
        components:
          comparison.field === "attack"
            ? variant?.attackComponents
            : variant?.damageComponents,
        conditionalDamage: variant?.conditionalDamage ?? [],
        unsupported: power?.unsupported ?? [],
        matches: legacyPowerValueMatches(
          comparison.expected,
          comparison.actual,
        ),
      }));
    });
  });
  return {
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
      combatStats: Object.fromEntries(
        Object.entries(evaluated.stats)
          .filter(
            ([name, stat]) =>
              typeof stat.value === "number" &&
              stat.value !== 0 &&
              /(attack|damage|weapon|implement|melee|ranged)/i.test(name),
          )
          .map(([name, stat]) => [name, stat.value]),
      ),
    },
    cachedNumericParity: {
      comparable: cachedStats.length,
      matching: cachedStats.filter((stat) => stat.matches).length,
      mismatches: cachedStats.filter((stat) => !stat.matches),
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
      mismatches: powerComparisons.filter((comparison) => !comparison.matches),
      legacyPlaceholderRows,
      unsupported: evaluated.powers
        .filter((power) => power.unsupported.length > 0)
        .map((power) => ({
          power: power.name,
          reasons: power.unsupported,
        })),
      conditionalDamageVariants: evaluated.powers.flatMap((power) =>
        power.variants.flatMap((variant) =>
          variant.conditionalDamage.length === 0
            ? []
            : [
                {
                  power: power.name,
                  equipment: variant.equipmentName,
                  conditionalDamage: variant.conditionalDamage,
                },
              ],
        ),
      ),
    },
    diagnostics: evaluated.diagnostics.slice(0, 100),
  };
}

export type CharacterParityReport = ReturnType<typeof compareCharacterParity>;
