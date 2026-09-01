import { describe, expect, it } from "vitest";

import type { RuleStatement } from "@4ecb/content-domain";

import { parseLevelRange, parseRule } from "./ir";

function statement(
  name: string,
  attributes: Record<string, string>,
  text = "",
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      name: key,
      value,
    })),
    text,
    children: [],
    ordinal: 7,
  };
}

describe("rule IR", () => {
  it("parses every recovered opcode", () => {
    const fixtures: Array<[RuleStatement, string]> = [
      [
        statement("statadd", {
          name: "AC",
          value: "+2",
          type: "Feat",
          condition: "conditional",
        }),
        "statadd",
      ],
      [statement("textstring", { name: "Note", value: "Text" }), "textstring"],
      [
        statement("statalias", { name: "AC", alias: "Armor Class" }),
        "statalias",
      ],
      [
        statement("grant", {
          name: "ID_FEATURE",
          type: "Class Feature",
          Level: "3",
        }),
        "grant",
      ],
      [statement("drop", { select: "Power choice" }), "drop"],
      [
        statement(
          "select",
          {
            type: "Power",
            number: "2",
            Category: "Arcane,Encounter",
            optional: "true",
          },
          "Choose powers",
        ),
        "select",
      ],
      [
        statement("replace", { retrain: "true", optional: "1" }, "Retrain"),
        "replace",
      ],
      [statement("suggest", { name: "ID_FEAT", type: "Feat" }), "suggest"],
      [
        statement("modify", {
          name: "Arc Flash",
          type: "Power",
          Field: "Keywords",
          "list-addition": "Fire",
        }),
        "modify",
      ],
    ];
    expect(
      fixtures.map(([input]) => parseRule("PROVIDER", input).kind),
    ).toEqual(fixtures.map(([, kind]) => kind));
  });

  it("retains unknown statements and attributes", () => {
    const parsed = parseRule(
      "P",
      statement("future-rule", { mystery: "value" }),
    );
    expect(parsed.kind).toBe("unknown");
    expect(parsed.source.unknownAttributes).toEqual([
      { name: "mystery", value: "value" },
    ]);
  });

  it("parses compatibility level ranges", () => {
    expect(parseLevelRange(undefined)).toEqual({ minimum: 1, maximum: 30 });
    expect(parseLevelRange("7")).toEqual({ minimum: 7, maximum: 30 });
    expect(parseLevelRange("11-20")).toEqual({ minimum: 11, maximum: 20 });
  });

  it("uses the legacy one-choice default while preserving explicit zero", () => {
    expect(parseRule("P", statement("select", { type: "Feat" })).kind).toBe(
      "select",
    );
    const omitted = parseRule("P", statement("select", { type: "Feat" }));
    const zero = parseRule(
      "P",
      statement("select", { type: "Feat", number: "0" }),
    );
    expect(omitted.kind === "select" && omitted.number).toBe(1);
    expect(zero.kind === "select" && zero.number).toBe(0);
  });
});
