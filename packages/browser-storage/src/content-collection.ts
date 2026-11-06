// Garbage collection of materialized profile packs and old campaign
// revisions. A composed profile (origin "profile": ordinary
// `profile:<id>:<hash>` and campaign `profile:campaign:<id>:<hash>`) is a
// full pack, tens of MB, and a new one appears for every server revision and
// campaign revision; superseded campaign revisions pile up the same way.
//
// Only derived data is ever removed: origin-"profile" packs, which are
// re-composed on demand from their layers, and campaign revisions older than
// the newest one of their campaign. Server and personal packs and the newest
// revision of every installed campaign are never touched. A candidate is
// removed only when nothing references it on two runs at least
// `CONTENT_COLLECTION_GRACE_MS` apart, which covers a pack another tab (or
// this tab's open content-update dialog) composed but has not bound yet.

import type {
  CharacterCampaignMembership,
  CharacterProfileBinding,
} from "@4ecb/character-domain";
import type { CampaignDocument, ContentProfileLayer } from "@4ecb/content-pack";

import {
  campaignKeyRange,
  campaignSettingKey,
  storedCampaigns,
} from "./campaign-repository";
import {
  ACTIVE_PACK_KEY,
  ACTIVE_PROFILE_KEY,
  materializedProfilePackId,
  openContentDatabase,
  type ContentProfileDefinition,
} from "./pack-repository";

const DEFAULT_DATABASE_NAME = "4ecb";
const MARKS_KEY = "content-collection-marks";

/** How long a candidate must stay unreferenced before it is removed. */
export const CONTENT_COLLECTION_GRACE_MS = 24 * 60 * 60 * 1000;

/** When each candidate was first seen unreferenced (ISO time). */
interface CollectionMarks {
  readonly version: 1;
  readonly packs: Readonly<Record<string, string>>;
  readonly campaigns: Readonly<Record<string, string>>;
}

export interface ContentCollectionOptions {
  readonly now?: Date;
  readonly graceMs?: number;
}

export interface ContentCollectionResult {
  readonly removedPackIds: readonly string[];
  readonly removedCampaigns: readonly CharacterCampaignMembership[];
  /** Unreferenced candidates still waiting out the grace period. */
  readonly pendingPackIds: readonly string[];
  readonly pendingCampaigns: readonly CharacterCampaignMembership[];
}

function storedMarks(value: unknown): CollectionMarks {
  const candidate = value as Partial<CollectionMarks> | null | undefined;
  const record = (
    entry: unknown,
  ): Readonly<Record<string, string>> | undefined =>
    entry !== null && typeof entry === "object"
      ? (entry as Record<string, string>)
      : undefined;
  return candidate?.version === 1
    ? {
        version: 1,
        packs: record(candidate.packs) ?? {},
        campaigns: record(candidate.campaigns) ?? {},
      }
    : { version: 1, packs: {}, campaigns: {} };
}

function membership(campaign: CampaignDocument): CharacterCampaignMembership {
  return {
    campaignId: campaign.campaignId,
    revision: campaign.revision,
    contentDigest: campaign.contentDigest,
  };
}

/** Each campaign's newest installed revision. */
function newestRevisions(
  campaigns: readonly CampaignDocument[],
): Map<string, CampaignDocument> {
  const newest = new Map<string, CampaignDocument>();
  for (const campaign of campaigns) {
    const current = newest.get(campaign.campaignId);
    if (current === undefined || campaign.revision > current.revision)
      newest.set(campaign.campaignId, campaign);
  }
  return newest;
}

/**
 * The stored pack IDs of every campaign's current target: the active base
 * layers (the active profile's layers, or the active pack alone, as the web
 * app's `activeBaseLayers`) plus the campaign's newest revision. They are
 * kept as a cache: the next content-update or join dialog would compose
 * exactly that pack, and it may be composed and not yet bound.
 */
async function campaignTargetPackIds(
  databaseName: string,
): Promise<Set<string>> {
  const database = await openContentDatabase(databaseName);
  let base: readonly ContentProfileLayer[] | undefined;
  let campaigns: CampaignDocument[];
  try {
    const transaction = database.transaction(
      ["settings", "contentPackMetadata"],
      "readonly",
    );
    const settings = transaction.objectStore("settings");
    const [activePack, activeProfile, rows] = await Promise.all([
      settings.get(ACTIVE_PACK_KEY),
      settings.get(ACTIVE_PROFILE_KEY),
      settings.getAll(campaignKeyRange()),
    ]);
    campaigns = storedCampaigns(rows);
    const activePackId =
      typeof activePack?.value === "string" ? activePack.value : undefined;
    const profile = activeProfile?.value as
      ContentProfileDefinition | undefined;
    if (activePackId !== undefined) {
      if (profile?.materializedPackId === activePackId) base = profile.layers;
      else {
        const metadata = await transaction
          .objectStore("contentPackMetadata")
          .get(activePackId);
        if (metadata !== undefined)
          base = [
            {
              packId: metadata.packId,
              contentDigest: metadata.manifest.contentDigest,
            },
          ];
      }
    }
    await transaction.done;
  } finally {
    database.close();
  }
  const targets = new Set<string>();
  if (base === undefined) return targets;
  for (const campaign of newestRevisions(campaigns).values()) {
    const { packId, contentDigest } = campaign.houseRules.manifest;
    targets.add(
      await materializedProfilePackId(
        `campaign:${campaign.campaignId}`,
        [...base, { packId, contentDigest }],
        campaign,
      ),
    );
  }
  return targets;
}

