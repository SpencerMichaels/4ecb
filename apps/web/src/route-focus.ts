import type { AppRoute } from "./routes";

interface MainContentTarget {
  tabIndex: number;
  focus(options?: FocusOptions): void;
}

interface MainContentDocument {
  getElementById(id: string): MainContentTarget | null;
}

function isEquipmentEditorRoute(
  route: AppRoute,
): route is Extract<AppRoute, { readonly page: "characters" }> {
  return (
    route.page === "characters" &&
    route.characterId !== undefined &&
    route.mode === "edit" &&
    route.builder?.workspace === "equipment"
  );
}

/**
 * Inventory and Loadout are two route-backed views of the same Equipment
 * workspace. Moving focus to the main landmark for that local view change
 * would also scroll the page to the top, unlike a true navigation.
 */
export function shouldFocusMainContentAfterRouteChange(
  previous: AppRoute,
  next: AppRoute,
): boolean {
  return !(
    isEquipmentEditorRoute(previous) &&
    isEquipmentEditorRoute(next) &&
    previous.characterId === next.characterId
  );
}

export function focusMainContent(document_: MainContentDocument): boolean {
  const main = document_.getElementById("main-content");
  if (main === null) return false;
  main.tabIndex = -1;
  main.focus();
  return true;
}
