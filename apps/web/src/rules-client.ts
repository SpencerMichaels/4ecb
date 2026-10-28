import type { CharacterBuild } from "@4ecb/character-domain";
import type {
  EvaluatedCharacter,
  EvaluationInput,
  ProfileMigrationPreview,
} from "@4ecb/rules-engine";

import type {
  ProfileMigrationPreviewProgress,
  RulesWorkerRequest,
  RulesWorkerResponse,
} from "./rules-worker-messages";
import type { LibrarySummaryValue } from "./library-summary";
import { recordLoadDuration } from "./load-performance";

/** Work items done across every evaluation currently in flight. */
export interface EvaluationProgress {
  readonly completed: number;
  readonly total: number;
}

export interface RulesContentProgress extends EvaluationProgress {
  readonly ready: boolean;
}

/** Worker state for loading screens: its content load and evaluation batch. */
export interface RulesProgress {
  readonly content: RulesContentProgress | undefined;
  readonly evaluation: EvaluationProgress | undefined;
}

export type RulesProgressListener = (progress: RulesProgress) => void;

/** How an evaluation whose caller stopped waiting for it rejects. */
export function evaluationAbortedError(): DOMException {
  return new DOMException("Rules evaluation was superseded", "AbortError");
}

interface PendingRequest {
  readonly resolve: (response: RulesWorkerResponse) => void;
  readonly reject: (reason: Error) => void;
}

type RequestWithoutId =
  | Omit<Extract<RulesWorkerRequest, { type: "initialize" }>, "requestId">
  | Omit<Extract<RulesWorkerRequest, { type: "evaluate" }>, "requestId">
  | Omit<Extract<RulesWorkerRequest, { type: "library-summary" }>, "requestId">
  | Omit<
      Extract<RulesWorkerRequest, { type: "preview-profile-migration" }>,
      "requestId"
    >;

