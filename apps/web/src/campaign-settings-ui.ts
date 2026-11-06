// Settings → Campaigns (D116): the table rows and their right-click actions,
// kept apart from the component so they test without a DOM.

import type { CampaignDocument } from "@4ecb/content-pack";

import type { AdvertisedCampaign } from "./runtime-content";

/** One installed campaign: its newest revision, and who uses it. */
export interface CampaignRow {
  readonly campaignId: string;
  readonly name: string;
  readonly revision: number;
  readonly contentDigest: string;
  /** Library characters in the campaign (any revision). */
  readonly characters: number;
  /** Members in the trash: they still keep the campaign installed. */
  readonly trashed: number;
  /** The newest installed revision, for Export file. */
  readonly campaign: CampaignDocument;
  /** The hosted copy of exactly this revision, when the server has one. */
  readonly hosted?: AdvertisedCampaign;
}

/** Library metadata reduced to what the count needs. */
export interface CampaignMember {
  readonly campaignId?: string;
}

/** The library's characters and its trash. */
export interface CampaignMembers {
  readonly active: readonly CampaignMember[];
  readonly deleted: readonly CampaignMember[];
}

export function campaignRows(
  installed: readonly CampaignDocument[],
  members: CampaignMembers,
  advertised: readonly AdvertisedCampaign[],
): CampaignRow[] {
  const newest = new Map<string, CampaignDocument>();
  for (const campaign of installed) {
    const current = newest.get(campaign.campaignId);
    if (current === undefined || campaign.revision > current.revision)
      newest.set(campaign.campaignId, campaign);
  }
  const count = (list: readonly CampaignMember[], campaignId: string) =>
    list.filter((member) => member.campaignId === campaignId).length;
  return [...newest.values()]
    .map((campaign) => {
      const hosted = advertised.find(
        (entry) =>
          entry.campaignId === campaign.campaignId &&
          entry.contentDigest === campaign.contentDigest,
      );
      return {
        campaignId: campaign.campaignId,
        name: campaign.name,
        revision: campaign.revision,
        contentDigest: campaign.contentDigest,
        characters: count(members.active, campaign.campaignId),
        trashed: count(members.deleted, campaign.campaignId),
        campaign,
        ...(hosted === undefined ? {} : { hosted }),
      };
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.campaignId.localeCompare(right.campaignId),
    );
}

/** The invite link players open to join (the join route is
 *  `#/campaigns/join/<campaignId>`; the runtime config pins the digest). */
export function campaignInviteUrl(
  campaignId: string,
  base: string = globalThis.location?.href ?? "https://localhost/",
): string {
  const url = new URL(base);
  url.hash = `#/campaigns/join/${encodeURIComponent(campaignId)}`;
  url.search = "";
  return url.href;
}

/** Why Copy invite link can't be used, or undefined when it can. */
export function inviteDisabledReason(row: CampaignRow): string | undefined {
  return row.hosted === undefined
    ? "Your group's server doesn't host this revision. Ask the DM to publish it with the content tool, or share the campaign file."
    : undefined;
}

/** Why Remove can't be used, or undefined when it can. */
export function removeDisabledReason(row: CampaignRow): string | undefined {
  const total = row.characters + row.trashed;
  if (total === 0) return undefined;
  const used = `${total} ${total === 1 ? "character belongs" : "characters belong"} to it`;
  return row.trashed === 0
    ? `${used}. Move them out of the campaign first.`
    : `${used}, ${row.trashed} in the trash. Move them out of the campaign or empty the trash first.`;
}

/** The exported campaign file's name. */
export function campaignFileName(row: CampaignRow): string {
  return `${row.campaignId}-r${row.revision}.4ecc`;
}
