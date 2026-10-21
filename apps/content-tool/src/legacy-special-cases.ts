/**
 * Reviewed entries of the legacy special-case inventory
 * (`pnpm audit:legacy-special-cases`). Keys are legacy member names as the
 * audit prints them (`?A0x<hash>.` prefixes are native translation units).
 * Each entry says what the legacy branch does and how the modern app covers
 * it; the audit flags cases without an entry as unreviewed. Descriptions name
 * behavior and record IDs only, never published prose.
 */

export type LegacySpecialCaseStatus =
  /** Covered by authored content or `content/corrections/*.part`. */
  | "declarative"
  /** Covered by modern code (an EXCEPTION_IDS entry, power math, ...). */
  | "code"
  /** Mirrored by a separate hand-maintained list that can drift. */
  | "drift-risk"
  /** Not reproduced. */
  | "not-handled"
  /** A legacy feature the modern app deliberately does not have (auto-build, wizard pages, legacy file I/O). */
  | "out-of-scope"
  /** Matches content vocabulary by coincidence; not a content special case. */
  | "generic";

export interface LegacySpecialCase {
  readonly status: LegacySpecialCaseStatus;
  readonly description: string;
  /** Where the modern app handles it, or why it does not. */
  readonly note?: string;
}

const generic = (description: string, note?: string): LegacySpecialCase => ({
  status: "generic",
  description,
  ...(note === undefined ? {} : { note }),
});
const outOfScope = (description: string, note: string): LegacySpecialCase => ({
  status: "out-of-scope",
  description,
  note,
});
const code = (description: string, note: string): LegacySpecialCase => ({
  status: "code",
  description,
  note,
});
const notHandled = (description: string, note: string): LegacySpecialCase => ({
  status: "not-handled",
  description,
  note,
});
const drift = (description: string, note: string): LegacySpecialCase => ({
  status: "drift-risk",
  description,
  note,
});

const PREREQ_UNVERIFIED =
  "modern prerequisites.ts has no equivalent; the clause evaluates as unverified (shown, not blocking)";
const AUTO_BUILD = "the modern builder has no auto-build/suggestion engine";

