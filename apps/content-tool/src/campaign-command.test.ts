import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCampaign,
  buildContentPack,
  validateCampaign,
  type CampaignDocument,
} from "@4ecb/content-pack";
import { parseD20Rules } from "@4ecb/legacy-wotc";

import {
  advertiseCampaignFile,
  advertisedCampaignFileName,
  buildCampaignFromManifest,
  campaignAgainstPack,
  campaignFileBytes,
  houseRulesChildrenXml,
  parseCampaignManifest,
  parseHouseRules,
  readCampaignFile,
  summarizeCampaign,
} from "./campaign-command";

const fixtureManifest = resolve(
  import.meta.dirname,
  "../../../fixtures/campaigns/synthetic/campaign.json",
);

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "4ecb-campaign-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const rules = (children: string) =>
  `<?xml version="1.0"?>\n<D20Rules game-system="D&amp;D4E">\n${children}\n</D20Rules>\n`;

async function campaignFrom(
  children: string,
  restrictions: CampaignDocument["restrictions"],
  revision = 1,
): Promise<CampaignDocument> {
  const xml = rules(children);
  return buildCampaign(
    {
      campaignId: "test-setting",
      name: "Test Setting",
      revision,
      restrictions,
    },
    parseHouseRules(xml, "house-rules.xml"),
    houseRulesChildrenXml(xml),
  );
}

describe("campaign.json", () => {
  it("maps restrict.types to campaign-only type rules and resolves houseRules", () => {
    expect(
      parseCampaignManifest(
        {
          campaignId: "x",
          name: "X",
          revision: 2,
          houseRules: "rules/house.xml",
          restrict: { ids: ["ID_A"], types: { Deity: "campaign-only" } },
        },
        "/campaigns/x",
      ),
    ).toEqual({
      manifest: {
        campaignId: "x",
        name: "X",
        revision: 2,
        restrictions: {
          ids: ["ID_A"],
          types: [{ type: "Deity", allow: "campaign-only" }],
        },
      },
      houseRulesPath: "/campaigns/x/rules/house.xml",
    });
  });

  it("reads an optional description", () => {
    const base = { campaignId: "x", name: "X", revision: 1 };
    expect(
      parseCampaignManifest({ ...base, description: "Gods change." }, "/")
        .manifest,
    ).toMatchObject({ description: "Gods change." });
    expect(parseCampaignManifest(base, "/").manifest).not.toHaveProperty(
      "description",
    );
    expect(() =>
      parseCampaignManifest({ ...base, description: ["Gods"] }, "/"),
    ).toThrow("campaign.json description must be a string");
  });

  it("refuses unknown keys and other type allowances", () => {
    const base = { campaignId: "x", name: "X", revision: 1 };
    expect(() =>
      parseCampaignManifest({ ...base, restrictions: {} }, "/"),
    ).toThrow(/unknown keys: restrictions/);
    expect(() =>
      parseCampaignManifest(
        { ...base, restrict: { types: { Deity: "none" } } },
        "/",
      ),
    ).toThrow(/campaign-only/);
  });

  it("reads patches and refuses malformed ones", () => {
    const base = { campaignId: "x", name: "X", revision: 1 };
    const patch = {
      id: "ID_RACE",
      field: "Languages",
      expect: "Common, Primordial",
      value: "Common, Ignan",
    };
    expect(
      parseCampaignManifest({ ...base, patches: [patch] }, "/").manifest
        .patches,
    ).toEqual([patch]);
    expect(() =>
      parseCampaignManifest({ ...base, patches: [{ ...patch, to: "y" }] }, "/"),
    ).toThrow(/patches\[0\] has unknown keys: to/);
    expect(() =>
      parseCampaignManifest(
        { ...base, patches: [{ ...patch, expect: undefined }] },
        "/",
      ),
    ).toThrow(/patches\[0\]\.expect must be a string/);
    expect(() => parseCampaignManifest({ ...base, patches: {} }, "/")).toThrow(
      /patches must be an array/,
    );
    const rulePatch = {
      id: "ID_RACE",
      rule: {
        match: { name: "grant", attributes: { name: "ID_PRIMORDIAL" } },
        set: { name: "ID_IGNAN" },
      },
    };
    expect(
      parseCampaignManifest({ ...base, patches: [patch, rulePatch] }, "/")
        .manifest.patches,
    ).toEqual([patch, rulePatch]);
    expect(() =>
      parseCampaignManifest(
        { ...base, patches: [{ id: "ID_RACE", alternateName: "Fetchling" }] },
        "/",
      ),
    ).toThrow(/patches\[0\]: alternate names were removed/);
    expect(() =>
      parseCampaignManifest(
        { ...base, patches: [{ ...rulePatch, field: "name" }] },
        "/",
      ),
    ).toThrow(/patches\[0\] has unknown keys: field/);
    expect(() =>
      parseCampaignManifest(
        {
          ...base,
          patches: [{ id: "ID_RACE", rule: { remove: 1, delete: true } }],
        },
        "/",
      ),
    ).toThrow(
      /patches\[0\]\.rule has unknown keys: delete; remove must be true/,
    );
    // Version 6: a field patch may name one occurrence of its field.
    expect(
      parseCampaignManifest(
        { ...base, patches: [{ ...patch, field: "Property", occurrence: 2 }] },
        "/",
      ).manifest.patches,
    ).toEqual([{ ...patch, field: "Property", occurrence: 2 }]);
    expect(() =>
      parseCampaignManifest(
        { ...base, patches: [{ ...patch, occurrence: "2" }] },
        "/",
      ),
    ).toThrow(/patches\[0\]\.occurrence must be a number/);
  });
});

