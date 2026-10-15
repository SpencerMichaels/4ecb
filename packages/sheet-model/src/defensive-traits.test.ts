import { describe, expect, it } from "vitest";
import { StatAccumulator } from "@4ecb/rules-engine";
import { defensiveStatTraits } from "./defensive-traits";

describe("defensive stat projection", () => {
  it.each([
    {
      stat: "Saving Throws",
      value: "5",
      bonusType: "Racial",
      condition: "against poison",
      expected: "+5 racial bonus to saves against poison",
    },
    {
      stat: "Saving Throws",
      value: "-2",
      bonusType: "Item",
      condition: "while bloodied",
      expected: "-2 item penalty to saves while bloodied",
    },
    {
      stat: "Saving Throws",
      value: "2",
      condition: "against fear",
      expected: "+2 to saves against fear",
    },
    {
      stat: "Death Saving Throws",
      value: "3",
      bonusType: "Power",
      condition: "while adjacent to an ally",
      expected: "+3 power bonus to death saves while adjacent to an ally",
    },
  ])("formats $expected from typed save data", ({ expected, ...addition }) => {
    const accumulator = new StatAccumulator();
    accumulator.add({
      ...addition,
      id: "save",
      providerId: "trait",
      providerName: "Synthetic trait",
    });
    const stat = accumulator.evaluate(addition.stat);
    expect(
      defensiveStatTraits(
        { [addition.stat]: String(stat.value) },
        { [addition.stat]: stat },
      )[0]?.value,
    ).toBe(expected);
  });
  it("projects signed resist stats, separate conditional saves and death saves", () => {
    const accumulator = new StatAccumulator();
    const additions = [
      { stat: "resist:fire", value: "5" },
      { stat: "resist:cold", value: "-3" },
      { stat: "Saving Throws", value: "1" },
      {
        stat: "Saving Throws",
        value: "2",
        condition: "against poison",
        bonusType: "Feat",
      },
      { stat: "Saving Throws", value: "3", condition: "while bloodied" },
      {
        stat: "Saving Throws",
        value: "4",
        condition: "against fear",
        wearing: "shield",
      },
      { stat: "Death Saving Throws", value: "2" },
      { stat: "resist:fire", value: "10", condition: "while bloodied" },
    ];
    additions.forEach((addition, index) =>
      accumulator.add({
        ...addition,
        id: String(index),
        providerId: "feature",
        providerName: "Synthetic trait",
      }),
    );
    const evaluated = Object.fromEntries(
      accumulator.allNames().map((name) => [name, accumulator.evaluate(name)]),
    );
    const values = Object.fromEntries(
      Object.entries(evaluated).map(([name, stat]) => [
        name,
        String(stat.value),
      ]),
    );
    expect(defensiveStatTraits(values, evaluated)).toEqual([
      { label: "Resistance", value: "Fire 5", source: "Synthetic trait" },
      {
        label: "Resistance",
        value: "Fire 10 while bloodied",
        source: "Synthetic trait",
      },
      { label: "Vulnerability", value: "Cold 3", source: "Synthetic trait" },
      {
        label: "Saving throws",
        value: "+2 feat bonus to saves against poison",
        source: "Synthetic trait",
      },
      {
        label: "Saving throws",
        value: "+3 to saves while bloodied",
        source: "Synthetic trait",
      },
      {
        label: "Death saves",
        value: "+2 to death saves",
        source: "Synthetic trait",
      },
    ]);
  });
  it("preserves unresolved resistance values and omits zero/irrelevant stats", () => {
    expect(
      defensiveStatTraits({
        "resist:fire": "0",
        "resist:cold": "Custom value",
        AC: "20",
        "Saving Throws": "0",
      }),
    ).toEqual([
      {
        label: "Resistance / vulnerability",
        value: "Cold: Custom value",
        source: "Legacy cache",
      },
    ]);
  });
  it("does not guess unresolved conditional bonuses", () => {
    const accumulator = new StatAccumulator();
    accumulator.add({
      id: "custom",
      stat: "Saving Throws",
      value: "Custom modifier",
      providerId: "custom",
      providerName: "Custom trait",
      condition: "against fear",
    });
    const evaluated = accumulator.evaluate("Saving Throws");
    expect(
      defensiveStatTraits(
        { "Saving Throws": String(evaluated.value) },
        { "Saving Throws": evaluated },
      ),
    ).toEqual([
      {
        label: "Saving throws",
        value: "Custom modifier to saves against fear (unresolved)",
        source: "Custom trait",
      },
    ]);
  });
});
