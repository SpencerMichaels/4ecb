import type { ContentEntity } from "@4ecb/content-domain";
import { deityCountsAsText, deityDomainsText } from "@4ecb/sheet-model";

/**
 * A deity card's opening lines, "Domains: Love, Moon, Trickery", above its
 * description (the printed Character Reference entry starts the same way),
 * then the deities it counts as for prerequisites ("Counts as: The Raven
 * Queen, Kelemvor", D116), each only when it has any. The domains' own lore
 * cards follow in the detail stack.
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
  const lookup = (id: string) => references.get(id.trim().toLocaleLowerCase());
  const domains = deityDomainsText(entity, lookup);
  const countsAs = deityCountsAsText(entity, lookup);
  return (
    <>
      {domains === undefined ? null : (
        <p className="deity-domains">
          <strong>Domains:</strong> {domains}
        </p>
      )}
      {countsAs === undefined ? null : (
        <p className="deity-counts-as">
          <strong>Counts as:</strong> {countsAs}
        </p>
      )}
    </>
  );
}
