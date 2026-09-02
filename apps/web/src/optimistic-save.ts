import type { CharacterBuild } from "@4ecb/character-domain";

export interface OptimisticSaveCallbacks<Result> {
  readonly onSaving: (pendingCount: number) => void;
  readonly onCommit: (result: Result) => void;
  readonly onSaved: (message: string) => void;
  readonly onFailure: (
    error: unknown,
    lastPersistedBuild: CharacterBuild,
    rolledBackCount: number,
  ) => void;
}

interface SaveRequest {
  readonly build: CharacterBuild;
  readonly savedMessage: string;
}

/**
 * Serializes IndexedDB writes while callers continue to update their in-memory
 * transaction optimistically. A failed write rejects the complete pending
 * suffix so the UI can return to the last build known to be durable.
 */
export class OptimisticBuildSaveQueue<Result> {
  readonly #persist: (build: CharacterBuild) => Promise<Result>;
  readonly #resultBuild: (result: Result) => CharacterBuild;
  readonly #callbacks: OptimisticSaveCallbacks<Result>;
  readonly #pending: SaveRequest[] = [];
  #lastPersistedBuild: CharacterBuild;
  #draining: Promise<void> | undefined;

  constructor(
    initialBuild: CharacterBuild,
    persist: (build: CharacterBuild) => Promise<Result>,
    resultBuild: (result: Result) => CharacterBuild,
    callbacks: OptimisticSaveCallbacks<Result>,
  ) {
    this.#lastPersistedBuild = initialBuild;
    this.#persist = persist;
    this.#resultBuild = resultBuild;
    this.#callbacks = callbacks;
  }

  enqueue(build: CharacterBuild, savedMessage: string): void {
    this.#pending.push({ build, savedMessage });
    this.#callbacks.onSaving(this.#pending.length);
    this.#startDrain();
  }

  async whenIdle(): Promise<void> {
    while (this.#draining !== undefined) await this.#draining;
  }

  #startDrain(): void {
    if (this.#draining !== undefined) return;
    this.#draining = this.#drain().finally(() => {
      this.#draining = undefined;
      if (this.#pending.length > 0) this.#startDrain();
    });
  }

  async #drain(): Promise<void> {
    while (this.#pending.length > 0) {
      const request = this.#pending[0]!;
      try {
        const result = await this.#persist(request.build);
        this.#lastPersistedBuild = this.#resultBuild(result);
        this.#pending.shift();
        this.#callbacks.onCommit(result);
        if (this.#pending.length === 0)
          this.#callbacks.onSaved(request.savedMessage);
        else this.#callbacks.onSaving(this.#pending.length);
      } catch (error: unknown) {
        const rolledBackCount = this.#pending.length;
        this.#pending.splice(0);
        this.#callbacks.onFailure(
          error,
          this.#lastPersistedBuild,
          rolledBackCount,
        );
      }
    }
  }
}
