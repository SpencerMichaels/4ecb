import { describe, expect, it } from "vitest";

import type {
  ContentEntity,
  ParsedContentEntity,
  ParsedContentSource,
} from "@4ecb/content-domain";

import {
  buildCampaign,
  buildContentPack,
  campaignHouseRulesPackId,
  composeCampaignProfile,
  composeContentPacks,
  decodeCampaign,
  decodeContentPack,
  encodeCampaign,
  encodeContentPack,
  resolveCampaignRestrictions,
  validateCampaign,
  validateContentPack,
  MAX_CAMPAIGN_HOUSE_RULE_RECORDS,
  MAX_CAMPAIGN_RESTRICTED_IDS,
  MAX_CAMPAIGN_TYPE_RULES,
  MAX_CAMPAIGN_LEGACY_XML_BYTES,
  MAX_CAMPAIGN_PATCHES,
  MAX_CAMPAIGN_PATCH_VALUE_LENGTH,
  campaignPatchOutcomes,
  campaignPatches,
  campaignRulePatchOutcomes,
  campaignRulePatches,
  type CampaignPatch,
  type CampaignPatchEntry,
  type CampaignRulePatch,
  type CampaignDocument,
  type CampaignManifest,
} from "./index";

function entity(
  id: string,
  type: string,
  name = id,
  sourceKey = "synthetic.xml",
): ParsedContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: `${name} text`,
    extensions: [],
    content: [],
    provenance: { sourceKey, sourceOrdinal: 0 },
  };
}

function source(
  entities: readonly ParsedContentEntity[],
  sourceKey = "synthetic.xml",
): ParsedContentSource {
  return {
    gameSystem: "D&D4E",
    sourceKey,
    entities,
    rejected: [],
    rawTopLevel: [],
    diagnostics: [],
    accounting: {
      topLevelRecords: entities.length,
      acceptedRecords: entities.length,
      warnedRecords: 0,
      rejectedRecords: 0,
      rawTopLevelElements: 0,
    },
  };
}

const stock = source([
  entity("ID_SYN_DEITY_SUN", "Deity", "Sun God"),
  entity("ID_SYN_DEITY_FORGE", "Deity", "Forge God"),
  entity("ID_SYN_DEITY_SEA", "Deity", "Sea God"),
  entity("ID_SYN_FEAT_SUN", "Feat", "Sun Worship"),
  entity("ID_SYN_FEAT_OLD", "Feat", "Old Feat"),
]);

const houseRuleSource = source(
  [
    entity("ID_SYN_DEITY_STONE", "Deity", "Stone God", "house-rules.xml"),
    // Replaces a stock deity under its ID: campaign content, not restricted.
    entity(
      "ID_SYN_DEITY_FORGE",
      "Deity",
      "Forge God (Setting)",
      "house-rules.xml",
    ),
  ],
  "house-rules.xml",
);

const xml =
  '<RulesElement name="Stone God" type="Deity" internal-id="ID_SYN_DEITY_STONE" />';

const manifest: CampaignManifest = {
  campaignId: "synthetic-setting",
  name: "Synthetic Setting",
  revision: 1,
  restrictions: {
    ids: ["id_syn_feat_old", "ID_SYN_UNKNOWN"],
    types: [{ type: "Deity", allow: "campaign-only" }],
  },
};

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function jsonBuffer(value: unknown): ArrayBuffer {
  return buffer(new TextEncoder().encode(JSON.stringify(value)));
}

