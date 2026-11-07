import {
  contentPackIdentityErrors,
  decodeCampaign,
  MAX_CAMPAIGN_ENCODED_BYTES,
  MAX_CAMPAIGN_ID_LENGTH,
  MAX_CAMPAIGN_REVISION,
  MAX_CONTENT_PACK_ENCODED_BYTES,
  type CampaignDocument,
  type ContentPack,
} from "@4ecb/content-pack";
import {
  decodeAndValidateContentPackForStorage,
  type ValidatedContentPackArtifact,
} from "@4ecb/browser-storage/validated-pack-storage";

export interface AdvertisedContentPack {
  readonly packId: string;
  readonly contentDigest: string;
  readonly url: string;
  readonly name?: string;
}

/** A campaign copy hosted beside the private packs (D116). Every browser
 *  of the group installs it in the background on load (and its newer
 *  revisions later): there is nothing to join. */
export interface AdvertisedCampaign {
  readonly campaignId: string;
  readonly name: string;
  readonly revision: number;
  readonly contentDigest: string;
  readonly url: string;
}

/** The most campaigns one runtime configuration may advertise. */
export const MAX_ADVERTISED_CAMPAIGNS = 64;

export interface RuntimeContentConfig {
  readonly contentPacks: readonly AdvertisedContentPack[];
  readonly campaigns: readonly AdvertisedCampaign[];
  /** Why advertised campaign entries were dropped (the packs never are). */
  readonly campaignProblems: readonly string[];
}

/**
 * Whether the browser should activate the server's advertised content: when it
 * has no content yet, or when its active content is made only of server packs
 * and the server now advertises a different set (a content update). Content a
 * user assembled with packs of their own is left alone. Characters stay pinned
 * to their content either way; moving them is the user's choice (D004).
 */
export function shouldActivateAdvertisedContent(
  active:
    | {
        readonly layers: readonly {
          readonly packId: string;
          readonly contentDigest: string;
        }[];
      }
    | undefined,
  advertised: readonly AdvertisedContentPack[],
  originOf: (packId: string) => string | undefined,
): boolean {
  if (advertised.length === 0) return false;
  if (active === undefined) return true;
  if (!active.layers.every((layer) => originOf(layer.packId) === "server"))
    return false;
  return (
    active.layers.length !== advertised.length ||
    active.layers.some(
      (layer, index) =>
        layer.packId !== advertised[index]?.packId ||
        layer.contentDigest !== advertised[index]?.contentDigest,
    )
  );
}

export function parseRuntimeContentConfig(
  value: unknown,
  baseUrl = globalThis.location?.href ?? "https://localhost/",
): RuntimeContentConfig {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const campaignProblems: string[] = [];
  return {
    contentPacks: parseAdvertisedPacks(record.contentPacks, baseUrl),
    campaigns: parseAdvertisedCampaigns(
      record.campaigns,
      baseUrl,
      campaignProblems,
    ),
    campaignProblems,
  };
}

function sameOriginUrl(value: string, baseUrl: string, what: string): string {
  const url = new URL(value, baseUrl);
  if (url.origin !== new URL(baseUrl).origin)
    throw new Error(`${what} URL must be same-origin`);
  return url.href;
}

function parseAdvertisedPacks(
  candidates: unknown,
  baseUrl: string,
): AdvertisedContentPack[] {
  if (candidates === undefined) return [];
  if (!Array.isArray(candidates))
    throw new Error("runtime contentPacks must be an array");
  const seen = new Set<string>();
  const contentPacks = candidates.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null)
      throw new Error("runtime content pack entry must be an object");
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.packId !== "string" ||
      typeof entry.contentDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.contentDigest) ||
      typeof entry.url !== "string"
    )
      throw new Error(
        "runtime content pack requires packId, same-origin URL, and SHA-256 contentDigest",
      );
    const url = sameOriginUrl(entry.url, baseUrl, "runtime content pack");
    const identity = `${entry.packId}:${entry.contentDigest}`;
    if (seen.has(identity))
      throw new Error(`duplicate advertised content pack ${identity}`);
    seen.add(identity);
    return {
      packId: entry.packId,
      contentDigest: entry.contentDigest,
      url,
      ...(typeof entry.name === "string" ? { name: entry.name } : {}),
    };
  });
  return contentPacks;
}

