# Legacy Character Builder calculation-logic audit

## Scope and evidence boundary

This audit traces how the original builder turns an assembled character into
numbers: the generic stat engine in `D20RulesEngine/-Module-.cs`
(`CalculateStatValue` and its helpers), the handful of stats native code
injects, the derived sheet values the CharTracker panels decompose, and the
power-row pipeline (`D20Workspace.PowerStats` and the `Calc*` family) that
writes `<Power><Weapon>` rows into a save. It complements the
[construction-logic audit](11-construction-logic-audit.md), which stops once
the active element tree is known.

Native line numbers are approximate and refer to `-Module-.cs` and
`D20Workspace.cs` as recovered by ILSpy (a private copy with decoded string
literals keeps the same numbering). Modern code is cited by file under
`packages/rules-engine/src/`. Private evidence (sample saves in `sample-chars/`
and `CharacterBuilder/SampleChars/SampleHeroes/`, the locally built content
pack, probe scripts and the parity baseline) is referred to by name only. No
decompiled source, private corpus content or official rules text is copied
here; record names, field names and selector operands are used as
identifiers, and power wording is paraphrased.

Native code computes very few sheet numbers itself. Defenses, hit points,
surges, initiative, speed, skills, passive skills, saves and resistances are
content `statadd`s on Level, Class, Race and internal skill/ability records,
evaluated by the one generic stat engine. The stat engine's semantics, the
stats native code injects, and the power-row pipeline are therefore the whole
calculation surface; the panels only decompose and format those values.

### Evidence labels

The labels from [00-evidence-and-scope.md](00-evidence-and-scope.md) are
qualified by their source:

- **Confirmed (save)**: a legacy save's cached `<Stat>` block or `<Power>` row
  shows the value, and the arithmetic reconciles.
- **Confirmed (parity)**: `pnpm parity:baseline` over the sample saves agrees.
  Parity compares only attack bonus and damage per row and never reports a
  modern row that legacy lacks.
- **Inferred (code)**: native behavior read from unambiguous decompiled control
  flow, but no sample save exercises it. Where noted, the modern side was
  measured with a probe on synthetic content.

The confidence column distinguishes **high** recovery clarity from **medium**
where native strings were decoded indirectly or a branch is only partly
traced.

### Modern status vocabulary

- **Reproduced**: current `main` matches native. A commit hash means it was
  fixed during the 2026-10-28 overnight parity batch.
- **Fix in progress**: a fixer is working on it, or a fix is committed on a
  branch that is not yet merged into `main`.
- **Open**: `main` differs from native and no fix is in flight.
- **Divergent by decision**: `main` deliberately differs, under the cited
  decision in `docs/decisions.md`.

## End-to-end entry points

| Surface | Recovered entry points traced | Result |
|---|---|---|
| Stat value | `CalculateStatValue` (~36170–36280), `CalculateStatAddValue` (~36137), `StatAddApplies` (~36109), `AddStatValue` (~36000), `SetStatToZero` (~36070) | One pass over a stat's statadds in record order, with one typed-maximum table per evaluation call that linked stats share. |
| Statadd parse | `ParseOneRule` (~32114), `ParseStatAdd` (~31955), `BracketSubstitute` (~34699) | Value is a literal or a ±1 link (optionally through `ABILITYMOD(`, `MINONEMOD(`, `HALFMOD(`); stat names undergo select-name substitution. |
| Rule execution | `ExecuteRulesStatement` (~35501), `ProcessStat`, `ProcessStatAlias` (~34750) | Statadds are stored unconditionally; their conditions are tested at calculation time. |
| Injected stats | `D20Workspace.UpdateInternal` (~137–275), `GrantAbilityScore` (~16203), `TallyLoot` (~379–435), `Psionics` (~16370), `GroupSetCounts` (~19691), `UserEditStatAdd` (~4046) | Ability bases first, then element rules, level roots, psionics, then loot; each injection is an untyped literal statadd. |
| String stats | `CalculateStringValue` (~36280), `GetStackedTextString` | Last applicable string wins unless the stat stacks, when values are joined. |
| Power rows | `D20Workspace.PowerStats` (~3864–3945), `IsValidPowerCombo` (~3963) | Per weapon/implement pair: stat-vs-defense, base attack, damage, strikers, keywords, global bonuses, versatile, misc, bonuses, healing, stacking text. |
| Row set | `WritePowers`/`WritePower`/`WritePowerStat` (~11820–11935), `BuildWeaponsList` (~22312), `weapon_sort` (~22092) | One row per eligible loot in native sort order, then an Unarmed row. |

