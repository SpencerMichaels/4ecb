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
    expect(inventoryWeight([{ quantity: 1, definitions: [] }])).toBeUndefined();
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
