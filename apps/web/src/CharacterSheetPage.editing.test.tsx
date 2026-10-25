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
const checkbox = (name: string) =>
  [
    ...container.querySelectorAll<HTMLInputElement>(
      ".sheet-contents-panel input",
    ),
  ].find((input) => input.closest("label")?.textContent === name);
const cardPageText = () =>
  [...container.querySelectorAll(".print-card-page")]
    .map((page) => page.textContent)
    .join("\n");

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

  it("offers View and Edit in the preview toolbar, the panel only in Edit", async () => {
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
    expect(container.querySelector(".sheet-contents-panel")).toBeNull();
    await act(async () => modes[1]!.click());
    expect(onSheetModeChange).toHaveBeenLastCalledWith(true);

    await renderSheet(true);
    const panel = container.querySelector(".sheet-contents-panel");
    expect(panel?.getAttribute("aria-label")).toBe("Sheet contents");
    const page1 = checkbox("Page 1 summary");
    expect(page1?.checked).toBe(true);
    expect(page1?.disabled).toBe(true);
    for (const name of [
      "Play scratchpad",
      "Feature reference",
      "Item reference",
      "Power index",
      "Rituals & practices",
      "Character profile",
      "Session notes",
      "Play data",
      "Skills",
      "Arc Strike",
      "Synthetic Cloak",
    ])
      expect(checkbox(name)?.checked, name).toBe(true);
    // Controls stay present with an empty state when there is nothing.
    expect(panel?.textContent).toContain("No companion cards.");
    expect(
      container.querySelector('[aria-label="Show all companions"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Reset sheet to defaults"]'),
    ).not.toBeNull();
  });

  it("hides cards and sections without re-evaluating, saving silently", async () => {
    await renderSheet(true);
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(cardPageText()).toContain("Arc Strike");
    expect(cardPageText()).toContain("Synthetic Cloak");
    const scratchpad = () =>
      [...container.querySelectorAll('[aria-label="Play scratchpad"]')]
        .map((page) => page.textContent)
        .join("\n");
    expect(scratchpad()).toContain("Arc Strike");

    await act(async () => checkbox("Arc Strike")!.click());
    await act(async () => checkbox("Synthetic Cloak")!.click());
    await settle();
    expect(cardPageText()).not.toContain("Arc Strike");
    expect(cardPageText()).not.toContain("Synthetic Cloak");
    // The power keeps its scratchpad usage row.
    expect(scratchpad()).toContain("Arc Strike");
    expect(checkbox("Arc Strike")?.checked).toBe(false);
    expect(runtime.updateMetadata).toHaveBeenNthCalledWith(1, "ada", {
      sheetLayout: { version: 1, hiddenCards: ["power:id_arc_strike"] },
    });
    // The item card is the holding's legacy flag.
    expect(runtime.updateMetadata).toHaveBeenNthCalledWith(2, "ada", {
      itemCardsShown: { "holding-cloak": false },
    });

    await act(async () => checkbox("Play scratchpad")!.click());
    await settle();
    expect(scratchpad()).toBe("");
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toMatch(/\bSaved\b/);
  });

  it("arms, then confirms, a reset to the default sheet", async () => {
    runtime.record = {
      ...record(),
      sheetLayout: { version: 1, hiddenSections: ["session-notes"] },
    };
    await renderSheet(true);
    expect(checkbox("Session notes")?.checked).toBe(false);
    const reset = () =>
      container.querySelector<HTMLButtonElement>("[data-sheet-reset-trigger]")!;
    await act(async () => reset().click());
    expect(reset().getAttribute("aria-label")).toBe(
      "Confirm resetting the sheet to defaults",
    );
    expect(runtime.updateMetadata).not.toHaveBeenCalled();
    await act(async () => reset().click());
    await settle();
    expect(checkbox("Session notes")?.checked).toBe(true);
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
    await act(async () => checkbox("Arc Strike")!.click());
    await settle();
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
