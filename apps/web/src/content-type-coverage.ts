/**
 * Where every content type is meant to reach the player (D089,
 * docs/coverage-audit-proposal.md). `pnpm audit:coverage` fails on a pack type
 * missing here and checks the sheet surfaces it can derive from code; a
 * public test covers the synthetic pack's types.
 *
 * - presented: a sheet surface lists it (and the builder offers or shows it).
 * - applied: only its effect shows, through calculated values.
 * - internal: rules plumbing or reference data a character never owns.
 * - gap: a character can have it, but nothing presents it yet.
 */
export type SheetSurface =
  | "features"
  | "identity"
  | "powers"
  | "items"
  | "references"
  | "companions"
  | "skills";

export type ContentTypeCoverage =
  | { readonly kind: "presented"; readonly surfaces: readonly SheetSurface[] }
  | { readonly kind: "applied"; readonly note: string }
  | { readonly kind: "internal"; readonly note: string }
  | { readonly kind: "gap"; readonly note: string };

const presented = (...surfaces: SheetSurface[]): ContentTypeCoverage => ({
  kind: "presented",
  surfaces,
});
const applied = (note: string): ContentTypeCoverage => ({
  kind: "applied",
  note,
});
const internal = (note: string): ContentTypeCoverage => ({
  kind: "internal",
  note,
});
const gap = (note: string): ContentTypeCoverage => ({ kind: "gap", note });

const abilityIncrease = applied("Raises an ability score.");
const companionAbilityIncrease = gap(
  "Raises a beast companion's ability score; companions have no stat block " +
    "yet (familiar card proposal, step 2).",
);

export const CONTENT_TYPE_COVERAGE: Readonly<
  Record<string, ContentTypeCoverage>
> = {
  // Listed options
  Power: presented("powers"),
  "Class Feature": presented("features"),
  "Racial Trait": presented("features"),
  Feat: presented("features"),
  Language: presented("features"),
  Background: presented("features"),
  Theme: presented("features", "identity"),
  "Paragon Path": presented("features", "identity"),
  "Epic Destiny": presented("features", "identity"),
  Race: presented("identity"),
  Class: presented("identity"),
  Size: presented("identity"),
  Gender: presented("identity"),
  Alignment: presented("identity"),
  Deity: presented("identity"),
  Familiar: presented("companions"),
  Skill: presented("skills"),

  // Inventory
  "Magic Item": presented("items"),
  Weapon: presented("items"),
  Armor: presented("items"),
  Gear: presented("items"),
  "Ritual Scroll": presented("items"),
  "Superior Implement": presented("items"),
  Ritual: presented("references"),

  // Effects only
  "Skill Training": applied("Marks the skill trained."),
  "Race Ability Bonus": applied("Raises an ability score."),
  "Ability Increase (Level 4)": abilityIncrease,
  "Ability Increase (Level 8)": abilityIncrease,
  "Ability Increase (Level 14)": abilityIncrease,
  "Ability Increase (Level 18)": abilityIncrease,
  "Ability Increase (Level 24)": abilityIncrease,
  "Ability Increase (Level 28)": abilityIncrease,
  Vision: applied("Shown in the senses line."),
  Build: applied("A class's optional suggested build: pre-fills choices."),
  Level: applied("Shown as the character level."),

  // Plumbing and reference data
  Category: internal("Category tags matched by rules."),
  Internal: internal("Engine flags (No Encounter Powers, Ki Focus User…)."),
  Grants: internal("Grant bundles for races and classes."),
  CountsAsFeature: internal("Aliases matched by prerequisites."),
  CountsAsClass: internal("Aliases matched by prerequisites."),
  CountsAsPact: internal("Aliases matched by prerequisites."),
  Level1Rules: internal("Character-creation rule bundles."),
  "Build Suggestions": internal("Suggested builds per class."),
  "Background Association": internal("Background skill/language links."),
  Multiclass: internal("Multiclass marker."),
  "Pseudo Class": internal("Category class for Spellscarred feats."),
  Role: internal("Class metadata shown on the class card."),
  "Power Source": internal("Class metadata shown on the class card."),
  Tier: internal("Level-derived marker."),
  source: internal("Source book metadata."),
  tag: internal("Content tags."),
  Information: internal("Help text."),
  "Skill Usage": internal("Skill-use reference text."),
  "Weapon Property": internal("Reference text for item cards."),
  "Weapon Group": internal("Reference text for item cards."),
  "Ability Score": internal("Reference text."),
  Money: internal("Coin reference; the wallet is separate."),
  "Item Set": internal("Set metadata for Item Set Benefit."),

  // Known gaps, for triage
  "Hybrid Class": gap(
    'The Class identity line shows "Hybrid" (the hybrid marker class) ' +
      "instead of the two hybrid classes.",
  ),
  "Trait Package": gap(
    "Its class features are listed, but the package itself (e.g. the pact) " +
      "is not named on the sheet.",
  ),
  Domain: gap("A cleric's chosen domains are not shown."),
  "Background Choice": gap(
    "The chosen background benefit (e.g. a skill bonus) is not shown.",
  ),
  "God Fragment": gap("A chosen god fragment and its powers are not shown."),
  "Item Set Benefit": gap("Active item-set bonuses are not shown."),
  Proficiency: gap("Proficiencies are applied but not listed on the sheet."),
  Companion: gap(
    "Beast companions have no stat block (familiar card proposal, step 2).",
  ),
  CountsAsRace: gap(
    "A revenant's past-life race is chosen but not shown on the sheet.",
  ),
  Associate: gap("Associates and summoned-creature stat blocks are not shown."),
  "Companion Ability Increase (Level 4)": companionAbilityIncrease,
  "Companion Ability Increase (Level 8)": companionAbilityIncrease,
  "Companion Ability Increase (Level 14)": companionAbilityIncrease,
  "Companion Ability Increase (Level 18)": companionAbilityIncrease,
  "Companion Ability Increase (Level 24)": companionAbilityIncrease,
  "Companion Ability Increase (Level 28)": companionAbilityIncrease,
};

