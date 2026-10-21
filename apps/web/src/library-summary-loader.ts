import type {
  CharacterLibrarySummary,
  CharacterRepository,
} from "@4ecb/browser-storage";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";

import {
  stampedLibrarySummary,
  type LibrarySummaryValue,
} from "./library-summary";

/** The part of RulesWorkerClient the loader uses. */
export interface LibrarySummaryWorker {
  initialize(packId: string, contentDigest?: string): Promise<void>;
  librarySummary(
    snapshot: LegacyCharacterSnapshot,
    build: CharacterBuild,
  ): Promise<LibrarySummaryValue>;
  terminate(reason?: string): void;
}

export type LibrarySummaryCharacters = Pick<
  CharacterRepository,
  "get" | "putLibrarySummary"
>;

interface Waiting {
  readonly id: string;
  readonly resolve: (summary: CharacterLibrarySummary | undefined) => void;
  readonly reject: (reason: unknown) => void;
}

/**
 * Evaluates characters that have no fresh library summary, one at a time in
 * a single rules worker (created on first use, re-initialized when the next
 * character is pinned to other content), and saves each result as the
 * character's summary. Only the latest request waits behind the running one:
 * arrowing through rows evaluates the row being left (it still backfills)
 * and then the row the user stopped on, never every row in between.
 */
export class LibrarySummaryLoader {
  readonly #createWorker: () => LibrarySummaryWorker;
  readonly #characters: LibrarySummaryCharacters;
  #worker: LibrarySummaryWorker | undefined;
  #profile: string | undefined;
  #running:
    | {
        readonly id: string;
        readonly result: Promise<CharacterLibrarySummary | undefined>;
      }
    | undefined;
  #waiting: Waiting | undefined;
  #disposed = false;

  constructor(
    createWorker: () => LibrarySummaryWorker,
    characters: LibrarySummaryCharacters,
  ) {
    this.#createWorker = createWorker;
    this.#characters = characters;
  }

  /** The character's freshly computed (and saved) summary; undefined when a
   *  newer request replaced this one before it started, or after dispose. */
  load(id: string): Promise<CharacterLibrarySummary | undefined> {
    if (this.#disposed) return Promise.resolve(undefined);
    if (this.#running?.id === id) return this.#running.result;
    if (this.#waiting?.id !== id) this.#waiting?.resolve(undefined);
    return new Promise((resolve, reject) => {
      this.#waiting = { id, resolve, reject };
      if (this.#running === undefined) void this.#drain();
    });
  }

  /** Stops the worker; anything pending settles without a summary. */
  dispose(): void {
    this.#disposed = true;
    this.#waiting?.resolve(undefined);
    this.#waiting = undefined;
    this.#worker?.terminate("Character library closed");
    this.#worker = undefined;
  }

  async #drain(): Promise<void> {
    while (this.#waiting !== undefined && !this.#disposed) {
      const { id, resolve, reject } = this.#waiting;
      this.#waiting = undefined;
      const result = this.#summarize(id);
      this.#running = { id, result };
      try {
        resolve(await result);
      } catch (reason: unknown) {
        // Terminating the worker on dispose rejects what it was doing.
        if (this.#disposed) resolve(undefined);
        else reject(reason);
      } finally {
        this.#running = undefined;
      }
    }
  }

  async #summarize(id: string): Promise<CharacterLibrarySummary | undefined> {
    const character = await this.#characters.get(id);
    if (character === undefined) throw new Error("Character not found");
    const binding = character.profileBinding;
    if (binding?.contentDigest === undefined)
      throw new Error(
        "This character isn't pinned to an exact content revision.",
      );
    if (this.#disposed) return undefined;
    const worker = (this.#worker ??= this.#createWorker());
    const profile = `${binding.packId}\0${binding.contentDigest}`;
    if (this.#profile !== profile) {
      this.#profile = undefined;
      await worker.initialize(binding.packId, binding.contentDigest);
      this.#profile = profile;
    }
    const summary = stampedLibrarySummary(
      character,
      await worker.librarySummary(character.snapshot, character.build),
    );
    if (summary === undefined) return undefined;
    // A failed save only loses the cache; the summary is still shown.
    await this.#characters
      .putLibrarySummary(id, summary)
      .catch(() => undefined);
    return summary;
  }
}
