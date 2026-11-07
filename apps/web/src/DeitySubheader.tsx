import type { ContentEntity } from "@4ecb/content-domain";
import { deityCardFields } from "@4ecb/sheet-model";

import { CardSubheader } from "./CardSubheader";

const fieldsOf = (
  entity: ContentEntity,
  references: ReadonlyMap<string, ContentEntity> | undefined,
) =>
  deityCardFields(entity, (id) =>
    references?.get(id.trim().toLocaleLowerCase()),
  );

/**
 * A deity card's subheader under its title (owner, 2026-11-06), the ritual
 * cards' CardSubheader: "Alignment · Pantheon", then Domains and any
 * Counts as (D116) on their own lines, each field only when it has a value
 * (`deityCardFields`). The domains' own lore cards follow in the detail
 * stack.
 */
export function DeitySubheader({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity> | undefined;
}) {
  if (!isDeityEntity(entity)) return null;
  const { subheader } = fieldsOf(entity, references);
  return subheader.length === 0 ? null : (
    <CardSubheader rows={subheader} undivided />
  );
}

/** The labelled lines `deityCardFields` places at the top of a deity
 *  card's body, above its description ("Label: value"), if any. */
export function DeityBodyFields({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity> | undefined;
}) {
  if (!isDeityEntity(entity)) return null;
  return fieldsOf(entity, references).body.map(({ label, value }) => (
    <p className="deity-field" key={label}>
      <strong>{label}:</strong> {value}
    </p>
  ));
}

export function isDeityEntity(entity: ContentEntity): boolean {
  return entity.type.trim().toLocaleLowerCase() === "deity";
}
