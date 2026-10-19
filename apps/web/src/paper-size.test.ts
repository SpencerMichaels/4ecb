import { describe, expect, it } from "vitest";

import { localePaperSize } from "./paper-size";

describe("paper size default", () => {
  it("follows the first locale with a region", () => {
    expect(localePaperSize(["en-US"])).toBe("letter");
    expect(localePaperSize(["en-CA", "fr-FR"])).toBe("letter");
    expect(localePaperSize(["en-GB"])).toBe("a4");
    // A bare language resolves to its likely region (French: France).
    expect(localePaperSize(["fr"])).toBe("a4");
  });

  it("falls back to Letter when nothing resolves", () => {
    expect(localePaperSize([])).toBe("letter");
    expect(localePaperSize(["not a locale!"])).toBe("letter");
  });
});
