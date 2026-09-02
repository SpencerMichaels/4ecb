import { describe, expect, it, vi } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";

import { OptimisticBuildSaveQueue } from "./optimistic-save";

function build(level: number): CharacterBuild {
  return {
    formatVersion: 1,
    effectiveLevel: level,
    levels: [],
    grabbag: [],
    inventory: [],
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("OptimisticBuildSaveQueue", () => {
  it("serializes rapid optimistic inputs without dropping them", async () => {
    const first = deferred<CharacterBuild>();
    const second = deferred<CharacterBuild>();
    const persist = vi
      .fn<(value: CharacterBuild) => Promise<CharacterBuild>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const saving: number[] = [];
    const commits: number[] = [];
    const saved = vi.fn();
    const queue = new OptimisticBuildSaveQueue(
      build(1),
      persist,
      (value) => value,
      {
        onSaving: (count) => saving.push(count),
        onCommit: (value) => commits.push(value.effectiveLevel),
        onSaved: saved,
        onFailure: vi.fn(),
      },
    );

    queue.enqueue(build(2), "first saved");
    queue.enqueue(build(3), "second saved");
    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve(build(2));
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls.map(([value]) => value.effectiveLevel)).toEqual([
      2, 3,
    ]);
    second.resolve(build(3));
    await queue.whenIdle();

    expect(commits).toEqual([2, 3]);
    expect(saving).toContain(2);
    expect(saved).toHaveBeenCalledWith("second saved");
  });

  it("rolls a failed pending suffix back to the last durable build", async () => {
    const first = deferred<CharacterBuild>();
    const second = deferred<CharacterBuild>();
    const rollback = vi.fn();
    const queue = new OptimisticBuildSaveQueue(
      build(1),
      vi
        .fn<(value: CharacterBuild) => Promise<CharacterBuild>>()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
      (value) => value,
      {
        onSaving: vi.fn(),
        onCommit: vi.fn(),
        onSaved: vi.fn(),
        onFailure: rollback,
      },
    );

    queue.enqueue(build(2), "first saved");
    queue.enqueue(build(3), "second saved");
    first.resolve(build(2));
    await Promise.resolve();
    second.reject(new Error("quota exceeded"));
    await queue.whenIdle();

    expect(rollback).toHaveBeenCalledTimes(1);
    const [, durable, count] = rollback.mock.calls[0]!;
    expect(durable.effectiveLevel).toBe(2);
    expect(count).toBe(1);
  });
});
