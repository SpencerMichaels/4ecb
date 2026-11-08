import { describe, expect, it } from "vitest";

import {
  characterShareEnabled,
  renderNginxShareConfig,
  shareRelayConfigFromEnv,
} from "./config";
import { DEFAULT_SHARE_LIMITS } from "./share-store";

describe("shareRelayConfigFromEnv", () => {
  it("uses the defaults when nothing is set", () => {
    expect(shareRelayConfigFromEnv({})).toEqual({
      host: "127.0.0.1",
      port: 8081,
      limits: DEFAULT_SHARE_LIMITS,
    });
  });

  it("reads every setting", () => {
    expect(
      shareRelayConfigFromEnv({
        FOURECB_SHARE_PORT: "9000",
        FOURECB_SHARE_TTL_SECONDS: "60",
        FOURECB_SHARE_MAX_PAYLOAD_BYTES: "1024",
        FOURECB_SHARE_MAX_PER_IP: "2",
        FOURECB_SHARE_MAX_ACTIVE: "3",
        FOURECB_SHARE_MAX_TOTAL_BYTES: "4096",
        FOURECB_SHARE_MAX_FAILED_LOOKUPS_PER_MINUTE: "4",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 9000,
      limits: {
        ttlMs: 60_000,
        maxPayloadBytes: 1024,
        maxSharesPerIp: 2,
        maxShares: 3,
        maxTotalBytes: 4096,
        maxFailedLookupsPerMinute: 4,
      },
    });
  });

  it("refuses a setting that is not a positive integer", () => {
    for (const value of ["0", "-1", "1.5", "ten"])
      expect(() =>
        shareRelayConfigFromEnv({ FOURECB_SHARE_MAX_PER_IP: value }),
      ).toThrow(/FOURECB_SHARE_MAX_PER_IP/);
  });
});

describe("characterShareEnabled", () => {
  it("is on only for features.characterShare === true", () => {
    expect(characterShareEnabled({ features: { characterShare: true } })).toBe(
      true,
    );
    expect(characterShareEnabled({ features: { characterShare: false } })).toBe(
      false,
    );
    expect(
      characterShareEnabled({ features: { characterShare: "true" } }),
    ).toBe(false);
    expect(characterShareEnabled({ features: {} })).toBe(false);
    expect(characterShareEnabled({})).toBe(false);
    expect(characterShareEnabled(null)).toBe(false);
  });
});

describe("renderNginxShareConfig", () => {
  it("fills the relay port and a body limit just over the payload limit", () => {
    const config = shareRelayConfigFromEnv({
      FOURECB_SHARE_PORT: "9000",
      FOURECB_SHARE_MAX_PAYLOAD_BYTES: "1000",
    });
    expect(
      renderNginxShareConfig(
        "proxy_pass http://127.0.0.1:@SHARE_PORT@; client_max_body_size @SHARE_BODY_LIMIT@; @SHARE_PORT@",
        config,
      ),
    ).toBe(
      "proxy_pass http://127.0.0.1:9000; client_max_body_size 66536; 9000",
    );
  });
});
