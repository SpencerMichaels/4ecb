// Read-modify-write of the operator's deploy/runtime-config.json: each
// advertise command changes only its own key, so packs, campaigns and
// operator settings (relay, features) survive one another.

import { readFile } from "node:fs/promises";

import { writeAtomically } from "./cli";

export type RuntimeConfig = Readonly<Record<string, unknown>>;

export interface AdvertisedPackEntry {
  readonly packId: string;
  readonly name: string;
  readonly contentDigest: string;
  readonly url: string;
}

export interface AdvertisedCampaignEntry {
  readonly campaignId: string;
  readonly name: string;
  readonly revision: number;
  readonly contentDigest: string;
  readonly url: string;
}

/** The keys a fresh config starts with (`apps/web/public/runtime-config.json`). */
const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  relayUrl: null,
  defaultPackUrl: null,
  contentPacks: [],
  features: { playMode: false, sessionRelay: false, characterShare: false },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Advertises `entry` as the server's content: `contentPacks` becomes just
 * this pack (a rebuilt pack has a new packId and replaces the old one, as
 * before), every other key is kept.
 */
export function withAdvertisedPack(
  config: RuntimeConfig,
  entry: AdvertisedPackEntry,
): RuntimeConfig {
  return { ...DEFAULT_RUNTIME_CONFIG, ...config, contentPacks: [entry] };
}

/**
 * Advertises `entry` in `campaigns`, replacing an older revision of the same
 * campaign and keeping every other campaign and key. Browsers only fetch a
 * newer revision of a campaign they have, so an older revision, or the same
 * revision with different content, is refused ("bump the revision").
 */
export function withAdvertisedCampaign(
  config: RuntimeConfig,
  entry: AdvertisedCampaignEntry,
): RuntimeConfig {
  const existing = config.campaigns ?? [];
  if (!Array.isArray(existing))
    throw new Error("runtime-config.json campaigns must be an array");
  const campaigns: unknown[] = [];
  let replaced = false;
  for (const candidate of existing) {
    if (!isRecord(candidate) || candidate.campaignId !== entry.campaignId) {
      campaigns.push(candidate);
      continue;
    }
    const revision = candidate.revision;
    if (typeof revision === "number" && revision > entry.revision)
      throw new Error(
        `Campaign ${entry.campaignId} revision ${revision} is already advertised; refusing older revision ${entry.revision}`,
      );
    if (
      revision === entry.revision &&
      candidate.contentDigest !== entry.contentDigest
    )
      throw new Error(
        `Campaign ${entry.campaignId} revision ${entry.revision} is already advertised with different content; bump the revision`,
      );
    if (!replaced) campaigns.push(entry);
    replaced = true;
  }
  if (!replaced) campaigns.push(entry);
  return { ...DEFAULT_RUNTIME_CONFIG, ...config, campaigns };
}

/** The config at `path`, or an empty one when the file does not exist. */
export async function readRuntimeConfig(path: string): Promise<RuntimeConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
  return parsed;
}

export async function updateRuntimeConfig(
  path: string,
  update: (config: RuntimeConfig) => RuntimeConfig,
): Promise<RuntimeConfig> {
  const config = update(await readRuntimeConfig(path));
  await writeAtomically(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}
