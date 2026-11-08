import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readRuntimeConfig,
  updateRuntimeConfig,
  withAdvertisedPack,
} from "./runtime-config";

const pack = (packId: string) => ({
  packId,
  name: packId,
  contentDigest: "c".repeat(64),
  url: `/private-packs/${packId}-cccccccccccc.4ecp`,
});

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "4ecb-runtime-config-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("runtime-config.json", () => {
  it("starts a missing config from the public defaults", async () => {
    const path = join(directory, "runtime-config.json");
    expect(await readRuntimeConfig(path)).toEqual({});
    await updateRuntimeConfig(path, (config) =>
      withAdvertisedPack(config, pack("server")),
    );
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      relayUrl: null,
      defaultPackUrl: null,
      contentPacks: [pack("server")],
      features: { playMode: false, sessionRelay: false, characterShare: false },
    });
  });

  it("advertising a pack replaces contentPacks and keeps campaigns and other keys", async () => {
    const path = join(directory, "runtime-config.json");
    const campaigns = [
      {
        campaignId: "pathfinder",
        name: "Pathfinder",
        revision: 4,
        contentDigest: "d".repeat(64),
        url: "/private-packs/campaigns/pathfinder-dddddddddddd.4ecc",
      },
    ];
    await writeFile(
      path,
      JSON.stringify({
        relayUrl: "wss://relay.example",
        defaultPackUrl: null,
        contentPacks: [pack("old-build")],
        features: { playMode: true, sessionRelay: false },
        campaigns,
        operatorNote: "kept",
      }),
    );
    await updateRuntimeConfig(path, (config) =>
      withAdvertisedPack(config, pack("new-build")),
    );
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      relayUrl: "wss://relay.example",
      defaultPackUrl: null,
      contentPacks: [pack("new-build")],
      features: { playMode: true, sessionRelay: false },
      campaigns,
      operatorNote: "kept",
    });
  });

  it("refuses a config that is not a JSON object", async () => {
    const path = join(directory, "runtime-config.json");
    await writeFile(path, "[]");
    await expect(readRuntimeConfig(path)).rejects.toThrow(/JSON object/);
  });
});
