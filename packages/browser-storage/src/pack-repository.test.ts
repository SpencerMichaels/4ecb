import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";

import { buildContentPack, type ContentPack } from "@4ecb/content-pack";
import type { ParsedContentSource } from "@4ecb/content-domain";

import {
  ContentPackRepository,
  deleteContentDatabase,
} from "./pack-repository";
import {
  decodeAndValidateContentPackForStorage,
  storeAlreadyValidatedContentPack,
} from "./validated-pack-storage";

const databases: string[] = [];

async function makePack(
  packId = "test-pack",
  description = "original",
): Promise<ContentPack> {
  const source: ParsedContentSource = {
    gameSystem: "D&D4E",
    sourceKey: "test.xml",
    entities: [
      {
        id: "ID_TEST",
        name: "Test",
        type: "Feat",
        source: "Synthetic",
        sources: ["Synthetic"],
        attributes: [],
        categories: [],
        specifics: [],
        rules: [],
        description,
        extensions: [],
        content: [],
        provenance: { sourceKey: "test.xml", sourceOrdinal: 0 },
      },
    ],
    rejected: [],
    rawTopLevel: [],
    diagnostics: [],
    accounting: {
      topLevelRecords: 1,
      acceptedRecords: 1,
      warnedRecords: 0,
      rejectedRecords: 0,
      rawTopLevelElements: 0,
    },
  };
  return buildContentPack(source, { packId, name: "Test pack" });
}

function repository(): ContentPackRepository {
  const name = `4ecb-test-${crypto.randomUUID()}`;
  databases.push(name);
  return new ContentPackRepository(name);
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map((name) => deleteContentDatabase(name)),
  );
});

