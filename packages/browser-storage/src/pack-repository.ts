import {
  decodeContentPackBytes,
  encodeContentPack,
  composeContentPacks,
  CONTENT_PROFILE_RESOLUTION_POLICY,
  validateContentPack,
  type ContentPack,
  type ContentPackDecodeOptions,
  type ContentProfileLayer,
  type ContentPackManifest,
} from "@4ecb/content-pack";
import type { StoredCharacterRecord } from "@4ecb/character-domain";
import {
  deleteDB,
  openDB,
  unwrap,
  type DBSchema,
  type IDBPDatabase,
} from "idb";

interface StoredContentPackBase {
  readonly packId: string;
  readonly manifest: ContentPackManifest;
  readonly origin?: InstalledPackOrigin;
  readonly advertised?: AdvertisedPackSource;
}

interface EncodedStoredContentPack extends StoredContentPackBase {
  readonly encodedPack: ArrayBuffer;
}

interface LegacyStoredContentPack extends StoredContentPackBase {
  readonly pack: ContentPack;
}

type StoredContentPack = EncodedStoredContentPack | LegacyStoredContentPack;

interface Setting<Value> {
  readonly key: string;
  readonly value: Value;
}

interface CharacterBuilderDatabase extends DBSchema {
  contentPacks: {
    key: string;
    value: StoredContentPack;
    indexes: { "by-name": string };
  };
  contentPackMetadata: {
    key: string;
    value: InstalledContentPackMetadata;
    indexes: { "by-name": string };
  };
  settings: {
    key: string;
    value: Setting<unknown>;
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
    value: StoredCharacterPortraitThumbnail;
  };
  characterMigrations: {
    key: string;
    value: {
      readonly id: string;
      readonly previous: StoredCharacterRecord;
      readonly startedAt: string;
    };
  };
}

interface StoredCharacterMetadata {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
  readonly effectiveLevel: number;
  readonly race?: string;
  readonly className?: string;
}

interface StoredCharacterPortraitThumbnail {
  readonly id: string;
  readonly renderedDataUrl: string;
}

interface InstalledContentPackMetadata {
  readonly packId: string;
  readonly manifest: ContentPackManifest;
  readonly origin: InstalledPackOrigin;
  readonly advertised?: AdvertisedPackSource;
}

const DEFAULT_DATABASE_NAME = "4ecb";
const ACTIVE_PACK_KEY = "active-content-pack";
const ACTIVE_PROFILE_KEY = "active-content-profile";

