export type BuilderWorkspaceTab =
  "build" | "overview" | "details" | "equipment" | "diagnostics";

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

export type EquipmentSection = "loadout" | "inventory" | "shop" | "practices";

export type BuilderNavigation =
  | {
      readonly workspace: "build";
      readonly level?: number;
      readonly section?: BuilderSectionSlug;
    }
  | { readonly workspace: "overview" | "details" | "diagnostics" }
  | {
      readonly workspace: "equipment";
      readonly section: EquipmentSection;
    };

export type AppRoute =
  | { readonly page: "settings" }
  | {
      readonly page: "characters";
      readonly characterId?: string;
      readonly mode?: "sheet" | "edit";
      readonly builder?: BuilderNavigation;
    };

const BUILDER_WORKSPACES: readonly BuilderWorkspaceTab[] = [
  "build",
  "overview",
  "details",
  "equipment",
  "diagnostics",
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
const EQUIPMENT_SECTIONS: readonly EquipmentSection[] = [
  "loadout",
  "inventory",
  "shop",
  "practices",
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
    return {
      workspace,
      section: includesValue(EQUIPMENT_SECTIONS, section) ? section : "loadout",
    };
  }
  if (workspace !== "build") return { workspace };
  const levelValue = parameters.get("level");
  const level = levelValue === null ? undefined : Number(levelValue);
  const section = parameters.get("section");
  return {
    workspace,
    ...(Number.isInteger(level) && level! >= 1 && level! <= 30
      ? { level: level as number }
      : {}),
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
    return {
      page: "characters",
      characterId,
      ...(editing
        ? {
            mode: "edit" as const,
            builder: parseBuilderNavigation(query),
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
  } else if (navigation.workspace === "equipment") {
    parameters.set("section", navigation.section);
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
  return `#/characters/${encodeURIComponent(route.characterId)}`;
}

export function canonicalHashRedirect(hash: string): string | undefined {
  const canonical = hashForRoute(parseHashRoute(hash));
  return hash === canonical ? undefined : canonical;
}
