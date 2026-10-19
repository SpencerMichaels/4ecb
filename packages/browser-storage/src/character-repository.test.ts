import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";

import { newCharacterRecord } from "@4ecb/character-domain";
import { buildContentPack } from "@4ecb/content-pack";
import type { ParsedContentSource } from "@4ecb/content-domain";

import { CharacterRepository } from "./character-repository";
import {
  ContentPackRepository,
  deleteContentDatabase,
} from "./pack-repository";

const databases: string[] = [];

function repository(): CharacterRepository {
  const name = `4ecb-character-test-${crypto.randomUUID()}`;
  databases.push(name);
  return new CharacterRepository(name);
}

function character(id = "character-one") {
  return newCharacterRecord(
    { format: "dnd4e", sourceXml: "<D20Character/>" },
    {
      details: { name: "Ada" },
      abilities: {},
      stats: {},
      selectedRules: [],
      powers: [],
      loot: [],
      textStrings: {},
      levelCount: 1,
      source: "legacy-cache",
    },
    {
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    },
    { id, now: "2026-01-01T00:00:00.000Z" },
  );
}

const portrait = {
  sourceDataUrl: "data:image/webp;base64,c291cmNl",
  sourceWidth: 800,
  sourceHeight: 1200,
  crop: { x: 0.5, y: 0.4, size: 0.5 },
  renderedDataUrl: "data:image/webp;base64,cmVuZGVyZWQ=",
};

const emptyContentSource: ParsedContentSource = {
  gameSystem: "D&D4E",
  sourceKey: "synthetic-empty",
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

async function payloadDigest(characters: readonly unknown[]): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(characters)),
    ),
  );
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map((name) => deleteContentDatabase(name)),
  );
});