async function gzip(bytes: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([buffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

describe("campaign documents", () => {
  it("builds deterministically, independent of restriction order", async () => {
    const first = await buildCampaign(manifest, houseRuleSource, xml);
    const second = await buildCampaign(
      {
        ...manifest,
        restrictions: {
          ...manifest.restrictions,
          ids: [...manifest.restrictions.ids].reverse(),
        },
      },
      houseRuleSource,
      xml,
    );
    expect(encodeCampaign(first)).toEqual(encodeCampaign(second));
    expect(first.restrictions.ids).toEqual([
      "id_syn_feat_old",
      "ID_SYN_UNKNOWN",
    ]);
    expect(first.houseRules.manifest.packId).toBe(
      "campaign.synthetic-setting.r1",
    );
    expect(first.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(await validateCampaign(first)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    const nextRevision = await buildCampaign(
      { ...manifest, revision: 2 },
      houseRuleSource,
      xml,
    );
    expect(nextRevision.contentDigest).not.toBe(first.contentDigest);
  });

  it("round-trips plain and gzipped bytes", async () => {
    const campaign = await buildCampaign(manifest, houseRuleSource, xml);
    const bytes = encodeCampaign(campaign);
    expect(await decodeCampaign(buffer(bytes))).toEqual(campaign);
    expect(await decodeCampaign(await gzip(bytes))).toEqual(campaign);
  });

  it("rejects tampered fields and house rules", async () => {
    const campaign = await buildCampaign(manifest, houseRuleSource, xml);
    const tampered: CampaignDocument[] = [
      { ...campaign, name: "Other Setting" },
      {
        ...campaign,
        restrictions: { ...campaign.restrictions, ids: ["ID_SYN_FEAT_SUN"] },
      },
      { ...campaign, legacyHouseRulesXml: "" },
    ];
    for (const document of tampered)
      await expect(decodeCampaign(jsonBuffer(document))).rejects.toThrow(
        /Digest mismatch/,
      );
    const [first, ...rest] = campaign.houseRules.entities;
    if (first === undefined) throw new Error("fixture has house rules");
    const editedPack = {
      ...campaign,
      houseRules: {
        ...campaign.houseRules,
        entities: [{ ...first, name: "Edited" }, ...rest],
      },
    };
    await expect(decodeCampaign(jsonBuffer(editedPack))).rejects.toThrow(
      /House rules: Digest mismatch/,
    );
    // A pack rebuilt under another identity changes the campaign digest too.
    const otherPack = await buildContentPack(houseRuleSource, {
      packId: "campaign.synthetic-setting.r9",
      name: "Synthetic Setting",
    });
    const validation = await validateCampaign({
      ...campaign,
      houseRules: otherPack,
    });
    expect(validation.errors).toEqual([
      "House rules packId campaign.synthetic-setting.r9 must be campaign.synthetic-setting.r1",
      expect.stringMatching(/^Digest mismatch/),
    ]);
    await expect(
      decodeCampaign(jsonBuffer({ ...campaign, format: "other" })),
    ).rejects.toThrow("Unsupported campaign format: other");
  });

  it("refuses invalid manifests at build", async () => {
    const invalid: [Partial<CampaignManifest>, RegExp][] = [
      [{ campaignId: "x".repeat(33) }, /campaignId must be 1-32/],
      [{ campaignId: "-bad" }, /campaignId/],
      [{ name: " Padded" }, /Campaign name must be/],
      [{ revision: 0 }, /revision must be an integer from 1/],
      [{ revision: 1_000_000 }, /revision must be an integer/],
      [{ revision: 1.5 }, /revision must be an integer/],
      [
        { restrictions: { ids: ["ID_A", "id_a"], types: [] } },
        /Restricted ID (ID_A|id_a) is listed twice/,
      ],
      [
        {
          restrictions: {
            ids: [],
            types: [
              { type: "Deity", allow: "campaign-only" },
              { type: "deity", allow: "campaign-only" },
            ],
          },
        },
        /Restricted type (Deity|deity) is listed twice/,
      ],
    ];
    for (const [change, message] of invalid)
      await expect(
        buildCampaign({ ...manifest, ...change }, houseRuleSource, xml),
      ).rejects.toThrow(message);
    await expect(
      buildCampaign(
        manifest,
        houseRuleSource,
        "x".repeat(MAX_CAMPAIGN_LEGACY_XML_BYTES + 1),
      ),
    ).rejects.toThrow(/Legacy house-rule XML exceeds/);
    expect(campaignHouseRulesPackId("a".repeat(32), 999_999).length).toBe(49);
  });

  it("enforces decode limits", async () => {
    const campaign = await buildCampaign(manifest, houseRuleSource, xml);
    const bytes = encodeCampaign(campaign);
    await expect(
      decodeCampaign(buffer(bytes), { maxEncodedBytes: 100 }),
    ).rejects.toThrow(/Campaign exceeds the 100 byte input-size limit/);
    await expect(
      decodeCampaign(await gzip(bytes), { maxDecodedBytes: 100 }),
    ).rejects.toThrow(/Decoded campaign exceeds the 100 byte limit/);
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          restrictions: {
            ids: Array.from(
              { length: MAX_CAMPAIGN_RESTRICTED_IDS + 1 },
              (_, index) => `ID_${index}`,
            ),
            types: [],
          },
        }),
      ),
    ).rejects.toThrow(/restricts at most 50,000 IDs/);
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          restrictions: {
            ids: [],
            types: Array.from(
              { length: MAX_CAMPAIGN_TYPE_RULES + 1 },
              (_, index) => ({ type: `Type${index}`, allow: "campaign-only" }),
            ),
          },
        }),
      ),
    ).rejects.toThrow(/at most 32 type restrictions/);
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          houseRules: {
            ...campaign.houseRules,
            entities: Array.from(
              { length: MAX_CAMPAIGN_HOUSE_RULE_RECORDS + 1 },
              () => ({}),
            ),
          },
        }),
      ),
    ).rejects.toThrow(/at most 10,000 house-rule records/);
    await expect(
      buildCampaign(
        manifest,
        source(
          Array.from({ length: MAX_CAMPAIGN_HOUSE_RULE_RECORDS + 1 }, (_, i) =>
            entity(`ID_HR_${i}`, "Feat"),
          ),
        ),
        xml,
      ),
    ).rejects.toThrow(/at most 10,000 house-rule records/);
  });

  it("resolves ID rules ignoring case and type rules to non-campaign records", async () => {
    const campaign = await buildCampaign(manifest, houseRuleSource, xml);
    const base = await buildContentPack(stock, {
      packId: "synthetic",
      name: "Synthetic",
    });
    const composed = await composeContentPacks([base, campaign.houseRules], {
      packId: "profile:x",
      name: "X",
    });
    expect(
      resolveCampaignRestrictions(composed.pack.entities, campaign),
    ).toEqual([
      // Stock deities not supplied by the campaign; ID_SYN_DEITY_FORGE is
      // replaced by the overlay and ID_SYN_DEITY_STONE is the overlay's.
      "ID_SYN_DEITY_SEA",
      "ID_SYN_DEITY_SUN",
      // The ID rule in the composed record's spelling, and an unknown ID kept.
      "ID_SYN_FEAT_OLD",
      "ID_SYN_UNKNOWN",
    ]);
    // An explicit ID rule still restricts the campaign's own record.
    expect(
      resolveCampaignRestrictions(composed.pack.entities, {
        ...campaign,
        restrictions: { ids: ["id_syn_deity_stone"], types: [] },
      }),
    ).toEqual(["ID_SYN_DEITY_STONE"]);
  });

  it("composes a campaign profile whose digest binds the campaign", async () => {
    const campaign = await buildCampaign(manifest, houseRuleSource, xml);
    const base = await buildContentPack(stock, {
      packId: "synthetic",
      name: "Synthetic",
    });
    const profile = await composeCampaignProfile([base], campaign, {
      packId: "campaign:synthetic-setting:abc",
      name: "Synthetic Setting",
    });
    expect(profile.layers.map(({ packId }) => packId)).toEqual([
      "synthetic",
      "campaign.synthetic-setting.r1",
    ]);
    expect(profile.pack.campaign).toEqual({
      campaignId: "synthetic-setting",
      revision: 1,
      contentDigest: campaign.contentDigest,
      restrictedIds: [
        "ID_SYN_DEITY_SEA",
        "ID_SYN_DEITY_SUN",
        "ID_SYN_FEAT_OLD",
        "ID_SYN_UNKNOWN",
      ],
    });
    expect(
      profile.pack.entities.find(({ id }) => id === "ID_SYN_DEITY_FORGE")?.name,
    ).toBe("Forge God (Setting)");
    expect((await validateContentPack(profile.pack)).valid).toBe(true);
    const decoded = decodeContentPack(encodeContentPack(profile.pack));
    expect(decoded.campaign).toEqual(profile.pack.campaign);

    const plain = await composeContentPacks([base, campaign.houseRules], {
      packId: "campaign:synthetic-setting:abc",
      name: "Synthetic Setting",
    });
    expect(plain.pack.manifest.contentDigest).not.toBe(
      profile.pack.manifest.contentDigest,
    );
    const altered = {
      ...profile.pack,
      campaign: { ...profile.pack.campaign!, restrictedIds: [] },
    };
    expect((await validateContentPack(altered)).errors).toEqual([
      expect.stringMatching(/^Digest mismatch/),
    ]);
    expect(() =>
      decodeContentPack(
        encodeContentPack({
          ...profile.pack,
          campaign: { ...profile.pack.campaign!, revision: "1" as never },
        }),
      ),
    ).toThrow("Content pack campaign is invalid");

    await expect(
      composeCampaignProfile([profile.pack], campaign, {
        packId: "campaign:nested",
        name: "Nested",
      }),
    ).rejects.toThrow(/cannot layer another campaign profile/);
  });

  it("covers base records added after the campaign was built", async () => {
    const campaign = await buildCampaign(manifest, houseRuleSource, xml);
    const laterBase = await buildContentPack(
      source([...stock.entities, entity("ID_SYN_DEITY_MOON", "Deity")]),
      { packId: "synthetic", name: "Synthetic" },
    );
    const profile = await composeCampaignProfile([laterBase], campaign, {
      packId: "campaign:synthetic-setting:def",
      name: "Synthetic Setting",
    });
    expect(profile.pack.campaign?.restrictedIds).toContain("ID_SYN_DEITY_MOON");
  });

  it("leaves packs without a campaign on their existing digests", async () => {
    // Digests recorded before the optional `campaign` field existed.
    const single = source(
      [entity("ID_TEST_1", "Feat", "ID_TEST_1", "sample.xml")],
      "sample.xml",
    );
    const fixture: ParsedContentSource = {
      ...single,
      entities: single.entities.map((value) => ({
        ...value,
        description: "Example text",
      })),
    };
    const pack = await buildContentPack(fixture, {
      packId: "synthetic",
      name: "Synthetic",
    });
    expect(pack.manifest.contentDigest).toBe(
      "730b0133fead55872474538fd3e76e9e7b443bbe85c5e72bae2fba93082d3821",
    );
    expect("campaign" in pack).toBe(false);
    const overlay = await buildContentPack(
      {
        ...fixture,
        entities: fixture.entities.map((value) => ({
          ...value,
          id: "ID_TEST_2",
          name: "ID_TEST_2",
        })),
      },
      { packId: "overlay", name: "Overlay" },
    );
    const composed = await composeContentPacks([pack, overlay], {
      packId: "profile:x",
      name: "X",
    });
    expect(composed.pack.manifest.contentDigest).toBe(
      "5804b4370ed0147c69518c79a34bf549a89c2817160e70db1bfccbcff4c16733",
    );
    expect("campaign" in composed.pack).toBe(false);
  });
});

