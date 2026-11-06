import {
  decodeContentPackBytes,
  encodeContentPack,
  composeCampaignProfile,
  composeContentPacks,
  CONTENT_PROFILE_RESOLUTION_POLICY,
  validateCampaign,
  validateContentPack,
  type CampaignDocument,
  type ContentPack,
  type ContentPackDecodeOptions,
  type ContentProfileLayer,
  type ContentPackManifest,
} from "@4ecb/content-pack";
import type {
  CharacterCampaignMembership,
  CharacterProfileBinding,
  StoredCharacterRecord,
} from "@4ecb/character-domain";
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

/** @internal */
export interface CharacterBuilderDatabase extends DBSchema {
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

/**
 * A materialized profile's pack ID: the profile ID and a hash of its layers
 * (and, for a campaign profile, `campaign:<id>:<digest>` after them).
 */
async function materializedProfilePackId(
  profileId: string,
  layers: readonly ContentProfileLayer[],
  campaign?: Pick<CampaignDocument, "campaignId" | "contentDigest">,
): Promise<string> {
  const input = new TextEncoder().encode(
    [
      ...layers.map(
        ({ packId, contentDigest }) => `${packId}:${contentDigest}`,
      ),
      ...(campaign === undefined
        ? []
        : [`campaign:${campaign.campaignId}:${campaign.contentDigest}`]),
    ].join(">"),
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
/**
 * A campaign character's profile (D116): base layers plus the campaign's
 * house-rule layer, materialized as its own stored pack. `profileId` is
 * `campaign:<campaignId>`; it is never the active profile.
 */
export interface CampaignProfileDefinition extends ContentProfileDefinition {
  readonly campaign: CharacterCampaignMembership;
}

/** The character binding for a materialized campaign profile. */
export function campaignProfileBinding(
  definition: CampaignProfileDefinition,
): CharacterProfileBinding {
  return {
    packId: definition.materializedPackId,
    contentDigest: definition.contentDigest,
    layers: definition.layers,
    resolutionPolicy: definition.resolutionPolicy,
    campaign: definition.campaign,
  };
}

export interface ValidatedPackStorageMetadata {
  readonly origin?: InstalledPackOrigin;
  readonly advertised?: AdvertisedPackSource;
}

/** @internal Opens the shared database (also used by the campaign repository). */
export async function openContentDatabase(
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
    const packs = await this.#sourceLayerPacks(
      await this.#sourceLayers(layerPackIds),
    );
    const materializedPackId = await materializedProfilePackId(
      profileId,
      packs.map(({ manifest }) => manifest),
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
    const packs = await this.#sourceLayerPacks(
      await this.#sourceLayers(layerPackIds),
    );
    const materializedPackId = await materializedProfilePackId(
      profileId,
      packs.map(({ manifest }) => manifest),
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

  /**
   * Materializes a campaign character's profile (D116): `baseLayerPackIds`
   * (the browser's active profile layers, personal packs included) with the
   * campaign's house rules on top. The pack ID hashes the base layers, the
   * overlay layer and the campaign's identity, so a stored pack with that ID
   * is reused as is; otherwise the profile is composed, its restrictions
   * resolved, and stored with origin "profile". The active profile is never
   * changed.
   */
  async materializeCampaignProfile(
    baseLayerPackIds: readonly string[],
    campaign: CampaignDocument,
  ): Promise<CampaignProfileDefinition> {
    const { base, materializedPackId, definition } =
      await this.#campaignProfilePlan(baseLayerPackIds, campaign);
    const stored = await this.manifest(materializedPackId);
    if (stored !== undefined) return definition(stored.contentDigest);
    const validation = await validateCampaign(campaign);
    if (!validation.valid)
      throw new Error(`Invalid campaign: ${validation.errors.join("; ")}`);
    const composed = await composeCampaignProfile(
      await this.#sourceLayerPacks(base),
      campaign,
      { packId: materializedPackId, name: campaign.name },
    );
    await assertValidPack(composed.pack);
    await storeValidatedContentPack(
      this.#databaseName,
      composed.pack,
      new TextEncoder().encode(encodeContentPack(composed.pack)).buffer,
      { origin: "profile" },
    );
    return definition(composed.pack.manifest.contentDigest);
  }

  /**
   * The profile `materializeCampaignProfile` would return, when its pack is
   * already stored; undefined when it still has to be composed. It reads
   * manifests only, so it is cheap on the main thread; the compose itself
   * runs in the content worker.
   */
  async storedCampaignProfile(
    baseLayerPackIds: readonly string[],
    campaign: CampaignDocument,
  ): Promise<CampaignProfileDefinition | undefined> {
    const { materializedPackId, definition } = await this.#campaignProfilePlan(
      baseLayerPackIds,
      campaign,
    );
    const stored = await this.manifest(materializedPackId);
    return stored === undefined ? undefined : definition(stored.contentDigest);
  }

  /** A campaign profile's checked base layers, pack ID and definition. */
  async #campaignProfilePlan(
    baseLayerPackIds: readonly string[],
    campaign: CampaignDocument,
  ): Promise<{
    readonly base: readonly ContentPackManifest[];
    readonly materializedPackId: string;
    readonly definition: (contentDigest: string) => CampaignProfileDefinition;
  }> {
    const base = await this.#sourceLayers(baseLayerPackIds);
    const layers: ContentProfileLayer[] = [
      ...base,
      campaign.houseRules.manifest,
    ].map(({ packId, contentDigest }) => ({ packId, contentDigest }));
    const profileId = `campaign:${campaign.campaignId}`;
    const materializedPackId = await materializedProfilePackId(
      profileId,
      layers,
      campaign,
    );
    return {
      base,
      materializedPackId,
      definition: (contentDigest) => ({
        profileId,
        name: campaign.name,
        layers,
        resolutionPolicy: CONTENT_PROFILE_RESOLUTION_POLICY,
        materializedPackId,
        contentDigest,
        campaign: {
          campaignId: campaign.campaignId,
          revision: campaign.revision,
          contentDigest: campaign.contentDigest,
        },
      }),
    };
  }

  /** Checks profile source layers (installed, not materialized, server
   *  before personal) and returns their manifests in order. */
  async #sourceLayers(
    layerPackIds: readonly string[],
  ): Promise<ContentPackManifest[]> {
    const installed = new Map(
      (await this.listInstalled()).map((entry) => [
        entry.manifest.packId,
        entry,
      ]),
    );
    const manifests: ContentPackManifest[] = [];
    let personalSeen = false;
    for (const packId of layerPackIds) {
      const entry = installed.get(packId);
      if (entry?.origin === "profile")
        throw new Error(
          "A materialized profile cannot be used as a source layer",
        );
      if (entry?.origin === "personal") personalSeen = true;
      if (entry?.origin === "server" && personalSeen)
        throw new Error("Server baseline layers must precede personal layers");
      if (entry === undefined)
        throw new Error(`Missing content profile layer ${packId}`);
      manifests.push(entry.manifest);
    }
    return manifests;
  }

  async #sourceLayerPacks(
    manifests: readonly ContentPackManifest[],
  ): Promise<ContentPack[]> {
    const packs: ContentPack[] = [];
    for (const { packId } of manifests) {
      const pack = await this.get(packId);
      if (pack === undefined)
        throw new Error(`Missing content profile layer ${packId}`);
      packs.push(pack);
    }
    return packs;
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
