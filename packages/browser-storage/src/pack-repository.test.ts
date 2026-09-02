import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { buildContentPack, type ContentPack } from "@4ecb/content-pack";
import type { ParsedContentSource } from "@4ecb/content-domain";

import {
  ContentPackRepository,
  deleteContentDatabase,
} from "./pack-repository";

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
});
