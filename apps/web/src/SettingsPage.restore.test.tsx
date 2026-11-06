// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  naturalList,
  restoreConflictText,
  restoreSuccessText,
} from "./RestoreBackupDialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const storage = vi.hoisted(() => ({
  inspectBackup: vi.fn(),
  restoreBackup: vi.fn(),
  restoreBackupKeepingBoth: vi.fn(),
}));

vi.mock("@4ecb/browser-storage", () => ({
  CharacterRepository: class {
    inspectBackup = storage.inspectBackup;
    restoreBackup = storage.restoreBackup;
    restoreBackupKeepingBoth = storage.restoreBackupKeepingBoth;
    listMetadataPartitioned = () =>
      Promise.resolve({ active: [], deleted: [] });
  },
  CampaignRepository: class {
    list = () => Promise.resolve([]);
  },
  ContentPackRepository: class {},
}));

const { SettingsPage } = await import("./SettingsPage");

const noop = () => undefined;

function inspection(conflictingTitles: readonly string[]) {
  return {
    version: 2,
    checksumVerified: true,
    characterCount: 4,
    activeCount: 4,
    trashedCount: 0,
    conflictingIds: conflictingTitles.map((_, index) => `id-${index}`),
    conflictingTitles,
  };
}

const backup = { format: "4ecb-character-backup", version: 2, characters: [] };

