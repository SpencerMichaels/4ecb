// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedContentSource } from "@4ecb/content-domain";
import {
  buildCampaign,
  encodeCampaign,
  type CampaignDocument,
} from "@4ecb/content-pack";

import { campaignRows, removeDisabledReason } from "./campaign-settings-ui";
import type { AdvertisedCampaign } from "./runtime-content";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const storage = vi.hoisted(() => ({
  installed: [] as CampaignDocument[],
  members: { active: [], deleted: [] } as {
    active: { campaignId?: string }[];
    deleted: { campaignId?: string }[];
  },
  installEncoded: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@4ecb/browser-storage", () => ({
  CampaignRepository: class {
    list = () => Promise.resolve([...storage.installed]);
    installEncoded = storage.installEncoded;
    remove = storage.remove;
  },
  CharacterRepository: class {
    listMetadataPartitioned = () => Promise.resolve(storage.members);
  },
}));

const { CampaignSettings } = await import("./CampaignSettings");

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
  revision: number,
  campaignId = "synthetic-setting",
  name = "Synthetic Setting",
  description?: string,
): Promise<CampaignDocument> {
  return buildCampaign(
    {
      campaignId,
      name,
      ...(description === undefined ? {} : { description }),
      revision,
      restrictions: { ids: [], types: [] },
    },
    source,
    "",
  );
}

function hosted(document: CampaignDocument): AdvertisedCampaign {
  return {
    campaignId: document.campaignId,
    name: document.name,
    revision: document.revision,
    contentDigest: document.contentDigest,
    url: `https://localhost/private-packs/campaigns/${document.campaignId}.4ecc`,
  };
}

describe("campaign settings rows", () => {
  it("lists each campaign's newest revision with its members", async () => {
    const first = await campaign(1);
    const second = await campaign(2);
    const other = await campaign(1, "another", "Another Setting");
    const rows = campaignRows(
      [first, second, other],
      {
        active: [
          { campaignId: "synthetic-setting" },
          { campaignId: "synthetic-setting" },
          {},
        ],
        deleted: [{ campaignId: "another" }],
      },
      [hosted(first), hosted(other)],
    );
    expect(
      rows.map(({ name, revision, characters, trashed }) => [
        name,
        revision,
        characters,
        trashed,
      ]),
    ).toEqual([
      ["Another Setting", 1, 0, 1],
      ["Synthetic Setting", 2, 2, 0],
    ]);
    // A hosted campaign (any hosted revision, here an older one than the
    // installed revision 2) can't be removed: it would only come back.
    expect(removeDisabledReason(rows[0]!)).toBe(
      "Hosted by your group's server",
    );
    expect(removeDisabledReason(rows[1]!)).toBe(
      "Hosted by your group's server",
    );
    const imported = campaignRows(
      [second, other],
      {
        active: [{ campaignId: "synthetic-setting" }],
        deleted: [{ campaignId: "another" }],
      },
      [],
    );
    expect(removeDisabledReason(imported[0]!)).toMatch(/1 in the trash/);
    expect(removeDisabledReason(imported[1]!)).toMatch(/^1 character belongs/);
    expect(
      removeDisabledReason(
        campaignRows([first], { active: [], deleted: [] }, [])[0]!,
      ),
    ).toBeUndefined();
  });
});