describe("house-rule XML", () => {
  it("keeps the root's children verbatim for legacy export", () => {
    const children = `<RulesElement internal-id="ID_A" name="A" type="Deity">\n    <rules />\n  </RulesElement>`;
    expect(houseRulesChildrenXml(rules(`  ${children}`))).toBe(children);
    expect(houseRulesChildrenXml('<D20Rules game-system="x" />')).toBe("");
  });

  it("refuses top-level elements other than RulesElement", () => {
    expect(() =>
      parseHouseRules(rules("<UpdateInfo />"), "house-rules.xml"),
    ).toThrow(/only RulesElement/);
  });
});

describe("campaign build", () => {
  it("builds the public fixture deterministically and round-trips the file", async () => {
    const first = await buildCampaignFromManifest(fixtureManifest);
    const second = await buildCampaignFromManifest(fixtureManifest);
    const { campaign } = first;
    expect(campaign.contentDigest).toBe(second.campaign.contentDigest);
    expect((await validateCampaign(campaign)).valid).toBe(true);
    expect(campaign.houseRules.manifest.packId).toBe(
      "campaign.synthetic-setting.r1",
    );
    expect(campaign.restrictions.types).toEqual([
      { type: "Deity", allow: "campaign-only" },
    ]);
    expect(campaign.legacyHouseRulesXml).toMatch(/^<RulesElement /);
    expect(campaign.legacyHouseRulesXml).toContain('type="CountsAsDeity"');
    expect(
      campaign.patches?.map((patch) => [
        patch.id,
        "field" in patch ? patch.field : "rule",
      ]),
    ).toEqual([
      ["ID_4ECB_SYNTHETIC_RACE_1", "description"],
      ["ID_4ECB_SYNTHETIC_RACE_1", "name"],
      ["ID_4ECB_SYNTHETIC_RACE_1", "Short Description"],
      ["ID_4ECB_SYNTHETIC_RACE_1", "rule"],
    ]);
    // The description patch makes it version 6 (D116 amendment); the DM's
    // description is kept.
    expect(summarizeCampaign(campaign)).toMatchObject({
      description:
        "Setting gods replace the stock deities. Everything else is standard.",
      version: 6,
      patches: 3,
      rulePatches: 1,
    });
    // An authored "Also Known As" is parsed once, at build, into aliases;
    // the legacy XML keeps the field verbatim for export (D116).
    const tide = campaign.houseRules.entities.find(
      ({ id }) => id === "ID_4ECB_CAMPAIGN_DEITY_TIDE",
    );
    expect(tide?.aliases).toEqual(["Sea Mother"]);
    expect(tide?.specifics.map(({ name }) => name)).toEqual(["Alignment"]);
    expect(campaign.legacyHouseRulesXml).toContain(
      '<specific name="Also Known As">Sea Mother</specific>',
    );

    const bytes = await campaignFileBytes(campaign);
    expect(Buffer.from(bytes)).toEqual(
      Buffer.from(await campaignFileBytes(second.campaign)),
    );
    const path = join(directory, "synthetic.4ecc");
    await writeFile(path, bytes);
    expect((await readCampaignFile(path)).campaign).toEqual(campaign);
  });

  it("reports what the campaign does to a pack, as warnings only", async () => {
    const pack = await buildContentPack(
      parseD20Rules(
        rules(
          [
            '<RulesElement internal-id="ID_OLD_GOD" name="Old God" type="Deity" />',
            '<RulesElement internal-id="ID_OTHER_GOD" name="Other God" type="Deity" />',
            '<RulesElement internal-id="ID_FEAT" name="Old Feat" type="Feat" />',
          ].join("\n"),
        ),
        "stock.xml",
      ),
      { packId: "stock", name: "Stock" },
    );
    const campaign = await campaignFrom(
      [
        '<RulesElement internal-id="ID_NEW_GOD" name="New God" type="Deity" />',
        '<RulesElement internal-id="id_other_god" name="Other God Revised" type="Deity" />',
      ].join("\n"),
      {
        ids: ["id_feat", "ID_MISSING", "ID_NEW_GOD"],
        types: [
          { type: "Deity", allow: "campaign-only" },
          { type: "Deitys", allow: "campaign-only" },
        ],
      },
    );
    const report = campaignAgainstPack(campaign, pack);
    expect(report.overriddenIds).toEqual(["id_other_god"]);
    expect(report.typeRules).toEqual([
      { type: "Deity", restrictedRecords: 1, campaignRecords: 2 },
      { type: "Deitys", restrictedRecords: 0, campaignRecords: 0 },
    ]);
    // ID_FEAT, ID_MISSING, ID_NEW_GOD (listed) and ID_OLD_GOD (type rule).
    expect(report.restrictedRecords).toBe(4);
    expect(report.warnings).toEqual([
      "Restricted ID ID_MISSING is not in stock",
      "Restricted ID ID_NEW_GOD is one of the campaign's house rules",
      `House rule id_other_god (Deity "Other God Revised") replaces stock's Deity "Other God"`,
      "Type rule Deitys matches no record in stock or the house rules (is the type spelt as the content spells it?)",
    ]);
  });

  it("reports each patch against the pack: the drift guard", async () => {
    const pack = await buildContentPack(
      parseD20Rules(
        rules(
          [
            '<RulesElement internal-id="ID_GENASI" name="Genasi" type="Race"><specific name="Languages">Common, Primordial, Elven</specific></RulesElement>',
            '<RulesElement internal-id="ID_LEARN_ELVEN" name="Learn Elven" type="Background Choice" />',
          ].join("\n"),
        ),
        "stock.xml",
      ),
      { packId: "stock", name: "Stock" },
    );
    const xml = rules("");
    const campaign = await buildCampaign(
      {
        campaignId: "test-setting",
        name: "Test Setting",
        revision: 1,
        restrictions: { ids: [], types: [] },
        patches: [
          {
            id: "ID_GENASI",
            field: "Languages",
            expect: "Common, Primordial",
            value: "Common, Ignan",
          },
          {
            id: "ID_LEARN_ELVEN",
            field: "name",
            expect: "Learn Elven",
            value: "Learn Elven (Sylvan)",
          },
          { id: "ID_GONE", field: "name", expect: "Gone", value: "Here" },
        ],
      },
      parseHouseRules(xml, "house-rules.xml"),
      houseRulesChildrenXml(xml),
    );
    const report = campaignAgainstPack(campaign, pack);
    expect(report.patches).toEqual([
      {
        id: "ID_GENASI",
        field: "Languages",
        status: "stock-differs",
        expect: "Common, Primordial",
        value: "Common, Ignan",
        current: "Common, Primordial, Elven",
      },
      {
        id: "ID_GONE",
        field: "name",
        status: "target-missing",
        expect: "Gone",
        value: "Here",
      },
      {
        id: "ID_LEARN_ELVEN",
        field: "name",
        status: "applies",
        expect: "Learn Elven",
        value: "Learn Elven (Sylvan)",
      },
    ]);
    expect(report.warnings).toEqual([
      'Patch ID_GENASI Languages not applied: the content has "Common, Primordial, Elven", the patch expects "Common, Primordial" (stock)',
      "Patch ID_GONE name not applied: no record ID_GONE (stock)",
    ]);
    // Patches never reach the legacy campaign block.
    expect(campaign.legacyHouseRulesXml).toBe("");
  });

  it("reports description and occurrence patches against the pack", async () => {
    const pack = await buildContentPack(
      parseD20Rules(
        rules(
          [
            '<RulesElement internal-id="ID_STAFF" name="Staff of Tongues +1" type="Magic Item"><specific name="Property">You can speak, read, and write Common.</specific><specific name="Property">You can speak, read, and write Supernal.</specific></RulesElement>',
            '<RulesElement internal-id="ID_HOLY_TONGUE" name="Holy Tongue" type="Class Feature">You are fluent in Supernal. Supernal is old.</RulesElement>',
          ].join("\n"),
        ),
        "stock.xml",
      ),
      { packId: "stock", name: "Stock" },
    );
    const xml = rules("");
    const campaign = await buildCampaign(
      {
        campaignId: "test-setting",
        name: "Test Setting",
        revision: 1,
        restrictions: { ids: [], types: [] },
        patches: [
          {
            id: "ID_STAFF",
            field: "Property",
            occurrence: 2,
            expect: "You can speak, read, and write Supernal.",
            value: "You can speak, read, and write Celestial.",
          },
          {
            id: "ID_STAFF",
            field: "Property",
            occurrence: 3,
            expect: "x",
            value: "y",
          },
          {
            id: "ID_HOLY_TONGUE",
            field: "description",
            expect: "fluent in Supernal",
            value: "fluent in Celestial",
          },
          {
            id: "ID_HOLY_TONGUE",
            field: "description",
            expect: "Supernal",
            value: "Celestial",
          },
          {
            id: "ID_HOLY_TONGUE",
            field: "description",
            expect: "Abyssal",
            value: "Infernal",
          },
        ],
      },
      parseHouseRules(xml, "house-rules.xml"),
      houseRulesChildrenXml(xml),
    );
    expect(campaign.version).toBe(6);
    expect(summarizeCampaign(campaign).version).toBe(6);
    const report = campaignAgainstPack(campaign, pack);
    expect(
      report.patches.map(({ id, field, occurrence, status, count }) => ({
        id,
        field,
        occurrence,
        status,
        count,
      })),
    ).toEqual([
      // The first passage applies; the second then appears once more.
      { id: "ID_HOLY_TONGUE", field: "description", status: "applies" },
      { id: "ID_HOLY_TONGUE", field: "description", status: "applies" },
      { id: "ID_HOLY_TONGUE", field: "description", status: "passage-missing" },
      { id: "ID_STAFF", field: "Property", occurrence: 2, status: "applies" },
      {
        id: "ID_STAFF",
        field: "Property",
        occurrence: 3,
        status: "occurrence-missing",
        count: 2,
      },
    ]);
    expect(report.warnings).toEqual([
      'Patch ID_HOLY_TONGUE description not applied: the description of ID_HOLY_TONGUE does not contain "Abyssal" (stock)',
      "Patch ID_STAFF Property #3 not applied: ID_STAFF has 2 Property fields, not 3 (stock)",
    ]);
    expect(campaign.legacyHouseRulesXml).toBe("");
  });

  it("reports each rule patch with the elements it matched", async () => {
    const pack = await buildContentPack(
      parseD20Rules(
        rules(
          [
            '<RulesElement internal-id="ID_INTERNAL_GRANTS_GNOME" name="Gnome" type="Grants"><rules>',
            '<grant name="ID_FMP_LANGUAGE_1" type="Language" />',
            '<grant name="ID_FMP_LANGUAGE_4" type="Language" />',
            "</rules></RulesElement>",
            '<RulesElement internal-id="ID_FEAT_FEY" name="Fey-Minded" type="Feat"><rules>',
            '<select type="Language" number="1" Category="ID_FMP_LANGUAGE_4|ID_FMP_LANGUAGE_19" default="ID_FMP_LANGUAGE_4" />',
            "</rules></RulesElement>",
          ].join("\n"),
        ),
        "stock.xml",
      ),
      { packId: "stock", name: "Stock" },
    );
    const xml = rules("");
    const sylvan = { name: "ID_PF_LANGUAGE_SYLVAN", type: "Language" };
    const campaign = await buildCampaign(
      {
        campaignId: "test-setting",
        name: "Test Setting",
        revision: 1,
        restrictions: { ids: [], types: [] },
        patches: [
          {
            id: "ID_INTERNAL_GRANTS_GNOME",
            rule: {
              match: {
                name: "grant",
                attributes: { name: "ID_FMP_LANGUAGE_4", type: "Language" },
              },
              set: { name: "ID_PF_LANGUAGE_GNOMISH" },
            },
          },
          {
            id: "ID_INTERNAL_GRANTS_GNOME",
            rule: { add: [{ name: "grant", attributes: sylvan }] },
          },
          {
            id: "ID_FEAT_FEY",
            rule: {
              match: { name: "select", attributes: { type: "Language" } },
              replaceId: { from: "ID_FMP_LANGUAGE_4", to: sylvan.name },
            },
          },
          {
            id: "ID_FEAT_FEY",
            rule: {
              match: { name: "grant", attributes: { type: "Language" } },
              remove: true,
            },
          },
        ],
      },
      parseHouseRules(xml, "house-rules.xml"),
      houseRulesChildrenXml(xml),
    );
    const report = campaignAgainstPack(campaign, pack);
    expect(
      report.rulePatches.map(({ id, operation, status, matched }) => ({
        id,
        operation,
        status,
        matched,
      })),
    ).toEqual([
      {
        id: "ID_FEAT_FEY",
        operation:
          'replace ID_FMP_LANGUAGE_4 with ID_PF_LANGUAGE_SYLVAN in <select type="Language" />',
        status: "applies",
        matched: [
          '<select type="Language" number="1" Category="ID_FMP_LANGUAGE_4|ID_FMP_LANGUAGE_19" default="ID_FMP_LANGUAGE_4" />',
        ],
      },
      {
        id: "ID_FEAT_FEY",
        operation: 'remove <grant type="Language" />',
        status: "no-match",
        matched: [],
      },
      {
        id: "ID_INTERNAL_GRANTS_GNOME",
        operation:
          'set name="ID_PF_LANGUAGE_GNOMISH" on <grant name="ID_FMP_LANGUAGE_4" type="Language" />',
        status: "applies",
        matched: ['<grant name="ID_FMP_LANGUAGE_4" type="Language" />'],
      },
      {
        id: "ID_INTERNAL_GRANTS_GNOME",
        operation: 'add <grant name="ID_PF_LANGUAGE_SYLVAN" type="Language" />',
        status: "applies",
        matched: [],
      },
    ]);
    expect(report.warnings).toEqual([
      'Rule patch ID_FEAT_FEY: remove <grant type="Language" /> not applied: ID_FEAT_FEY has no matching rule element (stock)',
    ]);
    expect(report.prerequisiteRenames).toEqual({
      renamedLines: 0,
      unchanged: [],
    });
    expect(campaign.legacyHouseRulesXml).toBe("");
  });

  it("lists prerequisite lines that keep a renamed record's old name", async () => {
    const pack = await buildContentPack(
      parseD20Rules(
        rules(
          [
            '<RulesElement internal-id="ID_FMP_RACE_26" name="Shadar-kai" type="Race" />',
            '<RulesElement internal-id="ID_FEAT_GHOSTLY" name="Ghostly Vengeance" type="Feat"><Prereqs>11th level, Shadar-kai</Prereqs><print-prereqs>11th level, shadar-kai</print-prereqs></RulesElement>',
            '<RulesElement internal-id="ID_FEAT_TWICE" name="Shadow Twin" type="Feat"><Prereqs>Shadar-kai</Prereqs><print-prereqs>Shadar-kai; you must look like a shadar-kai elder</print-prereqs></RulesElement>',
          ].join("\n"),
        ),
        "stock.xml",
      ),
      { packId: "stock", name: "Stock" },
    );
    const xml = rules("");
    const campaign = await buildCampaign(
      {
        campaignId: "test-setting",
        name: "Test Setting",
        revision: 1,
        restrictions: { ids: [], types: [] },
        patches: [
          {
            id: "ID_FMP_RACE_26",
            field: "name",
            expect: "Shadar-kai",
            value: "Fetchling",
          },
        ],
      },
      parseHouseRules(xml, "house-rules.xml"),
      houseRulesChildrenXml(xml),
    );
    const report = campaignAgainstPack(campaign, pack);
    expect(report.prerequisiteRenames).toEqual({
      renamedLines: 1,
      unchanged: [
        {
          id: "ID_FEAT_TWICE",
          name: "Shadow Twin",
          line: "Shadar-kai; you must look like a shadar-kai elder",
          alias: "Shadar-kai",
          occurrences: 2,
          references: 1,
        },
      ],
    });
    expect(report.warnings).toEqual([
      'Prerequisite line of ID_FEAT_TWICE ("Shadow Twin") keeps the old name "Shadar-kai": "Shadar-kai; you must look like a shadar-kai elder"',
    ]);
  });
});

