import { describe, expect, it } from "vitest";

import {
  getAttribute,
  getElementText,
  isUserFacingSpecific,
  normalizeDisplayText,
} from "./index";

describe("content-domain helpers", () => {
  it("looks attributes up case-insensitively", () => {
    expect(
      getAttribute([{ name: "Internal-ID", value: "ID_TEST" }], "internal-id"),
    ).toBe("ID_TEST");
  });

  it("collects nested text while ignoring comments", () => {
    expect(
      getElementText({
        kind: "element",
        name: "example",
        attributes: [],
        children: [
          { kind: "text", value: "before " },
          {
            kind: "element",
            name: "strong",
            attributes: [],
            children: [{ kind: "text", value: "inside" }],
          },
          { kind: "comment", value: "ignored" },
        ],
      }),
    ).toBe("before inside");
  });

  it("normalizes line endings without collapsing meaningful whitespace", () => {
    expect(normalizeDisplayText("  first\r\n second  ")).toBe("first\n second");
  });

  it("classifies internal names and machine-token values as presentation metadata", () => {
    const field = (name: string, value = "Player-facing text") => ({
      name,
      value,
      extraAttributes: [],
      ordinal: 0,
    });
    expect(isUserFacingSpecific(field("Effect"))).toBe(true);
    expect(isUserFacingSpecific(field("_REQUIRESID"))).toBe(false);
    expect(isUserFacingSpecific(field("  _SUPPORTSID"))).toBe(false);
    expect(
      isUserFacingSpecific(
        field("Class", "ID_FMP_CLASS_0, ID_FMP_CLASS_ORDER_ADEPT"),
      ),
    ).toBe(false);
    expect(
      isUserFacingSpecific(field("Category", "VALUES_FORMATTED_LIKE_THIS")),
    ).toBe(false);
    expect(isUserFacingSpecific(field("Display", "Wizard Attack 1"))).toBe(
      false,
    );
    expect(isUserFacingSpecific(field("InternalOnly", "1"))).toBe(false);
    expect(isUserFacingSpecific(field("Keywords", "Arcane, Implement"))).toBe(
      true,
    );
  });
});
