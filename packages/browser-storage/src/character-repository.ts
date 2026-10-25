import {
  buildElementNames,
  characterDisplayName,
  duplicateCharacterRecord,
  isCharacterRecord,
  isCharacterRecordWithBuildV1,
  isCharacterRecordWithBuildV2,
  isCurrentStoredRecord,
  isLegacyCharacterRecordV1,
  upgradeCharacterBuild,
  type CharacterBuild,
  type CharacterBackup,
  type CharacterProfileBinding,
  type CharacterPortrait,
  type CharacterRecord,
  type LegacyCharacterRecordV1,
  type StoredCharacterRecord,
  type SupportedCharacterBackup,
  type SheetSettings,
} from "@4ecb/character-domain";
import type { ContentPack } from "@4ecb/content-pack";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import { openDB, unwrap, type DBSchema, type IDBPTransaction } from "idb";

interface CharacterDatabase extends DBSchema {
  contentPacks: {
    key: string;
    value:
      | {
          readonly packId: string;
          readonly manifest: ContentPack["manifest"];
          readonly encodedPack: ArrayBuffer;
          readonly origin?: "personal" | "server" | "profile";
          readonly advertised?: {
            readonly url: string;
            readonly contentDigest: string;
          };
        }
      | {
          readonly packId: string;
          readonly manifest: ContentPack["manifest"];
          readonly pack: ContentPack;
          readonly origin?: "personal" | "server" | "profile";
          readonly advertised?: {
            readonly url: string;
            readonly contentDigest: string;
          };
        };
    indexes: { "by-name": string };
  };
  contentPackMetadata: {
    key: string;
    value: {
      readonly packId: string;
      readonly manifest: ContentPack["manifest"];
      readonly origin: "personal" | "server" | "profile";
      readonly advertised?: {
        readonly url: string;
        readonly contentDigest: string;
      };
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
  characterMetadata: {
    key: string;
    value: StoredCharacterMetadata;
    indexes: { "by-updated": string; "by-deleted": string };
  };
  characterPortraits: {
    key: string;
    value: CharacterPortraitThumbnail;
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

export interface CharacterMetadata {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
  readonly effectiveLevel: number;
  readonly race?: string;
  readonly className?: string;
  /** The build's latest paragon path and epic destiny, when it has them. */
  readonly paragonPath?: string;
  readonly epicDestiny?: string;
  /** The content the character is pinned to (packId and digest only), so
   *  the library can tell when a content update is waiting. */
  readonly contentRevision?: {
    readonly packId: string;
    readonly contentDigest?: string;
  };
  /** A disposable cache of the character's evaluated stats for the library
   *  (see CharacterLibrarySummary); never a source of truth. */
  readonly librarySummary?: CharacterLibrarySummary;
}

/**
 * What the library shows for a character that needs evaluation (role line,
 * Play data stats), saved after the builder or library evaluated it. The
 * stamp says what it was computed from, and a summary whose stamp no longer
 * matches the character, its content or the engine is a cache miss. Storage
 * keeps it on the metadata row and checks the character half of the stamp;
 * the app checks the versions and validates `value`.
 */
export interface CharacterLibrarySummary {
  /** The rules engine's evaluation cache version it was computed with. */
  readonly engineVersion: string;
  /** The app's own format version for `value`. */
  readonly summaryVersion: number;
  /** The record's updatedAt and content binding it was computed from. */
  readonly updatedAt: string;
  readonly packId: string;
  readonly contentDigest: string;
  readonly value: unknown;
}

/** Whether a summary was computed from this metadata's character revision
 *  and content binding. */
export function librarySummaryMatchesCharacter(
  summary: CharacterLibrarySummary,
  metadata: Pick<CharacterMetadata, "updatedAt" | "contentRevision">,
): boolean {
  return (
    summary.updatedAt === metadata.updatedAt &&
    summary.packId === metadata.contentRevision?.packId &&
    summary.contentDigest === metadata.contentRevision.contentDigest
  );
}

/** A re-derived metadata row keeps the previous row's summary while it still
 *  describes the same character revision and content. */
function withPreviousSummary(
  next: StoredCharacterMetadata,
  previous: StoredCharacterMetadata | undefined,
): StoredCharacterMetadata {
  const summary = previous?.librarySummary;
  return summary === undefined || !librarySummaryMatchesCharacter(summary, next)
    ? next
    : { ...next, librarySummary: summary };
}

/** Bumped whenever characterMetadata() derives new fields: rows from an
 *  older derivation are re-derived from their records on the next library
 *  read (refreshStaleMetadata). */
const CHARACTER_METADATA_VERSION = 2;

interface StoredCharacterMetadata extends CharacterMetadata {
  readonly metadataVersion?: number;
}

export interface CharacterLibraryEntry extends CharacterMetadata {
  readonly renderedPortraitDataUrl?: string;
}

interface CharacterPortraitThumbnail {
  readonly id: string;
  readonly renderedDataUrl: string;
}

export interface PartitionedCharacterMetadata {
  readonly active: readonly CharacterLibraryEntry[];
  readonly deleted: readonly CharacterLibraryEntry[];
}

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
  return openDB<CharacterDatabase>(name, 5, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
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
      if (!db.objectStoreNames.contains("characterMetadata")) {
        const metadata = db.createObjectStore("characterMetadata", {
          keyPath: "id",
        });
        metadata.createIndex("by-updated", "updatedAt");
        metadata.createIndex("by-deleted", "deletedAt");
      }
      if (!db.objectStoreNames.contains("contentPackMetadata")) {
        const metadata = db.createObjectStore("contentPackMetadata", {
          keyPath: "packId",
        });
        metadata.createIndex("by-name", "manifest.name");
        const request = unwrap(
          transaction.objectStore("contentPacks"),
        ).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) return;
          const stored = cursor.value;
          unwrap(metadata).put({
            packId: stored.packId,
            manifest: stored.manifest,
            origin: stored.origin ?? "personal",
            ...(stored.advertised === undefined
              ? {}
              : { advertised: stored.advertised }),
          });
          cursor.continue();
        };
      }
      if (!db.objectStoreNames.contains("characterPortraits")) {
        db.createObjectStore("characterPortraits", {
          keyPath: "id",
        });
      }
      if (_oldVersion < 5) {
        const metadata = unwrap(transaction.objectStore("characterMetadata"));
        const portraits = unwrap(transaction.objectStore("characterPortraits"));
        const request = unwrap(
          transaction.objectStore("characters"),
        ).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) return;
          metadata.put(characterMetadata(cursor.value));
          const thumbnail = characterPortraitThumbnail(cursor.value);
          if (thumbnail !== undefined) portraits.put(thumbnail);
          cursor.continue();
        };
      }
    },
  });
}

