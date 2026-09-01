import { describe, expect, it } from "vitest";

import { pwaMessage } from "./pwa-state";

describe("PWA status priority", () => {
  it("keeps an available update visible even while offline", () => {
    expect(
      pwaMessage({ needRefresh: true, offlineReady: true, online: false }),
    ).toBe("update-available");
  });

  it("reports offline and first-install readiness without ambiguity", () => {
    expect(
      pwaMessage({ needRefresh: false, offlineReady: true, online: false }),
    ).toBe("offline");
    expect(
      pwaMessage({ needRefresh: false, offlineReady: true, online: true }),
    ).toBe("offline-ready");
  });
});
