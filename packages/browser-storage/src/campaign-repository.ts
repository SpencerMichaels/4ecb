// Installed campaign documents (D116). They live in the shared `settings`
// store under `campaign:<campaignId>:<contentDigest>`, listed by key prefix,
// so no database version bump is needed. Every revision is kept; a
// campaign's identity is (campaignId, contentDigest) and its revision orders
// them.

import {
  decodeCampaign,
  encodeCampaign,
  type CampaignDocument,
} from "@4ecb/content-pack";

import { openContentDatabase } from "./pack-repository";

const DEFAULT_DATABASE_NAME = "4ecb";
const CAMPAIGN_KEY_PREFIX = "campaign:";

interface CampaignSetting {
  readonly key: string;
  readonly value: unknown;
}

/**
 * The part of an idb `settings` object store the campaign helpers use, so
 * the character repository can write campaigns inside its own transactions.
 */
export interface CampaignSettingsStore {
  get(key: string): Promise<CampaignSetting | undefined>;
  getAll(query: IDBKeyRange): Promise<CampaignSetting[]>;
  put(value: CampaignSetting): Promise<unknown>;
}

export function campaignSettingKey(
  campaignId: string,
  contentDigest: string,
): string {
  return `${CAMPAIGN_KEY_PREFIX}${campaignId}:${contentDigest}`;
}

/** Every installed campaign's keys, or one campaign's (filter by ID: IDs may
 *  contain colons, so a prefix can also match a longer campaign ID). */
export function campaignKeyRange(campaignId?: string): IDBKeyRange {
  const prefix =
    campaignId === undefined
      ? CAMPAIGN_KEY_PREFIX
      : `${CAMPAIGN_KEY_PREFIX}${campaignId}:`;
  return IDBKeyRange.bound(prefix, `${prefix}￿`);
}

function isStoredCampaign(value: unknown): value is CampaignDocument {
  const candidate = value as Partial<CampaignDocument> | null;
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    candidate.format === "4ecb-campaign" &&
    typeof candidate.campaignId === "string" &&
    typeof candidate.revision === "number" &&
    typeof candidate.contentDigest === "string"
  );
}

/** The installed campaigns among `settings` rows, by ID then revision. */
export function storedCampaigns(
  rows: readonly CampaignSetting[],
  campaignId?: string,
): CampaignDocument[] {
  return rows
    .map(({ value }) => value)
    .filter(isStoredCampaign)
    .filter(
      (campaign) =>
        campaignId === undefined || campaign.campaignId === campaignId,
    )
    .sort(
      (left, right) =>
        left.campaignId.localeCompare(right.campaignId) ||
        left.revision - right.revision,
    );
}

/**
 * Checks a campaign from outside the browser's trust boundary (a file, a
 * backup): re-encodes it and decodes it within the size limits, which checks
 * its shape and recomputes its digest. Throws when it is not a valid
 * campaign.
 */
