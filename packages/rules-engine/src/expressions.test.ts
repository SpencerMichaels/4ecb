import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  evaluateRequires,
  matchesCategory,
  parseCategoryExpression,
  parseRequires,
} from "./expressions";

function entity(
  id: string,
  name: string,
  type: string,
  categories: string[] = [],
  level?: number,
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
    attributes: [],
    categories,
    specifics:
      level === undefined
        ? []
        : [
            {
              name: "Level",
              value: String(level),
              extraAttributes: [],
              ordinal: 0,
            },
          ],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
  };
}

describe("compatibility expressions", () => {
  const owned = [
    entity("A", "Feature A", "Feat", ["Martial"]),
    entity("B", "Feature B", "Power", ["Arcane", "Encounter"], 7),
  ];

  it("uses the recovered OR-before-AND grouping with parentheses", () => {
    expect(
      evaluateRequires(parseRequires("Feature A&Feature B"), {
        owned,
        level: 7,
      }),
    ).toBe(true);
    expect(
      evaluateRequires(parseRequires("Missing&Feature A|Feature B"), {
        owned,
        level: 7,
      }),
    ).toBe(true);
    expect(
      evaluateRequires(parseRequires("Feature A&(!Feature B)"), {
        owned,
        level: 7,
      }),
    ).toBe(false);
  });

  it("matches typed category requirements", () => {
    expect(
      evaluateRequires(parseRequires("Power:Arcane,Encounter"), {
        owned,
        level: 7,
      }),
    ).toBe(true);
    expect(
      evaluateRequires(parseRequires("Power:Arcane,!Daily"), {
        owned,
        level: 7,
      }),
    ).toBe(true);
  });

  it("matches OR, negation, numeric levels, substitution, and dynamic prefixes", () => {
    const power = owned[1]!;
    expect(
      matchesCategory(
        power,
        parseCategoryExpression("Arcane|Divine,!Daily,7+"),
        { owned, level: 7 },
      ),
    ).toBe(true);
    expect(
      matchesCategory(
        power,
        parseCategoryExpression("$$CLASS,Encounter,$$LEVEL"),
        {
          owned,
          level: 7,
          dynamicCategories: { $$CLASS: new Set(["arcane"]) },
        },
      ),
    ).toBe(true);
    expect(
      matchesCategory(power, parseCategoryExpression("7-7"), {
        owned,
        level: 7,
      }),
    ).toBe(true);
  });

  it("reads an N-N level as exact, except for a theme power up to N", () => {
    // Native AddSingleEntry/CategoryMatch::Matches: "N-M" is the exact level
    // N, and a `_ThemePower` power of any level up to N still matches.
    const classPower = entity("C", "Class power", "Power", ["Encounter"], 3);
    const themePower = {
      ...entity("T", "Theme power", "Power", ["Encounter"], 3),
      specifics: [
        ...entity("T", "Theme power", "Power", [], 3).specifics,
        {
          name: "_ThemePower",
          value: "ID_FMP_THEME_768",
          extraAttributes: [],
          ordinal: 1,
        },
      ],
    };
    const matches = (candidate: ContentEntity, category: string) =>
      matchesCategory(candidate, parseCategoryExpression(category), {
        owned,
        level: 7,
      });
    expect(matches(classPower, "7-7")).toBe(false);
    expect(matches(classPower, "3-7")).toBe(true);
    expect(matches(themePower, "7-7")).toBe(true);
    expect(matches(themePower, "2-2")).toBe(false);
    expect(matches(classPower, "7")).toBe(true);
  });

  it("resolves category IDs and display names through the content index", () => {
    const power = entity("POWER", "Power", "Power", ["CATEGORY_ENCOUNTER"]);
    const aliases = new Set(["category_encounter", "encounter"]);
    expect(
      matchesCategory(power, parseCategoryExpression("Encounter"), {
        owned,
        level: 1,
        categoryAliases: new Map([
          ["category_encounter", aliases],
          ["encounter", aliases],
        ]),
      }),
    ).toBe(true);
  });
});
