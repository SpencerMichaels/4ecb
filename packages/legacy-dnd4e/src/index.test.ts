import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { newNativeCharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import {
  compareEditedDnd4eRoundTrip,
  comparePreservation,
  exportDnd4e,
  exportEditedDnd4e,
  importDnd4e,
  legacyEquipmentIdentityMatches,
  legacyPowerValueMatches,
  projectBuildForLegacyExport,
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
    provenance: { sourceKey: "writer-test", sourceOrdinal: 0 },
  };
}

describe("legacy .dnd4e import", () => {
  it("normalizes additive zero terms in cached power diagnostics", () => {
    expect(legacyPowerValueMatches("1d4+0", "1d4")).toBe(true);
    expect(legacyPowerValueMatches("1d4 + 0", "1d4")).toBe(true);
    expect(legacyPowerValueMatches("1d4+1", "1d4")).toBe(false);
  });

  it("matches cached weapon variants by definitions before display order", () => {
    const xml = `<?xml version="1.0"?><D20Character><CharacterSheet><PowerStats><Power name="Synthetic"><Weapon name="Dwarven Thrower Warhammer +2"><RulesElement name="Warhammer" type="Weapon" internal-id="WEAPON"/><RulesElement name="Dwarven Thrower +2" type="Magic Item" internal-id="MAGIC"/><AttackBonus>8</AttackBonus></Weapon></Power></PowerStats></CharacterSheet><Level/></D20Character>`;
    const [weapon] = importDnd4e(xml).snapshot.powers[0]?.weapons ?? [];
    expect(weapon?.definitionIds).toEqual(["WEAPON", "MAGIC"]);
    expect(
      weapon === undefined
        ? false
        : legacyEquipmentIdentityMatches(weapon, {
            equipmentName: "Warhammer Dwarven Thrower +2",
            definitionIds: ["MAGIC", "WEAPON"],
          }),
    ).toBe(true);
    for (const [cached, evaluated] of [
      ["Luckblade Longsword +1", "Longsword Luckblade +1"],
      ["Foe-Seeking Bow Longbow +1", "Longbow Foe-Seeking Bow +1"],
    ] as const)
      expect(
        legacyEquipmentIdentityMatches(
          { name: cached },
          { equipmentName: evaluated, definitionIds: [] },
        ),
      ).toBe(true);
  });

  it("parses the public structural fixture and preserves extensions exactly", async () => {
    const xml = await readFile(
      "reverse-engineering/fixtures/character/minimal-structure.dnd4e",
      "utf8",
    );
    const extended = xml.replace(
      "</D20Character>",
      '<FutureExtension answer="42"><Nested>kept</Nested></FutureExtension></D20Character>',
    );
    const imported = importDnd4e(extended);
    expect(imported.report.levelCount).toBe(1);
    expect(imported.report.unknownRootElements).toEqual(["FutureExtension"]);
    expect(imported.snapshot.textStrings.NOTE_FIXTURE).toBe(
      "Preserve & escape user text.",
    );
    expect(imported.build).toMatchObject({
      formatVersion: 1,
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "legacy:fixture-level",
            identity: { definitionId: "ID_INTERNAL_LEVEL_1" },
            children: [{ id: "legacy:fixture-unresolved", unresolved: true }],
          },
        },
      ],
      inventory: [
        {
          acquiredLevel: 1,
          quantity: 1,
          equippedQuantity: 1,
          elements: [{ definitionId: "ID_FIXTURE_ITEM" }],
        },
      ],
    });
    expect(
      comparePreservation(extended, exportDnd4e(imported.envelope)),
    ).toEqual({ identical: true });
  });

  it("extracts a cached sheet without treating it as recalculated state", () => {
    const xml = `<?xml version="1.0"?><D20Character game-system="D&amp;D4E" Version="0.07a"><CharacterSheet><Details><name>Ada</name><Level>3</Level></Details><AbilityScores><Strength score="14"/></AbilityScores><StatBlock><Stat value="19"><alias name="AC"/></Stat></StatBlock><RulesElementTally><RulesElement name="Arc Flash" type="Power" internal-id="POWER_1"><specific name="Short Description">A spark.</specific></RulesElement></RulesElementTally><LootTally><loot count="1" equip-count="1"><RulesElement name="Test blade" type="Weapon" internal-id="ITEM_1"/></loot></LootTally><PowerStats><Power name="Arc Flash"><specific name="Power Usage">Encounter</specific><specific name="Action Type">Standard Action</specific><Weapon name="Blade"><AttackBonus>7</AttackBonus><Damage>1d8+4</Damage><Defense>AC</Defense></Weapon></Power></PowerStats></CharacterSheet><Level/></D20Character>`;
    const imported = importDnd4e(xml);
    expect(imported.snapshot.details.name).toBe("Ada");
    expect(imported.snapshot.abilities.Strength).toBe(14);
    expect(imported.snapshot.stats.AC).toBe("19");
    expect(imported.snapshot.powers[0]).toMatchObject({
      name: "Arc Flash",
      id: "POWER_1",
      usage: "Encounter",
    });
    expect(imported.snapshot.loot[0]?.name).toBe("Test blade");
    expect(imported.report.usesLegacyCache).toBe(true);
  });

  it("rejects unrelated XML", () => {
    expect(() => importDnd4e("<NotACharacter/>")).toThrow(
      "Expected D20Character",
    );
  });

  it("resolves document-local replacement links and retains alternates", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1" charelem="root"><RulesElement name="Old" type="Feat" internal-id="OLD" charelem="old"/><RulesElement name="New" type="Feat" internal-id="NEW" charelem="new" replaces="old"/></RulesElement></Level><alternate SelectName="Prepared"><RulesElement name="Spell" type="Power" internal-id="SPELL" charelem="spell"/></alternate></D20Character>`,
    );
    expect(imported.build.levels[0]?.root.children[1]?.replacesId).toBe(
      "legacy:old",
    );
    expect(imported.build.alternates[0]).toMatchObject({
      selectName: "Prepared",
      choice: { identity: { definitionId: "SPELL" } },
    });
  });

  it("writes edited state for the explicit 0.07a target and preserves opaque root data", () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
<D20Character game-system="D&amp;D4E" Version="0.07a" legality="rules-legal" vendor="kept">
  <Level><RulesElement name="1" type="Level" internal-id="L1" charelem="root"><RulesElement name="Old" type="Feat" internal-id="OLD" charelem="old"/><RulesElement name="New" type="Feat" internal-id="NEW" charelem="new" replaces="old"/></RulesElement><loot count="1" equip-count="0" name="Old bag"><RulesElement name="Fixture Item" type="Gear" internal-id="ITEM"/></loot></Level>
  <alternate SelectName="Prepared" name="Provider" type="Class Feature" internal-id="PROVIDER"><RulesElement name="Spell" type="Power" internal-id="SPELL" charelem="spell"/></alternate>
  <textstring name="NOTE">old</textstring>
  <D20CampaignSetting><Secret value="private &amp; exact"/></D20CampaignSetting>
  <FutureExtension answer="42"><Nested>keep me exactly</Nested></FutureExtension>
  <CharacterSheet><Details><name>Ada</name><Level>1</Level></Details><AbilityScores><Strength score="14"/></AbilityScores><Companions><Companion name="Kept"/></Companions><Journal><Entry>Preserved note</Entry></Journal><SheetExtension future="yes">before<Nested/>after</SheetExtension></CharacterSheet>
</D20Character>`;
    const imported = importDnd4e(source);
    const build = {
      ...imported.build,
      baseAbilities: { ...imported.build.baseAbilities, Strength: 18 },
      textStrings: { NOTE: "new & safe", EMPTY: "" },
      inventory: imported.build.inventory.map((entry) => ({
        ...entry,
        name: "Edited bag",
        quantity: 2,
        equippedQuantity: 1,
      })),
    };
    const content = [
      entity("L1", "1", "Level"),
      entity("OLD", "Old", "Feat"),
      entity("NEW", "New", "Feat"),
      entity("ITEM", "Fixture Item", "Gear"),
      entity("SPELL", "Spell", "Power"),
    ];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );

    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation,
      content,
    });
    const reimported = importDnd4e(xml);

    expect(xml).toContain('Version="0.07a"');
    expect(xml).toContain('vendor="kept"');
    expect(xml).toMatch(/<D20Character[^>]*>\n  <CharacterSheet>/);
    expect(xml.match(/<AbilityScores\b/g)).toHaveLength(1);
    for (const [ability, score] of Object.entries(build.baseAbilities))
      expect(xml).toContain(`<${ability} score="${score}"`);
    expect(xml).toContain('<textstring name="EMPTY"></textstring>');
    expect(xml).not.toMatch(
      /<(?:textstring|specific|AttackBonus|Damage|AttackStat|Defense)\b[^>]*\/>/,
    );
    expect(xml).toContain(
      '<D20CampaignSetting><Secret value="private &amp; exact"/></D20CampaignSetting>',
    );
    expect(xml).toContain(
      '<FutureExtension answer="42"><Nested>keep me exactly</Nested></FutureExtension>',
    );
    expect(xml).toContain('<Companion name="Kept"/>');
    expect(xml).toContain("<Entry>Preserved note</Entry>");
    expect(xml).toContain(
      '<SheetExtension future="yes">before<Nested/>after</SheetExtension>',
    );
    const conditionalXml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation: {
        ...evaluation,
        powers: [
          {
            definitionId: "POWER",
            name: "Conditional Strike",
            keywords: ["Weapon"],
            variants: [
              {
                id: "POWER:weapon",
                equipmentName: "Test blade",
                damage: "1d8+4",
                attackComponents: [],
                damageComponents: [],
                conditionalDamage: [
                  {
                    source: "Hunter's Quarry",
                    expression: "3d8",
                    condition: "once per round against your quarry",
                  },
                ],
              },
            ],
            recoveries: [],
            unsupported: [],
          },
        ],
      },
      content,
    });
    expect(conditionalXml).toContain(
      "<Conditions>+3d8 to damage once per round against your quarry (Hunter's Quarry)</Conditions>",
    );
    expect(xml).toContain('charelem="4ecb-1"');
    expect(xml).toMatch(/charelem="4ecb-3" replaces="4ecb-2"/);
    expect(xml).not.toContain('charelem="root"');
    expect(reimported.build.baseAbilities.Strength).toBe(18);
    expect(reimported.build.inventory[0]).toMatchObject({
      name: "Edited bag",
      quantity: 2,
      equippedQuantity: 1,
    });
    expect(reimported.build.textStrings.NOTE).toBe("new & safe");
    expect(reimported.build.levels[0]?.root.children[1]?.replacesId).toBe(
      "legacy:4ecb-2",
    );
    expect(reimported.build.alternates[0]?.selectName).toBe("Prepared");
    expect(reimported.snapshot.abilities.Strength).toBe(18);
    expect(reimported.snapshot.loot[0]).toMatchObject({
      name: "Edited bag",
      count: 2,
      equippedCount: 1,
    });
    expect(compareEditedDnd4eRoundTrip(build, reimported.build)).toEqual({
      equivalent: true,
      differences: [],
    });
  });

  it("exports only the current level while preserving inactive future planning", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1"/></Level><Level><RulesElement name="2" type="Level" internal-id="L2"><RulesElement name="Future feat" type="Feat" internal-id="FUTURE"/></RulesElement><loot count="1" equip-count="0"><RulesElement name="Future item" type="Gear" internal-id="FUTURE_ITEM"/></loot></Level></D20Character>`,
    );
    const build = { ...imported.build, effectiveLevel: 1 };
    const content = [
      entity("L1", "1", "Level"),
      entity("L2", "2", "Level"),
      entity("FUTURE", "Future feat", "Feat"),
      entity("FUTURE_ITEM", "Future item", "Gear"),
    ];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation,
      content,
    });
    const reimported = importDnd4e(xml);
    expect(reimported.build.levels).toHaveLength(1);
    expect(xml).not.toContain("Future feat");
    expect(xml).not.toContain("Future item");
    expect(build.levels).toHaveLength(2);
    const projectedAlternate = projectBuildForLegacyExport({
      ...build,
      alternates: [
        {
          id: "active-alternate",
          selectName: "Prepared",
          provider: { name: "Provider", type: "Class Feature" },
          choice: {
            id: "active-choice",
            identity: {
              definitionId: "FUTURE",
              name: "Active choice",
              type: "Feat",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [
              {
                id: "future-child",
                identity: {
                  definitionId: "FUTURE",
                  name: "Future child",
                  type: "Feat",
                },
                acquiredLevel: 2,
                legality: "rules-legal",
                unresolved: false,
                children: [],
              },
            ],
          },
        },
      ],
    });
    expect(projectedAlternate.alternates[0]?.choice.children).toEqual([]);
    expect(
      compareEditedDnd4eRoundTrip(
        projectBuildForLegacyExport(build),
        reimported.build,
      ),
    ).toEqual({ equivalent: true, differences: [] });
  });

  it("regenerates a native-created record from its minimal compatibility envelope", () => {
    const level = entity("ID_INTERNAL_LEVEL_1", "1", "Level");
    const racialBonus: ContentEntity = {
      ...entity("RACIAL_BONUS", "Dexterity", "Race Ability Bonus"),
      rules: [
        {
          name: "statadd",
          attributes: [
            { name: "name", value: "Dexterity" },
            { name: "value", value: "+2" },
          ],
          text: "",
          children: [],
          ordinal: 0,
        },
      ],
    };
    const created = newNativeCharacterRecord(
      "Native <Hero> & Co",
      {
        definitionId: level.id,
        name: level.name,
        type: level.type,
      },
      { packId: "private", contentDigest: "digest" },
      {
        id: "native",
        occurrenceId: "native-level-1",
        now: "2026-09-01T00:00:00.000Z",
      },
    );
    const record = {
      ...created,
      build: {
        ...created.build,
        levels: [
          {
            ...created.build.levels[0]!,
            root: {
              ...created.build.levels[0]!.root,
              children: [
                {
                  id: "racial-bonus",
                  identity: {
                    definitionId: racialBonus.id,
                    name: racialBonus.name,
                    type: racialBonus.type,
                  },
                  acquiredLevel: 1,
                  legality: "rules-legal" as const,
                  children: [],
                  unresolved: false,
                },
              ],
            },
          },
        ],
      },
    };
    const content = [level, racialBonus];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(record.build, content),
      content,
    );
    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: record.legacy,
      snapshot: record.snapshot,
      build: record.build,
      evaluation,
      content,
    });
    const reimported = importDnd4e(xml);
    expect(xml).toContain("<name>Native &lt;Hero&gt; &amp; Co</name>");
    expect(xml).toContain('internal-id="ID_INTERNAL_LEVEL_1"');
    expect(xml).toContain('<AbilityScores><Strength score="10"');
    expect(reimported.build.baseAbilities.Dexterity).toBe(10);
    expect(reimported.snapshot.abilities.Dexterity).toBe(10);
    expect(reimported.snapshot.stats.Dexterity).toBe("12");
    expect(reimported.snapshot.details.name).toBe("Native <Hero> & Co");
    expect(compareEditedDnd4eRoundTrip(record.build, reimported.build)).toEqual(
      {
        equivalent: true,
        differences: [],
      },
    );
  });

  it("blocks invalid XML characters instead of silently changing user text", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1"/></Level></D20Character>`,
    );
    const build = {
      ...imported.build,
      textStrings: { NOTE: "invalid\u0001text" },
    };
    const content = [entity("L1", "1", "Level")];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    expect(() =>
      exportEditedDnd4e({
        target: "legacy-builder-0.07a",
        envelope: imported.envelope,
        snapshot: imported.snapshot,
        build,
        evaluation,
        content,
      }),
    ).toThrow("invalid XML 1.0 character");
  });
});
