import type { ContentEntity } from "@4ecb/content-domain";
import { deityCardFields, entityCardFields } from "@4ecb/sheet-model";

import { CardSubheader } from "./CardSubheader";

const deityFieldsOf = (
  entity: ContentEntity,
  references: ReadonlyMap<string, ContentEntity> | undefined,
) =>
  deityCardFields(entity, (id) =>
    references?.get(id.trim().toLocaleLowerCase()),
  );

/**
 * A reference card's subheader under its title (owner, 2026-11-06), the
 * ritual cards' CardSubheader: the short fields sheet-model places there,
 * each only when it has a value — a deity's "Alignment · Pantheon",
 * Domains and any Counts as (`deityCardFields`), a feat's "Tier · Type",
 * and so on (`entityCardFields`). Nothing for a card without any.
 */
export function EntitySubheader({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity> | undefined;
}) {
  const subheader = isDeityEntity(entity)
    ? deityFieldsOf(entity, references).subheader
    : (entityCardFields(entity)?.subheader ?? []);
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
  return deityFieldsOf(entity, references).body.map(({ label, value }) => (
    <p className="deity-field" key={label}>
      <strong>{label}:</strong> {value}
    </p>
  ));
}

export function isDeityEntity(entity: ContentEntity): boolean {
  return entity.type.trim().toLocaleLowerCase() === "deity";
}
