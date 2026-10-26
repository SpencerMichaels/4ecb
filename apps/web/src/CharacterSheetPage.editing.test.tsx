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
const pagesTrigger = () =>
  [
    ...container.querySelectorAll<HTMLButtonElement>(
      ".print-preview-toolbar button",
    ),
  ].find((button) => button.textContent === "Pages");
const pagesMenu = () =>
  container.querySelector<HTMLElement>(
    '[role="group"][aria-label="Pages to print"]',
  );
const pageCheckbox = (label: string) =>
  [...(pagesMenu()?.querySelectorAll<HTMLInputElement>("input") ?? [])].find(
    (input) =>
      input.closest("label")?.querySelector("span")?.textContent === label,
  );
async function openPages() {
  await act(async () => pagesTrigger()!.click());
  expect(pagesMenu()).not.toBeNull();
}
async function tick(label: string) {
  const input = pageCheckbox(label);
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

  it("offers View and Edit, with card overlays and the Pages menu only in Edit", async () => {
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
    expect(pagesTrigger()).toBeUndefined();
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
    expect(pagesTrigger()?.getAttribute("aria-expanded")).toBe("false");
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
    // A plain click does nothing (left free for dragging cards later).
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

  it("opens the Pages menu under its trigger and closes it with Escape, outside clicks or Tab", async () => {
    await renderSheet(true);
    const trigger = pagesTrigger()!;
    expect(trigger.querySelector(".icon")).not.toBeNull();
    expect(pagesMenu()).toBeNull();
    await openPages();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(pagesMenu()!.id);
    // Focus moves into the menu, to its first checkbox.
    expect(document.activeElement).toBe(pageCheckbox("Page 1 summary"));

    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(pagesMenu()).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    await openPages();
    await act(async () =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(pagesMenu()).toBeNull();

    await openPages();
    // Tab moves between its checkboxes; leaving the menu closes it.
    const inside = pageCheckbox("Session notes")!;
    await act(async () =>
      pageCheckbox("Play scratchpad")!.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: inside }),
      ),
    );
    expect(pagesMenu()).not.toBeNull();
    await act(async () =>
      inside.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: container.querySelector("[data-sheet-reset-trigger]"),
        }),
      ),
    );
    expect(pagesMenu()).toBeNull();
    expect(runtime.updateMetadata).not.toHaveBeenCalled();
  });

  it("lists every section in print order, each an ordinary checkbox", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: { version: 1, hiddenSections: ["reference:rituals"] },
    };
    await renderSheet(true);
    await openPages();
    const rows = [...pagesMenu()!.querySelectorAll("label")].map((label) => ({
      name: label.querySelector("span")?.textContent,
      checked: label.querySelector("input")?.checked,
      disabled: label.querySelector("input")?.disabled,
    }));
    expect(rows.map(({ name }) => name)).toEqual([
      "Page 1 summary",
      "Play scratchpad",
      "Feature reference",
      "Item reference",
      "Power index",
      "Rituals & practices",
      "Character profile",
      "Session notes",
    ]);
    // No locked rows, even for a section that prints nothing for this
    // character (no rituals).
    for (const row of rows) {
      expect(row.disabled, row.name).toBe(false);
      expect(row.checked, row.name).toBe(row.name !== "Rituals & practices");
    }
    expect(pagesMenu()!.querySelector(".sheet-pages-hint")).toBeNull();
    await tick("Rituals & practices");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
    });
  });

  it("drops page 1 and its continuations when the summary is hidden, renumbering from 1", async () => {
    const pageNumber = (selector: string) =>
      container.querySelector(`${selector} .ov-page-number`)?.textContent;
    await renderSheet(true);
    expect(container.querySelector(".sp-identity")).not.toBeNull();
    const scratchpadDefault = Number(
      pageNumber('[aria-label="Play scratchpad"]'),
    );
    expect(scratchpadDefault).toBeGreaterThan(1);
    await openPages();
    await tick("Page 1 summary");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: { version: 1, hiddenSections: ["summary"] },
    });
    expect(container.querySelector(".sp-identity")).toBeNull();
    expect(pageNumber('[aria-label="Play scratchpad"]')).toBe("1");

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

  it("hides and shows sections from the Pages menu without re-evaluating, saving silently", async () => {
    await renderSheet(true);
    expect(pageText("Play scratchpad")).toContain("Arc Strike");
    expect(pageText("Session notes")).not.toBe("");
    await openPages();
    await tick("Play scratchpad");
    // The menu stays open for the next pick; the section's pages are gone,
    // with no placeholder left behind.
    expect(pagesMenu()).not.toBeNull();
    expect(pageCheckbox("Play scratchpad")?.checked).toBe(false);
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
