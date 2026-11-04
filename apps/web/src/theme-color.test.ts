// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyThemePreference, syncThemeColor } from "./theme";
import { themeBackgrounds } from "./theme-tokens";

const baseCss = readFileSync(
  join(import.meta.dirname, "styles/01-base.css"),
  "utf8",
);

function themeColorMetas(): HTMLMetaElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );
}

describe("theme-color", () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.theme;
  });

  it("reads each theme's page background from the theme definitions", () => {
    const backgrounds = themeBackgrounds(baseCss);
    expect(backgrounds.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgrounds.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgrounds.dark).not.toBe(backgrounds.light);
    // The system-dark variant repeats the explicit dark tokens.
    const systemDark = baseCss.slice(
      baseCss.indexOf("@media (prefers-color-scheme: dark)"),
    );
    expect(systemDark).toContain(`--background: ${backgrounds.dark};`);
  });

  it("replaces the first paint's media variants with the effective theme", () => {
    for (const scheme of ["light", "dark"]) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
      meta.content = scheme === "light" ? "#eeeeee" : "#111111";
      document.head.append(meta);
    }
    const root = document.documentElement;

    applyThemePreference(root, "dark");
    root.style.setProperty("--background", "#111727");
    syncThemeColor(document);
    expect(
      themeColorMetas().map((meta) => [
        meta.getAttribute("media"),
        meta.content,
      ]),
    ).toEqual([[null, "#111727"]]);

    applyThemePreference(root, "light");
    root.style.setProperty("--background", "#eef2f6");
    syncThemeColor(document);
    expect(
      themeColorMetas().map((meta) => [
        meta.getAttribute("media"),
        meta.content,
      ]),
    ).toEqual([[null, "#eef2f6"]]);
  });

  it("adds the meta when the page has none and skips an unresolved token", () => {
    syncThemeColor(document);
    expect(themeColorMetas()).toEqual([]);
    document.documentElement.style.setProperty("--background", "#111727");
    syncThemeColor(document);
    expect(themeColorMetas().map((meta) => meta.content)).toEqual(["#111727"]);
  });
});
