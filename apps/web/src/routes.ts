export type BuilderWorkspaceTab =
  | "build"
  | "retraining"
  | "details"
  | "equipment"
  | "shop"
  | "rituals"
  | "diagnostics"
  | "house-rules";

export type BuilderSectionSlug =
  | "class"
  | "race"
  | "background"
  | "theme"
  | "ability-scores"
  | "companion"
  | "skills"
  | "powers"
  | "spellbook"
  | "feats"
  | "retraining"
  | "other";

export type ShopCategory =
  | "items"
  | "scrolls"
  | "all"
  | "adventuring-gear"
  | "ammunition"
  | "armor-shields"
  | "armor-enchantments"
  | "companions-mounts"
  | "consumables"
  | "implement-enchantments"
  | "implements"
  | "special-items"
  | "weapons"
  | "weapon-enchantments"
  | "wondrous-items"
  | "worn-items";

/** A catalog the Rituals tab learns from; opening one shows the catalog. */
export type RitualCategory =
  "rituals" | "alchemical-formulas" | "martial-practices";

export type BuilderNavigation =
  | {
      readonly workspace: "build";
      readonly level?: number;
      readonly section?: BuilderSectionSlug;
    }
  | { readonly workspace: "retraining"; readonly level?: number }
  | { readonly workspace: "details" | "diagnostics" | "house-rules" }
  | { readonly workspace: "equipment"; readonly loadout?: boolean }
  | { readonly workspace: "shop"; readonly category?: ShopCategory }
  | { readonly workspace: "rituals"; readonly category?: RitualCategory };

export type AppRoute =
  | { readonly page: "settings" }
  | {
      readonly page: "characters";
      readonly characterId?: string;
      readonly mode?: "sheet" | "edit";
      readonly print?: boolean;
      readonly preview?: boolean;
      /** The print preview's Edit mode (D099); only with `preview`. */
      readonly sheetEdit?: boolean;
      readonly builder?: BuilderNavigation;
    };

const BUILDER_WORKSPACES: readonly BuilderWorkspaceTab[] = [
  "build",
  "retraining",
  "details",
  "equipment",
  "shop",
  "rituals",
  "diagnostics",
  "house-rules",
];
const BUILDER_SECTIONS: readonly BuilderSectionSlug[] = [
  "class",
  "race",
  "background",
  "theme",
  "ability-scores",
  "companion",
  "skills",
  "powers",
  "spellbook",
  "feats",
  "retraining",
  "other",
];
const SHOP_CATEGORIES: readonly ShopCategory[] = [
  "items",
  "all",
  "adventuring-gear",
  "ammunition",
  "armor-shields",
  "armor-enchantments",
  "companions-mounts",
  "consumables",
  "implement-enchantments",
  "implements",
  "special-items",
  "weapons",
  "weapon-enchantments",
  "wondrous-items",
  "worn-items",
  "scrolls",
];
const RITUAL_CATEGORIES: readonly RitualCategory[] = [
  "rituals",
  "alchemical-formulas",
  "martial-practices",
];

function includesValue<T extends string>(
  values: readonly T[],
  value: string | null,
): value is T {
  return value !== null && values.some((candidate) => candidate === value);
}

function parseBuilderNavigation(query: string): BuilderNavigation {
  const parameters = new URLSearchParams(query);
  const requestedWorkspace = parameters.get("tab");
  const workspace = includesValue(BUILDER_WORKSPACES, requestedWorkspace)
    ? requestedWorkspace
    : "build";
  if (workspace === "equipment") {
    const section = parameters.get("section");
    if (section === "shop") return { workspace: "shop", category: "items" };
    if (section === "practices") return { workspace: "rituals" };
    return {
      workspace,
      ...(section === "loadout" || parameters.get("loadout") === "1"
        ? { loadout: true }
        : {}),
    };
  }
  if (workspace === "shop") {
    const category = parameters.get("category");
    // Learning moved out of Shop into the Rituals tab.
    if (includesValue(RITUAL_CATEGORIES, category))
      return { workspace: "rituals", category };
    return {
      workspace,
      ...(includesValue(SHOP_CATEGORIES, category) ? { category } : {}),
    };
  }
  if (workspace === "rituals") {
    const category = parameters.get("category");
    return {
      workspace,
      ...(includesValue(RITUAL_CATEGORIES, category) ? { category } : {}),
    };
  }
  const levelValue = parameters.get("level");
  const level = levelValue === null ? undefined : Number(levelValue);
  const levelParameter =
    Number.isInteger(level) && level! >= 1 && level! <= 30
      ? { level: level as number }
      : {};
  if (workspace === "retraining")
    return { workspace: "retraining", ...levelParameter };
  if (workspace !== "build") return { workspace };
  const section = parameters.get("section");
  // Retraining was a Build section; it is its own tab now.
  if (section === "retraining")
    return { workspace: "retraining", ...levelParameter };
  return {
    workspace,
    ...levelParameter,
    ...(includesValue(BUILDER_SECTIONS, section) ? { section } : {}),
  };
}

