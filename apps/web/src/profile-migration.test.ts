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