## Behavior ledger: the stat engine

| Area | Native behavior | Modern status (main) | Evidence label | Confidence | Likely modern impact |
|---|---|---|---|---|---|
| Value parse | A digit after an optional sign is an integer literal (C `_wtoi`, so a dice string would read as its count); otherwise a ±1 link to a named stat, optionally through `ABILITYMOD(`, `MINONEMOD(` or `HALFMOD(`. | Reproduced; `MINONEMOD()`/`HALFMOD()` in `6a2056c`. | Inferred (code); the only non-integer literal is on a `condition`al statadd and is never summed. | High | None known. |
| Attributes | Type, condition, zero, non-zero, half-point, statmin, value, link flags, requires, wearing, not-wearing; attribute names are case-insensitive. | Reproduced. | Inferred (code); a handful of `Type=` statadds in content rely on case-insensitivity. | High | None. |
| Lazy conditions | `ProcessStat` stores every statadd; `requires`, `wearing`, `not-wearing`, `statmin` and level are tested in `StatAddApplies` at calculation. `textstring`/`statalias` test their conditions eagerly at execution. | Reproduced: `requires` at rule time and equipment at stat time converge under the fixed point. | Inferred (code). | High | None known. |
| Typed stacking | Untyped values always add. Each type keeps one maximum; a non-penalty value replaces it when larger (or when the type is still 0 and no 0 was applied); a penalty (negative literal or negative multiplier) lowers a type only while it is ≤ 0 and is ignored once a same-type bonus holds; a non-negative value clears a negative type. | Reproduced (D103, `addTyped` in `stats.ts`). | Confirmed (save): DV's AC with two Swordmage Warding links. | High | Fixed before this audit. |
| Stacking order | The typed rule is order-dependent (a penalty followed by a bonus is replaced; a bonus followed by a penalty ignores the penalty). Native order: ability bases, element rules in tally order, level roots, psionics, loot statadds last. | Reproduced by occurrence order; the order is not asserted by a test. | Inferred (code); no content has a positive and a negative statadd of the same type on one stat. | Medium | None today. |
| Typed literal 0 | `SetStatToZero` removes the type's value and blocks the type for the rest of the stat, independent of order. | Reproduced (`zeroType`). | Confirmed (save, D103). | High | Armor-penalty and speed removals by armor type. |
| Untyped literal 0 | An untyped, unlinked literal 0 that passes `StatAddApplies` sets the stat to 0 and ends the loop; later statadds are skipped; gated sums collected so far still apply. | Reproduced (`6a2056c`, D104): contributions report `zeroed`. Armor Specialization (Chainmail) and Battle Agility are corrected to typed `Chain`/`Scale` zeroes, so a shield's penalty stays (D105). | Inferred (code); probe confirmed the old modern value. | High | Armor Specialization (Chainmail), Battle Agility (armor check penalty), Level 30 `XP Needed`, and any native injection whose value is 0. |
| Conditional statadds | A `condition`al statadd never adds; it feeds reminder text. Also skipped inside links. | Reproduced. | Confirmed (save): KrizDevvon's Will excludes two conditional lines. | High | None. |
| Zero/non-zero gates | Gated statadds are summed separately; after the loop the non-zero group is added (untyped) if the ungated total is non-zero, else the zero group. Inside a linked stat the gated sums are local and discarded. | Reproduced (`6a2056c`, D104), including the drop inside links. | Inferred (code); `audit:selectors` finds no sample reaching a gate. | High | Resistances and Knowledge checks only; no gated stat is linked today. |
| Half-point | A half-point statadd adds its own value; a per-call toggle adds +1 under its type on every second applying half-point statadd. A linked stat has its own toggle. | Reproduced (`698a32d`). | Confirmed (save): Alysa Redfield's Healing Surges 10 and Valria's Vampire surge adjustment; probe for two negative halves. | High | No content stat has two negative half-points; provenance shows fractions. |
| Linked stats | `CalculateStatAddValue` evaluates the linked stat with the **parent's** typed-maximum table; `ABILITYMOD` → modifier, then `HALF` (C truncation), then `MINONE`, then the multiplier; a negative multiplier marks a penalty. | Reproduced (D103; link flags in `6a2056c`). | Confirmed (save, D103). | High | Fixed before this audit. |
| Ability modifier | `GetAbilityMod(score)` is 0 for a score of 0, else `score/2 − 5`. | Reproduced (`a07a872`): `abilityModifier(0)` is 0. | Inferred (code). | High | Blank-score imports only. |
| Ability bases | Each pass first injects every base as an untyped literal. A blank (0) base is an untyped literal 0, so racial and level increases are discarded and the modifier is 0. | Engine rule reproduced (`6a2056c`); the blank-score modifier is fix in progress. Modern records default to 8/10, so only imported incomplete saves can be blank. | Confirmed (save shape: the base is the first statadd in every ability block); blank case inferred. | High | Incomplete legacy imports. |
| Weight | `TallyLoot` sums loot weight × count across levels (excluding Transportation), truncates, and appends it as an untyped literal after rules; a total of 0 zeroes rule additions. | Reproduced; a holding whose definition the pack lacks makes Weight unknown by design. | Confirmed (save): Beldin Hammertongue 11's Weight is loot plus a rule +1. | High | Weight-0 edge only. |
| Hybrid Power Points | `Psionics` injects 2/4/6 per owned augmentable at-will attack power of a psionic class (by power level), strips Augmentable from locked powers, and applies Psionic Conventionalist; the internal Hybrid Power Points record and Psionic Dabbler link it into Power Points. | Reproduced (`6d4b074`). Psionic Dabbler's swapped at-will counts by its own At-Will usage despite the feat's Encounter modify, giving 2/4/6 (D105, PHB3 p195; native counts 0). | | Confirmed (save): Beldin's Hybrid Power Points (unlinked, full Ardent); the linked case is inferred. | High | Power Points for hybrid psionic classes and Psionic Dabbler. |
| Item-set counts | `GroupSetCounts` injects set counts as untyped literals. | Reproduced (`6a2056c`) for group sets; item sets are audited with equipment. | Inferred (code). | Medium | Set bonuses. |
| Bracket substitution | Statadd and textstring stat names pass through `BracketSubstitute`: `[Select Name]` becomes the named select's chosen element name, or the literal "no selection". | Reproduced (`8c2dd08`). | Inferred (code). | High | Signature Spell (Archspell) loses its attack bonus to the chosen daily. |
| Aliases | `statalias` makes several names one stat. | Reproduced. | Confirmed (save). | High | None. |
| `statmin` | Applies unless the stat exists and its stand-alone value is below N; "exists" means any statadd or link has named it. | Reproduced (`6a2056c`, D104). | Inferred (code); no sample reaches it. | High | Superior Defense-style heavy-armor AC. |
| Level gating | A statadd recorded at level L is ignored when the stat is evaluated at an earlier level. | Reproduced by per-level evaluation. | Confirmed (save: `Level=` on every statadd). | High | None. |
| Per-level cache | A level-scoped evaluation without a typed table is cached per level for the rest of the pass; level-less (sheet) evaluations are not. | Divergent only mid-pass: modern evaluation is a pure function. | Inferred (code). | Medium | In-pass `requires`/`statmin` checks only; sheet values unaffected. |
| String stats | String statadds are separate from numeric ones; non-stacked → last applicable wins; stacked → joined. | Reproduced (`textContributions`, Action Point stacking). | Confirmed (save). | High | None. |
| Empty type | `type=""` is stored through `FillStringField`; whether that is one shared empty type or untyped was not determined. | Treated as untyped. | Inferred (code), unresolved. | Medium | Only if both `type=""` Armor Penalty statadds reach one character. |
| User edits | `UserEditStatAdd` appends an internal statadd at the latest level, typed by the bonus name. | Reproduced, including a literal 0 zeroing the stat. | Inferred (code). | High | User-edited saves. |

