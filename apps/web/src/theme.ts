export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "4ecb.theme.v1";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyThemePreference(
  root: HTMLElement,
  preference: ThemePreference,
): void {
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  root.style.colorScheme = preference === "system" ? "light dark" : preference;
}
