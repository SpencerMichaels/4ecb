import type { ContentEntity } from "@4ecb/content-domain";
import { isFamiliarEntity } from "@4ecb/sheet-model";

import { contentSpecificValue, grantedDetailEntities } from "./builder-ui";
import { isItemEntity } from "./EntityCard";

const normalized = (value: string) => value.trim().toLocaleLowerCase();

/**
 * Class features listed in `_PARSED_CLASS_FEATURE`: by id (trait packages:
 * a hexblade pact, a cavalier virtue…) or by name (classes: Channel Divinity,
 * Lay on Hands…), preferring a named record that belongs to the owner over a
 * same-named one.
 */
export function namedClassFeatures(
  owner: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  const keys = (contentSpecificValue(owner, "_PARSED_CLASS_FEATURE") ?? "")
    .split(",")
    .map(normalized)
    .filter(Boolean);
  if (keys.length === 0) return [];
  const isFeature = (candidate: ContentEntity) =>
    normalized(candidate.type) === "class feature";
  // Scanned only when a key is not a feature's id: classes list by name.
  let candidates: readonly ContentEntity[] | undefined;
  const seen = new Set<string>();
  return keys.flatMap((key) => {
    const byId = references.get(key);
    let feature =
      byId !== undefined && isFeature(byId) && normalized(byId.id) === key
        ? byId
        : undefined;
    if (feature === undefined) {
      candidates ??= [...new Set(references.values())].filter(
        (candidate) =>
          isFeature(candidate) && keys.includes(normalized(candidate.name)),
      );
      const named = candidates.filter(
        (candidate) => normalized(candidate.name) === key,
      );
      feature =
        named.find(
          (candidate) =>
            normalized(contentSpecificValue(candidate, "Class") ?? "") ===
            normalized(owner.id),
        ) ?? named[0];
    }
    if (feature === undefined || seen.has(feature.id)) return [];
    seen.add(feature.id);
    return [feature];
  });
}

/** Content the detail stack can show as a card of its own. */
function isDetailCardEntity(entity: ContentEntity): boolean {
  return (
    ["class feature", "racial trait", "domain", "feat", "power"].includes(
      normalized(entity.type),
    ) ||
    isItemEntity(entity) ||
    isFamiliarEntity(entity)
  );
}

function namedEntities(
  owner: ContentEntity,
  fields: readonly string[],
  references: ReadonlyMap<string, ContentEntity>,
): ContentEntity[] {
  return fields.flatMap((field) =>
    (contentSpecificValue(owner, field) ?? "").split(",").flatMap((id) => {
      const entity = references.get(normalized(id));
      return entity !== undefined && isDetailCardEntity(entity) ? [entity] : [];
    }),
  );
}

/**
 * The parts an option is made of: a paragon path's or epic destiny's
 * features, a trait package's class features, a theme's level features, a
 * choice's sub-options (Elemental Manifestation → Firesoul…), a deity's
 * domains. Races and classes list their traits inside their own card.
 */
function partDetailEntities(
  owner: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
): ContentEntity[] {
  const type = normalized(owner.type);
  if (["race", "class", "hybrid class"].includes(type)) return [];
  return [
    ...namedEntities(owner, ["Class Features"], references),
    ...namedClassFeatures(owner, references),
    ...namedEntities(
      owner,
      ["_PARSED_SUB_FEATURES", "_PARSED_CHILD_FEATURES", "Domains"],
      references,
    ),
  ];
}

/**
 * Feats, powers and items an option offers: its direct grants, then the ones
 * it names for display (`Powers`, `_DisplayPowers`, `_ChildPower`, an item's
 * `Granted Powers`, `_DisplayWeapons`) but grants later, conditionally or by
 * a choice, such as a paragon path's level 20 power, a domain's level 3 power
 * or a wizard's cantrip choices.
 */
export function offeredDetailEntities(
  owner: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  return [
    ...new Map(
      [
        ...grantedDetailEntities(owner, references),
        ...namedEntities(
          owner,
          [
            "Powers",
            "_DisplayPowers",
            "_ChildPower",
            "Granted Powers",
            "_DisplayWeapons",
          ],
          references,
        ),
      ].map((entity) => [normalized(entity.id), entity]),
    ).values(),
  ];
}

export interface DetailStackEntry {
  readonly entity: ContentEntity;
  /** "Granted power"; parts of the option have none. */
  readonly relationship?: string;
}

/** Root → feature → power → child power. */
const MAX_DETAIL_STACK_DEPTH = 3;

/**
 * Everything an inspected option will eventually give, in reading order and
 * shown once: each part followed by what it offers in turn, then what the
 * option itself offers. `exclude` holds ids shown elsewhere (theme powers).
 */
export function detailStackEntries(
  root: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
  exclude: Iterable<string> = [],
): readonly DetailStackEntry[] {
  const seen = new Set([normalized(root.id), ...[...exclude].map(normalized)]);
  const entries: DetailStackEntry[] = [];
  const visit = (owner: ContentEntity, depth: number): void => {
    if (depth >= MAX_DETAIL_STACK_DEPTH) return;
    const children = [
      ...partDetailEntities(owner, references).map((entity) => ({ entity })),
      ...offeredDetailEntities(owner, references).map((entity) => ({
        entity,
        relationship: `Granted ${entity.type.trim().toLocaleLowerCase()}`,
      })),
    ];
    for (const child of children) {
      const id = normalized(child.entity.id);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push(child);
      visit(child.entity, depth + 1);
    }
  };
  visit(root, 0);
  return entries;
}
