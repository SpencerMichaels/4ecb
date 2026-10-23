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
import {
  buildEvaluatedSheetModel,
  classifyPower,
  classifyPowerCard,
  powerActionLabel,
  type SheetCard,
} from "@4ecb/sheet-model";

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

export interface CharacterParityOptions {
  /** Import as the app does by default (Settings: "Match missing content
   *  by name"); false keeps the file's IDs (`--no-name-matching`). */
  readonly matchMissingByName?: boolean;
}

export function compareCharacterParity(
  xml: string,
  entities: readonly ContentEntity[],
  options: CharacterParityOptions = {},
) {
  const imported = importDnd4e(
    xml,
    options.matchMissingByName === false
      ? {}
      : { matchMissingDefinitionsIn: entities },
  );
  const input = projectBuildForEvaluation(imported.build, entities);
  const started = performance.now();
  const evaluated = evaluateCharacter(input, entities);
  const elapsedMilliseconds = performance.now() - started;
  // Legacy's Weight stat is TallyLoot's inventory weight plus rule
  // contributions. The evaluated stat holds only the rules; the sheet adds
  // the inventory, so compare what the sheet shows (without coins). Missing
  // item definitions leave it unknown (null).
  const sheet = evaluated.converged
    ? buildEvaluatedSheetModel(
        imported.snapshot,
        imported.build,
        evaluated,
        entities,
        { countCoinWeight: false },
      )
    : undefined;
  const sheetGearWeight = sheet?.encumbrance?.carriedWeight ?? null;
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
  const typeComparisons = comparePowerTypes(
    imported.snapshot.powers,
    sheet?.powers ?? [],
  );
  return {
    character: imported.snapshot.details.name,
    nameMatching: {
      matched: imported.report.definitionMatching?.matched.length ?? 0,
      ambiguous: imported.report.definitionMatching?.ambiguous ?? [],
      missingDefinitions: evaluated.diagnostics.flatMap((diagnostic) =>
        diagnostic.code === "occurrence.missing-definition"
          ? [diagnostic.message.replace(/^Missing content definition /, "")]
          : [],
      ),
    },
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
    cachedPowerTypeParity: {
      usage: summarizePowerTypes(typeComparisons, "usage"),
      action: summarizePowerTypes(typeComparisons, "action"),
    },
    diagnostics: evaluated.diagnostics.slice(0, 100),
  };
}

export interface PowerTypeComparison {
  readonly power: string;
  readonly definitionId: string | undefined;
  readonly field: "usage" | "action";
  readonly expected: string;
  readonly actual: string | undefined;
  readonly cardFound: boolean;
  readonly matches: boolean;
}

interface CachedPowerType {
  readonly name: string;
  readonly id?: string | undefined;
  readonly usage?: string | undefined;
  readonly actionType?: string | undefined;
}

/**
 * Compares each cached legacy power's Power Usage and Action Type (the
 * PowerStats `<Power>` specifics) with what the evaluated sheet's power card
 * shows: the usage category from `classifyPowerCard` ("Feature" for a rules
 * reference) and the action from `powerActionLabel`. Legacy caches write only
 * At-Will/Encounter/Daily, so the "(Special)" flag is not compared. A card
 * is found by definition id, then by name; a cached power without a card
 * compares against nothing.
 */
export function comparePowerTypes(
  cachedPowers: readonly CachedPowerType[],
  cards: readonly SheetCard[],
): PowerTypeComparison[] {
  const key = (value: string) => value.trim().toLocaleLowerCase();
  return cachedPowers.flatMap((cachedPower) => {
    const id = cachedPower.id;
    const card =
      (id === undefined
        ? undefined
        : cards.find(
            (candidate) =>
              candidate.id !== undefined && key(candidate.id) === key(id),
          )) ??
      cards.find((candidate) => key(candidate.name) === key(cachedPower.name));
    const shown = card === undefined ? undefined : classifyPowerCard(card);
    const cachedUsage = cachedPower.usage?.trim() ?? "";
    const rows: ["usage" | "action", string | undefined, string | undefined][] =
      [
        [
          "usage",
          cachedUsage === ""
            ? undefined
            : (classifyPower({ usage: cachedUsage }).usageLabel ?? cachedUsage),
          shown?.feature === true ? "Feature" : shown?.usageLabel,
        ],
        [
          "action",
          powerActionLabel(cachedPower.actionType),
          powerActionLabel(card?.actionType),
        ],
      ];
    return rows.flatMap(([field, expected, actual]) =>
      expected === undefined
        ? []
        : [
            {
              power: cachedPower.name,
              definitionId: id,
              field,
              expected,
              actual,
              cardFound: card !== undefined,
              matches: expected === actual,
            },
          ],
    );
  });
}

function summarizePowerTypes(
  comparisons: readonly PowerTypeComparison[],
  field: "usage" | "action",
) {
  const rows = comparisons.filter((row) => row.field === field);
  return {
    comparable: rows.length,
    matching: rows.filter((row) => row.matches).length,
    mismatches: rows.filter((row) => !row.matches),
  };
}

export type CharacterParityReport = ReturnType<typeof compareCharacterParity>;
