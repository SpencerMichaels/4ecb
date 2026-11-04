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

/**
 * Points the browser/installed-app chrome at the effective theme: the page
 * background token (`--background`) as resolved on `root` right now. The
 * initial HTML carries one `theme-color` per `prefers-color-scheme` (from
 * vite.config.ts); once the app runs it keeps a single unconditional one, so
 * an explicit light/dark setting wins over the system preference.
 */
export function syncThemeColor(document: Document): void {
  const color = document.defaultView
    ?.getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();
  if (!color) return;
  const [meta, ...variants] = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );
  for (const variant of variants) variant.remove();
  const target =
    meta ?? document.head.appendChild(document.createElement("meta"));
  target.name = "theme-color";
  target.removeAttribute("media");
  target.content = color;
}
