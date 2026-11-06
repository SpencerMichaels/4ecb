import { describe, expect, it, vi } from "vitest";

import type { ContentProfileDefinition } from "@4ecb/browser-storage";
import type { ParsedContentSource, ContentEntity } from "@4ecb/content-domain";
import {
  buildCampaign,
  type CampaignDocument,
  type ContentPackManifest,
} from "@4ecb/content-pack";

import { characterDraft } from "./character-drafts";
import { newCharacter, startNewCharacter } from "./create-character";

const manifest: ContentPackManifest = {
  formatVersion: 1,
  packId: "server.content",
  name: "Server content",
  contentDigest: "a".repeat(64),
  gameSystem: "D&D4E",
  sourceKey: "server",
  recordCount: 1,
  typeCounts: [],
  accounting: {
    topLevelRecords: 0,
    acceptedRecords: 0,
    warnedRecords: 0,
    rejectedRecords: 0,
    rawTopLevelElements: 0,
  },
  diagnosticCounts: { error: 0, warning: 0, info: 0 },
};

const level1: ContentEntity = {
  id: "ID_INTERNAL_LEVEL_1",
  name: "1",
  type: "Level",
  source: "Synthetic",
  sources: ["Synthetic"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
};

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

function campaign(): Promise<CampaignDocument> {
  return buildCampaign(
    {
      campaignId: "synthetic-setting",
      name: "Synthetic Setting",
      revision: 1,
      restrictions: { ids: [], types: [] },
    },
    source,
    "",
  );
}

const content = {
  activePackId: "server.content",
  activeProfile: undefined,
  loadPack: () => Promise.resolve({ manifest, entities: [level1] }),
};

describe("new characters", () => {
  it("starts on the active content, unchanged by campaigns", async () => {
    const record = await newCharacter(content);
    expect(record.profileBinding).toEqual({
      packId: "server.content",
      contentDigest: manifest.contentDigest,
    });
    const profile: ContentProfileDefinition = {
      profileId: "active",
      name: "Active",
      layers: [{ packId: "server.content", contentDigest: "a".repeat(64) }],
      resolutionPolicy: "last-pack-wins-v1",
      materializedPackId: "profile:active:1",
      contentDigest: "c".repeat(64),
    } as unknown as ContentProfileDefinition;
    expect(
      (await newCharacter({ ...content, activeProfile: profile }))
        .profileBinding,
    ).toMatchObject({ packId: "profile:active:1", layers: profile.layers });
  });

  it("starts in a campaign on its composed profile", async () => {
    const document_ = await campaign();
    const overlay = {
      packId: document_.houseRules.manifest.packId,
      contentDigest: document_.houseRules.manifest.contentDigest,
    };
    const materializer = vi.fn(() =>
      Promise.resolve({
        profileId: "campaign:synthetic-setting",
        name: "Synthetic Setting",
        layers: [
          { packId: "server.content", contentDigest: manifest.contentDigest },
          overlay,
        ],
        resolutionPolicy: "last-pack-wins-v1" as const,
        materializedPackId: "profile:campaign:synthetic-setting:x",
        contentDigest: "d".repeat(64),
        updatedAt: "2026-11-06T00:00:00.000Z",
        campaign: {
          campaignId: document_.campaignId,
          revision: document_.revision,
          contentDigest: document_.contentDigest,
        },
      }),
    );
    const record = await newCharacter({ ...content, materializer }, document_);
    // The campaign layer goes on the active content's layers.
    expect(materializer).toHaveBeenCalledWith(["server.content"], document_);
    expect(record.profileBinding).toMatchObject({
      packId: "profile:campaign:synthetic-setting:x",
      contentDigest: "d".repeat(64),
      campaign: {
        campaignId: "synthetic-setting",
        revision: 1,
        contentDigest: document_.contentDigest,
      },
    });
    expect(record.build.levels[0]?.root.identity.definitionId).toBe(
      "ID_INTERNAL_LEVEL_1",
    );
  });

  it("holds the new character as a draft and opens it in the builder", async () => {
    const navigate = vi.fn();
    const record = await startNewCharacter(content, undefined, navigate);
    expect(characterDraft(record.id)).toBe(record);
    expect(navigate).toHaveBeenCalledWith(
      `#/characters/${encodeURIComponent(record.id)}/edit?tab=build`,
    );
  });

  it("refuses without active content", async () => {
    await expect(
      newCharacter({ ...content, activePackId: undefined }),
    ).rejects.toThrow("Activate a content profile");
  });
});
