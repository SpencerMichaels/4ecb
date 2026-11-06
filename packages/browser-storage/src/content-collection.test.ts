import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  newNativeCharacterRecord,
  type CharacterProfileBinding,
} from "@4ecb/character-domain";
import {
  buildCampaign,
  buildContentPack,
  encodeContentPack,
  type CampaignDocument,
} from "@4ecb/content-pack";
import type {
  ParsedContentEntity,
  ParsedContentSource,
} from "@4ecb/content-domain";

import { CampaignRepository } from "./campaign-repository";
import { CharacterRepository } from "./character-repository";
import {
  collectUnusedContent,
  CONTENT_COLLECTION_GRACE_MS,
} from "./content-collection";
import {
  campaignProfileBinding,
  ContentPackRepository,
  deleteContentDatabase,
  openContentDatabase,
  type ContentProfileDefinition,
} from "./pack-repository";

const databases: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteContentDatabase));
});

function databaseName(): string {
  const name = `4ecb-collection-test-${crypto.randomUUID()}`;
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

async function installPack(
  packs: ContentPackRepository,
  packId: string,
  origin: "server" | "personal",
): Promise<void> {
  const pack = await buildContentPack(
    source([entity(`ID_SYN_${packId.toUpperCase()}`, "Feat")]),
    { packId, name: packId },
  );
  await packs.installEncoded(
    new TextEncoder().encode(encodeContentPack(pack)).buffer,
    { origin },
  );
}

function campaign(revision: number): Promise<CampaignDocument> {
  return buildCampaign(
    {
      campaignId: "synthetic-setting",
      name: "Synthetic Setting",
      revision,
      restrictions: { ids: [], types: [] },
    },
    source([entity(`ID_SYN_DEITY_R${revision}`, "Deity")]),
    "",
  );
}

function character(
  id: string,
  binding: CharacterProfileBinding,
  deletedAt?: string,
) {
  const record = newNativeCharacterRecord(
    id,
    { name: "1", type: "Level", definitionId: "ID_INTERNAL_LEVEL_1" },
    binding,
    { id, now: "2026-11-06T00:00:00.000Z" },
  );
  return deletedAt === undefined ? record : { ...record, deletedAt };
}

function binding(profile: ContentProfileDefinition): CharacterProfileBinding {
  return {
    packId: profile.materializedPackId,
    contentDigest: profile.contentDigest,
    layers: profile.layers,
    resolutionPolicy: profile.resolutionPolicy,
  };
}

const t0 = new Date("2026-11-06T12:00:00.000Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const pastGrace = later(CONTENT_COLLECTION_GRACE_MS + 1);

async function packIds(packs: ContentPackRepository): Promise<string[]> {
  return (await packs.list()).map(({ packId }) => packId).sort();
}

describe("collectUnusedContent", () => {
  it("removes unreferenced profile packs and old unbound campaign revisions after the grace period", async () => {
    const name = databaseName();
    const packs = new ContentPackRepository(name);
    const campaigns = new CampaignRepository(name);
    const characters = new CharacterRepository(name);
    await installPack(packs, "base", "server");
    await installPack(packs, "personal", "personal");

    const active = await packs.materializeProfile("default", "Default", [
      "base",
    ]);
    await packs.setActiveProfile(active);
    const unused = await packs.materializeProfile("default", "Default", [
      "base",
      "personal",
    ]);
    const oldServer = await packs.materializeProfile("old", "Old", [
      "personal",
    ]);
    await characters.put(character("bound", binding(oldServer)));

    const first = await campaign(1);
    const second = await campaign(2);
    const third = await campaign(3);
    for (const revision of [first, second, third])
      await campaigns.install(revision);
    // A trashed character still pins campaign revision 1 and its pack.
    const trashedProfile = await packs.materializeCampaignProfile(
      ["base"],
      first,
    );
    await characters.put(
      character(
        "trashed",
        campaignProfileBinding(trashedProfile),
        "2026-11-06T01:00:00.000Z",
      ),
    );
    // Composed for revision 2, now superseded; and revision 3 over other
    // base layers than the active ones.
    const superseded = await packs.materializeCampaignProfile(["base"], second);
    const otherBase = await packs.materializeCampaignProfile(
      ["base", "personal"],
      third,
    );
    // The current target (active layers + newest revision): kept as cache.
    const target = await packs.materializeCampaignProfile(["base"], third);

    const before = await packIds(packs);
    const marked = await collectUnusedContent(name, { now: t0 });
    expect(marked.removedPackIds).toEqual([]);
    expect(marked.removedCampaigns).toEqual([]);
    expect(marked.pendingPackIds).toEqual(
      [
        unused.materializedPackId,
        superseded.materializedPackId,
        otherBase.materializedPackId,
      ].sort(),
    );
    expect(marked.pendingCampaigns.map(({ revision }) => revision)).toEqual([
      2,
    ]);

    // Within the grace period nothing goes, however often it runs.
    const early = await collectUnusedContent(name, {
      now: later(CONTENT_COLLECTION_GRACE_MS - 1),
    });
    expect(early.removedPackIds).toEqual([]);
    expect(early.removedCampaigns).toEqual([]);
    expect(await packIds(packs)).toEqual(before);

    const collected = await collectUnusedContent(name, { now: pastGrace });
    expect(collected.removedPackIds).toEqual(marked.pendingPackIds);
    expect(collected.removedCampaigns).toEqual([
      {
        campaignId: "synthetic-setting",
        revision: 2,
        contentDigest: second.contentDigest,
      },
    ]);
    expect(collected.pendingPackIds).toEqual([]);
    expect(await packIds(packs)).toEqual(
      [
        "base",
        "personal",
        active.materializedPackId,
        oldServer.materializedPackId,
        trashedProfile.materializedPackId,
        target.materializedPackId,
      ].sort(),
    );
    expect((await campaigns.list()).map(({ revision }) => revision)).toEqual([
      1, 3,
    ]);

    // Running again is a no-op.
    const again = await collectUnusedContent(name, {
      now: later(3 * CONTENT_COLLECTION_GRACE_MS),
    });
    expect(again).toEqual({
      removedPackIds: [],
      removedCampaigns: [],
      pendingPackIds: [],
      pendingCampaigns: [],
    });
    expect((await packIds(packs)).length).toBe(6);
  });

  it("never removes server or personal packs, or the newest campaign revision", async () => {
    const name = databaseName();
    const packs = new ContentPackRepository(name);
    const campaigns = new CampaignRepository(name);
    await installPack(packs, "base", "server");
    await installPack(packs, "personal", "personal");
    await campaigns.install(await campaign(1));

    await collectUnusedContent(name, { now: t0 });
    const result = await collectUnusedContent(name, { now: pastGrace });
    expect(result.removedPackIds).toEqual([]);
    expect(result.removedCampaigns).toEqual([]);
    expect(await packIds(packs)).toEqual(["base", "personal"]);
    expect(await campaigns.list()).toHaveLength(1);
  });

  it("keeps the active pack alone and the packs migration journals pin", async () => {
    const name = databaseName();
    const packs = new ContentPackRepository(name);
    await installPack(packs, "base", "server");
    const legacyActive = await packs.materializeProfile("x", "X", ["base"]);
    await packs.activate(legacyActive.materializedPackId);
    const journaled = await packs.materializeProfile("y", "Y", ["base"]);
    const database = await openContentDatabase(name);
    await database.put("characterMigrations", {
      id: "migrating",
      previous: character("migrating", binding(journaled)),
      startedAt: t0.toISOString(),
    });
    database.close();

    await collectUnusedContent(name, { now: t0 });
    const result = await collectUnusedContent(name, { now: pastGrace });
    expect(result.removedPackIds).toEqual([]);
    expect(await packIds(packs)).toEqual(
      [
        "base",
        legacyActive.materializedPackId,
        journaled.materializedPackId,
      ].sort(),
    );
  });

  it("restarts the grace period when a candidate is referenced in between", async () => {
    const name = databaseName();
    const packs = new ContentPackRepository(name);
    const characters = new CharacterRepository(name);
    await installPack(packs, "base", "server");
    const profile = await packs.materializeProfile("x", "X", ["base"]);

    expect(
      (await collectUnusedContent(name, { now: t0 })).pendingPackIds,
    ).toEqual([profile.materializedPackId]);
    // Another tab binds a character to it before the grace period ends.
    await characters.put(character("late", binding(profile)));
    expect(
      await collectUnusedContent(name, { now: later(1000) }),
    ).toMatchObject({ removedPackIds: [], pendingPackIds: [] });
    await characters.purge("late");

    // Unreferenced again: a fresh first sighting, not the old one.
    const fresh = await collectUnusedContent(name, { now: pastGrace });
    expect(fresh.removedPackIds).toEqual([]);
    expect(fresh.pendingPackIds).toEqual([profile.materializedPackId]);
    const gone = await collectUnusedContent(name, {
      now: new Date(pastGrace.getTime() + CONTENT_COLLECTION_GRACE_MS),
    });
    expect(gone.removedPackIds).toEqual([profile.materializedPackId]);
    expect(await packIds(packs)).toEqual(["base"]);
  });
});