/**
 * The advertised campaigns. A campaign entry the server got wrong drops only
 * itself (a duplicated ID drops every copy of it; a non-list or oversized
 * value, the whole list), never the content packs: campaigns are optional,
 * and a broken campaign entry must not stop the group's content loading. Each drop is
 * named in `problems`, for the administrator.
 */
function parseAdvertisedCampaigns(
  candidates: unknown,
  baseUrl: string,
  problems: string[],
): AdvertisedCampaign[] {
  if (candidates === undefined) return [];
  if (!Array.isArray(candidates)) {
    problems.push("runtime campaigns must be an array");
    return [];
  }
  if (candidates.length > MAX_ADVERTISED_CAMPAIGNS) {
    problems.push(
      `runtime campaigns list more than ${MAX_ADVERTISED_CAMPAIGNS} campaigns`,
    );
    return [];
  }
  const parsed: AdvertisedCampaign[] = [];
  for (const candidate of candidates) {
    try {
      parsed.push(parseAdvertisedCampaign(candidate, baseUrl));
    } catch (reason: unknown) {
      problems.push(reason instanceof Error ? reason.message : String(reason));
    }
  }
  // One hosted copy per campaign: its newest revision. Which of two copies
  // is meant is unknown, so neither is offered.
  const counts = new Map<string, number>();
  for (const { campaignId } of parsed)
    counts.set(campaignId, (counts.get(campaignId) ?? 0) + 1);
  for (const [campaignId, count] of counts)
    if (count > 1) problems.push(`duplicate advertised campaign ${campaignId}`);
  return parsed.filter(({ campaignId }) => counts.get(campaignId) === 1);
}

function parseAdvertisedCampaign(
  candidate: unknown,
  baseUrl: string,
): AdvertisedCampaign {
  if (typeof candidate !== "object" || candidate === null)
    throw new Error("runtime campaign entry must be an object");
  const entry = candidate as Record<string, unknown>;
  const { campaignId, name, revision, contentDigest, url } = entry;
  if (
    typeof campaignId !== "string" ||
    campaignId.length > MAX_CAMPAIGN_ID_LENGTH ||
    contentPackIdentityErrors(campaignId, "-").length > 0 ||
    typeof name !== "string" ||
    name.trim() === "" ||
    name.length > 200 ||
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision > MAX_CAMPAIGN_REVISION ||
    typeof contentDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(contentDigest) ||
    typeof url !== "string"
  )
    throw new Error(
      "runtime campaign requires campaignId, name, revision, same-origin URL, and SHA-256 contentDigest",
    );
  return {
    campaignId,
    name,
    revision,
    contentDigest,
    url: sameOriginUrl(url, baseUrl, "runtime campaign"),
  };
}

