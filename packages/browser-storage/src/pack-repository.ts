import {
  decodeContentPackBytes,
  encodeContentPack,
  composeContentPacks,
  CONTENT_PROFILE_RESOLUTION_POLICY,
  validateContentPack,
  type ContentPack,
  type ContentProfileLayer,
  type ContentPackManifest,
} from "@4ecb/content-pack";
import type { StoredCharacterRecord } from "@4ecb/character-domain";
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

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
  settings: {
    key: string;
    value: Setting<unknown>;
  };
  characters: {
    key: string;
    value: StoredCharacterRecord;
    indexes: { "by-updated": string; "by-deleted": string };
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

async function openContentDatabase(
  databaseName: string,
): Promise<IDBPDatabase<CharacterBuilderDatabase>> {
  return openDB<CharacterBuilderDatabase>(databaseName, 3, {
    upgrade(database) {
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
    },
  });
}

export class ContentPackRepository {
  readonly #databaseName: string;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.#databaseName = databaseName;
  }

  async install(pack: ContentPack): Promise<ContentPackManifest> {
    const bytes = new TextEncoder().encode(encodeContentPack(pack));
    return this.#store(pack, bytes.buffer, { origin: "personal" });
  }

  async installEncoded(
    encodedPack: ArrayBuffer,
    metadata: {
      readonly origin?: InstalledPackOrigin;
      readonly advertised?: AdvertisedPackSource;
    } = {},
  ): Promise<ContentPackManifest> {
    const pack = await decodeContentPackBytes(encodedPack);
    return this.#store(pack, encodedPack, metadata);
  }

  async #store(
    pack: ContentPack,
    encodedPack: ArrayBuffer,
    metadata: {
      readonly origin?: InstalledPackOrigin;
      readonly advertised?: AdvertisedPackSource;
    },
  ): Promise<ContentPackManifest> {
    const validation = await validateContentPack(pack);
    if (!validation.valid) {
      throw new Error(
        `Cannot install invalid content pack: ${validation.errors.join("; ")}`,
      );
    }

    const database = await openContentDatabase(this.#databaseName);
    try {
      const existing = await database.get("contentPacks", pack.manifest.packId);
      if (
        existing !== undefined &&
        existing.manifest.contentDigest !== pack.manifest.contentDigest
      ) {
        throw new Error(
          `Pack ID ${pack.manifest.packId} is already installed with a different digest`,
        );
      }
      await database.put("contentPacks", {
        packId: pack.manifest.packId,
        manifest: pack.manifest,
        encodedPack,
        origin: metadata.origin ?? "personal",
        ...(metadata.advertised === undefined
          ? {}
          : { advertised: metadata.advertised }),
      });
      return pack.manifest;
    } finally {
      database.close();
    }
  }

  async list(): Promise<ContentPackManifest[]> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const stored = await database.getAllFromIndex("contentPacks", "by-name");
      return stored.map((entry) => entry.manifest);
    } finally {
      database.close();
    }
  }

  async listInstalled(): Promise<InstalledContentPack[]> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const stored = await database.getAllFromIndex("contentPacks", "by-name");
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

  async get(packId: string): Promise<ContentPack | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const stored = await database.get("contentPacks", packId);
      if (stored === undefined) return undefined;
      if ("pack" in stored) return stored.pack;
      return decodeStoredPack(stored.encodedPack);
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
        ["contentPacks", "settings"],
        "readwrite",
      );
      await transaction.objectStore("contentPacks").delete(packId);
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
        ["contentPacks", "settings"],
        "readwrite",
      );
      const pack = await transaction.objectStore("contentPacks").get(packId);
      if (pack === undefined)
        throw new Error(`Cannot activate missing content pack ${packId}`);
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
    await this.#store(
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
      const stored = await database.get("contentPacks", legacy.value);
      if (stored === undefined) return undefined;
      return {
        profileId: `legacy:${stored.packId}`,
        name: stored.manifest.name,
        layers: [
          {
            packId: stored.packId,
            contentDigest: stored.manifest.contentDigest,
          },
        ],
        resolutionPolicy: CONTENT_PROFILE_RESOLUTION_POLICY,
        materializedPackId: stored.packId,
        contentDigest: stored.manifest.contentDigest,
      };
    } finally {
      database.close();
    }
  }
}

async function decodeStoredPack(encoded: ArrayBuffer): Promise<ContentPack> {
  return decodeContentPackBytes(encoded);
}

export async function deleteContentDatabase(
  databaseName = DEFAULT_DATABASE_NAME,
): Promise<void> {
  await deleteDB(databaseName);
}
