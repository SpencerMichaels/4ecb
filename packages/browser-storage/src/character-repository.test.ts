import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";
import { openDB } from "idb";

import {
  newCharacterRecord,
  type BuildOccurrence,
} from "@4ecb/character-domain";
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
      formatVersion: 3,
      known: [],
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
      build: { formatVersion: 3 },
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
    expect(recovered?.build.formatVersion).toBe(3);
    await expect(
      new CharacterRepository(name).listMetadataPartitioned(),
    ).resolves.toMatchObject({
      active: [{ id: legacy.id, effectiveLevel: 1 }],
      deleted: [],
    });
  });

  it("moves a format-1 build's ritual loot into its known list on load", async () => {
    const name = `4ecb-known-migration-${crypto.randomUUID()}`;
    databases.push(name);
    const current = character("format-1");
    const { known: _known, ...build } = current.build;
    void _known;
    const ritual = {
      id: "legacy:loot:1:0",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [
        { definitionId: "ID_RITUAL", name: "Synthetic Rite", type: "Ritual" },
      ],
      overrides: {},
      legality: "rules-legal" as const,
    };
    const scroll = {
      ...ritual,
      id: "legacy:loot:1:1",
      quantity: 2,
      elements: [
        {
          definitionId: "ID_SCROLL",
          name: "Rite Scroll",
          type: "Ritual Scroll",
        },
      ],
    };
    const stored = {
      ...current,
      build: { ...build, formatVersion: 1, inventory: [ritual, scroll] },
    };
    const storage = new CharacterRepository(name);
    await storage.put(current);
    const db = await openDB(name);
    await db.put("characters", stored);
    db.close();

    const migrated = await storage.get("format-1");
    expect(migrated?.build.formatVersion).toBe(3);
    expect(migrated?.build.inventory.map(({ id }) => id)).toEqual([
      "legacy:loot:1:1",
    ]);
    expect(migrated?.build.known).toMatchObject([
      {
        id: "legacy:loot:1:0",
        acquiredLevel: 1,
        element: { definitionId: "ID_RITUAL", type: "Ritual" },
        acquisition: "free",
        legacyLoot: { quantity: 1, elements: ritual.elements },
      },
    ]);
    // The upgrade is written back once and is a no-op afterwards.
    const reopened = await openDB(name);
    expect(
      (await reopened.get("characters", "format-1")).build.formatVersion,
    ).toBe(3);
    expect(await reopened.getAll("characterMigrations")).toHaveLength(0);
    reopened.close();
    await expect(storage.get("format-1")).resolves.toEqual(migrated);
  });

  it("settles a format-2 build's per-level loot into current holdings on load", async () => {
    const name = `4ecb-holdings-migration-${crypto.randomUUID()}`;
    databases.push(name);
    const current = character("format-2");
    const { inventoryHistory: _history, ...build } = current.build;
    void _history;
    const belt = {
      id: "legacy:loot:5:0",
      acquiredLevel: 5,
      quantity: 1,
      equippedQuantity: 1,
      elements: [
        { definitionId: "ID_BELT", name: "Belt of Vigor", type: "Magic Item" },
      ],
      overrides: {},
      legality: "rules-legal" as const,
    };
    const blade = {
      ...belt,
      id: "legacy:loot:5:1",
      elements: [{ definitionId: "ID_BLADE", name: "Gouge", type: "Weapon" }],
    };
    const rows = [
      belt,
      blade,
      {
        ...belt,
        id: "legacy:loot:6:0",
        acquiredLevel: 6,
        quantity: -1,
        equippedQuantity: -1,
      },
      {
        ...blade,
        id: "legacy:loot:6:1",
        acquiredLevel: 6,
        quantity: 0,
        equippedQuantity: -1,
      },
    ];
    const storage = new CharacterRepository(name);
    await storage.put(current);
    const db = await openDB(name);
    await db.put("characters", {
      ...current,
      build: { ...build, formatVersion: 2, inventory: rows },
    });
    db.close();

    const migrated = await storage.get("format-2");
    expect(migrated?.build.formatVersion).toBe(3);
    expect(
      migrated?.build.inventory.map(({ id, quantity, equippedQuantity }) => [
        id,
        quantity,
        equippedQuantity,
      ]),
    ).toEqual([["legacy:loot:5:1", 1, 0]]);
    expect(migrated?.build.inventoryHistory).toEqual(rows);
    // Written back once; reloading returns the same current holdings.
    const reopened = await openDB(name);
    expect(
      (await reopened.get("characters", "format-2")).build.formatVersion,
    ).toBe(3);
    reopened.close();
    await expect(storage.get("format-2")).resolves.toEqual(migrated);
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

  it("saves the sheet layout and item card flags without touching last modified", async () => {
    const storage = repository();
    const holding = {
      id: "holding-1",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [{ name: "Synthetic Cloak", type: "Magic Item" }],
      overrides: {},
      legality: "rules-legal" as const,
    };
    const base = character();
    await storage.put({
      ...base,
      build: { ...base.build, inventory: [holding] },
    });
    const layout = {
      version: 1 as const,
      hiddenSections: ["scratchpad" as const],
      hiddenCards: ["power:id_fmp_power_1"],
    };
    const saved = await storage.updateMetadata("character-one", {
      sheetLayout: layout,
      itemCardsShown: { "holding-1": false },
    });
    expect(saved.sheetLayout).toEqual(layout);
    expect(saved.build.inventory[0]?.showPowerCard).toBe(false);
    expect(saved.updatedAt).toBe(base.updatedAt);
    expect((await storage.listMetadataPartitioned()).active[0]?.updatedAt).toBe(
      base.updatedAt,
    );
    expect(await storage.get("character-one")).toEqual(saved);

    // Backups and duplicates carry it like any other record data.
    const backup = await storage.exportBackup();
    const destination = repository();
    expect(await destination.restoreBackup(backup)).toBe(1);
    expect((await destination.get("character-one"))?.sheetLayout).toEqual(
      layout,
    );
    const copy = await storage.duplicate("character-one");
    expect(copy.sheetLayout).toEqual(layout);
    expect(copy.build.inventory[0]?.showPowerCard).toBe(false);

    // Malformed entries are dropped; `null` resets to the defaults.
    const lenient = await storage.updateMetadata("character-one", {
      sheetLayout: {
        version: 1,
        hiddenSections: ["not-a-section", "session-notes"],
        hiddenCards: [7, "power:x"],
      } as never,
    });
    expect(lenient.sheetLayout).toEqual({
      version: 1,
      hiddenSections: ["session-notes"],
      hiddenCards: ["power:x"],
    });
    const reset = await storage.updateMetadata("character-one", {
      sheetLayout: null,
    });
    expect(reset).not.toHaveProperty("sheetLayout");
    expect(reset.updatedAt).toBe(base.updatedAt);
    // A real metadata edit still moves it.
    const renamed = await storage.updateMetadata("character-one", {
      notes: "Edited",
    });
    expect(renamed.updatedAt).not.toBe(base.updatedAt);
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

  it("empties the trash without touching active characters", async () => {
    const name = `4ecb-character-empty-trash-${crypto.randomUUID()}`;
    databases.push(name);
    const storage = new CharacterRepository(name);
    await storage.put({ ...character("kept"), portrait });
    await storage.put({ ...character("trashed-one"), portrait });
    await storage.put(character("trashed-two"));
    await storage.moveToTrash("trashed-one");
    await storage.moveToTrash("trashed-two");

    await expect(storage.emptyTrash()).resolves.toBe(2);
    const { active, deleted } = await storage.listMetadataPartitioned();
    expect(active.map(({ id }) => id)).toEqual(["kept"]);
    expect(deleted).toEqual([]);
    expect(await storage.get("trashed-one")).toBeUndefined();
    expect(await storage.get("trashed-two")).toBeUndefined();
    const db = await openDB(name);
    expect(await db.get("characterPortraits", "trashed-one")).toBeUndefined();
    expect(await db.get("characterPortraits", "kept")).toBeDefined();
    db.close();
    await expect(storage.emptyTrash()).resolves.toBe(0);
  });

  it("lists paragon path and epic destiny, backfilling rows saved without them", async () => {
    const name = `4ecb-character-paragon-${crypto.randomUUID()}`;
    databases.push(name);
    const occurrence = (
      id: string,
      type: string,
      itemName: string,
      level: number,
      children: readonly BuildOccurrence[] = [],
    ): BuildOccurrence => ({
      id,
      identity: { name: itemName, type },
      acquiredLevel: level,
      legality: "rules-legal",
      children,
      unresolved: false,
    });
    const base = character("epic-hero");
    const epic = {
      ...base,
      profileBinding: { packId: "synthetic", contentDigest: "digest-1" },
      build: {
        ...base.build,
        effectiveLevel: 21,
        levels: [
          {
            level: 1,
            root: occurrence("l1", "Level", "1", 1, [
              occurrence("race", "Race", "Human", 1),
              occurrence("class", "Class", "Cleric", 1),
            ]),
          },
          {
            level: 11,
            root: occurrence("l11", "Level", "11", 11, [
              occurrence("pp", "Paragon Path", "Radiant Servant", 11),
            ]),
          },
          {
            level: 21,
            root: occurrence("l21", "Level", "21", 21, [
              occurrence("ed", "Epic Destiny", "Demigod", 21),
            ]),
          },
        ],
      },
    };
    const storage = new CharacterRepository(name);
    await storage.put(epic);
    await expect(storage.listMetadataPartitioned()).resolves.toMatchObject({
      active: [
        {
          id: "epic-hero",
          race: "Human",
          className: "Cleric",
          paragonPath: "Radiant Servant",
          epicDestiny: "Demigod",
          contentRevision: { packId: "synthetic", contentDigest: "digest-1" },
        },
      ],
    });

    // A row stored before paragon/epic were derived (no metadataVersion) is
    // re-derived from its record on the next read and written back.
    const db = await openDB(name);
    await db.put("characterMetadata", {
      id: epic.id,
      title: epic.title,
      updatedAt: epic.updatedAt,
      effectiveLevel: 21,
    });
    db.close();
    const { active } = await storage.listMetadataPartitioned();
    expect(active[0]).toMatchObject({
      paragonPath: "Radiant Servant",
      epicDestiny: "Demigod",
    });
    expect(active[0]).not.toHaveProperty("metadataVersion");
    const reopened = await openDB(name);
    expect(await reopened.get("characterMetadata", epic.id)).toMatchObject({
      paragonPath: "Radiant Servant",
      metadataVersion: 2,
    });
    reopened.close();
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

  it("keeps a library summary only while it matches the character revision", async () => {
    const name = `4ecb-character-library-summary-${crypto.randomUUID()}`;
    databases.push(name);
    const storage = new CharacterRepository(name);
    const bound = {
      ...character("summarized"),
      profileBinding: { packId: "synthetic", contentDigest: "digest-1" },
    };
    await storage.put(bound);
    const summary = {
      engineVersion: "engine-1",
      summaryVersion: 1,
      updatedAt: bound.updatedAt,
      packId: "synthetic",
      contentDigest: "digest-1",
      value: { roleLine: "Divine Defender" },
    };
    const listed = async () =>
      (await storage.listMetadataPartitioned()).active[0]?.librarySummary;

    // A summary for another revision or other content is never saved.
    await expect(
      storage.putLibrarySummary(bound.id, {
        ...summary,
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      storage.putLibrarySummary(bound.id, {
        ...summary,
        contentDigest: "digest-0",
      }),
    ).resolves.toBe(false);
    await expect(storage.putLibrarySummary("missing", summary)).resolves.toBe(
      false,
    );
    expect(await listed()).toBeUndefined();

    await expect(storage.putLibrarySummary(bound.id, summary)).resolves.toBe(
      true,
    );
    expect(await listed()).toEqual(summary);

    // Rewriting the same revision (a migration) or re-deriving an older
    // metadata row keeps it.
    await storage.put(bound);
    expect(await listed()).toEqual(summary);
    const db = await openDB(name);
    const row = await db.get("characterMetadata", bound.id);
    await db.put("characterMetadata", { ...row, metadataVersion: 1 });
    db.close();
    expect(await listed()).toEqual(summary);

    // Any saved change drops it.
    await storage.updateBuild(bound.id, {
      ...bound.build,
      textStrings: { Name: "Renamed" },
    });
    expect(await listed()).toBeUndefined();
  });
});