export class RulesWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #migrationProgress = new Map<
    number,
    (progress: ProfileMigrationPreviewProgress) => void
  >();
  #nextRequestId = 1;
  // Evaluations since the worker was last idle, so back-to-back requests
  // read as one batch instead of restarting at 0%.
  readonly #batch = new Map<number, EvaluationProgress>();
  #content: RulesContentProgress | undefined;
  readonly #progressListeners = new Set<RulesProgressListener>();

  constructor() {
    this.#worker = new Worker(new URL("./rules.worker.ts", import.meta.url), {
      type: "module",
    });
    this.#worker.onmessage = (event: MessageEvent<RulesWorkerResponse>) => {
      const response = event.data;
      if (response.type === "content-progress") {
        this.#content = {
          completed: response.completed,
          total: response.total,
          ready: response.ready,
        };
        this.#notifyProgress();
        return;
      }
      if (response.type === "evaluation-progress") {
        if (!this.#batch.has(response.requestId)) return;
        this.#batch.set(response.requestId, {
          completed: response.completed,
          total: response.total,
        });
        this.#notifyProgress();
        return;
      }
      if (response.type === "profile-migration-progress") {
        this.#migrationProgress.get(response.requestId)?.(response.progress);
        return;
      }
      this.#migrationProgress.delete(response.requestId);
      const pending = this.#pending.get(response.requestId);
      if (pending === undefined) return;
      this.#pending.delete(response.requestId);
      this.#finishBatchEntry(response.requestId);
      if (response.type === "error")
        pending.reject(new Error(response.message));
      else pending.resolve(response);
    };
    this.#worker.onerror = (event) => {
      this.#rejectAll(new Error(event.message || "Rules worker failed"));
    };
  }

  async initialize(packId: string, contentDigest?: string): Promise<void> {
    const response = await this.#request({
      type: "initialize",
      packId,
      ...(contentDigest === undefined ? {} : { contentDigest }),
    });
    if (response.type !== "initialized")
      throw new Error("Unexpected rules-worker initialization response");
  }

  /** Aborting `signal` rejects at once and drops the request from the
   *  worker's queue if it hasn't started. */
  async evaluate(
    input: EvaluationInput,
    signal?: AbortSignal,
  ): Promise<EvaluatedCharacter> {
    if (signal?.aborted === true) throw evaluationAbortedError();
    const startedAt = performance.now();
    const requestId = this.#nextRequestId;
    // Same unit count the engine reports: one per earlier level, plus the
    // final pass. Queued requests count before the worker reaches them.
    this.#batch.set(requestId, {
      completed: 0,
      total: Math.max(1, input.level),
    });
    this.#notifyProgress();
    const cancel = () => {
      const pending = this.#pending.get(requestId);
      if (pending === undefined) return;
      this.#pending.delete(requestId);
      this.#batch.delete(requestId);
      this.#finishBatch();
      this.#worker.postMessage({ type: "cancel", requestId });
      pending.reject(evaluationAbortedError());
    };
    signal?.addEventListener("abort", cancel, { once: true });
    let response: RulesWorkerResponse;
    try {
      response = await this.#request({ type: "evaluate", input });
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    if (response.type !== "evaluation")
      throw new Error("Unexpected rules-worker evaluation response");
    recordLoadDuration("rules-worker-round-trip", startedAt, {
      level: input.level,
      workerMilliseconds: response.elapsedMilliseconds,
      contentLoadMilliseconds: response.contentLoadMilliseconds,
      evaluationMilliseconds: response.evaluationMilliseconds,
    });
    return response.result;
  }

  /** Evaluates a character in the worker and returns its library summary
   *  (its role line). */
  async librarySummary(build: CharacterBuild): Promise<LibrarySummaryValue> {
    const response = await this.#request({ type: "library-summary", build });
    if (response.type !== "library-summary")
      throw new Error("Unexpected rules-worker library summary response");
    return response.result;
  }

  async previewProfileMigration(
    build: CharacterBuild,
    targetPackId: string,
    sourcePackId?: string,
    sourceContentDigest?: string,
    onProgress?: (progress: ProfileMigrationPreviewProgress) => void,
  ): Promise<ProfileMigrationPreview> {
    if (onProgress !== undefined)
      this.#migrationProgress.set(this.#nextRequestId, onProgress);
    const response = await this.#request({
      type: "preview-profile-migration",
      build,
      targetPackId,
      ...(sourcePackId === undefined ? {} : { sourcePackId }),
      ...(sourceContentDigest === undefined ? {} : { sourceContentDigest }),
    });
    if (response.type !== "profile-migration-preview")
      throw new Error("Unexpected profile-migration response");
    return response.result;
  }

  subscribeProgress(listener: RulesProgressListener): () => void {
    this.#progressListeners.add(listener);
    listener(this.#progress());
    return () => this.#progressListeners.delete(listener);
  }

  #progress(): RulesProgress {
    return {
      content: this.#content,
      evaluation: this.#batch.size === 0 ? undefined : this.#batchProgress(),
    };
  }

  #batchProgress(): EvaluationProgress {
    let completed = 0;
    let total = 0;
    for (const entry of this.#batch.values()) {
      completed += entry.completed;
      total += entry.total;
    }
    return { completed, total };
  }

  #notifyProgress(): void {
    const progress = this.#progress();
    for (const listener of this.#progressListeners) listener(progress);
  }

  #finishBatchEntry(requestId: number): void {
    const entry = this.#batch.get(requestId);
    if (entry === undefined) return;
    this.#batch.set(requestId, { completed: entry.total, total: entry.total });
    this.#finishBatch();
  }

  #finishBatch(): void {
    this.#notifyProgress();
    if ([...this.#batch.keys()].every((id) => !this.#pending.has(id)))
      this.#batch.clear();
  }

  terminate(reason = "Rules evaluation cancelled"): void {
    this.#worker.terminate();
    this.#rejectAll(new Error(reason));
  }

  #request(request: RequestWithoutId): Promise<RulesWorkerResponse> {
    const requestId = this.#nextRequestId;
    this.#nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      this.#worker.postMessage({ ...request, requestId });
    });
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#migrationProgress.clear();
    this.#batch.clear();
  }
}
