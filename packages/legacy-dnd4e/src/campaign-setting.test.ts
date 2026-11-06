import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import {
  campaignSettingXml,
  decodeCampaignRestrictedId,
  encodeCampaignRestrictedId,
  exportEditedDnd4e,
  importDnd4e,
  readCampaignSetting,
  type CampaignSettingInput,
} from ".";

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
    provenance: { sourceKey: "campaign-test", sourceOrdinal: 0 },
  };
}

const HOUSE_RULES = `
      <RulesElement name="Example Deity" type="Deity" internal-id="ID_EXAMPLE_DEITY" source="House">
        <Category>Good</Category>
        <specific name="Alignment">Good</specific>
      </RulesElement>
   `;

describe("legacy D20CampaignSetting", () => {
  it("escapes IDs both ways like the legacy ID_Out/ID_In", () => {
    const id = "ID_ROD_(WEAPON)_CAULDRON'S";
    expect(encodeCampaignRestrictedId(id)).toBe(
      "ID_ROD__LPAREN_WEAPON_RPAREN__CAULDRON_APOS_S",
    );
    expect(decodeCampaignRestrictedId(encodeCampaignRestrictedId(id))).toBe(id);
  });

  it("reads a standalone .dndcamp with ID-as-tag children and house rules", () => {
    const setting =
      readCampaignSetting(`﻿<D20CampaignSetting name="Example &amp; Co">
   <!-- Dungeons and Dragons Insider: Character Builder campaign save file -->
   <Restricted>
      <ID_EXAMPLE_DEITY_1 />
      <ID_ROD__LPAREN_WEAPON_RPAREN_ />
      <ID_SCROLL_OF_CAULDRON_APOS_S_REBIRTH />
      <ID_EXAMPLE_DEITY_1 />
      <RulesElement name="Example Feat" type="Feat" internal-id="ID_EXAMPLE_FEAT" />
   </Restricted>
   <Houserules>${HOUSE_RULES}</Houserules>
</D20CampaignSetting>`);
    expect(setting).toMatchObject({
      name: "Example & Co",
      restrictedIds: [
        "ID_EXAMPLE_DEITY_1",
        "ID_ROD_(WEAPON)",
        "ID_SCROLL_OF_CAULDRON'S_REBIRTH",
        "ID_EXAMPLE_FEAT",
      ],
      restrictedIdentities: [],
      houseRulesXml: HOUSE_RULES,
      unknownXml: [],
      empty: false,
      diagnostics: [],
    });
  });

  it("keeps a RulesElement identity without an ID for name/type resolution", () => {
    const setting = readCampaignSetting(
      `<D20CampaignSetting name="X"><Restricted><RulesElement name="Old God" type="Deity"/></Restricted></D20CampaignSetting>`,
    );
    expect(setting.restrictedIds).toEqual([]);
    expect(setting.restrictedIdentities).toEqual([
      { name: "Old God", type: "Deity" },
    ]);
    expect(setting.diagnostics.map((entry) => entry.code)).toEqual([
      "campaign.restricted-identity-without-id",
    ]);
  });

  it("repairs literal parentheses and apostrophes only inside Restricted", () => {
    const source = `<D20CampaignSetting name="LFR">
   <Restricted>
      <ID_INTERNAL_WEAPON_ROD_OF_SEVEN_PARTS_(WEAPON) />
      <!-- <not(a)tag> -->
      <ID_INTERNAL_RITUAL_SCROLL_SCROLL_OF_CAULDRON'S_REBIRTH></ID_INTERNAL_RITUAL_SCROLL_SCROLL_OF_CAULDRON'S_REBIRTH>
      <RulesElement name="Rod (Seven Parts)" type="Weapon" internal-id="ID_ROD" />
   </Restricted>
</D20CampaignSetting>`;
    const setting = readCampaignSetting(source);
    expect(setting.restrictedIds).toEqual([
      "ID_INTERNAL_WEAPON_ROD_OF_SEVEN_PARTS_(WEAPON)",
      "ID_INTERNAL_RITUAL_SCROLL_SCROLL_OF_CAULDRON'S_REBIRTH",
      "ID_ROD",
    ]);
    expect(setting.diagnostics).toHaveLength(1);
    expect(setting.diagnostics[0]?.code).toBe("campaign.restricted-repaired");
    expect(setting.diagnostics[0]?.message).toContain(
      "ID_INTERNAL_WEAPON_ROD_OF_SEVEN_PARTS_(WEAPON)",
    );
  });

  it("does not repair malformed tags outside Restricted", () => {
    expect(() =>
      readCampaignSetting(
        `<D20CampaignSetting name="X"><Houserules><Bad(tag) /></Houserules></D20CampaignSetting>`,
      ),
    ).toThrow();
    expect(() =>
      readCampaignSetting(
        `<D20Character><Bad(tag) /><D20CampaignSetting name=""><Restricted><A /></Restricted></D20CampaignSetting></D20Character>`,
      ),
    ).toThrow();
  });

  it("keeps unknown children with a diagnostic", () => {
    const setting = readCampaignSetting(
      `<D20CampaignSetting name=""><Future answer="42"><Nested/></Future></D20CampaignSetting>`,
    );
    expect(setting.unknownXml).toEqual([
      '<Future answer="42"><Nested/></Future>',
    ]);
    expect(setting.empty).toBe(false);
    expect(setting.diagnostics.map((entry) => entry.code)).toEqual([
      "campaign.unknown-child",
    ]);
  });

  it("reads the empty legacy form and a save without a setting as empty", () => {
    const legacyEmpty = `<D20Character>\r\n   <D20CampaignSetting name="" >\r\n      <!--\r\n         Dungeons and Dragons Insider: Character Builder campaign save file\r\n      -->\r\n   </D20CampaignSetting>\r\n</D20Character>`;
    expect(readCampaignSetting(legacyEmpty)).toMatchObject({
      name: "",
      restrictedIds: [],
      houseRulesXml: "",
      empty: true,
      diagnostics: [],
    });
    expect(readCampaignSetting("<D20Character/>").empty).toBe(true);
    expect(
      readCampaignSetting(
        `<D20Character><Note><D20CampaignSetting name="nested"/></Note></D20Character>`,
      ).empty,
    ).toBe(true);
  });

  it("round-trips through the writer in the ID-as-tag form", () => {
    const input: CampaignSettingInput = {
      name: 'Pathfinder "Golarion" & friends',
      restrictedIds: [
        "ID_FMP_DEITY_15",
        "ID_ROD_(WEAPON)",
        "ID_CAULDRON'S",
        "ID WITH SPACE",
        "RulesElement",
      ],
      houseRulesXml: HOUSE_RULES,
    };
    const xml = campaignSettingXml(input);
    expect(xml).toContain("<ID_FMP_DEITY_15 />");
    expect(xml).toContain("<ID_ROD__LPAREN_WEAPON_RPAREN_ />");
    expect(xml).toContain("<ID_CAULDRON_APOS_S />");
    expect(xml).toContain('<RulesElement internal-id="ID WITH SPACE" />');
    expect(xml).toContain('<RulesElement internal-id="RulesElement" />');
    expect(readCampaignSetting(xml)).toMatchObject({
      name: input.name,
      restrictedIds: input.restrictedIds,
      houseRulesXml: HOUSE_RULES,
      empty: false,
      diagnostics: [],
    });
    expect(
      campaignSettingXml({ name: "", restrictedIds: [], houseRulesXml: " " }),
    ).toBe('<D20CampaignSetting name=""></D20CampaignSetting>');
    expect(() =>
      campaignSettingXml({
        name: "",
        restrictedIds: [],
        houseRulesXml: "<RulesElement>",
      }),
    ).toThrow();
  });

  describe("edited export", () => {
    const source = (setting: string) => `<?xml version="1.0" encoding="UTF-8"?>
<D20Character game-system="D&amp;D4E" Version="0.07a" legality="rules-legal">
  <CharacterSheet><Details><name>Ada</name><Level>1</Level></Details></CharacterSheet>
  ${setting}
  <Level><RulesElement name="1" type="Level" internal-id="L1" charelem="root"/></Level>
</D20Character>`;
    const content = [entity("L1", "1", "Level")];
    const exportWith = (
      xml: string,
      campaignSetting?: CampaignSettingInput,
    ) => {
      const imported = importDnd4e(xml);
      const evaluation = evaluateCharacter(
        projectBuildForEvaluation(imported.build, content),
        content,
      );
      return exportEditedDnd4e({
        target: "legacy-builder-0.07a",
        envelope: imported.envelope,
        snapshot: imported.snapshot,
        build: imported.build,
        evaluation,
        content,
        ...(campaignSetting === undefined ? {} : { campaignSetting }),
      });
    };
    const legacyEmpty = `<D20CampaignSetting name="" >\r\n      <!--\r\n         Dungeons and Dragons Insider: Character Builder campaign save file\r\n      -->\r\n   </D20CampaignSetting>`;

    it("keeps the empty legacy form byte-exact without the input", () => {
      const xml = exportWith(source(legacyEmpty));
      expect(xml).toContain(legacyEmpty);
      expect(readCampaignSetting(xml).empty).toBe(true);
    });

    it("replaces the setting in place with the input", () => {
      const input = {
        name: "Example",
        restrictedIds: ["ID_X_(Y)"],
        houseRulesXml: HOUSE_RULES,
      };
      const xml = exportWith(source(legacyEmpty), input);
      expect(xml).not.toContain("campaign save file");
      expect(xml.match(/<D20CampaignSetting\b/g)).toHaveLength(1);
      expect(xml.indexOf("<D20CampaignSetting")).toBeGreaterThan(
        xml.indexOf("</CharacterSheet>"),
      );
      expect(readCampaignSetting(xml)).toMatchObject({
        ...input,
        restrictedIds: ["ID_X_(Y)"],
        diagnostics: [],
      });
      expect(importDnd4e(xml).report).toBeDefined();
    });

    it("adds a setting to a save without one", () => {
      const xml = exportWith(source(""), {
        name: "Added",
        restrictedIds: ["ID_A"],
        houseRulesXml: "",
      });
      expect(readCampaignSetting(xml)).toMatchObject({
        name: "Added",
        restrictedIds: ["ID_A"],
      });
    });
  });
});
