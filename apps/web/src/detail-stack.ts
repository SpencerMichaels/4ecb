import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
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
  /** 0 for what the option itself lists, 1 for what that offers… */
  readonly depth: number;
  /** The level the option grants it at (its benefit's level for what a
   * benefit offers), when the content says. */
  readonly level?: number;
  /** The paragon path whose characters alone get it (a pact's Legendary
   * Hexblade features); what a benefit offers shares its path. */
  readonly path?: ContentEntity;
}

function positiveLevel(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  const level = Number(value.trim());
  return level > 0 ? level : undefined;
}

function grantAttribute(rule: RuleStatement, name: string): string | undefined {
  return rule.attributes.find((item) => normalized(item.name) === name)?.value;
}

/**
 * The level an option grants one of its own benefits at: its grant's
 * `Level` (a paragon path's level 12 power, a theme's level 5 feature), else
 * the benefit's own `Level` (a pact's level 9 feature, a theme's level 10
 * power), never before the option's own `Level` (a level 16 feature's
 * choice of a level 1 power). An item's powers come with the item.
 */
export function grantedLevel(
  owner: ContentEntity,
  benefit: ContentEntity,
): number | undefined {
  if (isItemEntity(owner)) return undefined;
  const id = normalized(benefit.id);
  const ownLevel = positiveLevel(contentSpecificValue(owner, "Level"));
  const atLeastOwn = (level: number | undefined) =>
    level === undefined || ownLevel === undefined
      ? level
      : Math.max(level, ownLevel);
  for (const rule of owner.rules) {
    if (normalized(rule.name) !== "grant") continue;
    if (normalized(grantAttribute(rule, "name") ?? "") !== id) continue;
    const level = positiveLevel(grantAttribute(rule, "level"));
    if (level !== undefined) return atLeastOwn(level);
  }
  return atLeastOwn(positiveLevel(contentSpecificValue(benefit, "Level")));
}

/** A benefit the option lists itself, at the level it is granted. */
export function optionBenefitEntry(
  owner: ContentEntity,
  benefit: ContentEntity,
): DetailStackEntry {
  const level = grantedLevel(owner, benefit);
  return {
    entity: benefit,
    depth: 0,
    ...(level === undefined ? {} : { level }),
  };
}

const paragonPathIndexes = new WeakMap<
  ReadonlyMap<string, ContentEntity>,
  ReadonlyMap<string, ContentEntity | null>
>();

/**
 * Class features that only one paragon path's characters get, by id: the
 * path's `Class Features` and the features they grant (Legendary
 * Hexblade's Pact Curse grants each pact's own curse feature). Features two
 * paths share are in no path's (null). Powers are left out: a path's power
 * list also names powers other options offer (a bladesinger's utility
 * choices); a path feature's powers follow it anyway.
 */
function paragonPathIndex(
  references: ReadonlyMap<string, ContentEntity>,
): ReadonlyMap<string, ContentEntity | null> {
  const cached = paragonPathIndexes.get(references);
  if (cached !== undefined) return cached;
  const index = new Map<string, ContentEntity | null>();
  const claim = (id: string, path: ContentEntity) => {
    const key = normalized(id);
    const feature = references.get(key);
    if (feature === undefined || normalized(feature.type) !== "class feature")
      return;
    const owner = index.get(key);
    if (owner === undefined) index.set(key, path);
    else if (owner !== null && owner.id !== path.id) index.set(key, null);
  };
  for (const path of new Set(references.values())) {
    if (normalized(path.type) !== "paragon path") continue;
    for (const id of (contentSpecificValue(path, "Class Features") ?? "").split(
      ",",
    )) {
      claim(id, path);
      for (const rule of references.get(normalized(id))?.rules ?? [])
        if (normalized(rule.name) === "grant")
          claim(grantAttribute(rule, "name") ?? "", path);
    }
  }
  paragonPathIndexes.set(references, index);
  return index;
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
  // A paragon path's own features are simply its benefits.
  const paths =
    normalized(root.type) === "paragon path"
      ? undefined
      : paragonPathIndex(references);
  const visit = (
    owner: ContentEntity,
    depth: number,
    ownerLevel: number | undefined,
    ownerPath: ContentEntity | undefined,
  ): void => {
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
      // What a benefit offers comes with it, whatever its own level.
      const level =
        depth === 0 ? grantedLevel(owner, child.entity) : ownerLevel;
      const path = depth === 0 ? (paths?.get(id) ?? undefined) : ownerPath;
      entries.push({
        ...child,
        depth,
        ...(level === undefined ? {} : { level }),
        ...(path === undefined ? {} : { path }),
      });
      visit(child.entity, depth + 1, level, path);
    }
  };
  visit(root, 0, undefined, undefined);
  return entries;
}

/** Leaves out what only another paragon path than the character's gets. */
export function entriesForParagonPath(
  entries: readonly DetailStackEntry[],
  paragonPathId: string | undefined,
): readonly DetailStackEntry[] {
  return paragonPathId === undefined
    ? entries
    : entries.filter(
        ({ path }) =>
          path === undefined ||
          normalized(path.id) === normalized(paragonPathId),
      );
}

