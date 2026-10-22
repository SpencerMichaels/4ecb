import { useEffect, useRef, useState } from "react";

import {
  CharacterRepository,
  type CharacterLibraryEntry,
  type CharacterLibrarySummary,
} from "@4ecb/browser-storage";

import { freshLibrarySummary } from "./library-summary";
import {
  LibrarySummaryLoader,
  type LibrarySummaryCharacters,
  type LibrarySummaryWorker,
} from "./library-summary-loader";
import { RulesWorkerClient } from "./rules-client";

/** The selected character's role line, the one part of the detail pane
 *  that waits on evaluation. Ready without a roleLine when its classes
 *  have none. */
export type LibraryRoleLine =
  | { readonly status: "ready"; readonly roleLine?: string }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string };

type Outcome =
  | { readonly summary: CharacterLibrarySummary }
  | { readonly updatedAt: string; readonly message: string };

/** How long a row must stay selected before it is evaluated, so arrowing
 *  through the table doesn't queue every row on the way. */
const SELECTION_SETTLE_MS = 200;

/**
 * The selected character's library summary: the saved one when it is
 * fresh, otherwise evaluated off the main thread (LibrarySummaryLoader) and
 * backfilled. Nothing else waits on it: the pane holds the role line's
 * place until it arrives. Results for rows the user has moved past are kept, so going
 * back to one shows it at once. The worker stops when the page unmounts.
 */
export function useLibrarySummary(
  character: CharacterLibraryEntry | undefined,
  options: {
    readonly createWorker?: () => LibrarySummaryWorker;
    readonly characters?: LibrarySummaryCharacters;
  } = {},
): LibraryRoleLine | undefined {
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, Outcome>>(
    new Map(),
  );
  const loader = useRef<LibrarySummaryLoader | undefined>(undefined);
  const optionsRef = useRef(options);
  useEffect(() => {
    const created = new LibrarySummaryLoader(
      optionsRef.current.createWorker ?? (() => new RulesWorkerClient()),
      optionsRef.current.characters ?? new CharacterRepository(),
    );
    loader.current = created;
    return () => {
      created.dispose();
      if (loader.current === created) loader.current = undefined;
    };
  }, []);

  const roleLine = libraryRoleLine(character, outcomes);
  const id = character?.id;
  const updatedAt = character?.updatedAt;
  const needsEvaluation = roleLine?.status === "loading";
  useEffect(() => {
    if (!needsEvaluation || id === undefined || updatedAt === undefined) return;
    const current = loader.current;
    if (current === undefined) return;
    let settled = false;
    const record = (outcome: Outcome) =>
      setOutcomes((previous) => new Map(previous).set(id, outcome));
    const timer = window.setTimeout(() => {
      settled = true;
      // Not cancelled by a later selection: the result still backfills.
      current
        .load(id)
        .then((summary) => {
          if (summary !== undefined) record({ summary });
        })
        .catch((reason: unknown) =>
          record({
            updatedAt,
            message: reason instanceof Error ? reason.message : String(reason),
          }),
        );
    }, SELECTION_SETTLE_MS);
    return () => {
      if (!settled) window.clearTimeout(timer);
    };
  }, [id, needsEvaluation, updatedAt]);
  return roleLine;
}

const ready = ({ roleLine }: { readonly roleLine?: string }) =>
  ({
    status: "ready",
    ...(roleLine === undefined ? {} : { roleLine }),
  }) as const;

/** The pane's role-line state for a library entry, from its saved summary
 *  or a result the library computed since it loaded. */
export function libraryRoleLine(
  character: CharacterLibraryEntry | undefined,
  outcomes: ReadonlyMap<string, Outcome>,
): LibraryRoleLine | undefined {
  if (character === undefined) return undefined;
  const saved = freshLibrarySummary(character);
  if (saved !== undefined) return ready(saved);
  const outcome = outcomes.get(character.id);
  if (outcome !== undefined && "summary" in outcome) {
    // Computed from this revision just now: shown even if the entry's
    // content stamp lags behind, so the pane never waits forever.
    const { summary } = outcome;
    const computed =
      summary.updatedAt === character.updatedAt
        ? freshLibrarySummary(
            {
              updatedAt: summary.updatedAt,
              contentRevision: {
                packId: summary.packId,
                contentDigest: summary.contentDigest,
              },
            },
            summary,
          )
        : undefined;
    if (computed !== undefined) return ready(computed);
  } else if (outcome?.updatedAt === character.updatedAt)
    return { status: "error", message: outcome.message };
  return { status: "loading" };
}
