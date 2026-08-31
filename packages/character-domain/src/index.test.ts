import { describe, expect, it } from "vitest";

import { duplicateCharacterRecord, newCharacterRecord } from ".";

const snapshot = {
  details: { name: "Ada" },
  abilities: {},
  stats: {},
  selectedRules: [],
  powers: [],
  loot: [],
  textStrings: {},
  levelCount: 1,
  source: "legacy-cache" as const,
};

describe("character records", () => {
  it("creates versioned records and independent duplicates", () => {
    const source = newCharacterRecord(
      { format: "dnd4e", sourceXml: "<D20Character/>" },
      snapshot,
      { id: "one", now: "2026-01-01T00:00:00.000Z" },
    );
    const copy = duplicateCharacterRecord(
      source,
      "two",
      "2026-01-02T00:00:00.000Z",
    );
    expect(source.title).toBe("Ada");
    expect(copy).toMatchObject({
      id: "two",
      title: "Ada (copy)",
      schemaVersion: 1,
    });
  });
});
