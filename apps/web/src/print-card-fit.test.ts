import { describe, expect, it } from "vitest";
import {
  preferredPrintCardTextSize,
  printCardFontSizes,
  wrappedRowStarts,
} from "./print-card-fit";

describe("preferred printed card text size", () => {
  it("hides separators only at the start of wrapped rows", () => {
    expect(wrappedRowStarts([10, 10, 22, 22, 34])).toEqual([
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(wrappedRowStarts([10, 10.5])).toEqual([false, false]);
  });
  it("defaults to 8 pt and rejects invalid saved preferences", () => {
    for (const value of [null, undefined, "", "NaN", "11", "5", Infinity])
      expect(preferredPrintCardTextSize(value)).toBe(8);
    expect(preferredPrintCardTextSize("9.5")).toBe(9.5);
    expect(preferredPrintCardTextSize(8.2)).toBe(8);
  });
  it("fits gradually without going below the readable 6 pt minimum", () => {
    expect(printCardFontSizes(8)).toEqual([8, 7.5, 7, 6.5, 6]);
    expect(printCardFontSizes(6)).toEqual([6]);
    expect(preferredPrintCardTextSize(6)).toBe(6);
    expect(preferredPrintCardTextSize(5.5)).toBe(8);
    expect(printCardFontSizes(10)[0]).toBe(10);
  });
});
