import { describe, expect, it } from "vitest";

import type { InstalledContentPack } from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import {
  contentRows,
  enabledLayers,
  layerKey,
  moveRow,
  replaceRow,
  sameProfileLayers,
  updateRow,
} from "./content-profile-ui";

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

const pack = (
  packId: string,
  name: string,
  origin: InstalledContentPack["origin"] = "personal",
): InstalledContentPack => ({
  manifest: manifest(packId, name, `${packId}-digest`),
  origin,
});
const layer = (packId: string) => ({
  packId,
  contentDigest: `${packId}-digest`,
});

const installed = [
  pack("homebrew", "My homebrew"),
  pack("rules", "Local rules"),
  pack("rules-b", "Local rules"),
  pack("group", "Group rules", "server"),
  pack("profile:x", "Combined", "profile"),
];

describe("game content table", () => {
  it("lists group content first, then active packs in order, then the rest", () => {
    const rows = contentRows(
      installed,
      [layer("group"), layer("rules"), layer("homebrew")],
      [layer("group")],
    );
    expect(rows.map(({ label, enabled }) => [label, enabled])).toEqual([
      ["Group rules", true],
      ["Local rules (rules)", true],
      ["My homebrew", true],
      ["Local rules (rules-b)", false],
    ]);
    expect(rows[0]?.advertised).toBe(true);
    expect(enabledLayers(rows)).toEqual([
      layer("group"),
      layer("rules"),
      layer("homebrew"),
    ]);
  });

  it("keeps a remembered order, including packs that are off", () => {
    const order = ["group", "rules-b", "homebrew", "rules"].map((id) =>
      layerKey(layer(id)),
    );
    const rows = contentRows(installed, [layer("rules")], [], order);
    expect(rows.map(({ packId }) => packId)).toEqual([
      "group",
      "rules-b",
      "homebrew",
      "rules",
    ]);
  });

  it("reorders, toggles, and replaces rows", () => {
    const rows = contentRows(
      installed,
      [layer("group"), layer("rules"), layer("homebrew")],
      [layer("group")],
    );
    expect(moveRow(rows, 2, 1).map(({ packId }) => packId)).toEqual([
      "group",
      "homebrew",
      "rules",
      "rules-b",
    ]);
    // Group content stays above imported packs.
    expect(moveRow(rows, 1, 0)).toEqual(rows);

    expect(
      enabledLayers(updateRow(rows, layer("homebrew"), { enabled: false })),
    ).toEqual([layer("group"), layer("rules")]);

    const replacement = rows[3];
    if (replacement === undefined) throw new Error("missing row");
    const replaced = replaceRow(rows, layer("rules"), replacement);
    expect(replaced.map(({ packId, enabled }) => [packId, enabled])).toEqual([
      ["group", true],
      ["rules-b", true],
      ["homebrew", true],
    ]);
  });

  it("compares layers", () => {
    expect(sameProfileLayers([layer("a")], [layer("a")])).toBe(true);
    expect(sameProfileLayers([layer("a")], [layer("b")])).toBe(false);
  });
});
