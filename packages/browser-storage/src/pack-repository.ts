import {
  validateContentPack,
  type ContentPack,
  type ContentPackManifest,
} from "@4ecb/content-pack";
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

interface StoredContentPack {
  readonly packId: string;
  readonly manifest: ContentPackManifest;
  readonly pack: ContentPack;
}

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
}

const DEFAULT_DATABASE_NAME = "4ecb";
const ACTIVE_PACK_KEY = "active-content-pack";

async function openContentDatabase(
  databaseName: string,
): Promise<IDBPDatabase<CharacterBuilderDatabase>> {
  return openDB<CharacterBuilderDatabase>(databaseName, 1, {
    upgrade(database) {
      const packs = database.createObjectStore("contentPacks", {
        keyPath: "packId",
      });
      packs.createIndex("by-name", "manifest.name");
      database.createObjectStore("settings", { keyPath: "key" });
    },
  });
}

export class ContentPackRepository {
  readonly #databaseName: string;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.#databaseName = databaseName;
  }

  async install(pack: ContentPack): Promise<ContentPackManifest> {
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
        pack,
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

  async get(packId: string): Promise<ContentPack | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      return (await database.get("contentPacks", packId))?.pack;
    } finally {
      database.close();
    }
  }

  async remove(packId: string): Promise<void> {
    const database = await openContentDatabase(this.#databaseName);
    try {
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
      await transaction.done;
    } finally {
      database.close();
    }
  }

  async deactivate(): Promise<void> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      await database.delete("settings", ACTIVE_PACK_KEY);
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
}

export async function deleteContentDatabase(
  databaseName = DEFAULT_DATABASE_NAME,
): Promise<void> {
  await deleteDB(databaseName);
}