export function contentTypeCoverage(
  type: string,
): ContentTypeCoverage | undefined {
  return CONTENT_TYPE_COVERAGE[type.trim()];
}

/**
 * ID-valued fields ("Owner Type.Field") the detail pane or sheet follows to the
 * entities they name, with where. The audit measures the detail stack's cards
 * (detailStackEntries) itself, so only other ways of following belong here.
 */
export const FOLLOWED_REFERENCE_FIELDS: Readonly<Record<string, string>> = {
  "Race.Racial Traits": "Race card lists the traits (StructuredEntityBody).",
};

/**
 * ID-valued fields that are rules plumbing or builder metadata, not something
 * to show ("Owner Type.Field", or "*.Field" for every owner).
 */
export const PLUMBING_REFERENCE_FIELDS: Readonly<Record<string, string>> = {
  "*._SupportsID": "Legacy builder grouping.",
  "*._RequiresID": "Prerequisite matching.",
  "*.Class": "Class/category matching; the card shows the class by name.",
  "*._Subclasses": "Class matching.",
  "*._SubClasses": "Class matching.",
  "*._ParentClass": "Class matching.",
  "*._BaseClass": "Hybrid class matching.",
  "*._RoleElement": "Shown by name on the class card.",
  "*._PowerSourceElement": "Shown by name on the class card.",
  "*._SecondaryPowerSourceElement": "Shown by name on the class card.",
  "*._SUGGESTED_FEATS": "Builder suggestions.",
  "*._SUGGESTED_POWERS": "Builder suggestions.",
  "*._SUGGESTED_FEATURES": "Builder suggestions.",
  "*._ImplementForPower": "Implement eligibility in power math.",
  "*._ImplementForClass": "Implement eligibility in power math.",
  "*._Associated Feats": "Power keywords in power math.",
  "*._KeyAbilityAs": "Power math.",
  "Power._ParentPower": "The parent grants the child power card.",
  "Power._AugmentParent": "Augment versions render on the parent card.",
  "Power._AugmentVersions": "Rendered as augments on the power card.",
  "Power._ParentFeature": "Core-power reminders on page 1.",
  "Power._ThemePower": "Theme powers are listed on the theme's detail.",
  "Power._SkillPower": "Skill-power choices in the builder.",
  "Theme._DisplayPowers": "Theme powers are listed on the theme's detail.",
  "Skill Usage.Skill": "Reference data.",
  "God Fragment.Deity": "Matching only.",
  "Weapon._Primary End": "Double-weapon pairing.",
  "Weapon._Secondary End": "Double-weapon pairing.",
  "Superior Implement.WeaponEquiv": "Weapon math.",
  "Gear._RelatedElement": "Ammunition pairing.",
  "Magic Item._RELATED_ITEMS": "Shop tier variants.",
  "Ritual._RELATED_ITEMS": "Shop tier variants.",
};
