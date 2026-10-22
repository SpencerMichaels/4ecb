import { useEffect, useRef } from "react";

import type { CharacterRepository } from "@4ecb/browser-storage";
import type { CharacterBuild, CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { sameRulesInputs } from "./builder-evaluation-plan";
import {
  libraryCharacterSummary,
  stampedLibrarySummary,
} from "./library-summary";

/** How long the builder must sit saved and evaluated before it writes the
 *  library summary, so a burst of edits writes once, after it ends. */
const SUMMARY_SETTLE_MS = 1500;

function whenIdle(task: () => void, delay: number): () => void {
  let idle: number | undefined;
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function")
      idle = window.requestIdleCallback(task, { timeout: 5000 });
    else task();
  }, delay);
  return () => {
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}

/**
 * Writes the library summary (the role line) for the
 * character open in the builder, from the evaluation the builder already
 * has: once the saved record and the current-level evaluation describe the
 * same rules inputs, and the edits have settled, in idle time. It is off
 * the save and evaluation paths entirely; a failure only loses the cache.
 */
export function useBuilderLibrarySummary({
  characters,
  character,
  evaluation,
  evaluatedBuild,
  entities,
  saved,
}: {
  readonly characters: Pick<CharacterRepository, "putLibrarySummary">;
  /** The stored record, as of the last committed save. */
  readonly character: CharacterRecord | undefined;
  /** The evaluation at the build's current level, and the build it was
   *  computed from. */
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly evaluatedBuild: CharacterBuild | undefined;
  /** The character's bound content, or none when it isn't available. */
  readonly entities: readonly ContentEntity[];
  /** No save pending or failed. */
  readonly saved: boolean;
}): void {
  const written = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !saved ||
      character === undefined ||
      evaluation === undefined ||
      evaluatedBuild === undefined ||
      entities.length === 0 ||
      !evaluation.converged ||
      !sameRulesInputs(evaluatedBuild, character.build)
    )
      return;
    const binding = character.profileBinding;
    const key = `${character.id}\0${character.updatedAt}\0${binding?.packId}\0${binding?.contentDigest}`;
    if (written.current === key) return;
    return whenIdle(() => {
      written.current = key;
      try {
        const summary = stampedLibrarySummary(
          character,
          libraryCharacterSummary(evaluation, entities),
        );
        if (summary !== undefined)
          void characters
            .putLibrarySummary(character.id, summary)
            .catch(() => undefined);
      } catch {
        // The library evaluates the character itself when it has no summary.
      }
    }, SUMMARY_SETTLE_MS);
  }, [character, characters, entities, evaluatedBuild, evaluation, saved]);
}
