import type { ContentEntity } from "@4ecb/content-domain";

function field(entity: ContentEntity, name: string): string {
  return (
    entity.specifics
      .find(
        (specific) =>
          specific.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
      ?.value.trim() ?? ""
  );
}

const isType = (entity: ContentEntity, type: string) =>
  entity.type.trim().toLocaleLowerCase() === type;

const endsWithName = (name: string, suffix: string) =>
  name.trim().toLocaleLowerCase().endsWith(suffix.trim().toLocaleLowerCase());

/**
 * The class a Hybrid Class element is half of, as named on the identity
 * line: "Hybrid Artificer" reads "Artificer". The name comes from the
 * hybrid's authored `_BaseClass`. A hybrid of a subclass (Hybrid Blackguard,
 * whose base is Paladin) reads as the class whose `_ParentClass` is that
 * base and whose name the hybrid carries. Content without a base link falls
 * back to the hybrid's own name less its "Hybrid" prefix.
 */
export function hybridClassName(
  hybrid: ContentEntity,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  const base = byId.get(field(hybrid, "_BaseClass").toLocaleLowerCase());
  if (base === undefined || !isType(base, "class"))
    return hybrid.name.replace(/^\s*hybrid\s+/iu, "").trim() || hybrid.name;
  if (endsWithName(hybrid.name, base.name)) return base.name;
  for (const entity of byId.values())
    if (
      isType(entity, "class") &&
      field(entity, "_ParentClass").toLocaleLowerCase() ===
        base.id.toLocaleLowerCase() &&
      endsWithName(hybrid.name, ` ${entity.name}`)
    )
      return entity.name;
  return base.name;
}

/**
 * The character's Class identity from its evaluated elements: the class's
 * name, or for a hybrid its two halves, "Artificer / Ardent". A hybrid also
 * owns the role-less "Hybrid" marker class, which is never the identity.
 */
export function characterClassName(
  elements: readonly ContentEntity[],
  byId: ReadonlyMap<string, ContentEntity>,
): string | undefined {
  const hybrid = [
    ...new Set(
      elements
        .filter((entity) => isType(entity, "hybrid class"))
        .map((entity) => hybridClassName(entity, byId)),
    ),
  ].join(" / ");
  return hybrid !== ""
    ? hybrid
    : elements.find((entity) => isType(entity, "class"))?.name;
}
