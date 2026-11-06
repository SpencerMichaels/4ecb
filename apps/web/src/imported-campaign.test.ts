import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  buildCampaign,
  resolveCampaignRestrictions,
  validateCampaign,
  type CampaignDocument,
  type ContentPackCampaign,
} from "@4ecb/content-pack";
import {
  campaignSettingXml,
  readCampaignSetting,
  type LegacyCampaignSetting,
} from "@4ecb/legacy-dnd4e";
import { houseRulesDocument, parseHouseRules } from "@4ecb/legacy-wotc";

import { legacyCampaignSetting } from "./character-export";
import { ImportedCampaignDialog } from "./ImportedCampaignDialog";
import {
  campaignOfferForSave,
  createImportedCampaign,
  importedCampaignName,
  importedCampaignOffer,
  loadCampaignFromSetting,
  settingRestrictions,
  uniqueCampaignId,
  type ImportedCampaignOffer,
} from "./imported-campaign";

/** Invented records: two stock deities, a feat, and the campaign's own. */
function entity(id: string, name: string, type: string): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "imported-campaign-test", sourceOrdinal: 0 },
  };
}

const BASE: ContentEntity[] = [
  entity("ID_TEST_DEITY_SUN", "Sun Lord", "Deity"),
  entity("ID_TEST_DEITY_MOON", "Moon Lady", "Deity"),
  entity("ID_TEST_FEAT_OLD", "Old Ways", "Feat"),
  entity("ID_TEST_FEAT_KEPT", "Kept Ways", "Feat"),
];

const HOUSE_RULES = `
  <RulesElement internal-id="ID_TEST_CAMPAIGN_DEITY" name="Tide Mother" type="Deity" source="Test Campaign">
    <specific name="Alignment">Unaligned</specific>
    <rules>
      <grant name="ID_TEST_COUNTSASDEITY_SUN" type="CountsAsDeity" />
    </rules>
    A sea deity that counts as the Sun Lord.
  </RulesElement>
  <RulesElement internal-id="ID_TEST_COUNTSASDEITY_SUN" name="Sun Lord" type="CountsAsDeity" source="Test Campaign">
    <rules />
  </RulesElement>
`;

/** A DM's campaign: "Deity: campaign only" plus one feat by ID. */
function dmCampaign(revision = 1): Promise<CampaignDocument> {
  return buildCampaign(
    {
      campaignId: "tides",
      name: "Tides",
      revision,
      restrictions: {
        ids: ["ID_TEST_FEAT_OLD"],
        types: [{ type: "Deity", allow: "campaign-only" }],
      },
    },
    parseHouseRules(houseRulesDocument(HOUSE_RULES), "house-rules.xml"),
    HOUSE_RULES.trim(),
  );
}

/** The bound campaign pack's `campaign` field, as composition records it. */
function packCampaign(campaign: CampaignDocument): ContentPackCampaign {
  return {
    campaignId: campaign.campaignId,
    revision: campaign.revision,
    contentDigest: campaign.contentDigest,
    restrictedIds: resolveCampaignRestrictions(
      [...BASE, ...campaign.houseRules.entities],
      campaign,
    ),
  };
}

/** A save's campaign block as the legacy writer emits it, read back. */
function savedSetting(
  input: Parameters<typeof campaignSettingXml>[0],
): LegacyCampaignSetting {
  return readCampaignSetting(
    `<D20Character>${campaignSettingXml(input)}</D20Character>`,
  );
}

const EMPTY_SETTING = readCampaignSetting(
  `<D20Character><D20CampaignSetting name="" ><!-- save file --></D20CampaignSetting></D20Character>`,
);

