import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

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
  it("initializes every v2 store when characters are opened first", async () => {
    const name = `4ecb-character-first-${crypto.randomUUID()}`;
    databases.push(name);
    await new CharacterRepository(name).put(character());
    await expect(new ContentPackRepository(name).list()).resolves.toEqual([]);
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
    expect(await destination.restoreBackup(backup)).toBe(1);
    expect(await destination.get("character-one")).toEqual(character());
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