describe("CharacterRepository", () => {
  it("initializes every current store when characters are opened first", async () => {
    const name = `4ecb-character-first-${crypto.randomUUID()}`;
    databases.push(name);
    await new CharacterRepository(name).put(character());
    await expect(new ContentPackRepository(name).list()).resolves.toEqual([]);
  });

  it("preserves a complete character across repository reconstruction", async () => {
    const name = `4ecb-restart-${crypto.randomUUID()}`;
    databases.push(name);
    const beforeRestart = new CharacterRepository(name);
    await beforeRestart.put(character("restartable"));
    const saved = await beforeRestart.updateMetadata("restartable", {
      notes: "Keep this after a browser restart.",
      profileBinding: {
        packId: "installed-profile",
        contentDigest: "digest-1",
      },
      sheetSettings: {
        paper: "a4",
        monochrome: true,
        blankHitPoints: true,
        includePowerCards: false,
        includeItemCards: false,
      },
      portrait,
    });

    const afterRestart = new CharacterRepository(name);
    await expect(afterRestart.get("restartable")).resolves.toEqual(saved);
  });

  it("can remove a portrait without disturbing other metadata", async () => {
    const storage = repository();
    await storage.put(character("portrait-removal"));
    const withPortrait = await storage.updateMetadata("portrait-removal", {
      portrait,
    });
    expect(withPortrait.portrait).toBeDefined();
    const removed = await storage.updateMetadata("portrait-removal", {
      portrait: null,
    });
    expect(removed.portrait).toBeUndefined();
    expect(removed.title).toBe("Ada");
    await expect(storage.listMetadataPartitioned()).resolves.toMatchObject({
      active: [{ id: "portrait-removal" }],
    });
    expect(
      (await storage.listMetadataPartitioned()).active[0],
    ).not.toHaveProperty("renderedPortraitDataUrl");
  });

  it("upgrades an application-v2 database without losing records or settings", async () => {
    const name = `4ecb-application-upgrade-${crypto.randomUUID()}`;
    databases.push(name);
    const current = character("from-v2");
    const { build: _build, ...legacyFields } = current;
    void _build;
    const legacy = { ...legacyFields, schemaVersion: 1 as const };
    const pack = await buildContentPack(emptyContentSource, {
      packId: "v2-profile",
      name: "Version 2 profile",
    });
    const oldDatabase = await openDB(name, 2, {
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
      },
    });
    const transaction = oldDatabase.transaction(
      ["contentPacks", "settings", "characters"],
      "readwrite",
    );
    await transaction.objectStore("contentPacks").put({
      packId: pack.manifest.packId,
      manifest: pack.manifest,
      pack,
    });
    await transaction
      .objectStore("settings")
      .put({ key: "active-content-pack", value: pack.manifest.packId });
    await transaction.objectStore("characters").put(legacy);
    await transaction.done;
    oldDatabase.close();

    const upgradedCharacter = await new CharacterRepository(name).get(
      legacy.id,
    );
    expect(upgradedCharacter).toMatchObject({
      id: legacy.id,
      schemaVersion: 2,
      build: { formatVersion: 1 },
    });
    const upgradedContent = new ContentPackRepository(name);
    await expect(upgradedContent.activePackId()).resolves.toBe("v2-profile");
    await expect(upgradedContent.get("v2-profile")).resolves.toEqual(pack);

    const inspected = await openDB(name);
    expect(inspected.version).toBe(5);
    expect([...inspected.objectStoreNames]).toEqual([
      "characterMetadata",
      "characterMigrations",
      "characterPortraits",
      "characters",
      "contentPackMetadata",
      "contentPacks",
      "settings",
    ]);
    expect(await inspected.getAll("characterMigrations")).toHaveLength(0);
    inspected.close();
  });

  it("recovers an interrupted lazy migration from its preserved record", async () => {
    const name = `4ecb-migration-recovery-${crypto.randomUUID()}`;
    databases.push(name);
    const current = character("interrupted");
    const { build: _build, ...legacyFields } = current;
    void _build;
    const legacy = { ...legacyFields, schemaVersion: 1 };
    const db = await openDB(name, 3, {
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
    await db.put("characterMigrations", {
      id: legacy.id,
      previous: legacy,
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    db.close();

    const recovered = await new CharacterRepository(name).get(legacy.id);
    expect(recovered).toMatchObject({ id: legacy.id, schemaVersion: 2 });
    expect(recovered?.build.formatVersion).toBe(1);
    await expect(
      new CharacterRepository(name).listMetadataPartitioned(),
    ).resolves.toMatchObject({
      active: [{ id: legacy.id, effectiveLevel: 1 }],
      deleted: [],
    });
  });

  it("moves schema-4 rendered portraits out of metadata during upgrade", async () => {
    const name = `4ecb-portrait-v4-${crypto.randomUUID()}`;
    databases.push(name);
    const current = { ...character("portrait-v4"), portrait };
    const old = await openDB(name, 4, {
      upgrade(database) {
        const packs = database.createObjectStore("contentPacks", {
          keyPath: "packId",
        });
        packs.createIndex("by-name", "manifest.name");
        const packMetadata = database.createObjectStore("contentPackMetadata", {
          keyPath: "packId",
        });
        packMetadata.createIndex("by-name", "manifest.name");
        database.createObjectStore("settings", { keyPath: "key" });
        const characters = database.createObjectStore("characters", {
          keyPath: "id",
        });
        characters.createIndex("by-updated", "updatedAt");
        characters.createIndex("by-deleted", "deletedAt");
        const metadata = database.createObjectStore("characterMetadata", {
          keyPath: "id",
        });
        metadata.createIndex("by-updated", "updatedAt");
        metadata.createIndex("by-deleted", "deletedAt");
        database.createObjectStore("characterMigrations", { keyPath: "id" });
      },
    });
    await old.put("characters", current);
    await old.put("characterMetadata", {
      id: current.id,
      title: current.title,
      updatedAt: current.updatedAt,
      effectiveLevel: 1,
      renderedPortraitDataUrl: portrait.renderedDataUrl,
    });
    old.close();

    const storage = new CharacterRepository(name);
    await expect(storage.listMetadataPartitioned()).resolves.toMatchObject({
      active: [
        {
          id: current.id,
          renderedPortraitDataUrl: portrait.renderedDataUrl,
        },
      ],
    });
    const upgraded = await openDB(name);
    expect(
      await upgraded.get("characterMetadata", current.id),
    ).not.toHaveProperty("renderedPortraitDataUrl");
    await expect(
      upgraded.get("characterPortraits", current.id),
    ).resolves.toEqual({
      id: current.id,
      renderedDataUrl: portrait.renderedDataUrl,
    });
    upgraded.close();
  });

  it("updates, duplicates, trashes, and restores characters", async () => {
    const storage = repository();
    await storage.put(character());
    await storage.updateMetadata("character-one", {
      title: "Ada Prime",
      sheetSettings: { paper: "a4" },
    });
    const copy = await storage.duplicate("character-one");
    expect((await storage.get("character-one"))?.sheetSettings.paper).toBe(
      "a4",
    );
    expect((await storage.get("character-one"))?.build.textStrings.Name).toBe(
      "Ada Prime",
    );
    expect(copy.title).toBe("Ada Prime (copy)");
    await storage.moveToTrash("character-one");
    expect(await storage.list()).toHaveLength(1);
    expect(await storage.list({ deleted: true })).toHaveLength(1);
    await storage.restore("character-one");
    expect(await storage.list()).toHaveLength(2);
  });

  it("lists lightweight metadata once and partitions active and trashed records", async () => {
    const name = `4ecb-character-summary-${crypto.randomUUID()}`;
    databases.push(name);
    const storage = new CharacterRepository(name);
    const active = character("active-summary");
    const retainedSourceMarker = "retained-source-payload";
    const portraitWithLargeRetainedSource = {
      ...portrait,
      sourceDataUrl: `data:image/webp;base64,${retainedSourceMarker}${"A".repeat(1024 * 1024)}`,
    };
    await storage.put({
      ...active,
      portrait: portraitWithLargeRetainedSource,
      legacy: {
        ...active.legacy,
        sourceXml: `<D20Character>${"payload".repeat(10_000)}</D20Character>`,
      },
    });
    await storage.put(character("trashed-summary"));
    await storage.moveToTrash("trashed-summary");

    await expect(storage.listMetadataPartitioned()).resolves.toEqual({
      active: [
        expect.objectContaining({
          id: "active-summary",
          title: "Ada",
          effectiveLevel: 1,
          renderedPortraitDataUrl: portrait.renderedDataUrl,
        }),
      ],
      deleted: [
        expect.objectContaining({ id: "trashed-summary", title: "Ada" }),
      ],
    });
    const db = await openDB(name);
    const storedMetadata = await db.get("characterMetadata", "active-summary");
    const storedPortrait = await db.get("characterPortraits", "active-summary");
    expect(storedMetadata).not.toHaveProperty("renderedPortraitDataUrl");
    expect(JSON.stringify(storedMetadata)).not.toContain("payload");
    expect(JSON.stringify(storedMetadata)).not.toContain(retainedSourceMarker);
    expect(storedPortrait).toEqual({
      id: "active-summary",
      renderedDataUrl: portrait.renderedDataUrl,
    });
    expect(JSON.stringify(storedPortrait)).not.toContain(retainedSourceMarker);
    db.close();
  });

  it("keeps the library title synchronized with the legacy character name", async () => {
    const storage = repository();
    const source = character("renamed");
    await storage.put(source);
    const updated = await storage.updateBuild("renamed", {
      ...source.build,
      textStrings: { ...source.build.textStrings, Name: "Ada Lovelace" },
    });
    expect(updated.title).toBe("Ada Lovelace");
  });

  it("round-trips complete records through native backup", async () => {
    const source = repository();
    await source.put({ ...character(), portrait });
    const backup = await source.exportBackup();
    const destination = repository();
    await expect(destination.inspectBackup(backup)).resolves.toMatchObject({
      version: 2,
      checksumVerified: true,
      characterCount: 1,
      conflictingIds: [],
    });
    expect(await destination.restoreBackup(backup)).toBe(1);
    expect(await destination.get("character-one")).toEqual({
      ...character(),
      portrait,
    });
  });

  it("exports one current record as a restorable native character package", async () => {
    const source = repository();
    await source.put(character("first"));
    await source.put(character("second"));

    const exported = await source.exportCharacter("second");

    expect(exported).toMatchObject({
      format: "4ecb-character-backup",
      version: 2,
      characterCount: 1,
      characters: [{ id: "second" }],
    });
    const destination = repository();
    await expect(destination.inspectBackup(exported)).resolves.toMatchObject({
      checksumVerified: true,
      characterCount: 1,
    });
    await expect(destination.restoreBackup(exported)).resolves.toBe(1);
    await expect(destination.get("second")).resolves.toEqual(
      character("second"),
    );
    await expect(destination.get("first")).resolves.toBeUndefined();
  });

  it("imports a character package as new active records without overwriting", async () => {
    const source = repository();
    await source.put({ ...character("kept"), portrait });
    const exported = await source.exportCharacter("kept");
    await source.updateMetadata("kept", { portrait: null });
    await source.moveToTrash("kept");

    const [copy] = await source.importCharacters(exported);

    expect(copy?.id).not.toBe("kept");
    expect(copy?.deletedAt).toBeUndefined();
    expect(copy?.portrait).toEqual(portrait);
    await expect(source.get(copy?.id ?? "")).resolves.toEqual(copy);
    await expect(source.get("kept")).resolves.toMatchObject({
      deletedAt: expect.any(String),
    });
    await expect(source.get("kept")).resolves.not.toHaveProperty("portrait");

    const destination = repository();
    const [fresh] = await destination.importCharacters(exported);
    expect(fresh?.id).toBe("kept");
  });

  it("rejects a modified checksummed backup before writing", async () => {
    const source = repository();
    await source.put(character());
    const backup = await source.exportBackup();
    const modified = {
      ...backup,
      characters: [{ ...backup.characters[0]!, title: "Tampered" }],
    };
    const destination = repository();
    await expect(destination.restoreBackup(modified)).rejects.toThrow(
      "checksum verification failed",
    );
    expect(await destination.list()).toEqual([]);
  });

  it("rejects a self-checksummed backup with an incomplete schema-2 record", async () => {
    const source = repository();
    await source.put(character());
    const backup = await source.exportBackup();
    const { build: _build, ...incomplete } = backup.characters[0]!;
    void _build;
    const characters = [incomplete];
    const crafted = {
      ...backup,
      characters,
      payloadDigest: await payloadDigest(characters),
    };
    const destination = repository();
    await expect(destination.restoreBackup(crafted)).rejects.toThrow(
      "invalid record",
    );
    expect(await destination.list()).toEqual([]);
  });

  it("inspects and restores legacy unchecksummed backups explicitly", async () => {
    const storage = repository();
    const legacy = {
      format: "4ecb-character-backup" as const,
      version: 1 as const,
      exportedAt: "2026-01-01T00:00:00.000Z",
      characters: [character()],
    };
    await expect(storage.inspectBackup(legacy)).resolves.toMatchObject({
      version: 1,
      checksumVerified: false,
      characterCount: 1,
    });
    await expect(storage.restoreBackup(legacy)).resolves.toBe(1);
  });

  it("rejects malformed backup records without writing them", async () => {
    const storage = repository();
    await expect(
      storage.restoreBackup({
        format: "4ecb-character-backup",
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        characters: [{ id: "bad" } as never],
      }),
    ).rejects.toThrow("invalid record");
    expect(await storage.list()).toEqual([]);
  });
});
