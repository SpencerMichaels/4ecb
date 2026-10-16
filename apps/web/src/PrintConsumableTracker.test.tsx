import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";
import {
  printConsumableTracker,
  PRINT_CONSUMABLE_CIRCLE_LIMIT,
} from "./print-item-presentation";
import { PrintConsumableTracker } from "./PrintConsumableTracker";

const item = (
  quantity: string,
  fields: SheetCard["fields"] = [],
): SheetCard => ({
  kind: "item",
  name: "Test potion",
  itemType: "Magic Item",
  fields: [
    { label: "Magic Item Type", value: "Potion" },
    { label: "Quantity", value: quantity },
    ...fields,
  ],
});
describe("printed consumable stock tracker", () => {
  it.each([1, 3, PRINT_CONSUMABLE_CIRCLE_LIMIT])(
    "prints %i hollow circles on one shared strip",
    (quantity) => {
      const tracker = printConsumableTracker(
        item(String(quantity), [
          { label: "Power", value: "Consumable (Minor Action): First use." },
          {
            label: "Utility Power (Consumable)",
            value: "Free Action. Another use.",
          },
        ]),
      )!;
      expect(tracker).toEqual({ quantity, mode: "circles" });
      const html = renderToStaticMarkup(
        <PrintConsumableTracker tracker={tracker} />,
      );
      expect(html.match(/lucide-circle /g)).toHaveLength(quantity);
      expect(html.match(/class="print-consumable-tracker"/g)).toHaveLength(1);
      expect(html).toContain("Remaining");
      expect(html).not.toContain("print-consumable-count-box");
    },
  );
  it("uses a writable count rather than wrapping or shrinking many circles", () => {
    const tracker = printConsumableTracker(item("25"))!;
    expect(tracker).toEqual({ quantity: 25, mode: "count" });
    const html = renderToStaticMarkup(
      <PrintConsumableTracker tracker={tracker} />,
    );
    expect(html).toContain('class="print-consumable-count-box"');
    expect(html).toContain("/ 25");
    expect(html).not.toContain("lucide-circle");
  });
  it("uses authored usage metadata rather than guessing from item names", () => {
    expect(
      printConsumableTracker({
        ...item("2"),
        itemType: "Magic Item",
        fields: [
          { label: "Quantity", value: "2" },
          {
            label: "Utility Power",
            value: "Consumable (Free Action): Effect: Gain a benefit.",
          },
        ],
      }),
    ).toEqual({ quantity: 2, mode: "circles" });
    expect(
      printConsumableTracker({
        ...item("2"),
        fields: [
          { label: "Quantity", value: "2" },
          { label: "Magic Item Type", value: "Neck Slot Item" },
        ],
      }),
    ).toBeUndefined();
    expect(
      printConsumableTracker({ ...item("2"), kind: "power" }),
    ).toBeUndefined();
  });
  it("does not invent a quantity or generate unbounded markers", () => {
    expect(printConsumableTracker(item("0"))).toBeUndefined();
    expect(printConsumableTracker(item("unknown"))).toEqual({ mode: "count" });
    expect(printConsumableTracker(item("9999999999999999999999"))).toEqual({
      mode: "count",
    });
  });
});
