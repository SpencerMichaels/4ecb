# Recovered non-data-driven behavior

The legacy engine is not a perfectly generic interpreter. The following families
have explicit native branches and must be ported or deliberately converted into
new declarative compatibility rules. Function names and relevant locations are
searchable in `../generated/decompiled/D20RulesEngine/-Module-.cs`.

## Dynamic category exceptions

- `DiverseStudyException`: permits powers associated with the diverse-study class
  category while its granting feature is active.
- `SeekerException`: broadens class encounter/daily power matching for a specific
  Seeker feature/provider situation.
- `VersatileMasterException`: permits class-power matching for the Versatile Master
  provider when its prerequisite feature is owned.
- `IsUniversalSkill`: a skill carrying `UniversalClassSkill` matches class-skill
  categories across classes.
- selected class, hybrid class, `CountsAsClass`, multiclass-derived class,
  paragon-multiclassing, and a `PowersAsClass` text override build separate dynamic
  sets used by the `$$...` category prefixes.
- custom feat/power definitions can bypass ordinary category rejection.

Several branches bind published records by stable ID, including
`ID_FMP_FEAT_651`, `ID_FMP_PSEUDO_CLASS_216`, `ID_FMP_CLASS_FEATURE_691`,
`ID_FMP_CLASS_FEATURE_1891`, `ID_FMP_CLASS_104`, `ID_FMP_FEAT_1082`, and
`ID_INTERNAL_PARAGON_PATH_PARAGON_MULTICLASSING`. Preserve these IDs and cover each
branch with a fixture before refactoring it into generalized data.

## Class/build/advancement exceptions

- psionic class detection, power-point/augment passes, augmentable-at-will versions,
  and psionic daily eligibility;
- Essentials classification and alternate automatic-level/power behavior;
- hybrid talent processing, Channel Divinity option handling, and hybrid armor
  proficiency suppression;
- multiclass power swaps, paragon multiclassing, replacement and retraining slot
  traversal;
- companion-specific prerequisite parsing and ability-increase behavior;
- deity-choice suppression/requirement based on class/hybrid choices.

## Prerequisite exceptions

The prerequisite parser recognizes natural-language/published patterns beyond the
compact `requires` grammar. Named branches include `ProficiencySpecialCase`,
`CompanionSpecialCase`, `FirstSpecialCase`, and the general prerequisite
`SpecialCase`. Recovered predicates include versatile mace/heavy-blade proficiency
and psionic-daily logic. The engine also records a special failure reason for UI.

Therefore, parsing only `Prereqs` as boolean tokens is insufficient. Preserve the
original prerequisite text and port the special predicates behind explicit IDs or
well-tested structured matchers. Unknown prose should produce an
"unverified prerequisite" diagnostic, not automatically pass as legal.

## Equipment predicates and tally

The `wearing`/`not-wearing` evaluator has named branches for:

- armor class/category and shield state;
- weapon category/property, only-weapon, and slot checks;
- dual wielding and dual shields;
- versatile weapons used two-handed;
- double weapons and main/off-hand projections;
- implements, special implements, holy symbols, ki focuses, and staves;
- Essentials magic armor;
- item augments and item-set counts;
- inherent bonuses when no appropriate magic item bonus applies.

These selectors are an engine DSL despite being serialized as strings. Centralize
them in one equipment-predicate module.

## Power calculation exceptions

Native power math includes special handling for:

- weapon versus implement attacks and special attack-stat selection;
- basic attacks, dual-weapon powers, and off-hand calculations;
- versatile damage, high crit, brutal, enhancement, proficiency, and magic critical
  expressions;
- `Dual Implement Spellcaster` (explicit name lookup) and distinct implement hands;
- augmentable power versions, item powers, and conditional damage components;
- power-specific exceptional hit/damage text through `SpecialCase`.

`CalcStrikers` confirms that Hunter's Quarry and Warlock's Curse are emitted as
conditional damage for damaging powers, while Sneak Attack first checks the
weapon's recovered groups/names. `CalcStriker` reads the feature's `... Dice`
stat, optional flat stat and `... Die` text override, then records the expression
with its once-per-round/turn usage instead of adding it to every hit. The hybrid
feature IDs additionally require a power from their Ranger, Rogue, or Warlock
class family. These observed branches are safe to model explicitly; similarly
named unknown feature variants are not.

The exact output is richer than `ability modifier + half level + proficiency +
enhancement`. Use the saved `PowerStats` corpus as golden oracles and keep every
component explainable.

## Porting policy

Initially port these branches verbatim in observable behavior and give each a named
test. Once parity exists, replace ID/name checks with declarative compatibility
metadata where possible. Do not "clean up" the exceptions during the first generic
interpreter implementation: they encode published-content behavior that the XML
alone cannot reproduce.
