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
const optionsButton = (label: string) =>
  container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const rightClick = (target: Element, clientX = 40, clientY = 60) => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  target.dispatchEvent(event);
  return event;
};
const cardOptions = (name: string) => optionsButton(`Card options for ${name}`);
const sectionOptions = (name: string) =>
  optionsButton(`Section options for ${name}`);
const openMenu = () =>
  document.body.querySelector<HTMLElement>('[role="menu"]');
const menuItems = () =>
  [
    ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].map((item) => item.textContent);
async function choose(overlay: HTMLElement | null, item: string) {
  expect(overlay, item).not.toBeNull();
  await act(async () => {
    rightClick(overlay!);
  });
  const target = [
    ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((entry) => entry.textContent === item);
  expect(target, item).toBeDefined();
  await act(async () => target!.click());
  await settle();
}
const showHiddenToggle = () =>
  [...container.querySelectorAll<HTMLInputElement>("input")].find(
    (input) => input.closest("label")?.textContent === "Show hidden",
  );

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

  it("offers View and Edit, with on-paper controls only in Edit", async () => {
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
    expect(showHiddenToggle()).toBeUndefined();
    await act(async () => modes[1]!.click());
    expect(onSheetModeChange).toHaveBeenLastCalledWith(true);

    await renderSheet(true);
    for (const name of ["Play data", "Skills", "Arc Strike", "Synthetic Cloak"])
      expect(cardOptions(name), name).not.toBeNull();
    const overlay = cardOptions("Arc Strike")!;
    expect(overlay.getAttribute("aria-haspopup")).toBe("menu");
    expect(overlay.getAttribute("aria-expanded")).toBe("false");
    expect(overlay.closest(".sheet-edit-target")?.className).toContain(
      "print-excluded",
    );
    // Overlays never sit inside the measured probe copies.
    expect(
      container.querySelector(".ov-measure .sheet-edit-target"),
    ).toBeNull();
    // Page 1 has no hide option; the optional sections all do.
    const sectionLabels = [
      ...container.querySelectorAll('[aria-label^="Section options for "]'),
    ].map((element) => element.getAttribute("aria-label"));
    expect(sectionLabels).toContain("Section options for Play scratchpad");
    expect(sectionLabels).toContain("Section options for Session notes");
    expect(sectionLabels.join()).not.toMatch(/summary/i);
    expect(showHiddenToggle()?.checked).toBe(false);
    const reset = container.querySelector<HTMLButtonElement>(
      "[data-sheet-reset-trigger]",
    );
    expect(reset?.getAttribute("aria-label")).toBe("Reset sheet to defaults");
    // Always present; disabled while the sheet is at its defaults.
    expect(reset?.disabled).toBe(true);
  });

  it("opens a card menu on right-click, or the keyboard, with no visible button", async () => {
    await renderSheet(true);
    const overlay = cardOptions("Arc Strike")!;
    // Like the legacy builder: right-click only, no per-card button.
    expect(overlay.querySelector("button")).toBeNull();
    expect(overlay.getAttribute("role")).toBe("button");
    expect(overlay.tabIndex).toBe(0);
    let event: MouseEvent | undefined;
    await act(async () => {
      event = rightClick(overlay);
    });
    expect(event?.defaultPrevented).toBe(true);
    const menu = openMenu();
    expect(menu?.getAttribute("aria-label")).toBe(
      "Card options for Arc Strike",
    );
    expect(overlay.getAttribute("aria-expanded")).toBe("true");
    expect(overlay.getAttribute("aria-controls")).toBe(menu?.id);
    expect(menuItems()).toEqual(["Hide card"]);
    expect(document.activeElement?.textContent).toBe("Hide card");
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(openMenu()).toBeNull();
    expect(document.activeElement).toBe(overlay);

    await act(async () => {
      rightClick(overlay);
    });
    // A click elsewhere closes it.
    await act(async () =>
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(openMenu()).toBeNull();

    for (const init of [
      { key: "F10", shiftKey: true },
      { key: "ContextMenu" },
    ]) {
      await act(async () =>
        overlay.dispatchEvent(
          new KeyboardEvent("keydown", { ...init, bubbles: true }),
        ),
      );
      expect(menuItems()).toEqual(["Hide card"]);
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );
    }
  });

  it("hides cards and sections from their menus without re-evaluating, saving silently", async () => {
    await renderSheet(true);
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(cardPageText()).toContain("Arc Strike");
    expect(cardPageText()).toContain("Synthetic Cloak");
    expect(pageText("Play scratchpad")).toContain("Arc Strike");

    await choose(cardOptions("Arc Strike"), "Hide card");
    await choose(cardOptions("Synthetic Cloak"), "Hide card");
    expect(cardPageText()).not.toContain("Arc Strike");
    expect(cardPageText()).not.toContain("Synthetic Cloak");
    // "Show hidden" is off, so hidden cards and their menus are gone.
    expect(cardOptions("Arc Strike")).toBeNull();
    // The power keeps its scratchpad usage row.
    expect(pageText("Play scratchpad")).toContain("Arc Strike");
    expect(runtime.updateMetadata).toHaveBeenNthCalledWith(1, "ada", {
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
    });
    // The item card is the holding's legacy flag.
    expect(runtime.updateMetadata).toHaveBeenNthCalledWith(2, "ada", {
      itemCardsShown: { "holding-cloak": false },
    });

    await choose(sectionOptions("Play scratchpad"), "Hide section");
    expect(pageText("Play scratchpad")).toBe("");
    expect(sectionOptions("Play scratchpad")).toBeNull();
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: {
        version: 1,
        hiddenSections: ["scratchpad"],
        hiddenCards: ["power:id_arc_strike"],
      },
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bSaved\b/);
  });

  it("reveals hidden cards and sections dimmed with Show hidden, never in print", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: {
        version: 1,
        hiddenCards: ["power:id_arc_strike"],
        hiddenSections: ["session-notes"],
      },
    };
    await renderSheet(true);
    expect(cardPageText()).not.toContain("Arc Strike");
    expect(container.querySelector(".sheet-hidden-section")).toBeNull();

    await act(async () => showHiddenToggle()!.click());
    expect(cardPageText()).toContain("Arc Strike");
    const overlay = cardOptions("Arc Strike")!.closest(".sheet-edit-target")!;
    expect(overlay.hasAttribute("data-hidden")).toBe(true);
    expect(overlay.textContent).toContain("Hidden");
    // An absolutely positioned grid item spans to the grid's edge unless
    // both lines are explicit, so each overlay covers exactly its card.
    for (const target of container.querySelectorAll<HTMLElement>(
      ".sheet-card-edit",
    )) {
      expect(target.style.gridColumn).toMatch(/^\d+ \/ span 1$/);
      expect(target.style.gridRow).toMatch(/^\d+ \/ span 1$/);
    }
    expect(
      cardOptions("Synthetic Cloak")
        ?.closest(".sheet-edit-target")
        ?.hasAttribute("data-hidden"),
    ).toBe(false);
    const placeholder = container.querySelector(".sheet-hidden-section");
    expect(placeholder?.textContent).toContain("Session notes");
    expect(placeholder?.textContent).toContain("Hidden");
    expect(pageText("Session notes")).toBe("");

    // Printing always omits hidden things and every edit control.
    await act(async () => window.dispatchEvent(new Event("beforeprint")));
    expect(cardPageText()).not.toContain("Arc Strike");
    expect(container.querySelector(".sheet-edit-target")).toBeNull();
    await act(async () => window.dispatchEvent(new Event("afterprint")));
    expect(cardPageText()).toContain("Arc Strike");

    await choose(cardOptions("Arc Strike"), "Show card");
    expect(
      cardOptions("Arc Strike")
        ?.closest(".sheet-edit-target")
        ?.hasAttribute("data-hidden"),
    ).toBe(false);
    await choose(sectionOptions("Session notes"), "Show section");
    expect(container.querySelector(".sheet-hidden-section")).toBeNull();
    expect(pageText("Session notes")).not.toBe("");
    expect(runtime.updateMetadata).toHaveBeenLastCalledWith("ada", {
      sheetLayout: null,
    });
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
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
    expect(reset().getAttribute("aria-label")).toBe(
      "Confirm resetting the sheet to defaults",
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
    await choose(cardOptions("Arc Strike"), "Hide card");
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
