export type BuilderWorkspaceTab =
  | "build"
  | "overview"
  | "retraining"
  | "details"
  | "equipment"
  | "shop"
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
  | "worn-items"
  | RitualCategory;

/** A Shop catalog whose records are learned (known), not held. */
export type RitualCategory =
  "rituals" | "alchemical-formulas" | "martial-practices";

export type BuilderNavigation =
  | {
      readonly workspace: "build";
      readonly level?: number;
      readonly section?: BuilderSectionSlug;
    }
  | { readonly workspace: "retraining"; readonly level?: number }
  | {
      readonly workspace:
        "overview" | "details" | "diagnostics" | "house-rules";
    }
  | { readonly workspace: "equipment"; readonly loadout?: boolean }
  | { readonly workspace: "shop"; readonly category?: ShopCategory };

export type AppRoute =
  | { readonly page: "settings" }
  /** A campaign invite (D116): the hosted campaign, by ID. */
  | { readonly page: "campaign-join"; readonly campaignId: string }
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
  "overview",
  "retraining",
  "details",
  "equipment",
  "shop",
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
  "rituals",
  "alchemical-formulas",
  "martial-practices",
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

/**
 * The `tab=` slug a workspace shows in the URL: the visible tab name. The
 * equipment workspace is two tabs, Inventory and Loadout.
 */
function builderTabSlug(navigation: BuilderNavigation): string {
  if (navigation.workspace === "equipment")
    return navigation.loadout === true ? "loadout" : "inventory";
  return navigation.workspace;
}

