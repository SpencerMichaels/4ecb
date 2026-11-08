import { describe, expect, it } from "vitest";
import {
  buildCampaign,
  buildContentPack,
  encodeCampaign,
  encodeContentPackBytes,
  type CampaignDocument,
} from "@4ecb/content-pack";
import type { ParsedContentSource } from "@4ecb/content-domain";
import {
  advertisedCampaignsToInstall,
  downloadAdvertisedCampaign,
  downloadAdvertisedPack,
  MAX_ADVERTISED_CAMPAIGNS,
  parseRuntimeContentConfig,
  refreshInstalledCampaigns,
  type AdvertisedCampaign,
  shouldActivateAdvertisedContent,
} from "./runtime-content";

const source: ParsedContentSource = {
  gameSystem: "D&D4E",
  sourceKey: "fixture",
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

describe("runtime content", () => {
  it("accepts immutable advertised identities and rejects insecure URLs", () => {
    const digest = "a".repeat(64);
    expect(
      parseRuntimeContentConfig({
        contentPacks: [
          { packId: "base", contentDigest: digest, url: "/packs/base.4ecp" },
        ],
      }).contentPacks[0]?.url,
    ).toContain("/packs/base.4ecp");
    expect(() =>
      parseRuntimeContentConfig({
        contentPacks: [
          {
            packId: "base",
            contentDigest: digest,
            url: "http://elsewhere.test/base.4ecp",
          },
        ],
      }),
    ).toThrow("same-origin");
  });

  it("downloads, validates, and pins the advertised digest", async () => {
    const pack = await buildContentPack(source, {
      packId: "base",
      name: "Base",
    });
    const bytes = encodeContentPackBytes(pack);
    let requestInit: RequestInit | undefined;
    const result = await downloadAdvertisedPack(
      {
        packId: "base",
        contentDigest: pack.manifest.contentDigest,
        url: "https://example.test/base.4ecp",
      },
      () => undefined,
      async (_input, init) => {
        requestInit = init;
        return new Response(bytes.buffer as ArrayBuffer);
      },
    );
    expect(requestInit).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(result.pack.manifest.contentDigest).toBe(
      pack.manifest.contentDigest,
    );
    await expect(
      downloadAdvertisedPack(
        {
          packId: "base",
          contentDigest: "f".repeat(64),
          url: "https://example.test/base.4ecp",
        },
        () => undefined,
        async () => new Response(bytes.buffer as ArrayBuffer),
      ),
    ).rejects.toThrow("does not match");
  });

  it("rejects an oversized declared download before reading", async () => {
    await expect(
      downloadAdvertisedPack(
        {
          packId: "base",
          contentDigest: "f".repeat(64),
          url: "https://example.test/base.4ecp",
        },
        () => undefined,
        async () =>
          new Response(new Uint8Array(), {
            headers: { "content-length": String(129 * 1024 * 1024) },
          }),
      ),
    ).rejects.toThrow("128 MiB");
  });

  it("follows a newly advertised server pack unless the user added their own", () => {
    const old = { packId: "server-old", contentDigest: "a", url: "/old.4ecp" };
    const next = { packId: "server-new", contentDigest: "b", url: "/new.4ecp" };
    const origins: Record<string, string> = {
      "server-old": "server",
      "server-new": "server",
      homebrew: "personal",
    };
    const originOf = (packId: string) => origins[packId];
    const layers = (...packs: { packId: string; contentDigest: string }[]) => ({
      layers: packs.map(({ packId, contentDigest }) => ({
        packId,
        contentDigest,
      })),
    });
    // No content yet: start on the server's.
    expect(shouldActivateAdvertisedContent(undefined, [next], originOf)).toBe(
      true,
    );
    // The server moved on: follow it.
    expect(shouldActivateAdvertisedContent(layers(old), [next], originOf)).toBe(
      true,
    );
    // Already on it: nothing to do.
    expect(
      shouldActivateAdvertisedContent(layers(next), [next], originOf),
    ).toBe(false);
    // The user layered their own pack on top: leave their content alone.
    expect(
      shouldActivateAdvertisedContent(
        layers(old, { packId: "homebrew", contentDigest: "c" }),
        [next],
        originOf,
      ),
    ).toBe(false);
    // Nothing advertised: never switch.
    expect(shouldActivateAdvertisedContent(layers(old), [], originOf)).toBe(
      false,
    );
  });
});

function campaign(
  revision: number,
  campaignId = "synthetic-setting",
): Promise<CampaignDocument> {
  return buildCampaign(
    {
      campaignId,
      name: "Synthetic Setting",
      revision,
      restrictions: { ids: [], types: [] },
    },
    { ...source, sourceKey: "house-rules.xml" },
    "",
  );
}

function advertisement(document: CampaignDocument): AdvertisedCampaign {
  return {
    campaignId: document.campaignId,
    name: document.name,
    revision: document.revision,
    contentDigest: document.contentDigest,
    url: `https://example.test/private-packs/campaigns/${document.campaignId}-r${document.revision}.4ecc`,
  };
}

/** Serves each advertised campaign's bytes by URL, recording requests. */
function campaignServer(documents: readonly CampaignDocument[]) {
  const requested: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const document = documents.find(
      (candidate) => advertisement(candidate).url === url,
    );
    return document === undefined
      ? new Response("missing", { status: 404 })
      : new Response(encodeCampaign(document).slice().buffer);
  }) as typeof fetch;
  return { fetcher, requested };
}

