import { describe, expect, it } from "vitest";
import { StatAccumulator } from "@4ecb/rules-engine";
import { defensiveStatTraits } from "./defensive-traits";

describe("defensive stat projection", () => {
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
        value: "+2 Feat bonus against poison",
        source: "Synthetic trait",
      },
      {
        label: "Saving throws",
        value: "+3 while bloodied",
        source: "Synthetic trait",
      },
      { label: "Death saves", value: "+2", source: "Synthetic trait" },
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
        value: "Custom modifier against fear (unresolved)",
        source: "Custom trait",
      },
    ]);
  });
});
