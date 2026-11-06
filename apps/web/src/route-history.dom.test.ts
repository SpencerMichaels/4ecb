// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  characterSheetHash,
  commitHashNavigation,
  previousRouteHash,
  recordRouteEntry,
} from "./routes";

describe("route records in the real History API", () => {
  it("round-trips through window.history.state", () => {
    window.history.replaceState(null, "", "#/characters");
    recordRouteEntry(window, undefined);
    expect(previousRouteHash(window)).toBeNull();
    const sheet = characterSheetHash("one", { preview: true });
    commitHashNavigation(window, sheet);
    expect(window.location.hash).toBe(sheet);
    expect(previousRouteHash(window)).toBe("#/characters");
    commitHashNavigation(
      window,
      characterSheetHash("one", { preview: true, edit: true }),
      true,
    );
    expect(previousRouteHash(window)).toBe("#/characters");
  });
});
