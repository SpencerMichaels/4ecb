import { legacyListContains, type ContentEntity } from "@4ecb/content-domain";

import type { FieldOverlay } from "./evaluator";
import { overlaidField } from "./item-fields";

export { legacyListContains };

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

/** Native ListContainsOneOf: the list contains any entry of `items`. */
export function legacyListContainsOneOf(list: string, items: string): boolean {
  return items
    .split(",")
    .map((item) => item.trimStart())
    .filter(Boolean)
    .some((item) => legacyListContains(list, item));
}
