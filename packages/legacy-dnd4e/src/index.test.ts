import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  isCharacterRecord,
  newCharacterRecord,
  newNativeCharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  legacyLoadoutHints,
  legacyLoadoutState,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import {
  compareEditedDnd4eRoundTrip,
  compareLegacyMainHandOrder,
  comparePreservation,
  exportDnd4e,
  exportEditedDnd4e,
  importDnd4e,
  legacyEquipmentIdentityMatches,
  legacyPowerValueMatches,
  projectBuildForLegacyExport,
  withLegacyFreebeeRituals,
  withLegacyLoadoutState,
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

  it("checks the evaluated main hand against legacy weapon-row order", () => {
    const longsword = {
      name: "Synthetic Longsword +2",
      definitionIds: ["LONGSWORD", "MAGIC_A"],
    };
    const razors = {
      name: "Synthetic Wrist Razors +1",
      definitionIds: ["RAZORS", "MAGIC_B"],
    };
    const unarmed = { name: "Unarmed", definitionIds: [] };
    // Legacy lists the "Main hand" loot first among equipped items.
    const cached = [longsword, razors, unarmed];
    const variant = (
      row: { name: string; definitionIds: string[] },
      hand?: "main" | "off",
    ) => ({
      equipmentName: row.name,
      definitionIds: row.definitionIds,
      equipped: row !== unarmed,
      ...(hand === undefined ? {} : { hand }),
    });
    expect(
      compareLegacyMainHandOrder(cached, [
        variant(longsword, "main"),
        variant(razors, "off"),
        variant(unarmed),
      ]),
    ).toEqual({
      expected: "Synthetic Longsword +2",
      actual: "Synthetic Longsword +2",
      matches: true,
    });
    // Swapped hands keep every row's numbers but fail the order check.
    expect(
      compareLegacyMainHandOrder(cached, [
        variant(longsword, "off"),
        variant(razors, "main"),
        variant(unarmed),
      ]),
    ).toMatchObject({
      expected: "Synthetic Longsword +2",
      actual: "Synthetic Wrist Razors +1",
      matches: false,
    });
    // Not comparable without a modern main hand or two equipped rows.
    expect(
      compareLegacyMainHandOrder(cached, [
        variant(longsword),
        variant(razors),
        variant(unarmed),
      ]),
    ).toBeUndefined();
    expect(
      compareLegacyMainHandOrder(
        [longsword, unarmed],
        [variant(longsword, "main"), variant(unarmed)],
      ),
    ).toBeUndefined();
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
      formatVersion: 3,
      known: [],
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

  it("recovers item choices nested only in the structurally matching loot cache", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><CharacterSheet><LootTally><loot count="1" equip-count="1"><RulesElement name="Armor" type="Armor" internal-id="ARMOR"/><RulesElement name="Armor of Resistance" type="Magic Item" internal-id="RESIST"><RulesElement name="Poison" type="Class Feature" internal-id="POISON" charelem="poison"/></RulesElement></loot></LootTally></CharacterSheet><Level><RulesElement name="1" type="Level" internal-id="L1"/><loot count="1" equip-count="1"><RulesElement name="Armor" type="Armor" internal-id="ARMOR"/><RulesElement name="Armor of Resistance" type="Magic Item" internal-id="RESIST"/></loot></Level></D20Character>`,
    );

    expect(imported.build.inventory[0]?.elements[1]?.children).toEqual([
      expect.objectContaining({
        id: "legacy:poison",
        identity: expect.objectContaining({ definitionId: "POISON" }),
      }),
    ]);

    const content = [
      entity("L1", "1", "Level"),
      entity("ARMOR", "Armor", "Armor"),
      {
        ...entity("RESIST", "Armor of Resistance", "Magic Item"),
        rules: [
          {
            name: "select",
            attributes: [
              { name: "type", value: "Class Feature" },
              { name: "number", value: "1" },
            ],
            text: "",
            children: [],
            ordinal: 0,
          },
        ],
      },
      entity("POISON", "Poison", "Class Feature"),
    ];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(imported.build, content),
      content,
    );
    const exported = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build: imported.build,
      evaluation,
      content,
    });
    expect(exported).toContain('internal-id="POISON"');
    expect(
      importDnd4e(exported).build.inventory[0]?.elements[1]?.children?.[0]
        ?.identity.definitionId,
    ).toBe("POISON");
  });

  it("imports ritual loot as known records and exports them back as loot", () => {
    const rule = (
      name: string,
      attributes: Record<string, string>,
      ordinal: number,
    ) => ({
      name,
      attributes: Object.entries(attributes).map(([key, value]) => ({
        name: key,
        value,
      })),
      text: "",
      children: [],
      ordinal,
    });
    const content = [
      entity("L1", "1", "Level"),
      {
        ...entity("CLASS", "Synthetic Druid", "Class"),
        rules: [
          rule("statadd", { name: "FREEBEE:RITUAL_FREE", value: "+1" }, 0),
          rule("grant", { name: "RITUAL_GRANTED", type: "Ritual" }, 1),
        ],
      },
      entity("RITUAL_KNOWN", "Known Rite", "Ritual"),
      entity("RITUAL_FREE", "Gifted Rite", "Ritual"),
      entity("RITUAL_GRANTED", "Granted Rite", "Ritual"),
      entity("RITUAL_NATIVE", "Native Rite", "Ritual"),
      entity("RITUAL_GONE", "Sold Rite", "Ritual"),
      entity("SCROLL", "Known Rite Scroll", "Ritual Scroll"),
    ];
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1" charelem="l1"><RulesElement name="Synthetic Druid" type="Class" internal-id="CLASS" charelem="class"/></RulesElement><loot count="1" equip-count="0" ShowPowerCard="1"><RulesElement name="Known Rite" type="Ritual" internal-id="RITUAL_KNOWN" url="https://example.test/known"/></loot><loot count="2" equip-count="0"><RulesElement name="Known Rite Scroll" type="Ritual Scroll" internal-id="SCROLL"/></loot><loot count="0" equip-count="0"><RulesElement name="Sold Rite" type="Ritual" internal-id="RITUAL_GONE"/></loot></Level></D20Character>`,
    );
    expect(imported.build.known).toEqual([
      {
        id: "legacy:loot:1:0",
        acquiredLevel: 1,
        element: {
          definitionId: "RITUAL_KNOWN",
          name: "Known Rite",
          type: "Ritual",
          url: "https://example.test/known",
        },
        acquisition: "free",
        legacyLoot: expect.objectContaining({
          quantity: 1,
          equippedQuantity: 0,
          showPowerCard: true,
        }),
      },
    ]);
    // A scroll never makes its ritual known; a count-0 record is not known
    // or owned, but its loot is kept as history for export.
    expect(
      imported.build.inventory.map(({ elements }) => elements[0]?.definitionId),
    ).toEqual(["SCROLL"]);
    expect(
      imported.build.inventoryHistory?.map(
        ({ elements }) => elements[0]?.definitionId,
      ),
    ).toEqual(["SCROLL", "RITUAL_GONE"]);

    const build = {
      ...imported.build,
      known: [
        ...imported.build.known,
        {
          id: "web:native",
          acquiredLevel: 1,
          element: {
            definitionId: "RITUAL_NATIVE",
            name: "Native Rite",
            type: "Ritual",
          },
          acquisition: "bought" as const,
        },
      ],
    };
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
    expect(
      reimported.build.known.map(({ element }) => element.definitionId),
    ).toEqual(["RITUAL_KNOWN", "RITUAL_NATIVE", "RITUAL_FREE"]);
    expect(reimported.build.textStrings.RITUAL_FREE).toBe("Given");
    expect(reimported.build.textStrings.RITUAL_GRANTED).toBeUndefined();
    const tally = /<LootTally>(.*?)<\/LootTally>/su.exec(xml)?.[1] ?? "";
    expect(tally).not.toContain('internal-id="RITUAL_GRANTED"');
    for (const id of ["RITUAL_KNOWN", "RITUAL_NATIVE", "RITUAL_FREE", "SCROLL"])
      expect(tally).toContain(`internal-id="${id}"`);
    expect(
      reimported.build.inventory.map(
        ({ elements }) => elements[0]?.definitionId,
      ),
    ).toEqual(["SCROLL"]);
    expect(xml).toContain('internal-id="RITUAL_GONE"');
    expect(
      compareEditedDnd4eRoundTrip(
        projectBuildForLegacyExport(
          withLegacyFreebeeRituals(build, evaluation, content),
        ),
        reimported.build,
      ),
    ).toEqual({ equivalent: true, differences: [] });
    // Once stored and marked Given, a second export adds nothing more.
    const again = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: reimported.envelope,
      snapshot: reimported.snapshot,
      build: reimported.build,
      evaluation: evaluateCharacter(
        projectBuildForEvaluation(reimported.build, content),
        content,
      ),
      content,
    });
    expect(
      importDnd4e(again).build.known.map(({ element }) => element.definitionId),
    ).toEqual(["RITUAL_KNOWN", "RITUAL_NATIVE", "RITUAL_FREE"]);
  });

  it("writes the loadout as legacy _AlternateSlot and hand text strings, and reads them back (D101)", () => {
    const withSpecifics = (
      value: ContentEntity,
      specifics: Record<string, string>,
    ): ContentEntity => ({
      ...value,
      specifics: Object.entries(specifics).map(([name, text], ordinal) => ({
        name,
        value: text,
        extraAttributes: [],
        ordinal,
      })),
    });
    const content = [
      entity("L1", "1", "Level"),
      withSpecifics(entity("SWORD", "Bastard blade", "Weapon"), {
        "Item Slot": "One-hand",
        Properties: "Versatile",
      }),
      withSpecifics(entity("RAZOR", "Arm blade", "Weapon"), {
        "Item Slot": "Off-hand",
        Properties: "Off-hand",
        _AlternateSlot: "Arms",
      }),
    ];
    const loot = (id: string, name: string) =>
      `<loot count="1" equip-count="1"><RulesElement name="${name}" type="Weapon" internal-id="${id}"/></loot>`;
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1"/>${loot("SWORD", "Bastard blade")}${loot("RAZOR", "Arm blade")}</Level><textstring name="_INTERNAL_MainHandWeapon">Arm blade</textstring><textstring name="_INTERNAL_VersatileUsedTwoHanded">0</textstring></D20Character>`,
    );
    const [sword, razor] = imported.build.inventory;
    // Wield the sword two-handed and wear the razors on the arms.
    let edited = applyCharacterCommand(imported.build, {
      kind: "equip-inventory",
      entryId: sword!.id,
      assignments: [{ slot: "main-hand", quantityIndex: 0 }],
    });
    edited = applyCharacterCommand(edited, {
      kind: "set-inventory-wielding",
      entryId: sword!.id,
      twoHanded: true,
    });
    edited = applyCharacterCommand(edited, {
      kind: "equip-inventory",
      entryId: razor!.id,
      assignments: [{ slot: "arms", quantityIndex: 0 }],
    });
    const exported = withLegacyLoadoutState(edited, content);
    expect(exported.textStrings).toMatchObject({
      _INTERNAL_VersatileUsedTwoHanded: "1",
    });
    // No weapon is alone in the main hand.
    expect(exported.textStrings._INTERNAL_MainHandWeapon).toBeUndefined();
    expect(exported.inventory[1]?.overrides._AlternateSlot).toBe("1");

    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build: edited,
      evaluation: evaluateCharacter(
        projectBuildForEvaluation(edited, content),
        content,
      ),
      content,
    });
    expect(xml).toContain(`_AlternateSlot="1"`);
    const reimported = importDnd4e(xml);
    expect(
      compareEditedDnd4eRoundTrip(
        projectBuildForLegacyExport(exported),
        reimported.build,
      ),
    ).toEqual({ equivalent: true, differences: [] });
    // Re-imported, the legacy state places the same loadout.
    const byId = new Map(
      content.map((value) => [value.id.toLowerCase(), value]),
    );
    const state = legacyLoadoutState(
      reimported.build.inventory,
      byId,
      legacyLoadoutHints(reimported.build.textStrings),
    );
    expect([...state.twoHandedEntryIds]).toHaveLength(1);
    expect([...state.alternateEntryIds]).toHaveLength(1);
    expect(state.mainHandWeapon).toBeUndefined();
  });

  it("exports edits to current holdings as deltas after the original loot (D097)", () => {
    const loot = (
      count: number,
      equipped: number,
      id: string,
      name: string,
      type = "Magic Item",
    ) =>
      `<loot count="${count}" equip-count="${equipped}" ShowPowerCard="1"><RulesElement name="${name}" type="${type}" internal-id="${id}"/></loot>`;
    const level = (n: number, rows = "") =>
      `<Level><RulesElement name="${n}" type="Level" internal-id="L${n}"/>${rows}</Level>`;
    const source = `<D20Character game-system="D&amp;D4E">${level(1)}${level(
      2,
      `${loot(1, 1, "BLADE", "Gouge", "Weapon")}${loot(1, 1, "BELT", "Belt of Vigor")}${loot(1, 0, "SYMBOL", "Symbol of Hope")}`,
    )}${level(
      3,
      `${loot(0, -1, "BLADE", "Gouge", "Weapon")}${loot(0, 1, "SYMBOL", "Symbol of Hope")}${loot(-1, -1, "BELT", "Belt of Vigor")}`,
    )}</D20Character>`;
    const content = [
      entity("L1", "1", "Level"),
      entity("L2", "2", "Level"),
      entity("L3", "3", "Level"),
      entity("BLADE", "Gouge", "Weapon"),
      entity("BELT", "Belt of Vigor", "Magic Item"),
      entity("SYMBOL", "Symbol of Hope", "Magic Item"),
    ];
    const imported = importDnd4e(source);
    const owned = (build: typeof imported.build) =>
      build.inventory.map(({ elements, quantity, equippedQuantity }) => [
        elements[0]?.definitionId,
        quantity,
        equippedQuantity,
      ]);
    expect(owned(imported.build)).toEqual([
      ["BLADE", 1, 0],
      ["SYMBOL", 1, 1],
    ]);
    const exportBuild = (build: typeof imported.build) =>
      exportEditedDnd4e({
        target: "legacy-builder-0.07a",
        envelope: imported.envelope,
        snapshot: imported.snapshot,
        build,
        evaluation: evaluateCharacter(
          projectBuildForEvaluation(build, content),
          content,
        ),
        content,
      });
    const levelLoot = (xml: string) =>
      [...xml.matchAll(/<Level><RulesElement(.*?)<\/Level>/gsu)].map((match) =>
        [
          ...(match[1] ?? "").matchAll(
            /<loot count="(-?\d+)" equip-count="(-?\d+)"/gu,
          ),
        ]
          .map((row) => `${row[1]}/${row[2]}`)
          .join(" "),
      );
    // Unedited, the original transactions are written back unchanged.
    expect(levelLoot(exportBuild(imported.build))).toEqual([
      "",
      "1/1 1/1 1/0",
      "0/-1 0/1 -1/-1",
    ]);

    // Equip the blade in both hands, buy the belt again and wear it.
    const bladeId = imported.build.inventory[0]!.id;
    let edited = applyCharacterCommand(imported.build, {
      kind: "equip-inventory",
      entryId: bladeId,
      assignments: [
        { slot: "main-hand", quantityIndex: 0 },
        { slot: "off-hand", quantityIndex: 0 },
      ],
    });
    edited = applyCharacterCommand(edited, {
      kind: "purchase-inventory",
      entry: {
        id: "web:belt",
        acquiredLevel: 3,
        quantity: 1,
        equippedQuantity: 0,
        elements: [
          { definitionId: "BELT", name: "Belt of Vigor", type: "Magic Item" },
        ],
        showPowerCard: true,
        overrides: {},
        legality: "rules-legal",
      },
      priceCopper: 0,
    });
    edited = applyCharacterCommand(edited, {
      kind: "equip-inventory",
      entryId: "web:belt",
      assignments: [{ slot: "waist", quantityIndex: 0 }],
    });
    const xml = exportBuild(edited);
    // History first, then one delta per changed item at the current level.
    expect(levelLoot(xml)).toEqual([
      "",
      "1/1 1/1 1/0",
      "0/-1 0/1 -1/-1 0/1 1/1",
    ]);
    const tally = /<LootTally>(.*?)<\/LootTally>/su.exec(xml)?.[1] ?? "";
    expect(
      [...tally.matchAll(/<loot count="(-?\d+)" equip-count="(-?\d+)"/gu)].map(
        (row) => `${row[1]}/${row[2]}`,
      ),
    ).toEqual(["1/1", "1/1", "1/1"]);
    const reimported = importDnd4e(xml);
    expect(owned(reimported.build)).toEqual([
      ["BLADE", 1, 1],
      ["BELT", 1, 1],
      ["SYMBOL", 1, 1],
    ]);
    expect(
      compareEditedDnd4eRoundTrip(
        // The explicit loadout leaves as its legacy text strings (D101).
        projectBuildForLegacyExport(withLegacyLoadoutState(edited, content)),
        reimported.build,
      ),
    ).toEqual({ equivalent: true, differences: [] });
  });

  it("imports per-level loot removals as records the domain decoder accepts", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1"/><loot count="1" equip-count="1"><RulesElement name="Old blade" type="Weapon" internal-id="BLADE"/></loot><loot count="1" equip-count="0"><RulesElement name="Spare cloak" type="Magic Item" internal-id="CLOAK"/></loot><loot count="1" equip-count="0"><RulesElement name="Lost Rite" type="Ritual" internal-id="RITE"/></loot></Level><Level><RulesElement name="2" type="Level" internal-id="L2"/><loot count="-1" equip-count="-1"><RulesElement name="Old blade" type="Weapon" internal-id="BLADE"/></loot><loot count="0" equip-count="1"><RulesElement name="Spare cloak" type="Magic Item" internal-id="CLOAK"/></loot><loot count="-1" equip-count="0"><RulesElement name="Lost Rite" type="Ritual" internal-id="RITE"/></loot></Level></D20Character>`,
    );
    expect(
      (imported.build.inventoryHistory ?? [])
        .filter(({ acquiredLevel }) => acquiredLevel === 2)
        .map(({ quantity, equippedQuantity }) => [quantity, equippedQuantity]),
    ).toEqual([
      [-1, -1],
      [0, 1],
      [-1, 0],
    ]);
    // What the character owns now: the blade and the rite are gone, the
    // cloak bought at level 1 is worn from level 2 (D097).
    expect(
      imported.build.inventory.map(
        ({ elements, quantity, equippedQuantity }) => [
          elements[0]?.definitionId,
          quantity,
          equippedQuantity,
        ],
      ),
    ).toEqual([["CLOAK", 1, 1]]);
    expect(imported.build.known).toEqual([]);
    const record = JSON.parse(
      JSON.stringify(
        newCharacterRecord(
          imported.envelope,
          imported.snapshot,
          imported.build,
          { id: "deltas", now: "2026-01-01T00:00:00.000Z" },
        ),
      ),
    ) as unknown;
    expect(isCharacterRecord(record)).toBe(true);
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
      textStrings: {
        NOTE: "new & safe",
        EMPTY: "",
        Name: "Ada Prime",
        "NOTE_Personality Traits": "Curious & exacting",
      },
      inventory: imported.build.inventory.map((entry) => ({
        ...entry,
        name: "Edited bag",
        quantity: 2,
        equippedQuantity: 1,
        equippedSlots: [{ slot: "main-hand" as const, quantityIndex: 0 }],
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
    expect(reimported.snapshot.details).toMatchObject({
      name: "Ada Prime",
      Traits: "Curious & exacting",
    });
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
                proficient: true,
                damage: "1d8+4",
                attackComponents: [
                  { label: "Strength modifier", value: 4 },
                  { label: "power attack bonus", value: 2 },
                  {
                    label: "weapon:attack",
                    value: 1,
                    source: "Test gauntlets",
                  },
                ],
                damageComponents: [],
                conditionalDamage: [
                  {
                    source: "Hunter's Quarry",
                    expression: "3d8",
                    condition: "once per round",
                  },
                ],
              },
            ],
            recoveries: [],
            unsupported: [],
          },
          {
            definitionId: "MEND",
            name: "Mending Word",
            keywords: ["Divine", "Healing"],
            variants: [],
            recoveries: [],
            healing: { bonus: 3, components: [], conditional: [] },
            unsupported: [],
          },
        ],
      },
      content: [
        ...content,
        {
          ...entity("POWER", "Conditional Strike", "Power"),
          flavor: "A swift cut.",
          specifics: [
            {
              name: "Power Usage",
              value: "At-Will",
              extraAttributes: [],
              ordinal: 0,
            },
            {
              name: "Keywords",
              value: "Weapon",
              extraAttributes: [],
              ordinal: 1,
            },
          ],
        },
      ],
    });
    expect(conditionalXml).toContain(
      "<Conditions>+3d8 to damage once per round (Hunter's Quarry)</Conditions>",
    );
    // iPlay4e rejects weapons missing any legacy field, unpadded values, or
    // component text in another layout, and shows no power cards without the
    // power's text, so all are written exactly as legacy does.
    expect(conditionalXml).toContain(
      '<Power name="Conditional Strike"><specific name="Flavor">A swift cut.</specific><specific name="Power Usage">At-Will</specific><specific name="Keywords">Weapon</specific><Weapon name="Test blade"><AttackBonus>  </AttackBonus><Damage> 1d8+4 </Damage><AttackStat>  </AttackStat><Defense>  </Defense><HitComponents> +2 power modifier.\r\n+4 Strength modifier.\r\n+1 bonus - Test gauntlets\r\n\r\n               </HitComponents><DamageComponents> \r\n               </DamageComponents><Conditions>',
    );
    // Legacy writes a placeholder Unarmed row to carry a Healing power's bonus.
    expect(conditionalXml).toContain(
      '<Power name="Mending Word"><Weapon name="Unarmed"><AttackBonus> 0 </AttackBonus><Damage>  </Damage><AttackStat> Unknown </AttackStat><Defense> Unknown </Defense><Healing> regain an additional 3 hit points. </Healing><HitComponents> +0 half your level.\r\n\r\n               </HitComponents>',
    );
    // iPlay4e also rejects stats without their legacy statadd children.
    expect(xml).toContain(
      '<Stat value="18"><alias name="Strength"/><statadd value="18"/></Stat>',
    );
    // Conditional statadds and textstrings in the native StatBlock shape:
    // `conditional=`, and a textstring's text in `String=`, not a statlink.
    const conditionalStatXml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation: {
        ...evaluation,
        stats: {
          ...evaluation.stats,
          "melee basic:damage": {
            name: "melee basic:damage",
            value: 0,
            contributions: [
              {
                id: "helm",
                stat: "melee basic:damage",
                value: "+1d6",
                providerId: "helm",
                providerName: "Horned Helm",
                condition: "when charging",
                text: true,
                applied: false,
                reason: "conditional",
              },
            ],
          },
          Speed: {
            name: "Speed",
            value: 0,
            contributions: [
              {
                id: "swift",
                stat: "Speed",
                value: "+2",
                numericValue: 2,
                providerId: "swift",
                providerName: "Swift Charge",
                condition: "when charging",
                applied: false,
                reason: "conditional",
              },
            ],
          },
        },
      },
      content,
    });
    expect(conditionalStatXml).toContain(
      '<Stat value="0"><alias name="melee basic:damage"/><statadd String="+1d6" value="0" conditional="when charging"/></Stat>',
    );
    expect(conditionalStatXml).toContain(
      '<Stat value="0"><alias name="Speed"/><statadd value="2" conditional="when charging"/></Stat>',
    );
    expect(conditionalStatXml).not.toContain('<alias name="1d6"/>');
    expect(xml).toContain('charelem="4ecb-1"');
    expect(xml).toMatch(/charelem="4ecb-3" replaces="4ecb-2"/);
    expect(xml).not.toContain('charelem="root"');
    expect(reimported.build.baseAbilities.Strength).toBe(18);
    expect(reimported.build.inventory[0]).toMatchObject({
      name: "Edited bag",
      quantity: 2,
      equippedQuantity: 1,
    });
    expect(reimported.build.inventory[0]?.equippedSlots).toBeUndefined();
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
    expect(
      compareEditedDnd4eRoundTrip(
        withLegacyLoadoutState(build, content),
        reimported.build,
      ),
    ).toEqual({
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
    // Gear is current at every level (D097): lowering the level keeps it.
    expect(
      reimported.build.inventory.map(({ name, elements, acquiredLevel }) => [
        name ?? elements[0]?.name,
        acquiredLevel,
      ]),
    ).toEqual([["Future item", 1]]);
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
    expect(xml).toContain('<AbilityScores><Strength score="8"');
    expect(reimported.build.baseAbilities.Strength).toBe(8);
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

describe("removed occurrences on export", () => {
  it("drops an occurrence removed from the build from the exported file", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><CharacterSheet/><Level><RulesElement name="1" type="Level" internal-id="L1" charelem="l1"><RulesElement name="Skill Rules" type="Rules" internal-id="RULES" charelem="rules"><RulesElement name="Cooking" type="Skill" internal-id="HOMEBREW_SKILL" charelem="hb"/></RulesElement></RulesElement></Level></D20Character>`,
    );
    // The homebrew skill is not in the content in use.
    const content = [
      entity("L1", "1", "Level"),
      entity("RULES", "Skill Rules", "Rules"),
    ];
    const kept = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build: imported.build,
      evaluation: evaluateCharacter(
        projectBuildForEvaluation(imported.build, content),
        content,
      ),
      content,
    });
    expect(kept).toContain('internal-id="HOMEBREW_SKILL"');
    const build = applyCharacterCommand(imported.build, {
      kind: "remove-occurrence",
      occurrenceId: "legacy:hb",
    });
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    expect(
      evaluation.diagnostics.some(
        ({ code }) => code === "occurrence.missing-definition",
      ),
    ).toBe(false);
    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation,
      content,
    });
    expect(xml).toContain('internal-id="RULES"');
    expect(xml).not.toContain("HOMEBREW_SKILL");
    expect(xml).not.toContain("Cooking");
  });
});
