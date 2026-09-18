import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { SelectionSummary } from "./SelectionSummary";

function entity(
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id: `${type}-fixture`,
    name: `${type} fixture`,
    type,
    source: "Test",
    sources: ["Test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      ordinal,
      extraAttributes: [],
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

describe("SelectionSummary", () => {
  it("renders one removable chip per selection", () => {
    const twoSelectionMarkup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [
          { id: "one", label: "Cleave" },
          { id: "two", label: "Reaping Strike" },
        ],
        onInspect: () => undefined,
        onRemove: () => undefined,
      }),
    );

    expect(twoSelectionMarkup).toContain('aria-label="Selected options"');
    expect(twoSelectionMarkup).not.toContain("Current selection");
    expect(twoSelectionMarkup).toContain(
      'class="selection-summary-item tone-neutral"',
    );
    expect(twoSelectionMarkup).toContain('class="selection-summary-name"');
    expect(twoSelectionMarkup).toContain(">Cleave</button>");
    expect(twoSelectionMarkup).toContain("Reaping Strike</button>");
    expect(twoSelectionMarkup).toContain('aria-label="Remove Cleave"');
    expect(twoSelectionMarkup).toContain('class="selection-summary-remove"');
    expect(twoSelectionMarkup).not.toContain("Locate");
    expect(twoSelectionMarkup.indexOf("selection-summary-icon")).toBeLessThan(
      twoSelectionMarkup.indexOf(
        'class="selection-summary-name" type="button">Cleave',
      ),
    );
    expect(
      twoSelectionMarkup.indexOf(
        'class="selection-summary-name" type="button">Cleave',
      ),
    ).toBeLessThan(twoSelectionMarkup.indexOf('aria-label="Remove Cleave"'));
  });

  it("reuses detail-card icons and tones for every selected entity family", () => {
    const shieldBase = entity("Armor", { "Armor Type": "Shield" });
    const markup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [
          { id: "feat", label: "Durable", entity: entity("Feat") },
          {
            id: "power",
            label: "Cleave",
            entity: entity("Power", {
              "Power Usage": "Encounter",
              "Action Type": "Standard Action",
            }),
          },
          {
            id: "item",
            label: "Frost Weapon",
            entity: entity("Magic Item", {
              "Magic Item Type": "Weapon",
            }),
          },
          {
            id: "belt",
            label: "Belt",
            entity: entity("Magic Item", {
              "Magic Item Type": "Waist Slot Item",
            }),
          },
          {
            id: "shield",
            label: "Hammer Heavy Shield",
            entity: entity("Magic Item", {
              "Magic Item Type": "Arms Slot Item",
              "Item Slot": "Arms",
            }),
            physicalBase: shieldBase,
          },
          {
            id: "armor",
            label: "Plate Armor",
            entity: entity("Armor", { "Armor Type": "Heavy" }),
          },
        ],
        onInspect: () => undefined,
        onRemove: () => undefined,
      }),
    );

    expect(markup).toContain("selection-summary-item tone-neutral");
    expect(markup).toContain("selection-summary-item tone-encounter");
    expect(markup).toContain("selection-summary-item tone-item");
    expect(markup).toContain("lucide-sparkles");
    expect(markup).toContain('title="Standard Action"');
    expect(markup).toContain("lucide-sword");
    expect(markup).toContain("lucide-square-star");
    expect(markup).toContain("lucide-shield");
    expect(markup).toContain("lucide-shirt");
    expect(markup).toContain(
      'aria-hidden="true" class="selection-summary-icon"',
    );
  });

  it("renders an attached neutral empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [],
        onInspect: () => undefined,
        onRemove: () => undefined,
      }),
    );

    expect(markup).toContain("selection-summary-empty");
    expect(markup).toContain("No selection");
  });

  it("does not render when its candidate table has no vertical overflow", () => {
    const markup = renderToStaticMarkup(
      createElement(SelectionSummary, {
        items: [{ id: "one", label: "Cleave" }],
        visible: false,
        onInspect: () => undefined,
        onRemove: () => undefined,
      }),
    );

    expect(markup).toBe("");
  });
});
