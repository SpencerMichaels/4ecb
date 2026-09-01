import { describe, expect, it } from "vitest";

import {
  CharacterTransaction,
  duplicateCharacterRecord,
  newCharacterRecord,
  type CharacterBuild,
} from ".";

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

const build: CharacterBuild = {
  formatVersion: 1,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "level-1",
        identity: {
          definitionId: "ID_INTERNAL_LEVEL_1",
          name: "1",
          type: "Level",
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
    },
  ],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

describe("character records", () => {
  it("creates versioned records and independent duplicates", () => {
    const source = newCharacterRecord(
      { format: "dnd4e", sourceXml: "<D20Character/>" },
      snapshot,
      build,
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
      schemaVersion: 2,
    });
  });

  it("applies atomic commands with undo and redo", () => {
    const transaction = new CharacterTransaction(build);
    transaction.dispatch({
      kind: "set-base-ability",
      ability: "Strength",
      value: 16,
    });
    transaction.dispatch({ kind: "set-text", name: "Player", value: "Ada" });
    expect(transaction.current.baseAbilities.Strength).toBe(16);
    expect(transaction.current.textStrings.Player).toBe("Ada");
    expect(transaction.undo().textStrings.Player).toBeUndefined();
    expect(transaction.redo().textStrings.Player).toBe("Ada");
  });

  it("edits a positional choice without mutating the previous build", () => {
    const choice = {
      id: "choice",
      identity: { definitionId: "FEAT", name: "Feat", type: "Feat" },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const changed = new CharacterTransaction(build).dispatch({
      kind: "choose",
      parentId: "level-1",
      index: 0,
      occurrence: choice,
    });
    expect(build.levels[0]?.root.children).toEqual([]);
    expect(changed.levels[0]?.root.children[0]?.id).toBe("choice");
  });
});
