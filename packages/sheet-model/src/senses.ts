import type { ContentEntity } from "@4ecb/content-domain";
import type { LegacyRuleElement } from "@4ecb/character-domain";

const key = (value: string) => value.trim().toLowerCase();

/** Project explicit active sense metadata, not arbitrary names mentioning vision. */
export function overviewSenses(
  selections: readonly LegacyRuleElement[],
  content: readonly ContentEntity[],
  stats: Readonly<Record<string, string>>,
): string {
  const byId = new Map(content.map((entity) => [key(entity.id), entity]));
  const active = selections.flatMap((selection) => {
    const entity = selection.id ? byId.get(key(selection.id)) : undefined;
    return entity ? [entity] : [];
  });
  const values: string[] = [];
  const add = (raw: string) => {
    const value = /^(?:normal|low[- ]light)(?: vision)?$/i.test(raw.trim())
      ? `${/^normal/i.test(raw.trim()) ? "Normal" : "Low-light"} vision`
      : raw.trim();
    if (value && !values.some((existing) => key(existing) === key(value)))
      values.push(value);
  };
  for (const [name, value] of Object.entries(stats))
    if (/^(?:vision|senses)$/i.test(name.trim()) && value.trim()) add(value);
  for (const entity of active)
    for (const field of entity.specifics)
      if (/^(?:vision|senses)$/i.test(field.name.trim())) add(field.value);
  for (const selection of selections) {
    if (key(selection.type) !== "vision") continue;
    const sense = selection.name.trim();
    if (!sense) continue;
    // Special-sense ranges/limits can be prose-only on their direct provider.
    // Retain the whole authored sentence; never invent a range or drop a limit.
    const clauses = active.flatMap((entity) => {
      const grantsSense = entity.rules.some(
        (rule) =>
          key(rule.name) === "grant" &&
          rule.attributes.some(
            (attribute) =>
              key(attribute.name) === "name" &&
              key(attribute.value) === key(selection.id ?? ""),
          ),
      );
      if (!grantsSense || /^(?:normal|low[- ]light|darkvision)$/i.test(sense))
        return [];
      const text =
        entity.description ||
        entity.specifics.find((field) => key(field.name) === "full text")
          ?.value ||
        "";
      return (text.match(/[^.!?\n]+[.!?]?/g) ?? []).filter((sentence) =>
        key(sentence).includes(key(sense)),
      );
    });
    if (clauses.length) clauses.forEach(add);
    else {
      const range = Object.entries(stats).find(
        ([name]) => key(name) === key(sense),
      )?.[1];
      add(
        `${sense}${range && /^[1-9]\d*$/.test(range.trim()) ? ` ${range.trim()}` : ""}`,
      );
    }
  }
  // Normal vision adds no information when an enhanced vision mode is explicit.
  return values
    .filter(
      (value) =>
        key(value) !== "normal vision" ||
        !values.some((other) =>
          /^(?:low-light vision|darkvision)$/i.test(other),
        ),
    )
    .join("; ");
}
