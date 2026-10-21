# Recovered non-data-driven behavior

The legacy engine is not a perfectly generic interpreter. The following families
have explicit native branches and must be ported or deliberately converted into
new declarative compatibility rules. Function names and relevant locations are
searchable in `../generated/decompiled/D20RulesEngine/-Module-.cs`.

## Inventory command

`pnpm audit:legacy-special-cases [PACK.4ecp]` (private; needs the decompiled
code and a local pack) is the complete, checkable form of this catalogue. It
decodes every string literal in `D20RulesEngine` (the native `data(..)`
comments: UTF-16LE for `_W` arrays, single-byte otherwise),
`RulesEngineCommon`, `CharacterSheetViewer` and `CharacterBuilder` (whose
literals are SmartAssembly-encrypted; the audit recovers the resource key from
the call sites), classifies each against the pack, and groups the
content-targeting ones by member. Each member's modern status is reviewed in
`apps/content-tool/src/legacy-special-cases.ts`; the audit lists members
without a review and checks hand-maintained modern mirrors of legacy lists
(the boon types, the ignored prerequisite clauses) against the decompiled
literals. `--show=Member[,Member]` prints a member's decompiled source with its
literals decoded. Reports go to the ignored `tmp/legacy-special-cases/`.

Families recovered by the inventory beyond the sections below:

- **Prerequisite alias table.** Prerequisite `SpecialCase` maps about sixty
  exact clauses to other records or combinations (a bare `Shifter` means
  either shifter race; spellscar, weapon-talent, Flurry of Blows, Turn Undead,
  21st-level class, Harper, manifestation, healing-infusion and dragon-breath
  damage-type clauses, and more). `FirstSpecialCase`, `TwoKnowledgeSkills`,
  `HarperTraining`, `AnyClassSpecific`/`AnyClassMoreSpecific`/`AnyClassNoPsi`,
  `AnyWarlockPact`, `MulticlassDivine`, `ParagonMulticlassing`,
  `RememberedKnack`, `MoreThanOneClass`, `NonSpearPolearm` and `HeavyArmor` are
  further named clause predicates. `Ignore` skips eight clauses; `Unrecognized`
  turns any other unknown clause into an always-failing stub.
- **Item requirements.** `MeetsItemRequirement` maps two exact item
  `Requirement` texts to Internal records (living construct to Can Use
  Components; ki focus users to Ki Focus User); `MeetsItemPrereq` passes the
  familiar active-mode clause (and every other). See "Item requirements"
  below for the port.
- **Boons.** `RulesElementIsBoon` treats a Magic Item Type containing `boon` or
  `training`, or equal to one of eleven exact types, as a boon.
- **Power restrictions.** `IsRestricted` parses `You must be wielding ...`
  Requirement grammar to limit a power's weapon variants; `OtherRestrictions`
  handles the shield requirement; `IsValidPowerCombo` excludes one power by ID;
  `NonDamagePower` suppresses damage for four powers (two by name, two by ID).
  See "Power requirement restrictions" below for the port.
- **Attack and damage text.** `AttackPowerModRepl` and `ParseIncreaseLine`
  rewrite a handful of exact level-increase lines (plus two powers by name);
  `ExtractPowerMods` adds a Wisdom power bonus for one exact suffix;
  `AttackSpecialCase`/`ChosenAbility` resolve `Highest Mental Ability` and
  `Chosen Ability`; `HigherLevelDamage` and `CalcDamage` key a few powers by
  name.
- **Encounter uses.** `RulesElementEncounterUses` gives the six powers with one
  exact "twice per encounter" Special text two uses (three from level 16), and
  adds `_ADDITIONAL_USES` field and `<ID>_ADDITIONAL_USES` stat uses; only the
  character-sheet tracker reads it.
- **Arena Training.** `AddArenaWeapons` and `ArenaTrainingImprovisedWeapon`
  extend weapon keywords and improvised-weapon rules for the Arena Training
  feature.
- **Size.** `CanUseLargeWeapons`/`SmallWithNonSmallWeapon`/`ItemSlot` change
  wielding by the `Oversized`, `One Size Larger` and `Small` text strings.
