// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as BrowserStorage from "@4ecb/browser-storage";
import type { ParsedContentSource } from "@4ecb/content-domain";
import {
  buildCampaign,
  type CampaignDocument,
  type CampaignRemovedRecordCount,
  type ContentPackManifest,
} from "@4ecb/content-pack";

import {
  campaignInviteIntro,
  campaignJoinState,
  campaignSummaryLines,
  contentTypeCount,
  contentTypePlural,
} from "./campaign-join-ui";
import type { AdvertisedCampaign } from "./runtime-content";
import type * as RuntimeContent from "./runtime-content";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const storage = vi.hoisted(() => ({
  installed: [] as CampaignDocument[],
  install: vi.fn(),
  download: vi.fn(),
  start: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@4ecb/browser-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof BrowserStorage>()),
  CampaignRepository: class {
    list = () => Promise.resolve([...storage.installed]);
    install = storage.install;
  },
  ContentPackRepository: class {
    get = () => Promise.resolve(undefined);
  },
}));
vi.mock("./runtime-content", async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeContent>()),
  downloadAdvertisedCampaign: storage.download,
}));
vi.mock("./create-character", () => ({ startNewCharacter: storage.start }));
vi.mock("./content-worker-client", () => ({
  countCampaignRemovedRecordsInWorker: storage.count,
}));

const { CampaignJoinPage } = await import("./CampaignJoinPage");

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

