import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord } from "@4ecb/character-domain";

import {
  LibrarySummaryLoader,
  type LibrarySummaryCharacters,
  type LibrarySummaryWorker,
} from "./library-summary-loader";
import type { LibrarySummaryValue } from "./library-summary";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const record = (id: string, packId = "pack") =>
  ({
    id,
    updatedAt: `2026-10-21T10:00:00.000Z`,
    profileBinding: { packId, contentDigest: `${packId}-digest` },
    build: { id },
  }) as unknown as CharacterRecord;

function fixture() {
  const evaluations: {
    readonly id: string;
    readonly result: ReturnType<typeof deferred<LibrarySummaryValue>>;
  }[] = [];
  const worker = {
    initialize: vi.fn(() => Promise.resolve()),
    librarySummary: vi.fn((build: { id: string }) => {
      const result = deferred<LibrarySummaryValue>();
      evaluations.push({ id: build.id, result });
      return result.promise;
    }),
    terminate: vi.fn(),
  };
  const characters = {
    get: vi.fn((id: string) =>
      Promise.resolve(
        id === "unbound"
          ? ({
              ...record(id),
              profileBinding: undefined,
            } as unknown as CharacterRecord)
          : record(id, id === "other-content" ? "other" : "pack"),
      ),
    ),
    putLibrarySummary: vi.fn(() => Promise.resolve(true)),
  };
  const createWorker = vi.fn(() => worker as unknown as LibrarySummaryWorker);
  const loader = new LibrarySummaryLoader(
    createWorker,
    characters as unknown as LibrarySummaryCharacters,
  );
  return { loader, worker, characters, createWorker, evaluations };
}

const value = (roleLine: string): LibrarySummaryValue => ({ roleLine });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("library summary loader", () => {
  it("evaluates one character at a time, skipping rows passed over", async () => {
    const { loader, worker, characters, createWorker, evaluations } = fixture();
    const first = loader.load("a");
    await settle();
    const skipped = loader.load("b");
    const last = loader.load("c");
    // Asking again for the running one shares its result.
    const again = loader.load("a");
    await expect(skipped).resolves.toBeUndefined();
    expect(evaluations.map(({ id }) => id)).toEqual(["a"]);

    evaluations[0]!.result.resolve(value("Divine Defender"));
    await expect(first).resolves.toMatchObject({
      updatedAt: "2026-10-21T10:00:00.000Z",
      packId: "pack",
      contentDigest: "pack-digest",
      value: value("Divine Defender"),
    });
    await expect(again).resolves.toEqual(await first);
    // The row the user moved past still backfills its summary.
    expect(characters.putLibrarySummary).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ value: value("Divine Defender") }),
    );
    await settle();
    expect(evaluations.map(({ id }) => id)).toEqual(["a", "c"]);
    evaluations[1]!.result.resolve(value("Martial Striker"));
    await expect(last).resolves.toMatchObject({
      value: value("Martial Striker"),
    });
    // One worker, initialized once for the shared content.
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.initialize).toHaveBeenCalledTimes(1);
    expect(worker.initialize).toHaveBeenCalledWith("pack", "pack-digest");
  });

  it("re-initializes for other content and reports failures", async () => {
    const { loader, worker, evaluations } = fixture();
    const first = loader.load("a");
    await settle();
    evaluations[0]!.result.resolve(value("Divine Defender"));
    await first;
    const other = loader.load("other-content");
    await settle();
    expect(worker.initialize).toHaveBeenLastCalledWith("other", "other-digest");
    evaluations[1]!.result.reject(new Error("Pack missing"));
    await expect(other).rejects.toThrow("Pack missing");
    await expect(loader.load("unbound")).rejects.toThrow(
      "isn't pinned to an exact content revision",
    );
  });

  it("terminates the worker on dispose and settles what was pending", async () => {
    const { loader, worker } = fixture();
    const running = loader.load("a");
    await settle();
    const waiting = loader.load("b");
    loader.dispose();
    expect(worker.terminate).toHaveBeenCalled();
    await expect(waiting).resolves.toBeUndefined();
    await expect(loader.load("c")).resolves.toBeUndefined();
    void running;
  });
});