describe("campaign field patches", () => {
  const race = {
    ...entity("ID_SYN_RACE_GENASI", "Race", "Genasi"),
    specifics: [
      {
        name: "Languages",
        value: "Common, Primordial",
        extraAttributes: [],
        ordinal: 0,
      },
      { name: "Size", value: "Medium", extraAttributes: [], ordinal: 1 },
    ],
  };
  const patchedStock = source([
    ...stock.entities,
    race,
    entity("ID_SYN_LEARN_PRIMORDIAL", "Background Choice", "Learn Primordial"),
  ]);
  const patches: CampaignPatch[] = [
    {
      id: "ID_SYN_RACE_GENASI",
      field: "Languages",
      expect: "Common, Primordial",
      value: "Common, Ignan",
    },
    {
      id: "id_syn_learn_primordial",
      field: "name",
      expect: "Learn Primordial",
      value: "Learn Ignan",
    },
  ];
  const patchedManifest: CampaignManifest = { ...manifest, patches };

  async function base(entities = patchedStock) {
    return buildContentPack(entities, {
      packId: "synthetic",
      name: "Synthetic",
    });
  }

  it("builds patches in canonical order under the digest", async () => {
    const campaign = await buildCampaign(patchedManifest, houseRuleSource, xml);
    expect(campaign.version).toBe(3);
    expect(campaignPatches(campaign).map(({ id }) => id)).toEqual([
      "id_syn_learn_primordial",
      "ID_SYN_RACE_GENASI",
    ]);
    const reordered = await buildCampaign(
      { ...manifest, patches: [...patches].reverse() },
      houseRuleSource,
      xml,
    );
    expect(encodeCampaign(reordered)).toEqual(encodeCampaign(campaign));
    const unpatched = await buildCampaign(manifest, houseRuleSource, xml);
    expect(unpatched.patches).toEqual([]);
    expect(unpatched.contentDigest).not.toBe(campaign.contentDigest);
    expect(await decodeCampaign(buffer(encodeCampaign(campaign)))).toEqual(
      campaign,
    );
    const [first, ...rest] = campaignPatches(campaign);
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          patches: [{ ...first!, value: "Common, Aquan" }, ...rest],
        }),
      ),
    ).rejects.toThrow(/Digest mismatch/);
  });

  it("applies a patch only to the field it names", async () => {
    const campaign = await buildCampaign(patchedManifest, houseRuleSource, xml);
    const profile = await composeCampaignProfile([await base()], campaign, {
      packId: "campaign:synthetic-setting:p",
      name: "Synthetic Setting",
    });
    const genasi = profile.pack.entities.find(
      ({ id }) => id === "ID_SYN_RACE_GENASI",
    );
    expect(genasi?.specifics.map(({ name, value }) => [name, value])).toEqual([
      ["Languages", "Common, Ignan"],
      ["Size", "Medium"],
    ]);
    expect(genasi?.description).toBe("Genasi text");
    // A renamed record keeps its stock name as an alias (D116).
    const learn = profile.pack.entities.find(
      ({ id }) => id === "ID_SYN_LEARN_PRIMORDIAL",
    );
    expect(learn?.name).toBe("Learn Ignan");
    expect(learn?.aliases).toEqual(["Learn Primordial"]);
    expect(genasi).not.toHaveProperty("aliases");
    expect(
      profile.pack.diagnostics.filter(({ code }) =>
        code.startsWith("campaign."),
      ),
    ).toEqual([]);
    expect((await validateContentPack(profile.pack)).valid).toBe(true);
  });

  it("keeps a renamed record's earlier aliases and drops its new name from them", async () => {
    const aliased = source([
      ...patchedStock.entities.filter(
        ({ id }) => id !== "ID_SYN_LEARN_PRIMORDIAL",
      ),
      {
        ...entity(
          "ID_SYN_LEARN_PRIMORDIAL",
          "Background Choice",
          "Learn Primordial",
        ),
        aliases: ["Learn Ignan", "Learn the Old Tongue"],
      },
    ]);
    const campaign = await buildCampaign(patchedManifest, houseRuleSource, xml);
    const profile = await composeCampaignProfile(
      [await base(aliased)],
      campaign,
      { packId: "campaign:synthetic-setting:a", name: "Synthetic Setting" },
    );
    expect(
      profile.pack.entities.find(({ id }) => id === "ID_SYN_LEARN_PRIMORDIAL")
        ?.aliases,
    ).toEqual(["Learn the Old Tongue", "Learn Primordial"]);
  });

  it("keeps the content's value when it changed or the target is gone", async () => {
    const campaign = await buildCampaign(
      {
        ...patchedManifest,
        patches: [
          ...patches,
          { id: "ID_SYN_GONE", field: "name", expect: "Gone", value: "Here" },
          {
            id: "ID_SYN_RACE_GENASI",
            field: "Vision",
            expect: "Low-light",
            value: "Darkvision",
          },
        ],
      },
      houseRuleSource,
      xml,
    );
    // A later server revision fixed the Genasi's languages.
    const fixed = source([
      ...patchedStock.entities.filter(({ id }) => id !== race.id),
      {
        ...race,
        specifics: race.specifics.map((specific) =>
          specific.name === "Languages"
            ? { ...specific, value: "Common, Primordial, Elven" }
            : specific,
        ),
      },
    ]);
    const profile = await composeCampaignProfile(
      [await base(fixed)],
      campaign,
      {
        packId: "campaign:synthetic-setting:q",
        name: "Synthetic Setting",
      },
    );
    expect(
      profile.pack.entities
        .find(({ id }) => id === "ID_SYN_RACE_GENASI")
        ?.specifics.find(({ name }) => name === "Languages")?.value,
    ).toBe("Common, Primordial, Elven");
    // The other patch still applies.
    expect(
      profile.pack.entities.find(({ id }) => id === "ID_SYN_LEARN_PRIMORDIAL")
        ?.name,
    ).toBe("Learn Ignan");
    expect(
      profile.pack.diagnostics
        .filter(({ code }) => code === "campaign.patch-not-applied")
        .map(({ severity, message, entityId }) => [
          severity,
          entityId,
          message,
        ]),
    ).toEqual([
      [
        "warning",
        "ID_SYN_GONE",
        "Patch ID_SYN_GONE name not applied: no record ID_SYN_GONE",
      ],
      [
        "warning",
        "ID_SYN_RACE_GENASI",
        'Patch ID_SYN_RACE_GENASI Languages not applied: the content has "Common, Primordial, Elven", the patch expects "Common, Primordial"',
      ],
      [
        "warning",
        "ID_SYN_RACE_GENASI",
        "Patch ID_SYN_RACE_GENASI Vision not applied: ID_SYN_RACE_GENASI has no Vision field",
      ],
    ]);
    expect(
      campaignPatchOutcomes(
        (await base(fixed)).entities,
        campaignPatches(campaign),
      ).map(({ status }) => status),
    ).toEqual(["target-missing", "applies", "stock-differs", "field-missing"]);
  });

  it("refuses patches on house-rule records and invalid patches", async () => {
    const invalid: [CampaignPatch[], RegExp][] = [
      [
        [
          {
            id: "id_syn_deity_forge",
            field: "name",
            expect: "Forge God",
            value: "Smith God",
          },
        ],
        /is one of the campaign's house rules; edit the record instead/,
      ],
      [[{ ...patches[0]!, value: patches[0]!.expect }], /changes nothing/],
      [[patches[0]!, { ...patches[0]!, field: "languages" }], /listed twice/],
      [[{ ...patches[0]!, field: "_Power Text IR" }], /cannot be patched/],
      [[{ ...patches[1]!, value: " " }], /record name cannot be empty/],
      [
        [
          {
            ...patches[0]!,
            value: "x".repeat(MAX_CAMPAIGN_PATCH_VALUE_LENGTH + 1),
          },
        ],
        /value must be at most 4,000 characters/,
      ],
      [
        Array.from({ length: MAX_CAMPAIGN_PATCHES + 1 }, (_, index) => ({
          ...patches[0]!,
          id: `ID_${index}`,
        })),
        /at most 10,000 patches/,
      ],
    ];
    for (const [list, message] of invalid)
      await expect(
        buildCampaign({ ...manifest, patches: list }, houseRuleSource, xml),
      ).rejects.toThrow(message);
    const campaign = await buildCampaign(patchedManifest, houseRuleSource, xml);
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          patches: Array.from({ length: MAX_CAMPAIGN_PATCHES + 1 }, () => 0),
        }),
      ),
    ).rejects.toThrow(/at most 10,000 patches/);
    await expect(
      decodeCampaign(jsonBuffer({ ...campaign, patches: [{ id: 1 }] })),
    ).rejects.toThrow("Campaign patches are invalid");
    const { patches: _omitted, ...withoutPatches } = campaign;
    void _omitted;
    await expect(decodeCampaign(jsonBuffer(withoutPatches))).rejects.toThrow(
      "Campaign patches are missing",
    );
  });

  it("still decodes version 1 documents as having no patches", async () => {
    const built = await buildCampaign(manifest, houseRuleSource, xml);
    const { patches: _omitted, ...rest } = built;
    void _omitted;
    // The digest a version-1 build gave this campaign, before patches.
    const v1 = {
      ...rest,
      version: 1,
      contentDigest:
        "9282f9ecb068256ad651968a4ca987a89bce58799415dd41eb0399811b9c17ba",
    } as const;
    const decoded = await decodeCampaign(jsonBuffer(v1));
    expect(decoded.version).toBe(1);
    expect(campaignPatches(decoded)).toEqual([]);
    const profile = await composeCampaignProfile([await base()], decoded, {
      packId: "campaign:synthetic-setting:v1",
      name: "Synthetic Setting",
    });
    expect(profile.pack.campaign?.contentDigest).toBe(v1.contentDigest);
    await expect(
      decodeCampaign(jsonBuffer({ ...v1, patches })),
    ).rejects.toThrow("A version 1 campaign cannot carry patches");
    await expect(
      decodeCampaign(jsonBuffer({ ...built, version: 4 })),
    ).rejects.toThrow("Unsupported campaign version: 4");
  });

  it("still decodes version 2 documents with their digests", async () => {
    const built = await buildCampaign(patchedManifest, houseRuleSource, xml);
    // The digest a version-2 build gave this campaign, before rule patches.
    const v2 = {
      ...built,
      version: 2,
      contentDigest:
        "a33b381b293c2143fe497c366f655c7fa986fa6a810e2e71cc139d8e3dbbb283",
    } as const;
    const decoded = await decodeCampaign(jsonBuffer(v2));
    expect(decoded.version).toBe(2);
    expect(campaignPatches(decoded)).toEqual(campaignPatches(built));
    expect(campaignRulePatches(decoded)).toEqual([]);
    const profile = await composeCampaignProfile([await base()], decoded, {
      packId: "campaign:synthetic-setting:v2",
      name: "Synthetic Setting",
    });
    expect(
      profile.pack.entities.find(({ id }) => id === "ID_SYN_LEARN_PRIMORDIAL")
        ?.name,
    ).toBe("Learn Ignan");
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...v2,
          patches: [
            ...v2.patches!,
            { id: "ID_SYN_RACE_GENASI", rule: { add: [grantIgnan] } },
          ],
        }),
      ),
    ).rejects.toThrow("Campaign patches are invalid");
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...v2,
          patches: [
            {
              id: "ID_SYN_RACE_GENASI",
              field: "prerequisites",
              expect: "",
              value: "Fire",
            },
          ],
        }),
      ),
    ).rejects.toThrow("A version 2 campaign cannot patch prerequisites");
  });
});

