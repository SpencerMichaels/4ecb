import { describe, expect, it } from "vitest";

import {
  resolvedBoundProfile,
  shouldShowBoundProfileWarning,
  type BoundProfileResolution,
} from "./bound-profile-resolution";

describe("bound content profile resolution", () => {
  it("does not report an ordinary asynchronous restore as missing", () => {
    const sequence: BoundProfileResolution[] = [
      "pending",
      resolvedBoundProfile({ contentDigest: "bound-digest" }, "bound-digest"),
    ];

    expect(sequence.map(shouldShowBoundProfileWarning)).toEqual([false, false]);
  });

  it("shows recovery guidance once a bound profile is conclusively missing", () => {
    const sequence: BoundProfileResolution[] = [
      "pending",
      resolvedBoundProfile({ contentDigest: "bound-digest" }, undefined),
    ];

    expect(sequence.map(shouldShowBoundProfileWarning)).toEqual([false, true]);
  });

  it("shows the same recovery guidance for an installed but invalid revision", () => {
    expect(
      shouldShowBoundProfileWarning(
        resolvedBoundProfile(
          { contentDigest: "bound-digest" },
          "different-digest",
        ),
      ),
    ).toBe(true);
  });

  it("does not describe an unbound character as having a missing binding", () => {
    expect(
      shouldShowBoundProfileWarning(resolvedBoundProfile(undefined, undefined)),
    ).toBe(false);
  });

  it("accepts an installed pack for a historical binding without a digest", () => {
    expect(
      shouldShowBoundProfileWarning(resolvedBoundProfile({}, "installed")),
    ).toBe(false);
  });
});
