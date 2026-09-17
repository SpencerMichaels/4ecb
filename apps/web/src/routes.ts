export type AppRoute =
  | { readonly page: "settings" }
  | {
      readonly page: "characters";
      readonly characterId?: string;
      readonly mode?: "sheet" | "edit";
    };

export function canonicalHashRedirect(hash: string): string | undefined {
  const path = hash.replace(/^#/, "").split("?", 1)[0] ?? "";
  if (
    hash.length === 0 ||
    (path !== "/settings" &&
      path !== "/characters" &&
      !path.startsWith("/characters/"))
  )
    return "#/characters";
  return undefined;
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
  const [path = "/characters"] = route.split("?", 2);
  if (path === "/settings") return { page: "settings" };
  if (path === "/characters") return { page: "characters" };
  const characterPrefix = "/characters/";
  if (path.startsWith(characterPrefix)) {
    const suffix = path.slice(characterPrefix.length);
    const editing = suffix.endsWith("/edit");
    const encodedId = editing ? suffix.slice(0, -5) : suffix;
    const characterId = decodedPathSegment(encodedId);
    if (characterId === undefined) return { page: "characters" };
    return {
      page: "characters",
      ...(characterId.length === 0 ? {} : { characterId }),
      ...(characterId.length === 0 || !editing
        ? {}
        : { mode: "edit" as const }),
    };
  }
  return { page: "characters" };
}
