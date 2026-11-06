// Each character's content target (D116). A character outside a campaign
// follows the browser's active content, as before; a campaign character
// follows the active content's layers plus the newest installed revision of
// its campaign. The target's identity is known without composing anything,
// so the content-update issue can be raised cheaply; the campaign profile is
// composed (or its stored copy reused) only when the update is reviewed.

import {
  ContentPackRepository,
  campaignProfileBinding,
  type CampaignProfileDefinition,
  type ContentProfileDefinition,
  type ContentProfileLayer,
} from "@4ecb/browser-storage";
import type { CharacterProfileBinding } from "@4ecb/character-domain";
import type { CampaignDocument, ContentPackManifest } from "@4ecb/content-pack";

import { contentProfileMatchesRevision } from "./profile-migration";

/** Dispatched on `window` after campaigns are installed or removed, so open
 *  pages re-read them (a newer revision raises the update issue). */
export const CAMPAIGNS_CHANGED_EVENT = "4ecb:campaigns-changed";

/** The browser's active content: its manifest and, when it is a composed
 *  profile, that profile's definition. */
export interface ActiveContent {
  readonly manifest: ContentPackManifest | undefined;
  readonly profile: ContentProfileDefinition | undefined;
}

/** A target composed and stored, ready for the rules worker to preview. */
export interface MaterializedContentTarget {
  readonly packId: string;
  readonly binding: CharacterProfileBinding & {
    readonly contentDigest: string;
  };
}

export type CampaignProfileMaterializer = (
  baseLayerPackIds: readonly string[],
  campaign: CampaignDocument,
) => Promise<CampaignProfileDefinition>;

interface TargetBase {
  /** Player-facing name of the content (the active profile or the campaign). */
  readonly name: string;
  /** Composes (or reuses) the target's pack. */
  readonly materialize: () => Promise<MaterializedContentTarget>;
}

export type ContentTarget =
  | (TargetBase & {
      readonly kind: "active";
      readonly manifest: ContentPackManifest;
    })
  | (TargetBase & {
      readonly kind: "campaign";
      readonly campaign: CampaignDocument;
      /** The active content's layers the campaign layer goes on. */
      readonly baseLayers: readonly ContentProfileLayer[];
    });

/** The binding a character gets when it adopts the active content. */
export function activeProfileBinding(
  manifest: ContentPackManifest,
  activeProfile: ContentProfileDefinition | undefined,
): CharacterProfileBinding & { readonly contentDigest: string } {
  return {
    packId: manifest.packId,
    contentDigest: manifest.contentDigest,
    ...(activeProfile?.materializedPackId === manifest.packId
      ? {
          layers: activeProfile.layers,
          resolutionPolicy: activeProfile.resolutionPolicy,
        }
      : {}),
  };
}

const defaultMaterializer: CampaignProfileMaterializer = (ids, campaign) =>
  new ContentPackRepository().materializeCampaignProfile(ids, campaign);

/** The active content's source layers: the active profile's, or the active
 *  pack itself when no composed profile is active. */
export function activeBaseLayers(
  active: ActiveContent,
): readonly ContentProfileLayer[] | undefined {
  const { manifest, profile } = active;
  if (manifest === undefined) return undefined;
  return profile?.materializedPackId === manifest.packId
    ? profile.layers
    : [{ packId: manifest.packId, contentDigest: manifest.contentDigest }];
}

/** The newest installed revision of `campaignId` among `campaigns`. */
export function latestCampaign(
  campaigns: readonly CampaignDocument[],
  campaignId: string,
): CampaignDocument | undefined {
  return campaigns
    .filter((campaign) => campaign.campaignId === campaignId)
    .reduce<CampaignDocument | undefined>(
      (newest, campaign) =>
        newest === undefined || campaign.revision > newest.revision
          ? campaign
          : newest,
      undefined,
    );
}