async function materializedProfilePackId(
  profileId: string,
  packs: readonly ContentPack[],
): Promise<string> {
  const input = new TextEncoder().encode(
    packs
      .map(({ manifest }) => `${manifest.packId}:${manifest.contentDigest}`)
      .join(">"),
  );
  const hash = await crypto.subtle.digest("SHA-256", input);
  const suffix = [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  return `profile:${profileId.slice(0, 40)}:${suffix}`;
}

export type InstalledPackOrigin = "personal" | "server" | "profile";
export interface AdvertisedPackSource {
  readonly url: string;
  readonly contentDigest: string;
}
export interface InstalledContentPack {
  readonly manifest: ContentPackManifest;
  readonly origin: InstalledPackOrigin;
  readonly advertised?: AdvertisedPackSource;
}
export interface ContentProfileDefinition {
  readonly profileId: string;
  readonly name: string;
  readonly layers: readonly ContentProfileLayer[];
  readonly resolutionPolicy: typeof CONTENT_PROFILE_RESOLUTION_POLICY;
  readonly materializedPackId: string;
  readonly contentDigest: string;
}
export interface ContentProfilePreview {
  readonly definition: ContentProfileDefinition;
  readonly collisions: readonly string[];
}

export interface ValidatedPackStorageMetadata {
  readonly origin?: InstalledPackOrigin;
  readonly advertised?: AdvertisedPackSource;
}

async function openContentDatabase(
  databaseName: string,
): Promise<IDBPDatabase<CharacterBuilderDatabase>> {
  return openDB<CharacterBuilderDatabase>(databaseName, 5, {
    upgrade(database, _oldVersion, _newVersion, transaction) {
      if (!database.objectStoreNames.contains("contentPacks")) {
        const packs = database.createObjectStore("contentPacks", {
          keyPath: "packId",
        });
        packs.createIndex("by-name", "manifest.name");
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("characters")) {
        const characters = database.createObjectStore("characters", {
          keyPath: "id",
        });
        characters.createIndex("by-updated", "updatedAt");
        characters.createIndex("by-deleted", "deletedAt");
      }
      if (!database.objectStoreNames.contains("characterMigrations")) {
        database.createObjectStore("characterMigrations", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("contentPackMetadata")) {
        const metadata = database.createObjectStore("contentPackMetadata", {
          keyPath: "packId",
        });
        metadata.createIndex("by-name", "manifest.name");
        const request = unwrap(
          transaction.objectStore("contentPacks"),
        ).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) return;
          unwrap(metadata).put(contentPackMetadata(cursor.value));
          cursor.continue();
        };
      }
      if (!database.objectStoreNames.contains("characterMetadata")) {
        const metadata = database.createObjectStore("characterMetadata", {
          keyPath: "id",
        });
        metadata.createIndex("by-updated", "updatedAt");
        metadata.createIndex("by-deleted", "deletedAt");
      }
      if (!database.objectStoreNames.contains("characterPortraits")) {
        database.createObjectStore("characterPortraits", {
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
          metadata.put(storedCharacterMetadata(cursor.value));
          if (cursor.value.portrait !== undefined)
            portraits.put({
              id: cursor.value.id,
              renderedDataUrl: cursor.value.portrait.renderedDataUrl,
            });
          cursor.continue();
        };
      }
    },
  });
}

function storedCharacterMetadata(
  record: StoredCharacterRecord,
): StoredCharacterMetadata {
  const current = record.schemaVersion === 2 ? record : undefined;
  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
    effectiveLevel:
      current?.build.effectiveLevel ?? record.snapshot.levelCount ?? 1,
    ...(record.snapshot.details.Race === undefined
      ? {}
      : { race: record.snapshot.details.Race }),
    ...(record.snapshot.details.Class === undefined
      ? {}
      : { className: record.snapshot.details.Class }),
  };
}

function contentPackMetadata(
  stored: StoredContentPack,
): InstalledContentPackMetadata {
  return {
    packId: stored.packId,
    manifest: stored.manifest,
    origin: stored.origin ?? "personal",
    ...(stored.advertised === undefined
      ? {}
      : { advertised: stored.advertised }),
  };
}

async function listContentPackMetadata(
  database: IDBPDatabase<CharacterBuilderDatabase>,
): Promise<InstalledContentPackMetadata[]> {
  const transaction = database.transaction(
    ["contentPacks", "contentPackMetadata"],
    "readonly",
  );
  const [stored, packIds] = await Promise.all([
    transaction.objectStore("contentPackMetadata").index("by-name").getAll(),
    transaction.objectStore("contentPacks").getAllKeys(),
  ]);
  await transaction.done;
  const metadataIds = new Set(stored.map(({ packId }) => packId));
  if (
    stored.length === packIds.length &&
    packIds.every((packId) => metadataIds.has(packId))
  )
    return stored;

  const repair = database.transaction(
    ["contentPacks", "contentPackMetadata"],
    "readwrite",
  );
  const packs = repair.objectStore("contentPacks");
  const metadata = repair.objectStore("contentPackMetadata");
  const [currentPackIds, currentMetadata] = await Promise.all([
    packs.getAllKeys(),
    metadata.getAll(),
  ]);
  const currentPackIdSet = new Set(currentPackIds);
  const currentMetadataIds = new Set(
    currentMetadata.map(({ packId }) => packId),
  );
  for (const { packId } of currentMetadata)
    if (!currentPackIdSet.has(packId)) await metadata.delete(packId);
  for (const packId of currentPackIds) {
    if (currentMetadataIds.has(packId)) continue;
    const storedPack = await packs.get(packId);
    if (storedPack !== undefined)
      await metadata.put(contentPackMetadata(storedPack));
  }
  await repair.done;
  return database.getAllFromIndex("contentPackMetadata", "by-name");
}

