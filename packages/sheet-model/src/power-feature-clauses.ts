import {
  contentCache,
  getAttribute,
  type ContentEntity,
} from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

export function featureClauseKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** The content's class features, by id, name and category: built once per
 * content, since every sheet and builder card set asks. */
const classFeatureIndex = contentCache("feature-clauses", (content) => {
  const definitions = new Map(
    content.map((entity) => [featureClauseKey(entity.id), entity]),
  );
  const features = content.filter(
    (entity) => featureClauseKey(entity.type) === "class feature",
  );
  const nameCounts = new Map<string, number>();
  const byCategory = new Map<string, ContentEntity[]>();
  for (const feature of features) {
    const name = featureClauseKey(feature.name);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    for (const tag of new Set(feature.categories.map(featureClauseKey))) {
      const family = byCategory.get(tag);
      if (family === undefined) byCategory.set(tag, [feature]);
      else family.push(feature);
    }
  }
  return {
    definitions: definitions as ReadonlyMap<string, ContentEntity>,
    nameCounts: nameCounts as ReadonlyMap<string, number>,
    byCategory: byCategory as ReadonlyMap<string, readonly ContentEntity[]>,
  };
});

/** Hide only proven unselected siblings of a resolved single-choice feature.
 * Do not use presentation-scoped candidate lists as the complete option family. */
export function irrelevantFeatureClauseNames(
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
): ReadonlySet<string> {
  const hidden = new Set<string>();
  if (!evaluation.converged) return hidden;
  const { definitions, nameCounts, byCategory } = classFeatureIndex(content);
  const occurrences = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const active = new Set(evaluation.activeDefinitionIds.map(featureClauseKey));
  for (const choice of evaluation.choices) {
    if (
      featureClauseKey(choice.type) !== "class feature" ||
      !choice.selectedOccurrenceId
    )
      continue;
    const provider = occurrences.get(choice.providerOccurrenceId);
    const selected = occurrences.get(choice.selectedOccurrenceId);
    if (
      !provider ||
      !selected ||
      provider.legality === "houserule" ||
      selected.legality === "houserule"
    )
      continue;
    const parent = definitions.get(featureClauseKey(provider.definitionId));
    if (
      !parent ||
      featureClauseKey(parent.type) !== "class feature" ||
      !active.has(featureClauseKey(parent.id))
    )
      continue;
    const rule = parent.rules.find(
      (rule) =>
        rule.ordinal === choice.ruleOrdinal &&
        featureClauseKey(rule.name) === "select",
    );
    if (
      !rule ||
      featureClauseKey(getAttribute(rule.attributes, "type") ?? "") !==
        "class feature" ||
      (getAttribute(rule.attributes, "number") ?? "1").trim() !== "1"
    )
      continue;
    const category = getAttribute(rule.attributes, "Category")?.trim();
    // Composite/dynamic selectors need their own proven resolution path.
    if (!category || !/^[\w-]+$/.test(category)) continue;
    const slots = evaluation.choices.filter(
      (slot) =>
        slot.ruleOrdinal === choice.ruleOrdinal &&
        featureClauseKey(
          occurrences.get(slot.providerOccurrenceId)?.definitionId ?? "",
        ) === featureClauseKey(parent.id),
    );
    if (slots.length !== 1) continue;
    const family = byCategory.get(featureClauseKey(category)) ?? [];
    const owned = family.filter((feature) =>
      active.has(featureClauseKey(feature.id)),
    );
    if (
      owned.length !== 1 ||
      featureClauseKey(owned[0]!.id) !== featureClauseKey(selected.definitionId)
    )
      continue;
    const decision = choice.candidates.find(
      (candidate) =>
        featureClauseKey(candidate.definitionId) ===
        featureClauseKey(selected.definitionId),
    );
    if (!decision?.rulesLegal || !decision.sourceEntitled) continue;
    for (const feature of family) {
      const name = featureClauseKey(feature.name);
      if (
        /^(?:attack|hit|miss|effect|special|trigger|targets?|requirements?|prerequisites?|keywords|(?:primary|secondary|tertiary|quaternary) (?:attack|hit|targets?)|sustain (?:minor|move|standard)|augment \d+)$/.test(
          name,
        )
      )
        continue;
      if (
        !active.has(featureClauseKey(feature.id)) &&
        nameCounts.get(name) === 1
      )
        hidden.add(name);
    }
  }
  return hidden;
}
