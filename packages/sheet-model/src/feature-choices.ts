import type { ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";

/** A choice made under a listed feature, shown on that feature's row. */
export interface SheetFeatureChoice {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/**
 * The choices made under each listed feature occurrence, keyed by that
 * occurrence's ID. A choice belongs to the listed feature that offered it
 * (Past life: Eladrin; Pact Choice: Fey Pact of the White Well). When an
 * unlisted helper offered it instead, it belongs to the one listed feature
 * the helper's own grantor also granted (a background and the "Background
 * Benefit" helper granted beside it), unless that grantor is a level root,
 * which holds every top-level choice, or the choice is itself listed. When
 * the grantor granted several listed features, the choice's own `_SupportsID`
 * link must name one of them. Purely structural: no type or content names
 * are special-cased.
 */
export function featureChoices(
  occurrences: readonly CharacterOccurrence[],
  entityOf: (occurrence: CharacterOccurrence) => ContentEntity | undefined,
  isListed: (occurrence: CharacterOccurrence) => boolean,
): Map<string, SheetFeatureChoice[]> {
  const byId = new Map(
    occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const children = new Map<string, CharacterOccurrence[]>();
  for (const occurrence of occurrences)
    if (occurrence.parentId !== undefined)
      children.set(occurrence.parentId, [
        ...(children.get(occurrence.parentId) ?? []),
        occurrence,
      ]);
  const anchorOf = (choice: CharacterOccurrence) => {
    const parent =
      choice.parentId === undefined ? undefined : byId.get(choice.parentId);
    if (parent === undefined) return undefined;
    if (isListed(parent)) return parent;
    const grantor =
      parent.parentId === undefined ? undefined : byId.get(parent.parentId);
    if (
      parent.kind !== "grant" ||
      grantor === undefined ||
      grantor.kind === "root" ||
      isListed(choice)
    )
      return undefined;
    const siblings = (children.get(grantor.id) ?? []).filter(isListed);
    if (siblings.length === 1) return siblings[0];
    // Among several (a primary and secondary backgrounds), only the
    // choice's own "supports" link decides.
    const supported = new Set(
      (entityOf(choice)?.specifics ?? [])
        .filter(({ name }) => name.trim().toLowerCase() === "_supportsid")
        .flatMap(({ value }) => value.split(","))
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    );
    const linked = siblings.filter(({ definitionId }) =>
      supported.has(definitionId.trim().toLowerCase()),
    );
    return linked.length === 1 ? linked[0] : undefined;
  };
  const result = new Map<string, SheetFeatureChoice[]>();
  for (const occurrence of occurrences) {
    if (occurrence.kind !== "choice") continue;
    const anchor = anchorOf(occurrence);
    const entity = entityOf(occurrence);
    if (anchor === undefined || entity === undefined) continue;
    const choices = result.get(anchor.id) ?? [];
    if (!choices.some((choice) => choice.id === entity.id))
      choices.push({ id: entity.id, name: entity.name, type: entity.type });
    result.set(anchor.id, choices);
  }
  return result;
}

/** The chosen names as shown after a feature's name ("Eladrin"). */
export function featureChoiceText(
  choices: readonly SheetFeatureChoice[] | undefined,
): string | undefined {
  const names = (choices ?? []).map(({ name }) => name.trim()).filter(Boolean);
  return names.length > 0 ? names.join(", ") : undefined;
}