function characterMetadata(
  record: StoredCharacterRecord,
): StoredCharacterMetadata {
  const current = record.schemaVersion === 2 ? record : undefined;
  // Read race/class from the edited build; the import-time snapshot is only
  // a fallback for v1 records that have no build.
  const race =
    current === undefined
      ? record.snapshot.details.Race
      : buildElementNames(current.build, "Race")[0];
  const className =
    current === undefined
      ? record.snapshot.details.Class
      : (buildElementNames(current.build, "Class")[0] ??
        (buildElementNames(current.build, "Hybrid Class").join(" / ") ||
          undefined));
  // Like race and class, read from the build up to its effective level (a
  // v1 record without a build shows neither).
  const paragonPath =
    current === undefined
      ? undefined
      : buildElementNames(current.build, "Paragon Path").at(-1);
  const epicDestiny =
    current === undefined
      ? undefined
      : buildElementNames(current.build, "Epic Destiny").at(-1);
  return {
    metadataVersion: CHARACTER_METADATA_VERSION,
    id: record.id,
    title: current === undefined ? record.title : characterDisplayName(current),
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
    effectiveLevel:
      current?.build.effectiveLevel ?? record.snapshot.levelCount ?? 1,
    ...(race === undefined ? {} : { race }),
    ...(className === undefined ? {} : { className }),
    ...(paragonPath === undefined ? {} : { paragonPath }),
    ...(epicDestiny === undefined ? {} : { epicDestiny }),
    ...(record.profileBinding === undefined
      ? {}
      : {
          contentRevision: {
            packId: record.profileBinding.packId,
            ...(record.profileBinding.contentDigest === undefined
              ? {}
              : { contentDigest: record.profileBinding.contentDigest }),
          },
        }),
  };
}

/** Lazy metadata migration: rows written by an older characterMetadata()
 *  (or by the content repository's copy of the v5 upgrade) are re-derived
 *  from their records and written back, so later reads stay a plain index
 *  scan. A row whose record is missing is returned as it is. */
async function refreshStaleMetadata(
  db: Awaited<ReturnType<typeof database>>,
  rows: readonly StoredCharacterMetadata[],
): Promise<readonly StoredCharacterMetadata[]> {
  if (rows.every((row) => row.metadataVersion === CHARACTER_METADATA_VERSION))
    return rows;
  const transaction = db.transaction(
    ["characters", "characterMetadata"],
    "readwrite",
  );
  const refreshed = await Promise.all(
    rows.map(async (row) => {
      if (row.metadataVersion === CHARACTER_METADATA_VERSION) return row;
      const record = await transaction.objectStore("characters").get(row.id);
      if (record === undefined) return row;
      const next = withPreviousSummary(characterMetadata(record), row);
      await transaction.objectStore("characterMetadata").put(next);
      return next;
    }),
  );
  await transaction.done;
  return refreshed;
}