async function getContentPackManifest(
  database: IDBPDatabase<CharacterBuilderDatabase>,
  packId: string,
): Promise<ContentPackManifest | undefined> {
  const transaction = database.transaction(
    ["contentPacks", "contentPackMetadata"],
    "readwrite",
  );
  const packs = transaction.objectStore("contentPacks");
  const metadata = transaction.objectStore("contentPackMetadata");
  const [storedMetadata, storedPackKey] = await Promise.all([
    metadata.get(packId),
    packs.getKey(packId),
  ]);
  if (storedPackKey === undefined) {
    if (storedMetadata !== undefined) await metadata.delete(packId);
    await transaction.done;
    return undefined;
  }
  if (storedMetadata !== undefined) {
    await transaction.done;
    return storedMetadata.manifest;
  }
  const storedPack = await packs.get(packId);
  if (storedPack === undefined) {
    await transaction.done;
    return undefined;
  }
  const repaired = contentPackMetadata(storedPack);
  await metadata.put(repaired);
  await transaction.done;
  return repaired.manifest;
}

export class ContentPackRepository {
  readonly #databaseName: string;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.#databaseName = databaseName;
  }

  async install(pack: ContentPack): Promise<ContentPackManifest> {
    await assertValidPack(pack);
    const bytes = new TextEncoder().encode(encodeContentPack(pack));
    return storeValidatedContentPack(this.#databaseName, pack, bytes.buffer, {
      origin: "personal",
    });
  }

  async installEncoded(
    encodedPack: ArrayBuffer,
    metadata: {
      readonly origin?: InstalledPackOrigin;
      readonly advertised?: AdvertisedPackSource;
    } = {},
  ): Promise<ContentPackManifest> {
    const pack = await decodeContentPackBytes(encodedPack);
    await assertValidPack(pack);
    return storeValidatedContentPack(
      this.#databaseName,
      pack,
      encodedPack,
      metadata,
    );
  }

  async list(): Promise<ContentPackManifest[]> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const stored = await listContentPackMetadata(database);
      return stored.map((entry) => entry.manifest);
    } finally {
      database.close();
    }
  }

  async listInstalled(): Promise<InstalledContentPack[]> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const stored = await listContentPackMetadata(database);
      return stored.map((entry) => ({
        manifest: entry.manifest,
        origin: entry.origin ?? "personal",
        ...(entry.advertised === undefined
          ? {}
          : { advertised: entry.advertised }),
      }));
    } finally {
      database.close();
    }
  }

  async get(
    packId: string,
    options: ContentPackDecodeOptions = {},
  ): Promise<ContentPack | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const stored = await database.get("contentPacks", packId);
      if (stored === undefined) return undefined;
      if ("pack" in stored) return stored.pack;
      return decodeStoredPack(stored.encodedPack, options);
    } finally {
      database.close();
    }
  }

  async manifest(packId: string): Promise<ContentPackManifest | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      return getContentPackManifest(database, packId);
    } finally {
      database.close();
    }
  }

  async remove(packId: string): Promise<void> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const activeProfile = await database.get("settings", ACTIVE_PROFILE_KEY);
      const profile = activeProfile?.value as
        ContentProfileDefinition | undefined;
      if (
        profile?.layers.some((layer) => layer.packId === packId) === true ||
        profile?.materializedPackId === packId
      )
        throw new Error(
          `Cannot remove ${packId} while the active profile uses it`,
        );
      const transaction = database.transaction(
        ["contentPacks", "contentPackMetadata", "settings"],
        "readwrite",
      );
      await transaction.objectStore("contentPacks").delete(packId);
      await transaction.objectStore("contentPackMetadata").delete(packId);
      const active = await transaction
        .objectStore("settings")
        .get(ACTIVE_PACK_KEY);
      if (active?.value === packId) {
        await transaction.objectStore("settings").delete(ACTIVE_PACK_KEY);
      }
      await transaction.done;
    } finally {
      database.close();
    }
  }

  async activate(packId: string): Promise<void> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const transaction = database.transaction(
        ["contentPacks", "contentPackMetadata", "settings"],
        "readwrite",
      );
      const packs = transaction.objectStore("contentPacks");
      const metadata = transaction.objectStore("contentPackMetadata");
      const [storedMetadata, storedPackKey] = await Promise.all([
        metadata.get(packId),
        packs.getKey(packId),
      ]);
      if (storedPackKey === undefined) {
        if (storedMetadata !== undefined) await metadata.delete(packId);
        throw new Error(`Cannot activate missing content pack ${packId}`);
      }
      if (storedMetadata === undefined) {
        const storedPack = await packs.get(packId);
        if (storedPack === undefined)
          throw new Error(`Cannot activate missing content pack ${packId}`);
        await metadata.put(contentPackMetadata(storedPack));
      }
      await transaction
        .objectStore("settings")
        .put({ key: ACTIVE_PACK_KEY, value: packId });
      await transaction.objectStore("settings").delete(ACTIVE_PROFILE_KEY);
      await transaction.done;
    } finally {
      database.close();
    }
  }

  async deactivate(): Promise<void> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const transaction = database.transaction("settings", "readwrite");
      await transaction.store.delete(ACTIVE_PACK_KEY);
      await transaction.store.delete(ACTIVE_PROFILE_KEY);
      await transaction.done;
    } finally {
      database.close();
    }
  }

  async activePackId(): Promise<string | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const setting = await database.get("settings", ACTIVE_PACK_KEY);
      return typeof setting?.value === "string" ? setting.value : undefined;
    } finally {
      database.close();
    }
  }

  async previewProfile(
    profileId: string,
    name: string,
    layerPackIds: readonly string[],
  ): Promise<ContentProfilePreview> {
    const packs: ContentPack[] = [];
    const installed = new Map(
      (await this.listInstalled()).map((entry) => [
        entry.manifest.packId,
        entry,
      ]),
    );
    let personalSeen = false;
    for (const packId of layerPackIds) {
      const origin = installed.get(packId)?.origin;
      if (origin === "profile")
        throw new Error(
          "A materialized profile cannot be used as a source layer",
        );
      if (origin === "personal") personalSeen = true;
      if (origin === "server" && personalSeen)
        throw new Error("Server baseline layers must precede personal layers");
      const pack = await this.get(packId);
      if (pack === undefined)
        throw new Error(`Missing content profile layer ${packId}`);
      packs.push(pack);
    }
    const materializedPackId = await materializedProfilePackId(
      profileId,
      packs,
    );
    const composed = await composeContentPacks(packs, {
      packId: materializedPackId,
      name,
    });
    return {
      definition: {
        profileId,
        name,
        layers: composed.layers,
        resolutionPolicy: composed.resolutionPolicy,
        materializedPackId,
        contentDigest: composed.pack.manifest.contentDigest,
      },
      collisions: composed.pack.diagnostics.flatMap((diagnostic) =>
        diagnostic.code === "profile.entity-overridden" &&
        diagnostic.entityId !== undefined
          ? [diagnostic.entityId]
          : [],
      ),
    };
  }

  async activateProfile(
    profileId: string,
    name: string,
    layerPackIds: readonly string[],
  ): Promise<ContentProfileDefinition> {
    const packs: ContentPack[] = [];
    const installed = new Map(
      (await this.listInstalled()).map((entry) => [
        entry.manifest.packId,
        entry,
      ]),
    );
    let personalSeen = false;
    for (const packId of layerPackIds) {
      const origin = installed.get(packId)?.origin;
      if (origin === "profile")
        throw new Error(
          "A materialized profile cannot be used as a source layer",
        );
      if (origin === "personal") personalSeen = true;
      if (origin === "server" && personalSeen)
        throw new Error("Server baseline layers must precede personal layers");
      const pack = await this.get(packId);
      if (pack === undefined)
        throw new Error(`Missing content profile layer ${packId}`);
      packs.push(pack);
    }
    const materializedPackId = await materializedProfilePackId(
      profileId,
      packs,
    );
    const composed = await composeContentPacks(packs, {
      packId: materializedPackId,
      name,
    });
    await assertValidPack(composed.pack);
    await storeValidatedContentPack(
      this.#databaseName,
      composed.pack,
      new TextEncoder().encode(encodeContentPack(composed.pack)).buffer,
      { origin: "profile" },
    );
    const definition: ContentProfileDefinition = {
      profileId,
      name,
      layers: composed.layers,
      resolutionPolicy: composed.resolutionPolicy,
      materializedPackId,
      contentDigest: composed.pack.manifest.contentDigest,
    };
    const database = await openContentDatabase(this.#databaseName);
    try {
      const transaction = database.transaction("settings", "readwrite");
      await transaction.store.put({
        key: ACTIVE_PROFILE_KEY,
        value: definition,
      });
      await transaction.store.put({
        key: ACTIVE_PACK_KEY,
        value: materializedPackId,
      });
      await transaction.done;
    } finally {
      database.close();
    }
    return definition;
  }

  async activeProfile(): Promise<ContentProfileDefinition | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const setting = await database.get("settings", ACTIVE_PROFILE_KEY);
      if (setting !== undefined)
        return setting.value as ContentProfileDefinition;
      const legacy = await database.get("settings", ACTIVE_PACK_KEY);
      if (typeof legacy?.value !== "string") return undefined;
      const manifest = await getContentPackManifest(database, legacy.value);
      if (manifest === undefined) return undefined;
      return {
        profileId: `legacy:${manifest.packId}`,
        name: manifest.name,
        layers: [
          {
            packId: manifest.packId,
            contentDigest: manifest.contentDigest,
          },
        ],
        resolutionPolicy: CONTENT_PROFILE_RESOLUTION_POLICY,
        materializedPackId: manifest.packId,
        contentDigest: manifest.contentDigest,
      };
    } finally {
      database.close();
    }
  }
}