function campaign(revision: number): Promise<CampaignDocument> {
  return buildCampaign(
    {
      campaignId: "synthetic-setting",
      name: "Synthetic Setting",
      revision,
      restrictions: {
        ids: ["ID_A", "ID_B"],
        types: [{ type: "Deity", allow: "campaign-only" }],
      },
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

describe("campaign invite states", () => {
  it("tells installed, hosted, unknown and not-yet-known campaigns apart", async () => {
    const first = await campaign(1);
    const second = await campaign(2);
    const id = "synthetic-setting";
    expect(campaignJoinState(id, [], true, undefined).kind).toBe("looking-up");
    // The server's list hasn't loaded: not yet "unknown".
    expect(campaignJoinState(id, [], false, []).kind).toBe("looking-up");
    expect(campaignJoinState(id, [], true, []).kind).toBe("unknown");
    expect(campaignJoinState(id, [hosted(first)], true, [])).toEqual({
      kind: "available",
      advertised: hosted(first),
    });
    // An older installed revision: the hosted one can still be added.
    expect(campaignJoinState(id, [hosted(second)], true, [first])).toEqual({
      kind: "available",
      advertised: hosted(second),
      installedRevision: 1,
    });
    // This revision or a newer one installed; or only installed.
    for (const [advertised, installed] of [
      [[hosted(first)], [first]],
      [[hosted(first)], [second]],
      [[], [first]],
    ] as const)
      expect(campaignJoinState(id, advertised, false, installed).kind).toBe(
        "installed",
      );
  });

  it("introduces the campaign with the owner's wording", () => {
    expect(campaignInviteIntro("Golarion", undefined, 1)).toBe(
      "You're invited to Golarion. Join it to add campaign-specific content to your character builder, including house rules and content additions/changes. Your existing characters will remain unchanged. You can opt a character in to the new content and rules by selecting \"Golarion\" in the character's Details pane.",
    );
    expect(campaignInviteIntro("Golarion", 1, 2)).toMatch(
      /Details pane\. This browser has revision 1; this adds revision 2\.$/,
    );
  });

  it("names content types in plain plurals", () => {
    expect(
      [
        "Deity",
        "Language",
        "Class Feature",
        "Epic Destiny",
        "Hybrid Class",
        "Background Choice",
        "Gear",
      ].map(contentTypePlural),
    ).toEqual([
      "Deities",
      "Languages",
      "Class Features",
      "Epic Destinies",
      "Hybrid Classes",
      "Background options",
      "Gear items",
    ]);
    expect(contentTypeCount("Deity", 1)).toBe("1 deity");
    expect(contentTypeCount("Deity", 135)).toBe("135 deities");
    expect(contentTypeCount("Background Choice", 11)).toBe(
      "11 background options",
    );
    expect(contentTypeCount("Background Choice", 1)).toBe(
      "1 background option",
    );
  });

  it("summarizes revision, house rules and restrictions", async () => {
    const document_ = await campaign(3);
    const head = [
      { label: "Revision", value: "3" },
      { label: "House rules", value: "None" },
      { label: "Deities", value: "Fully replaces the originals" },
    ];
    // No active content to count over: no Removed line.
    expect(campaignSummaryLines(document_)).toEqual(head);
    expect(campaignSummaryLines(document_, { kind: "pending" })).toEqual([
      ...head,
      { label: "Removed", value: "Counting…", pending: true },
    ]);
    expect(
      campaignSummaryLines(document_, {
        kind: "counted",
        counts: [
          { type: "Deity", count: 135 },
          { type: "Language", count: 13 },
          { type: "Background Choice", count: 11 },
        ],
      }),
    ).toEqual([
      ...head,
      {
        label: "Removed",
        value: "135 deities, 13 languages, 11 background options",
      },
    ]);
    expect(
      campaignSummaryLines(document_, { kind: "counted", counts: [] }),
    ).toEqual([...head, { label: "Removed", value: "None" }]);
    const patched = await buildCampaign(
      {
        campaignId: "synthetic-setting",
        name: "Synthetic Setting",
        revision: 4,
        restrictions: { ids: [], types: [] },
        patches: [
          { id: "ID_A", field: "Languages", expect: "Common", value: "Elven" },
          { id: "ID_B", field: "name", expect: "B", value: "Bee" },
          {
            id: "ID_B",
            rule: {
              match: { name: "grant", attributes: { name: "ID_C" } },
              remove: true,
            },
          },
        ],
      },
      source,
      "",
    );
    // Nothing restricted: no Removed line even when counted.
    expect(
      campaignSummaryLines(patched, { kind: "counted", counts: [] }),
    ).toEqual([
      { label: "Revision", value: "4" },
      { label: "House rules", value: "None" },
      { label: "Changed fields", value: "2 fields" },
      { label: "Changed rules", value: "1 rule" },
    ]);
  });
});

describe("CampaignJoinPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    storage.installed = [];
    storage.install.mockReset();
    storage.download.mockReset();
    storage.start.mockReset();
    storage.count.mockReset();
    storage.count.mockResolvedValue([]);
    window.location.hash = "#/campaigns/join/synthetic-setting";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(
    advertised: readonly AdvertisedCampaign[],
    options: {
      advertisedLoaded?: boolean;
      activePackId?: string | undefined;
      activeManifest?: ContentPackManifest;
    } = {},
  ) {
    await act(async () => {
      root.render(
        <CampaignJoinPage
          campaignId="synthetic-setting"
          advertisedCampaigns={advertised}
          advertisedLoaded={options.advertisedLoaded ?? true}
          {...("activePackId" in options
            ? options.activePackId === undefined
              ? {}
              : { activePackId: options.activePackId }
            : { activePackId: "server.content" })}
          {...(options.activeManifest === undefined
            ? {}
            : { activeManifest: options.activeManifest })}
        />,
      );
    });
  }

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label,
    );

  it("previews a hosted campaign, adds it, then offers a new character in it", async () => {
    const document_ = await campaign(1);
    storage.download.mockResolvedValue(document_);
    storage.install.mockImplementation((installed: CampaignDocument) => {
      storage.installed.push(installed);
      return Promise.resolve(installed);
    });
    await render([hosted(document_)]);
    expect(container.querySelector("h2")?.textContent).toBe(
      "Join Synthetic Setting?",
    );
    expect(storage.download).toHaveBeenCalledWith(hosted(document_));
    expect(container.textContent).toContain(
      "You're invited to Synthetic Setting. Join it to add",
    );
    expect(container.textContent).toContain("Fully replaces the originals");
    // No active content in this render: nothing to count over.
    expect(container.textContent).not.toContain("Removed");
    expect(storage.count).not.toHaveBeenCalled();
    expect(button("Cancel")).toBeDefined();
    expect(container.textContent).not.toMatch(/Not now|Maybe later/);

    await act(async () => {
      button("Join campaign")!.click();
    });
    expect(storage.install).toHaveBeenCalledWith(document_);
    expect(container.textContent).toContain("Joined Synthetic Setting.");
    const create = button("New character in Synthetic Setting");
    expect(create).toBeDefined();

    storage.start.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      create!.click();
    });
    expect(storage.start).toHaveBeenCalledWith(
      expect.objectContaining({ activePackId: "server.content" }),
      document_,
    );
    // Busy while the campaign profile is composed.
    expect(button("Creating character…")?.disabled).toBe(true);
  });

  it("shows an installed campaign without fetching it again", async () => {
    const document_ = await campaign(2);
    storage.installed = [document_];
    await render([hosted(await campaign(1))], { advertisedLoaded: false });
    expect(storage.download).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Synthetic Setting is in this browser.",
    );
    expect(button("New character in Synthetic Setting")).toBeDefined();
  });

  it("keeps New character present but explained without game content", async () => {
    storage.installed = [await campaign(1)];
    await render([], { activePackId: undefined });
    const create = button("New character in Synthetic Setting")!;
    expect(create.getAttribute("aria-disabled")).toBe("true");
    expect(create.title).toMatch(/Turn on game content/);
    await act(async () => create.click());
    expect(storage.start).not.toHaveBeenCalled();
  });

  it("offers Try again when the hosted copy can't be read", async () => {
    const document_ = await campaign(1);
    storage.download.mockRejectedValueOnce(new Error("digest mismatch"));
    storage.download.mockResolvedValueOnce(document_);
    await render([hosted(document_)]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "digest mismatch",
    );
    await act(async () => button("Try again")!.click());
    expect(storage.download).toHaveBeenCalledTimes(2);
    expect(button("Join campaign")?.disabled).toBe(false);
  });

  it("explains an unknown campaign and leads back or to Settings", async () => {
    await render([]);
    expect(container.textContent).toContain("This campaign isn't available");
    const settings = container.querySelector('a[href="#/settings"]');
    expect(settings?.textContent).toBe("Settings → Campaigns");
    button("Back to characters")!.click();
    expect(window.location.hash).toBe("#/characters");
  });

  it("counts the removed records over the active content in the worker", async () => {
    const document_ = await campaign(1);
    storage.download.mockResolvedValue(document_);
    let finish: (counts: CampaignRemovedRecordCount[]) => void = () =>
      undefined;
    storage.count.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const manifest = {
      packId: "server.content",
      contentDigest: "server-digest",
    } as ContentPackManifest;
    await render([hosted(document_)], { activeManifest: manifest });
    expect(storage.count).toHaveBeenCalledWith(["server.content"], document_);
    // Pending without holding up the rest of the page.
    const removed = [...container.querySelectorAll("dt")].find(
      (term) => term.textContent === "Removed",
    );
    expect(removed?.nextElementSibling?.textContent).toBe("Counting…");
    expect(removed?.nextElementSibling?.getAttribute("aria-busy")).toBe("true");
    expect(button("Join campaign")?.disabled).toBe(false);
    await act(async () => {
      finish([
        { type: "Deity", count: 135 },
        { type: "Background Choice", count: 11 },
      ]);
    });
    expect(removed?.nextElementSibling?.textContent).toBe(
      "135 deities, 11 background options",
    );
    // Joining shows the same document: no second count.
    storage.install.mockImplementation((installed: CampaignDocument) => {
      storage.installed.push(installed);
      return Promise.resolve(installed);
    });
    await act(async () => button("Join campaign")!.click());
    expect(container.textContent).toContain("135 deities");
    expect(storage.count).toHaveBeenCalledTimes(1);
  });

  it("waits for the server's list before calling a campaign unknown", async () => {
    await render([], { advertisedLoaded: false });
    expect(container.textContent).toContain("Looking up the campaign…");
  });
});
