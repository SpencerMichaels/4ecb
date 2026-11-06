import { describe, expect, it, vi } from "vitest";

import type {
  ContentProfileDefinition,
  InstalledContentPack,
} from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import { ACTIVE_PROFILE_ID, ACTIVE_PROFILE_NAME } from "./content-profile-ui";
import {
  activateContentProfile,
  followAdvertisedContent,
} from "./profile-activation";

// Switching the active content never composes on the page: a stored profile
// pack is looked up, anything else is composed in the content worker, and
// only the activation (a settings write) happens here.
const definition: ContentProfileDefinition = {
  profileId: ACTIVE_PROFILE_ID,
  name: ACTIVE_PROFILE_NAME,
  layers: [{ packId: "server", contentDigest: "v2" }],
  resolutionPolicy: "last-pack-wins-v1",
  materializedPackId: "profile:browser-active-profile:abc",
  contentDigest: "composed",
};

function installed(
  packId: string,
  contentDigest: string,
  origin: InstalledContentPack["origin"] = "server",
): InstalledContentPack {
  return {
    manifest: { packId, contentDigest } as ContentPackManifest,
    origin,
  } as InstalledContentPack;
}

function repository(
  options: {
    readonly stored?: ContentProfileDefinition;
    readonly active?: ContentProfileDefinition;
    readonly packs?: readonly InstalledContentPack[];
  } = {},
) {
  return {
    storedProfile: vi.fn(() => Promise.resolve(options.stored)),
    setActiveProfile: vi.fn(() => Promise.resolve()),
    activeProfile: vi.fn(() => Promise.resolve(options.active)),
    listInstalled: vi.fn(() => Promise.resolve([...(options.packs ?? [])])),
  };
}

describe("activateContentProfile", () => {
  it("activates a stored profile without starting the worker", async () => {
    const storage = repository({ stored: definition });
    const compose = vi.fn(() => Promise.resolve(definition));
    await expect(
      activateContentProfile(storage, ["server"], compose),
    ).resolves.toBe(definition);
    expect(storage.storedProfile).toHaveBeenCalledWith(
      ACTIVE_PROFILE_ID,
      ACTIVE_PROFILE_NAME,
      ["server"],
    );
    expect(compose).not.toHaveBeenCalled();
    expect(storage.setActiveProfile).toHaveBeenCalledWith(definition);
  });

  it("composes in the worker, then activates its answer", async () => {
    const storage = repository();
    const compose = vi.fn(() => Promise.resolve(definition));
    await activateContentProfile(storage, ["server", "personal"], compose);
    expect(compose).toHaveBeenCalledWith(
      ACTIVE_PROFILE_ID,
      ACTIVE_PROFILE_NAME,
      ["server", "personal"],
    );
    expect(storage.setActiveProfile).toHaveBeenCalledWith(definition);
  });

  it("leaves the active content alone when the worker fails", async () => {
    const storage = repository();
    const compose = vi.fn(() =>
      Promise.reject(new Error("Missing content profile layer personal")),
    );
    await expect(
      activateContentProfile(storage, ["personal"], compose),
    ).rejects.toThrow("Missing content profile layer personal");
    expect(storage.setActiveProfile).not.toHaveBeenCalled();
  });
});

describe("followAdvertisedContent", () => {
  const advertised = [
    { packId: "server", contentDigest: "v2", url: "/private-packs/s.4ecp" },
  ];

  it("moves server-only content to the newly advertised revision through the worker", async () => {
    const storage = repository({
      active: {
        ...definition,
        layers: [{ packId: "server", contentDigest: "v1" }],
      },
      packs: [installed("server", "v2")],
    });
    const compose = vi.fn(() => Promise.resolve(definition));
    await expect(
      followAdvertisedContent(storage, advertised, compose),
    ).resolves.toBe(true);
    expect(compose).toHaveBeenCalledWith(
      ACTIVE_PROFILE_ID,
      ACTIVE_PROFILE_NAME,
      ["server"],
    );
    expect(storage.setActiveProfile).toHaveBeenCalledWith(definition);
  });

  it("keeps content the user assembled, and waits for every advertised pack", async () => {
    const compose = vi.fn(() => Promise.resolve(definition));
    const assembled = repository({
      active: {
        ...definition,
        layers: [{ packId: "mine", contentDigest: "m" }],
      },
      packs: [installed("mine", "m", "personal"), installed("server", "v2")],
    });
    await expect(
      followAdvertisedContent(assembled, advertised, compose),
    ).resolves.toBe(false);
    const missing = repository({ packs: [installed("server", "v1")] });
    await expect(
      followAdvertisedContent(missing, advertised, compose),
    ).resolves.toBe(false);
    expect(compose).not.toHaveBeenCalled();
    expect(assembled.setActiveProfile).not.toHaveBeenCalled();
    expect(missing.setActiveProfile).not.toHaveBeenCalled();
  });
});
