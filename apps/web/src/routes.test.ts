import { describe, expect, it } from "vitest";

import { compendiumHash, parseHashRoute } from "./routes";

describe("hash routes", () => {
  it("parses character library and sheet routes", () => {
    expect(parseHashRoute("#/characters")).toEqual({ page: "characters" });
    expect(parseHashRoute("#/characters/character%201")).toEqual({
      page: "characters",
      characterId: "character 1",
    });
  });

  it("keeps compendium query state in a fragment route", () => {
    const hash = compendiumHash({
      text: "stone step",
      facets: [{ key: "type", include: ["Power"], exclude: [] }],
    });
    expect(hash.startsWith("#/compendium?")).toBe(true);
    const route = parseHashRoute(hash);
    expect(route.page).toBe("compendium");
    if (route.page === "compendium") {
      expect(route.query.text).toBe("stone step");
      expect(route.query.facets[0]?.include).toEqual(["Power"]);
    }
  });

  it("round-trips opaque entity IDs", () => {
    const route = parseHashRoute(compendiumHash({}, "ID:TEST/ONE"));
    expect(route).toMatchObject({
      page: "compendium",
      entityId: "ID:TEST/ONE",
    });
  });
});
