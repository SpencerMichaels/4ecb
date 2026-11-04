import { readFile } from "node:fs/promises";

const serviceWorker = await readFile("apps/web/dist/sw.js", "utf8");
const precacheStart = serviceWorker.indexOf("precacheAndRoute");
const precacheEnd = serviceWorker.indexOf(
  "cleanupOutdatedCaches",
  precacheStart,
);

if (precacheStart < 0 || precacheEnd < 0) {
  throw new Error("Could not locate the generated Workbox precache manifest");
}

const precacheManifest = serviceWorker.slice(precacheStart, precacheEnd);
if (precacheManifest.includes("runtime-config.json")) {
  throw new Error("runtime-config.json must not be service-worker precached");
}

if (
  !serviceWorker.includes("runtime-config") ||
  !serviceWorker.includes("NetworkOnly")
) {
  throw new Error("runtime-config.json must have a NetworkOnly Workbox route");
}

for (const routeChunk of [
  "CharacterEditorPage-",
  "CharacterSheetPage-",
  "SettingsPage-",
]) {
  if (!precacheManifest.includes(routeChunk))
    throw new Error(
      `${routeChunk} route chunk must be precached for offline use`,
    );
}

console.log(
  "PWA runtime configuration stays outside the precache; lazy route chunks stay available offline.",
);

// The installed app's title bar follows the page theme: the first paint carries
// one theme-color per prefers-color-scheme, light matching the manifest default.
const manifest = JSON.parse(
  await readFile("apps/web/dist/manifest.webmanifest", "utf8"),
);
const html = await readFile("apps/web/dist/index.html", "utf8");
const themeColors = Object.fromEntries(
  [...html.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)].map(([tag]) => [
    /media="\(prefers-color-scheme: (\w+)\)"/.exec(tag)?.[1],
    /content="([^"]+)"/.exec(tag)?.[1],
  ]),
);
if (!themeColors.light || !themeColors.dark)
  throw new Error("index.html needs light and dark theme-color metas");
if (themeColors.light !== manifest.theme_color)
  throw new Error("manifest theme_color must match the light theme-color");
console.log("theme-color follows prefers-color-scheme on first paint.");
