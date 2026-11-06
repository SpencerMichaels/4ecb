// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BuildKnownEntry, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  knownRecords,
  projectBuildForEvaluation,
  type RitualAllowanceStatus,
} from "@4ecb/rules-engine";

import { EquipmentWorkspace } from "./EquipmentWorkspace";
import {
  AllowanceChoiceDialog,
  groupKnownRecords,
  knownRecordGrantLabel,
  ritualAllowanceGroups,
  ritualAllowanceLabel,
} from "./known-records-ui";
import { trailingContentHeight } from "./use-fitted-table-height";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      name: key,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  options: {
    readonly rules?: readonly RuleStatement[];
    readonly specifics?: Readonly<Record<string, string>>;
  } = {},
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
    specifics: Object.entries(options.specifics ?? {}).map(
      ([specificName, value], ordinal) => ({
        name: specificName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    extensions: [],
    provenance: { sourceKey: "public-rituals", sourceOrdinal: 0 },
  };
}

const content = [
  entity("L1", "1", "Level"),
  entity("CLASS", "Synthetic Druid", "Class", {
    specifics: { _FreeRitualAllowance: "Ritual; 1@1<=1" },
    rules: [
      rule("statadd", { name: "FREEBEE:RITUAL_GIFT", value: "+1" }, 0),
      rule(
        "textstring",
        {
          name: "Free Rituals",
          value: "* As a druid you have been given the Gifted Rite.",
        },
        1,
      ),
    ],
  }),
  entity("RITUAL_GIFT", "Gifted Rite", "Ritual", {
    specifics: {
      Category: "Exploration",
      "Key Skill": "Nature",
      Level: "1",
      type: "Ritual",
    },
  }),
  entity("RITUAL_BOUGHT", "Bought Rite", "Ritual", {
    specifics: { Category: "Warding", Level: "2", type: "Ritual" },
  }),
  entity("RITUAL_NEW", "New Rite", "Ritual", {
    specifics: {
      Category: "Travel",
      Level: "1",
      "Market Price": "50 gp",
      type: "Ritual",
    },
  }),
  entity("FORMULA", "Synthetic Formula", "Ritual", {
    specifics: { Category: "Poison", Level: "3", type: "Alchemical Formula" },
  }),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));

const build: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "l1",
        identity: { definitionId: "L1", name: "1", type: "Level" },
        acquiredLevel: 1,
        legality: "rules-legal",
        unresolved: false,
        children: [
          {
            id: "class",
            identity: {
              definitionId: "CLASS",
              name: "Synthetic Druid",
              type: "Class",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        ],
      },
    },
  ],
  grabbag: [],
  inventory: [],
  known: [
    {
      id: "stored-gift",
      acquiredLevel: 1,
      element: {
        definitionId: "RITUAL_GIFT",
        name: "Gifted Rite",
        type: "Ritual",
      },
      acquisition: "free",
    },
    {
      id: "bought",
      acquiredLevel: 1,
      element: {
        definitionId: "RITUAL_BOUGHT",
        name: "Bought Rite",
        type: "Ritual",
      },
      acquisition: "bought",
    },
  ],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const evaluate = (value: CharacterBuild) =>
  evaluateCharacter(projectBuildForEvaluation(value, content), content);
const noCoins = { copper: 0, silver: 0, gold: 0, platinum: 0, astral: 0 };

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