function decodedPathSegment(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function parseHashRoute(hash: string): AppRoute {
  const route = hash.replace(/^#/, "") || "/characters";
  const [path = "/characters", query = ""] = route.split("?", 2);
  if (path === "/settings") return { page: "settings" };
  if (path === "/characters") return { page: "characters" };
  const match = /^\/characters\/(.+?)(\/edit)?$/.exec(path);
  if (match !== null) {
    const characterId = decodedPathSegment(match[1]!);
    if (characterId === undefined || characterId.length === 0)
      return { page: "characters" };
    const editing = match[2] !== undefined;
    const parameters = new URLSearchParams(query);
    return {
      page: "characters",
      characterId,
      ...(editing
        ? {
            mode: "edit" as const,
            builder: parseBuilderNavigation(query),
          }
        : parameters.get("print") === "1"
          ? // Printing is always the View sheet.
            { print: true }
          : parameters.get("preview") === "1"
            ? {
                preview: true,
                ...(parameters.get("edit") === "1" ? { sheetEdit: true } : {}),
              }
            : {}),
    };
  }
  return { page: "characters" };
}

export function characterEditorHash(
  characterId: string,
  navigation: BuilderNavigation,
): string {
  const parameters = new URLSearchParams({ tab: navigation.workspace });
  if (navigation.workspace === "build") {
    if (navigation.level !== undefined)
      parameters.set("level", String(navigation.level));
    if (navigation.section !== undefined)
      parameters.set("section", navigation.section);
  } else if (navigation.workspace === "retraining") {
    if (navigation.level !== undefined)
      parameters.set("level", String(navigation.level));
  } else if (navigation.workspace === "equipment") {
    if (navigation.loadout === true) parameters.set("loadout", "1");
  } else if (
    navigation.workspace === "shop" ||
    navigation.workspace === "rituals"
  ) {
    if (navigation.category !== undefined)
      parameters.set("category", navigation.category);
  }
  return `#/characters/${encodeURIComponent(characterId)}/edit?${parameters.toString()}`;
}

interface HashNavigationTarget {
  readonly location: { readonly hash: string };
  readonly history: {
    pushState(data: null, unused: string, url: string): void;
    replaceState(data: null, unused: string, url: string): void;
  };
}

export function commitHashNavigation(
  target: HashNavigationTarget,
  next: string,
  replace = false,
): boolean {
  if (next === target.location.hash) return false;
  if (replace) target.history.replaceState(null, "", next);
  else target.history.pushState(null, "", next);
  return true;
}

function hashForRoute(route: AppRoute): string {
  if (route.page === "settings") return "#/settings";
  if (route.characterId === undefined) return "#/characters";
  if (route.mode === "edit")
    return characterEditorHash(
      route.characterId,
      route.builder ?? { workspace: "build" },
    );
  return characterSheetHash(route.characterId, {
    ...(route.print === true ? { print: true } : {}),
    ...(route.preview === true ? { preview: true } : {}),
    ...(route.sheetEdit === true ? { edit: true } : {}),
  });
}

/** The character sheet: print preview (View or Edit mode) or auto-print. */
export function characterSheetHash(
  characterId: string,
  options: {
    readonly preview?: boolean;
    readonly edit?: boolean;
    readonly print?: boolean;
  } = {},
): string {
  const query =
    options.print === true
      ? "?print=1"
      : options.preview === true
        ? options.edit === true
          ? "?preview=1&edit=1"
          : "?preview=1"
        : "";
  return `#/characters/${encodeURIComponent(characterId)}${query}`;
}

export function canonicalHashRedirect(hash: string): string | undefined {
  const canonical = hashForRoute(parseHashRoute(hash));
  return hash === canonical ? undefined : canonical;
}