function parseBuilderNavigation(query: string): BuilderNavigation {
  const parameters = new URLSearchParams(query);
  const requestedWorkspace = parameters.get("tab");
  if (requestedWorkspace === "inventory") return { workspace: "equipment" };
  // The Rituals tab folded into the Shop's learning categories, its known
  // list into the Inventory (D114).
  if (requestedWorkspace === "rituals") {
    const category = parameters.get("category");
    return {
      workspace: "shop",
      category: includesValue(RITUAL_CATEGORIES, category)
        ? category
        : "rituals",
    };
  }
  if (requestedWorkspace === "loadout")
    return { workspace: "equipment", loadout: true };
  const workspace = includesValue(BUILDER_WORKSPACES, requestedWorkspace)
    ? requestedWorkspace
    : "build";
  // `tab=equipment` (optionally `loadout=1` or an old `section`) is the URL
  // from before the Inventory/Loadout slugs; it canonicalizes to them.
  if (workspace === "equipment") {
    const section = parameters.get("section");
    if (section === "shop") return { workspace: "shop", category: "items" };
    if (section === "practices")
      return { workspace: "shop", category: "rituals" };
    return {
      workspace,
      ...(section === "loadout" || parameters.get("loadout") === "1"
        ? { loadout: true }
        : {}),
    };
  }
  if (workspace === "shop") {
    const category = parameters.get("category");
    return {
      workspace,
      ...(includesValue(SHOP_CATEGORIES, category) ? { category } : {}),
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
  const join = /^\/campaigns\/join\/([^/]+)$/.exec(path);
  if (join !== null) {
    const campaignId = decodedPathSegment(join[1]!);
    return campaignId === undefined || campaignId.length === 0
      ? { page: "characters" }
      : { page: "campaign-join", campaignId };
  }
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
  const parameters = new URLSearchParams({ tab: builderTabSlug(navigation) });
  if (navigation.workspace === "build") {
    if (navigation.level !== undefined)
      parameters.set("level", String(navigation.level));
    if (navigation.section !== undefined)
      parameters.set("section", navigation.section);
  } else if (navigation.workspace === "retraining") {
    if (navigation.level !== undefined)
      parameters.set("level", String(navigation.level));
  } else if (navigation.workspace === "shop") {
    if (navigation.category !== undefined)
      parameters.set("category", navigation.category);
  }
  return `#/characters/${encodeURIComponent(characterId)}/edit?${parameters.toString()}`;
}

/**
 * The key this app keeps in each history entry's `history.state`: the hash
 * of the in-app entry right before it (`null` when the entry was opened
 * directly or came from outside the app). Back controls read it to decide
 * whether a real Back returns where the player came from. `history.state`
 * is per entry and survives a reload, so no other storage is needed.
 */
const ROUTE_ENTRY_STATE_KEY = "4ecb.route";

interface RouteEntryState {
  readonly previousHash: string | null;
}

export interface HashNavigationTarget {
  readonly location: { readonly hash: string };
  readonly history: {
    readonly state?: unknown;
    pushState(data: unknown, unused: string, url: string): void;
    replaceState(data: unknown, unused: string, url: string): void;
  };
}

export interface HashHistoryTarget extends HashNavigationTarget {
  readonly history: HashNavigationTarget["history"] & { back(): void };
}

function routeEntryState(state: unknown): RouteEntryState | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const entry = (state as Record<string, unknown>)[ROUTE_ENTRY_STATE_KEY];
  if (typeof entry !== "object" || entry === null) return undefined;
  const previousHash = (entry as Record<string, unknown>).previousHash;
  return typeof previousHash === "string" || previousHash === null
    ? { previousHash }
    : undefined;
}

function withRouteEntryState(
  state: unknown,
  entry: RouteEntryState,
): Record<string, unknown> {
  return {
    ...(typeof state === "object" && state !== null ? state : {}),
    [ROUTE_ENTRY_STATE_KEY]: entry,
  };
}

/**
 * The hash of the in-app entry before the current one: `null` when there
 * is none (opened directly, or from outside the app), `undefined` when the
 * entry carries no record.
 */
export function previousRouteHash(
  target: HashNavigationTarget,
): string | null | undefined {
  return routeEntryState(target.history.state)?.previousHash;
}

/**
 * Records where the current entry came from when it has no record yet: an
 * entry the browser added (a link, a typed hash, a direct open) rather than
 * `commitHashNavigation`. Entries revisited with Back/Forward or a reload
 * keep their record. `previousHash` is the hash the app showed before
 * (undefined on the app's first route).
 */
export function recordRouteEntry(
  target: HashNavigationTarget,
  previousHash: string | undefined,
): void {
  if (routeEntryState(target.history.state) !== undefined) return;
  target.history.replaceState(
    withRouteEntryState(target.history.state, {
      previousHash:
        previousHash === undefined || previousHash === target.location.hash
          ? null
          : previousHash,
    }),
    "",
    target.location.hash,
  );
}

/**
 * An in-app Back control: a real `history.back()` whenever the previous
 * entry is any page of this app (so that page's state, scroll and the
 * Forward stack behave like the browser's Back) and true; false when the
 * page was opened directly or from outside the app, and the caller then
 * navigates to its own fallback with `replace`, so the browser's Back
 * never loops between the two pages.
 */
export function backToPreviousRoute(target: HashHistoryTarget): boolean {
  const previous = previousRouteHash(target);
  if (previous === null || previous === undefined) return false;
  target.history.back();
  return true;
}

/**
 * The sheet's Back label (tooltip and accessible name): where Back lands.
 * `previousHash` is the entry's record (`previousRouteHash`); a real Back
 * returns to that page, and with no in-app page before (`null`/`undefined`)
 * the sheet falls back to this character's builder.
 */
export function sheetBackLabel(
  previousHash: string | null | undefined,
): string {
  if (previousHash === null || previousHash === undefined)
    return "Return to builder";
  const route = parseHashRoute(previousHash);
  if (route.page === "settings") return "Return to settings";
  if (route.page === "campaign-join") return "Return to campaign invite";
  if (route.characterId === undefined) return "Return to library";
  return route.mode === "edit" ? "Return to builder" : "Return to sheet";
}

/**
 * Moves to `next`. A push records the entry it came from; a replace keeps
 * the replaced entry's record, since the entry before it is unchanged.
 */
export function commitHashNavigation(
  target: HashNavigationTarget,
  next: string,
  replace = false,
): boolean {
  if (next === target.location.hash) return false;
  if (replace) target.history.replaceState(target.history.state, "", next);
  else
    target.history.pushState(
      withRouteEntryState(null, { previousHash: target.location.hash }),
      "",
      next,
    );
  return true;
}

function hashForRoute(route: AppRoute): string {
  if (route.page === "settings") return "#/settings";
  if (route.page === "campaign-join") return campaignJoinHash(route.campaignId);
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

/** A campaign's invite page (D116); Settings → Campaigns copies it as an
 *  absolute link. */
export function campaignJoinHash(campaignId: string): string {
  return `#/campaigns/join/${encodeURIComponent(campaignId)}`;
}
