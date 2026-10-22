import type { ContentEntity } from "@4ecb/content-domain";

import type { FieldOverlay } from "./evaluator";

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Native InsertList: a keyword field is a comma list, cut at its first `;`,
 * each entry trimmed. "Heavy Blade, Polearm" is two keywords.
 */
export function legacyKeywordList(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")[0]!
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Whether a `modify` overlay applies to this record. Native
 * C_RulesElementField resolves a field through the workspace's overlays for
 * any record, owned or not, so an inventory weapon matches an overlay naming
 * it (by name or ID, qualified by type) as well as one that resolved to an
 * owned definition.
 */
function overlayTargets(overlay: FieldOverlay, entity: ContentEntity): boolean {
  if (overlay.targetDefinitionIds.some((id) => key(id) === key(entity.id)))
    return true;
  if (overlay.targetName === undefined) return false;
  const name = key(overlay.targetName);
  return (
    (name === key(entity.name) || name === key(entity.id)) &&
    (overlay.targetType === undefined ||
      key(overlay.targetType) === key(entity.type))
  );
}

/** A record's field after every `modify` overlay that targets it. */
export function overlaidField(
  entity: ContentEntity,
  name: string,
  overlays: readonly FieldOverlay[],
): string | undefined {
  let value = entity.specifics.find(
    (specific) => key(specific.name) === key(name),
  )?.value;
  for (const overlay of overlays) {
    if (key(overlay.field) !== key(name) || !overlayTargets(overlay, entity))
      continue;
    if (overlay.value !== undefined) value = overlay.value;
    if (overlay.listAddition !== undefined)
      value = [value, overlay.listAddition].filter(Boolean).join(", ");
  }
  return value;
}

/**
 * A weapon's groups as native AddWeaponKeywords sees them: the
 * overlay-resolved Group field (Arena Training's "Arena Weapon (Glaive)"
 * list-adds "Arena" to the glaive), one entry per group.
 */
export function weaponGroups(
  weapon: ContentEntity,
  overlays: readonly FieldOverlay[],
): string[] {
  return legacyKeywordList(overlaidField(weapon, "Group", overlays));
}
