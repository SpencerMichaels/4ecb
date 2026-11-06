// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
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

// The selected holding's actions are buttons in its detail pane, built
// from the same list as its right-click menu (owner rule 2026-11-06:
// right-click is a shortcut, never the only way in).

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>>,
  rules: ContentEntity["rules"] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
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
    rules,
    extensions: [],
    provenance: { sourceKey: "item-actions", sourceOrdinal: 0 },
  };
}

const sword = entity("SWORD", "Bastard blade", "Weapon", {
  "Item Slot": "One-hand",
  Properties: "Versatile",
});
const dagger = entity("DAGGER", "Plain dagger", "Weapon", {
  "Item Slot": "One-hand",
});
const shard = entity("SHARD", "Synthetic Shard", "Magic Item", {
  "Magic Item Type": "Dragonshard Augment",
});
const staff = entity("STAFF", "Staff of Ruin +1", "Magic Item", {
  "Magic Item Type": "Staff",
});
const orb = entity("ORB", "Orb of Light +1", "Magic Item", {
  "Magic Item Type": "Orb",
});
const armor = entity(
  "ID_FMP_MAGIC_ITEM_1474",
  "Armor of Resistance +2",
  "Magic Item",
  { "Magic Item Type": "Armor" },
  [
    {
      name: "select",
      attributes: [
        { name: "type", value: "Class Feature" },
        { name: "number", value: "1" },
        { name: "Category", value: "Armor of Resistance +2" },
      ],
      text: "Choose Resistance Type ",
      children: [],
      ordinal: 0,
    },
  ],
);
const resistFire: ContentEntity = {
  ...entity("ID_INTERNAL_RESIST_FIRE_2", "Resist Fire", "Class Feature", {}),
  categories: ["Armor of Resistance +2"],
};
const entities = [sword, dagger, shard, staff, orb, armor, resistFire];
const byId = new Map(
  entities.map((candidate) => [candidate.id.toLocaleLowerCase(), candidate]),
);

const holding = (
  item: ContentEntity,
  extra: Partial<BuildInventoryEntry> = {},
): BuildInventoryEntry => ({
  id: item.id,
  acquiredLevel: 1,
  quantity: 1,
  equippedQuantity: 0,
  elements: [{ definitionId: item.id, name: item.name, type: item.type }],
  overrides: {},
  legality: "rules-legal",
  ...extra,
});
const baseBuild: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 1,
  levels: [],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const noCoins = { copper: 0, silver: 0, gold: 0, platinum: 0, astral: 0 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // The selected holding's detail card measures itself.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  inventory: readonly BuildInventoryEntry[],
  props: Partial<ComponentProps<typeof EquipmentWorkspace>> = {},
) {
  act(() =>
    root.render(
      <EquipmentWorkspace
        build={{ ...baseBuild, inventory }}
        entities={entities}
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
        onSetAugment={() => undefined}
        onSetText={() => undefined}
        onLearnKnown={() => undefined}
        onRemoveKnown={() => undefined}
        {...props}
      />,
    ),
  );
}

const row = (entryId: string) =>
  container.querySelector<HTMLElement>(`[data-inventory-entry="${entryId}"]`)!;
const select = (entryId: string) =>
  act(() =>
    row(entryId).querySelector<HTMLElement>(".inventory-item-button")!.click(),
  );
