// The campaign invite page (D116), kept apart from the component so its
// states test without a DOM.

import type { CampaignDocument } from "@4ecb/content-pack";

import { latestCampaign } from "./campaign-profile";
import type { AdvertisedCampaign } from "./runtime-content";

export type CampaignJoinState =
  /** The server's campaign list hasn't loaded yet. */
  | { readonly kind: "looking-up" }
  /** The browser has this campaign (this revision or a newer one). */
  | { readonly kind: "installed"; readonly campaign: CampaignDocument }
  /** The server hosts it and the browser lacks it, or has an older revision. */
  | {
      readonly kind: "available";
      readonly advertised: AdvertisedCampaign;
      readonly installedRevision?: number;
    }
  /** Neither the server nor the browser knows the ID. */
  | { readonly kind: "unknown" };

export function campaignJoinState(
  campaignId: string,
  advertised: readonly AdvertisedCampaign[],
  advertisedLoaded: boolean,
  installed: readonly CampaignDocument[] | undefined,
): CampaignJoinState {
  if (installed === undefined) return { kind: "looking-up" };
  const local = latestCampaign(installed, campaignId);
  const hosted = advertised.find((entry) => entry.campaignId === campaignId);
  if (
    local !== undefined &&
    (hosted === undefined ||
      local.revision >= hosted.revision ||
      installed.some(
        (campaign) =>
          campaign.campaignId === campaignId &&
          campaign.contentDigest === hosted.contentDigest,
      ))
  )
    // Without the server's list yet, the browser's copy is still the
    // campaign; a newer hosted revision reaches it as an update later.
    return { kind: "installed", campaign: local };
  if (hosted !== undefined)
    return {
      kind: "available",
      advertised: hosted,
      ...(local === undefined ? {} : { installedRevision: local.revision }),
    };
  return advertisedLoaded ? { kind: "unknown" } : { kind: "looking-up" };
}

/** What a campaign changes, as the invite page lists it. */
export interface CampaignSummaryLine {
  readonly label: string;
  readonly value: string;
}

function records(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

export function campaignSummaryLines(
  campaign: CampaignDocument,
): CampaignSummaryLine[] {
  const houseRules = campaign.houseRules.entities.length;
  const { ids, types } = campaign.restrictions;
  return [
    { label: "Revision", value: String(campaign.revision) },
    {
      label: "House rules",
      value: houseRules === 0 ? "None" : records(houseRules),
    },
    // A type rule: every record of the type outside the campaign is unused.
    ...types.map(({ type }) => ({
      label: type,
      value: "Only the campaign's own",
    })),
    ...(ids.length === 0
      ? []
      : [{ label: "Not offered", value: records(ids.length) }]),
  ];
}
