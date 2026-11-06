import { describe, expect, it } from "vitest";

import {
  contentProfileMatchesRevision,
  contentProfileRevisionKey,
  previewMatchesTargetRevision,
} from "./profile-migration";

describe("profile migration revision gate", () => {
  it("accepts only the exact pack digest that was previewed", () => {
    const previewed = contentProfileRevisionKey({
      packId: "private-profile",
      contentDigest: "digest-a",
    });
    expect(
      previewMatchesTargetRevision(previewed, {
        packId: "private-profile",
        contentDigest: "digest-a",
      }),
    ).toBe(true);
    expect(
      previewMatchesTargetRevision(previewed, {
        packId: "private-profile",
        contentDigest: "digest-b",
      }),
    ).toBe(false);
  });

  it("keys a campaign profile by its campaign revision", () => {
    const base = {
      packId: "profile:campaign:setting:abc",
      contentDigest: "digest-a",
      layers: [{ packId: "base", contentDigest: "base-a" }],
      resolutionPolicy: "last-pack-wins-v1" as const,
    };
    const campaign = {
      campaignId: "setting",
      revision: 2,
      contentDigest: "campaign-a",
    };
    const key = contentProfileRevisionKey({ ...base, campaign });
    expect(key).not.toBe(contentProfileRevisionKey(base));
    expect(key).not.toBe(
      contentProfileRevisionKey({
        ...base,
        campaign: { ...campaign, contentDigest: "campaign-b" },
      }),
    );
    expect(previewMatchesTargetRevision(key, { ...base, campaign })).toBe(true);
    expect(previewMatchesTargetRevision(key, base)).toBe(false);
    // Keys without a campaign are unchanged.
    expect(contentProfileRevisionKey({ packId: "p", contentDigest: "d" })).toBe(
      "p:d",
    );
  });

  it("fails closed when either revision is unavailable", () => {
    expect(previewMatchesTargetRevision(undefined, undefined)).toBe(false);
  });

  it("allows evaluation only against the bound installed revision", () => {
    const binding = {
      packId: "private-profile",
      contentDigest: "digest-a",
    };
    expect(contentProfileMatchesRevision(binding, binding)).toBe(true);
    expect(
      contentProfileMatchesRevision(binding, {
        packId: "private-profile",
        contentDigest: "digest-b",
      }),
    ).toBe(false);
    expect(contentProfileMatchesRevision(binding, undefined)).toBe(false);
  });
});
