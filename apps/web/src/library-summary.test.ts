import { describe, expect, it } from "vitest";
import type { CharacterLibrarySummary } from "@4ecb/browser-storage";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  RULES_EVALUATION_CACHE_VERSION,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

import {
  freshLibrarySummary,
  libraryCharacterSummary,
  LIBRARY_SUMMARY_VERSION,
  stampedLibrarySummary,
  type LibrarySummaryValue,
} from "./library-summary";
import { PLACEHOLDER_PLAY_DATA, playData } from "./play-data";
import { libraryStats } from "./use-library-summary";

const value: LibrarySummaryValue = {
  roleLine: "Divine Defender",
  playData: PLACEHOLDER_PLAY_DATA,
};
const character = {
  updatedAt: "2026-10-21T10:00:00.000Z",
  profileBinding: { packId: "pack", contentDigest: "digest-1" },
};
const entry = {
  id: "ingi",
  title: "Ingi",
  effectiveLevel: 1,
  updatedAt: character.updatedAt,
  contentRevision: { packId: "pack", contentDigest: "digest-1" },
};
const summary = stampedLibrarySummary(character, value)!;

describe("library summary staleness", () => {
  it("stamps the engine, format, revision and content it came from", () => {
    expect(summary).toEqual({
      engineVersion: RULES_EVALUATION_CACHE_VERSION,
      summaryVersion: LIBRARY_SUMMARY_VERSION,
      updatedAt: character.updatedAt,
      packId: "pack",
      contentDigest: "digest-1",
      value,
    });
    // Without an exact content revision there is nothing to stamp.
    expect(
      stampedLibrarySummary(
        { updatedAt: character.updatedAt, profileBinding: { packId: "pack" } },
        value,
      ),
    ).toBeUndefined();
  });

  it("is fresh only while every part of the stamp still matches", () => {
    expect(freshLibrarySummary({ ...entry, librarySummary: summary })).toEqual(
      value,
    );
    const stale: readonly Partial<CharacterLibrarySummary>[] = [
      { engineVersion: "older-engine" },
      { summaryVersion: LIBRARY_SUMMARY_VERSION + 1 },
      { updatedAt: "2026-10-20T10:00:00.000Z" },
      { packId: "other" },
      { contentDigest: "digest-2" },
      { value: { roleLine: 3, playData: PLACEHOLDER_PLAY_DATA } },
      { value: { playData: { abilities: [] } } },
    ];
    for (const change of stale)
      expect(
        freshLibrarySummary({
          ...entry,
          librarySummary: { ...summary, ...change },
        }),
      ).toBeUndefined();
    expect(freshLibrarySummary(entry)).toBeUndefined();
    expect(
      freshLibrarySummary({
        ...entry,
        contentRevision: { packId: "pack" },
        librarySummary: summary,
      }),
    ).toBeUndefined();
  });

  it("drives the pane from the saved summary or the library's own result", () => {
    expect(libraryStats(undefined, new Map())).toBeUndefined();
    expect(
      libraryStats({ ...entry, librarySummary: summary }, new Map()),
    ).toEqual({ status: "ready", summary: value });
    expect(libraryStats(entry, new Map())).toEqual({ status: "loading" });
    expect(libraryStats(entry, new Map([["ingi", { summary }]]))).toEqual({
      status: "ready",
      summary: value,
    });
    // A result for an older revision, or an older failure, is retried.
    const edited = { ...entry, updatedAt: "2026-10-22T10:00:00.000Z" };
    expect(libraryStats(edited, new Map([["ingi", { summary }]]))).toEqual({
      status: "loading",
    });
    const failure = { updatedAt: entry.updatedAt, message: "Pack missing" };
    expect(libraryStats(entry, new Map([["ingi", failure]]))).toEqual({
      status: "error",
      message: "Pack missing",
    });
    expect(libraryStats(edited, new Map([["ingi", failure]]))).toEqual({
      status: "loading",
    });
  });
});

describe("library summary from an evaluation", () => {
  const paladin = {
    id: "ID_PALADIN",
    name: "Paladin",
    type: "Class",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [
      { name: "Role", value: "Defender. In front.", ordinal: 0 },
      { name: "Power Source", value: "Divine.", ordinal: 1 },
    ],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  } as unknown as ContentEntity;
  const evaluation = {
    level: 1,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [
      {
        id: "class",
        definitionId: "ID_PALADIN",
        acquiredLevel: 1,
        kind: "grant",
      },
    ],
    activeDefinitionIds: ["ID_PALADIN"],
    activeDefinitions: [],
    choices: [],
    stats: {
      AC: { name: "AC", value: 18 },
      "Hit Points": { name: "Hit Points", value: 30 },
    },
    overlays: [],
    suggestions: [],
    textStrings: {},
    textContributions: [],
    diagnostics: [],
    powers: [],
  } as unknown as EvaluatedCharacter;
  const snapshot = {
    details: {},
    abilities: {},
    stats: {},
    selectedRules: [],
    loot: [],
    powers: [],
    textStrings: {},
    levelCount: 1,
    source: "legacy-cache",
  } as LegacyCharacterSnapshot;
  const build = {
    formatVersion: 2,
    known: [],
    effectiveLevel: 1,
    levels: [],
    grabbag: [],
    inventory: [],
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  } as CharacterBuild;

  it("goes through the sheet model the Play data card uses", () => {
    const result = libraryCharacterSummary(snapshot, build, evaluation, [
      paladin,
    ]);
    const model = buildEvaluatedSheetModel(snapshot, build, evaluation, [
      paladin,
    ]);
    expect(result).toEqual({
      roleLine: "Divine Defender",
      playData: playData(model),
    });
    expect(result.playData.defenses[0]).toEqual({ label: "AC", value: "18" });
    expect(result.playData.health[0]).toEqual({
      label: "Max HP",
      value: "30",
    });
    expect(() =>
      libraryCharacterSummary(
        snapshot,
        build,
        { ...evaluation, converged: false },
        [paladin],
      ),
    ).toThrow("did not converge");
  });
});
