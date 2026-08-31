import { describe, expect, it } from "vitest";

import { getAttribute, getElementText, normalizeDisplayText } from "./index";

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
});
