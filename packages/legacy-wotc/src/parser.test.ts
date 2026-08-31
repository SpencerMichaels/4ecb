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
