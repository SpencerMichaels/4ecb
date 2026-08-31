import {
  deserializeCompendiumQuery,
  serializeCompendiumQuery,
  type CompendiumQuery,
} from "@4ecb/query-engine";

export type AppRoute =
  | { readonly page: "settings" }
  | {
      readonly page: "compendium";
      readonly query: CompendiumQuery;
      readonly entityId?: string;
    };

export function parseHashRoute(hash: string): AppRoute {
  const route = hash.replace(/^#/, "") || "/compendium";
  const [path = "/compendium", search = ""] = route.split("?", 2);
  if (path === "/settings") return { page: "settings" };
  const entityPrefix = "/compendium/entity/";
  if (path.startsWith(entityPrefix)) {
    const entityId = decodeURIComponent(path.slice(entityPrefix.length));
    return {
      page: "compendium",
      query: deserializeCompendiumQuery(search),
      ...(entityId.length === 0 ? {} : { entityId }),
    };
  }
  return { page: "compendium", query: deserializeCompendiumQuery(search) };
}

export function compendiumHash(
  query: Partial<CompendiumQuery>,
  entityId?: string,
): string {
  const path =
    entityId === undefined
      ? "/compendium"
      : `/compendium/entity/${encodeURIComponent(entityId)}`;
  return `#${path}?${serializeCompendiumQuery(query)}`;
}
