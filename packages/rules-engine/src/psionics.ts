import type { ContentEntity } from "@4ecb/content-domain";

import type {
  CharacterOccurrence,
  FieldOverlay,
  RulesIndex,
} from "./evaluator";
import { EXCEPTION_IDS } from "./exceptions";
import { overlaidField } from "./item-fields";

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Native `_wtoi`: the leading integer, or 0. */
function leadingInteger(value: string | undefined): number {
  const match = /^\s*[+-]?\d+/.exec(value ?? "");
  return match === null ? 0 : Number.parseInt(match[0], 10);
}

/** Power points for a power of this Level: 2 (1–10), 4 (11–20), 6 (21+). */
function powerPointsForLevel(level: number): number {
  return level < 21 ? (level < 11 ? 2 : 4) : 6;
}

export interface NativePsionics {
  /** The untyped literal native appends to "Hybrid Power Points". */
  readonly hybridPowerPoints: number;
  /** Psionic Conventionalist's untyped "Power Points" penalty. */
  readonly conventionalist?: {
    readonly occurrenceId: string;
    readonly name: string;
    readonly value: number;
  };
  /** "Augmentable, " stripped from locked records' Keywords, and
   * `_SuppressAugments` on augmentable powers a Racial Trait chose. */
  readonly overlays: readonly FieldOverlay[];
}

/**
 * Native `Psionics` and `PsionicConventionalist` (D20RulesEngine
 * `-Module-.cs` ~16312–16420, run by `D20Workspace.UpdateInternal` after
 * every element's rules and before the loot). For each owned element:
 *
 * - one that is not an unlocked augmentable power has "Augmentable, "
 *   removed from its Keywords (`Modify`);
 * - an unlocked augmentable power whose Class names a Class record, whose
 *   Power Usage is At-Will and whose Power Type is attack adds 2/4/6 power
 *   points by its Level.
 *
 * The sum is appended to "Hybrid Power Points" (which the hybrid
 * power-point records and Psionic Dabbler link into Power Points). Psionic
 * Conventionalist then takes 2/4/6 Power Points by the Level of the power
 * its current multiclass swap replaced.
 *
 * Divergence (D105, PHB3 p195): Psionic Dabbler's own modify makes its
 * swapped at-will an Encounter power, so native counts nothing for it and
 * the feat's `Power Points +Hybrid Power Points` adds 0. The feat grants
 * 2/4/6 power points by that power's level, so a power the feat swapped in
 * is counted by its record's own Power Usage.
 *
 * `IsUnlockedAugmentablePower` (D20Workspace.cs ~1625): the power has
 * `_AugmentVersions`, no `_SuppressAugments`, and was not chosen by a
 * Racial Trait (Dilettante) — read from the first occurrence of its
 * replacement chain, as native walks to the original choice. A power its
 * Racial Trait locked gets a `_SuppressAugments` overlay, so later readers
 * of the lock see the one condition native IsUnlockedAugmentablePower
 * treats alike: power rows show a locked power's version 0 only, as native
 * `CharPowerAugmentCount` (~1691) does.
 */
