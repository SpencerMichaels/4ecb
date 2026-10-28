// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BuildInventoryEntry,
  CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { EquipmentWorkspace } from "./EquipmentWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function weapon(
  id: string,
  name: string,
  specifics: Readonly<Record<string, string>>,
): ContentEntity {
  return {
    id,
    name,
    type: "Weapon",
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [],
    description: "",
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    extensions: [],
    provenance: { sourceKey: "context-menu", sourceOrdinal: 0 },
  };
}

const sword = weapon("SWORD", "Bastard blade", {
  "Item Slot": "One-hand",
  Properties: "Versatile",
});
const dagger = weapon("DAGGER", "Plain dagger", { "Item Slot": "One-hand" });
const holding = (item: ContentEntity): BuildInventoryEntry => ({
  id: item.id,
  acquiredLevel: 1,
  quantity: 1,
  equippedQuantity: 0,
  elements: [{ definitionId: item.id, name: item.name, type: item.type }],
  overrides: {},
  legality: "rules-legal",
});
const build: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 1,
  levels: [],
  grabbag: [],
  inventory: [holding(sword), holding(dagger)],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const noCoins = {
  copper: 0,
  silver: 0,
  gold: 0,
  platinum: 0,
  astral: 0,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Equipment item right-click actions (D101)", () => {
  it("offers Wield two-handed for a versatile weapon only", () => {
    const onSetWielding = vi.fn();
    act(() =>
      root.render(
        <EquipmentWorkspace
          build={build}
          entities={[sword, dagger]}
          byId={
            new Map([
              ["sword", sword],
              ["dagger", dagger],
            ])
          }
          wallet={{ carried: noCoins, stored: noCoins }}
          activeDefinitionIds={[]}
          workspace="equipment"
          loadoutView={false}
          shopCategory="weapons"
          onShopCategoryChange={() => undefined}
          onPutInventory={() => undefined}
          onPurchase={() => undefined}
          onSell={() => undefined}
          onEquipSlot={() => undefined}
          onSetWielding={onSetWielding}
          onSetText={() => undefined}
        />,
      ),
    );
    const row = (name: string) =>
      [...container.querySelectorAll("tr")].find((candidate) =>
        candidate.textContent?.includes(name),
      )!;
    const rightClick = (target: Element) => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
      });
      act(() => {
        target.dispatchEvent(event);
      });
      return event;
    };

    // No action for a plain weapon: the browser's own menu stays.
    expect(rightClick(row("Plain dagger")).defaultPrevented).toBe(false);
    expect(container.querySelector('[role="menu"]')).toBeNull();

    expect(rightClick(row("Bastard blade")).defaultPrevented).toBe(true);
    const item = container.querySelector<HTMLElement>(
      '[role="menu"] [role="menuitemcheckbox"]',
    );
    expect(item?.textContent).toBe("Wield two-handed");
    expect(item?.getAttribute("aria-checked")).toBe("false");
    act(() => item!.click());
    expect(onSetWielding).toHaveBeenCalledWith("SWORD", true);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("Equipment loadout size rules (D102)", () => {
  it("keeps Wield two-handed checked and inert for a Small character's versatile weapon", () => {
    const onSetWielding = vi.fn();
    act(() =>
      root.render(
        <EquipmentWorkspace
          build={build}
          entities={[sword, dagger]}
          byId={
            new Map([
              ["sword", sword],
              ["dagger", dagger],
            ])
          }
          wallet={{ carried: noCoins, stored: noCoins }}
          activeDefinitionIds={[]}
          loadoutSlotContext={{
            small: true,
            oversized: false,
            oneSizeLarger: false,
            ambidextrous: false,
          }}
          workspace="equipment"
          loadoutView={false}
          shopCategory="weapons"
          onShopCategoryChange={() => undefined}
          onPutInventory={() => undefined}
          onPurchase={() => undefined}
          onSell={() => undefined}
          onEquipSlot={() => undefined}
          onSetWielding={onSetWielding}
          onSetText={() => undefined}
        />,
      ),
    );
    const row = [...container.querySelectorAll("tr")].find((candidate) =>
      candidate.textContent?.includes("Bastard blade"),
    )!;
    act(() => {
      row.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 50,
        }),
      );
    });
    const item = container.querySelector<HTMLElement>(
      '[role="menu"] [role="menuitemcheckbox"]',
    );
    expect(item?.textContent).toBe("Wield two-handed");
    expect(item?.getAttribute("aria-checked")).toBe("true");
    expect(item?.getAttribute("aria-disabled")).toBe("true");
    expect(item?.getAttribute("title")).toMatch(/Small characters/);
    act(() => item!.click());
    expect(onSetWielding).not.toHaveBeenCalled();
    // The menu stays open: the click changed nothing.
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
  });
});
