import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const loadingScreen = readFileSync(
  new URL("./LoadingScreen.tsx", import.meta.url),
  "utf8",
);

describe("route-level lazy loading", () => {
  it("keeps the library in the shell and splits the three large workspaces", () => {
    expect(app).toContain(
      'import { CharacterLibraryPage } from "./CharacterLibraryPage"',
    );
    expect(app).toContain('import("./CharacterEditorPage")');
    expect(app).toContain('import("./CharacterSheetPage")');
    expect(app).toContain('import("./SettingsPage")');
    expect(app).not.toContain(
      'import { CharacterEditorPage } from "./CharacterEditorPage"',
    );
    expect(app).not.toContain(
      'import { CharacterSheetPage } from "./CharacterSheetPage"',
    );
    expect(app).not.toContain('import { SettingsPage } from "./SettingsPage"');
  });

  it("provides an accessible route loading landmark", () => {
    expect(app).toContain("<Suspense");
    expect(app).toContain('className="route-loading-state"');
    expect(app).toContain("routeLoading");
    expect(app).toContain("Loading workspace…");
    expect(loadingScreen).toContain('aria-busy="true"');
    expect(loadingScreen).toContain('"data-route-loading": "true"');
  });

  it("starts only a directly requested workspace before mounting the shell", () => {
    expect(app).toContain("export const initialRouteReady = Promise.all(");
    expect(app).toContain(
      'initialRoute.page === "characters" && initialRoute.mode === "edit"',
    );
    expect(app).toContain('initialRoute.page === "settings"');
  });
});
