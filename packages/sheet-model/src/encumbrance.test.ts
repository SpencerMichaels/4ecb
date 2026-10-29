import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  inventoryWeight,
  inventoryHoldingWeight,
  sheetEncumbrance,
} from "./encumbrance";

const definition = (
  type: string,
  name: string,
  fields: Record<string, string>,
): ContentEntity => ({
  id: name,
  name,
  type,
  source: "",
  sources: [],
  attributes: [],
  categories: [],
  specifics: Object.entries(fields).map(([name, value], ordinal) => ({
    name,
    value,
    ordinal,
    extraAttributes: [],
  })),
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "public", sourceOrdinal: 0 },
});
describe("native encumbrance projection", () => {
  it("hides unspecified row weights while preserving explicit zero and native totals", () => {
    const blank = {
      quantity: 1,
      definitions: [definition("Magic Item", "Test amulet", {})],
    };
    expect(inventoryHoldingWeight(blank)).toBeUndefined();
    expect(inventoryWeight([blank])).toBe(0);
    expect(
      inventoryHoldingWeight({
        ...blank,
        definitions: [
          definition("Magic Item", "Weightless item", { Weight: "0" }),
        ],
      }),
    ).toBe(0);
    expect(inventoryHoldingWeight({ ...blank, override: "0" })).toBe(0);
  });
  it("can ignore coin weight without changing gear weight, limits or wallet data", () => {
    const currency = [{ label: "Carried", value: "500 gp" }];
    const input = { gearWeight: 95, strength: 10, currency };
    expect(sheetEncumbrance(input)).toEqual({
      carriedWeight: 105,
      normalLimit: 100,
      load: "Heavy",
    });
    expect(sheetEncumbrance({ ...input, countCoinWeight: false })).toEqual({
      carriedWeight: 95,
      normalLimit: 100,
      load: "Normal",
    });
    expect(currency[0]?.value).toBe("500 gp");
    expect(
      sheetEncumbrance({
        ...input,
        currency: [{ label: "Carried", value: "custom coins" }],
        countCoinWeight: false,
      }).carriedWeight,
    ).toBe(95);
    expect(
      sheetEncumbrance({
        ...input,
        gearWeight: undefined,
        countCoinWeight: false,
      }).carriedWeight,
    ).toBeUndefined();
  });
  it("retains fractional weight in quantity-inclusive inventory rows", () => {
    expect(
      inventoryHoldingWeight({ quantity: 3, definitions: [], override: "0.5" }),
    ).toBe(1.5);
  });
  it("uses base gear, signed quantities, decimal overrides and native weight exclusions", () => {
    expect(
      inventoryWeight([
        {
          quantity: 2,
          definitions: [
            definition("Weapon", "Staff", { Weight: "4 lb" }),
            definition("Magic Item", "Enchantment", { Weight: "10" }),
          ],
        },
        {
          quantity: -1,
          definitions: [definition("Weapon", "Staff", { Weight: "4" })],
        },
        { quantity: 3, definitions: [], override: "0.5" },
        {
          quantity: 1,
          definitions: [definition("Armor", "Plate barding", { Weight: "80" })],
        },
        {
          quantity: 1,
          definitions: [
            definition("Magic Item", "Saddle", {
              Weight: "20",
              "Magic Item Type": "mount slot item",
            }),
          ],
        },
        {
          quantity: 1,
          definitions: [
            definition("Gear", "Cart", {
              Weight: "200",
              Category: "Transportation",
            }),
          ],
        },
      ]),
    ).toBe(9);
  });
  it("counts holdings the content cannot resolve as weightless, like native LootWeight", () => {
    const staff = definition("Weapon", "Staff", { Weight: "4 lb" });
    expect(
      inventoryWeight([
        { quantity: 1, definitions: [staff] },
        { quantity: 1, definitions: [] },
        { quantity: 2, definitions: [staff], complete: false },
      ]),
    ).toBe(4);
  });
  it("includes only carried coin weight with the native astral-diamond ratio", () => {
    expect(
      sheetEncumbrance({
        gearWeight: 65,
        strength: 13,
        currency: [
          { label: "Carried", value: "500 ad; 49 gp" },
          { label: "Stored", value: "9999 gp" },
        ],
      }),
    ).toEqual({ carriedWeight: 66, normalLimit: 130, load: "Normal" });
  });
  it.each([
    [100, "Normal"],
    [101, "Heavy"],
    [200, "Heavy"],
    [201, "Drag"],
    [500, "Drag"],
    [501, "Overloaded"],
  ])("classifies %i pounds as %s", (gearWeight, load) => {
    expect(
      sheetEncumbrance({
        gearWeight: Number(gearWeight),
        strength: 8,
        loadAdjustment: 2,
        weightDiscount: 30,
        currency: [{ label: "Carried", value: "0 gp" }],
      }),
    ).toEqual({ carriedWeight: gearWeight, normalLimit: 130, load });
  });
  it("retains unknown money/gear/strength and clamps negative stock weight", () => {
    expect(
      sheetEncumbrance({
        gearWeight: 20,
        strength: 10,
        currency: [{ label: "Carried", value: "custom coins" }],
      }),
    ).toEqual({ normalLimit: 100 });
    expect(
      sheetEncumbrance({
        gearWeight: undefined,
        strength: undefined,
        currency: [],
      }),
    ).toEqual({});
    expect(
      sheetEncumbrance({
        gearWeight: -10,
        strength: 10,
        currency: [{ label: "Carried", value: "50 gp" }],
      }),
    ).toEqual({ carriedWeight: 1, normalLimit: 100, load: "Normal" });
  });
});
