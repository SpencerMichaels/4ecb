import { describe, expect, it } from "vitest";

import { decodeContentPack, validateContentPack } from "@4ecb/content-pack";

import { createFunctionalBaselineFixture } from "./functional-baseline-fixture";

describe("public functional baseline fixture", () => {
  it("is deterministic, valid, and high-cardinality", async () => {
    const first = await createFunctionalBaselineFixture();
    const second = await createFunctionalBaselineFixture();

    expect(first.encodedPack).toBe(second.encodedPack);
    expect(first.counts).toEqual({ feats: 420, shopItems: 260, entities: 681 });
    expect(first.character.build.inventory).toHaveLength(1);
    expect(first.character.profileBinding).toMatchObject({
      packId: first.manifest.packId,
      contentDigest: first.manifest.contentDigest,
    });
    await expect(
      validateContentPack(decodeContentPack(first.encodedPack)),
    ).resolves.toMatchObject({ valid: true });
  });
});
