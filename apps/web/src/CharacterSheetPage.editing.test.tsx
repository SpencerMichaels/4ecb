// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  newCharacterRecord,
  type CharacterRecord,
} from "@4ecb/character-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
  type EvaluationInput,
} from "@4ecb/rules-engine";

const runtime = vi.hoisted(() => ({
  record: undefined as CharacterRecord | undefined,
  evaluate: undefined as unknown as Mock<
    (input: EvaluationInput) => Promise<EvaluatedCharacter>
  >,
  updateMetadata: undefined as unknown as Mock<
    (...args: unknown[]) => Promise<CharacterRecord | undefined>
  >,
}));

vi.mock("@4ecb/browser-storage", () => ({
  CharacterRepository: class {
    get = async () => runtime.record;
    put = async () => undefined;
    updateMetadata = (...args: unknown[]) => runtime.updateMetadata(...args);
  },
}));
vi.mock("./app-runtime", () => ({
  appContentRuntime: {
    getPack: async () => ({
      manifest: { packId: "synthetic", contentDigest: "digest" },
      entities: [],
    }),
    getRulesClient: async () => ({
      evaluate: (input: EvaluationInput) => runtime.evaluate(input),
    }),
  },
}));
vi.mock("./use-loading-progress", () => ({
  useLoadingProgress: () => ({}),
  loadingStepDetail: () => undefined,
}));

// jsdom has no layout: the sheet fitting code measures nothing.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!("fonts" in document))
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
  });

const { CharacterSheetPage } = await import("./CharacterSheetPage");

const arcStrike = {
  definitionId: "ID_ARC_STRIKE",
  name: "Arc Strike",
  usage: "Encounter",
  actionType: "Standard Action",
  keywords: [],
  variants: [],
  recoveries: [],
  unsupported: [],
};

function record(): CharacterRecord {
  const base = newCharacterRecord(
    { format: "dnd4e", sourceXml: "<D20Character/>" },
    {
      details: { name: "Ada" },
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [],
      textStrings: {},
      levelCount: 1,
      source: "native-empty",
    },
    {
      formatVersion: 3,
      known: [],
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory: [
        {
          id: "holding-cloak",
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 0,
          elements: [{ name: "Synthetic Cloak", type: "Magic Item" }],
          overrides: {},
          legality: "rules-legal",
        },
      ],
      alternates: [],
      baseAbilities: {},
      textStrings: { Name: "Ada" },
    },
    {
      id: "ada",
      profileBinding: { packId: "synthetic", contentDigest: "digest" },
    },
  );
  return base;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  runtime.record = record();
  runtime.evaluate = vi.fn(
    async (input: EvaluationInput): Promise<EvaluatedCharacter> => ({
      ...evaluateCharacter(input, []),
      powers: [arcStrike],
    }),
  );
  runtime.updateMetadata = vi.fn(async () => runtime.record);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const settle = async () => {
  for (let index = 0; index < 5; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};
const cardPageText = () =>
  [...container.querySelectorAll(".print-card-page")]
    .map((page) => page.textContent)
    .join("\n");
const pageText = (label: string) =>
  [...container.querySelectorAll(`[aria-label="${label}"]`)]
    .map((page) => page.textContent)
    .join("\n");
const rightClick = (target: Element) => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 40,
    clientY: 60,
  });
  target.dispatchEvent(event);
  return event;
};
/** The Edit overlay covering a card, shown or hidden. */
const cardTarget = (name: string) =>
  container.querySelector<HTMLElement>(
    [`Hide ${name}`, `Show ${name}`]
      .map((label) => `.sheet-card-edit[aria-label="${label}"]`)
      .join(", "),
  );
async function toggle(target: HTMLElement | null) {
  expect(target).not.toBeNull();
  await act(async () => {
    rightClick(target!);
  });
  await settle();
}
const sectionsTrigger = () =>
  [
    ...container.querySelectorAll<HTMLButtonElement>(
      ".print-preview-toolbar button",
    ),
  ].find((button) => button.textContent === "Sections");
const sectionsMenu = () =>
  container.querySelector<HTMLElement>(
    '[role="group"][aria-label="Sections to print"]',
  );
const sectionCheckbox = (label: string) =>
  [...(sectionsMenu()?.querySelectorAll<HTMLInputElement>("input") ?? [])].find(
    (input) =>
      input.closest("label")?.querySelector("span")?.textContent === label,
  );
const menuOrder = () =>
  [
    ...(sectionsMenu()?.querySelectorAll(".sheet-sections-row label") ?? []),
  ].map((label) => label.querySelector("span")?.textContent);
