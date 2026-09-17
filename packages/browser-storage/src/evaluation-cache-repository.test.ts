import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { EvaluationCacheRepository } from "./evaluation-cache-repository";

function repository(maxEntries = 24): EvaluationCacheRepository {
  return new EvaluationCacheRepository(crypto.randomUUID(), maxEntries);
}

describe("EvaluationCacheRepository", () => {
  it("requires exact engine and profile revisions", async () => {
    const cache = repository();
    await cache.put("input", "engine-1", "pack\0digest-1", { level: 8 });

    await expect(
      cache.get("input", "engine-1", "pack\0digest-1"),
    ).resolves.toEqual({ level: 8 });
    await expect(
      cache.get("input", "engine-2", "pack\0digest-1"),
    ).resolves.toBeUndefined();
    await expect(
      cache.get("input", "engine-1", "pack\0digest-2"),
    ).resolves.toBeUndefined();
  });

  it("treats a changed input key as a miss", async () => {
    const cache = repository();
    await cache.put("input-a", "engine", "profile", { level: 8 });

    await expect(
      cache.get("input-b", "engine", "profile"),
    ).resolves.toBeUndefined();
  });

  it("evicts the least recently used entries", async () => {
    const cache = repository(2);
    await cache.put("first", "engine", "profile", 1);
    await cache.put("second", "engine", "profile", 2);
    await cache.get("first", "engine", "profile");
    await cache.put("third", "engine", "profile", 3);

    await expect(cache.get("first", "engine", "profile")).resolves.toBe(1);
    await expect(
      cache.get("second", "engine", "profile"),
    ).resolves.toBeUndefined();
    await expect(cache.get("third", "engine", "profile")).resolves.toBe(3);
  });
});
