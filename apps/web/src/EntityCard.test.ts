import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity, SpecificField } from "@4ecb/content-domain";

import {
  EntityCardBody,
  EntityCardHeader,
  EntityCardLeadingIcon,
  groupClassSpecifics,
  isClassEntity,
  isProseSpecific,
  itemCardIcon,
  itemCardLabel,
  powerCardLabel,
} from "./EntityCard";

function field(name: string, value: string, ordinal: number): SpecificField {
  return { name, value, ordinal, extraAttributes: [] };
}

function entity(
  type: string,
  specifics: readonly SpecificField[],
): ContentEntity {
  return {
    id: `${type}-fixture`,
    name: "Ardent",
    type,
    source: "Player's Handbook Test",
    sources: ["Player's Handbook Test"],
    attributes: [],
    categories: [],
    specifics,
    rules: [],
    description: "Class description.",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const classFields = [
  field("Role", "Leader. You aid your allies.", 0),
  field("Power Source", "Psionic. Your will shapes battle.", 1),
  field("Key Abilities", "Charisma, Constitution, Wisdom", 2),
  field("Hit Points at 1st Level", "12 + Constitution score", 3),
  field("Implements", "Any weapon you wield", 4),
  field("Implement", "Holy symbols", 5),
  field("Class Features", "Ardent Mantle", 6),
  field("Creating", "Choose a mantle.", 7),
  field("Uncatalogued Legacy Field", "Preserved fallback", 8),
  field("Class Features", "Psionic Augmentation", 9),
] as const;

describe("shared entity-card class details", () => {
  it("groups every authored field exactly once and retains duplicates in order", () => {
    const groups = groupClassSpecifics(classFields);
    expect(groups.map((group) => group.heading)).toEqual([
      "Role & Power Source",
      "Starting Statistics",
      "Proficiencies & Training",
      "Class Features & Build",
      "Flavor",
      "Other",
    ]);
    const groupedFields = groups.flatMap((group) => group.fields);
    expect(groupedFields).toHaveLength(classFields.length);
    expect(new Set(groupedFields)).toEqual(new Set(classFields));
    expect(
      groups
        .find((group) => group.heading === "Class Features & Build")
        ?.fields.map((specific) => specific.value),
    ).toEqual(["Ardent Mantle", "Psionic Augmentation"]);
  });

  it("renders the same labeled class sections for Class and Hybrid Class cards", () => {
    const render = (type: string) =>
      renderToStaticMarkup(
        createElement(EntityCardBody, {
          entity: entity(type, classFields),
          hideFlavortext: false,
        }),
      );
    const classMarkup = render("Class");
    const hybridMarkup = render("Hybrid Class");
    for (const markup of [classMarkup, hybridMarkup]) {
      expect(markup).toContain("Role &amp; Power Source");
      expect(markup).toContain("Starting Statistics");
      expect(markup).toContain("Proficiencies &amp; Training");
      expect(markup).toContain("Class Features &amp; Build");
      expect(markup).toContain(">Flavor<");
      expect(markup).toContain(">Other<");
      expect(markup.match(/<dt>Implements<\/dt>/g)).toHaveLength(1);
      expect(markup).toContain("Any weapon you wield");
      expect(markup).toContain("Holy symbols");
      expect(markup).toContain("Preserved fallback");
      expect(markup).toContain("Source: Player&#x27;s Handbook Test");
    }
    expect(isClassEntity(entity("Class", []))).toBe(true);
    expect(isClassEntity(entity("Hybrid Class", []))).toBe(true);
  });

  it("leaves non-class specifics in the standard shared details section", () => {
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: entity("Feat", [field("Benefit", "Gain a bonus.", 0)]),
        hideFlavortext: false,
      }),
    );
    expect(markup).toContain("<h5>Details</h5>");
    expect(markup).toContain("<dt>Benefit</dt>");
    expect(markup).not.toContain("Role &amp; Power Source");
  });

  it("uses semantic prose for long specifics while preserving scalar and tabular fields", () => {
    const rulesItem = field(
      "Rules Item",
      "    DIVINE SANCTION\n    First paragraph.\n\n\tSecond paragraph.",
      0,
    );
    const alignment = field("Alignment", "Lawful Good", 1);
    const table = field("Supplemental", "Deity\tAlignment\nAvandra\tGood", 2);
    const longExplanation = field(
      "Implements",
      "A paladin can use a holy symbol to channel divine power. This deliberately long explanation continues with enough authored sentence text to be prose even when the source stores it on one line.",
      3,
    );
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: entity("Class Feature", [rulesItem, alignment, table]),
        hideFlavortext: false,
      }),
    );

    expect(isProseSpecific(rulesItem)).toBe(true);
    expect(isProseSpecific(alignment)).toBe(false);
    expect(isProseSpecific(table)).toBe(false);
    expect(isProseSpecific(longExplanation)).toBe(true);
    expect(markup).toContain("<h6>DIVINE SANCTION</h6>");
    expect(markup.match(/class="prose-paragraph"/g)).toHaveLength(3);
    expect(markup).toContain('<dd class="preserve-lines">Lawful Good</dd>');
    expect(markup).toContain("Deity\tAlignment\nAvandra\tGood");
  });
});

