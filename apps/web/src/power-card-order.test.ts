import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import { sortedPowerCards } from "./power-card-order";

describe("character-sheet power-card order", () => {
  it("orders specific at-will, universal at-will, encounter and daily, then utility and name", () => {
    const card = (
      name: string,
      usage: string,
      utility = false,
      universal = false,
    ): SheetCard => ({
      kind: "power",
      name,
      usage,
      universal,
      fields: [{ label: "Power Type", value: utility ? "Utility" : "Attack" }],
    });
    const input = [
      card("Daily attack", "Daily"),
      card("A daily utility", "Daily", true),
      card("Encounter attack", "Encounter"),
      card("A encounter utility", "Encounter", true),
      card("Universal attack", "At-Will", false, true),
      card("A universal utility", "At-Will", true, true),
      card("Z personal attack", "At-Will"),
      card("A personal utility", "At-Will", true),
      card("B personal attack", "At-Will"),
      {
        ...card("Rules only", "At-Will"),
        fields: [{ label: "Rules Item", value: "An applied effect." }],
      },
    ];
    const original = [...input];
    expect(sortedPowerCards(input).map((power) => power.name)).toEqual([
      "B personal attack",
      "Z personal attack",
      "A personal utility",
      "Universal attack",
      "A universal utility",
      "Encounter attack",
      "A encounter utility",
      "Daily attack",
      "A daily utility",
      "Rules only",
    ]);
    expect(input).toEqual(original);
  });
});
