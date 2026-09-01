import {
  duplicateCharacterRecord,
  type CharacterBuild,
  type CharacterBackup,
  type CharacterProfileBinding,
  type CharacterRecord,
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
    value: CharacterRecord;
    indexes: { "by-updated": string; "by-deleted": string };
  };
}

const DEFAULT_DATABASE_NAME = "4ecb";

async function database(name: string) {
  return openDB<CharacterDatabase>(name, 2, {
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
      const stored = await db.get("characters", id);
      if (stored === undefined) return undefined;
      const character = upgradeRecord(stored);
      if (character !== stored) await db.put("characters", character);
      return character;
    } finally {
      db.close();
    }
  }

  async list(
    options: { readonly deleted?: boolean } = {},
  ): Promise<CharacterRecord[]> {
    const db = await database(this.#databaseName);
    try {
      const stored = await db.getAllFromIndex("characters", "by-updated");
      const records = stored.map(upgradeRecord);
      await Promise.all(
        records.map((record, index) =>
          record === stored[index]
            ? Promise.resolve()
            : db.put("characters", record).then(() => undefined),
        ),
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
    const updated: CharacterRecord = {
      ...withoutProfileBinding,
      ...(changes.title === undefined
        ? {}
        : { title: changes.title.trim() || current.title }),
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
    const updated = { ...current, build, updatedAt: new Date().toISOString() };
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
      return {
        format: "4ecb-character-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        characters: await db.getAll("characters"),
      };
    } finally {
      db.close();
    }
  }

  async restoreBackup(backup: CharacterBackup): Promise<number> {
    if (
      backup.format !== "4ecb-character-backup" ||
      backup.version !== 1 ||
      !Array.isArray(backup.characters)
    )
      throw new Error("Unsupported character backup");
    if (!backup.characters.every(isStoredCharacter)) {
      throw new Error("Character backup contains an invalid record");
    }
    const characters = backup.characters.map(upgradeRecord);
    const db = await database(this.#databaseName);
    try {
      const transaction = db.transaction("characters", "readwrite");
      await Promise.all(
        characters.map((character) => transaction.store.put(character)),
      );
      await transaction.done;
      return backup.characters.length;
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

interface LegacyV1Record extends Omit<
  CharacterRecord,
  "schemaVersion" | "build"
> {
  readonly schemaVersion: 1;
}

function isStoredCharacter(value: unknown): value is CharacterRecord {
  if (value === null || typeof value !== "object") return false;
  const character = value as {
    schemaVersion?: number;
    id?: unknown;
    title?: unknown;
    legacy?: { format?: unknown; sourceXml?: unknown };
    snapshot?: { source?: unknown };
    sheetSettings?: { paper?: unknown };
  };
  return (
    (character.schemaVersion === 1 || character.schemaVersion === 2) &&
    typeof character.id === "string" &&
    typeof character.title === "string" &&
    character.legacy?.format === "dnd4e" &&
    typeof character.legacy.sourceXml === "string" &&
    character.snapshot?.source === "legacy-cache" &&
    character.sheetSettings?.paper !== undefined
  );
}

function upgradeRecord(value: CharacterRecord): CharacterRecord {
  if ((value as { readonly schemaVersion: number }).schemaVersion === 2)
    return value;
  const legacy = value as unknown as LegacyV1Record;
  const imported = importDnd4e(legacy.legacy.sourceXml);
  return {
    ...legacy,
    schemaVersion: 2,
    build: imported.build,
  };
}
