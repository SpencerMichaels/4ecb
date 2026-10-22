import {
  librarySummaryMatchesCharacter,
  type CharacterLibraryEntry,
  type CharacterLibrarySummary,
} from "@4ecb/browser-storage";
import type {
  CharacterBuild,
  CharacterRecord,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  projectBuildForEvaluation,
  RULES_EVALUATION_CACHE_VERSION,
  type EvaluatedCharacter,
  type EvaluationInput,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";

import { characterRoleLine } from "./character-role";
import { isPlayData, playData, type PlayData } from "./play-data";

/**
 * The library's saved summary of a character (CharacterLibrarySummary's
 * value): its role line and Play data stats, computed wherever the
 * character is already evaluated with its content (the builder, or the
 * library's own rules worker). A disposable cache: the stamp decides when
 * it is stale, and a stale or malformed one is simply a miss.
 */
export interface LibrarySummaryValue {
  readonly roleLine?: string;
  readonly playData: PlayData;
}

/** Bump when LibrarySummaryValue or how it is computed changes. */
export const LIBRARY_SUMMARY_VERSION = 2;

/** What the library evaluates when it has no fresh summary: the sheet's
 *  input, without powers (the Play data stats don't read them). */
export function libraryEvaluationInput(
  build: CharacterBuild,
  content: readonly ContentEntity[],
): EvaluationInput {
  return {
    ...projectBuildForEvaluation(build, content),
    candidateDetailLevels: [],
    includePowers: false,
  };
}

/** The summary of an evaluated character, through the same sheet model and
 *  Play data function the printed card uses. */
export function libraryCharacterSummary(
  snapshot: LegacyCharacterSnapshot,
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
): LibrarySummaryValue {
  if (!evaluation.converged)
    throw new Error("The rules engine did not converge for this character.");
  const roleLine = characterRoleLine(evaluation, content);
  return {
    ...(roleLine === undefined ? {} : { roleLine }),
    playData: playData(
      buildEvaluatedSheetModel(snapshot, build, evaluation, content),
    ),
  };
}

/** Stamps a summary with what it was computed from; undefined when the
 *  character isn't bound to an exact content revision. */
export function stampedLibrarySummary(
  character: Pick<CharacterRecord, "updatedAt" | "profileBinding">,
  value: LibrarySummaryValue,
): CharacterLibrarySummary | undefined {
  const binding = character.profileBinding;
  if (binding?.contentDigest === undefined) return undefined;
  return {
    engineVersion: RULES_EVALUATION_CACHE_VERSION,
    summaryVersion: LIBRARY_SUMMARY_VERSION,
    updatedAt: character.updatedAt,
    packId: binding.packId,
    contentDigest: binding.contentDigest,
    value,
  };
}

function isSummaryValue(value: unknown): value is LibrarySummaryValue {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<
    Record<keyof LibrarySummaryValue, unknown>
  >;
  return (
    ["string", "undefined"].includes(typeof candidate.roleLine) &&
    isPlayData(candidate.playData)
  );
}

/** The summary's value when it still describes this library entry: the
 *  same character revision and content, engine and summary format. */
export function freshLibrarySummary(
  entry: Pick<
    CharacterLibraryEntry,
    "updatedAt" | "contentRevision" | "librarySummary"
  >,
  summary = entry.librarySummary,
): LibrarySummaryValue | undefined {
  if (
    summary === undefined ||
    summary.engineVersion !== RULES_EVALUATION_CACHE_VERSION ||
    summary.summaryVersion !== LIBRARY_SUMMARY_VERSION ||
    !librarySummaryMatchesCharacter(summary, entry) ||
    !isSummaryValue(summary.value)
  )
    return undefined;
  return summary.value;
}