const paneButtons = () => [
  ...container.querySelectorAll<HTMLButtonElement>(
    '.shared-choice-detail [role="group"].item-detail-actions button',
  ),
];
const menuButtons = (entryId: string) => {
  act(() => {
    row(entryId).dispatchEvent(
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
const describeButtons = (buttons: readonly HTMLElement[]) =>
  buttons.map((button) => ({
    label: button.textContent,
    on:
      button.getAttribute("aria-pressed") ??
      button.getAttribute("aria-checked"),
    disabledReason: button.getAttribute("title"),
  }));

describe("Item actions in the Inventory detail pane", () => {
  it("shows Wield two-handed as a toggle for a versatile weapon only", () => {
    const onSetWielding = vi.fn();
    render([holding(sword), holding(dagger)], { onSetWielding });

    select("DAGGER");
    expect(container.querySelector(".item-detail-actions")).toBeNull();

    select("SWORD");
    const group = container.querySelector(".item-detail-actions");
    expect(group?.getAttribute("aria-label")).toBe("Bastard blade actions");
    expect(describeButtons(paneButtons())).toEqual([
      { label: "Wield two-handed", on: "false", disabledReason: null },
    ]);
    act(() => paneButtons()[0]!.click());
    expect(onSetWielding).toHaveBeenCalledWith("SWORD", true);

    // The toggle follows the holding's state.
    render([holding(sword, { wieldedTwoHanded: true }), holding(dagger)], {
      onSetWielding,
    });
    expect(paneButtons()[0]?.getAttribute("aria-pressed")).toBe("true");
    act(() => paneButtons()[0]!.click());
    expect(onSetWielding).toHaveBeenLastCalledWith("SWORD", false);
  });

  it("offers no Wield two-handed when size forces both hands", () => {
    render([holding(sword)], {
      loadoutSlotContext: {
        small: true,
        oversized: false,
        oneSizeLarger: false,
        ambidextrous: false,
      },
    });
    select("SWORD");
    expect(container.querySelector(".item-detail-actions")).toBeNull();
  });

  it("attaches and detaches an augment, Detach present but inert while loose", () => {
    const onSetAugment = vi.fn();
    render([holding(staff), holding(orb), holding(shard)], { onSetAugment });
    select("SHARD");
    expect(describeButtons(paneButtons())).toEqual([
      {
        label: "Attach to Staff of Ruin +1",
        on: "false",
        disabledReason: null,
      },
      {
        label: "Detach",
        on: null,
        disabledReason: "This augment isn't attached to an item.",
      },
    ]);
    act(() => paneButtons()[1]!.click());
    expect(onSetAugment).not.toHaveBeenCalled();
    act(() => paneButtons()[0]!.click());
    expect(onSetAugment).toHaveBeenCalledWith([
      { hostEntryId: "STAFF", augmentEntryId: "SHARD" },
    ]);

    render([holding(staff, { augmentEntryId: "SHARD" }), holding(shard)], {
      onSetAugment,
    });
    expect(paneButtons()[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(paneButtons()[1]?.hasAttribute("aria-disabled")).toBe(false);
    act(() => paneButtons()[1]!.click());
    expect(onSetAugment).toHaveBeenLastCalledWith([
      { hostEntryId: "STAFF", augmentEntryId: null },
    ]);

    // Nothing eligible: Attach to… stays, inert, saying why.
    render([holding(orb), holding(shard)], { onSetAugment });
    expect(describeButtons(paneButtons())[0]).toEqual({
      label: "Attach to…",
      on: null,
      disabledReason:
        "No magic weapon or staff in the inventory can take an augment.",
    });
  });

  it("opens the item's choice dialog from the pane", () => {
    render([holding(armor, { id: "resistance-armor" })], {
      shopCategory: "items",
      focusRequest: { entryId: "resistance-armor", request: 1 },
    });
    expect(paneButtons().map((button) => button.textContent)).toEqual([
      "Choose Resistance Type…",
    ]);
    act(() => paneButtons()[0]!.click());
    expect(container.querySelector("dialog h2")?.textContent).toBe(
      "Choose Resistance Type",
    );
  });

  it("builds the pane and the right-click menu from one list", () => {
    render([holding(staff, { augmentEntryId: "SHARD" }), holding(shard)]);
    select("SHARD");
    const pane = describeButtons(paneButtons());
    expect(describeButtons(menuButtons("SHARD"))).toEqual(pane);

    render([holding(sword, { wieldedTwoHanded: true })]);
    select("SWORD");
    expect(describeButtons(menuButtons("SWORD"))).toEqual(
      describeButtons(paneButtons()),
    );
  });
});
