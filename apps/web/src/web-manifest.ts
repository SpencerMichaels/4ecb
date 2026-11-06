import { PWA_ICONS, type PwaIcon } from "./pwa-icons";

/**
 * The installed app's web manifest, emitted as `manifest.webmanifest` by
 * vite.config.ts. DOM-free, so the build and tests share it.
 *
 * It deliberately has no `theme_color` or `background_color`. A manifest has
 * one color for every color scheme (Chromium ships no dark-mode override: the
 * `user_preferences` experiment is gone and the spec's `color_scheme_dark` is
 * not implemented), and Chromium desktop, macOS included, paints an app
 * window's title bar from, in order: the page's `theme-color` meta, the
 * manifest `theme_color`, a shade of the page or manifest background, else
 * its default frame, which follows Chrome's own light/dark mode. Without
 * manifest colors the title bar is the default frame until the page loads
 * and then the page's meta (`theme.ts` `syncThemeColor`), so nothing pins it
 * light under a dark theme. The page metas also serve Safari's Add to Dock.
 */
export interface WebManifest {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: "standalone";
  readonly lang: string;
  readonly icons: readonly PwaIcon[];
}

export const WEB_MANIFEST_FILENAME = "manifest.webmanifest";

export const WEB_MANIFEST: WebManifest = {
  name: "4E Character Builder",
  short_name: "4E Builder",
  description: "Offline-first D&D 4E character builder",
  start_url: "/",
  scope: "/",
  display: "standalone",
  lang: "en",
  icons: PWA_ICONS,
};