describe("legacy campaign export (D116)", () => {
  it("writes the campaign's name, expanded restrictions and house-rule XML", async () => {
    const campaign = await dmCampaign();
    const setting = legacyCampaignSetting(packCampaign(campaign), campaign);
    expect(setting).toEqual({
      name: "Tides",
      // The Deity type rule is expanded to the stock deities' IDs.
      restrictedIds: [
        "ID_TEST_DEITY_MOON",
        "ID_TEST_DEITY_SUN",
        "ID_TEST_FEAT_OLD",
      ],
      houseRulesXml: HOUSE_RULES.trim(),
    });
    const xml = campaignSettingXml(setting!);
    for (const id of setting!.restrictedIds) expect(xml).toContain(`<${id} />`);
    // CountsAsDeity travels inside the house rules, unremarked.
    expect(xml).toContain('type="CountsAsDeity"');
    expect(xml).toContain(HOUSE_RULES.trim());
  });

  it("leaves non-campaign characters and missing documents to preservation", async () => {
    const campaign = await dmCampaign();
    expect(legacyCampaignSetting(undefined, campaign)).toBeUndefined();
    expect(
      legacyCampaignSetting(packCampaign(campaign), undefined),
    ).toBeUndefined();
    const other = await dmCampaign(2);
    expect(
      legacyCampaignSetting(packCampaign(campaign), other),
    ).toBeUndefined();
  });
});