/** @internal The caller must establish the decode-and-validation trust boundary. */
export async function storeValidatedContentPack(
  databaseName: string,
  pack: ContentPack,
  encodedPack: ArrayBuffer,
  metadata: ValidatedPackStorageMetadata = {},
): Promise<ContentPackManifest> {
  const database = await openContentDatabase(databaseName);
  try {
    const existing = await database.get("contentPacks", pack.manifest.packId);
    if (
      existing !== undefined &&
      existing.manifest.contentDigest !== pack.manifest.contentDigest
    )
      throw new Error(
        `Pack ID ${pack.manifest.packId} is already installed with a different digest`,
      );
    const stored: EncodedStoredContentPack = {
      packId: pack.manifest.packId,
      manifest: pack.manifest,
      encodedPack,
      origin: metadata.origin ?? "personal",
      ...(metadata.advertised === undefined
        ? {}
        : { advertised: metadata.advertised }),
    };
    const transaction = database.transaction(
      ["contentPacks", "contentPackMetadata"],
      "readwrite",
    );
    await transaction.objectStore("contentPacks").put(stored);
    await transaction
      .objectStore("contentPackMetadata")
      .put(contentPackMetadata(stored));
    await transaction.done;
    return pack.manifest;
  } finally {
    database.close();
  }
}

async function decodeStoredPack(
  encoded: ArrayBuffer,
  options: ContentPackDecodeOptions = {},
): Promise<ContentPack> {
  return decodeContentPackBytes(encoded, {}, options);
}

async function assertValidPack(pack: ContentPack): Promise<void> {
  const validation = await validateContentPack(pack);
  if (!validation.valid)
    throw new Error(
      `Cannot install invalid content pack: ${validation.errors.join("; ")}`,
    );
}

export async function deleteContentDatabase(
  databaseName = DEFAULT_DATABASE_NAME,
): Promise<void> {
  await deleteDB(databaseName);
}
