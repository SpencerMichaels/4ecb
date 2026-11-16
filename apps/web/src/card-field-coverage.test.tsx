import { describe, expect, it } from "vitest";

import {
  ITEM_RULES_TEXT_FIELD,
  ITEM_RULES_TEXT_VERSION,
  type ContentEntity,
} from "@4ecb/content-domain";

import {
  CARD_FIELD_ALLOWLIST,
  CARD_FIELD_MERGES,
  cardFieldCoverage,
  cardSurfaceTexts,
  type CardFieldContent,
  type FieldCoverage,
} from "./card-field-coverage";

/**
 * The public guard behind the private `pnpm audit:card-fields` sweep: every
 * user-facing field of a synthetic record of each card type must show on
 * some surface (printed card, builder pane, printed reference entry), or be
 * a deliberate merge or allowlisted with a reason. A new exclude list, a
 * placement that drops a field, or a renderer that skips a section fails
 * here. The records carry the field shapes earlier drops hid (2026-11-16:
 * targets without an attack, attack lines the band can't show, follow-up
 * attacks, indented phase fields, record prerequisites, a feat's
 * associated powers, a god fragment's ability).
 */

let ordinal = 0;
function record(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> | readonly [string, string][],
  extra: Partial<ContentEntity> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic Test",
    sources: ["Synthetic Test"],
    attributes: [],
    categories: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: (ordinal += 1) },
    specifics: (Array.isArray(specifics)
      ? specifics
      : Object.entries(specifics)
    ).map(([fieldName, value], index) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal: index,
    })),
    ...extra,
  };
}

