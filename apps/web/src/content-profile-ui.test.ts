import { describe, expect, it } from "vitest";

import type {
  ContentProfileLayer,
  InstalledContentPack,
} from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import {
  buildProfileLayerViews,
  movePersonalLayer,
  sameProfileLayers,
} from "./content-profile-ui";

const layers: readonly ContentProfileLayer[] = [
  { packId: "server", contentDigest: "server-digest" },
  { packId: "personal-a", contentDigest: "a-digest" },
  { packId: "personal-b", contentDigest: "b-digest" },
];

function manifest(
  packId: string,
  name: string,
  contentDigest: string,
): ContentPackManifest {
  return {
    formatVersion: 1,
    packId,
    name,
    contentDigest,
    gameSystem: "D&D4E",
    sourceKey: `${packId}.4ecp`,
    recordCount: 0,
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
}

describe("layered content profile UI", () => {
  it("distinguishes server baselines, personal overlays, and missing revisions", () => {
    const installed: readonly InstalledContentPack[] = [
      {
        manifest: manifest("server", "Campaign rules", "server-digest"),
        origin: "server",
      },
      {
        manifest: manifest("personal-a", "My homebrew", "a-digest"),
        origin: "personal",
      },
    ];

    expect(
      buildProfileLayerViews(layers, installed, new Set(["server"])),
    ).toEqual([
      expect.objectContaining({
        name: "Campaign rules",
        origin: "server",
        available: true,
      }),
      expect.objectContaining({
        name: "My homebrew",
        origin: "personal",
        available: true,
      }),
      expect.objectContaining({
        name: "personal-b",
        origin: "personal",
        available: false,
      }),
    ]);
  });

  it("reorders personal overlays without crossing the fixed server prefix", () => {
    expect(
      movePersonalLayer(layers, 2, -1, 1).map(({ packId }) => packId),
    ).toEqual(["server", "personal-b", "personal-a"]);
    expect(movePersonalLayer(layers, 1, -1, 1)).toEqual(layers);
    expect(movePersonalLayer(layers, 0, 1, 1)).toEqual(layers);
  });

  it("compares the complete ordered profile revision", () => {
    expect(sameProfileLayers(layers, [...layers])).toBe(true);
    expect(
      sameProfileLayers(layers, [layers[0]!, layers[2]!, layers[1]!]),
    ).toBe(false);
    expect(sameProfileLayers(layers, layers.slice(0, 2))).toBe(false);
  });
});