export function nativePsionics(input: {
  readonly occurrences: readonly CharacterOccurrence[];
  readonly saved: readonly CharacterOccurrence[];
  readonly index: RulesIndex;
  readonly overlays: readonly FieldOverlay[];
}): NativePsionics {
  const { occurrences, saved, index, overlays } = input;
  const byId = new Map(saved.map((occurrence) => [occurrence.id, occurrence]));
  for (const occurrence of occurrences) byId.set(occurrence.id, occurrence);
  const fieldOf = (entity: ContentEntity, name: string) =>
    overlaidField(entity, name, overlays) ?? "";
  const chosenByRacialTrait = (occurrence: CharacterOccurrence): boolean => {
    let original = occurrence;
    const seen = new Set<string>();
    while (original.replacesId !== undefined && !seen.has(original.id)) {
      seen.add(original.id);
      const replaced = byId.get(original.replacesId);
      if (replaced === undefined) break;
      original = replaced;
    }
    const parent =
      original.parentId === undefined ? undefined : byId.get(original.parentId);
    const provider =
      parent === undefined ? undefined : index.get(parent.definitionId);
    return provider !== undefined && key(provider.type) === "racial trait";
  };
  const unlocked = (
    occurrence: CharacterOccurrence,
    entity: ContentEntity,
  ): boolean =>
    fieldOf(entity, "_AugmentVersions").length > 0 &&
    fieldOf(entity, "_SuppressAugments").length === 0 &&
    !chosenByRacialTrait(occurrence);

  const dabblerSwap = (occurrence: CharacterOccurrence): boolean => {
    const parent =
      occurrence.parentId === undefined
        ? undefined
        : byId.get(occurrence.parentId);
    return (
      occurrence.replacesId !== undefined &&
      parent !== undefined &&
      key(parent.definitionId) === key(EXCEPTION_IDS.psionicDabbler)
    );
  };
  const powerUsage = (
    occurrence: CharacterOccurrence,
    entity: ContentEntity,
  ) =>
    dabblerSwap(occurrence)
      ? (entity.specifics.find(
          (specific) => key(specific.name) === "power usage",
        )?.value ?? "")
      : fieldOf(entity, "Power Usage");

  let hybridPowerPoints = 0;
  const lockOverlays: FieldOverlay[] = [];
  const stripped = new Set<string>();
  const suppressed = new Set<string>();
  for (const occurrence of occurrences) {
    const entity = index.get(occurrence.definitionId);
    if (entity === undefined) continue;
    if (!unlocked(occurrence, entity)) {
      const keywords = fieldOf(entity, "Keywords");
      const without = keywords.replaceAll("Augmentable, ", "");
      if (without !== keywords && !stripped.has(key(entity.id))) {
        stripped.add(key(entity.id));
        lockOverlays.push({
          providerOccurrenceId: occurrence.id,
          targetDefinitionIds: [entity.id],
          field: "Keywords",
          value: without,
        });
      }
      if (
        fieldOf(entity, "_AugmentVersions").length > 0 &&
        fieldOf(entity, "_SuppressAugments").length === 0 &&
        !suppressed.has(key(entity.id))
      ) {
        suppressed.add(key(entity.id));
        lockOverlays.push({
          providerOccurrenceId: occurrence.id,
          targetDefinitionIds: [entity.id],
          field: "_SuppressAugments",
          value: "true",
        });
      }
      continue;
    }
    if (
      index.find(fieldOf(entity, "Class"), "Class") !== undefined &&
      key(powerUsage(occurrence, entity)) === "at-will" &&
      key(fieldOf(entity, "Power Type")) === "attack"
    )
      hybridPowerPoints += powerPointsForLevel(
        leadingInteger(fieldOf(entity, "Level")),
      );
  }

  let conventionalist: NativePsionics["conventionalist"];
  const feat = occurrences.find(
    (occurrence) =>
      key(occurrence.definitionId) ===
      key(EXCEPTION_IDS.psionicConventionalist),
  );
  if (feat !== undefined) {
    const swap = occurrences
      .filter(
        (occurrence) =>
          occurrence.parentId === feat.id &&
          occurrence.replacesId !== undefined,
      )
      .sort((a, b) => b.acquiredLevel - a.acquiredLevel)[0];
    const lost =
      swap?.replacesId === undefined ? undefined : byId.get(swap.replacesId);
    const lostPower =
      lost === undefined ? undefined : index.get(lost.definitionId);
    if (lostPower !== undefined)
      conventionalist = {
        occurrenceId: feat.id,
        name: index.get(feat.definitionId)?.name ?? "Psionic Conventionalist",
        value: -powerPointsForLevel(
          leadingInteger(fieldOf(lostPower, "Level")),
        ),
      };
  }
  return {
    hybridPowerPoints,
    ...(conventionalist === undefined ? {} : { conventionalist }),
    overlays: lockOverlays,
  };
}
