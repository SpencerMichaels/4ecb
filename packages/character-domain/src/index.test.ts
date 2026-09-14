import { describe, expect, it } from "vitest";

import {
  CharacterTransaction,
  detailsWithLegacyTextStrings,
  duplicateCharacterRecord,
  isCharacterRecord,
  isLegacyCharacterRecordV1,
  newCharacterRecord,
  newNativeCharacterRecord,
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

const portrait = {
  sourceDataUrl: "data:image/webp;base64,c291cmNl",
  sourceWidth: 800,
  sourceHeight: 1200,
  crop: { x: 0.5, y: 0.4, size: 0.5 },
  renderedDataUrl: "data:image/webp;base64,cmVuZGVyZWQ=",
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
    expect(isCharacterRecord(source)).toBe(true);
  });

  it("validates and duplicates browser-local portrait metadata", () => {
    const source = {
      ...newCharacterRecord(
        { format: "dnd4e", sourceXml: "<D20Character/>" },
        snapshot,
        build,
        { id: "portrait", now: "2026-01-01T00:00:00.000Z" },
      ),
      portrait,
    };
    expect(isCharacterRecord(source)).toBe(true);
    expect(duplicateCharacterRecord(source, "copy").portrait).toEqual(portrait);
    expect(
      isCharacterRecord({
        ...source,
        portrait: { ...portrait, crop: { ...portrait.crop, size: 2 } },
      }),
    ).toBe(false);
    expect(
      isCharacterRecord({
        ...source,
        portrait: { ...portrait, sourceDataUrl: "javascript:alert(1)" },
      }),
    ).toBe(false);
    expect(
      isCharacterRecord({
        ...source,
        portrait: { ...portrait, crop: { ...portrait.crop, x: 0.1 } },
      }),
    ).toBe(false);
  });

  it("creates an exact-profile native level-1 record without legacy cache claims", () => {
    const record = newNativeCharacterRecord(
      "New Hero",
      {
        definitionId: "ID_INTERNAL_LEVEL_1",
        name: "1",
        type: "Level",
      },
      { packId: "private", contentDigest: "digest-1" },
      {
        id: "native-one",
        occurrenceId: "native-level-one",
        now: "2026-09-01T00:00:00.000Z",
      },
    );
    expect(record).toMatchObject({
      id: "native-one",
      title: "New Hero",
      profileBinding: { packId: "private", contentDigest: "digest-1" },
      legacy: { origin: "native", version: "0.07a" },
      snapshot: { source: "native-empty" },
      build: {
        effectiveLevel: 1,
        baseAbilities: {
          Strength: 8,
          Constitution: 10,
          Dexterity: 10,
          Intelligence: 10,
          Wisdom: 10,
          Charisma: 10,
        },
        levels: [
          {
            root: {
              id: "native-level-one",
              identity: { definitionId: "ID_INTERNAL_LEVEL_1" },
            },
          },
        ],
      },
    });
    expect(record.snapshot.stats).toEqual({});
    expect(record.build.textStrings.Name).toBe("New Hero");
    expect(isCharacterRecord(record)).toBe(true);
  });

  it("projects edited legacy detail text into the derived sheet fields", () => {
    expect(
      detailsWithLegacyTextStrings(
        { name: "Old", Traits: "Old traits", Race: "Human" },
        {
          Name: "New",
          "NOTE_Personality Traits": "New traits",
          "NOTE_Mannerisms and Appearance": "",
        },
      ),
    ).toEqual({
      name: "New",
      Traits: "New traits",
      Appearance: "",
      Race: "Human",
    });
  });

  it("rejects unsafe native names and inexact native profiles", () => {
    const level = {
      definitionId: "ID_INTERNAL_LEVEL_1",
      name: "1",
      type: "Level",
    };
    expect(() =>
      newNativeCharacterRecord(" bad\nname ", level, {
        packId: "private",
        contentDigest: "digest-1",
      }),
    ).toThrow("Character name");
    expect(() =>
      newNativeCharacterRecord("Hero", level, { packId: "private" }),
    ).toThrow("exact content profile");
  });

  it("rejects incomplete records and invalid nested authoritative builds", () => {
    const record = newCharacterRecord(
      { format: "dnd4e", sourceXml: "<D20Character/>" },
      snapshot,
      build,
      { id: "validated", now: "2026-01-01T00:00:00.000Z" },
    );
    const { build: _build, ...withoutBuild } = record;
    void _build;
    expect(isCharacterRecord(withoutBuild)).toBe(false);
    expect(
      isCharacterRecord({
        ...record,
        build: {
          ...record.build,
          levels: [
            {
              level: 1,
              root: { ...record.build.levels[0]?.root, children: "invalid" },
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isLegacyCharacterRecordV1({ ...withoutBuild, schemaVersion: 1 }),
    ).toBe(true);
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

  it("keeps the historical occurrence when retraining into a later frame", () => {
    const oldChoice = {
      id: "old-feat",
      identity: { definitionId: "OLD", name: "Old", type: "Feat" },
      acquiredLevel: 1,
      legality: "rules-legal" as const,
      children: [],
      unresolved: false,
    };
    const withHistory: CharacterBuild = {
      ...build,
      levels: [
        {
          ...build.levels[0]!,
          root: { ...build.levels[0]!.root, children: [oldChoice] },
        },
        {
          level: 2,
          root: {
            ...build.levels[0]!.root,
            id: "level-2",
            acquiredLevel: 2,
            children: [],
          },
        },
      ],
    };
    const changed = new CharacterTransaction(withHistory).dispatch({
      kind: "retrain",
      parentId: "level-2",
      index: 0,
      replacesId: "old-feat",
      replacement: { ...oldChoice, id: "new-feat", acquiredLevel: 2 },
    });
    expect(changed.levels[0]?.root.children[0]?.id).toBe("old-feat");
    expect(changed.levels[1]?.root.children[0]).toMatchObject({
      id: "new-feat",
      replacesId: "old-feat",
    });
  });
});
