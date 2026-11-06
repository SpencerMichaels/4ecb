import { describe, expect, it, vi } from "vitest";
import type {
  CampaignProfileDefinition,
  ContentProfileDefinition,
} from "@4ecb/browser-storage";
import type { CharacterProfileBinding } from "@4ecb/character-domain";
import type { CampaignDocument, ContentPackManifest } from "@4ecb/content-pack";

import {
  bindingMatchesTarget,
  campaignChangeTarget,
  contentTarget,
  contentTargetMove,
  latestCampaign,
  type ActiveContent,
} from "./campaign-profile";
import { needsContentUpdate } from "./content-update";

const digest = (letter: string) => letter.repeat(64);

function manifest(packId: string, contentDigest: string): ContentPackManifest {
  return { packId, name: packId, contentDigest } as ContentPackManifest;
}

/** The active content as Settings composes it: server + personal layers. */
function activeContent(serverDigest: string): ActiveContent {
  const profile: ContentProfileDefinition = {
    profileId: "default",
    name: "My content",
    layers: [
      { packId: "server", contentDigest: serverDigest },
      { packId: "personal", contentDigest: digest("p") },
    ],
    resolutionPolicy: "last-pack-wins-v1",
    materializedPackId: `profile:default:${serverDigest.slice(0, 4)}`,
    contentDigest: digest("m"),
  };
  return {
    manifest: manifest(profile.materializedPackId, profile.contentDigest),
    profile,
  };
}

function campaign(revision: number, letter: string): CampaignDocument {
  return {
    format: "4ecb-campaign",
    version: 1,
    campaignId: "golarion",
    name: "Golarion",
    revision,
    contentDigest: digest(letter),
    houseRules: {
      manifest: manifest(`campaign.golarion.r${revision}`, digest(letter)),
    },
  } as unknown as CampaignDocument;
}

/** The binding a campaign character gets on `active` + `doc`. */
function campaignBinding(
  active: ActiveContent,
  doc: CampaignDocument,
): CharacterProfileBinding {
  return {
    packId: "profile:campaign:golarion:x",
    contentDigest: digest("c"),
    layers: [
      ...(active.profile?.layers ?? []),
      {
        packId: doc.houseRules.manifest.packId,
        contentDigest: doc.houseRules.manifest.contentDigest,
      },
    ],
    resolutionPolicy: "last-pack-wins-v1",
    campaign: {
      campaignId: doc.campaignId,
      revision: doc.revision,
      contentDigest: doc.contentDigest,
    },
  };
}

