import { openDB, type DBSchema } from "idb";

interface StoredEvaluation {
  readonly key: string;
  readonly engineVersion: string;
  readonly profileRevision: string;
  readonly result: unknown;
  readonly createdAt: number;
  readonly usedAt: number;
}

interface EvaluationCacheDatabase extends DBSchema {
  evaluations: {
    key: string;
    value: StoredEvaluation;
    indexes: { "by-used": number };
  };
}

const DEFAULT_DATABASE_NAME = "4ecb-derived-evaluations";
const DEFAULT_MAX_ENTRIES = 24;

async function database(name: string) {
  return openDB<EvaluationCacheDatabase>(name, 1, {
    upgrade(db) {
      const evaluations = db.createObjectStore("evaluations", {
        keyPath: "key",
      });
      evaluations.createIndex("by-used", "usedAt");
    },
  });
}

/**
 * Disposable exact-result storage. Character records never depend on this
 * database: absent, stale, malformed, or unreadable entries are cache misses.
 */
export class EvaluationCacheRepository {
  readonly #databaseName: string;
  readonly #maxEntries: number;
  #lastUsedAt = 0;

  constructor(
    databaseName = DEFAULT_DATABASE_NAME,
    maxEntries = DEFAULT_MAX_ENTRIES,
  ) {
    this.#databaseName = databaseName;
    this.#maxEntries = maxEntries;
  }

  async get(
    key: string,
    engineVersion: string,
    profileRevision: string,
  ): Promise<unknown | undefined> {
    const db = await database(this.#databaseName);
    try {
      const stored = await db.get("evaluations", key);
      if (
        stored === undefined ||
        stored.engineVersion !== engineVersion ||
        stored.profileRevision !== profileRevision
      )
        return undefined;
      await db.put("evaluations", { ...stored, usedAt: this.#nextUsedAt() });
      return stored.result;
    } finally {
      db.close();
    }
  }

  async put(
    key: string,
    engineVersion: string,
    profileRevision: string,
    result: unknown,
  ): Promise<void> {
    const db = await database(this.#databaseName);
    try {
      const now = this.#nextUsedAt();
      await db.put("evaluations", {
        key,
        engineVersion,
        profileRevision,
        result,
        createdAt: now,
        usedAt: now,
      });
      let excess = (await db.count("evaluations")) - this.#maxEntries;
      if (excess <= 0) return;
      const transaction = db.transaction("evaluations", "readwrite");
      let cursor = await transaction.store.index("by-used").openKeyCursor();
      while (cursor !== null && excess > 0) {
        await transaction.store.delete(cursor.primaryKey);
        excess -= 1;
        cursor = await cursor.continue();
      }
      await transaction.done;
    } finally {
      db.close();
    }
  }

  async delete(key: string): Promise<void> {
    const db = await database(this.#databaseName);
    try {
      await db.delete("evaluations", key);
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    const db = await database(this.#databaseName);
    try {
      await db.clear("evaluations");
    } finally {
      db.close();
    }
  }

  #nextUsedAt(): number {
    this.#lastUsedAt = Math.max(Date.now(), this.#lastUsedAt + 1);
    return this.#lastUsedAt;
  }
}
