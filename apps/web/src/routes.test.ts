import { describe, expect, it } from "vitest";

import { canonicalHashRedirect, parseHashRoute } from "./routes";

describe("hash routes", () => {
  it("parses character library and sheet routes", () => {
    expect(parseHashRoute("#/characters")).toEqual({ page: "characters" });
    expect(parseHashRoute("#/characters/character%201")).toEqual({
      page: "characters",
      characterId: "character 1",
    });
    expect(parseHashRoute("#/characters/character%201/edit")).toEqual({
      page: "characters",
      characterId: "character 1",
      mode: "edit",
    });
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
      undefined,
    );
    expect(canonicalHashRedirect("#/settings")).toBe(undefined);
  });
});
