import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoadingScreen } from "./LoadingScreen";
import { appStyles } from "./test-styles";

describe("character loading screen portrait", () => {
  it("sizes the portrait like the builder sidebar's", () => {
    expect(appStyles).toMatch(/--character-portrait-size: 9rem;/);
    expect(appStyles).toMatch(
      /\.builder-sidebar-identity \.portrait-trigger \{[^}]*width: var\(--character-portrait-size\);/,
    );
    expect(appStyles).toMatch(
      /\.loading-spinner-frame\.is-character-portrait \{[^}]*width: calc\(var\(--character-portrait-size\) \+ 1\.2rem\);/,
    );
  });

  it("uses the large frame only on character pages", () => {
    const character = renderToStaticMarkup(
      createElement(LoadingScreen, { label: "Loading", portraitFrame: true }),
    );
    expect(character).toContain("loading-spinner-frame is-character-portrait");
    const route = renderToStaticMarkup(
      createElement(LoadingScreen, { label: "Loading" }),
    );
    expect(route).not.toContain("is-character-portrait");
  });
});
