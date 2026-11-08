/**
 * The relay's settings from the environment, with the store's conservative
 * defaults (`DEFAULT_SHARE_LIMITS`) for anything unset.
 */

import { DEFAULT_SHARE_LIMITS, type ShareLimits } from "./share-store";

export interface ShareRelayConfig {
  readonly host: string;
  readonly port: number;
  readonly limits: ShareLimits;
}

export const DEFAULT_SHARE_RELAY_PORT = 8081;

/** The environment variables read, each a positive integer. */
export const SHARE_RELAY_ENV = {
  port: "FOURECB_SHARE_PORT",
  ttlSeconds: "FOURECB_SHARE_TTL_SECONDS",
  maxPayloadBytes: "FOURECB_SHARE_MAX_PAYLOAD_BYTES",
  maxSharesPerIp: "FOURECB_SHARE_MAX_PER_IP",
  maxShares: "FOURECB_SHARE_MAX_ACTIVE",
  maxTotalBytes: "FOURECB_SHARE_MAX_TOTAL_BYTES",
  maxFailedLookupsPerMinute: "FOURECB_SHARE_MAX_FAILED_LOOKUPS_PER_MINUTE",
} as const;

export function shareRelayConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ShareRelayConfig {
  const read = (name: string, fallback: number): number => {
    const raw = env[name]?.trim();
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${name} must be a positive integer, not "${raw}"`);
    return value;
  };
  const defaults = DEFAULT_SHARE_LIMITS;
  return {
    host: "127.0.0.1",
    port: read(SHARE_RELAY_ENV.port, DEFAULT_SHARE_RELAY_PORT),
    limits: {
      ttlMs: read(SHARE_RELAY_ENV.ttlSeconds, defaults.ttlMs / 1000) * 1000,
      maxPayloadBytes: read(
        SHARE_RELAY_ENV.maxPayloadBytes,
        defaults.maxPayloadBytes,
      ),
      maxSharesPerIp: read(
        SHARE_RELAY_ENV.maxSharesPerIp,
        defaults.maxSharesPerIp,
      ),
      maxShares: read(SHARE_RELAY_ENV.maxShares, defaults.maxShares),
      maxTotalBytes: read(
        SHARE_RELAY_ENV.maxTotalBytes,
        defaults.maxTotalBytes,
      ),
      maxFailedLookupsPerMinute: read(
        SHARE_RELAY_ENV.maxFailedLookupsPerMinute,
        defaults.maxFailedLookupsPerMinute,
      ),
    },
  };
}

/** Whether a runtime-config.json document turns the feature on. */
export function characterShareEnabled(runtimeConfig: unknown): boolean {
  if (typeof runtimeConfig !== "object" || runtimeConfig === null) return false;
  const features = (runtimeConfig as { features?: unknown }).features;
  return (
    typeof features === "object" &&
    features !== null &&
    (features as { characterShare?: unknown }).characterShare === true
  );
}

/**
 * The image's nginx share locations from their template: `@SHARE_PORT@` and
 * `@SHARE_BODY_LIMIT@` (the payload limit plus room for nginx to let the
 * relay give its own 413), so both follow this one configuration.
 */
export function renderNginxShareConfig(
  template: string,
  config: ShareRelayConfig,
): string {
  return template
    .replaceAll("@SHARE_PORT@", String(config.port))
    .replaceAll(
      "@SHARE_BODY_LIMIT@",
      String(config.limits.maxPayloadBytes + 64 * 1024),
    );
}
