import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHARE_LIMITS,
  ShareStore,
  type ShareLimits,
} from "./share-store";

function harness(limits: Partial<ShareLimits> = {}, draws: number[] = []) {
  let now = Date.UTC(2026, 10, 7, 12);
  let next = 0;
  const store = new ShareStore({
    limits,
    now: () => now,
    // Scripted draws first, then a counter, so codes are predictable.
    randomInt: (max) => {
      const draw = draws.shift();
      return draw !== undefined ? draw : next++ % max;
    },
  });
  return {
    store,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

const bytes = (length: number) => new Uint8Array(length).fill(7);

function created(result: ReturnType<ShareStore["create"]>) {
  if (!result.ok) throw new Error(`expected a share, got ${result.error}`);
  return result;
}

describe("ShareStore", () => {
  it("has the conservative defaults", () => {
    expect(DEFAULT_SHARE_LIMITS).toEqual({
      ttlMs: 600_000,
      maxPayloadBytes: 8 * 1024 * 1024,
      maxSharesPerIp: 5,
      maxShares: 100,
      maxTotalBytes: 256 * 1024 * 1024,
      maxFailedLookupsPerMinute: 10,
    });
  });

  it("hands a payload to the first receiver only", () => {
    const { store, now } = harness({}, [42]);
    const payload = bytes(3);
    const share = created(store.create("10.0.0.1", payload));
    expect(share.code).toBe("000042");
    expect(share.expiresAt).toBe(now() + 600_000);
    expect(store.take("10.0.0.2", "000042")).toEqual({ ok: true, payload });
    expect(store.take("10.0.0.2", "000042")).toEqual({
      ok: false,
      error: "not-found",
    });
    expect(store.activeShares).toBe(0);
    expect(store.totalBytes).toBe(0);
  });

  it("forgets a share once its code expires", () => {
    const { store, advance } = harness({ ttlMs: 1000 });
    const { code } = created(store.create("a", bytes(10)));
    advance(999);
    expect(store.activeShares).toBe(1);
    advance(1);
    expect(store.take("b", code)).toEqual({ ok: false, error: "not-found" });
    expect(store.activeShares).toBe(0);
    expect(store.totalBytes).toBe(0);
    expect(store.activeSharesFor("a")).toBe(0);
  });

  it("releases expired shares on a sweep with no other call", () => {
    const { store, advance } = harness({ ttlMs: 1000 });
    store.create("a", bytes(10));
    advance(1000);
    store.sweep();
    expect(store.activeShares).toBe(0);
    expect(store.totalBytes).toBe(0);
  });

  it("never issues a code an active share holds", () => {
    const { store } = harness({}, [5, 5, 5, 6]);
    expect(created(store.create("a", bytes(1))).code).toBe("000005");
    expect(created(store.create("a", bytes(1))).code).toBe("000006");
  });

  it("reuses a code once its share is gone", () => {
    const { store } = harness({}, [5, 5]);
    const { code } = created(store.create("a", bytes(1)));
    store.take("b", code);
    expect(created(store.create("a", bytes(1))).code).toBe("000005");
  });

  it("refuses a payload over the size limit", () => {
    const { store } = harness({ maxPayloadBytes: 10 });
    expect(store.create("a", bytes(11))).toEqual({
      ok: false,
      error: "too-large",
    });
    expect(store.create("a", bytes(10)).ok).toBe(true);
  });

  it("limits active shares per client address, released by fetch and expiry", () => {
    const { store, advance } = harness({ maxSharesPerIp: 2, ttlMs: 1000 });
    const first = created(store.create("a", bytes(1)));
    advance(500);
    created(store.create("a", bytes(1)));
    expect(store.create("a", bytes(1))).toEqual({
      ok: false,
      error: "ip-limit",
    });
    // Another address is unaffected.
    expect(store.create("b", bytes(1)).ok).toBe(true);
    // Fetching one releases its slot.
    store.take("c", first.code);
    created(store.create("a", bytes(1)));
    expect(store.create("a", bytes(1)).ok).toBe(false);
    // Both remaining shares expire: their slots come back.
    advance(1000);
    expect(store.create("a", bytes(1)).ok).toBe(true);
    expect(store.activeSharesFor("a")).toBe(1);
  });

  it("caps active shares across all clients", () => {
    const { store } = harness({ maxShares: 2 });
    created(store.create("a", bytes(1)));
    const second = created(store.create("b", bytes(1)));
    expect(store.create("c", bytes(1))).toEqual({
      ok: false,
      error: "server-full",
    });
    store.take("d", second.code);
    expect(store.create("c", bytes(1)).ok).toBe(true);
  });

  it("caps the bytes held across all shares", () => {
    const { store } = harness({ maxTotalBytes: 25, maxPayloadBytes: 20 });
    const first = created(store.create("a", bytes(20)));
    expect(store.create("b", bytes(6))).toEqual({
      ok: false,
      error: "server-full",
    });
    expect(store.create("b", bytes(5)).ok).toBe(true);
    expect(store.totalBytes).toBe(25);
    store.take("c", first.code);
    expect(store.totalBytes).toBe(5);
    expect(store.create("b", bytes(20)).ok).toBe(true);
  });

  it("checks size, then the address limit, then server capacity", () => {
    const { store } = harness({ maxSharesPerIp: 1, maxShares: 1 });
    created(store.create("a", bytes(1)));
    expect(store.create("a", bytes(9 * 1024 * 1024))).toMatchObject({
      error: "too-large",
    });
    expect(store.create("a", bytes(1))).toMatchObject({ error: "ip-limit" });
    expect(store.create("b", bytes(1))).toMatchObject({
      error: "server-full",
    });
  });

  it("rejects a malformed code without counting it as a guess", () => {
    const { store } = harness({ maxFailedLookupsPerMinute: 1 });
    for (const code of ["12345", "1234567", "abcdef", "12 456", ""])
      expect(store.take("a", code)).toEqual({
        ok: false,
        error: "malformed-code",
      });
    expect(store.take("a", "000000")).toMatchObject({ error: "not-found" });
  });

  it("blocks an address after too many wrong codes in a minute", () => {
    const { store, advance } = harness(
      { maxFailedLookupsPerMinute: 3 },
      [999_999],
    );
    const { code } = created(store.create("sharer", bytes(1)));
    for (let guess = 0; guess < 3; guess += 1) {
      expect(store.take("guesser", `00000${guess}`)).toMatchObject({
        error: "not-found",
      });
      advance(10_000);
    }
    // Even the right code is refused while blocked.
    expect(store.take("guesser", code)).toEqual({
      ok: false,
      error: "too-many-attempts",
    });
    // Other addresses are unaffected.
    expect(store.take("other", "000001")).toMatchObject({
      error: "not-found",
    });
    // A minute after the first wrong guess, one more attempt is allowed.
    advance(30_000);
    expect(store.take("guesser", code)).toMatchObject({ ok: true });
  });

  it("does not count successful lookups against the guess limit", () => {
    const { store } = harness({ maxFailedLookupsPerMinute: 1 });
    for (let index = 0; index < 3; index += 1) {
      const { code } = created(store.create(`s${index}`, bytes(1)));
      expect(store.take("receiver", code).ok).toBe(true);
    }
  });
});
