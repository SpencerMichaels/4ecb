import type { ContentEntity } from "@4ecb/content-domain";

import type { FieldOverlay } from "./evaluator";
import { overlaidField } from "./item-fields";

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

/**
 * Native ListContains: the list is "any", or the item's first
 * case-insensitive occurrence in the list is a whole comma entry (only
 * spaces between it and the neighbouring commas). Like native, only that
 * first occurrence is tested.
 */
export function legacyListContains(list: string, item: string): boolean {
  if (list.toLocaleLowerCase() === "any") return true;
  const start = list.toLocaleLowerCase().indexOf(item.toLocaleLowerCase());
  if (start < 0) return false;
  const after = list.slice(start + item.length).trimStart();
  if (after !== "" && !after.startsWith(",")) return false;
  const before = list.slice(0, start).trimEnd();
  return before === "" || before.endsWith(",");
}

/** Native ListContainsOneOf: the list contains any entry of `items`. */
export function legacyListContainsOneOf(list: string, items: string): boolean {
  return items
    .split(",")
    .map((item) => item.trimStart())
    .filter(Boolean)
    .some((item) => legacyListContains(list, item));
}
