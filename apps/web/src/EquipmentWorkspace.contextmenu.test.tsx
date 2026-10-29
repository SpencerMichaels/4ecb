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
          onInventoryCommands={() => undefined}
          onEquipSlot={() => undefined}
          onSetWielding={onSetWielding}
          onSetAugment={() => undefined}
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
          onInventoryCommands={() => undefined}
          onEquipSlot={() => undefined}
          onSetWielding={onSetWielding}
          onSetAugment={() => undefined}
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

describe("Equipment augment attachment (CharLootAugment)", () => {
  const magicItem = (
    id: string,
    name: string,
    magicItemType: string,
  ): ContentEntity => ({
    ...weapon(id, name, { "Magic Item Type": magicItemType }),
    type: "Magic Item",
  });
  const shard = magicItem("SHARD", "Synthetic Shard", "Dragonshard Augment");
  const staff = magicItem("STAFF", "Staff of Ruin +1", "Staff");
  const enchant = magicItem("VICIOUS", "Vicious Weapon +1", "Weapon");
  const orb = magicItem("ORB", "Orb of Light +1", "Orb");
  const viciousDagger: BuildInventoryEntry = {
    ...holding(dagger),
    id: "vicious-dagger",
    elements: [
      { definitionId: "DAGGER", name: "Plain dagger", type: "Weapon" },
      {
        definitionId: "VICIOUS",
        name: "Vicious Weapon +1",
        type: "Magic Item",
      },
    ],
  };
  const byId = new Map(
    [shard, staff, enchant, orb, dagger, sword].map(
      (entity) => [entity.id.toLocaleLowerCase(), entity] as const,
    ),
  );
  const render = (
    inventory: readonly BuildInventoryEntry[],
    onSetAugment: (
      bindings: readonly {
        hostEntryId: string;
        augmentEntryId: string | null;
      }[],
    ) => void = () => undefined,
  ) =>
    act(() =>
      root.render(
        <EquipmentWorkspace
          build={{ ...build, inventory }}
          entities={[...byId.values()]}
          byId={byId}
          wallet={{ carried: noCoins, stored: noCoins }}
          activeDefinitionIds={[]}
          workspace="equipment"
          loadoutView={false}
          shopCategory="weapons"
          onShopCategoryChange={() => undefined}
          onPutInventory={() => undefined}
          onPurchase={() => undefined}
          onSell={() => undefined}
          onInventoryCommands={() => undefined}
          onEquipSlot={() => undefined}
          onSetWielding={() => undefined}
          onSetAugment={onSetAugment}
          onSetText={() => undefined}
        />,
      ),
    );
  const openMenu = (name: string) => {
    const row = [...container.querySelectorAll("tr")].find((candidate) =>
      candidate
        .querySelector(".inventory-item-name")
        ?.textContent?.includes(name),
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
    return [...container.querySelectorAll<HTMLElement>('[role="menu"] button')];
  };
  const rowNote = (name: string) =>
    [...container.querySelectorAll("tr")]
      .find((candidate) =>
        candidate
          .querySelector(".inventory-item-name")
          ?.textContent?.includes(name),
      )
      ?.querySelector(".inventory-item-augment")?.textContent;

  it("attaches an augment to an eligible item and shows it on both rows", () => {
    const onSetAugment = vi.fn();
    render(
      [holding(staff), viciousDagger, holding(orb), holding(shard)],
      onSetAugment,
    );
    const items = openMenu("Synthetic Shard");
    // Magic weapons and staffs only; the orb takes no augment.
    expect(items.map((item) => item.textContent)).toEqual([
      "Attach to Staff of Ruin +1",
      "Attach to Vicious Plain dagger +1",
      "Detach",
    ]);
    expect(items[0]?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(items[2]?.getAttribute("role")).toBe("menuitem");
    expect(items[2]?.getAttribute("aria-disabled")).toBe("true");
    act(() => items[0]!.click());
    expect(onSetAugment).toHaveBeenCalledWith([
      { hostEntryId: "STAFF", augmentEntryId: "SHARD" },
    ]);

    // Once attached: checked, Detach enabled, and both rows say so.
    render([
      { ...holding(staff), augmentEntryId: "SHARD" },
      viciousDagger,
      holding(shard),
    ]);
    expect(rowNote("Staff of Ruin +1")).toBe("Augment: Synthetic Shard");
    expect(rowNote("Synthetic Shard")).toBe("Attached to Staff of Ruin +1");
    expect(rowNote("Vicious")).toBeUndefined();
  });

  it("detaches, and keeps Attach present but disabled with nothing eligible", () => {
    const onSetAugment = vi.fn();
    render(
      [{ ...holding(staff), augmentEntryId: "SHARD" }, holding(shard)],
      onSetAugment,
    );
    const items = openMenu("Synthetic Shard");
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
    act(() => items[1]!.click());
    expect(onSetAugment).toHaveBeenCalledWith([
      { hostEntryId: "STAFF", augmentEntryId: null },
    ]);

    render([holding(orb), holding(shard)], onSetAugment);
    const none = openMenu("Synthetic Shard");
    expect(none.map((item) => item.textContent)).toEqual([
      "Attach to…",
      "Detach",
    ]);
    expect(none[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(none[0]?.getAttribute("title")).toMatch(/magic weapon or staff/);
  });
});

describe("Equipment item-owned choices", () => {
  const select: ContentEntity["rules"][number] = {
    name: "select",
    attributes: [
      { name: "type", value: "Class Feature" },
      { name: "number", value: "1" },
      { name: "Category", value: "Armor of Resistance +2" },
    ],
    text: "Choose Resistance Type ",
    children: [],
    ordinal: 0,
  };
  const armor: ContentEntity = {
    ...weapon("ID_FMP_MAGIC_ITEM_1474", "Armor of Resistance +2", {
      "Magic Item Type": "Armor",
    }),
    type: "Magic Item",
    rules: [select],
  };
  const resistance = (id: string, name: string): ContentEntity => ({
    ...weapon(id, name, {}),
    type: "Class Feature",
    categories: ["Armor of Resistance +2"],
  });
  const entities = [
    armor,
    resistance("ID_INTERNAL_RESIST_FIRE_2", "Resist Fire"),
    resistance("ID_INTERNAL_RESIST_COLD_2", "Resist Cold"),
  ];
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity] as const),
  );
  const unchosen: BuildInventoryEntry = {
    ...holding(armor),
    id: "resistance-armor",
  };
  beforeEach(() => {
    // The selected holding's detail card measures itself.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function close(
      this: HTMLDialogElement,
    ) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
  });

  it("offers the item's choice from its right-click menu and saves the pick", () => {
    const onPutInventory = vi.fn();
    act(() =>
      root.render(
        <EquipmentWorkspace
          // An issue's Review link selects the holding and expands its group.
          focusRequest={{ entryId: "resistance-armor", request: 1 }}
          build={{ ...build, inventory: [unchosen] }}
          entities={entities}
          byId={byId}
          wallet={{ carried: noCoins, stored: noCoins }}
          activeDefinitionIds={[]}
          workspace="equipment"
          loadoutView={false}
          shopCategory="items"
          onShopCategoryChange={() => undefined}
          onPutInventory={onPutInventory}
          onPurchase={() => undefined}
          onSell={() => undefined}
          onInventoryCommands={() => undefined}
          onEquipSlot={() => undefined}
          onSetWielding={() => undefined}
          onSetAugment={() => undefined}
          onSetText={() => undefined}
        />,
      ),
    );
    const row = container.querySelector(
      '[data-inventory-entry="resistance-armor"]',
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
    const items = [
      ...container.querySelectorAll<HTMLElement>('[role="menu"] button'),
    ];
    expect(items.map((item) => item.textContent)).toEqual([
      "Choose Resistance Type…",
    ]);
    act(() => items[0]!.click());
    const dialog = container.querySelector("dialog")!;
    expect(dialog.querySelector("h2")?.textContent).toBe(
      "Choose Resistance Type",
    );
    const button = (label: string) =>
      [...dialog.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === label,
      )!;
    expect(button("Save").disabled).toBe(true);
    act(() => button("Resist Fire").click());
    expect(button("Save").disabled).toBe(false);
    act(() => button("Save").click());
    expect(onPutInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "resistance-armor",
        elements: [
          expect.objectContaining({
            definitionId: "ID_FMP_MAGIC_ITEM_1474",
            children: [
              expect.objectContaining({
                identity: {
                  definitionId: "ID_INTERNAL_RESIST_FIRE_2",
                  name: "Resist Fire",
                  type: "Class Feature",
                },
              }),
            ],
          }),
        ],
      }),
    );
  });
});
