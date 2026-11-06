import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PWA_ICONS } from "./pwa-icons";
import { WEB_MANIFEST, WEB_MANIFEST_FILENAME } from "./web-manifest";

describe("web manifest", () => {
  it("is an installable standalone app with the PWA icons", () => {
    expect(WEB_MANIFEST).toMatchObject({
      name: "4E Character Builder",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(WEB_MANIFEST.icons).toBe(PWA_ICONS);
  });

  it("sets no colors, so nothing pins the title bar to one color scheme", () => {
    const manifest = JSON.parse(JSON.stringify(WEB_MANIFEST)) as object;
    expect(manifest).not.toHaveProperty("theme_color");
    expect(manifest).not.toHaveProperty("background_color");
  });

  it("is the build's manifest, not vite-plugin-pwa's color-defaulting one", () => {
    const config = readFileSync(
      join(import.meta.dirname, "../vite.config.ts"),
      "utf8",
    );
    expect(WEB_MANIFEST_FILENAME).toBe("manifest.webmanifest");
    expect(config).toContain("manifest: false,");
    expect(config).toContain("source: JSON.stringify(WEB_MANIFEST)");
    expect(config).toMatch(/globPatterns: \[[^\]]*webmanifest/);
  });
});