describe("ContentPackRepository", () => {
  it("installs, activates, deactivates, and removes packs", async () => {
    const storage = repository();
    const pack = await makePack();
    await storage.install(pack);
    expect(await storage.list()).toEqual([pack.manifest]);
    expect(await storage.manifest(pack.manifest.packId)).toEqual(pack.manifest);
    expect((await storage.get(pack.manifest.packId))?.entities[0]?.name).toBe(
      "Test",
    );

    await storage.activate(pack.manifest.packId);
    expect(await storage.activePackId()).toBe(pack.manifest.packId);
    await expect(storage.activeProfile()).resolves.toMatchObject({
      materializedPackId: pack.manifest.packId,
      layers: [
        {
          packId: pack.manifest.packId,
          contentDigest: pack.manifest.contentDigest,
        },
      ],
    });
    await storage.deactivate();
    expect(await storage.activePackId()).toBeUndefined();

    await storage.activate(pack.manifest.packId);
    await storage.remove(pack.manifest.packId);
    expect(await storage.list()).toEqual([]);
    expect(await storage.activePackId()).toBeUndefined();
  });

  it("rejects a different pack that reuses an installed ID", async () => {
    const storage = repository();
    await storage.install(await makePack("collision", "first"));
    await expect(
      storage.install(await makePack("collision", "second")),
    ).rejects.toThrow("different digest");
  });

  it("installs and decodes pre-encoded pack bytes", async () => {
    const storage = repository();
    const pack = await makePack("encoded");
    const encoded = await new Response(
      new Blob([JSON.stringify(pack)])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    await storage.installEncoded(encoded);
    expect((await storage.get("encoded"))?.manifest.contentDigest).toBe(
      pack.manifest.contentDigest,
    );
  });

  it("materializes ordered profiles without silently replacing active bindings", async () => {
    const storage = repository();
    const baseline = await makePack("baseline", "baseline");
    const personal = await makePack("personal", "personal override");
    await storage.install(baseline);
    await storage.install(personal);
    await storage.activate("baseline");
    const preview = await storage.previewProfile("table", "Table", [
      "baseline",
      "personal",
    ]);
    expect(await storage.activePackId()).toBe("baseline");
    expect(preview.collisions).toEqual(["ID_TEST"]);
    const active = await storage.activateProfile("table", "Table", [
      "baseline",
      "personal",
    ]);
    expect(active.layers.map(({ packId }) => packId)).toEqual([
      "baseline",
      "personal",
    ]);
    expect(await storage.activePackId()).toBe(active.materializedPackId);
    expect(
      (await storage.get(active.materializedPackId))?.entities[0]?.description,
    ).toBe("personal override");
    await expect(storage.remove("baseline")).rejects.toThrow("active profile");
    const secondOverlay = await makePack("second-overlay", "second override");
    await storage.install(secondOverlay);
    const revised = await storage.activateProfile("table", "Table", [
      "baseline",
      "personal",
      "second-overlay",
    ]);
    expect(revised.materializedPackId).not.toBe(active.materializedPackId);
    await expect(storage.get(active.materializedPackId)).resolves.toBeDefined();
  });

  it("revalidates encoded profile metadata at the storage boundary", async () => {
    const storage = repository();
    const pack = await makePack("safe");
    const unsafe = {
      ...pack,
      manifest: { ...pack.manifest, packId: "../unsafe" },
    };
    const encoded = new TextEncoder().encode(JSON.stringify(unsafe));
    const buffer = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(buffer).set(encoded);
    await expect(storage.installEncoded(buffer)).rejects.toThrow(
      "Cannot install invalid content pack",
    );
    await expect(storage.list()).resolves.toEqual([]);
  });

  it("rejects invalid decoded objects at the public storage boundary", async () => {
    const storage = repository();
    const pack = await makePack("decoded-safe");
    const unsafe = {
      ...pack,
      manifest: { ...pack.manifest, packId: "../unsafe-decoded" },
    };
    await expect(storage.install(unsafe)).rejects.toThrow(
      "Cannot install invalid content pack",
    );
    await expect(storage.listInstalled()).resolves.toEqual([]);
  });

  it("rejects a forged artifact that mismatches valid decoded content and bytes", async () => {
    const pack = await makePack("forged-proof");
    const differentPack = await makePack("forged-proof-bytes");
    await expect(
      storeAlreadyValidatedContentPack({
        pack,
        encodedPack: new TextEncoder().encode(JSON.stringify(differentPack))
          .buffer,
      }),
    ).rejects.toThrow("validation proof is missing");
  });

  it("binds internal validation proof to the exact decoded bytes", async () => {
    const first = await makePack("proof-first");
    const second = await makePack("proof-second");
    const secondBytes = new TextEncoder().encode(JSON.stringify(second)).buffer;
    const artifact = await decodeAndValidateContentPackForStorage(secondBytes);
    expect(artifact.pack.manifest.packId).toBe("proof-second");
    expect(artifact.pack.manifest.packId).not.toBe(first.manifest.packId);
    expect(artifact.encodedPack).toBe(secondBytes);
    await expect(
      decodeAndValidateContentPackForStorage(
        new Uint8Array([0, 1, 2, 3]).buffer,
      ),
    ).rejects.toThrow();
  });

  it("backfills metadata for schema-3 encoded and legacy object-form packs", async () => {
    const name = `4ecb-pack-v3-${crypto.randomUUID()}`;
    databases.push(name);
    const encoded = await makePack("encoded-v3");
    const legacy = await makePack("legacy-v3");
    const encodedBytes = new TextEncoder().encode(JSON.stringify(encoded));
    const old = await openDB(name, 3, {
      upgrade(database) {
        const packs = database.createObjectStore("contentPacks", {
          keyPath: "packId",
        });
        packs.createIndex("by-name", "manifest.name");
        database.createObjectStore("settings", { keyPath: "key" });
        const characters = database.createObjectStore("characters", {
          keyPath: "id",
        });
        characters.createIndex("by-updated", "updatedAt");
        characters.createIndex("by-deleted", "deletedAt");
        database.createObjectStore("characterMigrations", { keyPath: "id" });
      },
    });
    await old.put("contentPacks", {
      packId: encoded.manifest.packId,
      manifest: encoded.manifest,
      encodedPack: encodedBytes.buffer,
      origin: "server",
      advertised: {
        url: "/encoded-v3.4ecp",
        contentDigest: encoded.manifest.contentDigest,
      },
    });
    await old.put("contentPacks", {
      packId: legacy.manifest.packId,
      manifest: legacy.manifest,
      pack: legacy,
    });
    old.close();

    const storage = new ContentPackRepository(name);
    await expect(storage.listInstalled()).resolves.toEqual([
      {
        manifest: encoded.manifest,
        origin: "server",
        advertised: {
          url: "/encoded-v3.4ecp",
          contentDigest: encoded.manifest.contentDigest,
        },
      },
      { manifest: legacy.manifest, origin: "personal" },
    ]);
    await expect(storage.get("legacy-v3")).resolves.toEqual(legacy);
  });

  it("upgrades the schema-1 content-only database without losing its pack", async () => {
    const name = `4ecb-pack-v1-${crypto.randomUUID()}`;
    databases.push(name);
    const legacy = await makePack("legacy-v1");
    const old = await openDB(name, 1, {
      upgrade(database) {
        const packs = database.createObjectStore("contentPacks", {
          keyPath: "packId",
        });
        packs.createIndex("by-name", "manifest.name");
        database.createObjectStore("settings", { keyPath: "key" });
      },
    });
    await old.put("contentPacks", {
      packId: legacy.manifest.packId,
      manifest: legacy.manifest,
      pack: legacy,
    });
    await old.put("settings", {
      key: "active-content-pack",
      value: legacy.manifest.packId,
    });
    old.close();

    const storage = new ContentPackRepository(name);
    await expect(storage.listInstalled()).resolves.toEqual([
      { manifest: legacy.manifest, origin: "personal" },
    ]);
    await expect(storage.activePackId()).resolves.toBe("legacy-v1");
    await expect(storage.get("legacy-v1")).resolves.toEqual(legacy);
  });
});
