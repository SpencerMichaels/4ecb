import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SHEET_ALIAS_TYPES,
  SHEET_FEATURE_TYPES,
  SHEET_IDENTITY_TYPES,
} from "@4ecb/sheet-model";

import { CONTENT_TYPE_COVERAGE } from "./content-type-coverage";

describe("content type coverage registry", () => {
  it("classifies every type in the synthetic content", () => {
    const xml = readFileSync("fixtures/content/synthetic.dnd40.xml", "utf8");
    const types = new Set(
      [...xml.matchAll(/<RulesElement\b[^>]*\btype="([^"]+)"/g)].map(
        ([, type]) => type!.trim(),
      ),
    );
    expect(types.size).toBeGreaterThan(0);
    expect(
      [...types].filter((type) => !(type in CONTENT_TYPE_COVERAGE)),
    ).toEqual([]);
  });

  it("agrees with the sheet's feature and identity lists", () => {
    const identity = new Set<string>(
      SHEET_IDENTITY_TYPES.map(([type]) => type),
    );
    for (const [type, coverage] of Object.entries(CONTENT_TYPE_COVERAGE)) {
      const surfaces = coverage.kind === "presented" ? coverage.surfaces : [];
      expect(
        surfaces.includes("features"),
        `${type}: registry and SHEET_FEATURE_TYPES disagree`,
      ).toBe(SHEET_FEATURE_TYPES.includes(type));
      if (surfaces.includes("identity"))
        // A hybrid's classes fill the Class identity line; an alias the
        // identity race or class grants is implied by that line.
        expect(
          identity.has(type) ||
            type === "Hybrid Class" ||
            SHEET_ALIAS_TYPES.includes(type),
          type,
        ).toBe(true);
    }
  });
});
