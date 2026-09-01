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

console.log("PWA runtime configuration stays outside the precache.");
