import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity, SpecificField } from "@4ecb/content-domain";

import {
  EmbeddedPowerCard,
  EntityCardBody,
  EntityCardHeader,
  EntityCardLeadingIcon,
  composedArmorDescriptorRows,
  composedWeaponDescriptorRows,
  groupClassSpecifics,
  isClassEntity,
  isProseSpecific,
  itemCardIcon,
  itemCardLabel,
  itemFullTextDuplicatesStructuredFields,
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
      ["Ammunition", "target"],
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

  it("builds approved composed-weapon rows from physical and magical fields", () => {
    const base = entity("Weapon", [
      field("Proficiency Bonus", "+2", 0),
      field("Damage", "1d10", 1),
      field("Weapon Category", "Military melee", 2),
      field("Hands Required", "One-handed", 3),
      field("Group", "Hammer", 4),
      field("Weight", "5 lb.", 5),
      field("Properties", "Versatile", 6),
      field("Properties", "Brutal 1", 7),
    ]);
    const enchantment = entity("Magic Item", [
      field("Enhancement", "+2 attack rolls and damage rolls", 0),
      field("Critical", "+2d6 damage", 1),
      field("Gold", "2600", 2),
      field("Rarity", "Common", 3),
    ]);

    expect(composedWeaponDescriptorRows(base, enchantment)).toEqual([
      [
        {
          key: "enhancement",
          label: "Enhancement",
          values: ["+2 attack rolls and damage rolls"],
        },
      ],
      [
        { key: "proficiency", label: "Proficiency", values: ["+2"] },
        { key: "damage", label: "Damage", values: ["1d10"] },
        { key: "critical", label: "Critical", values: ["+2d6"] },
      ],
      [
        {
          key: "category",
          label: "Category",
          values: ["Military melee"],
        },
        { key: "hands", label: "Hands", values: ["One-handed"] },
        { key: "group", label: "Group", values: ["Hammer"] },
      ],
      [
        { key: "weight", label: "Weight", values: ["5 lb."] },
        { key: "price", label: "Price", values: ["2,600 gp"] },
        { key: "rarity", label: "Rarity", values: ["Common"] },
      ],
      [
        {
          key: "properties",
          label: "Properties",
          values: ["Versatile", "Brutal 1"],
        },
      ],
    ]);
  });

  it("builds approved composed-armor rows with physical slot and weight in their final positions", () => {
    const base = entity("Armor", [
      field("Armor Bonus", "8", 0),
      field("Check", "-2", 1),
      field("Speed", "-1", 2),
      field("Armor Category", "Plate", 3),
      field("Armor Type", "Heavy", 4),
      field("Item Slot", "Body", 5),
      field("Weight", "50", 6),
    ]);
    const enchantment = entity("Magic Item", [
      field("Enhancement", "+2 AC", 0),
      field("Gold", "3400", 1),
      field("Rarity", "Uncommon", 2),
    ]);

    expect(composedArmorDescriptorRows(base, enchantment)).toEqual([
      [{ key: "enhancement", label: "Enhancement", values: ["+2 AC"] }],
      [
        { key: "armor-bonus", label: "Armor bonus", values: ["+8"] },
        { key: "check", label: "Check", values: ["-2"] },
        { key: "speed", label: "Speed", values: ["-1"] },
      ],
      [
        { key: "category", label: "Category", values: ["Plate"] },
        { key: "type", label: "Type", values: ["Heavy"] },
        { key: "slot", label: "Slot", values: ["Body"] },
      ],
      [
        { key: "price", label: "Price", values: ["3,400 gp"] },
        { key: "weight", label: "Weight", values: ["50 lb."] },
        { key: "rarity", label: "Rarity", values: ["Uncommon"] },
      ],
    ]);
  });

  it("normalizes a composed shield's authored physical slot", () => {
    const base = entity("Armor", [
      field("Armor Bonus", "2", 0),
      field("Armor Category", "Heavy Shields", 1),
      field("Armor Type", "Shield", 2),
      field("Item Slot", "Off-hand", 3),
      field("Weight", "15", 4),
      field("Speed", "-", 5),
    ]);
    const enchantment = entity("Magic Item", [
      field("Gold", "3400", 0),
      field("Item Slot", "Arms", 1),
      field("Rarity", "Uncommon", 2),
    ]);

    expect(composedArmorDescriptorRows(base, enchantment)).toEqual([
      [{ key: "armor-bonus", label: "Armor bonus", values: ["+2"] }],
      [
        {
          key: "category",
          label: "Category",
          values: ["Heavy shields"],
        },
        { key: "type", label: "Type", values: ["Shield"] },
        { key: "slot", label: "Slot", values: ["Off hand"] },
      ],
      [
        { key: "price", label: "Price", values: ["3,400 gp"] },
        { key: "weight", label: "Weight", values: ["15 lb."] },
        { key: "rarity", label: "Rarity", values: ["Uncommon"] },
      ],
    ]);
  });

  it("suppresses Full Text only when it duplicates multiple structured fields", () => {
    const damage = field("Damage", "1d10", 0);
    const group = field("Group", "Hammer", 1);
    const duplicate = field(
      "Full Text",
      "Damage: 1d10\nGroup: Hammer\nThis is the complete entry.",
      2,
    );
    const unique = field("Full Text", "A unique rules explanation.", 3);

    expect(
      itemFullTextDuplicatesStructuredFields(duplicate, [
        damage,
        group,
        duplicate,
      ]),
    ).toBe(true);
    expect(
      itemFullTextDuplicatesStructuredFields(unique, [damage, group, unique]),
    ).toBe(false);
  });

  it("uses the compact semantic rows and normalized values for standalone weapons", () => {
    const weapon = entity("Weapon", [
      field("Weight", "5", 0),
      field("Damage", "1d10", 1),
      field("Proficiency Bonus", "2", 2),
      field("Weapon Category", "Military Melee", 3),
      field("Hands Required", "One-Handed", 4),
      field("Item Slot", "One-hand", 5),
      field("Group", "Hammer", 6),
      field("Properties", "Versatile", 7),
    ]);
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: weapon,
        hideFlavortext: false,
      }),
    );

    expect(markup).toContain("<span>+2</span>");
    expect(markup).toContain("<span>5 lb.</span>");
    expect(markup).toContain("<span>Military melee</span>");
    expect(markup).toContain("<span>One-handed</span>");
    expect(markup).not.toContain("Item Slot");
    expect(markup.match(/item-card-descriptor-row/g)).toHaveLength(4);
  });

  it("keeps Enhancement as the first descriptor row for magic weapons", () => {
    const numbered = {
      ...entity("Magic Item", [
        field("Magic Item Type", "Weapon", 0),
        field("Enhancement", "+2 attack rolls and damage rolls", 1),
        field("Gold", "2600", 2),
      ]),
      name: "Defensive Weapon +2",
    };
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: numbered,
        hideFlavortext: false,
      }),
    );

    expect(markup).toContain("<dt>Enhancement</dt>");
    expect(markup.indexOf("<dt>Enhancement</dt>")).toBeLessThan(
      markup.indexOf("<dt>Price</dt>"),
    );
  });

  it("groups ordinary slotted item descriptors into the approved two rows", () => {
    const neckItem = entity("Magic Item", [
      field("Magic Item Type", "Neck Slot Item", 0),
      field("Level", "6", 1),
      field("Enhancement", "+1 Fortitude, Reflex, and Will", 2),
      field("Gold", "1800", 3),
      field("Item Slot", "Neck", 4),
      field("Rarity", "Uncommon", 5),
    ]);
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: neckItem,
        hideFlavortext: false,
      }),
    );

    expect(markup.match(/item-card-descriptor-row/g)).toHaveLength(2);
    expect(markup).toContain("<dt>Enhancement</dt>");
    expect(markup).toContain("<dt>Price</dt>");
    expect(markup).toContain("<dt>Slot</dt>");
    expect(markup).not.toContain("<dt>Item Slot</dt>");
    expect(markup).toContain("<dt>Rarity</dt>");
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
    expect(markup).toContain(
      '<dt>Attack Type</dt><dd class="preserve-lines">Melee weapon</dd>',
    );
    expect(markup).toContain("<dt>Hit</dt>");
    expect(markup).not.toContain("<dt>Power Usage</dt>");
    expect(markup).not.toContain("<dt>Level</dt>");
    expect(markup).not.toContain("<dt>Power Type</dt>");
    expect(markup).not.toContain("<h5>Details</h5>");
    expect(markup).toContain("Source: Player&#x27;s Handbook Test");
  });

  it("labels exact Personal attack types as Range without reusing authored Power Type", () => {
    const power = entity("Power", [
      field("Power Usage", "Encounter", 0),
      field("Power Type", "Utility", 1),
      field("Attack Type", "Personal", 2),
    ]);
    const headerMarkup = renderToStaticMarkup(
      createElement(EntityCardHeader, { entity: power }),
    );
    const bodyMarkup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: power,
        hideFlavortext: false,
      }),
    );

    expect(headerMarkup).toContain("Encounter utility");
    expect(bodyMarkup).toContain(
      '<dt>Range</dt><dd class="preserve-lines">Personal</dd>',
    );
    expect(bodyMarkup).not.toContain("<dt>Attack Type</dt>");
    expect(bodyMarkup).not.toContain("<dt>Power Type</dt>");
  });

  it("renders a power Rules Item as prose without changing ordinary power rule rows", () => {
    const power = entity("Power", [
      field(
        "Rules Item",
        "  DIVINE SANCTION\n    First paragraph.\nSecond paragraph.",
        0,
      ),
      field("Effect", "Line one.\n  Line two stays in the rule row.", 1),
    ]);
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: power,
        hideFlavortext: false,
      }),
    );

    expect(markup).toContain(
      '<dt>Rules Item</dt><dd><div class="prose-blocks"><h6>DIVINE SANCTION</h6>',
    );
    expect(markup).toContain(
      '<dt>Effect</dt><dd class="preserve-lines">Line one.\n  Line two',
    );
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
    expect(markup).toContain('<dd class="preserve-lines">Power (Daily)');
    expect(markup).not.toContain(
      '<dt>Power</dt><dd><div class="prose-blocks">',
    );
  });
});