describe("content target", () => {
  it("keeps a character outside a campaign on the active content", () => {
    const active = activeContent(digest("1"));
    const onActive: CharacterProfileBinding = {
      packId: active.manifest!.packId,
      contentDigest: active.manifest!.contentDigest,
    };
    const target = contentTarget(onActive, active, [campaign(1, "a")]);
    expect(target).toMatchObject({ kind: "active", manifest: active.manifest });
    expect(needsContentUpdate(onActive, target)).toBe(false);
    expect(
      needsContentUpdate(
        { packId: "old", contentDigest: digest("0") },
        contentTarget({ packId: "old" }, active, []),
      ),
    ).toBe(true);
    expect(needsContentUpdate(undefined, target)).toBe(false);
    expect(
      contentTarget(onActive, { manifest: undefined, profile: undefined }, []),
    ).toBeUndefined();
  });

  it("targets the active layers plus the campaign's newest revision", () => {
    const active = activeContent(digest("1"));
    const revisions = [campaign(2, "b"), campaign(1, "a")];
    expect(latestCampaign(revisions, "golarion")?.revision).toBe(2);
    const bound = campaignBinding(active, campaign(2, "b"));
    const target = contentTarget(bound, active, revisions);
    expect(target).toMatchObject({
      kind: "campaign",
      campaign: { revision: 2 },
      baseLayers: active.profile?.layers,
    });
    expect(needsContentUpdate(bound, target)).toBe(false);
  });

  it("raises the update after a new server revision", () => {
    const before = activeContent(digest("1"));
    const bound = campaignBinding(before, campaign(1, "a"));
    const after = activeContent(digest("2"));
    expect(
      needsContentUpdate(
        bound,
        contentTarget(bound, after, [campaign(1, "a")]),
      ),
    ).toBe(true);
  });

  it("raises the update after a new campaign revision", () => {
    const active = activeContent(digest("1"));
    const bound = campaignBinding(active, campaign(1, "a"));
    expect(
      needsContentUpdate(
        bound,
        contentTarget(bound, active, [campaign(1, "a"), campaign(2, "b")]),
      ),
    ).toBe(true);
  });

  it("leaves a character whose campaign isn't installed on its pinned pack", () => {
    const active = activeContent(digest("2"));
    const bound = campaignBinding(activeContent(digest("1")), campaign(1, "a"));
    const target = contentTarget(bound, active, []);
    expect(target).toBeUndefined();
    expect(needsContentUpdate(bound, target)).toBe(false);
  });

  it("uses the active pack itself as the base when no profile is active", () => {
    const server = manifest("server", digest("1"));
    const target = contentTarget(
      campaignBinding(activeContent(digest("1")), campaign(1, "a")),
      { manifest: server, profile: undefined },
      [campaign(1, "a")],
    );
    expect(target).toMatchObject({
      baseLayers: [{ packId: "server", contentDigest: digest("1") }],
    });
  });

  it("composes a campaign target only when materialized", async () => {
    const active = activeContent(digest("1"));
    const doc = campaign(1, "a");
    const definition: CampaignProfileDefinition = {
      profileId: "campaign:golarion",
      name: "Golarion",
      layers: [
        ...(active.profile?.layers ?? []),
        { packId: "campaign.golarion.r1", contentDigest: digest("a") },
      ],
      resolutionPolicy: "last-pack-wins-v1",
      materializedPackId: "profile:campaign:golarion:abc",
      contentDigest: digest("c"),
      campaign: {
        campaignId: "golarion",
        revision: 1,
        contentDigest: digest("a"),
      },
    };
    const materializer = vi.fn(() => Promise.resolve(definition));
    const target = campaignChangeTarget(doc, active, materializer);
    expect(materializer).not.toHaveBeenCalled();
    const materialized = await target!.materialize();
    expect(materializer).toHaveBeenCalledWith(["server", "personal"], doc);
    expect(materialized).toEqual({
      packId: "profile:campaign:golarion:abc",
      binding: {
        packId: "profile:campaign:golarion:abc",
        contentDigest: digest("c"),
        layers: definition.layers,
        resolutionPolicy: "last-pack-wins-v1",
        campaign: definition.campaign,
      },
    });
    // The stored binding then matches its target by identity alone.
    expect(bindingMatchesTarget(materialized.binding, target!)).toBe(true);
  });

  it("tells joining, leaving and updating apart", () => {
    const active = activeContent(digest("1"));
    const outside: CharacterProfileBinding = { packId: "x" };
    const inside = campaignBinding(active, campaign(1, "a"));
    const into = campaignChangeTarget(campaign(1, "a"), active)!;
    const out = campaignChangeTarget(undefined, active)!;
    expect(contentTargetMove(outside, into)).toMatchObject({ kind: "join" });
    expect(contentTargetMove(inside, into)).toEqual({ kind: "update" });
    expect(contentTargetMove(inside, out)).toEqual({ kind: "leave" });
    expect(contentTargetMove(outside, out)).toEqual({ kind: "update" });
    // Leaving a campaign is a move even onto the same active pack.
    expect(
      bindingMatchesTarget(
        {
          ...inside,
          packId: active.manifest!.packId,
          contentDigest: digest("m"),
        },
        out,
      ),
    ).toBe(false);
  });
});
