import { describe, expect, it } from "vitest";
import type { CharacterLibrarySummary } from "@4ecb/browser-storage";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  RULES_EVALUATION_CACHE_VERSION,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";

import {
  freshLibrarySummary,
  libraryCharacterSummary,
  LIBRARY_SUMMARY_VERSION,
  stampedLibrarySummary,
  type LibrarySummaryValue,
} from "./library-summary";
import { libraryRoleLine } from "./use-library-summary";

const value: LibrarySummaryValue = { roleLine: "Divine Defender" };
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
      { value: { roleLine: 3 } },
      { value: null },
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

  it("drives the pane's role line from the saved summary or the library's own result", () => {
    expect(libraryRoleLine(undefined, new Map())).toBeUndefined();
    expect(
      libraryRoleLine({ ...entry, librarySummary: summary }, new Map()),
    ).toEqual({ status: "ready", roleLine: "Divine Defender" });
    expect(libraryRoleLine(entry, new Map())).toEqual({ status: "loading" });
    expect(libraryRoleLine(entry, new Map([["ingi", { summary }]]))).toEqual({
      status: "ready",
      roleLine: "Divine Defender",
    });
    // A class without a role is ready with no role line.
    expect(
      libraryRoleLine(
        {
          ...entry,
          librarySummary: stampedLibrarySummary(character, {})!,
        },
        new Map(),
      ),
    ).toEqual({ status: "ready" });
    // A result for an older revision, or an older failure, is retried.
    const edited = { ...entry, updatedAt: "2026-10-22T10:00:00.000Z" };
    expect(libraryRoleLine(edited, new Map([["ingi", { summary }]]))).toEqual({
      status: "loading",
    });
    const failure = { updatedAt: entry.updatedAt, message: "Pack missing" };
    expect(libraryRoleLine(entry, new Map([["ingi", failure]]))).toEqual({
      status: "error",
      message: "Pack missing",
    });
    expect(libraryRoleLine(edited, new Map([["ingi", failure]]))).toEqual({
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
    converged: true,
    occurrences: [
      {
        id: "class",
        definitionId: "ID_PALADIN",
        acquiredLevel: 1,
        kind: "grant",
      },
    ],
  } as unknown as EvaluatedCharacter;

  it("is the evaluated classes' role line", () => {
    expect(libraryCharacterSummary(evaluation, [paladin])).toEqual({
      roleLine: "Divine Defender",
    });
    expect(libraryCharacterSummary(evaluation, [])).toEqual({});
    expect(() =>
      libraryCharacterSummary({ ...evaluation, converged: false }, [paladin]),
    ).toThrow("did not converge");
  });
});
