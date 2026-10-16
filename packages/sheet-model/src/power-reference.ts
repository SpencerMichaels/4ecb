import type { ContentEntity } from "@4ecb/content-domain";

const key = (value: string) => value.trim().toLowerCase();

/** Only unconditional starting-rule grants establish universal availability. */
export function universalPowerDefinitionIds(
  content: readonly ContentEntity[],
): ReadonlySet<string> {
  const definitions = new Map(
    content.map((entity) => [key(entity.id), entity]),
  );
  const result = new Set<string>();
  const seen = new Set<string>();
  const visit = (entity: ContentEntity) => {
    if (seen.has(key(entity.id))) return;
    seen.add(key(entity.id));
    for (const rule of entity.rules) {
      if (
        key(rule.name) !== "grant" ||
        rule.children.length ||
        rule.attributes.some(
          (attribute) =>
            !["name", "type", "level"].includes(key(attribute.name)) ||
            (key(attribute.name) === "level" &&
              !/^[01]$/.test(attribute.value.trim())),
        )
      )
        continue;
      const id = rule.attributes.find(
        (attribute) => key(attribute.name) === "name",
      )?.value;
      const target = id ? definitions.get(key(id)) : undefined;
      if (!target) continue;
      if (key(target.type) === "power") result.add(key(target.id));
      else if (["level1rules", "grants"].includes(key(target.type)))
        visit(target);
    }
  };
  for (const entity of content)
    if (
      key(entity.type) === "level1rules" &&
      key(entity.name) === "level1rules"
    )
      visit(entity);
  return result;
}
