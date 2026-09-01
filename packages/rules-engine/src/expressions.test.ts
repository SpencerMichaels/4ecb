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