- **Applications.** The builder and viewer key a few records by ID or name
  outside the engine: Awaken God Fragment and Mage's Spellbook show their
  wizard pages, Beast Mastery shows the companion page and sheet panel,
  Student of Sword Magic adds a spellbook, and mount names map to monster
  stat blocks. The rest of the application literals are presentation.

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

Recovered parser order (`InternalizeBlock` -> `InternalizeOr` ->
`InternalizeItem` -> `InternalizeElement`): a trailing period is dropped;
`HarperTraining` and the Circle of Smoke clause are matched whole; the block is
split at commas, and each part loses a `Prefixes` entry (`Training in`,
`Trained in`, `You must (be trained|have training) in` -> Skill Training;
`Must worship`, `You must worship`, `Worship`, `Follower of` -> Deity;
`Affiliated with` -> Background; `Proficiency with`, `Proficient with`, `Can
use the` -> Proficiency; `Fluent in` -> Language; `must worship a deity of
the`, `be a`, `(you )?must have the`, `have the`, `Either` -> no type). The
prefix's type persists into later comma parts until another prefix matches.
Each part splits at depth-zero ` or ` (never `1 or more`); an untyped item
loses a `Suffixes` entry (` Elemental Manifestation`, ` Racial Feature` ->
Racial Trait; ` Spell Source`, ` Paragon Path Feature`, ` Guild Training` ->
Class Feature; ` Regional Benefit`, ` Regional Background` -> Background;
` Racial Power`, ` Channel Divinity Power` -> Power; ` Class Character` ->
Class). The tables are native data decoded from `D20RulesEngine.dll`. Then
`InternalizeElement` tries `FirstSpecialCase`, every same-named record, the
ID, and the `"<name> <type>"` complex name (each with its CountsAs
alternate), then `SpecialCase`, `AbilityCheck`, `Ignore`, and finally
`Unrecognized` (always fails).

Modern port (2026-10-21, D089): the generic grammar is code in
`packages/rules-engine/src/prerequisites.ts` (`legacyClause`, applied only to
clauses the modern parser left unverified, except that `1 or more` no
longer splits and `paragon multiclassing in a <source> class` is read before
the `X class` form): the prefix/suffix tables, the Proficiency prefix carry-over, `Nth-level`,
the complex-name lookup, race-plus-class, `Any`/`At least one X feat`,
paragon multiclassing as/in, the class-specific multiclass families,
`Any warlock pact`, armor training, the weapon-group/hand/property
proficiency forms, and the psionic-daily and healing-infusion predicates.
Names it keys on are in `EXCEPTION_NAMES`. The exact-text aliases are
`Prereqs` rewrites in `content/corrections/93-prerequisites.part` (records
with `print-prereqs` only, so what players read is unchanged) and the
Shifter CountsAsRace in `92-legacy-special-cases.part`. Across the private
pack this took unverified clause uses from 650 (257 distinct) to 122 (59),
measured by `tsx scripts/audit-prerequisites.ts`. Story memberships
deliberately differ (D090): legacy maps spellscar, Harper, House Vadalis and
Circle of Smoke membership to records nothing grants, so it always fails
them; the rewrites instead accept a representing option (Harper Agent
background or theme; a Vadalis background; a `Spellscar` CountsAsFeature
granted by Student of the Plague, its Spellscarred class features and the
Spellscarred Harbinger starting feature) and keep the original wording as
an unverified alternative, so the audit still counts it. Also left
unverified: Circle of Smoke (no representing option),
`1 or more power points` (no power-point stat), the Dilettante predicates
(need choice provenance), aliased clauses on granted class features without
`print-prereqs`, and freeform prose the legacy parser also cannot read.

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