const pageNumber = (selector: string) =>
  container.querySelector(`${selector} .ov-page-number`)?.textContent;
/** Printed pages in document order ("cards" for a card page), probes left out. */
const printedPages = () =>
  [
    ...container.querySelectorAll<HTMLElement>(
      ".sheet-overview > .sp-paper, .print-card-page",
    ),
  ].map((page) =>
    page.classList.contains("print-card-page")
      ? "cards"
      : (page.getAttribute("aria-label") ?? ""),
  );
async function openSections() {
  await act(async () => sectionsTrigger()!.click());
  expect(sectionsMenu()).not.toBeNull();
}
async function tick(label: string) {
  const input = sectionCheckbox(label);
  expect(input, label).toBeDefined();
  await act(async () => input!.click());
  await settle();
}

const onSheetModeChange = vi.fn();
async function renderSheet(sheetEditing: boolean) {
  await act(async () =>
    root.render(
      <CharacterSheetPage
        characterId="ada"
        manifests={[]}
        openPrintPreview
        sheetEditing={sheetEditing}
        onSheetModeChange={onSheetModeChange}
      />,
    ),
  );
  await settle();
}

describe("character sheet Edit mode", () => {
  it("never puts an item card flag into the evaluation input", () => {
    const { build } = record();
    const flagged = (showPowerCard: boolean) =>
      projectBuildForEvaluation(
        {
          ...build,
          inventory: build.inventory.map((entry) => ({
            ...entry,
            showPowerCard,
          })),
        },
        [],
      );
    expect(JSON.stringify(flagged(false))).toBe(JSON.stringify(flagged(true)));
  });

  it("offers View and Edit, with card overlays and the Sections menu only in Edit", async () => {
    await renderSheet(false);
    const modes = [
      ...container.querySelectorAll<HTMLInputElement>(
        ".print-preview-toolbar .segmented-control input",
      ),
    ];
    expect(modes.map((input) => input.closest("label")?.textContent)).toEqual([
      "View",
      "Edit",
    ]);
    expect(modes[0]?.checked).toBe(true);
    expect(
      container.querySelector(".segmented-control legend")?.textContent,
    ).toBe("Sheet");
    expect(container.querySelector(".sheet-edit-target")).toBeNull();
    expect(sectionsTrigger()).toBeUndefined();
    await act(async () => modes[1]!.click());
    expect(onSheetModeChange).toHaveBeenLastCalledWith(true);

    await renderSheet(true);
    for (const name of ["Play data", "Skills", "Arc Strike", "Synthetic Cloak"])
      expect(cardTarget(name), name).not.toBeNull();
    const overlay = cardTarget("Arc Strike")!;
    expect(overlay.getAttribute("aria-label")).toBe("Hide Arc Strike");
    expect(overlay.getAttribute("aria-pressed")).toBe("false");
    expect(overlay.closest(".sheet-edit-target")?.className).toContain(
      "print-excluded",
    );
    // Overlays never sit inside the measured probe copies.
    expect(
      container.querySelector(".ov-measure .sheet-edit-target"),
    ).toBeNull();
    // Sections have no on-paper control and there is no reveal checkbox:
    // Edit mode always shows hidden cards.
    expect(container.querySelectorAll(".sheet-edit-target")).toHaveLength(
      container.querySelectorAll(".sheet-card-edit").length,
    );
    expect(
      container.querySelector('.print-preview-toolbar input[type="checkbox"]'),
    ).toBeNull();
    expect(sectionsTrigger()?.getAttribute("aria-expanded")).toBe("false");
    const reset = container.querySelector<HTMLButtonElement>(
      "[data-sheet-reset-trigger]",
    );
    expect(reset?.textContent).toBe("Reset");
    expect(reset?.getAttribute("aria-label")).toBe(
      "Reset sheet layout to defaults",
    );
    expect(reset?.title).toBe("Reset sheet layout to defaults");
    // Always present; disabled while the sheet is at its defaults.
    expect(reset?.disabled).toBe(true);
  });

  it("keeps View | Edit in place: Edit's tools follow it, Print stays last", async () => {
    await renderSheet(true);
    const toolbar = container.querySelector(".print-preview-toolbar")!;
    const order = [...toolbar.children].map((child) => child.className);
    const segmented = order.findIndex((name) =>
      name.includes("segmented-control"),
    );
    expect(segmented).toBe(1);
    expect(order[segmented + 1]).toBe("sheet-edit-tools");
    expect(order.at(-1)).toBe("print-preview-toolbar-end");
    // Each option reserves its bold, selected width (print-layout.test.ts
    // checks the CSS that packs the toolbar from the start).
    expect(
      [...toolbar.querySelectorAll(".segmented-control-text")].map((text) =>
        text.getAttribute("data-text"),
      ),
    ).toEqual(["View", "Edit"]);
  });

  it("toggles a card on right-click or the keyboard, with no menu or button", async () => {
    await renderSheet(true);
    const overlay = cardTarget("Arc Strike")!;
    expect(overlay.querySelector("button")).toBeNull();
    expect(overlay.getAttribute("role")).toBe("button");
    expect(overlay.tabIndex).toBe(0);
    // A plain click does nothing (pressing and dragging moves the card).
    await act(async () => overlay.click());
    expect(runtime.updateMetadata).not.toHaveBeenCalled();
    let event: MouseEvent | undefined;
    await act(async () => {
      event = rightClick(overlay);
    });
    await settle();
    expect(event?.defaultPrevented).toBe(true);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    // Edit mode keeps the hidden card in place, ready to show again.
    expect(cardTarget("Arc Strike")?.getAttribute("aria-label")).toBe(
      "Show Arc Strike",
    );
    expect(runtime.updateMetadata).toHaveBeenCalledTimes(1);

    for (const init of [
      { key: "Enter" },
      { key: " " },
      { key: "ContextMenu" },
      { key: "F10", shiftKey: true },
    ]) {
      const target = cardTarget("Arc Strike")!;
      const wasHidden = target.getAttribute("aria-pressed") === "true";
      await act(async () =>
        target.dispatchEvent(
          new KeyboardEvent("keydown", { ...init, bubbles: true }),
        ),
      );
      await settle();
      expect(
        cardTarget("Arc Strike")?.getAttribute("aria-label"),
        init.key,
      ).toBe(wasHidden ? "Hide Arc Strike" : "Show Arc Strike");
    }
  });

  it("hides cards by right-click without re-evaluating, saving silently", async () => {
    await renderSheet(true);
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(pageText("Play scratchpad")).toContain("Arc Strike");

    await toggle(cardTarget("Arc Strike"));
    await toggle(cardTarget("Synthetic Cloak"));
    // The power keeps its scratchpad usage row.
    expect(pageText("Play scratchpad")).toContain("Arc Strike");
    expect(runtime.updateMetadata).toHaveBeenNthCalledWith(1, "ada", {
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
    });
    // The item card is the holding's legacy flag.
    expect(runtime.updateMetadata).toHaveBeenNthCalledWith(2, "ada", {
      itemCardsShown: { "holding-cloak": false },
    });
    // View mode leaves hidden cards out entirely.
    await renderSheet(false);
    expect(cardPageText()).not.toContain("Arc Strike");
    expect(cardPageText()).not.toContain("Synthetic Cloak");
    expect(cardPageText()).toContain("Action Point");
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bSaved\b/);
  });

  it("shows hidden cards dimmed in Edit mode, never in print", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
    };
    await renderSheet(true);
    expect(cardPageText()).toContain("Arc Strike");
    const overlay = cardTarget("Arc Strike")!;
    expect(overlay.getAttribute("aria-label")).toBe("Show Arc Strike");
    expect(overlay.hasAttribute("data-hidden")).toBe(true);
    // The header stays; the body is blanked behind a faint "Hidden".
    expect(overlay.textContent).toBe("Hidden");
    expect(
      container.querySelector(".sheet-concealed-card")?.textContent,
    ).toContain("Arc Strike");
    // An absolutely positioned grid item spans to the grid's edge unless
    // both lines are explicit, so each overlay covers exactly its card.
    for (const target of container.querySelectorAll<HTMLElement>(
      ".sheet-card-edit",
    )) {
      expect(target.style.gridColumn).toMatch(/^\d+ \/ span 1$/);
      expect(target.style.gridRow).toMatch(/^\d+ \/ span 1$/);
    }
    expect(cardTarget("Synthetic Cloak")?.hasAttribute("data-hidden")).toBe(
      false,
    );

    // Printing always omits hidden cards and every edit control.
    await act(async () => window.dispatchEvent(new Event("beforeprint")));
    expect(cardPageText()).not.toContain("Arc Strike");
    expect(container.querySelector(".sheet-edit-target")).toBeNull();
    expect(container.querySelector(".sheet-edit-tools")).not.toBeNull();
    await act(async () => window.dispatchEvent(new Event("afterprint")));
    expect(cardPageText()).toContain("Arc Strike");

    await toggle(cardTarget("Arc Strike"));
    expect(cardTarget("Arc Strike")?.hasAttribute("data-hidden")).toBe(false);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
  });

  it("toggles a page-1 reminder row on right-click, showing hidden rows only in Edit", async () => {
    // An Action Point rider: printed on the Action Point card, so its
    // page-1 reminder is off by default.
    runtime.evaluate = vi.fn(
      async (input: EvaluationInput): Promise<EvaluatedCharacter> => ({
        ...evaluateCharacter(input, []),
        powers: [arcStrike],
        textContributions: [
          {
            name: "Action Point",
            value:
              "Ward Tattoo:When you spend an action point, gain resist 5 fire",
            providerId: "ward",
            providerName: "Ward Tattoo",
            definitionId: "ward",
          },
        ],
      }),
    );
    const row = () =>
      [
        ...container.querySelectorAll<HTMLElement>(
          ".ov-reminder-region .sp-reminders > div",
        ),
      ].find((entry) => entry.textContent?.includes("Ward Tattoo"));
    await renderSheet(false);
    expect(row()).toBeUndefined();

    await renderSheet(true);
    expect(row()?.hasAttribute("data-hidden")).toBe(true);
    // Only faded: no "Hidden" mark over the text.
    expect(row()?.textContent).not.toMatch(/Hidden/);
    // Probe copies carry no edit behaviour.
    expect(
      container.querySelector(".ov-reminder-probe .sheet-reminder-edit"),
    ).toBeNull();
    // A right-click toggles directly: no menu opens.
    let event: MouseEvent | undefined;
    await act(async () => {
      event = rightClick(row()!);
    });
    await settle();
    expect(event?.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(row()?.hasAttribute("data-hidden")).toBe(false);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        reminders: {
          "effect:prov:ward:ward tattoo": "show",
        },
      },
    });

    // Printing strips the edit UI; a shown row prints.
    await act(async () => window.dispatchEvent(new Event("beforeprint")));
    expect(row()?.classList.contains("sheet-reminder-edit")).toBe(false);
    await act(async () => window.dispatchEvent(new Event("afterprint")));

    await renderSheet(false);
    expect(row()).toBeDefined();
    expect(row()?.classList.contains("sheet-reminder-edit")).toBe(false);
    // Right-clicking in View mode changes nothing.
    await act(async () => {
      rightClick(row()!);
    });
    await settle();
    expect(runtime.updateMetadata).toHaveBeenCalledTimes(1);

    // Hiding it again returns to the default layout; print leaves it out.
    await renderSheet(true);
    await toggle(row()!);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
    });
    await act(async () => window.dispatchEvent(new Event("beforeprint")));
    expect(row()).toBeUndefined();
    await act(async () => window.dispatchEvent(new Event("afterprint")));
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
  });

  it("opens the Sections menu under its trigger and closes it with Escape, outside clicks or Tab", async () => {
    await renderSheet(true);
    const trigger = sectionsTrigger()!;
    expect(trigger.querySelector(".icon")).not.toBeNull();
    expect(sectionsMenu()).toBeNull();
    await openSections();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(sectionsMenu()!.id);
    // Focus moves into the menu, to its first checkbox.
    expect(document.activeElement).toBe(sectionCheckbox("Overview"));

    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(sectionsMenu()).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    await openSections();
    await act(async () =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(sectionsMenu()).toBeNull();

    await openSections();
    // Tab moves between its checkboxes; leaving the menu closes it.
    const inside = sectionCheckbox("Session notes")!;
    await act(async () =>
      sectionCheckbox("Play scratchpad")!.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: inside }),
      ),
    );
    expect(sectionsMenu()).not.toBeNull();
    await act(async () =>
      inside.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: container.querySelector("[data-sheet-reset-trigger]"),
        }),
      ),
    );
    expect(sectionsMenu()).toBeNull();
    expect(runtime.updateMetadata).not.toHaveBeenCalled();
  });

  it("lists every section in print order, each an ordinary checkbox", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: { version: 1, hiddenSections: ["reference:rituals"] },
    };
    await renderSheet(true);
    await openSections();
    const rows = [...sectionsMenu()!.querySelectorAll("label")].map(
      (label) => ({
        name: label.querySelector("span")?.textContent,
        checked: label.querySelector("input")?.checked,
        disabled: label.querySelector("input")?.disabled,
      }),
    );
    expect(rows.map(({ name }) => name)).toEqual([
      "Overview",
      "Play scratchpad",
      "Feature reference",
      "Item reference",
      "Power index",
      "Rituals & practices",
      "Character profile",
      "Power & item cards",
      "Session notes",
    ]);
    // No locked rows, even for a section that prints nothing for this
    // character (no rituals).
    for (const row of rows) {
      expect(row.disabled, row.name).toBe(false);
      expect(row.checked, row.name).toBe(row.name !== "Rituals & practices");
    }
    expect(sectionsMenu()!.querySelector(".sheet-pages-hint")).toBeNull();
    await tick("Rituals & practices");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
    });
  });

  it("drops page 1 and its continuations when the summary is hidden, renumbering from 1", async () => {
    await renderSheet(true);
    expect(container.querySelector(".sp-identity")).not.toBeNull();
    const firstCardPage = Number(pageNumber(".print-card-page"));
    expect(firstCardPage).toBeGreaterThan(1);
    await openSections();
    await tick("Overview");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, hiddenSections: ["summary"] },
    });
    expect(container.querySelector(".sp-identity")).toBeNull();
    expect(Number(pageNumber(".print-card-page"))).toBe(firstCardPage - 1);

    // A cards-only sheet starts its card pages at page 1; with the cards
    // hidden too the preview is simply empty, with no notice.
    for (const label of [
      "Play scratchpad",
      "Feature reference",
      "Item reference",
      "Power index",
      "Rituals & practices",
      "Character profile",
      "Session notes",
    ])
      await tick(label);
    expect(
      container.querySelectorAll(".sheet-overview .ov-page-number"),
    ).toHaveLength(0);
    expect(pageNumber(".print-card-page")).toBe("1");
    for (
      let shown = container.querySelector<HTMLElement>(
        '.sheet-card-edit[aria-pressed="false"]',
      );
      shown !== null;
      shown = container.querySelector<HTMLElement>(
        '.sheet-card-edit[aria-pressed="false"]',
      )
    )
      await toggle(shown);
    await act(async () => window.dispatchEvent(new Event("beforeprint")));
    expect(
      container.querySelectorAll(".sp-paper, .print-card-page"),
    ).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => window.dispatchEvent(new Event("afterprint")));
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
  });

  it("hides and shows sections from the Sections menu without re-evaluating, saving silently", async () => {
    await renderSheet(true);
    expect(pageText("Play scratchpad")).toContain("Arc Strike");
    expect(pageText("Session notes")).not.toBe("");
    await openSections();
    await tick("Play scratchpad");
    // The menu stays open for the next pick; the section's pages are gone,
    // with no placeholder left behind.
    expect(sectionsMenu()).not.toBeNull();
    expect(sectionCheckbox("Play scratchpad")?.checked).toBe(false);
    expect(pageText("Play scratchpad")).toBe("");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, hiddenSections: ["scratchpad"] },
    });
    await tick("Session notes");
    expect(pageText("Session notes")).toBe("");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        hiddenSections: ["scratchpad", "session-notes"],
      },
    });
    await tick("Play scratchpad");
    await tick("Session notes");
    expect(pageText("Play scratchpad")).toContain("Arc Strike");
    expect(pageText("Session notes")).not.toBe("");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bSaved\b/);
  });

  it("arms, then confirms, a reset to the default sheet", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: { version: 1, hiddenSections: ["session-notes"] },
    };
    await renderSheet(true);
    expect(pageText("Session notes")).toBe("");
    const reset = () =>
      container.querySelector<HTMLButtonElement>("[data-sheet-reset-trigger]")!;
    expect(reset().disabled).toBe(false);
    await act(async () => reset().click());
    expect(reset().textContent).toBe("Confirm reset");
    expect(reset().getAttribute("aria-label")).toBe(
      "Confirm resetting the sheet layout",
    );
    expect(runtime.updateMetadata).not.toHaveBeenCalled();
    await act(async () => reset().click());
    await settle();
    expect(pageText("Session notes")).not.toBe("");
    expect(runtime.updateMetadata).toHaveBeenCalledWith("ada", {
      sheetLayout: null,
      itemCardsShown: { "holding-cloak": true },
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
  });
  it("hides every card page with the Power & item cards row", async () => {
    await renderSheet(true);
    expect(cardPageText()).toContain("Arc Strike");
    await openSections();
    await tick("Power & item cards");
    expect(container.querySelector(".print-card-page")).toBeNull();
    expect(container.querySelector(".sheet-card-edit")).toBeNull();
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, hiddenSections: ["cards"] },
    });
    // The power keeps its scratchpad row.
    expect(pageText("Play scratchpad")).toContain("Arc Strike");
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
  });

  it("moves a focused row with Alt+Up and Alt+Down, keeping focus on it", async () => {
    await renderSheet(true);
    await openSections();
    const cards = () => sectionCheckbox("Power & item cards")!;
    cards().focus();
    const press = async (key: "ArrowUp" | "ArrowDown", altKey = true) => {
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key, altKey, bubbles: true }),
        ),
      );
      await settle();
    };
    await press("ArrowUp", false);
    expect(runtime.updateMetadata).not.toHaveBeenCalled();
    await press("ArrowDown");
    expect(menuOrder().at(-1)).toBe("Power & item cards");
    expect(document.activeElement).toBe(cards());
    for (let step = 0; step < 9; step += 1) await press("ArrowUp");
    expect(menuOrder()[0]).toBe("Power & item cards");
    expect(document.activeElement).toBe(cards());
    expect(sectionsMenu()).not.toBeNull();
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        sectionOrder: [
          "cards",
          "summary",
          "scratchpad",
          "reference:features",
          "reference:items",
          "reference:power-index",
          "reference:rituals",
          "reference:profile",
          "session-notes",
        ],
      },
    });
    // The card pages now print first, from page 1, and the overview follows.
    expect(printedPages()[0]).toBe("cards");
    expect(pageNumber(".print-card-page")).toBe("1");
    expect(pageNumber('[aria-label="Character summary"]')).toBe("2");
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
  });

  it("reorders by dragging a row onto another, marking where it will drop", async () => {
    await renderSheet(true);
    await openSections();
    const row = (label: string) =>
      sectionCheckbox(label)!.closest<HTMLElement>(".sheet-sections-row")!;
    const handle = (label: string) =>
      row(label).querySelector<HTMLElement>(".sheet-sections-handle")!;
    // Only the grip drags, so the checkbox and copies field stay ordinary.
    expect(handle("Session notes").draggable).toBe(true);
    expect(row("Session notes").draggable).toBe(false);
    const cardsBefore = pageNumber(".print-card-page");
    expect(
      row("Session notes").querySelector(".sheet-sections-handle .icon"),
    ).not.toBeNull();
    const fire = async (target: Element, type: string, clientY = 0) => {
      await act(async () =>
        target.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, clientY }),
        ),
      );
    };
    await fire(handle("Session notes"), "dragstart");
    expect(row("Session notes").hasAttribute("data-dragging")).toBe(true);
    // jsdom rows have no height, so any pointer at or above y = 0 is the
    // target's top half: drop before it.
    await fire(row("Play scratchpad"), "dragover", 0);
    expect(row("Play scratchpad").getAttribute("data-drop")).toBe("before");
    await fire(row("Play scratchpad"), "dragover", 5);
    expect(row("Play scratchpad").getAttribute("data-drop")).toBe("after");
    await fire(row("Play scratchpad"), "dragover", 0);
    await fire(row("Play scratchpad"), "drop", 0);
    await settle();
    expect(menuOrder().slice(0, 3)).toEqual([
      "Overview",
      "Session notes",
      "Play scratchpad",
    ]);
    expect(container.querySelector("[data-drop], [data-dragging]")).toBeNull();
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        sectionOrder: [
          "summary",
          "session-notes",
          "scratchpad",
          "reference:features",
          "reference:items",
          "reference:power-index",
          "reference:rituals",
          "reference:profile",
          "cards",
        ],
      },
    });
    expect(printedPages().slice(0, 3)).toEqual([
      "Character summary",
      "Session notes",
      "Play scratchpad",
    ]);
    // Session notes and the scratchpad print unnumbered, so moving them
    // changes no page number.
    expect(pageNumber('[aria-label="Play scratchpad"]')).toBeUndefined();
    expect(pageNumber(".print-card-page")).toBe(cardsBefore);
  });

  it("moves a card by dragging it onto another, marking the drop edge, without re-evaluating", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
    };
    await renderSheet(true);
    const overlays = () => [
      ...container.querySelectorAll<HTMLElement>(".sheet-card-edit"),
    ];
    const order = () => overlays().map((overlay) => overlay.dataset.key);
    const byKey = (key: string) =>
      overlays().find((overlay) => overlay.dataset.key === key)!;
    const defaults = order();
    expect(defaults.slice(0, 2)).toEqual(["play:character", "play:skills"]);
    expect(defaults).toContain("power:id_arc_strike");
    expect(defaults.at(-1)).toBe("item:holding-cloak");
    expect(overlays().every((overlay) => overlay.draggable)).toBe(true);
    const fire = async (target: Element, type: string, clientX = 0) => {
      await act(async () =>
        target.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, clientX }),
        ),
      );
    };

    // A hidden card drags like any other and keeps its place among them.
    await fire(byKey("power:id_arc_strike"), "dragstart");
    expect(byKey("power:id_arc_strike").hasAttribute("data-dragging")).toBe(
      true,
    );
    // jsdom cards have no width, so x = 0 is the target's leading half
    // (drop before it) and any x > 0 its trailing half (drop after it).
    await fire(byKey("play:character"), "dragover", 0);
    expect(byKey("play:character").getAttribute("data-drop")).toBe("before");
    await fire(byKey("play:character"), "dragover", 5);
    expect(byKey("play:character").getAttribute("data-drop")).toBe("after");
    await fire(byKey("play:character"), "dragover", 0);
    await fire(byKey("play:character"), "drop", 0);
    await settle();
    const moved = [
      "power:id_arc_strike",
      ...defaults.filter((key) => key !== "power:id_arc_strike"),
    ];
    expect(order()).toEqual(moved);
    expect(container.querySelector("[data-drop], [data-dragging]")).toBeNull();
    expect(byKey("power:id_arc_strike").hasAttribute("data-hidden")).toBe(true);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        hiddenCards: ["power:id_arc_strike"],
        cardOrder: moved,
      },
    });

    // Play data drops after the last card.
    await fire(byKey("play:character"), "dragstart");
    await fire(byKey("item:holding-cloak"), "dragover", 5);
    await fire(byKey("item:holding-cloak"), "drop", 5);
    await settle();
    expect(order().at(-1)).toBe("play:character");

    // Dropping a card where it already is saves nothing.
    const saves = runtime.updateMetadata.mock.calls.length;
    await fire(byKey("play:skills"), "dragstart");
    await fire(byKey("power:id_arc_strike"), "dragover", 5);
    await fire(byKey("power:id_arc_strike"), "drop", 5);
    await fire(byKey("play:skills"), "dragstart");
    await fire(byKey("play:skills"), "drop", 0);
    await settle();
    expect(runtime.updateMetadata).toHaveBeenCalledTimes(saves);

    // A drag that is not one of ours is never accepted.
    const foreign = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => byKey("play:skills").dispatchEvent(foreign));
    expect(foreign.defaultPrevented).toBe(false);

    // View mode prints the shown cards in the new order; dragging back to
    // the default order stores no order at all.
    await renderSheet(false);
    const printed = [...container.querySelectorAll(".print-card-grid > *")];
    expect(printed[0]?.classList.contains("print-play-skills-card")).toBe(true);
    expect(printed.at(-1)?.classList.contains("print-play-character")).toBe(
      true,
    );
    expect(cardPageText()).not.toContain("Arc Strike");
    await renderSheet(true);
    await fire(byKey("power:id_arc_strike"), "dragstart");
    const after = defaults[defaults.indexOf("power:id_arc_strike") - 1]!;
    await fire(byKey(after), "drop", 5);
    await fire(byKey("play:character"), "dragstart");
    await fire(byKey("play:skills"), "drop", 0);
    await settle();
    expect(order()).toEqual(defaults);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("chains page numbers through a hidden, reordered layout and resets both", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: {
        version: 1,
        hiddenSections: ["summary"],
        sectionOrder: ["cards", "scratchpad", "summary"],
      },
    };
    await renderSheet(true);
    expect(printedPages()[0]).toBe("cards");
    expect(
      container.querySelector('[aria-label="Character summary"]'),
    ).toBeNull();
    expect(pageNumber(".print-card-page")).toBe("1");
    expect(pageNumber('[aria-label="Play scratchpad"]')).toBeUndefined();
    await openSections();
    // Missing ids follow the stored ones in default order.
    expect(menuOrder()).toEqual([
      "Power & item cards",
      "Play scratchpad",
      "Overview",
      "Feature reference",
      "Item reference",
      "Power index",
      "Rituals & practices",
      "Character profile",
      "Session notes",
    ]);
    expect(sectionCheckbox("Overview")?.checked).toBe(false);
    const reset = () =>
      container.querySelector<HTMLButtonElement>("[data-sheet-reset-trigger]")!;
    await act(async () => reset().click());
    await act(async () => reset().click());
    await settle();
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
      itemCardsShown: { "holding-cloak": true },
    });
    expect(printedPages()[0]).toBe("Character summary");
    expect(pageNumber('[aria-label="Character summary"]')).toBe("1");
    // The open menu follows the reset order.
    expect(menuOrder()[0]).toBe("Overview");
    expect(menuOrder().at(-2)).toBe("Power & item cards");
  });

  it("sets scratchpad and session notes copies with − / + or a typed number", async () => {
    await renderSheet(true);
    await openSections();
    const control = (name: string) =>
      sectionsMenu()!.querySelector<HTMLElement>(`[aria-label="${name}"]`);
    const field = () =>
      control("Copies of Play scratchpad") as HTMLInputElement;
    const papers = (title: string) =>
      container.querySelectorAll(`.sheet-overview > [aria-label="${title}"]`)
        .length;
    // Only the two repeatable sections have a stepper.
    expect(
      sectionsMenu()!.querySelectorAll(".sheet-sections-copies"),
    ).toHaveLength(2);
    expect(control("Copies of Overview")).toBeNull();
    expect(field().value).toBe("1");
    const fewer = control(
      "Fewer copies of Play scratchpad",
    ) as HTMLButtonElement;
    // Present at 1, but it cannot go lower (untick the row to print none).
    expect(fewer.disabled).toBe(true);
    const single = papers("Play scratchpad");
    await act(async () => control("More copies of Play scratchpad")!.click());
    await settle();
    expect(field().value).toBe("2");
    expect(fewer.disabled).toBe(false);
    expect(papers("Play scratchpad")).toBe(single * 2);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, sectionCopies: { scratchpad: 2 } },
    });

    // Typing saves a valid count at once; anything else reverts on blur.
    const type = async (value: string) => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      await act(async () => {
        setValue.call(field(), value);
        field().dispatchEvent(new Event("input", { bubbles: true }));
      });
      await settle();
    };
    await type("4");
    expect(papers("Play scratchpad")).toBe(single * 4);
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, sectionCopies: { scratchpad: 4 } },
    });
    const saves = runtime.updateMetadata.mock.calls.length;
    for (const bad of ["", "0", "2.5"]) {
      await type(bad);
      expect(runtime.updateMetadata.mock.calls.length, bad).toBe(saves);
    }
    await act(async () =>
      field().dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(field().value).toBe("4");

    await act(async () => control("More copies of Session notes")!.click());
    await act(async () => control("More copies of Session notes")!.click());
    await settle();
    expect(papers("Session notes")).toBe(3);
    // Copies take no page numbers, wherever the sections sit.
    expect(
      container.querySelector(
        '.sheet-overview > [aria-label="Play scratchpad"] .ov-page-number',
      ),
    ).toBeNull();
    // Hidden sections print no copies; showing them again keeps the count.
    await tick("Session notes");
    expect(papers("Session notes")).toBe(0);
    await tick("Session notes");
    expect(papers("Session notes")).toBe(3);
    await act(async () => fewer.click());
    await settle();
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        sectionCopies: { scratchpad: 3, "session-notes": 3 },
      },
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toMatch(/\bSaved\b/);

    // Reset restores one copy of each.
    const reset = () =>
      container.querySelector<HTMLButtonElement>("[data-sheet-reset-trigger]")!;
    await act(async () => reset().click());
    await act(async () => reset().click());
    await settle();
    expect(papers("Play scratchpad")).toBe(single);
    expect(papers("Session notes")).toBe(1);
    expect(field().value).toBe("1");
  });

  it("numbers only the numbered sections around copies in a custom order", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: {
        version: 1,
        sectionOrder: ["summary", "scratchpad", "cards", "session-notes"],
        sectionCopies: { scratchpad: 2, "session-notes": 2 },
      },
    };
    await renderSheet(false);
    // Overview 1, two unnumbered scratchpads, cards from 2, two unnumbered
    // session notes.
    expect(printedPages().slice(0, 4)).toEqual([
      "Character summary",
      "Play scratchpad",
      "Play scratchpad",
      "cards",
    ]);
    expect(pageNumber('[aria-label="Character summary"]')).toBe("1");
    expect(pageNumber(".print-card-page")).toBe("2");
    for (const title of ["Play scratchpad", "Session notes"])
      expect(
        container.querySelector(
          `.sheet-overview > [aria-label="${title}"] .ov-page-number`,
        ),
        title,
      ).toBeNull();
    expect(
      printedPages().filter((page) => page === "Session notes"),
    ).toHaveLength(2);
  });

  it("shows a failed save as an alert with a retry", async () => {
    runtime.updateMetadata = vi.fn(async () => {
      throw new Error("Storage is full");
    });
    await renderSheet(true);
    await toggle(cardTarget("Arc Strike"));
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Storage is full");
    runtime.updateMetadata = vi.fn(async () => runtime.record);
    await act(async () =>
      alert!.querySelector<HTMLButtonElement>("button")!.click(),
    );
    await settle();
    expect(runtime.updateMetadata).toHaveBeenCalledWith("ada", {
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
      itemCardsShown: { "holding-cloak": true },
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
