/**
 * The installed-app icons (manifest `icons` in vite.config.ts, and the Apple
 * touch icon linked from index.html). The PNGs under `public/icons/` are
 * rendered from `public/icon.svg`, the favicon, by
 * `apps/web/scripts/render-pwa-icons.mjs`; Chrome on desktop needs PNGs, an
 * SVG-only manifest leaves the installed app without an icon.
 */
export interface PwaIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: "any" | "maskable";
}

export const PWA_ICONS: readonly PwaIcon[] = [
  { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  {
    src: "/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

export const APPLE_TOUCH_ICON = "/icons/apple-touch-icon-180.png";
