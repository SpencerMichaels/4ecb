// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const storage = vi.hoisted(() => ({
  inspectBackup: vi.fn(),
  importCharacters: vi.fn(),
  listMetadataPartitioned: vi.fn(),
}));

vi.mock("@4ecb/browser-storage", () => ({
  CharacterRepository: class {
    inspectBackup = storage.inspectBackup;
    importCharacters = storage.importCharacters;
    listMetadataPartitioned = storage.listMetadataPartitioned;
  },
  CampaignRepository: class {},
  ContentPackRepository: class {},
}));
vi.mock("./use-library-summary", () => ({
  useLibrarySummary: () => undefined,
}));
vi.mock("./character-export", () => ({
  exportCharacterBackup: vi.fn(),
  exportCharacterDnd4e: vi.fn(),
  shareStoredCharacter: vi.fn(),
}));
vi.mock("./PwaUpdate", () => ({ UpdateButton: () => null }));

const { CharacterLibraryPage } = await import("./CharacterLibraryPage");

const lily = {
  id: "lily",
  title: "Lily",
  updatedAt: "2026-10-21T10:00:00.000Z",
};

function inspection(conflicting: readonly string[]) {
  return {
    version: 2,
    checksumVerified: true,
    characterCount: 1,
    activeCount: 1,
    trashedCount: 0,
    conflictingIds: conflicting,
    conflictingTitles: conflicting.map(() => "Lily"),
  };
}

const backup = {
  format: "4ecb-character-backup",
  version: 2,
  characters: [{ id: "lily" }],
};

/* A .4ecb file import (and so a received share, the same flow) asks before
 * touching a character already in the library. */
describe("library .4ecb import", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function close(
      this: HTMLDialogElement,
    ) {
      this.open = false;
    };
    storage.inspectBackup.mockReset();
    storage.importCharacters.mockReset().mockResolvedValue([{ id: "lily" }]);
    storage.listMetadataPartitioned
      .mockReset()
      .mockResolvedValue({ active: [], deleted: [lily] });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function settle(): Promise<void> {
    for (let index = 0; index < 6; index += 1)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
  }

  async function pick(): Promise<void> {
    act(() =>
      root.render(createElement(CharacterLibraryPage, { manifests: [] })),
    );
    await settle();
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([JSON.stringify(backup)], "Lily.4ecb", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
  }

  const dialog = () =>
    container.querySelector<HTMLDialogElement>("dialog[role=alertdialog]");
  const button = (label: string) =>
    [...dialog()!.querySelectorAll("button")].find(
      ({ textContent }) => textContent === label,
    )!;

  it("adds a package with no conflict at once", async () => {
    storage.inspectBackup.mockResolvedValue(inspection([]));
    await pick();
    expect(dialog()).toBeNull();
    expect(storage.importCharacters).toHaveBeenCalledWith(backup);
  });

  it("asks Replace / Keep both / Cancel for a character already there", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["lily"]));
    await pick();
    expect(storage.importCharacters).not.toHaveBeenCalled();
    expect(dialog()?.querySelector("h2")?.textContent).toBe("Import character");
    expect(dialog()?.querySelector(".restore-backup-body")?.textContent).toBe(
      "Lily is already in your library's trash.",
    );
    expect(
      [...dialog()!.querySelectorAll("footer button")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["Cancel", "Keep both", "Replace"]);
    expect(document.activeElement?.textContent).toBe("Cancel");

    act(() => button("Replace").click());
    await settle();
    expect(storage.importCharacters).toHaveBeenCalledWith(backup, {
      replaceExisting: true,
    });
    expect(dialog()).toBeNull();
  });

  it("keeps both, or nothing on Cancel", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["lily"]));
    await pick();
    act(() => button("Keep both").click());
    await settle();
    expect(storage.importCharacters).toHaveBeenCalledWith(backup, {
      replaceExisting: false,
    });

    storage.importCharacters.mockClear();
    await pick();
    act(() => button("Cancel").click());
    await settle();
    expect(storage.importCharacters).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
