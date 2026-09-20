import { describe, expect, it } from "vitest";

import {
  canonicalHashRedirect,
  characterEditorHash,
  commitHashNavigation,
  parseHashRoute,
} from "./routes";

describe("hash routes", () => {
  it("parses character library and sheet routes", () => {
    expect(parseHashRoute("#/characters")).toEqual({ page: "characters" });
    expect(parseHashRoute("#/characters/character%201")).toEqual({
      page: "characters",
      characterId: "character 1",
    });
    expect(parseHashRoute("#/characters/character%201?print=1")).toEqual({
      page: "characters",
      characterId: "character 1",
      print: true,
    });
    expect(parseHashRoute("#/characters/character%201/edit")).toEqual({
      page: "characters",
      characterId: "character 1",
      mode: "edit",
      builder: { workspace: "build" },
    });
  });

  it("canonicalizes sheet print intent without retaining unrelated state", () => {
    expect(
      canonicalHashRedirect("#/characters/one?print=1&filter=ignored"),
    ).toBe("#/characters/one?print=1");
    expect(canonicalHashRedirect("#/characters/one?print=0")).toBe(
      "#/characters/one",
    );
  });

  it("round-trips every editor workspace and only its applicable nested state", () => {
    const routes = [
      {
        navigation: {
          workspace: "build" as const,
          level: 8,
          section: "powers" as const,
        },
        expected: {
          workspace: "build",
          level: 8,
          section: "powers",
        },
      },
      {
        navigation: {
          workspace: "build" as const,
          level: 1,
          section: "theme" as const,
        },
        expected: {
          workspace: "build",
          level: 1,
          section: "theme",
        },
      },
      {
        navigation: { workspace: "overview" as const },
        expected: { workspace: "overview" },
      },
      {
        navigation: { workspace: "details" as const },
        expected: { workspace: "details" },
      },
      {
        navigation: {
          workspace: "equipment" as const,
          loadout: true,
        },
        expected: { workspace: "equipment", loadout: true },
      },
      {
        navigation: {
          workspace: "shop" as const,
          category: "martial-practices" as const,
        },
        expected: { workspace: "shop", category: "martial-practices" },
      },
      {
        navigation: { workspace: "diagnostics" as const },
        expected: { workspace: "diagnostics" },
      },
    ];
    for (const { navigation, expected } of routes) {
      const hash = characterEditorHash("character / one", navigation);
      expect(parseHashRoute(hash)).toMatchObject({
        characterId: "character / one",
        mode: "edit",
        builder: expected,
      });
    }
    expect(
      characterEditorHash("one", {
        workspace: "overview",
      }),
    ).toBe("#/characters/one/edit?tab=overview");
  });

  it("falls back safely from invalid and inapplicable editor values", () => {
    expect(
      parseHashRoute(
        "#/characters/one/edit?tab=build&level=99&section=missing&filter=axe",
      ),
    ).toMatchObject({ builder: { workspace: "build" } });
    expect(
      canonicalHashRedirect(
        "#/characters/one/edit?tab=overview&level=8&section=powers",
      ),
    ).toBe("#/characters/one/edit?tab=overview");
    expect(
      canonicalHashRedirect(
        "#/characters/one/edit?tab=equipment&section=unknown",
      ),
    ).toBe("#/characters/one/edit?tab=equipment");
    expect(
      parseHashRoute("#/characters/one/edit?tab=equipment&section=practices"),
    ).toMatchObject({
      builder: { workspace: "shop", category: "rituals" },
    });
    expect(
      parseHashRoute("#/characters/one/edit?tab=equipment&section=shop"),
    ).toMatchObject({
      builder: { workspace: "shop", category: "items" },
    });
    expect(
      canonicalHashRedirect(
        "#/characters/one/edit?tab=equipment&section=inventory",
      ),
    ).toBe("#/characters/one/edit?tab=equipment");
    expect(
      canonicalHashRedirect(
        "#/characters/one/edit?tab=equipment&section=loadout",
      ),
    ).toBe("#/characters/one/edit?tab=equipment&loadout=1");
  });

  it("pushes major destinations, restores them Back/Forward, and deduplicates synchronization", () => {
    const entries = ["#/characters"];
    let index = 0;
    const target = {
      location: {
        get hash() {
          return entries[index]!;
        },
      },
      history: {
        pushState: (_data: null, _unused: string, url: string) => {
          entries.splice(index + 1, entries.length, url);
          index += 1;
        },
        replaceState: (_data: null, _unused: string, url: string) => {
          entries[index] = url;
        },
      },
    };
    const build = characterEditorHash("one", {
      workspace: "build",
      level: 4,
      section: "feats",
    });
    const overview = characterEditorHash("one", { workspace: "overview" });
    const inventory = characterEditorHash("one", {
      workspace: "equipment",
    });
    expect(commitHashNavigation(target, build)).toBe(true);
    expect(commitHashNavigation(target, overview)).toBe(true);
    expect(commitHashNavigation(target, inventory)).toBe(true);
    expect(commitHashNavigation(target, inventory)).toBe(false);
    expect(entries).toHaveLength(4);

    index -= 1;
    expect(parseHashRoute(target.location.hash)).toMatchObject({
      builder: { workspace: "overview" },
    });
    index -= 1;
    expect(parseHashRoute(target.location.hash)).toMatchObject({
      builder: { workspace: "build", level: 4, section: "feats" },
    });
    index += 1;
    expect(parseHashRoute(target.location.hash)).toMatchObject({
      builder: { workspace: "overview" },
    });

    expect(commitHashNavigation(target, overview, true)).toBe(false);
    expect(entries).toHaveLength(4);
  });

  it("falls back to Characters for empty, retired, and unknown routes", () => {
    expect(parseHashRoute("")).toEqual({ page: "characters" });
    expect(parseHashRoute("#/compendium?text=stone")).toEqual({
      page: "characters",
    });
    expect(parseHashRoute("#/compendium/entity/ID%3ATEST%2FONE")).toEqual({
      page: "characters",
    });
    expect(parseHashRoute("#/not-a-page")).toEqual({ page: "characters" });
    expect(parseHashRoute("#/characters/%E0%A4%A")).toEqual({
      page: "characters",
    });
  });

  it("canonicalizes unsupported hashes without rewriting supported routes", () => {
    expect(canonicalHashRedirect("")).toBe("#/characters");
    expect(canonicalHashRedirect("#/compendium/entity/old-id")).toBe(
      "#/characters",
    );
    expect(canonicalHashRedirect("#/not-a-page")).toBe("#/characters");
    expect(canonicalHashRedirect("#/characters/character%201/edit")).toBe(
      "#/characters/character%201/edit?tab=build",
    );
    expect(
      canonicalHashRedirect("#/characters/character%201/edit?tab=build"),
    ).toBeUndefined();
    expect(canonicalHashRedirect("#/settings")).toBe(undefined);
  });
});
