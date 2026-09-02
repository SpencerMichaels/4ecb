import {
  duplicateCharacterRecord,
  isCharacterRecord,
  isLegacyCharacterRecordV1,
  type CharacterBuild,
  type CharacterBackup,
  type CharacterProfileBinding,
  type CharacterRecord,
  type LegacyCharacterRecordV1,
  type StoredCharacterRecord,
  type SupportedCharacterBackup,
  type SheetSettings,
} from "@4ecb/character-domain";
import type { ContentPack } from "@4ecb/content-pack";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import { openDB, type DBSchema } from "idb";

interface CharacterDatabase extends DBSchema {
  contentPacks: {
    key: string;
    value:
      | {
          readonly packId: string;
          readonly manifest: ContentPack["manifest"];
          readonly encodedPack: ArrayBuffer;
        }
      | {
          readonly packId: string;
          readonly manifest: ContentPack["manifest"];
          readonly pack: ContentPack;
        };
    indexes: { "by-name": string };
  };
  settings: {
    key: string;
    value: { readonly key: string; readonly value: unknown };
  };
  characters: {
    key: string;
    value: StoredCharacterRecord;
    indexes: { "by-updated": string; "by-deleted": string };
  };
  characterMigrations: {
    key: string;
    value: CharacterMigrationJournal;
  };
}

interface CharacterMigrationJournal {
  readonly id: string;
  readonly previous: StoredCharacterRecord;
  readonly startedAt: string;
}

const DEFAULT_DATABASE_NAME = "4ecb";

export interface CharacterBackupInspection {
  readonly version: 1 | 2;
  readonly checksumVerified: boolean;
  readonly characterCount: number;
  readonly activeCount: number;
  readonly trashedCount: number;
  readonly conflictingIds: readonly string[];
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function characterPayloadDigest(
  characters: readonly StoredCharacterRecord[],
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(characters));
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  );
}

async function database(name: string) {
  return openDB<CharacterDatabase>(name, 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("contentPacks")) {
        const packs = db.createObjectStore("contentPacks", {
          keyPath: "packId",
        });
        packs.createIndex("by-name", "manifest.name");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("characters")) {
        const store = db.createObjectStore("characters", { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
        store.createIndex("by-deleted", "deletedAt");
      }
      if (!db.objectStoreNames.contains("characterMigrations")) {
        db.createObjectStore("characterMigrations", { keyPath: "id" });
      }
    },
  });
}