const RECORDS: readonly ContentEntity[] = [
  record(
    "SYN_POWER_FLURRY",
    "Synthetic Flurry",
    "Power",
    [
      ["Power Usage", "Encounter"],
      ["Display", "Fighter Attack 3"],
      ["Keywords", "Martial, Weapon"],
      ["Action Type", "Standard action"],
      ["Attack Type", "Melee weapon"],
      ["Target", "One creature"],
      ["Attack", "Strength vs. AC, two attacks (main weapon)"],
      ["Hit", "1[W] + Strength modifier damage per attack."],
      ["Miss", "Half damage."],
      ["Special", "You can shift 1 square before the attacks."],
      ["Level", "3"],
      ["Power Type", "Attack"],
    ],
    { flavor: "Your blade flickers twice." },
  ),
  record("SYN_POWER_WORD", "Synthetic Word", "Power", [
    ["Power Usage", "Encounter"],
    ["Keywords", "Divine, Healing"],
    ["Action Type", "Minor action"],
    ["Attack Type", "Close burst 5"],
    ["Target", "You or one ally in the burst"],
    ["Effect", "The target can spend a healing surge."],
    ["Level", "1"],
    ["Power Type", "Utility"],
  ]),
  record("SYN_POWER_RAGE", "Synthetic Rage", "Power", [
    ["Power Usage", "Daily"],
    ["Keywords", "Primal, Rage, Weapon"],
    ["Action Type", "Standard action"],
    ["Attack Type", "Melee weapon"],
    ["Target", "One creature"],
    ["Attack", "Strength"],
    ["Hit", "3[W] + Strength modifier damage."],
    ["Miss", "Half damage."],
    ["Effect", "You enter the rage of the synthetic beast."],
    ["Level", "9"],
    ["Power Type", "Attack"],
  ]),
  record("SYN_POWER_FOLLOW_UP", "Synthetic Follow-up", "Power", [
    ["Power Usage", "Encounter"],
    ["Keywords", "Arcane, Fire, Weapon"],
    ["Action Type", "Standard action"],
    ["Attack Type", "Melee weapon"],
    ["Target", "One creature"],
    ["Attack", "Intelligence vs. AC"],
    ["Hit", "2[W] damage. Make the following attack against the target."],
    [" Attack", "Intelligence vs. Fortitude"],
    [" Hit", "The target is dazed until the end of your next turn."],
    ["Level", "27"],
    ["Power Type", "Attack"],
  ]),
  record("SYN_POWER_PROFANE", "Synthetic Profane", "Power", [
    ["Power Usage", "Encounter"],
    ["Keywords", "Divine, Radiant, Weapon"],
    ["Action Type", "Standard action"],
    ["Attack Type", "Melee weapon"],
    ["Primary Target", "One undead creature"],
    ["Primary Attack", "Strength vs. AC"],
    ["Hit", "2[W] + Strength modifier radiant damage."],
    ["Effect", "Make the secondary attack."],
    ["Secondary Attack", "­"],
    [" Attack Type", "Close burst 3"],
    [" Secondary Target", "Each undead enemy in the burst"],
    [" Attack", "Strength vs. Will"],
    [" Hit", "You push the secondary target 3 squares."],
    ["Level", "5"],
    ["Power Type", "Attack"],
  ]),
  record(
    "SYN_ITEM_ROD",
    "Synthetic Rod +2",
    "Magic Item",
    {
      Level: "7",
      Gold: "2600",
      "Magic Item Type": "Rod",
      "Item Slot": "Off-hand",
      Critical: "+2d6 damage",
      Enhancement: "+2 attack rolls and damage rolls",
      Rarity: "Uncommon",
      Property: "You gain a +1 power bonus to AC while you hold this rod.",
      Power:
        "Power (Encounter): Minor Action. Use the stored effect within your rod.",
    },
    {
      flavor: "This rod hums with stored power.",
      prerequisites: "Warforged",
    },
  ),
  record("SYN_WEAPON_FIST", "Synthetic Fist", "Weapon", {
    Damage: "1d8",
    "Weapon Category": "Simple Melee",
    "Hands Required": "One-Handed",
    "Item Slot": "Main Hand",
    "Proficiency Bonus": "3",
    Group: "Unarmed",
    Weight: "0",
    Gold: "0",
  }),
  record("SYN_RITUAL", "Synthetic Ritual", "Ritual", {
    Level: "4",
    Category: "Exploration",
    Time: "10 minutes",
    Duration: "Until your next extended rest",
    "Component Cost": "25 gp",
    "Market Price": "150 gp",
    "Key Skill": "Arcana",
    type: "Ritual",
  }),
  record(
    "SYN_FEAT_DOMAIN",
    "Synthetic Domain Feat",
    "Feat",
    {
      Tier: "Heroic",
      "Associated Powers": "Synthetic Flurry, Synthetic Word",
      "Associated Power Info":
        "When you use a power associated with this feat, you gain a +1 bonus to the damage roll.",
      Special: "You can take this feat only once.",
    },
    {
      description: "You gain a +2 feat bonus to Diplomacy checks.",
      prerequisites: "Paragon Tier",
    },
  ),
  record(
    "SYN_FEATURE_RECALL",
    "Synthetic Recall",
    "Class Feature",
    { Level: "21" },
    {
      description: "Choose one daily attack spell you know each day.",
      prerequisites: "21st-level wizard",
    },
  ),
  record(
    "SYN_TRAIT",
    "Synthetic Trait",
    "Racial Trait",
    { Level: "1" },
    { description: "You gain a +2 racial bonus to Nature checks." },
  ),
  record(
    "SYN_BACKGROUND",
    "Synthetic Harbor",
    "Background",
    {
      Campaign: "Synthetic Realms",
      type: "Geography",
      "Associated Skills": "Insight, Perception",
      Benefit: "You gain a +2 bonus to Diplomacy checks.",
    },
    { description: "You grew up by the sea." },
  ),
  record(
    "SYN_PATH",
    "Synthetic Path",
    "Paragon Path",
    {},
    {
      description: "You walk the synthetic path.",
      prerequisites: "Fighter",
    },
  ),
  record(
    "SYN_FAMILIAR",
    "Synthetic Familiar",
    "Familiar",
    {
      Speed: "6",
      Tier: "Heroic",
      "Constant Benefits": "You gain a +2 bonus to Arcana checks.",
      Power: "Glow: The familiar sheds bright light.",
    },
    { prerequisites: "Sha'ir" },
  ),
  record(
    "SYN_POWER_SIDEBAR",
    "Synthetic Sidebar",
    "Power",
    [
      ["Power Usage", "At-Will"],
      ["Keywords", "Arcane, Fire, Implement"],
      ["Action Type", "Standard action"],
      ["Attack Type", "Close blast 3"],
      ["Target", "Each creature in the blast"],
      ["Attack", "Intelligence vs. Reflex"],
      ["Hit", "1d6 + Intelligence modifier fire damage."],
      ["Level", "1"],
      ["Power Type", "Attack"],
    ],
    { description: "Pack fighters see your lack of armor as a chance." },
  ),
  record(
    "SYN_ARTIFACT",
    "Synthetic Spear",
    "Magic Item",
    {
      "Magic Item Type": "Artifact",
      Tier: "Paragon",
      Weapon: "Longspear",
      Property: "Your reach with this weapon is 3.",
      [ITEM_RULES_TEXT_FIELD]: JSON.stringify({
        version: ITEM_RULES_TEXT_VERSION,
        kind: "concordance",
        text: "Concordance\nOwner slays a servant of a god: +1",
      }),
    },
    {
      description:
        "Goals of the Synthetic Spear: kill servants of the gods.\n\nConcordance\nOwner slays a servant of a god: +1",
    },
  ),
  record("SYN_ARROWS", "Synthetic Arrows", "Gear", {
    count: "30",
    Category: "Ammunition",
    Gold: "1",
    Weight: "3",
  }),
  record("SYN_SPIKED_SHIELD", "Synthetic Spiked Shield", "Weapon", {
    Damage: "1d6",
    "Proficiency Bonus": "2",
    "Weapon Category": "Superior Melee",
    "Armor Category": "Light Shields",
    "Hands Required": "One-Handed",
  }),
  record(
    "SYN_CLASS",
    "Synthetic Warpriest",
    "Class",
    {
      Role: "Leader. You heal.",
      "Power Source": "Divine. Your god guides you.",
      "Trait Package": "Storm Domain, Sun Domain",
    },
    { description: "Warpriests guard the faith." },
  ),
  record("SYN_FRAGMENT", "Synthetic Fragment", "God Fragment", {
    "Constant Benefits": "You gain a +1 bonus to saving throws.",
    Quirks: "Abrasive, intimidating, lively",
    "Power Usage": "Encounter",
    "Action Type": "Free",
    Keywords: "Fear",
    Trigger: "You use a divine encounter attack power.",
    Effect: "One ally gains 5 temporary hit points.",
  }),
];

