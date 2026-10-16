import type { ContentEntity } from "@4ecb/content-domain";
import type { LegacyRuleElement } from "@4ecb/character-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";

const key = (value: string) => value.trim().toLowerCase();
const origins = new Map([
  ["class", "Class Feature"],
  ["race", "Racial Trait"],
  ["theme", "Theme"],
  ["background", "Background"],
  ["paragon path", "Paragon Path"],
  ["epic destiny", "Epic Destiny"],
  ["feat", "Feat"],
]);
const positiveLevel = (value: string | undefined) =>
  value && /^\d+$/.test(value.trim()) && Number(value) > 0
    ? Number(value)
    : undefined;

/** Grant ancestry is character origin; an entity's Source is its publication. */
export function featureReferenceMetadata(input: {
  content: readonly ContentEntity[];
  selections: readonly LegacyRuleElement[];
  occurrences?: readonly CharacterOccurrence[];
}): ReadonlyMap<string, { referenceGroup: string; level?: number }> {
  const definitions = new Map(
    input.content.map((entity) => [key(entity.id), entity]),
  );
  const owned = new Set(
    input.selections.flatMap((entry) => (entry.id ? [key(entry.id)] : [])),
  );
  const result = new Map<string, { referenceGroup: string; level?: number }>();
  const ownGroup = (entity: ContentEntity) =>
    origins.get(key(entity.type)) ??
    (key(entity.type) === "racial trait" ? "Racial Trait" : undefined);
  const remember = (entity: ContentEntity, group: string, level?: number) => {
    const id = key(entity.id),
      previous = result.get(id);
    if (
      !previous ||
      (level !== undefined &&
        (previous.level === undefined || level < previous.level))
    )
      result.set(id, {
        referenceGroup: ownGroup(entity) ?? group,
        ...(level === undefined ? {} : { level }),
      });
  };
  // Legacy fallback: follow explicit automatic grants from selected origins only.
  // Do not infer choice ownership from names or publication metadata.
  const visit = (
    id: string,
    group: string,
    level: number | undefined,
    seen: Set<string>,
  ) => {
    if (seen.has(id)) return;
    const entity = definitions.get(id);
    if (!entity) return;
    const nextSeen = new Set(seen).add(id);
    if (owned.has(id)) remember(entity, group, level);
    for (const rule of entity.rules) {
      if (key(rule.name) !== "grant") continue;
      const attribute = (name: string) =>
        rule.attributes.find((a) => key(a.name) === key(name))?.value;
      const target = attribute("name");
      if (!target) continue;
      const targetId = key(target),
        child = definitions.get(targetId);
      if (!child || (!owned.has(targetId) && key(child.type) !== "grants"))
        continue;
      const declared =
        positiveLevel(attribute("Level")) ??
        positiveLevel(
          child.specifics.find((s) => key(s.name) === "level")?.value,
        );
      const nextLevel =
        declared === undefined ? level : Math.max(level ?? 1, declared);
      visit(targetId, group, nextLevel, nextSeen);
    }
  };
  for (const selected of input.selections) {
    if (!selected.id) continue;
    const group = origins.get(key(selected.type));
    if (!group) continue;
    const startLevel =
      group === "Paragon Path"
        ? 11
        : group === "Epic Destiny"
          ? 21
          : group === "Feat"
            ? undefined
            : 1;
    visit(key(selected.id), group, startLevel, new Set());
  }
  // Evaluated occurrences supersede fallback levels and resolve selected choices.
  const occurrences = new Map(
    input.occurrences?.map((entry) => [entry.id, entry]),
  );
  const evaluated = new Map<
    string,
    { referenceGroup: string; level?: number }
  >();
  for (const occurrence of input.occurrences ?? []) {
    const entity = definitions.get(key(occurrence.definitionId));
    if (!entity) continue;
    let group = ownGroup(entity),
      parent = occurrence.parentId
        ? occurrences.get(occurrence.parentId)
        : undefined;
    const seen = new Set<string>();
    while (!group && parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      const definition = definitions.get(key(parent.definitionId));
      group = definition ? origins.get(key(definition.type)) : undefined;
      parent = parent.parentId ? occurrences.get(parent.parentId) : undefined;
    }
    group ??= result.get(key(entity.id))?.referenceGroup;
    if (!group) continue;
    const level = Math.max(1, occurrence.acquiredLevel);
    const previous = evaluated.get(key(entity.id));
    if (!previous || level < (previous.level ?? Infinity))
      evaluated.set(key(entity.id), { referenceGroup: group, level });
  }
  for (const [id, metadata] of evaluated) result.set(id, metadata);
  return result;
}