function characterPortraitThumbnail(
  record: StoredCharacterRecord,
): CharacterPortraitThumbnail | undefined {
  return record.portrait === undefined
    ? undefined
    : { id: record.id, renderedDataUrl: record.portrait.renderedDataUrl };
}

async function writeStoredCharacter(
  transaction: IDBPTransaction<
    CharacterDatabase,
    (
      | "characters"
      | "characterMetadata"
      | "characterPortraits"
      | "characterMigrations"
    )[],
    "readwrite"
  >,
  character: StoredCharacterRecord,
): Promise<void> {
  await transaction.objectStore("characters").put(character);
  const metadata = transaction.objectStore("characterMetadata");
  await metadata.put(
    withPreviousSummary(
      characterMetadata(character),
      await metadata.get(character.id),
    ),
  );
  const thumbnail = characterPortraitThumbnail(character);
  if (thumbnail === undefined)
    await transaction.objectStore("characterPortraits").delete(character.id);
  else await transaction.objectStore("characterPortraits").put(thumbnail);
}

export class CharacterRepository {
  readonly #databaseName: string;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.#databaseName = databaseName;
  }

  async put(character: CharacterRecord): Promise<void> {
    const db = await database(this.#databaseName);
    try {
      const transaction = db.transaction(
        ["characters", "characterMetadata", "characterPortraits"],
        "readwrite",
      );
      await writeStoredCharacter(transaction, character);
      await transaction.done;
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

  async listMetadataPartitioned(): Promise<PartitionedCharacterMetadata> {
    const db = await database(this.#databaseName);
    try {
      await recoverCharacterMigrations(db);
      const transaction = db.transaction(
        ["characterMetadata", "characterPortraits"],
        "readonly",
      );
      const [records, thumbnails] = await Promise.all([
        transaction
          .objectStore("characterMetadata")
          .index("by-updated")
          .getAll(),
        transaction.objectStore("characterPortraits").getAll(),
      ]);
      await transaction.done;
      const current = await refreshStaleMetadata(db, records);
      const portraitById = new Map(
        thumbnails.map(({ id, renderedDataUrl }) => [id, renderedDataUrl]),
      );
      const active: CharacterLibraryEntry[] = [];
      const deleted: CharacterLibraryEntry[] = [];
      for (const record of [...current].reverse()) {
        const renderedPortraitDataUrl = portraitById.get(record.id);
        const { metadataVersion: _metadataVersion, ...metadata } = record;
        void _metadataVersion;
        const entry = {
          ...metadata,
          ...(renderedPortraitDataUrl === undefined
            ? {}
            : { renderedPortraitDataUrl }),
        };
        (record.deletedAt === undefined ? active : deleted).push(entry);
      }
      return { active, deleted };
    } finally {
      db.close();
    }
  }

  /** Saves a library summary on the character's metadata row, unless the
   *  character changed (or is gone) since the summary was computed; returns
   *  whether it was saved. */
  async putLibrarySummary(
    id: string,
    summary: CharacterLibrarySummary,
  ): Promise<boolean> {
    const db = await database(this.#databaseName);
    try {
      const transaction = db.transaction("characterMetadata", "readwrite");
      const row = await transaction.store.get(id);
      const saved =
        row !== undefined && librarySummaryMatchesCharacter(summary, row);
      if (saved)
        await transaction.store.put({ ...row, librarySummary: summary });
      await transaction.done;
      return saved;
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
      readonly portrait?: CharacterPortrait | null;
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
    const portrait =
      changes.portrait === null
        ? undefined
        : (changes.portrait ?? current.portrait);
    const { portrait: _currentPortrait, ...withoutPortrait } =
      withoutProfileBinding;
    void _currentPortrait;
    const updated: CharacterRecord = {
      ...withoutPortrait,
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
      ...(portrait === undefined ? {} : { portrait }),
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
      const transaction = db.transaction(
        ["characters", "characterMetadata", "characterPortraits"],
        "readwrite",
      );
      await transaction.objectStore("characters").delete(id);
      await transaction.objectStore("characterMetadata").delete(id);
      await transaction.objectStore("characterPortraits").delete(id);
      await transaction.done;
    } finally {
      db.close();
    }
  }

  /** Permanently deletes every trashed character (record, metadata and
   *  portrait) in one transaction; returns how many were deleted. */
  async emptyTrash(): Promise<number> {
    const db = await database(this.#databaseName);
    try {
      const transaction = db.transaction(
        ["characters", "characterMetadata", "characterPortraits"],
        "readwrite",
      );
      const characters = transaction.objectStore("characters");
      const metadata = transaction.objectStore("characterMetadata");
      const portraits = transaction.objectStore("characterPortraits");
      // Only records with a deletedAt appear in the by-deleted index.
      const ids = new Set([
        ...(await characters.index("by-deleted").getAllKeys()),
        ...(await metadata.index("by-deleted").getAllKeys()),
      ]);
      for (const id of ids) {
        await characters.delete(id);
        await metadata.delete(id);
        await portraits.delete(id);
      }
      await transaction.done;
      return ids.size;
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

  async exportCharacter(id: string): Promise<CharacterBackup> {
    const character = await this.required(id);
    const characters = [character];
    return {
      format: "4ecb-character-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      characterCount: 1,
      payloadDigest: await characterPayloadDigest(characters),
      characters,
    };
  }

  async inspectBackup(backup: unknown): Promise<CharacterBackupInspection> {
    const supported = await validateBackup(backup);
    const current = await this.listMetadataPartitioned();
    const currentIds = new Set(
      [...current.active, ...current.deleted].map((character) => character.id),
    );
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
      const transaction = db.transaction(
        ["characters", "characterMetadata", "characterPortraits"],
        "readwrite",
      );
      await Promise.all(
        characters.map((character) =>
          writeStoredCharacter(transaction, character),
        ),
      );
      await transaction.done;
      return characters.length;
    } finally {
      db.close();
    }
  }

  /** Adds the characters in a native package (.4ecb or full backup) to the
   *  library as active records. Unlike a restore, it never overwrites: a
   *  character whose ID is already stored (active or trashed) is added under
   *  a fresh ID. */
  async importCharacters(backup: unknown): Promise<CharacterRecord[]> {
    const supported = await validateBackup(backup);
    const db = await database(this.#databaseName);
    try {
      const existing = new Set(await db.getAllKeys("characters"));
      const characters = supported.characters.map((stored) => {
        const { deletedAt: _deletedAt, id, ...record } = upgradeRecord(stored);
        void _deletedAt;
        const importedId = existing.has(id) ? crypto.randomUUID() : id;
        existing.add(importedId);
        return { ...record, id: importedId };
      });
      const transaction = db.transaction(
        ["characters", "characterMetadata", "characterPortraits"],
        "readwrite",
      );
      await Promise.all(
        characters.map((character) =>
          writeStoredCharacter(transaction, character),
        ),
      );
      await transaction.done;
      return characters;
    } finally {
      db.close();
    }
  }

  async required(id: string): Promise<CharacterRecord> {
    const character = await this.get(id);
    if (character === undefined) throw new Error(`Character not found: ${id}`);
    return character;
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
  return (
    isCharacterRecord(value) ||
    isCharacterRecordWithBuildV2(value) ||
    isCharacterRecordWithBuildV1(value) ||
    isLegacyCharacterRecordV1(value)
  );
}

/**
 * Upgrades a stored record to the current schema and build format. Schema-1
 * records are re-imported from their source; a format-1 build moves its
 * ritual holdings into the known list, and a format-2 build settles its
 * per-level loot into current holdings, keeping the original rows as
 * inventory history. All are idempotent and keep every entry.
 */
function upgradeRecord(value: StoredCharacterRecord): CharacterRecord {
  if (isCurrentStoredRecord(value)) return value;
  if (value.schemaVersion === 2)
    return { ...value, build: upgradeCharacterBuild(value.build) };
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
  if (isCurrentStoredRecord(stored)) return stored;
  await db.put("characterMigrations", {
    id: stored.id,
    previous: stored,
    startedAt: new Date().toISOString(),
  });
  const migrated = upgradeRecord(stored);
  const transaction = db.transaction(
    [
      "characters",
      "characterMetadata",
      "characterPortraits",
      "characterMigrations",
    ],
    "readwrite",
  );
  await writeStoredCharacter(transaction, migrated);
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
    if (current !== undefined && isCurrentStoredRecord(current)) {
      await db.delete("characterMigrations", journal.id);
      continue;
    }
    if (current === undefined) {
      const transaction = db.transaction(
        [
          "characters",
          "characterMetadata",
          "characterPortraits",
          "characterMigrations",
        ],
        "readwrite",
      );
      await writeStoredCharacter(transaction, journal.previous);
      await transaction.objectStore("characterMigrations").delete(journal.id);
      await transaction.done;
    }
  }
}