export async function verifyCampaign(
  value: unknown,
): Promise<CampaignDocument> {
  let bytes: Uint8Array;
  try {
    bytes = encodeCampaign(value as CampaignDocument);
  } catch (error) {
    throw new Error(
      `Invalid campaign: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return await decodeCampaign(bytes.slice().buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message.startsWith("Invalid campaign")
        ? message
        : `Invalid campaign: ${message}`,
    );
  }
}

/**
 * Stores a verified campaign in `store`. Idempotent: an installed
 * (campaignId, contentDigest) is left as is. A different document under an
 * installed campaignId and revision is refused. Only IDB requests are
 * awaited, so it can run inside a caller's transaction.
 */
export async function putCampaign(
  store: CampaignSettingsStore,
  campaign: CampaignDocument,
): Promise<"installed" | "already-installed"> {
  const key = campaignSettingKey(campaign.campaignId, campaign.contentDigest);
  if ((await store.get(key)) !== undefined) return "already-installed";
  const conflict = storedCampaigns(
    await store.getAll(campaignKeyRange(campaign.campaignId)),
    campaign.campaignId,
  ).find(({ revision }) => revision === campaign.revision);
  if (conflict !== undefined)
    throw new Error(
      `Campaign ${campaign.campaignId} revision ${campaign.revision} is already installed with different content; bump the revision to publish a change`,
    );
  await store.put({ key, value: campaign });
  return "installed";
}

export class CampaignRepository {
  readonly #databaseName: string;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    this.#databaseName = databaseName;
  }

  /** Verifies and installs a campaign; returns the verified document. */
  async install(campaign: CampaignDocument): Promise<CampaignDocument> {
    return this.#store(await verifyCampaign(campaign));
  }

  /** Decodes, verifies and installs `.4ecc` bytes (gzip optional). */
  async installEncoded(bytes: ArrayBuffer): Promise<CampaignDocument> {
    return this.#store(await decodeCampaign(bytes));
  }

  async #store(campaign: CampaignDocument): Promise<CampaignDocument> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const transaction = database.transaction("settings", "readwrite");
      try {
        await putCampaign(transaction.store, campaign);
      } catch (error) {
        abort(transaction);
        throw error;
      }
      await transaction.done;
      return campaign;
    } finally {
      database.close();
    }
  }

  /** Every installed revision of every campaign, by ID then revision. */
  async list(): Promise<CampaignDocument[]> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      return storedCampaigns(
        await database.getAll("settings", campaignKeyRange()),
      );
    } finally {
      database.close();
    }
  }

  /** The installed revisions of one campaign, oldest first. */
  async revisions(campaignId: string): Promise<CampaignDocument[]> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      return storedCampaigns(
        await database.getAll("settings", campaignKeyRange(campaignId)),
        campaignId,
      );
    } finally {
      database.close();
    }
  }

  /** The newest installed revision of a campaign. */
  async latest(campaignId: string): Promise<CampaignDocument | undefined> {
    return (await this.revisions(campaignId)).at(-1);
  }

  async get(
    campaignId: string,
    contentDigest: string,
  ): Promise<CampaignDocument | undefined> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const row = await database.get(
        "settings",
        campaignSettingKey(campaignId, contentDigest),
      );
      return isStoredCampaign(row?.value) && row.value.campaignId === campaignId
        ? row.value
        : undefined;
    } finally {
      database.close();
    }
  }

  /**
   * Removes every installed revision of a campaign; refused while any
   * character, trashed ones included, belongs to it. Returns how many
   * revisions were removed.
   */
  async remove(campaignId: string): Promise<number> {
    const database = await openContentDatabase(this.#databaseName);
    try {
      const transaction = database.transaction(
        ["characters", "settings"],
        "readwrite",
      );
      let members = 0;
      let cursor = await transaction.objectStore("characters").openCursor();
      while (cursor !== null) {
        if (cursor.value.profileBinding?.campaign?.campaignId === campaignId)
          members += 1;
        cursor = await cursor.continue();
      }
      if (members > 0) {
        abort(transaction);
        throw new Error(
          `Cannot remove campaign ${campaignId} while ${members === 1 ? "a character belongs" : `${members} characters belong`} to it`,
        );
      }
      const settings = transaction.objectStore("settings");
      const revisions = storedCampaigns(
        await settings.getAll(campaignKeyRange(campaignId)),
        campaignId,
      );
      for (const revision of revisions)
        await settings.delete(
          campaignSettingKey(revision.campaignId, revision.contentDigest),
        );
      await transaction.done;
      return revisions.length;
    } finally {
      database.close();
    }
  }
}

/** Aborts an idb transaction without an unhandled `done` rejection. */
export function abort(transaction: {
  readonly done: Promise<void>;
  abort(): void;
}): void {
  transaction.done.catch(() => undefined);
  transaction.abort();
}