describe("CampaignSettings", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onError = vi.fn();

  beforeEach(() => {
    // jsdom lays nothing out.
    Element.prototype.scrollIntoView ??= () => undefined;
    storage.installed = [];
    storage.members = { active: [], deleted: [] };
    storage.installEncoded.mockReset();
    storage.remove.mockReset().mockResolvedValue(1);
    onError.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(advertised: readonly AdvertisedCampaign[] = []) {
    await act(async () => {
      root.render(
        <CampaignSettings advertisedCampaigns={advertised} onError={onError} />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function importInput(): HTMLInputElement {
    return [
      ...container.querySelectorAll<HTMLInputElement>("input[type=file]"),
    ].find((candidate) =>
      candidate.closest("label")?.textContent?.includes("Import campaign…"),
    )!;
  }

  async function pick(file: File): Promise<void> {
    const input = importInput();
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function bodyRows(): HTMLTableRowElement[] {
    return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
  }

  function actions(row: HTMLTableRowElement): HTMLButtonElement[] {
    return [
      ...row.querySelectorAll<HTMLButtonElement>(".content-row-actions button"),
    ];
  }

  it("shows the empty state inside the table, with Import always present", async () => {
    await render();
    expect(
      [...container.querySelectorAll("thead th")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["Name", "Description", "Revision", "Characters", "Actions"]);
    expect(bodyRows().map(({ textContent }) => textContent)).toEqual([
      "No campaigns in this browser.",
    ]);
    expect(importInput()).toBeDefined();
    expect(importInput().accept).toContain(".4ecc");
  });

  it("imports a campaign file and lists it", async () => {
    const document = await campaign(1);
    storage.installEncoded.mockImplementation(async () => {
      storage.installed.push(document);
      return document;
    });
    await render();
    await pick(
      new File([encodeCampaign(document).slice().buffer], "setting.4ecc"),
    );
    expect(storage.installEncoded).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(
      bodyRows().map(({ cells }) => [...cells].map((cell) => cell.textContent)),
    ).toEqual([
      ["Synthetic Settingsynthetic-setting", "", "1", "0", "ExportRemove"],
    ]);
  });

  it("shows the DM's description in its own column", async () => {
    storage.installed = [
      await campaign(
        1,
        "synthetic-setting",
        "Synthetic Setting",
        "Setting gods replace the defaults.",
      ),
      await campaign(1, "another", "Another Setting"),
    ];
    await render();
    expect(
      [...container.querySelectorAll("thead th")].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual(["Name", "Description", "Revision", "Characters", "Actions"]);
    const descriptions = bodyRows().map(({ cells }) => cells[1]!);
    // A campaign without one has an empty cell.
    expect(descriptions[0]!.innerHTML).toBe("");
    // Clamped like the builder tables' Description column.
    expect(
      descriptions[1]!.querySelector(".selection-table-summary")?.textContent,
    ).toBe("Setting gods replace the defaults.");
  });

  it("reports an import the way pack import does", async () => {
    storage.installEncoded.mockRejectedValue(
      new Error("Invalid campaign: digest mismatch"),
    );
    await render();
    await pick(new File(["{}"], "broken.4ecc"));
    expect(onError).toHaveBeenCalledWith(
      new Error("Invalid campaign: digest mismatch"),
      "Couldn't import broken.4ecc",
    );
    await pick(new File(["{}"], "pack.4ecp"));
    expect(storage.installEncoded).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenLastCalledWith(
      new Error("Choose a .4ecc campaign file."),
      "Couldn't import pack.4ecp",
    );
  });

  it("enables Remove only for an unused, imported campaign", async () => {
    const used = await campaign(2, "used", "Used Setting");
    const free = await campaign(1, "free", "Free Setting");
    const group = await campaign(1, "group", "Group Setting");
    storage.installed = [used, free, group];
    storage.members = { active: [{ campaignId: "used" }], deleted: [] };
    await render([hosted(group)]);
    const [freeRow, groupRow, usedRow] = bodyRows();
    expect(usedRow?.cells[3]?.textContent).toBe("1");

    // No right-click menu: the row's actions are always-present buttons.
    expect(container.querySelector("[role=menu]")).toBeNull();
    const usedMenu = actions(usedRow!);
    expect(usedMenu.map(({ textContent }) => textContent)).toEqual([
      "Export",
      "Remove",
    ]);
    expect(usedMenu.map((item) => item.getAttribute("aria-disabled"))).toEqual([
      null,
      "true",
    ]);
    expect(usedMenu[1]?.title).toMatch(/^1 character belongs to it/);
    await act(async () => usedMenu[1]?.click());
    expect(container.querySelector(".content-change-review")).toBeNull();

    // The hosted campaign's Remove stays visible, inert, with the reason.
    const groupMenu = actions(groupRow!);
    expect(groupMenu.map(({ textContent }) => textContent)).toEqual([
      "Export",
      "Remove",
    ]);
    expect(groupMenu[0]?.getAttribute("aria-disabled")).toBeNull();
    expect(groupMenu[1]?.getAttribute("aria-disabled")).toBe("true");
    expect(groupMenu[1]?.title).toBe("Hosted by your group's server");
    await act(async () => groupMenu[1]?.click());
    expect(container.querySelector(".content-change-review")).toBeNull();

    const freeMenu = actions(freeRow!);
    expect(freeMenu.map((item) => item.getAttribute("aria-disabled"))).toEqual([
      null,
      null,
    ]);
    expect(freeMenu.map(({ title }) => title)).toEqual(["", ""]);
    await act(async () => freeMenu[1]?.click());
    expect(
      container.querySelector(".content-change-review")?.textContent,
    ).toContain("Remove Free Setting from this browser?");
    storage.remove.mockImplementation(async () => {
      storage.installed = [used, group];
      return 1;
    });
    const confirm = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".content-change-review button",
      ),
    ].find(({ textContent }) => textContent === "Remove")!;
    // Cancel closes the confirmation without removing.
    const cancel = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".content-change-review button",
      ),
    ].find(({ textContent }) => textContent === "Cancel")!;
    await act(async () => cancel.click());
    expect(container.querySelector(".content-change-review")).toBeNull();
    expect(storage.remove).not.toHaveBeenCalled();
    await act(async () => actions(bodyRows()[0]!)[1]?.click());
    const confirmAgain = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".content-change-review button",
      ),
    ].find(({ textContent }) => textContent === "Remove")!;
    expect(confirm.isConnected).toBe(false);
    await act(async () => {
      confirmAgain.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(storage.remove).toHaveBeenCalledWith("free");
    expect(bodyRows()).toHaveLength(2);
  });
});
