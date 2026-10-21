import type { ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";

/** A choice made under a listed feature, shown on that feature's row. */
export interface SheetFeatureChoice {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** Granted, not chosen: an alias the feature makes the character count as. */
  readonly granted?: true;
}

/**
 * A choice that belongs to a whole group of listed features rather than one
 * of them (the one background benefit drawn from every background), shown
 * as its own row in that group, named after the helper that offers it.
 */
export interface SheetFeatureChoiceRow {
  readonly label: string;
  /** The listed features' type, i.e. the features group it joins. */
  readonly group: string;
  readonly choices: readonly SheetFeatureChoice[];
}

/**
 * Alias types: what a feature makes the character count as for
 * prerequisites. A feature that grants one shows it on its row ("Dual
 * Heritage: counts as Elf, Human"), the same as a choice made under it.
 */
export const SHEET_ALIAS_TYPES: readonly string[] = [
  "CountsAsRace",
  "CountsAsClass",
  "CountsAsPact",
];

/**
 * The choices made under each listed feature occurrence, keyed by that
 * occurrence's ID, and the group-level choice rows. A choice belongs to the
 * listed feature that offered it (Past life: Eladrin; Pact Choice: Fey Pact
 * of the White Well), and so does an alias it grants. A choice an unlisted
 * helper offers instead, where the helper's own grantor (not a level root,
 * which holds every top-level choice) also granted listed features all of
 * one type, belongs to that type as a whole: a row of its own in that group,
 * named after the helper ("Background benefit: History class skill"), even
 * when only one such feature is present. Purely structural: no content
 * names are special-cased.
 */
export function featureChoices(
  occurrences: readonly CharacterOccurrence[],
  entityOf: (occurrence: CharacterOccurrence) => ContentEntity | undefined,
  isListed: (occurrence: CharacterOccurrence) => boolean,
): {
  readonly byFeature: Map<string, SheetFeatureChoice[]>;
  readonly rows: readonly SheetFeatureChoiceRow[];
} {
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
  const parentOf = (occurrence: CharacterOccurrence) =>
    occurrence.parentId === undefined
      ? undefined
      : byId.get(occurrence.parentId);
  /** The group a helper's choice joins, if its grantor granted one type. */
  const groupOf = (helper: CharacterOccurrence) => {
    const grantor = parentOf(helper);
    if (
      helper.kind !== "grant" ||
      grantor === undefined ||
      grantor.kind === "root"
    )
      return undefined;
    const types = new Set(
      (children.get(grantor.id) ?? [])
        .filter(isListed)
        .map((sibling) => entityOf(sibling)?.type),
    );
    const [type] = types;
    return types.size === 1 ? type : undefined;
  };
  const byFeature = new Map<string, SheetFeatureChoice[]>();
  const rows = new Map<
    string,
    { label: string; group: string; choices: SheetFeatureChoice[] }
  >();
  const add = (choices: SheetFeatureChoice[], entity: ContentEntity) => {
    if (!choices.some((choice) => choice.id === entity.id))
      choices.push({ id: entity.id, name: entity.name, type: entity.type });
  };
  for (const occurrence of occurrences) {
    const entity = entityOf(occurrence);
    const parent = parentOf(occurrence);
    if (entity === undefined || parent === undefined) continue;
    if (occurrence.kind !== "choice") {
      if (!SHEET_ALIAS_TYPES.includes(entity.type) || !isListed(parent))
        continue;
      const choices = byFeature.get(parent.id) ?? [];
      if (!choices.some((choice) => choice.id === entity.id))
        choices.push({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          granted: true,
        });
      byFeature.set(parent.id, choices);
    } else if (isListed(parent)) {
      const choices = byFeature.get(parent.id) ?? [];
      add(choices, entity);
      byFeature.set(parent.id, choices);
    } else if (!isListed(occurrence)) {
      const group = groupOf(parent);
      const helper = entityOf(parent);
      if (group === undefined || helper === undefined) continue;
      const row = rows.get(helper.id) ?? {
        label: sentenceCase(helper.name),
        group,
        choices: [],
      };
      add(row.choices, entity);
      rows.set(helper.id, row);
    }
  }
  return { byFeature, rows: [...rows.values()] };
}

/** "Background Benefit" -> "Background benefit"; acronyms stay. */
function sentenceCase(name: string): string {
  return name
    .trim()
    .replace(/(?<=\s)\p{Lu}(?=\p{Ll}*(?:\s|$))/gu, (letter) =>
      letter.toLowerCase(),
    );
}

/**
 * What a feature's row shows after its name: the chosen names, then the
 * granted aliases ("Eladrin", "counts as Elf, Human").
 */
export function featureChoiceText(
  choices: readonly SheetFeatureChoice[] | undefined,
): string | undefined {
  const names = (granted: boolean) =>
    (choices ?? [])
      .filter((choice) => (choice.granted === true) === granted)
      .map(({ name }) => name.trim())
      .filter(Boolean)
      .join(", ");
  const chosen = names(false);
  const aliases = names(true);
  const parts = [chosen, aliases && `counts as ${aliases}`].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : undefined;
}
