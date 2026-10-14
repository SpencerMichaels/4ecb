import { describe, expect, it } from "vitest";

import {
  getAttribute,
  getElementText,
  isUserFacingSpecific,
  normalizeDisplayText,
  weaponPropertyText,
  type ContentEntity,
} from "./index";

describe("content-domain helpers", () => {
  it("recovers omitted numeric weapon properties only from unambiguous authored property headings", () => {
    const weapon: ContentEntity = {
      id: "SYNTHETIC_WEAPON",
      name: "Synthetic weapon",
      type: "Weapon",
      source: "test",
      sources: ["test"],
      attributes: [],
      categories: [],
      rules: [],
      description: "",
      extensions: [],
      provenance: { sourceKey: "test", sourceOrdinal: 0 },
      specifics: [
        {
          name: "Full Text",
          value:
            "Synthetic weapon\nProperties:\nBrutal 2 (Reroll low dice.)\nGroup:\nTest group",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    expect(weaponPropertyText(weapon, "High Crit, Brutal")).toBe(
      "High Crit, Brutal 2",
    );
    expect(weaponPropertyText(weapon, "Brutal 1")).toBe("Brutal 1");
    expect(
      weaponPropertyText({ ...weapon, type: "Magic Item" }, "Brutal"),
    ).toBe("Brutal");
    for (const value of [
      "Brutal 2 is mentioned only in prose.",
      "Properties:\nBrutal 1\nBrutal 2\nGroup:\nTest",
      "Properties:\nOther\nGroup:\nBrutal 3",
    ]) {
      expect(
        weaponPropertyText(
          { ...weapon, specifics: [{ ...weapon.specifics[0]!, value }] },
          "Brutal",
        ),
      ).toBe("Brutal");
    }
    expect(weapon.specifics[0]?.value).toContain("Brutal 2");
  });
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
