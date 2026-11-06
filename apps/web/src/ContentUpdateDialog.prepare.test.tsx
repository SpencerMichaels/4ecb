// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaignProfileDefinition } from "@4ecb/browser-storage";
import { newNativeCharacterRecord } from "@4ecb/character-domain";
import type { CampaignDocument, ContentPackManifest } from "@4ecb/content-pack";

import type { RulesRuntimeClient } from "./app-runtime";
import { campaignChangeTarget } from "./campaign-profile";
import { ContentUpdateDialog } from "./ContentUpdateDialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// While the campaign profile is composed in the content worker the dialog
// stays responsive and says what it is waiting for; the preview starts on
// the composed pack once the worker answers.
const campaign = {
  campaignId: "golarion",
  name: "Golarion",
  revision: 1,
  contentDigest: "doc",
  houseRules: {
    manifest: { packId: "campaign.golarion.r1", contentDigest: "rules" },
  },
} as unknown as CampaignDocument;

const manifest = {
  packId: "server",
  contentDigest: "server-digest",
  name: "Server content",
} as ContentPackManifest;

const definition: CampaignProfileDefinition = {
  profileId: "campaign:golarion",
  name: "Golarion",
  layers: [
    { packId: "server", contentDigest: "server-digest" },
    { packId: "campaign.golarion.r1", contentDigest: "rules" },
  ],
  resolutionPolicy: "last-pack-wins-v1",
  materializedPackId: "profile:campaign:golarion:abc",
  contentDigest: "composed",
  campaign: { campaignId: "golarion", revision: 1, contentDigest: "doc" },
};

describe("ContentUpdateDialog while a campaign is prepared", () => {
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
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows Preparing <campaign> until the worker answers", async () => {
    let finish: (value: CampaignProfileDefinition) => void = () => undefined;
    const materializer = vi.fn(
      () =>
        new Promise<CampaignProfileDefinition>((resolve) => {
          finish = resolve;
        }),
    );
    const target = campaignChangeTarget(
      campaign,
      { manifest, profile: undefined },
      materializer,
    )!;
    const previewProfileMigration = vi.fn(() => new Promise<never>(() => {}));
    const rulesClient = {
      previewProfileMigration,
      terminate: vi.fn(),
    } as unknown as RulesRuntimeClient;
    const character = newNativeCharacterRecord(
      "Valeros",
      { name: "1", type: "Level", definitionId: "ID_INTERNAL_LEVEL_1" },
      { packId: "server", contentDigest: "server-digest" },
      { id: "valeros", now: "2026-11-06T00:00:00.000Z" },
    );

    await act(async () => {
      root.render(
        createElement(ContentUpdateDialog, {
          character,
          target,
          rulesClient,
          onUpdated: () => undefined,
          onClose: () => undefined,
        }),
      );
    });
    expect(materializer).toHaveBeenCalledWith(["server"], campaign);
    expect(container.textContent).toContain("Preparing Golarion");
    expect(previewProfileMigration).not.toHaveBeenCalled();

    await act(async () => {
      finish(definition);
    });
    expect(previewProfileMigration).toHaveBeenCalledWith(
      character.build,
      "profile:campaign:golarion:abc",
      "server",
      "server-digest",
      expect.any(Function),
    );
  });
});
