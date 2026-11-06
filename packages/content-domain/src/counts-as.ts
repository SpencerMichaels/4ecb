/**
 * Counts-as grants (D116): a record whose rules grant a CountsAs* record
 * (CountsAsDeity, CountsAsRace, CountsAsClass, CountsAsLanguage…) counts
 * as the record that one is named after: Torag counts as Moradin.
 *
 * This module only reads those grants for display and search. Rules keep
 * their own counts-as semantics (alternates, stand-ins, "met through") in
 * the rules engine; a counts-as name is never one of the record's own
 * names (`entityNames`), so Torag never *is* Moradin for name matching.
 */
import { entityNames } from "./aliases";
import type { ContentEntity } from "./index";

const key = (value: string) => value.trim().toLocaleLowerCase();

/** Whether a record or grant type is a CountsAs* type. */
export function isCountsAsType(type: string): boolean {
  return key(type).startsWith("countsas");
}

/**
 * The CountsAs* records the record's rules grant, in grant order, resolved
 * by ID through `lookup` (never a scan of the content). `type` narrows to
 * one CountsAs* type (e.g. "CountsAsDeity"). A grant whose record is
 * missing or of another type, a repeat, or one carrying the record's own
 * name (a campaign's Asmodeus counting as the stock Asmodeus) is left out.
 */
export function countsAsRecords(
  entity: Pick<ContentEntity, "name" | "rules">,
  lookup: (id: string) => ContentEntity | undefined,
  type?: string,
): readonly ContentEntity[] {
  const seen = new Set<string>();
  return entity.rules.flatMap((rule) => {
    if (key(rule.name) !== "grant") return [];
    const attribute = (name: string) =>
      rule.attributes.find((candidate) => key(candidate.name) === name)?.value;
    const granted = attribute("name");
    const grantType = key(attribute("type") ?? "");
    if (
      granted === undefined ||
      !isCountsAsType(grantType) ||
      (type !== undefined && grantType !== key(type))
    )
      return [];
    const record = lookup(granted.trim());
    if (
      record === undefined ||
      key(record.type) !== grantType ||
      key(record.name) === key(entity.name) ||
      seen.has(key(record.id))
    )
      return [];
    seen.add(key(record.id));
    return [record];
  });
}

const searchNameCache = new WeakMap<
  ReadonlyMap<string, ContentEntity>,
  WeakMap<ContentEntity, readonly string[]>
>();

/**
 * The names search matches for the record's counts-as grants: each granted
 * CountsAs* record's names (`entityNames`, so its aliases too). `byId` is
 * the content's immutable map by lower-cased id; the result is cached per
 * map and record, so a filter re-run on every keystroke reads no rules.
 * Search only: rule matching never reads these.
 */
export function countsAsSearchNames(
  entity: ContentEntity,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly string[] {
  let byEntity = searchNameCache.get(byId);
  if (byEntity === undefined) {
    byEntity = new WeakMap();
    searchNameCache.set(byId, byEntity);
  }
  let names = byEntity.get(entity);
  if (names === undefined) {
    names = countsAsRecords(entity, (id) =>
      byId.get(id.trim().toLocaleLowerCase()),
    ).flatMap((record) => entityNames(record));
    byEntity.set(entity, names);
  }
  return names;
}
