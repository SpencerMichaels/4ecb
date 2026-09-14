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
- `CategoryMatch::Matches` has an additional power-only theme branch: when the
  ordinary selected-class scan fails for `$$CLASS`, it tests the candidate
  `Power` against the character's selected theme. Theme powers identify that
  relationship through `Class`/`_ThemePower`; this is why Dune Trader's Sly
  Gambit legally fills an ordinary level-7 encounter-power slot. The exception
  does not make theme feats or other record types class choices.
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
- Archery Mastery's three selected feature records
  (`ID_CDJ_CLASS_FEATURE_34501` through `34503`) have no declarative replacement
  rule. The legacy workflow nevertheless lets their Clever Shot, Rapid Shot, or
  Aimed Shot power replace a leveled Ranger at-will attack. The replacement is
  optional and uses the selected mastery feature as its provider.

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

`EquipLoot` executes the base holding and its enchantment and then calls
`EssentialsMagicArmor`. For a base `Armor` record whose `Minimum Enhancement
Bonus` is zero, that method parses the base `Armor Bonus`, classifies `Armor
Type` as heavy or light, parses the enchantment's `Enhancement`, and applies the
hard-coded adjustment table below. A nonzero minimum marks an already-masterwork
base and bypasses this substitution.

| Enhancement | +0 | +1 | +2 | +3 | +4 | +5 | +6 |
| ----------- | -- | -- | -- | -- | -- | -- | -- |
| Light       | 0  | 0  | 0  | 0  | 1  | 1  | 2  |
| Heavy       | 0  | 0  | 1  | 2  | 3  | 4  | 6  |

The method changes both the base record's displayed `Armor Bonus` and that
holding's `Armor Class` stat contribution with bonus type `Armor`; enhancement
remains a separate typed contribution. Consequently ordinary heavy armor gains
+1 base AC when paired with a +2 armor enchantment. In
`PanelItemModelDefense.Update`, the character-sheet ARMOR/ABIL field is the sum
of AC contributions whose type is `Armor` (or `Ability` for other defenses), so
it displays the adjusted base rather than base plus enhancement.

Damage parsing recognizes the literal token `beast's`, consumes the following
ability name, reads that score from the first selected beast companion, and
adds its modifier with a `beast's <ability> modifier` component label. A
character ability of the same name is not a fallback when the companion is
absent.

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

The power `SpecialCase` body also has a fixed-output family. It checks Bond of
Censure by exact name and returns `1d10`, or `2d10` at level 21, before the
ordinary prose ability parser. Later equipment processing still supplies
implement enhancement. Three exact hit forms return `ongoing 10`: Brilliant
Beacon's radiant line, Baleful Gaze of the Basilisk's stunned poison line, and
the Contagion prefix that continues with a failed-save rider. The other decoded
strings are distinct branches and must not inherit these results by similarity.
The exact slowed/ongoing string separately initializes `ongoing 10+0` and then
parses Dexterity, yielding `ongoing 10+<modifier>`; it is not one of the fixed
ongoing-10 results.

Additional recovered calculation branches establish several non-obvious
equipment rules. `BuildKeywordSet` includes serialized implement subtype and
weapon slot/hand fields, so qualified channels such as totem implement and
two-hands participate in rule matching. `WhichAttack` chooses the ranged clause
of an explicit melee-or-ranged power when the selected weapon has range,
including a thrown melee weapon, and otherwise chooses melee. `CalcBonuses`
handles the exact weapon-group prose used by the observed Strength-attack and
Constitution-damage power families. `CalcVersatile` adds one weapon damage only
while a Versatile weapon is used without another weapon or shield. Rage Strike's
native branch returns the literal `As Above`; it is not parsed as ordinary hit
math. Each behavior is pinned by public synthetic differentials rather than by
unknown-revision cached totals.

The native `CategoryMatch::Matches` path applies every positive category term
and its dynamic class term; it has named exceptions for custom rules, diverse
study, universal skills, seeker, and versatile master, but it does not need a
special exception for the racial and skill utility powers shown in an ordinary
class utility slot. Their authored data supplies the relationship. Skill powers
carry the stock class category IDs (including Ranger) and use prerequisites such
as `Trained in Nature` to narrow legality. Racial utility powers instead carry
the synthetic `ID_FMP_CLASS_0` (`Any Class`) category and use a race prerequisite
such as `Elf`. The stock builder includes `Any Class` in `$$CLASS`, so an Elf's
level-6 class utility choice includes `Leave No Trace` while the same authored
record remains illegal for another race. The Skill Power feat's
`$$LEVEL,Skill Power` rule is an additional acquisition path, not evidence that
skill powers are excluded from ordinary utility slots. Modern category expansion
preserves these authored paths and leaves their prerequisite checks intact.

The exact output is richer than `ability modifier + half level + proficiency +
enhancement`. Use the saved `PowerStats` corpus as golden oracles and keep every
component explainable.

## Porting policy

Initially port these branches verbatim in observable behavior and give each a named
test. Once parity exists, replace ID/name checks with declarative compatibility
metadata where possible. Do not "clean up" the exceptions during the first generic
interpreter implementation: they encode published-content behavior that the XML
alone cannot reproduce.
