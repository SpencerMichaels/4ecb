import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { isItemEntity } from "./EntityCard";
import { canonicalItemIcon, itemCategoryIcon } from "./item-icons";
import { entityTypeIcon } from "./visual-language";

function entity(
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id: `${type}-fixture`,
    name: "Fixture",
    type,
    source: "Test",
    sources: ["Test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      ordinal,
      extraAttributes: [],
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

/** The leading icon a builder row or card shows (`EntityCardLeadingIcon`). */
const leadingIcon = (value: ContentEntity) =>
  isItemEntity(value) ? canonicalItemIcon(value) : entityTypeIcon(value.type);

describe("item icons", () => {
  it("routes a superior implement through its implement group", () => {
    const icon = (group: string) =>
      canonicalItemIcon(entity("Superior Implement", { Group: group }));
    expect(icon("Holy Symbol")).toBe("church");
    expect(icon("Orb")).toBe("orbit");
    for (const group of ["Rod", "Staff", "Totem", "Wand"])
      expect(icon(group), group).toBe("wand-sparkles");
    expect(icon("Tome")).toBe("book-marked");
    expect(icon("Ki Focus")).toBe("focus");
    expect(icon("Light Blade")).toBe("sword");
    // Print cards and scratchpad rows read the same field.
    expect(
      itemCategoryIcon({ type: "Superior Implement", implementGroup: "Orb" }),
    ).toBe("orbit");
  });

  it("shows a mount as the companion paw print, other gear as gear", () => {
    expect(
      canonicalItemIcon(entity("Gear", { "Gear Category": "Mount" })),
    ).toBe("paw-print");
    expect(canonicalItemIcon(entity("Gear", { Category: "Mount" }))).toBe(
      "paw-print",
    );
    expect(
      canonicalItemIcon(entity("Gear", { "Gear Category": "Lodging" })),
    ).toBe("item");
  });

  it("gives wondrous and uncategorized magic items the amphora", () => {
    for (const kind of ["Wondrous Item", "Special", "Any", ""])
      expect(
        canonicalItemIcon(entity("Magic Item", { "Magic Item Type": kind })),
        kind,
      ).toBe("amphora");
    expect(canonicalItemIcon(entity("Magic Item"))).toBe("amphora");
  });

  it("gives every player-visible type a specific icon", () => {
    const visible = [
      entity("Class"),
      entity("Hybrid Class"),
      entity("Class Feature"),
      entity("Trait Package"),
      entity("Race"),
      entity("Racial Trait"),
      entity("CountsAsRace"),
      entity("Background"),
      entity("Theme"),
      entity("Paragon Path"),
      entity("Epic Destiny"),
      entity("Feat"),
      entity("Deity"),
      entity("Domain"),
      entity("God Fragment"),
      entity("Companion"),
      entity("Familiar"),
      entity("Associate"),
      entity("Proficiency"),
      entity("Language"),
      entity("Build"),
      entity("Skill"),
      entity("Weapon"),
      entity("Armor", { "Armor Type": "Chainmail" }),
      entity("Armor", { "Armor Type": "Heavy Shield" }),
      entity("Gear", { "Gear Category": "Mount" }),
      entity("Gear", { "Gear Category": "Ammunition" }),
      entity("Gear"),
      entity("Item Set"),
      entity("Ritual"),
      entity("Ritual Scroll"),
      entity("Superior Implement", { Group: "Staff" }),
      entity("Magic Item", { "Magic Item Type": "Wondrous Item" }),
      entity("Magic Item", { "Magic Item Type": "Neck" }),
    ];
    for (const value of visible) {
      const icon = leadingIcon(value);
      expect(icon, value.type).not.toBe("content");
      // Sparkles is the Feat glyph; nothing else borrows it.
      if (value.type !== "Feat") expect(icon, value.type).not.toBe("feat");
      // Nothing class-related (or anything else here) uses the Shield
      // `class` icon.
      expect(icon, value.type).not.toBe("class");
    }
  });
});
