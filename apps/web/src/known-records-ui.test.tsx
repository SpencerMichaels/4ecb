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
  knownRecordSourceLabel,
  ritualAllowanceGroups,
  ritualAllowanceLabel,
} from "./known-records-ui";

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
  it("groups known records by kind, sources without levels, once each", () => {
    const records = knownRecords(build, evaluate(build), (id) =>
      byId.get(id.toLowerCase()),
    );
    const groups = groupKnownRecords(records);
    expect(
      groups.get("ritual")?.map((record) => knownRecordSourceLabel(record)),
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
    expect(labels).toEqual(["Rituals known2"]);
    expect(
      container.querySelector(".inventory-category-label .table-section-count")
        ?.textContent,
    ).toBe("2");
    // A kind the character doesn't know has no group, like an item
    // category with no holdings.
    expect(text).not.toContain("Alchemical formulas known");
    expect(rowNamed("Gifted Rite").textContent).toBe(
      "Gifted RiteLevel 1 Exploration Nature Granted by Synthetic Druid",
    );
    expect(rowNamed("Bought Rite").textContent).toBe(
      "Bought RiteLevel 2 Warding",
    );
    expect(text).not.toMatch(/at level/i);
    // No per-row buttons: Remove is in the right-click menu.
    expect(rowNamed("Bought Rite").querySelectorAll("button")).toHaveLength(1);
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
    expect(rowNamed("New Rite").textContent).toContain(
      "Learned free (Synthetic Druid)",
    );
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
      from?: readonly string[],
    ): RitualAllowanceStatus => ({
      allowance: {
        key: "P",
        providerId: "P",
        provider: "Spellbook",
        kind,
        steps: [],
        ...(from === undefined ? {} : { from }),
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
    const choice = status(
      { total: 1, remaining: 1, remainders: [{ count: 1 }] },
      "Ritual",
      ["a", "b", "c"],
    );
    expect(ritualAllowanceLabel(choice, (id) => id.toUpperCase())).toBe(
      "1 free ritual: A, B or C",
    );
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
      ritualAllowanceGroups(
        [
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
        ],
        (id) => id.toUpperCase(),
      ),
    ).toEqual([
      {
        providerId: "PSION",
        heading: "Free rituals",
        provider: "Psion",
        lines: [
          { key: "PSION", label: "1 free 1st-level ritual" },
          { key: "PSION#2", label: "1 free ritual: A, B or C" },
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
    expect(
      knownRecordSourceLabel(record!, (key) =>
        key === "P" ? "Spellbook" : undefined,
      ),
    ).toBe("Learned free (Spellbook)");
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
        describe={() => "1 free ritual: Sending or Tenser's Floating Disk"}
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