describe("runtime campaigns", () => {
  const digest = "b".repeat(64);
  const entry = {
    campaignId: "pathfinder",
    name: "Pathfinder",
    revision: 2,
    contentDigest: digest,
    url: "/private-packs/campaigns/pathfinder-bbbbbbbbbbbb.4ecc",
  };

  it("parses advertised campaigns with same-origin URLs", () => {
    const config = parseRuntimeContentConfig(
      { campaigns: [entry] },
      "https://group.test/app/",
    );
    expect(config.contentPacks).toEqual([]);
    expect(config.campaigns).toEqual([
      {
        ...entry,
        url: "https://group.test/private-packs/campaigns/pathfinder-bbbbbbbbbbbb.4ecc",
      },
    ]);
    expect(parseRuntimeContentConfig({}).campaigns).toEqual([]);
  });

  it("turns on sharing by code only when the server says so", () => {
    const share = (value: unknown) =>
      parseRuntimeContentConfig(value).characterShare;
    expect(share({ features: { characterShare: true } })).toBe(true);
    expect(share({ features: { characterShare: false } })).toBe(false);
    expect(share({ features: { characterShare: "yes" } })).toBe(false);
    expect(share({ features: null })).toBe(false);
    expect(share({})).toBe(false);
  });

  it("drops malformed, cross-origin, duplicate, or too many campaigns", () => {
    const other = { ...entry, campaignId: "eberron", name: "Eberron" };
    const parse = (campaigns: unknown) =>
      parseRuntimeContentConfig({ campaigns }, "https://group.test/");
    const kept = (campaigns: unknown) =>
      parse(campaigns).campaigns.map(({ campaignId }) => campaignId);
    const problems = (campaigns: unknown) =>
      parse(campaigns).campaignProblems.join("\n");
    expect(kept({})).toEqual([]);
    expect(problems({})).toContain("must be an array");
    // A bad entry drops only itself.
    for (const [bad, reason] of [
      [{ ...entry, url: "https://elsewhere.test/x.4ecc" }, "same-origin"],
      [{ ...entry, url: "http://[bad" }, "Invalid URL"],
      [{ ...entry, contentDigest: "short" }, "SHA-256"],
      [{ ...entry, revision: 1.5 }, "revision"],
      [{ ...entry, campaignId: "-bad" }, "campaignId"],
      [{ ...entry, name: " " }, "name"],
      ["not an object", "must be an object"],
    ] as const) {
      expect(kept([bad, other])).toEqual(["eberron"]);
      expect(problems([bad, other])).toContain(reason);
    }
    // Two copies of one campaign: neither is offered.
    expect(kept([entry, other, { ...entry, revision: 3 }])).toEqual([
      "eberron",
    ]);
    expect(problems([entry, { ...entry, revision: 3 }])).toContain("duplicate");
    const tooMany = Array.from(
      { length: MAX_ADVERTISED_CAMPAIGNS + 1 },
      (_, index) => ({ ...entry, campaignId: `campaign-${index}` }),
    );
    expect(kept(tooMany)).toEqual([]);
    expect(problems(tooMany)).toContain("more than");
    expect(parse([entry]).campaignProblems).toEqual([]);
  });

  it("keeps the content packs when the campaigns are malformed", () => {
    const pack = {
      packId: "server.content",
      contentDigest: "a".repeat(64),
      url: "/private-packs/server.4ecp",
    };
    for (const campaigns of [
      "nope",
      [{ ...entry, url: "https://elsewhere.test/x.4ecc" }],
      [entry, entry],
    ]) {
      const config = parseRuntimeContentConfig(
        { contentPacks: [pack], campaigns },
        "https://group.test/",
      );
      expect(config.contentPacks.map(({ packId }) => packId)).toEqual([
        "server.content",
      ]);
      expect(config.campaigns).toEqual([]);
      expect(config.campaignProblems.length).toBeGreaterThan(0);
    }
  });

  it("selects hosted campaigns not installed and newer revisions", async () => {
    const first = await campaign(1);
    const second = await campaign(2);
    const fresh = await campaign(1, "not-added");
    expect(
      advertisedCampaignsToInstall(
        [first],
        [advertisement(second), advertisement(fresh)],
      ),
    ).toEqual([advertisement(second), advertisement(fresh)]);
    // Same or older revisions, and an exact copy already present, are skipped.
    expect(
      advertisedCampaignsToInstall([first, second], [advertisement(second)]),
    ).toEqual([]);
    expect(
      advertisedCampaignsToInstall([second], [advertisement(first)]),
    ).toEqual([]);
  });

  it("installs hosted campaigns from the server in the background", async () => {
    const first = await campaign(1);
    const second = await campaign(2);
    const fresh = await campaign(3, "not-added");
    const unadvertised = await campaign(1, "not-hosted");
    const installed: CampaignDocument[] = [first];
    const repository = {
      list: async () => [...installed],
      install: async (document: CampaignDocument) => {
        installed.push(document);
        return document;
      },
    };
    // The server holds a file it doesn't advertise: it is never fetched.
    const { fetcher, requested } = campaignServer([
      second,
      fresh,
      unadvertised,
    ]);
    const added = await refreshInstalledCampaigns(
      repository,
      [advertisement(second), advertisement(fresh)],
      fetcher,
    );
    // A newer revision of an installed campaign, and one not installed yet.
    expect(
      added.map(({ campaignId, revision }) => `${campaignId} r${revision}`),
    ).toEqual([`${first.campaignId} r2`, "not-added r3"]);
    expect(requested).toEqual([
      advertisement(second).url,
      advertisement(fresh).url,
    ]);
    expect(installed.map(({ campaignId }) => campaignId)).not.toContain(
      "not-hosted",
    );
    // Everything advertised is installed: nothing is fetched.
    requested.length = 0;
    expect(
      await refreshInstalledCampaigns(
        repository,
        [advertisement(second), advertisement(fresh)],
        fetcher,
      ),
    ).toEqual([]);
    expect(requested).toEqual([]);
  });

  it("retries a failed hosted campaign on the next load", async () => {
    const fresh = await campaign(1, "not-added");
    const installed: CampaignDocument[] = [];
    const repository = {
      list: async () => [...installed],
      install: async (document: CampaignDocument) => {
        installed.push(document);
        return document;
      },
    };
    // The server fails once; the refresh resolves quietly with nothing.
    expect(
      await refreshInstalledCampaigns(
        repository,
        [advertisement(fresh)],
        campaignServer([]).fetcher,
      ),
    ).toEqual([]);
    expect(installed).toEqual([]);
    const { fetcher } = campaignServer([fresh]);
    expect(
      (
        await refreshInstalledCampaigns(
          repository,
          [advertisement(fresh)],
          fetcher,
        )
      ).map(({ campaignId }) => campaignId),
    ).toEqual(["not-added"]);
  });

  it("quietly skips a hosted campaign that fails or doesn't match", async () => {
    const first = await campaign(1);
    const second = await campaign(2);
    const install = async (document: CampaignDocument) => document;
    const repository = { list: async () => [first], install };
    // Missing on the server.
    expect(
      await refreshInstalledCampaigns(
        repository,
        [advertisement(second)],
        campaignServer([]).fetcher,
      ),
    ).toEqual([]);
    // The file is a different revision than advertised.
    const mislabeled = { ...advertisement(second), revision: 3 };
    const wrongFile = (async () =>
      new Response(encodeCampaign(second).slice().buffer)) as typeof fetch;
    await expect(
      downloadAdvertisedCampaign(mislabeled, wrongFile),
    ).rejects.toThrow("does not match");
    expect(
      await refreshInstalledCampaigns(repository, [mislabeled], wrongFile),
    ).toEqual([]);
    // A tampered file fails its digest.
    const tampered = (async () =>
      new Response(
        new TextEncoder().encode(
          JSON.stringify({ ...second, name: "Tampered" }),
        ),
      )) as typeof fetch;
    await expect(
      downloadAdvertisedCampaign(advertisement(second), tampered),
    ).rejects.toThrow();
  });
});