const grantIgnan = {
  name: "grant",
  attributes: { name: "ID_SYN_LANGUAGE_IGNAN", type: "Language" },
};

describe("campaign rule patches", () => {
  function rule(
    name: string,
    attributes: Record<string, string>,
    ordinal: number,
    text = "",
  ) {
    return {
      name,
      attributes: Object.entries(attributes).map(([key, value]) => ({
        name: key,
        value,
      })),
      text,
      children: [],
      ordinal,
    };
  }
  const grants = {
    ...entity("ID_SYN_GRANTS_GENASI", "Grants", "Genasi"),
    rules: [
      rule("grant", { name: "ID_SYN_SIZE_MEDIUM", type: "Size" }, 0),
      rule("grant", { name: "ID_SYN_LANGUAGE_COMMON", type: "Language" }, 1),
      rule(
        "grant",
        { name: "ID_SYN_LANGUAGE_PRIMORDIAL", type: "Language" },
        2,
      ),
      rule("statadd", { name: "Speed", value: "+6" }, 3),
    ],
  };
  const feat = {
    ...entity("ID_SYN_FEAT_SCHOLAR", "Feat", "Scholar"),
    prerequisites: "!ID_SYN_LANGUAGE_PRIMORDIAL",
    rules: [
      rule(
        "select",
        {
          type: "Language",
          number: "1",
          Category: "ID_SYN_LANGUAGE_COMMON|ID_SYN_LANGUAGE_PRIMORDIAL",
          default: "ID_SYN_LANGUAGE_PRIMORDIAL",
        },
        0,
      ),
      rule(
        "select",
        {
          type: "Language",
          number: "1",
          Category: "ID_SYN_LANGUAGE_PRIMORDIAL_2",
        },
        1,
      ),
    ],
  };
  const race = {
    ...entity("ID_SYN_RACE_TIEFLING", "Race", "Tiefling"),
    rules: [
      rule(
        "select",
        { type: "Language", number: "1", Category: "Starting" },
        0,
      ),
    ],
  };
  const stockRecords = source([...stock.entities, grants, feat, race]);
  const replaceGrant: CampaignRulePatch = {
    id: "ID_SYN_GRANTS_GENASI",
    rule: {
      match: {
        name: "grant",
        attributes: { name: "ID_SYN_LANGUAGE_PRIMORDIAL", type: "Language" },
      },
      set: { name: "ID_SYN_LANGUAGE_IGNAN" },
    },
  };
  const rulePatches: CampaignPatchEntry[] = [
    replaceGrant,
    {
      id: "ID_SYN_GRANTS_GENASI",
      rule: {
        add: [
          {
            name: "select",
            attributes: { type: "Language", number: "1", Category: "Starting" },
            text: "Choose a language",
          },
        ],
      },
    },
    {
      id: "ID_SYN_GRANTS_GENASI",
      rule: {
        match: { name: "statadd", attributes: { name: "speed" } },
        remove: true,
      },
    },
    {
      id: "ID_SYN_FEAT_SCHOLAR",
      rule: {
        match: { name: "select", attributes: { type: "Language" } },
        replaceId: {
          from: "ID_SYN_LANGUAGE_PRIMORDIAL",
          to: "ID_SYN_LANGUAGE_IGNAN|ID_SYN_LANGUAGE_AQUAN",
        },
      },
    },
    {
      id: "ID_SYN_FEAT_SCHOLAR",
      field: "prerequisites",
      expect: "!ID_SYN_LANGUAGE_PRIMORDIAL",
      value: "",
    },
    {
      id: "ID_SYN_RACE_TIEFLING",
      rule: {
        match: {
          name: "select",
          attributes: { type: "Language", Category: "Starting" },
        },
        replaceWith: {
          name: "grant",
          attributes: { name: "ID_SYN_LANGUAGE_IGNAN", type: "Language" },
        },
      },
    },
  ];
  const ruleManifest: CampaignManifest = { ...manifest, patches: rulePatches };
  const options = { packId: "campaign:synthetic-setting:r", name: "Synthetic" };

  async function base(entities = stockRecords) {
    return buildContentPack(entities, { packId: "synthetic", name: "S" });
  }

  function rulesOf(pack: { entities: readonly ContentEntity[] }, id: string) {
    return pack.entities
      .find((candidate) => candidate.id === id)
      ?.rules.map(({ name, attributes, text, ordinal }) => [
        ordinal,
        name,
        Object.fromEntries(attributes.map((a) => [a.name, a.value])),
        text,
      ]);
  }

  it("applies each operation in order and keeps the record's other rules", async () => {
    const campaign = await buildCampaign(ruleManifest, houseRuleSource, xml);
    expect(campaign.version).toBe(3);
    // Field patches sort before a record's rule patches, which keep their
    // authored order.
    expect(
      (campaign.patches ?? []).map((patch) =>
        "rule" in patch ? `${patch.id} rule` : `${patch.id} ${patch.field}`,
      ),
    ).toEqual([
      "ID_SYN_FEAT_SCHOLAR prerequisites",
      "ID_SYN_FEAT_SCHOLAR rule",
      "ID_SYN_GRANTS_GENASI rule",
      "ID_SYN_GRANTS_GENASI rule",
      "ID_SYN_GRANTS_GENASI rule",
      "ID_SYN_RACE_TIEFLING rule",
    ]);
    const profile = await composeCampaignProfile(
      [await base()],
      campaign,
      options,
    );
    expect(rulesOf(profile.pack, "ID_SYN_GRANTS_GENASI")).toEqual([
      [0, "grant", { name: "ID_SYN_SIZE_MEDIUM", type: "Size" }, ""],
      [1, "grant", { name: "ID_SYN_LANGUAGE_COMMON", type: "Language" }, ""],
      [2, "grant", { name: "ID_SYN_LANGUAGE_IGNAN", type: "Language" }, ""],
      [
        3,
        "select",
        { type: "Language", number: "1", Category: "Starting" },
        "Choose a language",
      ],
    ]);
    // Whole tokens only: ID_SYN_LANGUAGE_PRIMORDIAL_2 is another ID.
    expect(rulesOf(profile.pack, "ID_SYN_FEAT_SCHOLAR")).toEqual([
      [
        0,
        "select",
        {
          type: "Language",
          number: "1",
          Category:
            "ID_SYN_LANGUAGE_COMMON|ID_SYN_LANGUAGE_IGNAN|ID_SYN_LANGUAGE_AQUAN",
          default: "ID_SYN_LANGUAGE_IGNAN|ID_SYN_LANGUAGE_AQUAN",
        },
        "",
      ],
      [
        1,
        "select",
        {
          type: "Language",
          number: "1",
          Category: "ID_SYN_LANGUAGE_PRIMORDIAL_2",
        },
        "",
      ],
    ]);
    expect(rulesOf(profile.pack, "ID_SYN_RACE_TIEFLING")).toEqual([
      [0, "grant", { name: "ID_SYN_LANGUAGE_IGNAN", type: "Language" }, ""],
    ]);
    const scholar = profile.pack.entities.find(
      ({ id }) => id === "ID_SYN_FEAT_SCHOLAR",
    );
    expect(scholar).not.toHaveProperty("prerequisites");
    expect(scholar?.description).toBe("Scholar text");
    expect(
      profile.pack.diagnostics.filter(({ code }) =>
        code.startsWith("campaign."),
      ),
    ).toEqual([]);
    expect((await validateContentPack(profile.pack)).valid).toBe(true);
    expect(await decodeCampaign(buffer(encodeCampaign(campaign)))).toEqual(
      campaign,
    );
  });

  it("keeps the server's rules with a diagnostic when a match drifts", async () => {
    const campaign = await buildCampaign(
      {
        ...manifest,
        patches: [
          replaceGrant,
          {
            id: "ID_SYN_FEAT_SCHOLAR",
            rule: {
              match: { name: "select", attributes: { type: "Language" } },
              remove: true,
            },
          },
          {
            id: "ID_SYN_RACE_TIEFLING",
            rule: { add: [{ ...grantIgnan, name: "Grant" }] },
          },
          {
            id: "ID_SYN_GONE",
            rule: { add: [grantIgnan] },
          },
        ],
      },
      houseRuleSource,
      xml,
    );
    // A later server revision already grants Ignan, in place of Primordial.
    const fixed = source([
      ...stockRecords.entities.filter(
        ({ id }) => id !== grants.id && id !== race.id,
      ),
      {
        ...grants,
        rules: grants.rules.map((statement) =>
          statement.ordinal === 2
            ? rule("grant", grantIgnan.attributes, 2)
            : statement,
        ),
      },
      {
        ...race,
        rules: [...race.rules, rule("grant", grantIgnan.attributes, 1)],
      },
    ]);
    const profile = await composeCampaignProfile(
      [await base(fixed)],
      campaign,
      options,
    );
    expect(rulesOf(profile.pack, "ID_SYN_GRANTS_GENASI")).toEqual(
      rulesOf(await base(fixed), "ID_SYN_GRANTS_GENASI"),
    );
    expect(rulesOf(profile.pack, "ID_SYN_FEAT_SCHOLAR")).toEqual(
      rulesOf(await base(fixed), "ID_SYN_FEAT_SCHOLAR"),
    );
    expect(
      profile.pack.diagnostics
        .filter(({ code }) => code === "campaign.rule-patch-not-applied")
        .map(({ severity, entityId, message }) => [
          severity,
          entityId,
          message,
        ]),
    ).toEqual([
      [
        "warning",
        "ID_SYN_FEAT_SCHOLAR",
        'Rule patch ID_SYN_FEAT_SCHOLAR: remove <select type="Language" /> not applied: ID_SYN_FEAT_SCHOLAR has 2 matching rule elements, the patch expects 1: <select type="Language" number="1" Category="ID_SYN_LANGUAGE_COMMON|ID_SYN_LANGUAGE_PRIMORDIAL" default="ID_SYN_LANGUAGE_PRIMORDIAL" />, <select type="Language" number="1" Category="ID_SYN_LANGUAGE_PRIMORDIAL_2" />',
      ],
      [
        "warning",
        "ID_SYN_GONE",
        'Rule patch ID_SYN_GONE: add <grant name="ID_SYN_LANGUAGE_IGNAN" type="Language" /> not applied: no record ID_SYN_GONE',
      ],
      [
        "warning",
        "ID_SYN_GRANTS_GENASI",
        'Rule patch ID_SYN_GRANTS_GENASI: set name="ID_SYN_LANGUAGE_IGNAN" on <grant name="ID_SYN_LANGUAGE_PRIMORDIAL" type="Language" /> not applied: ID_SYN_GRANTS_GENASI has no matching rule element',
      ],
      [
        "warning",
        "ID_SYN_RACE_TIEFLING",
        'Rule patch ID_SYN_RACE_TIEFLING: add <Grant name="ID_SYN_LANGUAGE_IGNAN" type="Language" /> not applied: ID_SYN_RACE_TIEFLING already has <grant name="ID_SYN_LANGUAGE_IGNAN" type="Language" />',
      ],
    ]);
    expect(
      campaignRulePatchOutcomes(
        (await base(fixed)).entities,
        campaignRulePatches(campaign),
      ).map(({ status }) => status),
    ).toEqual(["ambiguous", "target-missing", "no-match", "present"]);
    // With the declared count, the same match applies.
    const both = await buildCampaign(
      {
        ...manifest,
        patches: [
          {
            id: "ID_SYN_FEAT_SCHOLAR",
            rule: {
              match: { name: "select", attributes: { type: "Language" } },
              count: 2,
              remove: true,
            },
          },
        ],
      },
      houseRuleSource,
      xml,
    );
    expect(
      rulesOf(
        (await composeCampaignProfile([await base()], both, options)).pack,
        "ID_SYN_FEAT_SCHOLAR",
      ),
    ).toEqual([]);
  });

  it("places added elements before or after one anchor element", async () => {
    const common = {
      name: "grant",
      attributes: { name: "ID_SYN_LANGUAGE_COMMON" },
    };
    const aquan = {
      name: "grant",
      attributes: { name: "ID_SYN_LANGUAGE_AQUAN", type: "Language" },
    };
    const campaign = await buildCampaign(
      {
        ...manifest,
        patches: [
          { id: grants.id, rule: { add: [grantIgnan], after: common } },
          { id: grants.id, rule: { add: [aquan], before: common } },
          // No element, or several, match the anchor: not applied.
          {
            id: grants.id,
            rule: { add: [{ ...aquan, name: "x" }], after: { name: "select" } },
          },
          {
            id: grants.id,
            rule: {
              add: [{ ...aquan, name: "y" }],
              before: { name: "grant", attributes: { type: "Language" } },
            },
          },
        ],
      },
      houseRuleSource,
      xml,
    );
    const profile = await composeCampaignProfile(
      [await base()],
      campaign,
      options,
    );
    expect(
      rulesOf(profile.pack, grants.id)?.map(([ordinal, name, attributes]) => [
        ordinal,
        name,
        (attributes as Record<string, string>).name,
      ]),
    ).toEqual([
      [0, "grant", "ID_SYN_SIZE_MEDIUM"],
      [1, "grant", "ID_SYN_LANGUAGE_AQUAN"],
      [2, "grant", "ID_SYN_LANGUAGE_COMMON"],
      [3, "grant", "ID_SYN_LANGUAGE_IGNAN"],
      [4, "grant", "ID_SYN_LANGUAGE_PRIMORDIAL"],
      [5, "statadd", "Speed"],
    ]);
    expect(
      campaignRulePatchOutcomes(
        (await base()).entities,
        campaignRulePatches(campaign),
      ).map(({ status, matched }) => [status, matched.length]),
    ).toEqual([
      ["applies", 1],
      ["applies", 1],
      ["no-match", 0],
      ["ambiguous", 4],
    ]);
    expect(
      profile.pack.diagnostics
        .filter(({ code }) => code === "campaign.rule-patch-not-applied")
        .map(({ message }) => message)[1],
    ).toMatch(
      /^Rule patch ID_SYN_GRANTS_GENASI: add <y name="ID_SYN_LANGUAGE_AQUAN" type="Language" \/> before <grant type="Language" \/> not applied: ID_SYN_GRANTS_GENASI has 4 matching rule elements, the patch expects 1: /,
    );
    for (const [rule, message] of [
      [{ add: [aquan], before: common, after: common }, /not both/],
      [
        { match: common, remove: true, after: common },
        /only add takes before or after/,
      ],
    ] as const)
      await expect(
        buildCampaign(
          { ...manifest, patches: [{ id: "ID_X", rule }] },
          houseRuleSource,
          xml,
        ),
      ).rejects.toThrow(message);
  });

  it("puts rule patches under the digest", async () => {
    const campaign = await buildCampaign(ruleManifest, houseRuleSource, xml);
    const fieldOnly = await buildCampaign(
      {
        ...manifest,
        patches: rulePatches.filter((patch) => !("rule" in patch)),
      },
      houseRuleSource,
      xml,
    );
    expect(fieldOnly.contentDigest).not.toBe(campaign.contentDigest);
    // count: 1 is the default and canonicalizes away.
    const explicit = await buildCampaign(
      {
        ...manifest,
        patches: rulePatches.map((patch) =>
          "rule" in patch && patch.rule.match !== undefined
            ? { ...patch, rule: { ...patch.rule, count: 1 } }
            : patch,
        ),
      },
      houseRuleSource,
      xml,
    );
    expect(explicit.contentDigest).toBe(campaign.contentDigest);
    const tampered = (campaign.patches ?? []).map((patch) =>
      patch === campaignRulePatches(campaign)[0]
        ? {
            ...patch,
            rule: { ...patch.rule, replaceId: { from: "A", to: "B" } },
          }
        : patch,
    );
    await expect(
      decodeCampaign(jsonBuffer({ ...campaign, patches: tampered })),
    ).rejects.toThrow(/Digest mismatch|exactly one of/);
    const changed = (campaign.patches ?? []).map((patch) =>
      patch === campaignRulePatches(campaign)[0]
        ? {
            ...patch,
            rule: {
              ...patch.rule,
              replaceId: { from: "ID_SYN_LANGUAGE_PRIMORDIAL", to: "X" },
            },
          }
        : patch,
    );
    await expect(
      decodeCampaign(jsonBuffer({ ...campaign, patches: changed })),
    ).rejects.toThrow(/Digest mismatch/);
  });

  it("refuses rule patches on house-rule records and invalid operations", async () => {
    const select = { name: "select", attributes: { type: "Language" } };
    const invalid: [CampaignPatchEntry, RegExp][] = [
      [
        { id: "id_syn_deity_forge", rule: { add: [grantIgnan] } },
        /is one of the campaign's house rules; edit the record instead/,
      ],
      [
        {
          id: "ID_X",
          rule: { match: select, remove: true, add: [grantIgnan] },
        },
        /exactly one of set, replaceId, replaceWith, remove, add, not remove and add/,
      ],
      [{ id: "ID_X", rule: {} }, /exactly one of/],
      [{ id: "ID_X", rule: { remove: true } }, /needs a match/],
      [
        { id: "ID_X", rule: { match: select, add: [grantIgnan] } },
        /add takes no match or count/,
      ],
      [{ id: "ID_X", rule: { add: [] } }, /add lists no elements/],
      [
        { id: "ID_X", rule: { match: select, count: 0, remove: true } },
        /count must be an integer from 1 to 1,000/,
      ],
      [
        {
          id: "ID_X",
          rule: { match: select, set: { type: "Language" } },
        },
        /changes nothing/,
      ],
      [
        {
          id: "ID_X",
          rule: { match: select, replaceId: { from: "A|B", to: "C" } },
        },
        /replaceId.from must be one ID or list entry/,
      ],
      [
        {
          id: "ID_X",
          rule: {
            add: [
              {
                name: "grant",
                attributes: JSON.parse('{"__proto__": "x"}') as Record<
                  string,
                  string
                >,
              },
            ],
          },
        },
        /attribute "__proto__" must be/,
      ],
      [
        { id: "ID_X", rule: { add: [{ name: "<grant>", attributes: {} }] } },
        /element "<grant>" must be/,
      ],
    ];
    for (const [patch, message] of invalid)
      await expect(
        buildCampaign({ ...manifest, patches: [patch] }, houseRuleSource, xml),
      ).rejects.toThrow(message);
    const campaign = await buildCampaign(ruleManifest, houseRuleSource, xml);
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          patches: [{ id: "ID_X", rule: { remove: "yes" } }],
        }),
      ),
    ).rejects.toThrow("Campaign patches are invalid");
    await expect(
      decodeCampaign(
        jsonBuffer({
          ...campaign,
          patches: [{ id: "ID_X", rule: { add: [grantIgnan] }, field: "x" }],
        }),
      ),
    ).rejects.toThrow("Campaign patches are invalid");
  });
});
