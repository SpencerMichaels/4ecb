import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  isCharacterRecord,
  newNativeCharacterRecord,
  type CharacterProfileBinding,
} from "@4ecb/character-domain";
import {
  buildCampaign,
  buildContentPack,
  encodeCampaign,
  type CampaignDocument,
  type CampaignManifest,
} from "@4ecb/content-pack";
import type {
  ParsedContentEntity,
  ParsedContentSource,
} from "@4ecb/content-domain";

import { CampaignRepository } from "./campaign-repository";
import { CharacterRepository } from "./character-repository";
import {
  campaignProfileBinding,
  ContentPackRepository,
  deleteContentDatabase,
} from "./pack-repository";

const databases: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteContentDatabase));
});

function databaseName(): string {
  const name = `4ecb-campaign-test-${crypto.randomUUID()}`;
  databases.push(name);
  return name;
}

function entity(id: string, type: string): ParsedContentEntity {
  return {
    id,
    name: id,
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: `${id} text`,
    extensions: [],
    content: [],
    provenance: { sourceKey: "synthetic.xml", sourceOrdinal: 0 },
  };
}

function source(entities: readonly ParsedContentEntity[]): ParsedContentSource {
  return {
    gameSystem: "D&D4E",
    sourceKey: "synthetic.xml",
    entities,
    rejected: [],
    rawTopLevel: [],
    diagnostics: [],
    accounting: {
      topLevelRecords: entities.length,
      acceptedRecords: entities.length,
      warnedRecords: 0,
      rejectedRecords: 0,
      rawTopLevelElements: 0,
    },
  };
}

const manifest: CampaignManifest = {
  campaignId: "synthetic-setting",
  name: "Synthetic Setting",
  revision: 1,
  restrictions: {
    ids: ["ID_SYN_FEAT_OLD"],
    types: [{ type: "Deity", allow: "campaign-only" }],
  },
};

async function campaign(
  overrides: Partial<CampaignManifest> = {},
  houseRuleIds: readonly string[] = ["ID_SYN_DEITY_NEW"],
): Promise<CampaignDocument> {
  return buildCampaign(
    { ...manifest, ...overrides },
    source(houseRuleIds.map((id) => entity(id, "Deity"))),
    '<RulesElement internal-id="ID_SYN_DEITY_NEW"/>',
  );
}

function basePack(packId = "base") {
  return buildContentPack(
    source([
      entity("ID_SYN_DEITY_SUN", "Deity"),
      entity("ID_SYN_FEAT_OLD", "Feat"),
      entity("ID_SYN_FEAT_KEPT", "Feat"),
    ]),
    { packId, name: "Base" },
  );
}

function member(
  id: string,
  binding: CharacterProfileBinding,
  deletedAt?: string,
) {
  const record = newNativeCharacterRecord(
    "Member",
    { name: "1", type: "Level", definitionId: "ID_INTERNAL_LEVEL_1" },
    binding,
    { id, now: "2026-11-06T00:00:00.000Z" },
  );
  return deletedAt === undefined ? record : { ...record, deletedAt };
}

const membership = (document: CampaignDocument): CharacterProfileBinding => ({
  packId: "profile:campaign:synthetic-setting:abc",
  contentDigest: "materialized",
  campaign: {
    campaignId: document.campaignId,
    revision: document.revision,
    contentDigest: document.contentDigest,
  },
});

describe("CampaignRepository", () => {
  it("installs idempotently and lists, gets and finds the latest revision", async () => {
    const campaigns = new CampaignRepository(databaseName());
    const first = await campaign();
    const second = await campaign({ revision: 2 }, [
      "ID_SYN_DEITY_NEW",
      "ID_SYN_DEITY_OTHER",
    ]);
    const other = await campaign({ campaignId: "synthetic-setting:b" });

    await campaigns.install(second);
    await campaigns.install(first);
    await campaigns.install(first);
    await campaigns.installEncoded(encodeCampaign(other).slice().buffer);

    expect(
      (await campaigns.list()).map(({ campaignId, revision }) => [
        campaignId,
        revision,
      ]),
    ).toEqual([
      ["synthetic-setting", 1],
      ["synthetic-setting", 2],
      ["synthetic-setting:b", 1],
    ]);
    // A campaign ID that is a prefix of another is not mixed up with it.
    expect(
      (await campaigns.revisions("synthetic-setting")).map(
        ({ revision }) => revision,
      ),
    ).toEqual([1, 2]);
    expect((await campaigns.latest("synthetic-setting"))?.contentDigest).toBe(
      second.contentDigest,
    );
    expect(await campaigns.latest("missing")).toBeUndefined();
    expect(
      (await campaigns.get("synthetic-setting", first.contentDigest))?.revision,
    ).toBe(1);
    expect(
      await campaigns.get("synthetic-setting:b", first.contentDigest),
    ).toBeUndefined();
  });

  it("refuses a different document under an installed revision", async () => {
    const campaigns = new CampaignRepository(databaseName());
    await campaigns.install(await campaign());
    const changed = await campaign({}, ["ID_SYN_DEITY_CHANGED"]);
    await expect(campaigns.install(changed)).rejects.toThrow(
      /revision 1 is already installed with different content; bump the revision/,
    );
    expect(await campaigns.list()).toHaveLength(1);
  });

  it("refuses a tampered campaign", async () => {
    const campaigns = new CampaignRepository(databaseName());
    const document = await campaign();
    await expect(
      campaigns.install({ ...document, name: "Renamed" }),
    ).rejects.toThrow(/Invalid campaign: .*Digest mismatch/);
    await expect(
      campaigns.install({ format: "nope" } as unknown as CampaignDocument),
    ).rejects.toThrow(/Invalid campaign/);
    expect(await campaigns.list()).toEqual([]);
  });

  it("refuses removal while any character, trashed included, belongs to the campaign", async () => {
    const name = databaseName();
    const campaigns = new CampaignRepository(name);
    const characters = new CharacterRepository(name);
    const first = await campaign();
    await campaigns.install(first);
    await campaigns.install(await campaign({ revision: 2 }));
    await characters.put(
      member("trashed", membership(first), "2026-11-06T01:00:00.000Z"),
    );
    await characters.put(
      member("outsider", { packId: "p", contentDigest: "d" }),
    );

    await expect(campaigns.remove("synthetic-setting")).rejects.toThrow(
      /while a character belongs to it/,
    );
    expect(await campaigns.list()).toHaveLength(2);

    await characters.purge("trashed");
    expect(await campaigns.remove("synthetic-setting")).toBe(2);
    expect(await campaigns.list()).toEqual([]);
  });
});