describe("SettingsPage backup restore", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
    };
    storage.inspectBackup.mockReset();
    storage.restoreBackup.mockReset().mockResolvedValue(4);
    storage.restoreBackupKeepingBoth.mockReset().mockResolvedValue(4);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <SettingsPage
          installedPacks={[]}
          advertisedPacks={[]}
          contentDownloads={{}}
          onChanged={() => Promise.resolve()}
          onRetryAdvertised={() => Promise.resolve()}
          theme="system"
          onThemeChange={noop}
          hideFlavortext={false}
          onHideFlavortextChange={noop}
          showEntitySource={false}
          onShowEntitySourceChange={noop}
          countCoinWeight={false}
          onCountCoinWeightChange={noop}
          mergeFunds={false}
          onMergeFundsChange={noop}
          matchContentByName={false}
          onMatchContentByNameChange={noop}
          resolveAbilityChoices={false}
          onResolveAbilityChoicesChange={noop}
          proficientEquipmentOnly={false}
          onProficientEquipmentOnlyChange={noop}
          abbreviateAbilityValues={false}
          onAbbreviateAbilityValuesChange={noop}
          printCardTextSize={8}
          onPrintCardTextSizeChange={noop}
          paperSize="letter"
          onPaperSizeChange={noop}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function pick(text: string, name = "backup.json"): Promise<void> {
    const input = [
      ...container.querySelectorAll<HTMLInputElement>("input[type=file]"),
    ].find((candidate) =>
      candidate.closest("label")?.textContent?.includes("Restore backup"),
    )!;
    const file = new File([text], name, { type: "application/json" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function dialog(): HTMLDialogElement | null {
    return container.querySelector(".restore-backup-dialog");
  }

  function button(label: string): HTMLButtonElement {
    return [
      ...(dialog()?.querySelectorAll<HTMLButtonElement>("footer button") ?? []),
    ].find((candidate) => candidate.textContent === label)!;
  }

  async function click(target: HTMLButtonElement): Promise<void> {
    await act(async () => {
      target.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function confirmation(): HTMLParagraphElement | undefined {
    return [
      ...container.querySelectorAll<HTMLParagraphElement>("p.status"),
    ].find((candidate) => candidate.textContent?.startsWith("Restored"));
  }

  function announced(): string | null | undefined {
    return container.querySelector("main > p[aria-live=polite]")?.textContent;
  }

  it("restores at once, with no dialog, when nothing conflicts, and confirms it", async () => {
    storage.inspectBackup.mockResolvedValue(inspection([]));
    await pick(JSON.stringify(backup));
    expect(storage.inspectBackup).toHaveBeenCalledWith(backup);
    expect(storage.restoreBackup).toHaveBeenCalledWith(backup);
    expect(dialog()).toBeNull();
    expect(container.querySelector(".toast-region")?.textContent).toBe("");
    expect(container.textContent).not.toContain("Restore preview");
    // The characters land in the library, not here, so success is stated.
    expect(confirmation()?.textContent).toBe(
      "Restored 4 characters. Open library",
    );
    expect(confirmation()?.querySelector("a")?.getAttribute("href")).toBe(
      "#/characters",
    );
    expect(announced()).toBe("Restored 4 characters.");
  });

  it("confirms a restore after the player chooses, and clears it on the next pick", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["Lily"]));
    storage.restoreBackupKeepingBoth.mockResolvedValue(1);
    await pick(JSON.stringify(backup));
    expect(confirmation()).toBeUndefined();
    await click(button("Keep both"));
    expect(confirmation()?.textContent).toBe(
      "Restored 1 character. Open library",
    );
    await pick(JSON.stringify(backup));
    expect(confirmation()).toBeUndefined();
    expect(announced()).toBe("");
  });

  it("names the library's conflicting characters and offers three choices", async () => {
    storage.inspectBackup.mockResolvedValue(
      inspection(["Lily", "Beatrix", "Hu"]),
    );
    await pick(JSON.stringify(backup));
    expect(storage.restoreBackup).not.toHaveBeenCalled();
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector("h2")?.textContent).toBe("Restore backup");
    expect(dialog()?.querySelector("#restore-backup-text")?.textContent).toBe(
      "3 characters in this backup are already in your library: Lily, Beatrix and Hu.",
    );
    expect(
      [...dialog()!.querySelectorAll("footer button")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["Cancel", "Keep both", "Replace them"]);
    expect(document.activeElement).toBe(button("Cancel"));
  });

  it("Replace restores over the library", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["Lily"]));
    await pick(JSON.stringify(backup));
    await click(button("Replace it"));
    expect(storage.restoreBackup).toHaveBeenCalledWith(backup);
    expect(storage.restoreBackupKeepingBoth).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("Keep both restores alongside the library", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["Lily", "Hu"]));
    await pick(JSON.stringify(backup));
    await click(button("Keep both"));
    expect(storage.restoreBackupKeepingBoth).toHaveBeenCalledWith(backup);
    expect(storage.restoreBackup).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("Cancel and Esc change nothing", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["Lily", "Hu"]));
    await pick(JSON.stringify(backup));
    await click(button("Cancel"));
    expect(dialog()).toBeNull();

    await pick(JSON.stringify(backup));
    await act(async () => {
      dialog()!.dispatchEvent(new Event("cancel", { cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(dialog()).toBeNull();
    expect(storage.restoreBackup).not.toHaveBeenCalled();
    expect(storage.restoreBackupKeepingBoth).not.toHaveBeenCalled();
  });

  it("shows an error and writes nothing for an unreadable or invalid file", async () => {
    await pick("{not json", "broken.json");
    expect(container.querySelector(".toast-region")?.textContent).toContain(
      "Couldn't read broken.json",
    );
    storage.inspectBackup.mockRejectedValue(
      new Error("Character backup checksum verification failed"),
    );
    await pick(JSON.stringify(backup), "tampered.json");
    expect(container.querySelector(".toast-region")?.textContent).toContain(
      "Character backup checksum verification failed",
    );
    expect(dialog()).toBeNull();
    expect(storage.restoreBackup).not.toHaveBeenCalled();
  });

  it("reports a failed restore after the player chooses", async () => {
    storage.inspectBackup.mockResolvedValue(inspection(["Lily"]));
    storage.restoreBackupKeepingBoth.mockRejectedValue(new Error("Disk full"));
    await pick(JSON.stringify(backup));
    await click(button("Keep both"));
    expect(container.querySelector(".toast-region")?.textContent).toContain(
      "Couldn't restore the backup",
    );
    expect(confirmation()).toBeUndefined();
  });
});

describe("restore conflict text", () => {
  it("joins names naturally, singular for one", () => {
    expect(naturalList(["Lily"])).toBe("Lily");
    expect(naturalList(["Lily", "Hu"])).toBe("Lily and Hu");
    expect(restoreConflictText(["Lily"])).toBe(
      "1 character in this backup is already in your library: Lily.",
    );
  });

  it("states how many characters were restored, and how many to the trash", () => {
    expect(restoreSuccessText(1)).toBe("Restored 1 character.");
    expect(restoreSuccessText(23)).toBe("Restored 23 characters.");
    expect(restoreSuccessText(23, 3)).toBe(
      "Restored 23 characters (3 to the trash).",
    );
  });
});