## Behavior ledger: derived sheet values

All of these are content statadds evaluated by the engine above; the native
column names only the formatting or formula native code adds.

| Area | Native behavior | Modern status (main) | Evidence label | Confidence | Likely modern impact |
|---|---|---|---|---|---|
| Abilities and modifiers | Base + race/level statadds; panel modifier is `GetAbilityMod`. | Reproduced except the blank-score case above. | Confirmed (save): Hystan's Con. | High | Blank imports. |
| Half level | Content `HALF-LEVEL` statadds on even Level records; panels read the stat. | Reproduced; UI reads `halfLevel` in `derived-values.ts`. | Confirmed (save). | High | None. |
| Defenses | 10 + half level + `type="Ability"` modifiers (heavy armor excluded by `not-wearing`) + class/feat/enhancement/item; panels decompose by type. | Reproduced. | Confirmed (save): KrizDevvon's Will. | High | None. |
| Hit points, bloodied, surge value | Content level-1 and per-level HP; panel bloodied = HP/2 and surge value = HP/4 + `Healing Surge Value`, integer division. | Reproduced (`derived-values.ts`). | Confirmed (save). | High | None. |
| Healing surges | Content Con modifier + class, with half-point pairs for hybrids. | Reproduced (half-point algorithm above). | Confirmed (save): Alysa Redfield. | High | None. |
| Initiative, speed, size | Content statadds; armor speed penalty typed `Armor`, typed-0 removals. | Reproduced. | Confirmed (parity). | High | None. |
| Skills and armor check penalty | Half level + ability + trained + `Armor Penalty` + `<Skill> Misc`, the misc link sharing caps. | Reproduced, including the untyped-0 removal (`6a2056c`). | Confirmed (save, D103); untyped 0 inferred. | High | Fixed. |
| Passive skills | `10 +` Perception/Insight links sharing caps. | Reproduced. | Confirmed (save, D103). | High | None. |
| Saves, resistances | `Saving Throws`, `Death Saving Throws`, `resist:*`; text built by `BuildSavingThrowString`/`BuildResistancesString` with conditionals appended. | Reproduced (`defensive-traits.ts`). | Inferred (code). | High | None. |
| Conditional reminders | `BuildConditionalString`: an unlinked statadd shows its literal; a linked one shows the linked stat's stand-alone value (modifier applied, multiplier and half/min-one ignored). | Display divergence: modern applies the multiplier. | Inferred (code). | Medium | Reminder text only. |
| Action points | `_BaseActionPoints`; current count from the tracker text or the stat. | Not surfaced (play mode is M6); the Action Point card exists. | Inferred (code). | High | None. |
| Encumbrance | Weight (≥ 0) + coin weight; load against Str-based thresholds plus `Weight Discount`. | Reproduced (`encumbrance.ts`). | Confirmed (save): Beldin. | High | None. |
| XP Needed | Each Level adds its step; Level 30's untyped `+0` zeroes it. | Reproduced (`6a2056c`); evaluated but not shown. | Inferred (code). | High | None. |
| Beast companion | Companion abilities; HP from first-level + per-level stats; surges = stat + 2 unclamped. | Reproduced (clamped ≥ 0, a deliberate sane divergence). | Inferred (code). | High | None in practice. |
| Familiar | Master defenses + `FAMILIAR.`/`ALLY.`/`COMPANION.` stats, 1 HP. | Reproduced (D095). | Confirmed (D095). | High | None. |