/**
 * Removes materialized profile packs and old campaign revisions nothing
 * uses. Kept: the active pack and profile; every character's bound pack and
 * campaign revision, trashed characters and pending migration journals
 * included; each campaign's newest revision and its current target pack
 * (above); all server and personal packs. Everything else of origin
 * "profile", and every older campaign revision, is a candidate, removed
 * once it has been unreferenced on an earlier run at least `graceMs` ago
 * (the first sighting is recorded in the `settings` store). The references
 * are read and the removals made in one transaction, so a binding committed
 * before it is always seen. Idempotent; safe to run from several tabs.
 */
export async function collectUnusedContent(
  databaseName = DEFAULT_DATABASE_NAME,
  options: ContentCollectionOptions = {},
): Promise<ContentCollectionResult> {
  const now = options.now ?? new Date();
  const graceMs = options.graceMs ?? CONTENT_COLLECTION_GRACE_MS;
  // Hashing the target IDs is not an IndexedDB request, so it cannot run
  // inside the collecting transaction. Stale targets only keep more.
  const targets = await campaignTargetPackIds(databaseName);

  const database = await openContentDatabase(databaseName);
  try {
    const transaction = database.transaction(
      [
        "contentPacks",
        "contentPackMetadata",
        "settings",
        "characters",
        "characterMigrations",
      ],
      "readwrite",
    );
    const settings = transaction.objectStore("settings");
    const referencedPacks = new Set(targets);
    const boundCampaigns = new Set<string>();
    const reference = (binding: CharacterProfileBinding | undefined) => {
      if (binding === undefined) return;
      referencedPacks.add(binding.packId);
      if (binding.campaign !== undefined)
        boundCampaigns.add(
          campaignSettingKey(
            binding.campaign.campaignId,
            binding.campaign.contentDigest,
          ),
        );
    };

    const [activePack, activeProfile, marksRow, campaignRows, metadata] =
      await Promise.all([
        settings.get(ACTIVE_PACK_KEY),
        settings.get(ACTIVE_PROFILE_KEY),
        settings.get(MARKS_KEY),
        settings.getAll(campaignKeyRange()),
        transaction.objectStore("contentPackMetadata").getAll(),
      ]);
    if (typeof activePack?.value === "string")
      referencedPacks.add(activePack.value);
    const profile = activeProfile?.value as
      ContentProfileDefinition | undefined;
    if (typeof profile?.materializedPackId === "string")
      referencedPacks.add(profile.materializedPackId);

    let character = await transaction.objectStore("characters").openCursor();
    while (character !== null) {
      reference(character.value.profileBinding);
      character = await character.continue();
    }
    let journal = await transaction
      .objectStore("characterMigrations")
      .openCursor();
    while (journal !== null) {
      reference(journal.value.previous.profileBinding);
      journal = await journal.continue();
    }

    const packCandidates = metadata
      .filter(
        ({ origin, packId }) =>
          origin === "profile" && !referencedPacks.has(packId),
      )
      .map(({ packId }) => packId)
      .sort();
    const campaigns = storedCampaigns(campaignRows);
    const newest = newestRevisions(campaigns);
    const campaignCandidates = campaigns.filter((campaign) => {
      const key = campaignSettingKey(
        campaign.campaignId,
        campaign.contentDigest,
      );
      return (
        newest.get(campaign.campaignId) !== campaign && !boundCampaigns.has(key)
      );
    });

    const marks = storedMarks(marksRow?.value);
    const nowIso = now.toISOString();
    const elapsed = (mark: string | undefined): boolean => {
      const since = mark === undefined ? Number.NaN : Date.parse(mark);
      return Number.isFinite(since) && now.getTime() - since >= graceMs;
    };
    const firstSeen = (mark: string | undefined): string =>
      mark !== undefined && Number.isFinite(Date.parse(mark)) ? mark : nowIso;

    const removedPackIds: string[] = [];
    const pendingPacks: Record<string, string> = {};
    for (const packId of packCandidates) {
      const mark = marks.packs[packId];
      if (elapsed(mark)) {
        await transaction.objectStore("contentPacks").delete(packId);
        await transaction.objectStore("contentPackMetadata").delete(packId);
        removedPackIds.push(packId);
      } else pendingPacks[packId] = firstSeen(mark);
    }
    const removedCampaigns: CharacterCampaignMembership[] = [];
    const pendingCampaigns: CharacterCampaignMembership[] = [];
    const pendingCampaignMarks: Record<string, string> = {};
    for (const campaign of campaignCandidates) {
      const key = campaignSettingKey(
        campaign.campaignId,
        campaign.contentDigest,
      );
      const mark = marks.campaigns[key];
      if (elapsed(mark)) {
        await settings.delete(key);
        removedCampaigns.push(membership(campaign));
      } else {
        pendingCampaignMarks[key] = firstSeen(mark);
        pendingCampaigns.push(membership(campaign));
      }
    }

    const nextMarks: CollectionMarks = {
      version: 1,
      packs: pendingPacks,
      campaigns: pendingCampaignMarks,
    };
    if (JSON.stringify(nextMarks) !== JSON.stringify(marksRow?.value))
      await settings.put({ key: MARKS_KEY, value: nextMarks });
    await transaction.done;
    return {
      removedPackIds,
      removedCampaigns,
      pendingPackIds: Object.keys(pendingPacks),
      pendingCampaigns,
    };
  } finally {
    database.close();
  }
}