Defense/keyword-specific superior-implement bonuses are data-driven, not new
named exceptions. In recovered `-Module-.cs`, `CalcKeywords` (around line 25835)
splits the stat channel at `:`, treats the parenthesized suffix as a selected-item
limiter via `IsLimiterName` (around 22734), and requires every comma-separated
prefix token through `IsKeyword` (around 20876). `AttackKeyword` (around 25111)
uses shared typed maxima before adding component breakdowns; damage channels
follow `DamageKeyword`. Local content inspection confirms attack-defense and
damage-keyword channels on superior implements and, for holy symbols, their
training feats. The modern projection consumes those evaluated channels rather
than adding a second property-name-derived bonus. Descriptive property records
alone are not sufficient evidence of an executable contribution.

Basic-attack eligibility is explicit metadata, including feat-generated field
overlays: local Power of Skill definitions modify associated powers' hidden
`_BasicAttack` field to Melee/Ranged. Recovered `D20RulesEngine.IsBasicAttack`
(`-Module-.cs`, around 34377) accepts the ordinary basic attacks or a nonempty
workspace-resolved field. `BuildKeywordSet` (around 25801) then inserts melee
basic/ranged basic, which feeds the conjunctive `CalcKeywords` path above.
The modern evaluator must therefore consume the effective field after active
overlays for both eligibility and basic-specific attack/damage channels; reading
only the raw authored field misses feat-granted eligibility. This does not
replace the power's own ability/damage expression with the generic MBA formula.

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

### Power requirement restrictions

Recovered path: `WritePower` writes one `PowerStats` row per
`IterateWeapons` item (every owned weapon or implement) and one with no
weapon, each only if `IsValidPowerCombo` passes. That rejects
`ID_FMP_POWER_11615` outright; with no weapon it returns `AllowUnarmed`
(`!IsRestricted(null, null)`) for any power; an Implement-keyword power then
takes `IsValidImplement` and never reads its Requirement; a Weapon power
needs a `WeaponBase`, `!IsRestricted(weapon, DetermineOffhand(weapon))`, and
the melee/ranged fit.