describe("advertise-campaign", () => {
  async function writeCampaign(campaign: CampaignDocument): Promise<string> {
    const path = join(directory, `${campaign.contentDigest}.4ecc`);
    await writeFile(path, await campaignFileBytes(campaign));
    return path;
  }

  const restrictions = {
    ids: [],
    types: [{ type: "Deity", allow: "campaign-only" as const }],
  };
  const deity = (name: string) =>
    `<RulesElement internal-id="ID_${name.toUpperCase()}" name="${name}" type="Deity" />`;

  it("hosts the file and merges it into runtime-config.json, keeping everything else", async () => {
    const outDir = join(directory, "deploy");
    const configPath = join(outDir, "runtime-config.json");
    const pack = {
      packId: "server",
      name: "Server",
      contentDigest: "a".repeat(64),
      url: "/private-packs/server-aaaaaaaaaaaa.4ecp",
    };
    const other = {
      campaignId: "other",
      name: "Other",
      revision: 3,
      contentDigest: "b".repeat(64),
      url: "/private-packs/campaigns/other-bbbbbbbbbbbb.4ecc",
    };
    await advertiseCampaignFile(
      await writeCampaign(await campaignFrom(deity("Zed"), restrictions)),
      outDir,
    );
    const existing = JSON.parse(await readFile(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      configPath,
      JSON.stringify({
        ...existing,
        relayUrl: "wss://relay.example",
        contentPacks: [pack],
        campaigns: [other, ...(existing.campaigns as unknown[])],
        operatorNote: "kept",
      }),
    );

    const revised = await campaignFrom(deity("Yara"), restrictions, 2);
    const result = await advertiseCampaignFile(
      await writeCampaign(revised),
      outDir,
    );
    const fileName = advertisedCampaignFileName(revised);
    expect(result.campaignPath).toBe(
      join(outDir, "private-packs", "campaigns", fileName),
    );
    expect((await readCampaignFile(result.campaignPath)).campaign).toEqual(
      revised,
    );
    const config = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    expect(config).toMatchObject({
      relayUrl: "wss://relay.example",
      contentPacks: [pack],
      operatorNote: "kept",
      campaigns: [
        other,
        {
          campaignId: "test-setting",
          name: "Test Setting",
          revision: 2,
          contentDigest: revised.contentDigest,
          url: `/private-packs/campaigns/${fileName}`,
        },
      ],
    });
  });

  it("refuses an older revision, or the same revision with other content", async () => {
    const outDir = join(directory, "deploy");
    await advertiseCampaignFile(
      await writeCampaign(await campaignFrom(deity("Zed"), restrictions, 2)),
      outDir,
    );
    await expect(
      advertiseCampaignFile(
        await writeCampaign(await campaignFrom(deity("Yara"), restrictions, 2)),
        outDir,
      ),
    ).rejects.toThrow(/bump the revision/);
    await expect(
      advertiseCampaignFile(
        await writeCampaign(await campaignFrom(deity("Yara"), restrictions, 1)),
        outDir,
      ),
    ).rejects.toThrow(/refusing older revision 1/);
    // The same document again is a no-op.
    await advertiseCampaignFile(
      await writeCampaign(await campaignFrom(deity("Zed"), restrictions, 2)),
      outDir,
    );
  });
});
