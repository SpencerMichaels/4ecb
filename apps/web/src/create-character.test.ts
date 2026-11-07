import { describe, expect, it, vi } from "vitest";

import type { ContentProfileDefinition } from "@4ecb/browser-storage";
import type { ContentEntity } from "@4ecb/content-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";

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

const content = {
  activePackId: "server.content",
  activeProfile: undefined,
  loadPack: () => Promise.resolve({ manifest, entities: [level1] }),
};

describe("new characters", () => {
  it("starts on the active content", async () => {
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

  it("holds the new character as a draft and opens it in the builder", async () => {
    const navigate = vi.fn();
    const record = await startNewCharacter(content, navigate);
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