export interface DetailStackLevelGroup {
  readonly level: number;
  /** In stack order: each benefit followed by what it offers. */
  readonly entries: readonly DetailStackEntry[];
}

export interface DetailStackSection {
  /** Its first level. */
  readonly level: number;
  /** A paragon path's benefits, by level; otherwise one level's. */
  readonly path?: ContentEntity;
  readonly levels: readonly DetailStackLevelGroup[];
  readonly entries: readonly DetailStackEntry[];
}

/**
 * The stack split by the level each benefit is granted at, lowest first,
 * with what only one paragon path's characters get in a section per path
 * (by level within it), placed at its first level after any path-free
 * benefits of that level. With `paragonPathId` (the character's path) only
 * that path's benefits are kept. No sections when everything comes at one
 * level (most feats, a choice's options, a deity's domains), so that stack
 * stays flat. A benefit the content gives no level comes with the option,
 * at its first level.
 */
export function detailStackSections(
  allEntries: readonly DetailStackEntry[],
  { paragonPathId }: { readonly paragonPathId?: string | undefined } = {},
): readonly DetailStackSection[] {
  const entries = entriesForParagonPath(allEntries, paragonPathId);
  const known = entries.flatMap(({ level }) =>
    level === undefined ? [] : [level],
  );
  const first = known.length === 0 ? 1 : Math.min(...known);
  const groups = new Map<
    string,
    { path?: ContentEntity; levels: Map<number, DetailStackEntry[]> }
  >();
  for (const entry of entries) {
    const level = entry.level ?? first;
    const key =
      entry.path === undefined
        ? `level:${String(level)}`
        : `path:${normalized(entry.path.id)}`;
    const group = groups.get(key) ?? {
      ...(entry.path === undefined ? {} : { path: entry.path }),
      levels: new Map<number, DetailStackEntry[]>(),
    };
    const levelEntries = group.levels.get(level) ?? [];
    levelEntries.push(entry);
    group.levels.set(level, levelEntries);
    groups.set(key, group);
  }
  if (groups.size < 2) return [];
  return [...groups.values()]
    .map(({ path, levels }) => {
      const byLevel = [...levels]
        .sort(([left], [right]) => left - right)
        .map(([level, levelEntries]) => ({ level, entries: levelEntries }));
      return {
        level: byLevel[0]?.level ?? first,
        ...(path === undefined ? {} : { path }),
        levels: byLevel,
        entries: byLevel.flatMap((group) => group.entries),
      };
    })
    .sort(
      (left, right) =>
        left.level - right.level ||
        Number(left.path !== undefined) - Number(right.path !== undefined) ||
        (left.path?.name ?? "").localeCompare(right.path?.name ?? ""),
    );
}

function benefitNoun(entity: ContentEntity): string {
  const type = normalized(entity.type);
  if (["class feature", "racial trait"].includes(type)) return "feature";
  if (isItemEntity(entity)) return "item";
  if (isFamiliarEntity(entity)) return "familiar";
  return type;
}

const escapeRegExp = (value: string) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A section's heading: "Level 9" or "Legendary Hexblade (Levels 11–20)",
 * what it holds ("1 feature, 3 powers") and the benefits granted in it,
 * without a repeated "Level 9" name prefix or "(Legendary Hexblade)" suffix.
 */
export function detailStackSectionHeading(section: DetailStackSection): {
  readonly label: string;
  readonly count: string;
  readonly names: readonly string[];
} {
  const pathSuffix =
    section.path === undefined
      ? undefined
      : new RegExp(
          `\\s*[([]${escapeRegExp(section.path.name.trim())}[)\\]]$`,
          "iu",
        );
  const names = section.levels.flatMap(({ level, entries }) => {
    const prefix = new RegExp(`^level ${String(level)}\\b[\\s:]*`, "iu");
    return entries
      .filter((entry) => entry.depth === 0)
      .map(({ entity }) => {
        let name = entity.name.trim().replace(prefix, "");
        if (pathSuffix !== undefined) name = name.replace(pathSuffix, "");
        return name || entity.name.trim();
      });
  });
  const counts = new Map<string, number>();
  for (const { entity } of section.entries) {
    const noun = benefitNoun(entity);
    counts.set(noun, (counts.get(noun) ?? 0) + 1);
  }
  const lowest = section.levels[0]?.level ?? section.level;
  const highest = section.levels.at(-1)?.level ?? section.level;
  return {
    label:
      section.path === undefined
        ? `Level ${String(section.level)}`
        : `${section.path.name.trim()} (${
            lowest === highest
              ? `Level ${String(lowest)}`
              : `Levels ${String(lowest)}–${String(highest)}`
          })`,
    count: [...counts]
      .map(
        ([noun, count]) => `${String(count)} ${noun}${count === 1 ? "" : "s"}`,
      )
      .join(", "),
    names,
  };
}