export async function downloadAdvertisedPack(
  advertised: AdvertisedContentPack,
  onProgress: (receivedBytes: number, totalBytes?: number) => void = () =>
    undefined,
  fetcher: typeof fetch = fetch,
): Promise<{
  readonly bytes: ArrayBuffer;
  readonly pack: ContentPack;
  readonly validated: ValidatedContentPackArtifact;
}> {
  const response = await fetcher(advertised.url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Content download failed (${response.status})`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CONTENT_PACK_ENCODED_BYTES)
    throw new Error(
      "Advertised content pack exceeds the 128 MiB download limit",
    );
  const bytes = await readLimitedBody(
    response,
    MAX_CONTENT_PACK_ENCODED_BYTES,
    "Advertised content pack exceeds the 128 MiB download limit",
    (received) =>
      onProgress(received, Number.isFinite(declared) ? declared : undefined),
  );
  const validated = await decodeAndValidateContentPackForStorage(
    bytes.buffer,
    "Downloaded content pack is invalid",
  );
  const { pack } = validated;
  if (
    pack.manifest.packId !== advertised.packId ||
    pack.manifest.contentDigest !== advertised.contentDigest
  )
    throw new Error(
      "Downloaded content pack identity or digest does not match runtime configuration",
    );
  return { bytes: bytes.buffer, pack, validated };
}

/** A response body as bytes, refused once it passes `limit`. */
async function readLimitedBody(
  response: Response,
  limit: number,
  tooLarge: string,
  onProgress: (receivedBytes: number) => void = () => undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  if (response.body === null)
    throw new Error("Content download returned no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw new Error(tooLarge);
    }
    chunks.push(value);
    onProgress(received);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The advertised campaigns this browser should fetch: every campaign it
 * doesn't have, and a newer revision of one it has whose exact copy it
 * doesn't. An older or equal hosted revision is never fetched.
 */
export function advertisedCampaignsToInstall(
  installed: readonly Pick<
    CampaignDocument,
    "campaignId" | "revision" | "contentDigest"
  >[],
  advertised: readonly AdvertisedCampaign[],
): AdvertisedCampaign[] {
  const newest = new Map<string, number>();
  for (const { campaignId, revision } of installed)
    newest.set(campaignId, Math.max(revision, newest.get(campaignId) ?? 0));
  return advertised.filter((entry) => {
    const revision = newest.get(entry.campaignId);
    if (revision === undefined) return true;
    return (
      entry.revision > revision &&
      !installed.some(
        (campaign) =>
          campaign.campaignId === entry.campaignId &&
          campaign.contentDigest === entry.contentDigest,
      )
    );
  });
}

/** Fetches a hosted campaign and checks it is the advertised one: decoded
 *  within the campaign limits, digest recomputed, identity matched. */
export async function downloadAdvertisedCampaign(
  advertised: AdvertisedCampaign,
  fetcher: typeof fetch = fetch,
): Promise<CampaignDocument> {
  const response = await fetcher(advertised.url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Campaign download failed (${response.status})`);
  const tooLarge = "Advertised campaign exceeds the 16 MiB download limit";
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CAMPAIGN_ENCODED_BYTES)
    throw new Error(tooLarge);
  const bytes = await readLimitedBody(
    response,
    MAX_CAMPAIGN_ENCODED_BYTES,
    tooLarge,
  );
  const campaign = await decodeCampaign(bytes.buffer);
  if (
    campaign.campaignId !== advertised.campaignId ||
    campaign.revision !== advertised.revision ||
    campaign.contentDigest !== advertised.contentDigest
  )
    throw new Error(
      "Downloaded campaign identity or digest does not match runtime configuration",
    );
  return campaign;
}

/**
 * Background refresh (D116): fetches and installs the hosted campaigns this
 * browser lacks, so they appear in Details' Campaign select and Settings →
 * Campaigns, and the newer hosted revisions of installed ones, so they reach
 * their characters through the content-update issue. A failure skips that
 * campaign: it is retried on the next load, and the player's characters
 * keep the revision they have. Returns the revisions installed.
 */
export async function refreshInstalledCampaigns(
  repository: {
    list(): Promise<readonly CampaignDocument[]>;
    install(campaign: CampaignDocument): Promise<CampaignDocument>;
  },
  advertised: readonly AdvertisedCampaign[],
  fetcher: typeof fetch = fetch,
): Promise<CampaignDocument[]> {
  if (advertised.length === 0) return [];
  const installed: CampaignDocument[] = [];
  for (const entry of advertisedCampaignsToInstall(
    await repository.list(),
    advertised,
  )) {
    try {
      installed.push(
        await repository.install(
          await downloadAdvertisedCampaign(entry, fetcher),
        ),
      );
    } catch {
      // Quiet: nothing the player can do about a server copy; next load
      // tries again.
    }
  }
  return installed;
}
