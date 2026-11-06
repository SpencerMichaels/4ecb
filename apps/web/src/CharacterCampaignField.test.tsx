// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as BrowserStorage from "@4ecb/browser-storage";
import type { ParsedContentSource } from "@4ecb/content-domain";
import { buildCampaign, type CampaignDocument } from "@4ecb/content-pack";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const storage = vi.hoisted(() => ({
  installed: [] as CampaignDocument[],
}));

vi.mock("@4ecb/browser-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof BrowserStorage>()),
  CampaignRepository: class {
    list = () => Promise.resolve([...storage.installed]);
  },
}));

const { CharacterCampaignField, campaignOptions } =
  await import("./CharacterCampaignField");

const source: ParsedContentSource = {
  gameSystem: "D&D4E",
  sourceKey: "house-rules.xml",
  entities: [],
  rejected: [],
  rawTopLevel: [],
  diagnostics: [],
  accounting: {
    topLevelRecords: 0,
    acceptedRecords: 0,
    warnedRecords: 0,
    rejectedRecords: 0,
    rawTopLevelElements: 0,
  },
};

function campaign(
  campaignId: string,
  name: string,
  revision = 1,
): Promise<CampaignDocument> {
  return buildCampaign(
    { campaignId, name, revision, restrictions: { ids: [], types: [] } },
    source,
    "",
  );
}

describe("campaign options", () => {
  it("lists None, then each campaign's newest revision by name", async () => {
    const zeta1 = await campaign("zeta", "Zeta");
    const zeta2 = await campaign("zeta", "Zeta", 2);
    const alpha = await campaign("alpha", "Alpha");
    const options = campaignOptions([zeta1, alpha, zeta2], undefined);
    expect(options.map(({ label }) => label)).toEqual([
      "None",
      "Alpha",
      "Zeta",
    ]);
    expect(options[2]?.campaign).toBe(zeta2);
    // The character's campaign stays shown when it isn't installed.
    expect(campaignOptions([alpha], "gone").at(-1)).toEqual({
      value: "gone",
      label: "gone (not in this browser)",
      missing: true,
    });
  });
});

describe("CharacterCampaignField", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    storage.installed = [];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(
    campaignId: string | undefined,
    onChoose: (campaign: CampaignDocument | undefined) => void,
    disabledReason?: string,
  ) {
    await act(async () => {
      root.render(
        <CharacterCampaignField
          campaignId={campaignId}
          disabledReason={disabledReason}
          onChoose={onChoose}
        />,
      );
    });
  }

  function choose(value: string) {
    const select = container.querySelector("select")!;
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("stays present with a hint when no campaigns are installed", async () => {
    await render(undefined, vi.fn());
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect([...select!.options].map(({ text }) => text)).toEqual(["None"]);
    expect(container.textContent).toContain("No campaigns in this browser.");
    expect(container.querySelector('a[href="#/settings"]')?.textContent).toBe(
      "Settings → Campaigns",
    );
  });

  it("asks to move the character and keeps showing its campaign until it has", async () => {
    const alpha = await campaign("alpha", "Alpha");
    storage.installed = [alpha];
    const onChoose = vi.fn();
    await render(undefined, onChoose);
    expect(container.textContent).not.toContain("No campaigns");
    choose("alpha");
    expect(onChoose).toHaveBeenCalledWith(alpha);
    // Controlled: the select reflects the move only once it is made.
    expect(container.querySelector("select")!.value).toBe("");

    onChoose.mockClear();
    await render("alpha", onChoose);
    expect(container.querySelector("select")!.value).toBe("alpha");
    choose("");
    expect(onChoose).toHaveBeenCalledWith(undefined);
    expect(container.querySelector("select")!.value).toBe("alpha");
  });

  it("is disabled, with the reason, without game content", async () => {
    await render(undefined, vi.fn(), "Turn on game content");
    const select = container.querySelector("select")!;
    expect(select.disabled).toBe(true);
    expect(select.title).toBe("Turn on game content");
  });
});