export const LEGACY_SPECIAL_CASES: Readonly<Record<string, LegacySpecialCase>> =
  {
    // --- D20RulesEngine: rules, categories and classes -------------------
    "CategoryOpt.Build": code(
      "Builds the dynamic $$ category sets; binds Diverse Study, Seeker, Versatile Master and Paragon Multiclassing records by ID.",
      "rules-engine exceptions.ts EXCEPTION_IDS + evaluator category expansion",
    ),
    "?A0x1e9d9cdc.DiverseStudyException": code(
      "Diverse Study: arcane-source powers match the pseudo-class category.",
      "exceptions.ts diverseStudyException",
    ),
    "?A0x2c46c09a.ShouldChoose": code(
      "Deity choice is required for Channel Divinity classes except the Warpriest by name.",
      "exceptions.ts shouldChooseDeity / DEITY_CHOICE_EXCLUDED_CLASS_NAME",
    ),
    "RulesElement.IsPsionicClass": notHandled(
      "A class is psionic when _PARSED_CLASS_FEATURE names Psionic Augmentation (power points, augmentable at-wills).",
      "no modern psionic/power-point model; augmentable powers are not calculated",
    ),
    PsionicDaily: code(
      "Prerequisite 'at least one psionic daily attack power': owned daily psionic attack powers.",
      "prerequisites.ts predicate kind (psionic-daily-attack)",
    ),
    "?A0xca3c2cf6.PsionicConventionalist": notHandled(
      "Psionic Conventionalist (ID_FMP_FEAT_2732) removes 2/4/6 power points by swapped power level.",
      "no modern power-point stat",
    ),
    "?A0x7555d940.FromDilettante": code(
      "Powers chosen through the Dilettante racial trait (ID_FMP_RACIAL_TRAIT_643) are treated as out-of-class/encounter.",
      "build-projection.ts handles Dilettante power provenance",
    ),
    FindDilettante: notHandled(
      "Prerequisite clauses about the Dilettante power's kind look up the Dilettante racial trait's chosen power by ID.",
      `${PREREQ_UNVERIFIED}; needs choice provenance in the prerequisite context (3 records)`,
    ),
    "?A0x7555d940.FromMulticlassing": code(
      "Multiclass-sourced powers (Dilettante, Paragon Multiclassing IDs, multiclass feats) get the multiclass keyword.",
      "EXCEPTION_IDS.paragonMulticlassing; keyword tags in powers.ts",
    ),
    "D20Workspace.ClassName": generic(
      "Displays a hybrid character's class as 'Hybrid A|B'.",
    ),
    "D20Workspace.RulesElementSource": generic(
      "Maps the 'Core' source to a book title (hybrid records to PHB3, otherwise PHB/Divine Power).",
      "presentation of sources; modern shows the authored source",
    ),
    "?A0x03aa98b1.HybridArmorProf": code(
      "Hybrid classes do not grant armor/shield proficiencies through their hybrid grants.",
      "evaluator hybrid handling",
    ),
    "?A0x1e9d9cdc.CustomElement": generic(
      "Custom (homebrew) Language records get the Starting category; custom ritual scrolls get type Ritual.",
    ),
    "?A0x1e9d9cdc.InitStockTypes": generic(
      "Registers the stock entity types by name.",
    ),
    "D20RulesEngine/RULE.cs": generic(
      "Rule-statement static strings (field names, slots, money).",
    ),

    // --- D20RulesEngine: prerequisite parser ---------------------------
    SpecialCase: {
      status: "declarative",
      description:
        "Prerequisite alias table: about 60 exact clauses mapped to other records or combinations (shifter -> Razorclaw/Longtooth, spellscar, Fighter Weapon Talent, Flurry of Blows, 21st-level wizard/bard, Turn Undead, Harpers, House Vadalis, manifestations, healing infusions, dragon breath damage types, ...), plus generic Nth-level, race-plus-class and family branches.",
      note: "Exact aliases are Prereqs rewrites in content/corrections/93-prerequisites.part (records with print-prereqs) and the Shifter CountsAsRace in 92-legacy-special-cases.part; generic branches are prerequisites.ts legacyClause. Deliberately different (D090): legacy maps spellscar, Harpers, House Vadalis and Circle of Smoke to records nothing grants, so it always fails them; 93-prerequisites.part instead lets a representing option meet them (Harper Agent background or theme, a Vadalis background, the Spellscar CountsAsFeature) and leaves the original wording as an unverified alternative (Circle of Smoke has no option). Generalized in prerequisites.ts qualifiedClause (records without print-prereqs too): 'Nth-level <X>' (the 21st-level wizard/bard aliases), '<A> with the <B>', '<A> from <place>', '<B> <class>' (race-plus-class beyond the first word), and 'Cormyr' as every 'Cormyr (...)' record of a typed prefix's type. Deliberately different (D091): the Ghost of Eventide and Silverstar aliases are no longer rewrites, since legacy's readings needed a rogue only for Cormyr and dropped the implement qualifier from 'any arcane'; the parser reads the published text. Unported: 1 or more power points (no power-point stat), and the Dilettante predicates",
    },
    FirstSpecialCase: notHandled(
      "Before name lookup: 'familiar' means Arcane Familiar; 'weapon focus'/'weapon expertise' mean any feat of that container.",
      "no record in the current pack uses these bare clauses unresolved",
    ),
    ProficiencySpecialCase: code(
      "Proficiency clause grammar: chosen skill, weapon groups by hands, non-spear polearm, superior weapon, heavy blade properties, armor/shield names.",
      "prerequisites.ts proficiencySpecialCase for comma and 'or' parts after a 'Proficiency with' prefix (weapon, group, hand-and-group, property phrases generalized to '<group> that has the <property> property', 'a superior weapon' generalized to 'a <category> weapon', and the armor/shield literals generalized to any Armor/Shield Proficiency record; a trailing relative clause and a first alternative's 'any' are distributed over every alternative), read before a same-named weapon or armor record; the prefixed clause itself keeps the 'proficiency' kind name-substring match unless a shared tail completes it ('light or heavy shields')",
    ),
    NonSpearPolearm: code(
      "'Non-spear polearm' proficiency: polearm group without the spear group.",
      "prerequisites.ts LEGACY_WEAPON_PHRASES",
    ),
    HeavyArmor: notHandled(
      "'Heavy armor' proficiency: any armor proficiency whose armor is heavy.",
      "no unresolved record uses it",
    ),
    Proficiency: generic(
      "Builds '<kind> proficiency (<name>)' lookups for the proficiency parser.",
    ),
    "?A0xf75eff9b.ProficiencyWeapon": generic(
      "Resolves the weapon named in a 'Weapon Proficiency (...)' record.",
    ),
    CompanionSpecialCase: {
      status: "declarative",
      description:
        "Beast companion clauses (wolf/cat, 'Beast Mastery Class Feature (x or y)') resolve to Companion records.",
      note: "content/corrections/93-prerequisites.part rewrites them to 'X [Beast] Companion'",
    },
    TwoKnowledgeSkills: {
      status: "declarative",
      description:
        "'Two knowledge skills': any two of Arcana, Dungeoneering, History, Nature, Religion trained.",
      note: "content/corrections/93-prerequisites.part rewrites the clause to the trained pairs",
    },
    HarperTraining: code(
      "Harper prerequisite: training in any two of four named skills, read whole before comma splitting.",
      "prerequisites.ts trainingInAnyOf reads any 'training in any N of A, B, ... or Z' block whole as the trained combinations; 93-prerequisites.part also rewrites the Harper of Legend clause to the trained pairs",
    ),
    InternalizeBlock: code(
      "Clause 'membership in the Circle of Smoke and Whispers' maps to that record before comma splitting (LineParse otherwise splits at every depth-zero comma and ' and '); also applies the Prefixes table (training, worship, follower of, affiliated with, fluent in, ...) and carries a prefix's type to later comma parts.",
      "Prefixes: prerequisites.ts LEGACY_PREFIXES. Type carry-over (CreateElementPrereq skips other types): carriedParts hands a prefix's type to later comma parts and, as InternalizeOr hands the rest of the text to InternalizeBlock, to later ' or ' alternatives; inheritedTypeClause reads them as that type first ('trained in Bluff or Stealth' is Stealth training, not the Stealth skill). Whole clause, generalized: prerequisites.ts knownNameSpans never splits inside a known record name that contains a connector, so the Circle of Smoke clause stays one clause; it stays unverified (D090: its record is granted by nothing, so legacy always fails it). scripts/audit-prerequisites.ts reports any split inside a known name or a legacy whole clause, and any part read as another type than its carried prefix",
    ),
    InternalizeElement: generic(
      "Name lookup for a prerequisite token; excludes CountsAsRace for non-feats and the 'assassin' class/paragon name clash.",
    ),
    AnyClassSpecific: code(
      "'Any class-specific multiclass feat': every multiclass feat, plus Student of the Plague and Adept Dilettante by name.",
      "prerequisites.ts classSpecificFamily",
    ),
    AnyClassMoreSpecific: code(
      "Class-specific multiclass feats for classes with or without Psionic Augmentation.",
      "prerequisites.ts classSpecificFamily",
    ),
    AnyClassNoPsi: code(
      "'Any class that doesn't have the Psionic Augmentation class feature'.",
      "prerequisites.ts classSpecificFamily",
    ),
    AnyWarlockPact: code(
      "'Any warlock pact': any CountsAsPact or Eldritch Pact-category record.",
      "prerequisites.ts legacyClause",
    ),
    MulticlassDivine: code(
      "'Multiclass divine class': any multiclass feat of a divine class.",
      "prerequisites.ts legacyClause, generalized to 'multiclass <source> class'",
    ),
    ParagonMulticlassing: code(
      "'Paragon multiclassing as a X': Paragon Multiclassing plus any multiclass X feat.",
      "prerequisites.ts legacyClause (and paragonMulticlassingInSource for 'in a martial class')",
    ),
    RememberedKnack: code(
      "'Any class-specific multiclassing feat that grants training in a skill'.",
      "prerequisites.ts classSpecificFamily",
    ),
    MoreThanOneClass: code(
      "'Must have more than one class': hybrid or a CountsAsClass record.",
      "prerequisites.ts legacyClause (the Hybrid class name is EXCEPTION_NAMES.hybridClass)",
    ),
    HealingInfusion: generic(
      "Detects 'Healing Infusion:' power names for infusion-count clauses.",
    ),
    AnyFeat: code(
      "'Any X feat' / 'At least one X feat' / 'vampire bloodline feat' count feats by type.",
      "prerequisites.ts anyFeat ('any'/'at least one' X feat by feat type); 'vampire bloodline feat' is a content/corrections/93-prerequisites.part rewrite",
    ),
    AnyXXXClass: code(
      "'Any <source> Class' and 'non-<source>' class prerequisites.",
      "prerequisites.ts class-source kind (positive forms only; SpecialCase's 'Arcane Class' alias generalized to '<source> class'). A '<name> class' clause is a class requirement only when a class, hybrid class or CountsAsClass has that name; SpecialCase's 'any defender (class)' is generalized to any Role. Shared-word coordination ('Any martial or divine class'), which legacy InternalizeOr splits into an Unrecognized 'Any martial', is read as each alternative with the shared words (distributeSharedWords)",
    ),
    Ignore: code(
      "Prerequisite clauses the parser skips (humanoid forms, three unverifiable clauses).",
      "prerequisites.ts LEGACY_IGNORED_CLAUSES, a hand list this audit checks against the legacy literals. Ignore yields no prerequisite, so InternalizeOr keeps only the other side: an ignored ' or ' alternative is dropped ('6th-level or higher utility power' needs 6th level)",
    ),
    Unrecognized: generic(
      "Unrecognized clauses become an illegal stub; four known non-clauses only suppress the debug log.",
      "modern reports unrecognized clauses as unverified",
    ),
    PrereqSpecialReason: generic(
      "Failure-reason text for exclusive (~) clauses.",
    ),
    InitializeAbilityScores: generic("Ability score records except 'any'."),
    ListContains: generic("'any' matches every list entry."),

    // --- D20RulesEngine: items and equipment --------------------------
    "D20Workspace.RulesElementIsBoon": code(
      "Magic Item Types containing 'boon'/'training' or equal to eleven named types are boons.",
      "equipment-ui.ts LEGACY_BOON_* / isLegacyBoonType, a hand list this audit checks against the legacy literals",
    ),
    "D20Workspace.CharLootIsAugment": code(
      "Dragonshard Augment magic items are augments of another item.",
      "equipment-ui.ts files augments under special items; no augment slot model",
    ),
    MeetsItemRequirement: code(
      "Two item Requirement texts check Internal records (living construct -> Can Use Components; ki focus users -> Ki Focus User); other items check their Prerequisite. EquipLoot lists an equipped item that fails as custom equipment (a house rule); the shop neither hides nor blocks it.",
      "rules-engine exceptions.ts ITEM_REQUIREMENT_RECORDS / meetsItemRequirement; evaluator item.requirement-unmet (equipped items only, character not rules-legal) shown as a house-rule issue",
    ),
    "?A0xf75eff9b.MeetsItemPrereq": code(
      "Item prerequisite 'familiar must be in active mode' always passes; so does every other.",
      "meetsItemRequirement ignores item Prerequisite, as legacy always passes it",
    ),
    "D20Workspace.IsValidLoot": code(
      "Enchantment/base compatibility: staff group via Quarterstaff (ID_FMP_WEAPON_10), shields, armor categories, minimum enhancement.",
      "equipment-ui.ts compatibleBaseItems",
    ),
    "D20Workspace.IsEnchantment": code(
      "Armor/Weapon magic items and shield arms-slot items enchant a base item.",
      "equipment-ui.ts shopBrowseCategory",
    ),
    "?A0x0bed2cbe.ValidateShield": code(
      "Arms-slot enchantments named for shields require a shield base.",
      "equipment-ui.ts isAuthoredShield / compatibleBaseItems",
    ),
    "?A0x0bed2cbe.IsShield": code(
      "Shield detection by Armor Type or _IsEnchant.",
      "equipment-ui.ts isAuthoredShield",
    ),
    "?A0x0bed2cbe.IsValidWeapon": code(
      "Weapon enchantment 'Weapon' field grammar (any melee, one-handed, thrown, spiked gauntlets, ...).",
      "equipment-ui.ts compatibleBaseItems (field-driven)",
    ),
    "?A0x0bed2cbe.CharLootName": generic(
      "Composes '<enchantment> <base>' item names, replacing implement/weapon words.",
      "character-domain formatInventoryItemName",
    ),
    ImplementType: code(
      "Implement kind from Magic Item Type, '<X> Implement'/'Implement, <X>' gear names, Holy Symbol/Totem/Ki Focus.",
      "powers.ts implementKind / equipment-ui.ts IMPLEMENT_KINDS",
    ),
    "?A0xe93d131c.IsImplementName": code(
      "Same implement-name rule for auto-build.",
      "powers.ts implementKind",
    ),
    "D20Workspace.IsHolySymbol": code(
      "Holy symbol detection.",
      "powers.ts implementKind",
    ),
    "D20Workspace.IsKiFocus": code(
      "Ki focus detection.",
      "powers.ts implementKind",
    ),
    "?A0x7555d940.IsKiFocus": code(
      "Ki focus detection, including the mundane Ki Focus gear (ID_FMP_GEAR_115).",
      "equipment-ui.ts MUNDANE_IMPLEMENT_IDS (hand list of mundane implement gear IDs; it matches the legacy '<X> Implement'/Totem/Holy Symbol name rule plus the Ki Focus today)",
    ),
    "D20Workspace.IsStaff": code(
      "Staff detection: staff implement gear names, Staff magic items, Quarterstaff (ID_FMP_WEAPON_10), staff group.",
      "powers.ts Loadout (a staff without a weapon base counts as a Quarterstaff)",
    ),
    "D20Workspace.IsMagicWeapon": code(
      "Staff and light-blade magic items used as weapons.",
      "powers.ts loadouts",
    ),
    "?A0x7555d940.LootImplement": code(
      "Implement name for proficiency; bards use instruments.",
      "powers.ts implementProficiencies",
    ),
    "?A0x7555d940.ImplementName": code(
      "Implement name for keyword channels; bards use instruments.",
      "powers.ts implementKind",
    ),
    "?A0x7555d940.ImplementProficiency": code(
      "'Implement Proficiency (<kind>)' lookup.",
      "powers.ts IMPLEMENT_PROFICIENCY",
    ),
    "?A0x7555d940.ImplementWeaponEquiv": code(
      "A staff implement used as a weapon is a Quarterstaff (ID_FMP_WEAPON_10).",
      "powers.ts Loadout proficiencyNames",
    ),
    "?A0x7555d940.WeaponBase": code(
      "Weapon base for a power: Unarmed Attack (or the 'Unarmed Weapon' text override) for melee without a weapon; staff as Quarterstaff.",
      "powers.ts unarmed loadout; Loadout.requirementBase and the 'Unarmed Weapon' text for requirements (EXCEPTION_NAMES)",
    ),
    "?A0x7555d940.AddWeaponKeywords": code(
      "Weapon keyword channels (category, group, properties, slot); staff as Quarterstaff.",
      "powers.ts legacyPowerKeywordTags",
    ),
    "?A0x7555d940.AddArenaWeapons": notHandled(
      "With Arena Training, every 'Arena Weapon' property weapon's keywords join the power's keyword set.",
      "no modern Arena Training channel",
    ),
    "?A0x7555d940.ArenaTrainingImprovisedWeapon": notHandled(
      "Arena Training (ID_FMP_CLASS_FEATURE_2893) lets non-proficient and improvised weapons use the improvised-weapon rules.",
      "not modeled",
    ),
    "?A0x0bed2cbe.WieldingDefensive": code(
      "'defensive' selector: wielding a proficient defensive weapon (staff as Quarterstaff).",
      "equipment.ts defensive selector (no proficiency or staff check)",
    ),
    "?A0x0bed2cbe.DualWieldingConditional": code(
      "Dual-wielding selectors; 'rapier-blade' means a rapier (ID_FMP_WEAPON_29 or the large rapier) with an off-hand light blade.",
      "equipment.ts dual-wielding selector (rapier-blade not special-cased)",
    ),
    HasLoot: code(
      "wearing/not-wearing selector dispatch (defensive, versatile, dual-wielding, dual-shield, slot, staff implement, only-weapon).",
      "equipment.ts matchesEquipmentSelector / equipmentPredicate",
    ),
    "?A0x0bed2cbe.LootCheck": code(
      "Selector matching by category or weapon name, including 'Large <weapon>' variants.",
      "equipment.ts",
    ),
    "D20Workspace.IsDualWielding": code(
      "Dual wielding: an off-hand weapon (staff as Quarterstaff) plus a main-hand weapon.",
      "equipment.ts dual-wielding",
    ),
    "D20Workspace.IsDoubleWeapon": code(
      "Double weapon: two-handed with off-hand property or a _Secondary End.",
      "powers.ts loadouts",
    ),
    "D20Workspace.IsDualWeapon": notHandled(
      "A weapon is usable melee and ranged; a staff whose default power is Magic Missile counts as dual.",
      "no modern default-power model for staffs",
    ),
    IsDagger: code(
      "Dagger by name.",
      "equipment selectors; power-requirements.ts dagger clause (EXCEPTION_NAMES.dagger)",
    ),
    IsMonkWeapon: code(
      "Monk weapons: club, dagger, spear, Monk Unarmed Strike by name, or a staff.",
      "power-requirements.ts isLegacyMonkWeapon (EXCEPTION_NAMES)",
    ),
    IsTwoHandedWeapon: code(
      "Two-handed by Hands Required, except the stout property.",
      "powers.ts / item-reminders stout handling",
    ),
    IsUsedTwoHanded: code(
      "Two-handed use, except stout.",
      "powers.ts versatileUsedTwoHanded",
    ),
    IsLargeWeapon: code("Size 'Large' weapon.", "equipment-ui inventory names"),
    CanUseLargeWeapons: notHandled(
      "Oversized / One Size Larger / Small character text strings change which weapon sizes fit.",
      "size-based wielding is not modeled",
    ),
    "?A0x0bed2cbe.SmallWithNonSmallWeapon": code(
      "Small characters wield non-small weapons two-handed unless One Size Larger.",
      "partial: power-requirements.ts versatile two-handed use for requirements (EXCEPTION_NAMES.smallSize/oneSizeLarger); slots and damage do not model size",
    ),
    "?A0x0bed2cbe.ItemSlot": code(
      "Slot of a held item: versatile two-hands, small/large adjustments, Ambidextrous.",
      "equipment-ui loadout slots (size and Ambidextrous not modeled)",
    ),
    "?A0x0bed2cbe.CharLootSlot": generic("Slot display names."),
    "?A0x0bed2cbe.SlotManip": code(
      "Ring Slots stat, Additional Slot and _AlternateSlot handling when equipping.",
      "partial: equipment-ui loadout; Ring Slots/Additional Slot not read",
    ),
    "?A0x0bed2cbe.ValidateEquip": code(
      "Two off-hand/ring items allowed.",
      "equipment-ui loadout",
    ),
    "D20Workspace.LootWeight": code(
      "Barding and mount/companion/familiar slot items do not count toward carried weight.",
      "sheet-model encumbrance.ts",
    ),
    "D20Workspace.IsProficient": code(
      "Weapon/armor/shield proficiency, including Additional Proficiencies and Proficient As.",
      "powers.ts proficiencyNames (Additional Proficiencies not read)",
    ),
    "?A0x03aa98b1.ProcessModify": generic(
      "modify rules targeting 'this'/'BaseItem'; 'large ' name prefixes.",
      "evaluator field overlays",
    ),

    // --- D20RulesEngine: power math -------------------------------------
    "?A0x7555d940.SpecialCase": code(
      "Fixed outputs: Bond of Censure dice by name, and exact hit lines (ongoing 10 family, Strength-only damage, damage-taken, rage strike, three more).",
      "powers.ts nativeSpecialDamage / unresolvedNativeSpecialCase (inline names and prose; could become `_CalculatedHit`-style corrections)",
    ),
    EffectPower: {
      status: "declarative",
      description:
        "Storm Pillar has no Hit line; legacy substitutes a damage line by name.",
      note: "content/corrections 90-4ecb-corrections.part `_CalculatedHit`",
    },
    "?A0x7555d940.NonDamagePower": notHandled(
      "Four powers (two by name prefix, ID_FMP_POWER_7157, ID_FMP_POWER_11126) never get a damage line.",
      "modern parses their Hit prose; a correction could mark them non-damaging once a field exists",
    ),
    "D20Workspace.IsValidPowerCombo": code(
      "Coordinated Assault Attack (ID_FMP_POWER_11615) gets no weapon variants; otherwise implement/weapon/range checks, and IsRestricted for weapon powers and (AllowUnarmed) Unarmed.",
      "powers.ts candidates; EXCEPTION_IDS.coordinatedAssaultAttack",
    ),
    IsRestricted: code(
      "Power Requirement 'You must be wielding ...' grammar (bow or crossbow, two shields, thrown and melee, reach, blowgun, dagger, spiked chain, ...) limits weapon variants; other clauses match a weapon Group or thrown property, or a WeaponSwap text.",
      "rules-engine power-requirements.ts isPowerRestricted; one-off wordings restated as `_WeaponRequirement` in content/corrections/94-power-requirements.part, whose extended selectors (named weapons, pairs, free hand) also cover the wordings legacy rejects (08-hard-coded-exceptions.md)",
    ),
    "?A0x7555d940.OtherRestrictions": code(
      "Requirement 'You must be using a shield.' needs a shield.",
      "power-requirements.ts isPowerRestricted (equipment armor:shield)",
    ),
    "?A0x7555d940.IsMeleePower": code(
      "Melee power, or the thrown-melee Requirement.",
      "powers.ts THROWN_MELEE_REQUIREMENT (inline prose), or a `thrown melee` `_WeaponRequirement` selector (power-requirements.ts weaponRequirementThrowsMelee)",
    ),
    "?A0x7555d940.IsRangedPower": code(
      "Ranged power (area burst, ranged, thrown requirement, Stab and Shoot by name).",
      "powers.ts legacyPowerRange (inline name)",
    ),
    "?A0x7555d940.IsClose": generic("Close burst/blast detection."),
    "?A0x7555d940.WhichAttack": code(
      "Melee-or-ranged attack line selection by weapon.",
      "powers.ts phaseAlternatives",
    ),
    "D20Workspace.IsDualPower": code(
      "Dual-attack power detection from ') or ' / 'with a melee weapon or two'.",
      "powers.ts phaseAlternatives",
    ),
    "?A0x7555d940.DetermineOffhand": code(
      "Off-hand pairing; ki focus excluded.",
      "powers.ts loadouts; legacyRequirementContext for requirements",
    ),
    "?A0x7555d940.DeterminePower": code(
      "Basic attack powers by _BasicAttack or the Melee/Ranged Basic Attack names.",
      "powers.ts basicAttackKind",
    ),
    IsBasicAttack: code(
      "Basic attack by name or _BasicAttack.",
      "powers.ts basicAttackKind",
    ),
    "?A0x7555d940.OverrideStat": code(
      "Key-ability override text strings (martial melee, melee/ranged basic, bow group, thrown).",
      "powers.ts attackLineAbility (text-string overrides partial)",
    ),
    "?A0x7555d940.AttackSpecialCase": notHandled(
      "Attack stat 'Highest Mental Ability'.",
      "powers.ts highestAbility covers 'your highest ability' forms only",
    ),
    ChosenAbility: notHandled(
      "Attack/damage stat 'Chosen Ability' reads a chosen-ability text string.",
      "not modeled",
    ),
    AbilityTranslation: notHandled(
      "Ability names 'Chosen Ability'/'chosen' translate to the chosen ability.",
      "not modeled",
    ),
    "?A0x7555d940.CalcStatVsDefense": code(
      "Attack stat parsing: beast's attack bonus, highest ability, primary ability, per-adjacent-enemy condition.",
      "powers.ts attackLineAbility / highestAbility (beast attack partial)",
    ),
    "?A0x7555d940.CalcBAB": code(
      "Attack components: ability, half level, proficiency, enhancement; beast attack bonus.",
      "powers.ts combatStatComponents",
    ),
    "?A0x7555d940.AttackPowerModRepl": notHandled(
      "Exact 'Increase to +N at 11th/21st level' attack lines, and Dragon Breath / Dragon's Wrath by name, replace the power bonus by level.",
      "powers.ts powerBonusAtLevel handles generic 'Level 11/21:' lines only",
    ),
    "?A0x7555d940.ExtractPowerMods": notHandled(
      "One exact attack-line suffix adds a Wisdom power bonus.",
      "not modeled",
    ),
    "?A0x7555d940.ParseIncreaseLine": notHandled(
      "Four exact 'Increase damage ...' lines are rewritten before level parsing.",
      "powers.ts lineAtLevel parses generic increase lines",
    ),
    "?A0x7555d940.HigherLevelDamage": code(
      "Higher-level damage lines; Chilling Cloud by name at 21; one exact Constitution line; a riposte damage line trimmed.",
      "powers.ts lineAtLevel (generic; the named exceptions are not ported)",
    ),
    FindLine: code(
      "Theme power level lines ('Level N' specifics) and 'As above, but ' stripping.",
      "powers.ts lineAtLevel",
    ),
    "?A0x7555d940.CalcDamage": code(
      "Damage parsing: twice/your/beast's ability, off-hand weapon, damage types; Defender's Gambit by name reads its tab-hit field.",
      "powers.ts damage parsing (Defender's Gambit not special-cased)",
    ),
    "?A0x7555d940.FindWeaponDamage": code(
      "[W]/[B] and off-hand weapon dice.",
      "powers.ts",
    ),
    "?A0x7555d940.FigureWeaponDice": code(
      "Weapon dice; unarmed default 1d4 or the 'Unarmed Damage Die' text string; implement-as-weapon 1d8/1d10.",
      "powers.ts unarmed loadout (text string not read)",
    ),
    "?A0x7555d940.DualImplementSpellcaster": code(
      "Dual Implement Spellcaster (feat by name) adds off-hand implement enhancement to arcane implement damage.",
      "powers.ts hasDualImplementSpellcaster (EXCEPTION_IDS.dualImplementSpellcaster)",
    ),
    "?A0x7555d940.CalcStrikers": code(
      "Hunter's Quarry, Warlock's Curse, Sneak Attack by feature ID; Sneak Attack weapon groups.",
      "powers.ts conditionalStrikerDamage (EXCEPTION_IDS striker features)",
    ),
    "?A0x7555d940.HasStrikerFeature": code(
      "Hybrid striker features (ID_FMP_CLASS_FEATURE_1530/1531/1533) apply only to their class's powers.",
      "powers.ts conditionalStrikerDamage (EXCEPTION_IDS striker features)",
    ),
    "?A0x7555d940.CalcBonuses": code(
      "Exact weapon-group prose fields add ability damage/attack; one Dwarf-only Wisdom line.",
      "powers.ts powerWeaponSpecificBonuses",
    ),
    "?A0x7555d940.CalcBeast": code(
      "One exact companion line adds Wisdom damage for a cat, spider or wolf companion.",
      "powers.ts companion damage (partial)",
    ),
    "?A0x7555d940.CalcHealing": code(
      "Healing bonus stats '<power>:healing' and '<class>:healing'.",
      "powers.ts powerHealing; corrections add missing healing statadds",
    ),
    "D20Workspace.PowerStats": code(
      "Per-power stat block; Commander's Strike by name uses the ally's basic attack.",
      "powers.ts evaluatePowers (Commander's Strike not special-cased)",
    ),
    "?A0x7555d940.BasicAttackOnly": code(
      "Charge/opportunity-attack-only modifiers apply to basic attacks.",
      "powers.ts conditional components",
    ),
    "?A0x7555d940.BuildKeywordSet": code(
      "Keyword set for channel matching (implement, groups, two-weapon, association, multiclass, basic attacks).",
      "powers.ts legacyPowerKeywordTags",
    ),
    "?A0x7555d940.CalcKeywords": code(
      "Keyword channel matching (:damage, :attack, :info).",
      "powers.ts / stats channels",
    ),
    "?A0x7555d940.DamageKeyword": code(
      "Damage keyword components.",
      "powers.ts",
    ),
    "?A0x7555d940.WeaponSwapAssociation": code(
      "'<feat> association' keywords.",
      "powers.ts legacyPowerKeywordTags",
    ),
    "?A0x7555d940.PieceComment": generic("Component explanation text."),
    "D20Workspace.RulesElementEncounterUses": notHandled(
      "Six healing-word style powers by exact Special text get 2 uses per encounter (3 from level 16); _ADDITIONAL_USES field and stat add uses.",
      "use tracking belongs to the deferred M6 play tracker; add `_ADDITIONAL_USES` support and corrections then",
    ),

    // --- D20RulesEngine: companions ----------------------------------
    BeastAbilityScore: code(
      "Companion ability scores via 'Companion.' stats.",
      "rules-engine companion stats",
    ),
    "CompanionStatBlock.GetCompanionStat": code(
      "Companion stats sum ALLY., COMPANION. and <type>. prefixed stats.",
      "universal-action-cards / companion stats",
    ),
    "BeastBlock.SetDefenses": generic("Companion defense line."),

    // --- D20RulesEngine: auto-build and character I/O ------------------
    "?A0xe93d131c.DesiredArmor": outOfScope(
      "Auto-build armor choice; Battlerager Vigor and Tempest Technique pick Chainmail.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.AutoItem": outOfScope(
      "Auto-build implement purchase.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.CalculateStat": outOfScope(
      "Auto-build key ability; the free '+2 to one ability' race text gives none.",
      AUTO_BUILD,
    ),
    "D20Choice.ChooseContainerFeat": outOfScope(
      "Auto-choose Weapon Focus/Expertise for the equipped weapon group, Implement Expertise for the implement.",
      AUTO_BUILD,
    ),
    "D20Choice.CompleteBySuggestion": outOfScope(
      "Auto-choose suggested feats; Ritual Caster/Alchemist only for ritual-casting choices.",
      AUTO_BUILD,
    ),
    "D20Workspace.AutoEquip": outOfScope(
      "Auto-buy an Adventurer's Kit.",
      AUTO_BUILD,
    ),
    "D20Workspace.AutoMagicItems": outOfScope(
      "Auto-buy random magic items.",
      AUTO_BUILD,
    ),
    "D20Workspace.LevelUp": generic(
      "New-level text strings: starting money 100 gp, stored money, residuum.",
      "character-domain starting wealth",
    ),
    "D20Workspace.LoadInternal": generic(
      "Legacy file load and portrait paths.",
    ),
    SetStoredMoney: generic("Stored money per level."),
    "?A0x7f38ca63.WriteDetails": generic(".dnd4e details writer."),
    "?A0x7f38ca63.WriteCompanions": generic(".dnd4e companions writer."),
    "?A0x7f38ca63.WritePowerStat": generic(".dnd4e power stat writer."),
    "?A0x7f38ca63.ParseStatAdd": generic(".dnd4e statadd reader."),
    SaveStats: generic(".dnd4e stat block writer."),
    "Campaign.FromXML": generic(".dndcamp reader (Houserules/Restricted)."),

    // --- RulesEngineCommon --------------------------------------------
    "MagicItem.CategoryName": code(
      "Shop/gear category names by Magic Item Type (boons, scrolls, consumables, alchemical, ki focuses).",
      "equipment-ui.ts shopBrowseCategory",
    ),
    "GearItem.InitializeCategoryMembership": drift(
      "Gear implement categories by name: '<X> Implement', Totem, Holy Symbol; Spellbook/Ritual Book as Tomes.",
      "equipment-ui.ts MUNDANE_IMPLEMENT_IDS lists the implement gear by ID (Spellbook/Ritual Book stay adventuring gear)",
    ),
    "GearItem.CategoryName": code(
      "Ammunition gear category.",
      "equipment-ui.ts",
    ),
    "EnchantmentItem.InitializeCategoryMembership": notHandled(
      "When the superior implements Accurate Staff/Dagger exist, implement enchantments also list under Magic Implements.",
      "presentation only; modern lists superior implements under implements",
    ),
    "EnchantmentItem.CategoryName": code(
      "Magic armor/weapon category names.",
      "equipment-ui.ts",
    ),
    "GearPageData.SetUpCharacterLootFilter": code(
      "Hides the internal Monk Unarmed Strike weapon from the gear list.",
      "InternalOnly records are hidden by the shop",
    ),
    "GearPageData.UpdateInternal": generic("Gear page grouping by slot."),
    "RulesEngineCommon/GearPageData.cs": generic("Gear page category names."),
    "BasicUtils.IsMagicImplement": code(
      "Rod/Staff/Wand/Orb magic items are implements.",
      "equipment-ui.ts IMPLEMENT_KINDS",
    ),
    "LootItem.InitializeInternal": generic("Item rarity 'Common' default."),
    "HolySymbolLootSlot.IsItemCandidate": code(
      "Holy symbol slot candidates.",
      "equipment-ui loadout",
    ),
    "ArmorItem.InitializeInternal": generic("Shield detection for display."),
    "LootHelpers.CreateLootItem": generic("Shield detection for display."),
    "WeaponItem.InitializeInternal": generic(
      "Large weapon detection for display.",
    ),
    "RulesEngineValueHelpers.GetDefaultPortraitName": generic(
      "Default portrait file name from race/class (hybrid prefix stripped).",
    ),

    // --- CharacterBuilder / CharacterSheetViewer -----------------------
    "App.GodFragments": notHandled(
      "Awaken God Fragment (ID_FMP_FEAT_2269) enables the god-fragment choice.",
      "God Fragment is a coverage gap (audit:coverage registry)",
    ),
    "App.IsCharacterBeastmaster": code(
      "Beast Mastery (ID_FMP_CLASS_FEATURE_1030) shows the companion page.",
      "modern shows companion choices from the content's select rules",
    ),
    "PanelModelCompanion.UpdatePanel": notHandled(
      "Sheet companion panel for Beast Mastery (ID_FMP_CLASS_FEATURE_1030), with low-light vision.",
      "no sheet companion card yet (familiar card only)",
    ),
    "MainWindow.UpdatePages": code(
      "Mage's Spellbook (ID_FMP_CLASS_FEATURE_2868) shows the spellbook page.",
      "modern spellbook choices come from content select rules",
    ),
    "FeatPage.DoChooseFeat": notHandled(
      "Choosing Student of Sword Magic adds a Spellbook to inventory.",
      "feat-granted gear is not added",
    ),
    "FeatPage.CategoryFromPrereq": generic(
      "Feat list grouping by prerequisite type.",
    ),
    "AutoLevelPage.DarkSunStuff": outOfScope(
      "Auto-level: Dark Sun campaign (Internal record) themes.",
      AUTO_BUILD,
    ),
    "AutoLevelPage.HybridStuff": outOfScope(
      "Auto-level for hybrids.",
      AUTO_BUILD,
    ),
    "AutoLevelPage.Update": outOfScope("Auto-level page.", AUTO_BUILD),
    "MainWindow.NextStepPage": outOfScope(
      "Next-step checklist; Ritual Caster/Alchemist add the rituals step.",
      "modern shows character issues instead of a wizard checklist",
    ),
    "MainWindow.UpdateChecklist": outOfScope(
      "Wizard checklist.",
      "modern shows character issues instead of a wizard checklist",
    ),
    "MainWindow.UpdateNextStep": outOfScope(
      "Wizard next step.",
      "modern shows character issues instead of a wizard checklist",
    ),
    "PowerPage.PowerSource": generic(
      "Power page grouping; Augment Powers / Psionic Augmentation (Hybrid) sections.",
    ),
    "PowerPage.DisplayPowerTree": generic(
      "Power list grouping (cantrips, wild talents).",
    ),
    "ExpanderChoice.FillOutListBox": generic("Source abbreviation for PHB3."),
    "ReplacementsPage.Update": generic(
      "Replacements page; paragon multiclassing section.",
    ),
    "ClassPage.AddPathDestinyToPanel": generic(
      "Paragon Multiclassing heading.",
    ),
    "ClassPage.Tier": generic("Tier display."),
    "RacePage.AddRaceToPanel": generic("Race page headings."),
    "MountDisplay.BuildFromFullText": generic(
      "Maps mount names to their monster stat block names for display.",
      "presentation; modern shows the mount's own record",
    ),
    "GearPageInfoPanel.MagicItemToPanel": generic(
      "Artifact/intelligent item headings.",
    ),
    "PanelModelMagicItemList.UpdatePanel": generic(
      "Sheet magic item list grouping.",
    ),
    "CharTracker/PowerCardFactory.cs": generic("Card kind labels."),
    "PowerCardFactory.GenerateFromCharLoot": generic("Card kind labels."),
    "CharTracker/WeaponWorkspaceHolder.cs": generic(
      "Basic attacks and staff/rod default powers (Magic Missile, Eldritch Blast) on weapon cards.",
      "modern basic attacks come from evaluated powers",
    ),
    "BasicAttackHolder.GetBasicAttacks": generic(
      "Basic attack cards.",
      "evaluated powers",
    ),
    "MiniCharPanel.PowerListing": generic("Basic attacks in the mini panel."),
    "PanelModelSenses.UpdatePanel": generic("Senses panel (darkvision)."),
    "CharSummaryCard.Insight": generic("Passive insight."),
    "SecondWindCard.Update": code(
      "Second Wind card; dwarves (by race name) use it as a minor action.",
      'sheet-model universal-action-cards.ts reads `modify name="Second Wind"` overlays; the dwarf case is a correction',
    ),
    "PanelModelPowerList.UpdatePanel": generic("Power list grouping."),
    "PowerCard.UpdateLimitedSpaceField": generic("'See below' card field."),
    "PowerCard.GetAbbreivatedActionTypeString": generic(
      "Action type abbreviations.",
    ),
    "PowerCard.GetAbbreviatedBookString": generic("Source abbreviations."),
    "CharTracker/PowerCard.cs": generic("Card duplicate label."),
    "App.App": generic("Application startup."),
    "App.StandardAbbreviation": generic("Source abbreviations."),
    "App.AddElementToPanel": generic("Hybrid label."),
    "RaceClass.FindElem": generic(
      "Hybrid class lookup in the race/class panel.",
    ),
    "RaceClass.HybridClass": generic("Hybrid class display."),
    "RaceClass.Read": generic("Hybrid class display."),
  };
