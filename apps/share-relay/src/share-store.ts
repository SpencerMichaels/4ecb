/**
 * The share relay's in-memory store: a sharer's opaque payload under a random
 * 6-digit code, handed to the first receiver who asks for it and then
 * forgotten. Nothing here touches the disk or logs a payload or code. The
 * clock and random source are injected so tests drive expiry and code
 * collisions deterministically.
 */

import { randomInt } from "node:crypto";

export interface ShareLimits {
  /** How long a code stays valid. */
  readonly ttlMs: number;
  /** The largest payload accepted, in bytes. */
  readonly maxPayloadBytes: number;
  /** Active shares one client address may hold at once. */
  readonly maxSharesPerIp: number;
  /** Active shares across all clients. */
  readonly maxShares: number;
  /** Bytes held across all active shares. */
  readonly maxTotalBytes: number;
  /** Wrong-code lookups one client address may make per minute. */
  readonly maxFailedLookupsPerMinute: number;
}

export const DEFAULT_SHARE_LIMITS: ShareLimits = {
  ttlMs: 10 * 60 * 1000,
  maxPayloadBytes: 8 * 1024 * 1024,
  maxSharesPerIp: 5,
  maxShares: 100,
  maxTotalBytes: 256 * 1024 * 1024,
  maxFailedLookupsPerMinute: 10,
};

export interface ShareStoreOptions {
  readonly limits?: Partial<ShareLimits>;
  /** Milliseconds since the epoch. */
  readonly now?: () => number;
  /** A uniformly random integer in [0, max); crypto's by default. */
  readonly randomInt?: (max: number) => number;
}

export type CreateShareResult =
  | { readonly ok: true; readonly code: string; readonly expiresAt: number }
  | {
      readonly ok: false;
      readonly error: "too-large" | "ip-limit" | "server-full";
    };

export type TakeShareResult =
  | { readonly ok: true; readonly payload: Uint8Array }
  | {
      readonly ok: false;
      readonly error: "not-found" | "too-many-attempts" | "malformed-code";
    };

interface StoredShare {
  readonly payload: Uint8Array;
  readonly ip: string;
  readonly expiresAt: number;
}

const CODE_PATTERN = /^\d{6}$/;
const CODE_SPACE = 1_000_000;
const FAILED_LOOKUP_WINDOW_MS = 60 * 1000;

export function isShareCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

export class ShareStore {
  readonly limits: ShareLimits;
  readonly #now: () => number;
  readonly #randomInt: (max: number) => number;
  readonly #shares = new Map<string, StoredShare>();
  readonly #sharesPerIp = new Map<string, number>();
  /** Timestamps of each address's recent wrong-code lookups, oldest first. */
  readonly #failedLookups = new Map<string, number[]>();
  #totalBytes = 0;

  constructor(options: ShareStoreOptions = {}) {
    this.limits = { ...DEFAULT_SHARE_LIMITS, ...options.limits };
    this.#now = options.now ?? Date.now;
    this.#randomInt = options.randomInt ?? ((max) => randomInt(max));
  }

  get activeShares(): number {
    return this.#shares.size;
  }

  get totalBytes(): number {
    return this.#totalBytes;
  }

  activeSharesFor(ip: string): number {
    return this.#sharesPerIp.get(ip) ?? 0;
  }

  create(ip: string, payload: Uint8Array): CreateShareResult {
    this.sweep();
    if (payload.byteLength > this.limits.maxPayloadBytes)
      return { ok: false, error: "too-large" };
    if (this.activeSharesFor(ip) >= this.limits.maxSharesPerIp)
      return { ok: false, error: "ip-limit" };
    if (
      this.#shares.size >= this.limits.maxShares ||
      this.#totalBytes + payload.byteLength > this.limits.maxTotalBytes
    )
      return { ok: false, error: "server-full" };

    const code = this.#freshCode();
    if (code === undefined) return { ok: false, error: "server-full" };
    const expiresAt = this.#now() + this.limits.ttlMs;
    this.#shares.set(code, { payload, ip, expiresAt });
    this.#sharesPerIp.set(ip, this.activeSharesFor(ip) + 1);
    this.#totalBytes += payload.byteLength;
    return { ok: true, code, expiresAt };
  }

  /** The payload under `code`, removed so no one can take it again. */
  take(ip: string, code: string): TakeShareResult {
    this.sweep();
    if (!isShareCode(code)) return { ok: false, error: "malformed-code" };
    const attempts = this.#failedLookups.get(ip);
    if (
      attempts !== undefined &&
      attempts.length >= this.limits.maxFailedLookupsPerMinute
    )
      return { ok: false, error: "too-many-attempts" };
    const share = this.#shares.get(code);
    if (share === undefined) {
      this.#recordFailedLookup(ip);
      return { ok: false, error: "not-found" };
    }
    this.#remove(code, share);
    return { ok: true, payload: share.payload };
  }

  /** Forgets expired shares and lapsed failed-lookup records. Every
   *  operation sweeps first, so an expired code is never served; the server
   *  also sweeps on a timer to release memory when no one calls. */
  sweep(): void {
    const now = this.#now();
    for (const [code, share] of this.#shares)
      if (share.expiresAt <= now) this.#remove(code, share);
    for (const [ip, attempts] of this.#failedLookups) {
      const firstLive = attempts.findIndex(
        (at) => at > now - FAILED_LOOKUP_WINDOW_MS,
      );
      if (firstLive < 0) this.#failedLookups.delete(ip);
      else if (firstLive > 0) attempts.splice(0, firstLive);
    }
  }

  #remove(code: string, share: StoredShare): void {
    this.#shares.delete(code);
    this.#totalBytes -= share.payload.byteLength;
    const remaining = this.activeSharesFor(share.ip) - 1;
    if (remaining > 0) this.#sharesPerIp.set(share.ip, remaining);
    else this.#sharesPerIp.delete(share.ip);
  }

  #recordFailedLookup(ip: string): void {
    const attempts = this.#failedLookups.get(ip);
    if (attempts === undefined) this.#failedLookups.set(ip, [this.#now()]);
    else attempts.push(this.#now());
  }

  /** A random code no active share holds. With at most `maxShares` of a
   *  million codes in use a draw almost never collides; the bound only
   *  guards against a broken random source. */
  #freshCode(): string | undefined {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = String(this.#randomInt(CODE_SPACE)).padStart(6, "0");
      if (!this.#shares.has(code)) return code;
    }
    return undefined;
  }
}