describe("shared power and item cards", () => {
  it("shares the established entity-family icon with neutral card headers", () => {
    const feat = entity("Feat", []);
    const iconMarkup = renderToStaticMarkup(
      createElement(EntityCardLeadingIcon, { entity: feat }),
    );
    const headerMarkup = renderToStaticMarkup(
      createElement(EntityCardHeader, { entity: feat }),
    );

    expect(iconMarkup).toContain("lucide-sparkles");
    expect(headerMarkup).toContain(iconMarkup);
  });

  it("omits the action icon element when a power action is missing or blank", () => {
    for (const specifics of [
      [field("Power Usage", "Daily", 0)],
      [field("Action Type", " \t\n ", 0)],
    ]) {
      const markup = renderToStaticMarkup(
        createElement(EntityCardHeader, { entity: entity("Power", specifics) }),
      );
      expect(markup).not.toContain("action-type-icon");
      expect(markup).not.toContain("Action not specified");
      expect(markup).toContain("<h4>Ardent</h4>");
    }
  });

  it("renders one compact power header with usage, power type, and level", () => {
    const power = entity("Power", [
      field("Power Usage", "Encounter", 0),
      field("Level", "7", 1),
      field("Power Type", "Attack", 2),
      field("Action Type", "Standard Action", 3),
      field("Attack Type", "Close burst 3", 4),
    ]);
    const markup = renderToStaticMarkup(
      createElement(EntityCardHeader, { entity: power }),
    );
    expect(markup).toContain("action-type-icon");
    expect(markup).toContain("Encounter 7");
    expect(markup).not.toContain("attack 7");
    expect(markup).not.toContain("Close burst 3");
    expect(markup).not.toContain("entity-card-attack-type");
    expect(
      powerCardLabel(entity("Power", [field("Power Type", "Utility", 0)])),
    ).toBe("Utility");
  });

  it("omits empty header subheading space but retains meaningful indicators", () => {
    const feat = entity("Feat", []);
    const ordinaryMarkup = renderToStaticMarkup(
      createElement(EntityCardHeader, { entity: feat }),
    );
    const unavailableMarkup = renderToStaticMarkup(
      createElement(EntityCardHeader, {
        entity: feat,
        subheading: createElement(
          "span",
          { className: "candidate-unavailable" },
          "Unavailable",
        ),
      }),
    );

    expect(ordinaryMarkup).not.toContain("primary-detail-subheading");
    expect(unavailableMarkup).toContain("primary-detail-subheading");
    expect(unavailableMarkup).toContain("Unavailable");
  });

  it("resolves compact item labels and the approved corpus icon families", () => {
    const magic = entity("Magic Item", [
      field("Magic Item Type", "Weapon", 0),
      field("Level", "9", 1),
      field("Rarity", "Uncommon", 2),
    ]);
    expect(itemCardLabel(magic)).toBe("Weapon 9");
    expect(
      itemCardLabel(
        entity("Magic Item", [
          field("Magic Item Type", "Neck Slot Item", 0),
          field("Level", "6", 1),
        ]),
      ),
    ).toBe("Item 6");
    expect(itemCardIcon(magic)).toBe("sword");
    expect(itemCardLabel(entity("Weapon", []))).toBe("Weapon");
    const expected = [
      ["Armor", "shirt"],
      ["Ammunition", "bow-arrow"],
      ["Arms Slot Item", "arms"],
      ["Holy Symbol", "church"],
      ["Ki Focus", "focus"],
      ["Orb", "orbit"],
      ["Staff", "wand-sparkles"],
      ["Tome", "book-marked"],
      ["Potion", "flask-round"],
      ["Artifact", "gem"],
      ["Psionic Talent", "brain"],
      ["Alternative Reward", "award"],
      ["Divine Boon", "gift"],
      ["Echo of Power", "waves"],
      ["Secret of the Way", "key-round"],
      ["Soulfang", "bone"],
      ["Templar Brand", "stamp"],
    ] as const;
    for (const [kind, icon] of expected) {
      expect(
        itemCardIcon(entity("Magic Item", [field("Magic Item Type", kind, 0)])),
      ).toBe(icon);
    }
    expect(
      itemCardIcon(
        entity("Magic Item", [field("Magic Item Type", "Waist Slot Item", 0)]),
      ),
    ).toBe("square-star");
    expect(
      itemCardIcon(
        entity("Magic Item", [field("Magic Item Type", "Arms Slot Item", 0)]),
        entity("Armor", [field("Armor Type", "Shield", 0)]),
      ),
    ).toBe("shield");
    expect(itemCardIcon(entity("Armor", []))).toBe("shirt");
    expect(
      itemCardIcon(entity("Armor", [field("Armor Type", "Shield", 0)])),
    ).toBe("shield");
  });
});