describe("ContentPackRepository.materializeCampaignProfile", () => {
  it("composes the base layers and the campaign once, reusing the stored pack", async () => {
    const name = databaseName();
    const packs = new ContentPackRepository(name);
    const base = await basePack();
    await packs.install(base);
    await packs.activate(base.manifest.packId);
    const document = await campaign();

    const profile = await packs.materializeCampaignProfile(["base"], document);
    expect(profile).toMatchObject({
      profileId: "campaign:synthetic-setting",
      name: "Synthetic Setting",
      resolutionPolicy: "last-pack-wins-v1",
      layers: [
        { packId: "base", contentDigest: base.manifest.contentDigest },
        {
          packId: "campaign.synthetic-setting.r1",
          contentDigest: document.houseRules.manifest.contentDigest,
        },
      ],
      campaign: {
        campaignId: "synthetic-setting",
        revision: 1,
        contentDigest: document.contentDigest,
      },
    });
    expect(profile.materializedPackId).toMatch(
      /^profile:campaign:synthetic-setting:[0-9a-f]{12}$/,
    );
    const stored = await packs.get(profile.materializedPackId);
    expect(stored?.manifest.contentDigest).toBe(profile.contentDigest);
    expect(stored?.campaign).toEqual({
      campaignId: "synthetic-setting",
      revision: 1,
      contentDigest: document.contentDigest,
      restrictedIds: ["ID_SYN_DEITY_SUN", "ID_SYN_FEAT_OLD"],
    });
    expect(
      (await packs.listInstalled()).find(
        ({ manifest }) => manifest.packId === profile.materializedPackId,
      )?.origin,
    ).toBe("profile");

    // Reused by ID: same definition, no second pack.
    const count = (await packs.list()).length;
    expect(await packs.materializeCampaignProfile(["base"], document)).toEqual(
      profile,
    );
    expect(await packs.list()).toHaveLength(count);

    // Never the active profile.
    expect(await packs.activePackId()).toBe("base");
    expect((await packs.activeProfile())?.materializedPackId).toBe("base");

    // A new campaign revision or new base layers get a new pack.
    const revised = await packs.materializeCampaignProfile(
      ["base"],
      await campaign({ revision: 2 }),
    );
    expect(revised.materializedPackId).not.toBe(profile.materializedPackId);
    const personal = await basePack("personal");
    await packs.install(personal);
    const layered = await packs.materializeCampaignProfile(
      ["base", "personal"],
      document,
    );
    expect(layered.materializedPackId).not.toBe(profile.materializedPackId);
    expect(layered.layers.map(({ packId }) => packId)).toEqual([
      "base",
      "personal",
      "campaign.synthetic-setting.r1",
    ]);

    // Its binding is a valid character binding.
    expect(
      isCharacterRecord(member("bound", campaignProfileBinding(profile))),
    ).toBe(true);
  });

  it("refuses missing or materialized base layers and a tampered campaign", async () => {
    const packs = new ContentPackRepository(databaseName());
    await packs.install(await basePack());
    const document = await campaign();
    await expect(
      packs.materializeCampaignProfile(["missing"], document),
    ).rejects.toThrow("Missing content profile layer missing");
    const profile = await packs.materializeCampaignProfile(["base"], document);
    await expect(
      packs.materializeCampaignProfile([profile.materializedPackId], document),
    ).rejects.toThrow(
      "A materialized profile cannot be used as a source layer",
    );
    await expect(
      packs.materializeCampaignProfile(["base"], {
        ...(await campaign({ revision: 3 })),
        name: "Tampered",
      }),
    ).rejects.toThrow(/Invalid campaign: .*Digest mismatch/);
  });
});
