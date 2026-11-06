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