const content: CardFieldContent = {
  entities: RECORDS,
  byId: new Map(RECORDS.map((entity) => [entity.id.toLowerCase(), entity])),
};

const dropped = (fields: readonly FieldCoverage[]) =>
  fields.filter(
    (field) =>
      !field.internal &&
      Object.values(field.surfaces).every((presence) => presence === "missing"),
  );

describe("card field coverage", () => {
  it.each(RECORDS.map((entity) => [entity.type, entity.name, entity]))(
    "shows every field of a %s (%s) on some surface",
    (_type, _name, entity) => {
      const surfaces = cardSurfaceTexts(entity, content);
      expect(Object.keys(surfaces).length).toBeGreaterThan(0);
      const missing = dropped(cardFieldCoverage(entity, surfaces, content));
      expect(missing.map(({ name, value }) => `${name}: ${value}`)).toEqual([]);
    },
  );

  it.each([
    "Power",
    "Magic Item",
    "Weapon",
    "Feat",
    "Class Feature",
    "Racial Trait",
    "Background",
    "Paragon Path",
    "Deity",
    "Theme",
    "Class",
    "Race",
    "Hybrid Class",
    "Ritual",
    "Armor",
    "Epic Destiny",
  ])("shows a %s's unknown new field somewhere", (type) => {
    const entity = record(
      `SYN_NOVEL_${type}`,
      `Synthetic ${type}`,
      type,
      { "Novel Rule": "A rule no card has placed yet." },
      { description: "A synthetic record." },
    );
    const surfaces = cardSurfaceTexts(entity, content);
    const missing = dropped(cardFieldCoverage(entity, surfaces, content));
    expect(missing.map(({ name }) => name)).toEqual([]);
  });

  it("flags a field no surface shows", () => {
    const entity = record("SYN_HIDDEN", "Synthetic Hidden", "Feat", {
      Tier: "Heroic",
      "Novel Rule": "Text no card shows.",
    });
    const coverage = cardFieldCoverage(
      entity,
      { panel: { text: "Synthetic Hidden Tier Heroic", labels: "" } },
      content,
    );
    expect(dropped(coverage).map(({ name }) => name)).toEqual(["Novel Rule"]);
  });

  it("gives every deliberate omission and merge a reason", () => {
    expect(
      CARD_FIELD_ALLOWLIST.filter((rule) => /^OPEN\b/.test(rule.reason)),
    ).toEqual([]);
    for (const rule of [...CARD_FIELD_ALLOWLIST, ...CARD_FIELD_MERGES]) {
      expect(rule.fields.length).toBeGreaterThan(0);
      expect(rule.reason.trim().length).toBeGreaterThan(20);
    }
  });
});

describe("card field coverage on each surface", () => {
  // Stricter than the guard above for these records: each field shows on
  // every surface the record reaches, unless deliberately left off one.
  it.each(RECORDS.map((entity) => [entity.type, entity.name, entity]))(
    "shows every field of a %s (%s) on each of its surfaces",
    (_type, _name, entity) => {
      const coverage = cardFieldCoverage(
        entity,
        cardSurfaceTexts(entity, content),
        content,
      );
      expect(
        coverage.flatMap((field) =>
          field.internal
            ? []
            : Object.entries(field.surfaces).flatMap(([surface, presence]) =>
                presence === "missing" ? [`${surface} · ${field.name}`] : [],
              ),
        ),
      ).toEqual([]);
    },
  );
});
