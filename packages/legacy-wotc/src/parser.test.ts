import { describe, expect, it } from "vitest";

import { D20RulesParser, parseD20Rules } from "./parser";

const sample = `<?xml version="1.0" encoding="utf-8"?>
<D20Rules game-system="D&amp;D4E">
  <!-- root comment -->
  <RulesElement internal-id="ID_TEST_POWER_1" name="Example Power" type="Power" source="Synthetic">
    <Category>Power, Example</Category>
    <Flavor>Brief flavor.</Flavor>
    <specific name="Power Usage">Encounter</specific>
    <specific name="Action Type">Standard Action</specific>
    <rules><grant name="ID_TEST_FEATURE_1" type="Class Feature" /></rules>
    Main description.
  </RulesElement>
  <Unknown value="preserved" />
</D20Rules>`;

describe("D20RulesParser", () => {
  it("normalizes a rules element and accounts for raw root content", () => {
    const parsed = parseD20Rules(sample, "sample.xml");
    expect(parsed.gameSystem).toBe("D&D4E");
    expect(parsed.accounting).toEqual({
      topLevelRecords: 1,
      acceptedRecords: 1,
      warnedRecords: 0,
      rejectedRecords: 0,
      rawTopLevelElements: 1,
    });
    expect(parsed.entities[0]).toMatchObject({
      id: "ID_TEST_POWER_1",
      name: "Example Power",
      type: "Power",
      categories: ["Power", "Example"],
      flavor: "Brief flavor.",
      description: "Main description.",
    });
    expect(parsed.entities[0]?.specifics).toHaveLength(2);
    expect(parsed.entities[0]?.rules[0]).toMatchObject({
      name: "grant",
      ordinal: 0,
    });
  });

  it("rejects missing identity and duplicate IDs without silently dropping them", () => {
    const parsed = parseD20Rules(`<D20Rules game-system="D&amp;D4E">
      <RulesElement name="Missing ID" type="Feat" />
      <RulesElement internal-id="ID_DUP" name="First" type="Feat" />
      <RulesElement internal-id="id_dup" name="Second" type="Feat" />
    </D20Rules>`);
    expect(parsed.accounting.topLevelRecords).toBe(3);
    expect(parsed.accounting.acceptedRecords).toBe(1);
    expect(parsed.accounting.rejectedRecords).toBe(2);
    expect(parsed.rejected.map((record) => record.reason)).toEqual([
      "Missing required attribute(s): internal-id",
      "Duplicate internal-id after merge: id_dup",
    ]);
  });

  it("accepts input in chunks", () => {
    const midpoint = Math.floor(sample.length / 2);
    const parser = new D20RulesParser("chunked.xml");
    parser.write(sample.slice(0, midpoint));
    parser.write(sample.slice(midpoint));
    expect(parser.close().entities[0]?.id).toBe("ID_TEST_POWER_1");
  });
});