function activeTarget(
  manifest: ContentPackManifest,
  profile: ContentProfileDefinition | undefined,
): ContentTarget {
  return {
    kind: "active",
    name: manifest.name,
    manifest,
    materialize: () =>
      Promise.resolve({
        packId: manifest.packId,
        binding: activeProfileBinding(manifest, profile),
      }),
  };
}

function campaignTarget(
  campaign: CampaignDocument,
  active: ActiveContent,
  materializer: CampaignProfileMaterializer,
): ContentTarget | undefined {
  const baseLayers = activeBaseLayers(active);
  if (baseLayers === undefined) return undefined;
  return {
    kind: "campaign",
    name: campaign.name,
    campaign,
    baseLayers,
    materialize: async () => {
      const definition = await materializer(
        baseLayers.map(({ packId }) => packId),
        campaign,
      );
      const binding = campaignProfileBinding(definition);
      return {
        packId: definition.materializedPackId,
        binding: { ...binding, contentDigest: definition.contentDigest },
      };
    },
  };
}

/**
 * What `binding`'s character should be on: the active content outside a
 * campaign; inside one, the active layers plus the newest installed revision
 * of its campaign. Undefined when there is nothing to move onto: no active
 * content, or a campaign none of whose revisions is installed (the character
 * keeps its pinned pack; moving it onto the plain active content would drop
 * it from its campaign unasked).
 */
export function contentTarget(
  binding: CharacterProfileBinding | undefined,
  active: ActiveContent,
  campaigns: readonly CampaignDocument[],
  materializer: CampaignProfileMaterializer = defaultMaterializer,
): ContentTarget | undefined {
  if (active.manifest === undefined) return undefined;
  const membership = binding?.campaign;
  if (membership === undefined)
    return activeTarget(active.manifest, active.profile);
  const campaign = latestCampaign(campaigns, membership.campaignId);
  return campaign === undefined
    ? undefined
    : campaignTarget(campaign, active, materializer);
}

/**
 * The target for moving a character into `campaign`, or out of any campaign
 * when it is undefined (D116: the Details campaign select). The update dialog
 * previews and applies it like any content update.
 */
export function campaignChangeTarget(
  campaign: CampaignDocument | undefined,
  active: ActiveContent,
  materializer: CampaignProfileMaterializer = defaultMaterializer,
): ContentTarget | undefined {
  if (active.manifest === undefined) return undefined;
  return campaign === undefined
    ? activeTarget(active.manifest, active.profile)
    : campaignTarget(campaign, active, materializer);
}

function sameLayers(
  left: readonly ContentProfileLayer[] | undefined,
  right: readonly ContentProfileLayer[],
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every(
      (layer, index) =>
        layer.packId === right[index]?.packId &&
        layer.contentDigest === right[index]?.contentDigest,
    )
  );
}

/** True when `binding` already is `target`, compared by identity only. */
export function bindingMatchesTarget(
  binding: CharacterProfileBinding,
  target: ContentTarget,
): boolean {
  if (target.kind === "active")
    return (
      binding.campaign === undefined &&
      contentProfileMatchesRevision(binding, target.manifest)
    );
  const { campaign, baseLayers } = target;
  return (
    binding.campaign?.campaignId === campaign.campaignId &&
    binding.campaign.contentDigest === campaign.contentDigest &&
    sameLayers(binding.layers, [
      ...baseLayers,
      {
        packId: campaign.houseRules.manifest.packId,
        contentDigest: campaign.houseRules.manifest.contentDigest,
      },
    ])
  );
}

/** Which way a target moves a character relative to its campaign. */
export type ContentTargetMove =
  | { readonly kind: "update" }
  | { readonly kind: "join"; readonly campaign: CampaignDocument }
  | { readonly kind: "leave" };

export function contentTargetMove(
  binding: CharacterProfileBinding | undefined,
  target: ContentTarget,
): ContentTargetMove {
  const current = binding?.campaign?.campaignId;
  if (target.kind === "campaign")
    return current === target.campaign.campaignId
      ? { kind: "update" }
      : { kind: "join", campaign: target.campaign };
  return current === undefined ? { kind: "update" } : { kind: "leave" };
}
