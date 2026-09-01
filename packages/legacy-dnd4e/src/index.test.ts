import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

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
      textStrings: { NOTE: "new & safe" },
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

  it("blocks edited export when the evaluation horizon is behind level history", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1"/></Level><Level><RulesElement name="2" type="Level" internal-id="L2"/></Level></D20Character>`,
    );
    const build = { ...imported.build, effectiveLevel: 1 };
    const content = [entity("L1", "1", "Level"), entity("L2", "2", "Level")];
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
    ).toThrow("evaluation horizon to be the latest level");
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