describe("legacy campaign import (D116)", () => {
  it("offers nothing for an empty block, without reading campaigns or content", async () => {
    expect(EMPTY_SETTING.empty).toBe(true);
    const installed = vi.fn(() => Promise.resolve([]));
    const baseEntities = vi.fn(() => Promise.resolve(BASE));
    await expect(
      campaignOfferForSave(EMPTY_SETTING, { installed, baseEntities }),
    ).resolves.toBeUndefined();
    expect(installed).not.toHaveBeenCalled();
    expect(baseEntities).not.toHaveBeenCalled();
  });

  it("offers to join the installed campaign an exported save came from", async () => {
    const campaign = await dmCampaign();
    const setting = savedSetting(
      legacyCampaignSetting(packCampaign(campaign), campaign)!,
    );
    expect(setting.houseRuleIds).toEqual([
      "ID_TEST_CAMPAIGN_DEITY",
      "ID_TEST_COUNTSASDEITY_SUN",
    ]);
    const newer = await dmCampaign(2);
    const offer = importedCampaignOffer(setting, [campaign, newer], BASE);
    // An older revision matches; the player joins the newest.
    expect(offer).toMatchObject({
      kind: "join",
      settingName: "Tides",
      campaign: { campaignId: "tides", revision: 2 },
    });
  });

  it("matches restricted IDs ignoring case and order", async () => {
    const campaign = await dmCampaign();
    const setting = savedSetting({
      name: "Renamed by the DM",
      restrictedIds: [
        "id_test_feat_old",
        "ID_TEST_DEITY_SUN",
        "ID_TEST_DEITY_MOON",
      ],
      houseRulesXml: HOUSE_RULES,
    });
    expect(importedCampaignOffer(setting, [campaign], BASE)?.kind).toBe("join");
  });

  it("offers to create a campaign when restrictions or house rules differ", async () => {
    const campaign = await dmCampaign();
    const exported = legacyCampaignSetting(packCampaign(campaign), campaign)!;
    const extraRestriction = savedSetting({
      ...exported,
      restrictedIds: [...exported.restrictedIds, "ID_TEST_FEAT_KEPT"],
    });
    const fewerHouseRules = savedSetting({
      ...exported,
      houseRulesXml: HOUSE_RULES.slice(
        0,
        HOUSE_RULES.indexOf(
          '<RulesElement internal-id="ID_TEST_COUNTSASDEITY_SUN"',
        ),
      ),
    });
    for (const setting of [extraRestriction, fewerHouseRules])
      expect(importedCampaignOffer(setting, [campaign], BASE)).toMatchObject({
        kind: "create",
        name: "Tides",
        // The installed campaign already uses "tides".
        campaignId: "tides-2",
      });
  });

  it("creates a valid campaign from the block that the save then matches", async () => {
    const setting = savedSetting({
      name: "Tides",
      restrictedIds: ["ID_TEST_DEITY_SUN", "ID_TEST_FEAT_OLD"],
      houseRulesXml: HOUSE_RULES,
    });
    const offer = importedCampaignOffer(setting, [], BASE);
    expect(offer?.kind).toBe("create");
    const install = vi.fn((document: CampaignDocument) =>
      Promise.resolve(document),
    );
    const load = vi.fn(loadCampaignFromSetting);
    const created = await createImportedCampaign(
      offer as Extract<ImportedCampaignOffer, { kind: "create" }>,
      install,
      load,
    );
    expect(load).toHaveBeenCalledOnce();
    expect(install).toHaveBeenCalledWith(created);
    await expect(validateCampaign(created)).resolves.toBeDefined();
    expect(created).toMatchObject({
      campaignId: "tides",
      name: "Tides",
      revision: 1,
      restrictions: {
        ids: ["ID_TEST_DEITY_SUN", "ID_TEST_FEAT_OLD"],
        types: [],
      },
      legacyHouseRulesXml: HOUSE_RULES.trim(),
    });
    expect(
      created.houseRules.entities.map(({ id, type }) => [id, type]),
    ).toEqual([
      ["ID_TEST_CAMPAIGN_DEITY", "Deity"],
      ["ID_TEST_COUNTSASDEITY_SUN", "CountsAsDeity"],
    ]);
    // Importing the same save again joins the campaign just created.
    expect(importedCampaignOffer(setting, [created], BASE)).toMatchObject({
      kind: "join",
      campaign: { campaignId: "tides" },
    });
  });

  it("keeps the house-rule parser out of the library's static imports", () => {
    // Only `loadCampaignFromSetting` (a dynamic import, called by
    // `createImportedCampaign` on "Create campaign") reaches the parser.
    for (const file of [
      "CharacterLibraryPage.tsx",
      "imported-campaign.ts",
      "ImportedCampaignDialog.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/^import (?!type )[^;]*"@4ecb\/legacy-wotc"/m);
      expect(source).not.toMatch(
        /^import (?!type )[^;]*"\.\/campaign-from-setting"/m,
      );
    }
    expect(
      readFileSync(new URL("imported-campaign.ts", import.meta.url), "utf8"),
    ).toContain('import("./campaign-from-setting")');
  });

  it("resolves restricted identities without an ID by name and type", () => {
    const setting = readCampaignSetting(
      `<D20Character><D20CampaignSetting name="Old"><Restricted><RulesElement name="moon lady" type="Deity"/><RulesElement name="Lost God" type="Deity"/><ID_TEST_FEAT_OLD/></Restricted></D20CampaignSetting></D20Character>`,
    );
    expect(settingRestrictions(setting, BASE)).toEqual({
      ids: ["ID_TEST_FEAT_OLD", "ID_TEST_DEITY_MOON"],
      unresolved: [{ name: "Lost God", type: "Deity" }],
    });
  });

  it("derives campaign IDs and names that pass the campaign rules", () => {
    expect(uniqueCampaignId("Golarion", [])).toBe("golarion");
    expect(uniqueCampaignId("Golarion", ["GOLARION", "golarion-2"])).toBe(
      "golarion-3",
    );
    expect(
      uniqueCampaignId("Rise of the Runelords — Book 1: Burnt Offerings", []),
    ).toBe("rise-of-the-runelords-book-1-bur");
    expect(uniqueCampaignId("!!!", [])).toBe("campaign");
    expect(uniqueCampaignId("x".repeat(40), ["x".repeat(32)])).toBe(
      `${"x".repeat(30)}-2`,
    );
    expect(importedCampaignName("  ")).toBe("Imported campaign");
    expect(importedCampaignName(" Tides\n")).toBe("Tides");
  });

  it("offers Put in or Create campaign, with Cancel", async () => {
    const campaign = await dmCampaign();
    const noop = () => undefined;
    const join = renderToStaticMarkup(
      createElement(ImportedCampaignDialog, {
        characterName: "Mira",
        offer: { kind: "join", settingName: "Tides", campaign },
        onCancel: noop,
        onCreate: () => Promise.resolve(campaign),
        onJoin: noop,
      }),
    );
    expect(join).toContain("Put in Tides");
    expect(join).toContain("Cancel");
    expect(join).not.toMatch(/Not now|Maybe later/);
    const setting = readCampaignSetting(
      `<D20Character><D20CampaignSetting name="Old"><Restricted><RulesElement name="Lost God" type="Deity"/></Restricted></D20CampaignSetting></D20Character>`,
    );
    const create = renderToStaticMarkup(
      createElement(ImportedCampaignDialog, {
        characterName: "Mira",
        offer: importedCampaignOffer(setting, [], BASE)!,
        onCancel: noop,
        onCreate: () => Promise.resolve(campaign),
        onJoin: noop,
      }),
    );
    expect(create).toContain("Create campaign Old");
    expect(create).toContain("Lost God (Deity)");
    expect(create).toContain("Cancel");
  });
});
