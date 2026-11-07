// The campaign invite page (D116), kept apart from the component so its
// states test without a DOM.

import {
  campaignPatches,
  campaignRulePatches,
  type CampaignDocument,
  type CampaignRemovedRecordCount,
} from "@4ecb/content-pack";

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

/** The invite page's intro for a campaign this browser can add. */
export function campaignInviteIntro(
  name: string,
  installedRevision: number | undefined,
  revision: number,
): string {
  return [
    `You're invited to ${name}.`,
    "Join it to add campaign-specific content to your character builder, including house rules and content additions/changes.",
    "Your existing characters will remain unchanged.",
    `You can opt a character in to the new content and rules by selecting "${name}" in the character's Details pane.`,
    ...(installedRevision === undefined
      ? []
      : [
          `This browser has revision ${installedRevision}; this adds revision ${revision}.`,
        ]),
  ].join(" ");
}

/** What a campaign changes, as the invite page lists it. */
export interface CampaignSummaryLine {
  readonly label: string;
  readonly value: string;
  /** Still being worked out (the Removed counts). */
  readonly pending?: true;
}

/**
 * The stock records a campaign removes, counted over the browser's active
 * content in the content worker; undefined when there is nothing to count
 * over (no active content) or the count failed.
 */
export type CampaignRemovedRecords =
  | { readonly kind: "pending" }
  | {
      readonly kind: "counted";
      readonly counts: readonly CampaignRemovedRecordCount[];
    };

/**
 * Player-facing nouns for content types whose type name isn't one, or
 * whose plural isn't the regular one ("Background Choice" records are the
 * options a background offers, such as "Learn Elven").
 */
const TYPE_NOUNS: Readonly<
  Record<string, { readonly one: string; readonly many: string }>
> = {
  "Background Choice": {
    one: "Background option",
    many: "Background options",
  },
  Armor: { one: "Armor", many: "Armor" },
  Gear: { one: "Gear item", many: "Gear items" },
};

/** The regular English plural of a type name's last word. */
function pluralWord(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** A content type's plural, as a label: "Deities", "Class Features". */
export function contentTypePlural(type: string): string {
  return TYPE_NOUNS[type]?.many ?? pluralWord(type);
}

/** A count of a content type's records in running text: "1 deity",
 *  "13 languages", "11 background options". */
export function contentTypeCount(type: string, count: number): string {
  const noun =
    count === 1 ? (TYPE_NOUNS[type]?.one ?? type) : contentTypePlural(type);
  return `${count} ${noun.toLocaleLowerCase()}`;
}

function removedLine(
  campaign: CampaignDocument,
  removed: CampaignRemovedRecords | undefined,
): CampaignSummaryLine[] {
  const { ids, types } = campaign.restrictions;
  if (removed === undefined || (ids.length === 0 && types.length === 0))
    return [];
  if (removed.kind === "pending")
    return [{ label: "Removed", value: "Counting…", pending: true }];
  return [
    {
      label: "Removed",
      value:
        removed.counts.length === 0
          ? "None"
          : removed.counts
              .map(({ type, count }) => contentTypeCount(type, count))
              .join(", "),
    },
  ];
}

function records(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

export function campaignSummaryLines(
  campaign: CampaignDocument,
  removed?: CampaignRemovedRecords,
): CampaignSummaryLine[] {
  const houseRules = campaign.houseRules.entities.length;
  const { types } = campaign.restrictions;
  const patches = campaignPatches(campaign).length;
  const rulePatches = campaignRulePatches(campaign).length;
  return [
    { label: "Revision", value: String(campaign.revision) },
    {
      label: "House rules",
      value: houseRules === 0 ? "None" : records(houseRules),
    },
    // A type rule: every record of the type outside the campaign is unused.
    ...types.map(({ type }) => ({
      label: contentTypePlural(type),
      value: "Fully replaces the originals",
    })),
    // Every stock record the type and ID rules take away, by type.
    ...removedLine(campaign, removed),
    // Field patches on the server's records (a race's languages, a name).
    ...(patches === 0
      ? []
      : [
          {
            label: "Changed fields",
            value: `${patches} ${patches === 1 ? "field" : "fields"}`,
          },
        ]),
    // Rule patches: what a server record grants or offers (a language).
    ...(rulePatches === 0
      ? []
      : [
          {
            label: "Changed rules",
            value: `${rulePatches} ${rulePatches === 1 ? "rule" : "rules"}`,
          },
        ]),
  ];
}
