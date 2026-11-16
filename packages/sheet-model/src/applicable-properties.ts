import {
  readResourceClauses,
  type ClauseResource,
  type ContentEntity,
} from "@4ecb/content-domain";

import type { SheetCard } from "./index";

/**
 * The resources whose item property sentences the character can't use:
 * power points without a Power Points pool, Channel Divinity without a
 * Channel Divinity power card.
 */
export function missingClauseResources(input: {
  readonly powerPoints: string | undefined;
  readonly powers: readonly Pick<SheetCard, "sharedUsage">[];
}): ReadonlySet<ClauseResource> {
  const missing = new Set<ClauseResource>();
  if (!(Number(input.powerPoints ?? 0) > 0)) missing.add("power-points");
  if (!input.powers.some((card) => card.sharedUsage === "Channel Divinity"))
    missing.add("channel-divinity");
  return missing;
}

/**
 * The record without the Property sentences (stored at pack build, the
 * `_Resource Clauses IR`) whose resource is in `missing`. A sentence is
 * matched exactly in its own field, so a field a campaign or `modify` rule
 * rewrote keeps its text; a field left with nothing is emptied (and so
 * not printed).
 */
export function withoutInapplicableClauses(
  entity: ContentEntity,
  missing: ReadonlySet<ClauseResource>,
): ContentEntity {
  if (missing.size === 0) return entity;
  const clauses = readResourceClauses(entity.specifics).filter(({ resource }) =>
    missing.has(resource),
  );
  if (clauses.length === 0) return entity;
  const occurrences = new Map<string, number>();
  const specifics = entity.specifics.map((field) => {
    const name = field.name.trim().toLocaleLowerCase();
    const occurrence = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, occurrence);
    let value = field.value;
    for (const clause of clauses)
      if (
        clause.field.trim().toLocaleLowerCase() === name &&
        clause.occurrence === occurrence
      )
        value = value.replace(clause.text, "");
    if (value === field.value) return field;
    return {
      ...field,
      value: value
        .split("\n")
        .map((line) => line.replaceAll(/ {2,}/gu, " ").trim())
        .join("\n")
        .replaceAll(/\n{3,}/gu, "\n\n")
        .trim(),
    };
  });
  return { ...entity, specifics };
}
