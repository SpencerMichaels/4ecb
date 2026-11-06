// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstalledContentPack } from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Switching content in the content table composes the profile off the page
// (profile-activation.ts); the table shows "Switching content…" meanwhile
// and a failure is a toast, as before.
const activation = vi.hoisted(() => ({
  activateContentProfile: vi.fn(),
}));

vi.mock("./profile-activation", () => activation);

vi.mock("@4ecb/browser-storage", () => ({
  CharacterRepository: class {
    listMetadataPartitioned = () =>
      Promise.resolve({ active: [], deleted: [] });
  },
  CampaignRepository: class {
    list = () => Promise.resolve([]);
  },
  ContentPackRepository: class {
    deactivate = () => Promise.resolve();
  },
}));

const { SettingsPage } = await import("./SettingsPage");

const noop = () => undefined;

const personal: InstalledContentPack = {
  manifest: {
    packId: "homebrew",
    contentDigest: "h1",
    name: "Homebrew",
  } as ContentPackManifest,
  origin: "personal",
};

describe("SettingsPage content switch", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChanged = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    activation.activateContentProfile.mockReset();
    onChanged.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <SettingsPage
          installedPacks={[personal]}
          advertisedPacks={[]}
          contentDownloads={{}}
          onChanged={onChanged}
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

  function toggle(): HTMLInputElement {
    return [
      ...container.querySelectorAll<HTMLInputElement>(
        ".content-row-toggle input",
      ),
    ][0]!;
  }

  function status(): string | undefined {
    return [...container.querySelectorAll("p.status")]
      .map((element) => element.textContent ?? "")
      .find((text) => text.startsWith("Switching"));
  }

  it("switches through the off-page activation and shows progress meanwhile", async () => {
    let finish: () => void = noop;
    activation.activateContentProfile.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await act(async () => {
      toggle().click();
      await Promise.resolve();
    });
    expect(activation.activateContentProfile).toHaveBeenCalledWith(
      expect.anything(),
      ["homebrew"],
    );
    expect(status()).toBe("Switching content…");
    expect(toggle().disabled).toBe(true);
    await act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onChanged).toHaveBeenCalled();
    expect(status()).toBeUndefined();
  });

  it("reports a failed switch as a toast", async () => {
    activation.activateContentProfile.mockRejectedValue(
      new Error("Missing content profile layer homebrew"),
    );
    await act(async () => {
      toggle().click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const toasts = container.querySelector(".toast-region")?.textContent;
    expect(toasts).toContain("Couldn't switch content");
    expect(toasts).toContain("Missing content profile layer homebrew");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
