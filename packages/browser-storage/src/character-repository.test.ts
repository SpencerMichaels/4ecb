import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";

import { newCharacterRecord } from "@4ecb/character-domain";

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
    expect(copy.title).toBe("Ada Prime (copy)");
    await storage.moveToTrash("character-one");
    expect(await storage.list()).toHaveLength(1);
    expect(await storage.list({ deleted: true })).toHaveLength(1);
    await storage.restore("character-one");
    expect(await storage.list()).toHaveLength(2);
  });

  it("round-trips complete records through native backup", async () => {
    const source = repository();
    await source.put(character());
    const backup = await source.exportBackup();
    const destination = repository();
    await expect(destination.inspectBackup(backup)).resolves.toMatchObject({
      version: 2,
      verified: true,
      characterCount: 1,
      conflictingIds: [],
    });
    expect(await destination.restoreBackup(backup)).toBe(1);
    expect(await destination.get("character-one")).toEqual(character());
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
      verified: false,
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
