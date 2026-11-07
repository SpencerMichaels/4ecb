import { describe, expect, it, vi } from "vitest";

import type {
  CampaignProfileDefinition,
  ContentProfileDefinition,
} from "@4ecb/browser-storage";
import type { CampaignDocument } from "@4ecb/content-pack";

import { campaignProfileMaterializer } from "./campaign-profile";
import {
  composeCampaignProfileInWorker,
  composeProfileInWorker,
  countCampaignRemovedRecordsInWorker,
  type ContentWorkerPort,
} from "./content-worker-client";
import type { ContentWorkerRequest } from "./worker-messages";

// A campaign profile (D116) is composed in the content worker, never on the
// page; a profile already stored is only looked up.
const storage = vi.hoisted(() => ({
  calls: [] as { ids: readonly string[]; campaignId: string }[],
  profileCalls: [] as {
    profileId: string;
    name: string;
    ids: readonly string[];
  }[],
  failure: undefined as string | undefined,
}));

const campaign = {
  format: "4ecb-campaign",
  version: 1,
  campaignId: "golarion",
  name: "Golarion",
  revision: 2,
  restrictions: { ids: [], types: [{ type: "Deity", allow: "campaign-only" }] },
  houseRules: {
    manifest: { packId: "campaign.golarion.r2", contentDigest: "rules" },
    entities: [],
  },
  legacyHouseRulesXml: "",
  contentDigest: "doc-2",
} as unknown as CampaignDocument;

const definition: CampaignProfileDefinition = {
  profileId: "campaign:golarion",
  name: "Golarion",
  layers: [
    { packId: "server", contentDigest: "server-digest" },
    { packId: "campaign.golarion.r2", contentDigest: "rules" },
  ],
  resolutionPolicy: "last-pack-wins-v1",
  materializedPackId: "profile:campaign:golarion:abc",
  contentDigest: "composed",
  campaign: { campaignId: "golarion", revision: 2, contentDigest: "doc-2" },
};

const profile: ContentProfileDefinition = {
  profileId: "browser-active-profile",
  name: "Active browser content profile",
  layers: [{ packId: "server", contentDigest: "server-digest" }],
  resolutionPolicy: "last-pack-wins-v1",
  materializedPackId: "profile:browser-active-profile:def",
  contentDigest: "composed-active",
};

// Base layers by pack ID, for the removed-records count.
const basePacks: Record<string, { id: string; type: string }[]> = {
  server: [
    { id: "ID_DEITY_A", type: "Deity" },
    { id: "ID_DEITY_B", type: "Deity" },
    { id: "ID_FEAT", type: "Feat" },
  ],
  personal: [{ id: "ID_DEITY_C", type: "Deity" }],
};

vi.mock("@4ecb/browser-storage", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ContentPackRepository: class {
    async get(packId: string) {
      const entities = basePacks[packId];
      return entities === undefined ? undefined : { entities };
    }
    async materializeProfile(
      profileId: string,
      name: string,
      ids: readonly string[],
    ) {
      storage.profileCalls.push({ profileId, name, ids });
      if (storage.failure !== undefined) throw new Error(storage.failure);
      return profile;
    }
    async materializeCampaignProfile(
      ids: readonly string[],
      document: CampaignDocument,
    ) {
      storage.calls.push({ ids, campaignId: document.campaignId });
      if (storage.failure !== undefined) throw new Error(storage.failure);
      return definition;
    }
  },
}));

// The worker module's global scope; the module is imported once, so every
// in-process worker shares it.
const scope: {
  onmessage?: (event: MessageEvent<ContentWorkerRequest>) => void;
  postMessage: (message: unknown) => void;
} = { postMessage: () => undefined };

/** Runs the worker module in process behind a `Worker`-shaped port. */
async function inProcessWorker(): Promise<{
  readonly create: () => ContentWorkerPort;
  readonly terminated: () => number;
}> {
  vi.stubGlobal("self", scope);
  await import("./content.worker");
  let terminated = 0;
  return {
    terminated: () => terminated,
    create: () => {
      const port: ContentWorkerPort = {
        onmessage: null,
        onerror: null,
        postMessage: (message) => {
          // What a real worker receives: a structured clone.
          const data = structuredClone(message);
          scope.postMessage = (response) =>
            port.onmessage?.({
              data: structuredClone(response),
            } as MessageEvent);
          scope.onmessage?.({ data } as MessageEvent<ContentWorkerRequest>);
        },
        terminate: () => {
          terminated += 1;
        },
      };
      return port;
    },
  };
}

describe("campaign profile compose in the content worker", () => {
  it("sends the request through the worker and returns its definition", async () => {
    const worker = await inProcessWorker();
    storage.calls.length = 0;
    storage.failure = undefined;
    await expect(
      composeCampaignProfileInWorker(["server"], campaign, worker.create),
    ).resolves.toEqual(definition);
    expect(storage.calls).toEqual([
      { ids: ["server"], campaignId: "golarion" },
    ]);
    expect(worker.terminated()).toBe(1);

    storage.failure = "Missing content profile layer server";
    await expect(
      composeCampaignProfileInWorker(["server"], campaign, worker.create),
    ).rejects.toThrow("Missing content profile layer server");
    expect(worker.terminated()).toBe(2);
    storage.failure = undefined;
  });

  it("reuses a stored profile without starting the worker", async () => {
    const compose = vi.fn(() => Promise.resolve(definition));
    const stored = vi.fn(() => Promise.resolve(definition));
    const materialize = campaignProfileMaterializer(
      { storedCampaignProfile: stored },
      compose,
    );
    await expect(materialize(["server"], campaign)).resolves.toBe(definition);
    expect(stored).toHaveBeenCalledWith(["server"], campaign);
    expect(compose).not.toHaveBeenCalled();

    stored.mockResolvedValueOnce(undefined as never);
    await expect(materialize(["server"], campaign)).resolves.toBe(definition);
    expect(compose).toHaveBeenCalledWith(["server"], campaign);
  });
});

describe("content profile compose in the content worker", () => {
  it("sends the request through the worker and returns its definition", async () => {
    const worker = await inProcessWorker();
    storage.profileCalls.length = 0;
    storage.failure = undefined;
    await expect(
      composeProfileInWorker(
        "browser-active-profile",
        "Active browser content profile",
        ["server", "personal"],
        worker.create,
      ),
    ).resolves.toEqual(profile);
    expect(storage.profileCalls).toEqual([
      {
        profileId: "browser-active-profile",
        name: "Active browser content profile",
        ids: ["server", "personal"],
      },
    ]);
    expect(worker.terminated()).toBe(1);

    storage.failure = "Missing content profile layer personal";
    await expect(
      composeProfileInWorker("p", "P", ["personal"], worker.create),
    ).rejects.toThrow("Missing content profile layer personal");
    expect(worker.terminated()).toBe(2);
    storage.failure = undefined;
  });
});

describe("campaign removed-record count in the content worker", () => {
  it("counts over the base layers through the worker", async () => {
    const worker = await inProcessWorker();
    const before = worker.terminated();
    await expect(
      countCampaignRemovedRecordsInWorker(
        ["server", "personal"],
        campaign,
        worker.create,
      ),
    ).resolves.toEqual([{ type: "Deity", count: 3 }]);
    expect(worker.terminated()).toBe(before + 1);
    await expect(
      countCampaignRemovedRecordsInWorker(["missing"], campaign, worker.create),
    ).rejects.toThrow("Missing content profile layer missing");
  });
});