## Behavior ledger: power rows

| Area | Native behavior | Modern status (main) | Evidence label | Confidence | Likely modern impact |
|---|---|---|---|---|---|
| Row list and order | `BuildWeaponsList` takes every counted loot whose WeaponBase is a weapon or names an implement, plus one ki-focus row per weapon base; `weapon_sort` orders equipped first, then main hand, then item level, then enchanted. | Reproduced (`loadouts`, ki rows, legacy main-hand order check). | Confirmed (parity: main hand 59/59). | High | Order only. |
| Valid combinations | `IsValidPowerCombo`: implement powers pass `IsValidImplement`; weapon powers need a WeaponBase, must not be restricted and must fit melee/ranged; Unarmed through `AllowUnarmed`. | Reproduced except where D093 keeps situational-requirement rows. | Confirmed (parity; save for D093 cases). | High | Row set only. |
| Implement rows | `CheckPower` ends in an unconditional accept, so any weapon serves an implement power and its enhancement applies. | Divergent by decision (D081): every owned weapon/implement is listed, non-proficient rows hidden by default. | Confirmed (save): Hu Sheng-Ming's holy-symbol row arithmetic. | High | Display only. |
| Unexplained implement omissions | Legacy omits some owned equipped items from implement rows although `CheckPower` accepts them (Trey Spectre's greataxe, Hunzu's symbol). | Open (unexplained); D081 hides these rows anyway. | Confirmed (save: rows absent). | Medium | None visible. |
| Row gating | Rows only with a Hit line, `EffectPower` or the Healing keyword; a Healing power without a Hit line gets a placeholder row. | Divergent by decision (D094): attacks without a Hit line keep a row; no healing placeholder. | Confirmed (parity). | High | None. |
| Restrictions | `IsRestricted` (wielding clauses, weapon swaps, monk weapons, two weapons). | Reproduced; D093 stops second-weapon/shield/free-hand clauses filtering rows. | Confirmed (save): extra modern Twin Strike rows. | High | Row set only. |
| Off-hand | `DetermineOffhand`: same loot when equip count > 1, else the next equipped weapon or non-ki implement, else the double weapon's other end. | Reproduced (`legacyOffhand`). | Confirmed (parity). | High | Two-weapon channels. |
| Unarmed melee base | For a melee power without a weapon, the WeaponBase is the record named by the `Unarmed Weapon` text (Belt of the Brawler → Club), else `Unarmed attack`; it feeds weapon keywords, proficiency bonus and weapon dice. | Reproduced (`f533156`): `withUnarmedWeaponBase` gives a melee power's Unarmed row the record's keywords, proficiency bonus and Damage with `:die` steps; one helper also feeds requirements, strikers and `CalcBonuses`. | Inferred (code); probes (a sample + Brawler Style: Unarmed rows +2 attack; + Belt of the Brawler: Club +2 proficiency, 1d6). RaidonKane's older save keeps Weapon Focus (Unarmed) off its Unarmed basic attack (1d4+3; modern 1d4+5): unresolved. | High | Brawler Style, Versatile Expertise (Unarmed), Weapon Expertise/Focus (Unarmed), Belt of the Brawler. |
| Enchant equivalents | `WeaponEnchant` reads the base's `EnchantEquiv` record (10 items) for a weapon power. These items (rods, Boar Tusk Helm) attack only through WeaponBase's `WeaponEquiv`, which `BuildWeaponsList` keeps as a row. | Reproduced: a non-weapon loot whose `WeaponEquiv` is a weapon (rods as maces, Boar Tusk Helm, Feral Armor and Climbing Claws, shields) now has weapon-power rows, which were missing; `EnchantEquiv` supplies their enhancement and keyword enchantment (`weaponPowerOverrides`). The row's critical stays the item's own (native PowerStats reads none). | Inferred (code); probe (chopper farlund + Rod of Smiting +1: a mace row at +12, 1d8+6; + Boar Tusk Helm: +13, 1d10+7 with Magic Weapon +2). No save owns such an item. | High | WeaponEquiv items in weapon powers; Boar Tusk Helm +2/+4/+6. |
| Attack line selection | First non-empty attack field; a level-11/21 attack text replaces the line; theme powers read level headers. | Reproduced (modern supports every authored attack). | Inferred (code), probe. | High | None. |
| Highest/mental/chosen ability | `CalcStatVsDefense`: "your highest ability" and "primary ability" prefixes → `HighestAbility` over all six scores (strict >, first wins); "highest mental ability" → Int/Wis/Cha by score; "chosen ability" → the `Chosen Ability` string stat; a `±N` suffix is a power modifier. | Reproduced for highest, highest mental and chosen (`cc20870`; bare "Highest ability" lines without "your" also resolve, D105; Trey Spectre 12's saved Sohei Flurry row shows legacy resolves them too). "Primary ability" reproduced too (owner decision): HighestAbility over all six scores, no longer the best class key ability. | Inferred (code); probe shows the modern loss (a wizard key-ability Intelligence 16 with Constitution 18 now attacks with Constitution); parity is unchanged on the eight samples with primary-ability powers (DV, Fei Zhu, Hystan 7/8, Hu Sheng-Ming, Beldin, silaqui, Trey), whose highest score is a class key ability. | High | 36 highest-ability attack lines, 1 highest-mental, 2 chosen, 126 primary-ability; the whole ability modifier plus +4/+6/+9. |
| Wisdom rider | `ExtractPowerMods` adds Wisdom for one exact attack-line ending (Hawk's Talon). | Reproduced (`cc20870`). | Inferred (code). | High | 1 power. |
| Alternative selection | `WhichAttack`: a melee-or-ranged dual line takes the ranged alternative with a ranged (or thrown) weapon; an "A, B, or C" line takes the highest. | Reproduced (`cc20870`), except Reactive Shot (D105, Martial Power 2 p41): a thrown weapon uses Strength and any other weapon Dexterity, for attack and damage alike; native gives a bow Dexterity attacks but Strength damage. | Inferred (code). | Medium | Attacks on the Run, Reactive Shot. |
| Key-ability overrides | `OverrideStat`/`OverrideStatList`/`OverrideByAssociation`/`OverrideStatPower`. | Reproduced (`key-ability-overrides.ts`, power-ability choices). | Confirmed (parity). | High | None. |
| Fey Pact Charisma | Two Fey Pact warlock saves attack with Charisma on Constitution attack lines (test_test's Diabolic Grasp, oleander_9's Feast of Souls). | Not a native factor: the player's homebrew warlock-ability-options part rewrites 186 warlock attack lines to "Charisma or Constitution"; the pack lacks it. No modern change. | Confirmed (save). | Medium | 3 points attack and damage on two saves. |
| Base attack | `CalcBAB`: ability through the attack's typed table, which also registers ability modifier, `HALF-LEVEL`, `Proficiency Bonus` and `Enhancement` caps; proficiency only for weapon powers; enhancement with any main-hand loot. | Reproduced for Enhancement; the other three caps are not shared. | Confirmed (parity) / inferred. | Medium | No content found that collides. |
| Damage expression | `CalcDamage`: higher-level damage, "twice", "X modifier", added ability terms, multiple-ability choices, "highest"/"ability" → `HighestAbility`, damage stat → attack stat, then weapon dice, dice-only enhancement and Dual Implement Spellcaster. | Reproduced for common forms, including "your highest ability modifier" (`cc20870`). The bare "+ [your] ability modifier" term (67 Hit lines, all on primary-ability powers) and a leading "Ability modifier ..." (Sudden Slime, which dealt no damage before) are `HighestAbility` unless a key-ability `DMG:` override makes them follow the attack; "+ primary ability modifier" (Elemental Eruption, Soul Scourge) resolves the same way (D105: native would look up a "primary" stat). | Inferred (code), probe. | High | 39 Hit lines. |
| `_DamageDie` | `ParseDamage` lets a power's `_DamageDie` field replace the size of the first die (set by `modify` from Empowered Dragon Breath and Greathorn). | Reproduced (`cc20870`); registry entry added. | Inferred (code), probe. | High | Dragon Breath, Goring Charge dice size. |
| Higher-level damage | `HigherLevelDamage`: increase lines, a by-name Chilling Cloud rule doubling Intelligence at 21+, one exact rewrite, `ParseIncreaseLine`, separate level fields. | Increase lines and named scaling reproduced (`65aa0c7`). Chilling Cloud and "twice X modifier" reproduced (`cc20870`), keeping the cold type at 21+ (D105). | Confirmed (parity/tests) / inferred. | High | Chilling Cloud at 21+. |
| Special damage | `SpecialCase`, `NonDamagePower`, `EffectPower` (Storm Pillar). | Partial, already tracked in the special-case registry. | Inferred (code). | Medium | A few powers. |
| Weapon dice | N[W] multiplies dice count; off-hand terms use the off-hand item; loot damage override; die increases; arena improvised dice. | Reproduced, the Unarmed base included (`f533156`). | Confirmed (parity). | High | None. |
| Keywords | `AddWeaponKeywords`, `BuildKeywordSet`, `AttackTypeKeywords`, `AddLaterKeywords`, `AdditionalKeywords`, `InsertParagonPath`. | Reproduced; `_PowerstatKeywords` (`98a4ade`) and the `<class> Paragon Path` channel (`8565dc5`). Unarmed keywords reproduced (`f533156`). `AddArenaWeapons` reproduced: an "Arena Weapon" property base adds every other such weapon's keywords; no current record has the property (Arena Training list-adds the "Arena" group), so it is a no-op on the pack. | Confirmed (parity, tests). | High | Channel bonuses. |
| Keyword bonuses | `CalcKeywords`, `AttackKeyword`, `DamageKeyword`, `CalcGlobal` with one typed table per row. | Reproduced (`combatStatEntries`, `stackTypedComponents`). | Confirmed (parity). | High | None. |
| Strikers | `CalcStrikers`/`DiceAdjustment`. | Reproduced as reminder text. | Confirmed (parity: Drizzt, Japheth). | High | Conditions only. |
| Versatile | `CalcVersatile`: +1 only when the character-global two-handed flag is set and `SmallWithNonSmallWeapon` is false. | Per holding by D101 (decision). A Small character's non-small versatile weapon fills both hands (D102) without the +1, as native and the PHB say: reproduced (`3d7238b`). | Inferred (code); tests. | High | Small characters with a versatile weapon (none in the samples). |
| WeaponBonuses | `CalcMisc`: a power's `weapon` field matching one of 16 exact table texts adds an ability modifier to attack or damage when wielding a listed group (flags: attack, half with C truncation, needs off-hand); `beast` fields → `CalcBeast`. | Reproduced (`de36186`): the exact 16-line table, a repeated rider counted once per attack (D105, Giant's Wake). The 13 riders native's table misses (9 Constitution, 4 Dexterity/Constitution) get CBLoader-style `<ID>,<group> group:damage` statadds in `content/corrections/9E-rules-divergences.part` (D105); the former code superset is removed. | Confirmed (save) for the two lines chopper farlund prints; rest inferred plus probe. | High (table decoded from the DLL) | Several build-option powers. |
| CalcBonuses | Non-standard power fields named "Special", an owned element (Brutal Scoundrel, Rageblood Vigor, a pact, an aegis…) or "axe" with an axe-group base: seven exact sentences add Int/Wis/Con/Str to damage (typed by field name) or Str to attack, on every row including Unarmed. | Reproduced (`de36186`). | Inferred (code), probe. | High | 31 powers. |
| Healing | `CalcHealing`: "Healing", `<power>:healing`, `<class>:healing` with one typed table. | Reproduced (`powerHealing`). | Confirmed (parity). | High | None. |
| Stacking text | `CalcStacking`, `NamedBonus`, `SameSource`, `MergeConditionals`: text only. | Presentation only. | Inferred (code). | High | None. |
| Damage type | Set only for an "X modifier <type>" phrase with a single listed word. | Divergent: modern derives a richer type from the Hit text. | Confirmed (parity: 93 rows legacy leaves empty). | High | Display and exported `DamageType`. |
| Increase rewrites | `AttackPowerModRepl`, `ParseIncreaseLine`. | Reproduced (`65aa0c7`). | Confirmed (parity, tests). | High | Fixed. |
| Uses per encounter | `RulesElementEncounterUses`: 2 (3 from 16th) for four exact twice-per-encounter texts, else 1 + `_ADDITIONAL_USES` + `<ID>_ADDITIONAL_USES`. | Reproduced (`893f5b9`) with two D105 departures (whitespace-insensitive match; additional uses add to the twice-per-encounter count). Not yet displayed (owner question). | Inferred (code), tests. | High | Use boxes. |

## Remaining baseline stat mismatches

The 42 stat mismatches left in the parity baseline (2026-10-28) all trace to
content revision, homebrew the pack lacks, or rule-less stubs in the saving
machine; none traces to a stat-engine gap. Each was re-checked against the
save's `<Stat>` block.

| Character | Mismatch | Cause |
|---|---|---|
| DV | AC | An older CBLoader part's wrist-razor dual-wielding line, since removed (D100). |
| Hunzu 10, Hystan_8, oleander_8/9 | Weight | Holdings whose definition the pack lacks; modern reports Weight unknown rather than 0. |
| Hystan, Hystan_Original_7 | Weight +2 | A gear part revises one item's weight. |
| Hystan_8 | Hit points | A homebrew item absent from every corpus copy links a 10-point stat. |
| KrizDevvon | Will | Superior Will is saved house-ruled with no statadd in the stat block: the saving machine held a rule-less stub (native still executes house-ruled elements). |
| idon tkare | Barbarian Agility | Parts restructure the internal stat; AC and Reflex agree. |
| oleander_8/9 | Str/Dex cascade, Arcana | Homebrew items and skills. |
| Aeofel | Arcana, History | A racial bonus moved behind a subrace choice in current content. |
| GeranHulmaster, Japheth | Initiative, Streetwise | Backgrounds carried a statadd in the saved content revision. |
| RaidonKane | Will | Pre-errata Iron Will. |

A power-row difference found on the way is likewise content revision: Hunzu
10's Divine Bolts gains a ranged-basic bonus through a bug-fix part's
`_BasicAttack` modify that the saving builder did not have.

## Gaps that change numbers, by priority

1. **Highest, highest-mental and chosen ability attack and damage lines.**
   Reproduced (`cc20870`). Ported `HighestAbility` (highest score of the six, first
   wins), the mental-ability and `Chosen Ability` branches, accept `+N` after
   "ability modifier"/"ability score", and treat the damage-side forms the same
   way; the special-case registry entries that claimed these forms were
   handled are corrected.
2. **CalcBonuses build-option riders and the WeaponBonuses table.** Reproduced (`de36186`);
   `CalcBonuses` is gated on the field name (non-standard field naming
   "Special", an owned element or "axe") and the exact sentences; the two
   WeaponBonuses regexes are replaced by the decoded table with C# truncation for the half
   flag; the riders the table misses are content corrections (D105).
3. **Hybrid Power Points (`Psionics`), bracket substitution, half-point
   pairing, blank ability scores.** Reproduced (`8c2dd08`, `698a32d`,
   `a07a872`, `6d4b074`). Three content target typos corrected (`6cb492b`);
   the five prose-bearing feat modify typos (Bloodhound Style and Cruel Cut Style: Predator Strike; Corellon's Wrath Style: Commander's Strike; Power of Torment: Overwhelming Strike; Haunting Sounds: Ghost Sound) are corrected in `content/corrections/9D-modify-target-typos.part` (owner decision).
4. **`_DamageDie` and Chilling Cloud.** Reproduced (`cc20870`) with the single-power
   items (Hawk's Talon, Attacks on the Run/Reactive Shot); `ParseDamage` now
   has a registry entry.
5. **Unarmed melee WeaponBase.** Reproduced (`f533156`). RaidonKane's
   Unarmed basic attack damage (+2 Weapon Focus) is an open conflict with his
   older save.
6. **Fey Pact Charisma on Constitution attack lines.** Explained: player homebrew
   (a warlock ability-options part) rewrites the attack lines; not a native
   factor, no modern change.
7. **Versatile +1 for a Small character's non-small weapon.** Reproduced
   (`3d7238b`); this also matches the rulebook.
8. **Smaller items.** `EnchantEquiv`, the three unshared base-attack caps,
   conditional reminder text for linked statadds, the empty-type question, and
   an explicit stacking-order test.

## Open questions for the owner

All answered on 2026-10-28: SampleHeroes rows (Drizzt, Binwin, Geran,
RaidonKane) are informational because `sample-chars/` is the canonical
baseline; "Primary ability" follows native; the departures are recorded in
D105; uses per encounter show on power cards; new characters start with
100 gp. Associates (54 `Associate` records, e.g. the Fey Beast Tamer's
blink dog) get their own data model as a follow-up.

## Unresolved evidence boundaries

- No sample save exercises the untyped literal 0, gates, `statmin`, Hybrid
  Power Points, bracket substitution, the Unarmed base, the ability-word attack
  lines, `_DamageDie`, Chilling Cloud, the Small versatile case, `CalcBonuses`
  or the unported WeaponBonuses lines. Their native results are inferred from
  decompiled control flow that is unambiguous at the cited lines.
- The WeaponBonuses table was decoded from the native DLL's data section; the
  two lines a sample save prints match the decoding.
- Whether native keeps `type=""` as one empty type or treats it as untyped was
  not determined.
- The legacy omission of some owned items from implement rows, and the Fey
  Pact Charisma rows, remain unexplained.
- As in [00-evidence-and-scope.md](00-evidence-and-scope.md), a Windows
  differential harness is the definitive check for every inferred row.
