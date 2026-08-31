import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { comparePreservation, exportDnd4e, importDnd4e } from ".";

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
});
