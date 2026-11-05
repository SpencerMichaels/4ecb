import type { ContentEntity } from "./index";

/**
 * Per-content caching. A content array (a pack's or profile's entities) is
 * immutable, so anything derived from it alone — an id map, a rules index, a
 * filtered record family — is built once per array and reused by every call
 * that receives the same array, instead of once per call, card or row. Work
 * that depends on the character belongs in a per-character-state memo, not
 * here.
 */
const builds = new Map<string, number>();

/**
 * Wraps `build` so it runs once per content array (by identity). `label`
 * names the cache in `contentCacheBuildCounts`, which tests use to prove a
 * render or repeated evaluation does not rebuild per-content setup.
 */
export function contentCache<T>(
  label: string,
  build: (entities: readonly ContentEntity[]) => T,
): (entities: readonly ContentEntity[]) => T {
  if (!builds.has(label)) builds.set(label, 0);
  const cache = new WeakMap<readonly ContentEntity[], T>();
  return (entities) => {
    if (cache.has(entities)) return cache.get(entities) as T;
    builds.set(label, (builds.get(label) ?? 0) + 1);
    const created = build(entities);
    cache.set(entities, created);
    return created;
  };
}

/** How many times each content cache has built its value, by label. */
export function contentCacheBuildCounts(): ReadonlyMap<string, number> {
  return new Map(builds);
}

/**
 * Content records by lower-cased, trimmed id (the last record of an id
 * wins, as `new Map(entries)` would). Read-only: callers never mutate it.
 */
export const contentEntitiesById = contentCache(
  "entities-by-id",
  (entities): ReadonlyMap<string, ContentEntity> =>
    new Map(
      entities.map((entity) => [entity.id.trim().toLocaleLowerCase(), entity]),
    ),
);

const SCAN_METHODS = new Set<PropertyKey>([
  "map",
  "filter",
  "flatMap",
  "forEach",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "some",
  "every",
  "reduce",
  "includes",
  "indexOf",
  "slice",
  "concat",
  "entries",
  "values",
  Symbol.iterator,
]);

/**
 * A test aid: the same records behind a proxy that counts whole-array
 * scans (iteration and the array methods that walk it). Guard tests use it
 * to prove that once per-content caches are warm, a repeated call over the
 * same content scans none of it.
 */
export function scanCountingContent(entities: readonly ContentEntity[]): {
  readonly content: readonly ContentEntity[];
  readonly scans: () => number;
} {
  let scans = 0;
  const content = new Proxy(entities, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (!SCAN_METHODS.has(property) || typeof value !== "function")
        return value;
      return (...args: unknown[]) => {
        scans += 1;
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { content, scans: () => scans };
}