`IsRestricted` reads `Requirement`. Without the `You must be wielding `
prefix it returns `OtherRestrictions`: only the exact `You must be using a
shield.` restricts, unless an equipped shield (`HasLoot("armor:shield")`).
Otherwise the rest is cut at commas; each clause loses leading space, then a
leading `a ` or `or a ` (not `an `), then one trailing `.`; a blank final
clause ends the loop. The requirement is met as soon as one clause is, and
restricted if none is. Clauses compare case-insensitively against fixed
branches, in order: `bow or a crossbow` (Group contains `bow`), `monk weapon`
(`IsMonkWeapon`: Club, Dagger, Spear, Monk Unarmed Strike by normalized name,
a staff, or no weapon), `two shields` (two equipped shields), `both a thrown
weapon and a melee weapon` (no off hand returns restricted at once; else one
hand melee and the other thrown), `light thrown or a heavy thrown weapon to
make a melee attack with this power` (a ranged-capable weapon), `two melee
weapons` (main and off-hand bases both melee); and, only with a weapon record:
`two melee weapons or a ranged weapon`, `ranged weapon`, `two-handed weapon`
(and its charge variant; Hands Required or stout), `melee weapon in two
hands` (`IsUsedTwoHanded`, with versatile use from Small without One Size
Larger or `_INTERNAL_VersatileUsedTwoHanded`), `two-handed reach weapon`,
`light blade with the light thrown property`, `heavy blade or light blade`,
`blowgun and use it for this attack`, `reach weapon`, `dagger` (and its
critical-hit variant), `spiked chain` (by name). Any other clause matches the
weapon's Group by substring (`light/heavy/thrown weapon` match Properties
instead) or `WeaponSwap`: a `<power Class>-<clause>` or `<associated feat>
association-<clause>` text listing the weapon's normalized name or `<Group>
group` (Rogue weapon talents, Harrowing Swarm). The weapon record is
`WeaponBase`: `WeaponEquiv` of the base or enchantment, a staff as
Quarterstaff (`ID_FMP_WEAPON_10`), else the base; with no weapon, a melee
power uses the `Unarmed Weapon` text's weapon or Unarmed Attack and a ranged
power has none. `DetermineOffhand` is the item itself when two are equipped,
else the first other equipped weapon or non-ki-focus implement, else the item
when it is a double weapon; `OffhandWeaponBase` prefers its `_Secondary End`.

Modern port (2026-10-21, D089): `packages/rules-engine/src/power-requirements.ts`
(`isPowerRestricted`) with the inputs bound per item in `powers.ts`
(`legacyRequirementContext`); names and IDs are in `EXCEPTION_IDS` /
`EXCEPTION_NAMES`. On the eight sample characters it removes all 14 variants
legacy did not list (Twin Strike, Dire Wolverine Strike, Sudden Strike,
Ruffling Sting, Howling Strike) and adds no mismatch; cached attack/damage
matches are unchanged. Wordings the grammar cannot read reject every weapon,
as in legacy. Where the published wording is a restatable variant, a
machine-read `_WeaponRequirement` in `content/corrections/94-power-requirements.part`
restates it in the grammar (15 powers: `X or a Y` lists, trailing conditions
the sheet cannot check, a reworded named branch, Bloody Throw's hand-specific
pair). Implement powers with a wielding requirement (tome, wand, orb,
bow) lose only their Unarmed row, as in legacy.

Beyond legacy (product owner, 2026-10-21): `_WeaponRequirement`, and only
it, also reads weapon selectors (`extendedClause`, gated so every power
without the field stays branch-exact): `weapon:<ID or name>` (same
normalized name, so Large sizes, double-weapon ends and magic weapons on the
base count), `group:`, `property:`, `melee`, `ranged`, `thrown melee`
(also makes the power melee-only, like the native thrown-melee Requirement),
`A & B` (one hand each, either order, using DetermineOffhand), `A & free
hand` (no off-hand weapon or implement and no shield), and `any`. Only
`weapon:` can match the Unarmed row. A condition the sheet cannot check is
dropped for row eligibility, as for the trailing conditions above. This gives
the 30 powers legacy left without weapon rows exactly the rows their
Requirement allows: bola, net (Net Snare's "use it for this attack" is the
row), cahulaks, dragon paw, gouge, gythka and lotulis powers by weapon;
`greatbow or a longbow` and `rapier or a short sword` as two weapons;
Steel Scream, Soothing Reverberation and Mind-Bending Blades as longsword `&`
melee; Fang and Web Strike as crossbow group `&` light blade group;
Shocking Skewer as off-hand property `&` free hand; Tag Quarry, New Victim
and Form of the First Hunter Attack as `melee` (their thrown-at-range
condition is met by a melee weapon, so it rejects only ranged-only weapons);
Coward's Reward (Ranged 5, the weapon is thrown) as `thrown melee`; and
Throw Grapple as `any`, because a grappling hook is gear the app cannot
equip. Soothing Reverberation and Net Shield have no attack or Hit line, so
they still get no rows, as for any utility. Verified on the private pack
with every weapon (single rows) and equipped pairs (longsword with dagger,
bow, or a second longsword; hand crossbow with dagger or mace; off-hand
weapon with a sword or shield; magic weapons on the base); the eight sample
characters' cached PowerStats comparison is unchanged.

### Item requirements

`MeetsItemRequirement` is called by `EquipLoot` (and the auto-build `IsLegal`)
for each item's base and enchantment. A failure flags the item; an equipped
one makes the character not legal, listed by `UpdateHouserules` as custom
equipment. The item stays in the shop, can be bought and equipped, and its
rules still execute. Modern port: `meetsItemRequirement` and
`ITEM_REQUIREMENT_RECORDS` in `packages/rules-engine/src/exceptions.ts`; the
evaluator raises `item.requirement-unmet` for an equipped item that fails,
clears `legal`, and the builder shows it as a house-rule issue. The shop
does not filter or flag it, as in legacy.

## Porting policy

Superseded by D089 (`docs/decisions.md`, 2026-10-20): fix content-specific
special cases in the corrections pack where the data can express them, and
keep code for engine semantics. The original policy follows for history.

Initially port these branches verbatim in observable behavior and give each a named
test. Once parity exists, replace ID/name checks with declarative compatibility
metadata where possible. Do not "clean up" the exceptions during the first generic
interpreter implementation: they encode published-content behavior that the XML
alone cannot reproduce.