export class CharacterRepository {
  readonly #databaseName: string;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.#databaseName = databaseName;
  }

  async put(character: CharacterRecord): Promise<void> {
    const db = await database(this.#databaseName);
    try {
      await db.put("characters", character);
    } finally {
      db.close();
    }
  }

  async get(id: string): Promise<CharacterRecord | undefined> {
    const db = await database(this.#databaseName);
    try {
      await recoverCharacterMigrations(db);
      const stored = await db.get("characters", id);
      if (stored === undefined) return undefined;
      return await migrateStoredRecord(db, stored);
    } finally {
      db.close();
    }
  }

  async list(
    options: { readonly deleted?: boolean } = {},
  ): Promise<CharacterRecord[]> {
    const db = await database(this.#databaseName);
    try {
      await recoverCharacterMigrations(db);
      const stored = await db.getAllFromIndex("characters", "by-updated");
      const records = await Promise.all(
        stored.map((record) => migrateStoredRecord(db, record)),
      );
      return records
        .filter((record) =>
          options.deleted === true
            ? record.deletedAt !== undefined
            : record.deletedAt === undefined,
        )
        .reverse();
    } finally {
      db.close();
    }
  }

  async updateMetadata(
    id: string,
    changes: {
      readonly title?: string;
      readonly notes?: string;
      readonly profileBinding?: CharacterProfileBinding | null;
      readonly sheetSettings?: Partial<SheetSettings>;
    },
  ): Promise<CharacterRecord> {
    const current = await this.required(id);
    const profileBinding =
      changes.profileBinding === null
        ? undefined
        : (changes.profileBinding ?? current.profileBinding);
    const { profileBinding: _currentProfileBinding, ...withoutProfileBinding } =
      current;
    void _currentProfileBinding;
    const requestedTitle = changes.title?.trim();
    const updated: CharacterRecord = {
      ...withoutProfileBinding,
      ...(requestedTitle === undefined || requestedTitle.length === 0
        ? {}
        : {
            build: {
              ...current.build,
              textStrings: {
                ...current.build.textStrings,
                Name: requestedTitle,
              },
            },
          }),
      ...(changes.title === undefined
        ? {}
        : { title: requestedTitle || current.title }),
      ...(changes.notes === undefined ? {} : { notes: changes.notes }),
      ...(profileBinding === undefined ? {} : { profileBinding }),
      ...(changes.sheetSettings === undefined
        ? {}
        : {
            sheetSettings: {
              ...current.sheetSettings,
              ...changes.sheetSettings,
            },
          }),
      updatedAt: new Date().toISOString(),
    };
    await this.put(updated);
    return updated;
  }

  async updateBuild(
    id: string,
    build: CharacterBuild,
  ): Promise<CharacterRecord> {
    const current = await this.required(id);
    const legacyName = build.textStrings.Name?.trim();
    const updated = {
      ...current,
      build,
      ...(legacyName === undefined || legacyName.length === 0
        ? {}
        : { title: legacyName }),
      updatedAt: new Date().toISOString(),
    };
    await this.put(updated);
    return updated;
  }

  async duplicate(id: string): Promise<CharacterRecord> {
    const copy = duplicateCharacterRecord(await this.required(id));
    await this.put(copy);
    return copy;
  }

  async moveToTrash(id: string): Promise<void> {
    const current = await this.required(id);
    await this.put({
      ...current,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async restore(id: string): Promise<void> {
    const current = await this.required(id);
    const { deletedAt: _deletedAt, ...restored } = current;
    void _deletedAt;
    await this.put({ ...restored, updatedAt: new Date().toISOString() });
  }

  async purge(id: string): Promise<void> {
    const db = await database(this.#databaseName);
    try {
      await db.delete("characters", id);
    } finally {
      db.close();
    }
  }

  async exportBackup(): Promise<CharacterBackup> {
    const db = await database(this.#databaseName);
    try {
      await recoverCharacterMigrations(db);
      const characters = await Promise.all(
        (await db.getAll("characters")).map((record) =>
          migrateStoredRecord(db, record),
        ),
      );
      return {
        format: "4ecb-character-backup",
        version: 2,
        exportedAt: new Date().toISOString(),
        characterCount: characters.length,
        payloadDigest: await characterPayloadDigest(characters),
        characters,
      };
    } finally {
      db.close();
    }
  }

  async inspectBackup(backup: unknown): Promise<CharacterBackupInspection> {
    const supported = await validateBackup(backup);
    const current = await this.listAll();
    const currentIds = new Set(current.map((character) => character.id));
    return {
      version: supported.version,
      checksumVerified: supported.version === 2,
      characterCount: supported.characters.length,
      activeCount: supported.characters.filter(
        (character) => character.deletedAt === undefined,
      ).length,
      trashedCount: supported.characters.filter(
        (character) => character.deletedAt !== undefined,
      ).length,
      conflictingIds: supported.characters
        .filter((character) => currentIds.has(character.id))
        .map((character) => character.id),
    };
  }

  async restoreBackup(backup: unknown): Promise<number> {
    const supported = await validateBackup(backup);
    const characters = supported.characters.map(upgradeRecord);
    const db = await database(this.#databaseName);
    try {
      const transaction = db.transaction("characters", "readwrite");
      await Promise.all(
        characters.map((character) => transaction.store.put(character)),
      );
      await transaction.done;
      return characters.length;
    } finally {
      db.close();
    }
  }

  async required(id: string): Promise<CharacterRecord> {
    const character = await this.get(id);
    if (character === undefined) throw new Error(`Character not found: ${id}`);
    return character;
  }

  private async listAll(): Promise<CharacterRecord[]> {
    const db = await database(this.#databaseName);
    try {
      await recoverCharacterMigrations(db);
      return await Promise.all(
        (await db.getAll("characters")).map((record) =>
          migrateStoredRecord(db, record),
        ),
      );
    } finally {
      db.close();
    }
  }
}

async function validateBackup(
  backup: unknown,
): Promise<SupportedCharacterBackup> {
  if (backup === null || typeof backup !== "object")
    throw new Error("Unsupported character backup");
  const candidate = backup as Partial<SupportedCharacterBackup>;
  if (
    candidate.format !== "4ecb-character-backup" ||
    (candidate.version !== 1 && candidate.version !== 2) ||
    !Array.isArray(candidate.characters)
  )
    throw new Error("Unsupported character backup");
  if (!candidate.characters.every(isStoredCharacter))
    throw new Error("Character backup contains an invalid record");
  if (candidate.version === 2) {
    if (
      candidate.characterCount !== candidate.characters.length ||
      typeof candidate.payloadDigest !== "string"
    )
      throw new Error("Character backup manifest does not match its payload");
    const digest = await characterPayloadDigest(candidate.characters);
    if (digest !== candidate.payloadDigest)
      throw new Error("Character backup checksum verification failed");
  }
  return candidate as SupportedCharacterBackup;
}

function isStoredCharacter(value: unknown): value is StoredCharacterRecord {
  return isCharacterRecord(value) || isLegacyCharacterRecordV1(value);
}

function upgradeRecord(value: StoredCharacterRecord): CharacterRecord {
  if (value.schemaVersion === 2) return value;
  const legacy: LegacyCharacterRecordV1 = value;
  const imported = importDnd4e(legacy.legacy.sourceXml);
  return {
    ...legacy,
    schemaVersion: 2,
    build: imported.build,
  };
}

async function migrateStoredRecord(
  db: Awaited<ReturnType<typeof database>>,
  stored: StoredCharacterRecord,
): Promise<CharacterRecord> {
  if (stored.schemaVersion === 2) return stored;
  await db.put("characterMigrations", {
    id: stored.id,
    previous: stored,
    startedAt: new Date().toISOString(),
  });
  const migrated = upgradeRecord(stored);
  const transaction = db.transaction(
    ["characters", "characterMigrations"],
    "readwrite",
  );
  await transaction.objectStore("characters").put(migrated);
  await transaction.objectStore("characterMigrations").delete(stored.id);
  await transaction.done;
  return migrated;
}

async function recoverCharacterMigrations(
  db: Awaited<ReturnType<typeof database>>,
): Promise<void> {
  const journals = await db.getAll("characterMigrations");
  for (const journal of journals) {
    const current = await db.get("characters", journal.id);
    if (
      current !== undefined &&
      (current as { readonly schemaVersion: number }).schemaVersion === 2
    ) {
      await db.delete("characterMigrations", journal.id);
      continue;
    }
    if (current === undefined) {
      const transaction = db.transaction(
        ["characters", "characterMigrations"],
        "readwrite",
      );
      await transaction.objectStore("characters").put(journal.previous);
      await transaction.objectStore("characterMigrations").delete(journal.id);
      await transaction.done;
    }
  }
}