describe('native ParseOneRule\'s modify name="this"', () => {
  const parse = (body: string) =>
    parseD20Rules(`<D20Rules game-system="D&amp;D4E">${body}</D20Rules>`)
      .entities;
  const fields = (
    entity:
      { specifics: readonly { name: string; value: string }[] } | undefined,
  ) =>
    Object.fromEntries(
      (entity?.specifics ?? []).map((specific) => [
        specific.name,
        specific.value,
      ]),
    );

  it("writes an unconditional value into the record's own field at load", () => {
    const [fiddle, deck, shield, impact] = parse(`
      <RulesElement internal-id="ID_FIDDLE" name="Hyrsam Fiddle +1" type="Magic Item" source="Synthetic">
        <specific name="Magic Item Type">Wondrous Item</specific>
        <specific name="_ImplementEquiv">Instrument</specific>
        <rules><modify name="this" Field="_ImplementForClass" value="ID_FMP_CLASS_128" /></rules>
      </RulesElement>
      <RulesElement internal-id="ID_DECK" name="The Deck of Many Things" type="Magic Item" source="Synthetic">
        <specific name="Item Slot"></specific>
        <rules><modify name="this" Field="Item Slot" value="Off-hand" /></rules>
      </RulesElement>
      <RulesElement internal-id="ID_SHIELD" name="Spiked Shield" type="Armor" source="Synthetic">
        <specific name="Armor Type">Shield</specific>
        <rules><modify name="this" Field="WeaponEquiv" value="Spiked Shield:weapon" /></rules>
      </RulesElement>
      <RulesElement internal-id="ID_IMPACT" name="Clarifying Impact (Augment 0)" type="Power" source="Synthetic">
        <rules><modify name="This" Field="_BasicAttack" value="Melee" /></rules>
      </RulesElement>`);
    expect(fields(fiddle)).toEqual({
      "Magic Item Type": "Wondrous Item",
      _ImplementEquiv: "Instrument",
      _ImplementForClass: "ID_FMP_CLASS_128",
    });
    expect(fiddle?.specifics.at(-1)?.ordinal).toBe(2);
    expect(fields(deck)).toEqual({ "Item Slot": "Off-hand" });
    expect(fields(shield)).toMatchObject({
      WeaponEquiv: "Spiked Shield:weapon",
    });
    expect(fields(impact)).toEqual({ _BasicAttack: "Melee" });
    // The rule itself stays for loss-preserving export.
    expect(fiddle?.rules).toHaveLength(1);
  });

  it("replaces a field and the Prereqs, last value winning", () => {
    const [power] = parse(`
      <RulesElement internal-id="ID_POWER" name="Castigating Strike" type="Power" source="Synthetic">
        <Prereqs>Old</Prereqs>
        <specific name="Divine Sanction">Old text</specific>
        <rules>
          <modify name="this" Field="Divine Sanction" value="First" />
          <modify name="this" Field="Divine Sanction" value="Enemy is marked by you." />
          <modify name="this" Field="Prereqs" value="Paladin" />
        </rules>
      </RulesElement>`);
    expect(fields(power)).toEqual({
      "Divine Sanction": "Enemy is marked by you.",
    });
    expect(power?.prerequisites).toBe("Paladin");
  });

  it("keeps an authored list that already contains each value (D105, Faervian)", () => {
    const [faervian] = parse(`
      <RulesElement internal-id="ID_FAERVIAN" name="Faervian +5" type="Magic Item" source="Synthetic">
        <specific name="_ImplementForPower">ID_FMP_POWER_SOURCE_2, ID_FMP_POWER_SOURCE_3</specific>
        <rules>
          <modify name="this" Field="_ImplementForPower" value="ID_FMP_POWER_SOURCE_2" />
          <modify name="this" Field="_ImplementForPower" value="ID_FMP_POWER_SOURCE_3" />
        </rules>
      </RulesElement>`);
    expect(fields(faervian)).toEqual({
      _ImplementForPower: "ID_FMP_POWER_SOURCE_2, ID_FMP_POWER_SOURCE_3",
    });
  });

  it("leaves conditional, typed and list-addition this-modifies to run time", () => {
    const [cudgel] = parse(`
      <RulesElement internal-id="ID_CUDGEL" name="Unforgettable Cudgel +2" type="Magic Item" source="Synthetic">
        <rules>
          <modify name="this" Field="_PowerstatKeywords" list-addition="holy symbol implement" requires="Divine" />
          <modify name="this" Field="_CS_ShortDescription" value=" @ " requires="!ID_FMP_CLASS_5" />
          <modify name="this" Field="Item Slot" value="Arms" wearing="Shield" />
          <modify name="this" type="Magic Item" Field="Item Slot" value="Neck" />
          <modify name="this" Field="Properties" list-addition="Brutal 1" />
          <modify name="Other" Field="Item Slot" value="Feet" />
        </rules>
      </RulesElement>`);
    expect(cudgel?.specifics).toEqual([]);
  });
});
