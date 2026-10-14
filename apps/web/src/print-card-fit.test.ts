import { describe, expect, it } from "vitest";
import {
  preferredPrintCardTextSize,
  printCardFontSizes,
} from "./print-card-fit";

describe("preferred printed card text size", () => {
  it("defaults to 8 pt and rejects invalid saved preferences", () => {
    for (const value of [null, undefined, "", "NaN", "11", "5", Infinity])
      expect(preferredPrintCardTextSize(value)).toBe(8);
    expect(preferredPrintCardTextSize("9.5")).toBe(9.5);
    expect(preferredPrintCardTextSize(8.2)).toBe(8);
  });
  it("fits gradually in half-point steps, retaining the existing minimum", () => {
    expect(printCardFontSizes(8)).toEqual([8, 7.5, 7, 6.5, 6, 5.5, 5, 4.8]);
    expect(printCardFontSizes(6)).toEqual([6, 5.5, 5, 4.8]);
    expect(printCardFontSizes(10)[0]).toBe(10);
  });
});