function renderWorkspace(
  options: {
    readonly build?: CharacterBuild;
    readonly workspace?: "equipment" | "shop";
    readonly onLearnKnown?: (
      entry: BuildKnownEntry,
      priceCopper: number,
    ) => void;
    readonly onRemoveKnown?: (entryId: string) => void;
  } = {},
) {
  const value = options.build ?? build;
  act(() =>
    root.render(
      <EquipmentWorkspace
        build={value}
        entities={content}
        byId={byId}
        wallet={{ carried: { ...noCoins, gold: 100 }, stored: noCoins }}
        activeDefinitionIds={[]}
        workspace={options.workspace ?? "equipment"}
        loadoutView={false}
        shopCategory="rituals"
        onShopCategoryChange={() => undefined}
        onPutInventory={() => undefined}
        onPurchase={() => undefined}
        onSell={() => undefined}
        onInventoryCommands={() => undefined}
        onEquipSlot={() => undefined}
        onSetWielding={() => undefined}
        onSetAugment={() => undefined}
        onSetText={() => undefined}
        evaluation={evaluate(value)}
        onLearnKnown={options.onLearnKnown ?? vi.fn()}
        onRemoveKnown={options.onRemoveKnown ?? vi.fn()}
      />,
    ),
  );
}

const rowNamed = (name: string) =>
  [...container.querySelectorAll("tr")].find((row) =>
    row.querySelector(".inventory-item-name")?.textContent?.includes(name),
  )!;
const rightClick = (target: Element) =>
  act(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
      }),
    );
  });
const menuItem = (label: string) =>
  [...document.querySelectorAll(".item-context-menu button")].find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement | undefined;

