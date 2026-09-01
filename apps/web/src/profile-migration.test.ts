import { describe, expect, it } from "vitest";

import {
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
});
