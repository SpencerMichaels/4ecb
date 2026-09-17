import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity, SpecificField } from "@4ecb/content-domain";

import {
  EmbeddedPowerCard,
  EntityCardBody,
  EntityCardHeader,
  groupClassSpecifics,
  isClassEntity,
  itemCardIcon,
  itemCardLabel,
  orderPowerRuleFields,
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
});

describe("shared power and item cards", () => {
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
    expect(markup).toContain("Encounter attack 7");
    expect(markup).not.toContain("Close burst 3");
    expect(markup).not.toContain("entity-card-attack-type");
    expect(
      powerCardLabel(entity("Power", [field("Power Type", "Utility", 0)])),
    ).toBe("utility");
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
    expect(itemCardLabel(magic)).toBe("Weapon 9 · Uncommon");
    expect(itemCardIcon(magic)).toBe("sword");
    expect(itemCardLabel(entity("Weapon", []))).toBe("Weapon");
    const expected = [
      ["Armor", "shield"],
      ["Ammunition", "target"],
      ["Arms Slot Item", "arms"],
      ["Holy Symbol", "sun"],
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
  });

  it("renders flavor, text-only descriptors, aligned clauses, and top-level source", () => {
    const power = {
      ...entity("Power", [
        field("Power Usage", "Encounter", 0),
        field("Level", "7", 1),
        field("Power Type", "Attack", 2),
        field("Action Type", "Standard Action", 3),
        field("Attack Type", "Melee weapon", 4),
        field("Hit", "1[W] damage.", 5),
      ]),
      flavor: "A decisive strike.",
    };
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: power,
        hideFlavortext: false,
      }),
    );
    expect(markup.indexOf("candidate-flavor")).toBeLessThan(
      markup.indexOf("entity-card-descriptors"),
    );
    expect(markup).toContain('class="entity-card-rules"');
    expect(markup).toContain("<dt>Hit</dt>");
    expect(markup).not.toContain("<dt>Power Usage</dt>");
    expect(markup).not.toContain("<dt>Level</dt>");
    expect(markup).not.toContain("<dt>Power Type</dt>");
    expect(markup).not.toContain("<h5>Details</h5>");
    expect(markup).toContain("Source: Player&#x27;s Handbook Test");
  });

  it("orders common power clauses canonically and preserves custom duplicates", () => {
    const clauses = [
      field("Special", "Closing note.", 0),
      field("Trigger", "An enemy moves.", 1),
      field("Requirements", "You wield a weapon.", 2),
      field("Primary Target", "One creature.", 3),
      field("Primary Attack", "Strength vs. AC", 4),
      field("Hit", "Deal damage.", 5),
      field("Effect", "Apply an effect.", 6),
      field("Secondary Target", "A second creature.", 7),
      field("Secondary Attack", "Strength vs. Fortitude", 8),
      field("Hit (Fortitude)", "Push the target.", 9),
      field("Miss", "Half damage.", 10),
      field("Tertiary Target", "A third creature.", 11),
      field("Tertiary Attack", "Strength vs. Reflex", 12),
      field("Custom Step", "First custom clause.", 13),
      field("Custom Step", "Second custom clause.", 14),
      field("Sustain Minor", "The zone persists.", 15),
      field("Miss Aftereffect", "The target is slowed.", 16),
    ];

    expect(
      orderPowerRuleFields(clauses).map((specific) => specific.name),
    ).toEqual([
      "Requirements",
      "Trigger",
      "Primary Target",
      "Primary Attack",
      "Hit",
      "Effect",
      "Secondary Target",
      "Secondary Attack",
      "Hit (Fortitude)",
      "Miss",
      "Tertiary Target",
      "Tertiary Attack",
      "Custom Step",
      "Custom Step",
      "Sustain Minor",
      "Miss Aftereffect",
      "Special",
    ]);
    expect(
      orderPowerRuleFields(clauses).map((specific) => specific.value),
    ).toContain("Second custom clause.");

    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: entity("Power", clauses),
        hideFlavortext: false,
      }),
    );
    const renderedValues = [
      "You wield a weapon.",
      "An enemy moves.",
      "One creature.",
      "Strength vs. AC",
      "Deal damage.",
      "Apply an effect.",
      "A second creature.",
      "Strength vs. Fortitude",
      "Push the target.",
      "Half damage.",
      "A third creature.",
      "Strength vs. Reflex",
      "First custom clause.",
      "Second custom clause.",
      "The zone persists.",
      "The target is slowed.",
      "Closing note.",
    ];
    expect(renderedValues.map((value) => markup.indexOf(value))).toEqual(
      [...renderedValues]
        .map((value) => markup.indexOf(value))
        .sort((left, right) => left - right),
    );
  });

  it("starts embedded powers open and omits their Source footer", () => {
    const power = entity("Power", [field("Power Usage", "Daily", 0)]);
    const markup = renderToStaticMarkup(
      createElement(EmbeddedPowerCard, {
        entity: power,
        hideFlavortext: false,
      }),
    );
    expect(markup).toContain("<details");
    expect(markup).toContain('open=""');
    expect(markup.match(/<summary>/g)).toHaveLength(1);
    expect(markup).not.toContain("Source:");
  });

  it("keeps authored item Power text as an inline rules clause", () => {
    const item = entity("Magic Item", [
      field("Magic Item Type", "Armor", 0),
      field("Gold", "840", 1),
      field("Power", "Power (Daily): Regain hit points.", 2),
    ]);
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: item,
        hideFlavortext: false,
      }),
    );
    expect(markup).toContain("<dt>Power</dt>");
    expect(markup).toContain("<dt>Price</dt>");
    expect(markup).toContain("840 gp");
    expect(markup).not.toContain("<dt>Gold</dt>");
    expect(markup.match(/840 gp/g)).toHaveLength(1);
    expect(markup).not.toContain("<details");
  });
});