describe("Known records in the Inventory (D114)", () => {
  it("groups known records by kind, once each; only a grant has a label", () => {
    const records = knownRecords(build, evaluate(build), (id) =>
      byId.get(id.toLowerCase()),
    );
    const groups = groupKnownRecords(records);
    expect(
      groups.get("ritual")?.map((record) => knownRecordGrantLabel(record)),
    ).toEqual([undefined, "Granted by Synthetic Druid"]);
    expect(groups.get("alchemical-formula")).toEqual([]);
    expect(groups.get("martial-practice")).toEqual([]);
  });

  it("lists the kinds the character knows after the items, with the free rituals left", () => {
    renderWorkspace();
    const text = container.textContent ?? "";
    // No items: the table still holds the known lists.
    expect(text).toContain("No carried inventory.");
    expect(container.querySelector(".inventory-allowance-row")?.innerHTML).toBe(
      '<td colspan="3"><div class="rituals-allowance"><div class="rituals-allowance-group"><p class="rituals-allowance-heading"><strong>Free rituals</strong><span class="rituals-allowance-source"> (Synthetic Druid)</span></p><p class="rituals-allowance-count">1 free 1st-level ritual</p></div></div></td>',
    );
    expect(text).not.toContain("As a druid you have been given");
    // The group count sits in the same label element as the item
    // categories' counts (same size as the title).
    const labels = [
      ...container.querySelectorAll(".inventory-category-label"),
    ].map((label) => label.textContent);
    // Named as the Shop's learning categories, without "known".
    expect(labels).toEqual(["Rituals2"]);
    expect(
      container.querySelector(".inventory-category-label .table-section-count")
        ?.textContent,
    ).toBe("2");
    // A kind the character doesn't know has no group, like an item
    // category with no holdings.
    expect(text).not.toContain("Alchemical formulas");
    // A row is its name only: level, category and key skill are the
    // card's subheader, and where a record came from is never shown.
    expect(rowNamed("Gifted Rite").textContent).toBe("Gifted Rite");
    expect(rowNamed("Bought Rite").textContent).toBe("Bought Rite");
    expect(text).not.toMatch(/at level|Granted by|Learned free/i);
    // The item rows' three cells (name, quantity, actions), so the name
    // sits in the Item column where item names do.
    const cells = [...rowNamed("Bought Rite").children];
    expect(cells.map((cell) => cell.tagName)).toEqual(["TH", "TD", "TD"]);
    expect(cells.map((cell) => cell.getAttribute("colspan"))).toEqual([
      null,
      null,
      null,
    ]);
    expect(cells[2]?.className).toBe("inventory-actions-cell");
    // The name's inspect button, then the item rows' Remove in the
    // actions cell.
    expect(rowNamed("Bought Rite").querySelectorAll("button")).toHaveLength(2);
    expect(
      cells[2]?.querySelector(":scope > .inventory-row-actions > button")
        ?.className,
    ).toBe("inventory-icon-action inventory-remove-action button-icon");
  });

  it("removes a learned record with the item rows' two-click Remove", () => {
    const onRemoveKnown = vi.fn();
    renderWorkspace({ onRemoveKnown });
    const remove = () =>
      rowNamed("Bought Rite").querySelector<HTMLButtonElement>(
        ".inventory-remove-action",
      )!;
    expect(remove().getAttribute("aria-disabled")).toBeNull();
    expect(remove().getAttribute("aria-label")).toBe("Remove Bought Rite");
    expect(remove().title).toBe("Remove");
    // The first click arms it, without inspecting the row.
    const detail = () =>
      container.querySelector(".shared-choice-detail")?.textContent;
    const before = detail();
    act(() => remove().click());
    expect(onRemoveKnown).not.toHaveBeenCalled();
    expect(detail()).toBe(before);
    expect(before).toContain("Choose an item to inspect it");
    expect(remove().dataset.armed).toBe("true");
    expect(remove().getAttribute("aria-label")).toBe(
      "Confirm removing Bought Rite",
    );
    expect(remove().title).toBe("Click again to remove");
    act(() => remove().click());
    expect(onRemoveKnown).toHaveBeenCalledWith("bought");
  });

  it("keeps a granted record's Remove in place, inert, saying why", () => {
    const onRemoveKnown = vi.fn();
    renderWorkspace({ onRemoveKnown });
    const remove = rowNamed("Gifted Rite").querySelector<HTMLButtonElement>(
      ".inventory-remove-action",
    )!;
    expect(remove.className).toBe(
      "inventory-icon-action inventory-remove-action button-icon",
    );
    expect(remove.disabled).toBe(false);
    expect(remove.getAttribute("aria-disabled")).toBe("true");
    expect(remove.title).toBe(
      "Granted by Synthetic Druid; it can't be removed.",
    );
    act(() => remove.click());
    act(() => remove.click());
    expect(remove.dataset.armed).toBeUndefined();
    expect(onRemoveKnown).not.toHaveBeenCalled();
  });

  it("gives known records the item rows' Remove markup", () => {
    const sword = entity("SWORD", "Plain sword", "Weapon", {
      specifics: { "Item Slot": "One-hand" },
    });
    const withItem: CharacterBuild = {
      ...build,
      inventory: [
        {
          id: "sword",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 0,
          elements: [
            { definitionId: "SWORD", name: "Plain sword", type: "Weapon" },
          ],
          overrides: {},
          legality: "rules-legal",
        },
      ],
    };
    content.push(sword);
    byId.set("sword", sword);
    try {
      renderWorkspace({ build: withItem });
      const markup = (name: string) =>
        rowNamed(name)
          .querySelector(".inventory-remove-action")!
          .outerHTML.replace(/data-inventory-remove-trigger="[^"]*"/, "")
          .replaceAll(name, "NAME");
      expect(markup("Bought Rite")).toBe(markup("Plain sword"));
    } finally {
      content.pop();
      byId.delete("sword");
    }
  });

  it("keeps the known lists in the Inventory's fitted scroll container", () => {
    renderWorkspace({
      build: { ...build, inventory: [] },
    });
    // One bounded scroller holds the whole table, item bands and known
    // lists alike, directly in the mode content the fitting hook measures
    // (use-fitted-table-height.ts, 13-equipment.css).
    const scroll = container.querySelector(
      ".equipment-primary > .equipment-mode-content > .equipment-table-scroll",
    );
    expect(scroll).not.toBeNull();
    expect(container.querySelectorAll(".equipment-table-scroll")).toHaveLength(
      1,
    );
    expect(
      scroll?.querySelector(":scope > table.inventory-table"),
    ).not.toBeNull();
    expect(scroll?.contains(rowNamed("Bought Rite"))).toBe(true);
    expect(
      scroll?.contains(container.querySelector(".inventory-allowance-row")),
    ).toBe(true);
  });

  it("fits the Shop table above its pager, which follows the scroller in the measured container", () => {
    renderWorkspace({ workspace: "shop" });
    const primary = container.querySelector<HTMLElement>(".equipment-primary");
    const scroll = primary?.querySelector<HTMLElement>(
      ":scope > .equipment-table-scroll",
    );
    const pager = primary?.querySelector<HTMLElement>(
      ":scope > .equipment-pagination",
    );
    expect(scroll).not.toBeNull();
    expect(pager).not.toBeNull();
    expect(
      scroll!.compareDocumentPosition(pager!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The fitting hook leaves the pager's room under the table
    // (use-fitted-table-height.ts), so it stays in view.
    const box = (top: number, bottom: number) => () =>
      ({ top, bottom, height: bottom - top, width: 100 }) as DOMRect;
    scroll!.getBoundingClientRect = box(100, 600);
    pager!.getBoundingClientRect = box(606, 640);
    expect(
      trailingContentHeight(primary!, scroll!, ".equipment-table-scroll"),
    ).toBe(40);
  });

  it("removes a learned record from its right-click menu; a granted one says why not", () => {
    const onRemoveKnown = vi.fn();
    renderWorkspace({ onRemoveKnown });
    rightClick(rowNamed("Gifted Rite"));
    const inert = menuItem("Remove");
    expect(inert?.getAttribute("aria-disabled")).toBe("true");
    expect(inert?.title).toBe(
      "Granted by Synthetic Druid; it can't be removed.",
    );
    act(() => inert?.click());
    expect(onRemoveKnown).not.toHaveBeenCalled();
    rightClick(rowNamed("Bought Rite"));
    act(() => menuItem("Remove")?.click());
    expect(onRemoveKnown).toHaveBeenCalledWith("bought");
  });

  it("drops the free-ritual block once every allowance is used", () => {
    const used: CharacterBuild = {
      ...build,
      known: [
        ...build.known,
        {
          id: "free-pick",
          acquiredLevel: 1,
          element: {
            definitionId: "RITUAL_NEW",
            name: "New Rite",
            type: "Ritual",
          },
          acquisition: "free",
          allowance: "CLASS",
        },
      ],
    };
    renderWorkspace({ build: used });
    expect(container.querySelector(".rituals-allowance")).toBeNull();
    expect(rowNamed("New Rite").textContent).toBe("New Rite");
  });
});

describe("Learning in the Shop (D114)", () => {
  it("buys a ritual into the known list and learns one free with the allowance it fits", () => {
    const onLearnKnown = vi.fn();
    renderWorkspace({ workspace: "shop", onLearnKnown });
    const buy = container.querySelector<HTMLButtonElement>(
      '[aria-label="Buy New Rite"]',
    )!;
    act(() => buy.click());
    expect(onLearnKnown).toHaveBeenLastCalledWith(
      expect.objectContaining({
        acquiredLevel: 1,
        acquisition: "bought",
        element: {
          definitionId: "RITUAL_NEW",
          name: "New Rite",
          type: "Ritual",
        },
      }),
      5_000,
    );
    expect(onLearnKnown.mock.lastCall?.[0]).not.toHaveProperty("allowance");
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Learn New Rite free"]')!
        .click(),
    );
    expect(onLearnKnown).toHaveBeenLastCalledWith(
      expect.objectContaining({ acquisition: "free", allowance: "CLASS" }),
      0,
    );
    // Known records are marked like owned items and can't be learned again.
    const known = container.querySelector<HTMLButtonElement>(
      '[aria-label="Buy Bought Rite"]',
    );
    expect(known?.disabled).toBe(true);
    expect(known?.closest("tr")?.textContent).toContain("Known");
  });

  it("labels allowance counters and the allowance a ritual used", () => {
    const status = (
      value: Partial<RitualAllowanceStatus> &
        Pick<RitualAllowanceStatus, "remainders">,
      kind: RitualAllowanceStatus["allowance"]["kind"] = "Ritual",
    ): RitualAllowanceStatus => ({
      allowance: {
        key: "P",
        providerId: "P",
        provider: "Spellbook",
        kind,
        steps: [],
      },
      total: 5,
      used: 0,
      remaining: 5,
      entryIds: [],
      ...value,
    });
    expect(
      ritualAllowanceLabel(
        status({
          remainders: [
            { count: 3, maxLevel: 1 },
            { count: 2, maxLevel: 5 },
          ],
        }),
      ),
    ).toBe("3 free 1st-level rituals and 2 free rituals of level 5 or lower");
    const choice = status({
      total: 1,
      remaining: 1,
      remainders: [{ count: 1 }],
    });
    expect(ritualAllowanceLabel(choice)).toBe("1 free ritual");
    const usedUp = status(
      { total: 2, remaining: 0, remainders: [] },
      "Martial Practice",
    );
    expect(ritualAllowanceLabel(usedUp)).toBeUndefined();
    expect(
      ritualAllowanceLabel(status({ total: 0, remaining: 0, remainders: [] })),
    ).toBeUndefined();

    const as = (
      value: RitualAllowanceStatus,
      providerId: string,
      provider: string,
      suffix = "",
    ): RitualAllowanceStatus => ({
      ...value,
      allowance: {
        ...value.allowance,
        key: `${providerId}${suffix}`,
        providerId,
        provider,
      },
    });
    const firstLevel = status({
      total: 1,
      remaining: 1,
      remainders: [{ count: 1, maxLevel: 1 }],
    });
    expect(
      ritualAllowanceGroups([
        as(usedUp, "MARTIAL", "Martial Training"),
        as(firstLevel, "PSION", "Psion"),
        as(choice, "PSION", "Psion", "#2"),
        as(
          status(
            {
              total: 1,
              remaining: 1,
              remainders: [{ count: 1, maxLevel: 1 }],
            },
            "Alchemical Formula",
          ),
          "ALCHEMIST",
          "Alchemist",
        ),
      ]),
    ).toEqual([
      {
        providerId: "PSION",
        heading: "Free rituals",
        provider: "Psion",
        lines: [
          { key: "PSION", label: "1 free 1st-level ritual" },
          { key: "PSION#2", label: "1 free ritual" },
        ],
      },
      {
        providerId: "ALCHEMIST",
        heading: "Free alchemical formulas",
        provider: "Alchemist",
        lines: [
          { key: "ALCHEMIST", label: "1 free 1st-level alchemical formula" },
        ],
      },
    ]);
    const [record] = knownRecords(
      {
        known: [
          {
            id: "free",
            acquiredLevel: 3,
            element: { name: "Rite", type: "Ritual" },
            acquisition: "free",
            allowance: "P",
          },
        ],
      },
      undefined,
      () => undefined,
    );
    // A learned record, free or bought, has no label.
    expect(knownRecordGrantLabel(record!)).toBeUndefined();
    // A ritual picked in a Build-tab Ritual choice (D115).
    expect(
      knownRecordGrantLabel({
        element: { name: "Sending", type: "Ritual" },
        source: { kind: "granted", provider: "Psion", via: "choice" },
      }),
    ).toBe("Chosen for Psion");
  });

  it("hangs each Learn-free option's text beside its radio", () => {
    const markup = renderToStaticMarkup(
      <AllowanceChoiceDialog
        name="Tenser's Floating Disk"
        allowances={[
          {
            key: "PSION",
            providerId: "PSION",
            provider: "Psion",
            kind: "Ritual",
            steps: [],
          },
        ]}
        describe={() => "1 free 1st-level ritual"}
        onLearn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(markup.match(/<label class="dialog-choice">/g)).toHaveLength(2);
    expect(markup).toContain(
      '<label class="dialog-choice"><input type="radio" name="ritual-allowance" checked=""/><span class="dot-list">',
    );
    expect(markup).toContain(
      '<input type="radio" name="ritual-allowance"/><span>None (a gift)</span></label>',
    );
    expect(markup).toContain(">Cancel</button>");
  });
});
