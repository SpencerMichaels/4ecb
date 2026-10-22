import type { ContentEntity } from "@4ecb/content-domain";
import { deityDomainsText } from "@4ecb/sheet-model";

/**
 * A deity card's opening line, "Domains: Love, Moon, Trickery", above its
 * description (the printed Character Reference entry starts the same way).
 * The domains' own lore cards follow in the detail stack.
 */
export function DeityDomains({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity> | undefined;
}) {
  if (
    references === undefined ||
    entity.type.trim().toLocaleLowerCase() !== "deity"
  )
    return null;
  const domains = deityDomainsText(entity, (id) =>
    references.get(id.trim().toLocaleLowerCase()),
  );
  return domains === undefined ? null : (
    <p className="deity-domains">
      <strong>Domains:</strong> {domains}
    </p>
  );
}
