/**
 * Reviewed entries of the legacy special-case inventory
 * (`pnpm audit:legacy-special-cases`). Keys are legacy member names as the
 * audit prints them (`?A0x<hash>.` prefixes are native translation units).
 * Each entry says what the legacy branch does and how the modern app covers
 * it; the audit flags cases without an entry as unreviewed. Descriptions name
 * behavior and record IDs only, never published prose.
 *
 * Every entry was re-read against its decompiled function and the modern code
 * on 2026-10-22. A `code`, `declarative`, `partial` or `drift-risk` status
 * lists `evidence` that exercises it through evaluation; one without evidence
 * is reported as unverified. Where a note cites a probe on a private sample
 * character, the probe evaluated that character with the named records added.
 */

export type LegacySpecialCaseStatus =
  /** Covered by authored content or `content/corrections/*.part`. */
  | "declarative"
  /** Covered by modern code (an EXCEPTION_IDS entry, power math, ...). */
  | "code"
  /** Some of the legacy behavior is reproduced; the note says what is missing. */
  | "partial"
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
  /**
   * What shows the modern behavior matches legacy through evaluation, one
   * pointer per item: `<file>.test.ts > <test name>` for a public test (the
   * test name as written in the file, optionally followed by ` [<case>]` for
   * one row of an `it.each` table), or `private: <character.dnd4e>: <what
   * it checks>` for a private fixture character. A claimed status
   * (`EVIDENCE_STATUSES`) without evidence is reported as unverified.
   */
  readonly evidence?: readonly string[];
}

/** Statuses that claim modern coverage and so need evidence. */
export const EVIDENCE_STATUSES: ReadonlySet<LegacySpecialCaseStatus> = new Set([
  "code",
  "declarative",
  "partial",
  "drift-risk",
]);

export type LegacySpecialCaseEvidence =
  | {
      readonly kind: "test";
      readonly file: string;
      readonly test: string;
      /** A table case of a parameterized test (`it.each`), also in the file. */
      readonly case?: string;
    }
  | {
      readonly kind: "private";
      readonly fixture: string;
      readonly detail: string;
    };

/** Parses one evidence pointer; undefined when it has neither form. */
export function parseEvidence(
  text: string,
): LegacySpecialCaseEvidence | undefined {
  const fixture = /^private: ([^:]+\.dnd4e): (.+)$/.exec(text);
  if (fixture !== null)
    return { kind: "private", fixture: fixture[1]!, detail: fixture[2]! };
  const test = /^(\S+\.test\.tsx?) > (.+?)(?: \[(.+)\])?$/.exec(text);
  if (test !== null)
    return {
      kind: "test",
      file: test[1]!,
      test: test[2]!,
      ...(test[3] === undefined ? {} : { case: test[3] }),
    };
  return undefined;
}

export type LegacySpecialCaseVerification =
  "verified" | "unverified" | "not-applicable";

export function verificationOf(
  entry: LegacySpecialCase,
): LegacySpecialCaseVerification {
  if (!EVIDENCE_STATUSES.has(entry.status)) return "not-applicable";
  return (entry.evidence?.length ?? 0) > 0 ? "verified" : "unverified";
}

/**
 * Note wording that admits a gap. A note like this on a `code`,
 * `declarative` or `drift-risk` entry contradicts its status: the entry is
 * `partial` (or `not-handled`).
 */
export const GAP_WORDING =
  /\bpartial\b|\bnot (?:modeled|read|ported|special-cased|handled|applied|reproduced|implemented)\b|\bno [\w-]+(?: [\w-]+)? model\b|\bunported\b/i;

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
const withEvidence = (
  status: LegacySpecialCaseStatus,
  description: string,
  note: string,
  evidence: readonly string[],
): LegacySpecialCase => ({
  status,
  description,
  note,
  ...(evidence.length === 0 ? {} : { evidence }),
});
const code = (
  description: string,
  note: string,
  ...evidence: string[]
): LegacySpecialCase => withEvidence("code", description, note, evidence);
const partial = (
  description: string,
  note: string,
  ...evidence: string[]
): LegacySpecialCase => withEvidence("partial", description, note, evidence);
const declarative = (
  description: string,
  note: string,
  ...evidence: string[]
): LegacySpecialCase =>
  withEvidence("declarative", description, note, evidence);
const notHandled = (description: string, note: string): LegacySpecialCase => ({
  status: "not-handled",
  description,
  note,
});
const drift = (
  description: string,
  note: string,
  ...evidence: string[]
): LegacySpecialCase => withEvidence("drift-risk", description, note, evidence);

const PREREQ_UNVERIFIED =
  "modern prerequisites.ts has no equivalent; the clause evaluates as unverified (shown, not blocking)";
const AUTO_BUILD = "the modern builder has no auto-build/suggestion engine";
const LEGACY_IO =
  "legacy file I/O; the modern .dnd4e import/export lives in legacy-dnd4e";
const KEY_ABILITY = "packages/rules-engine/src/key-ability-overrides.test.ts";

/** Evidence pointer to a public test (see `LegacySpecialCase.evidence`). */
const test = (file: string, name: string) => `${file} > ${name}`;
/** Evidence pointer to a private fixture character. */
const fixture = (character: string, detail: string) =>
  `private: ${character}: ${detail}`;

const POWERS = "packages/rules-engine/src/powers.test.ts";
const NATIVE_FIELD_BONUSES =
  "packages/rules-engine/src/native-power-field-bonuses.test.ts";
const REQUIREMENTS = "packages/rules-engine/src/power-requirements.test.ts";
const EXCEPTIONS = "packages/rules-engine/src/exceptions.test.ts";
const EQUIPMENT = "packages/rules-engine/src/equipment.test.ts";
const EVALUATOR = "packages/rules-engine/src/evaluator.test.ts";
const PREREQUISITES = "packages/rules-engine/src/prerequisites.test.ts";
const EXPRESSIONS = "packages/rules-engine/src/expressions.test.ts";
const BEAST = "packages/rules-engine/src/beast-companion.test.ts";
const FREEBEES = "packages/rules-engine/src/freebees.test.ts";
const ITEM_SETS = "packages/rules-engine/src/item-sets.test.ts";
const WEAPON_GROUPS = "packages/rules-engine/src/weapon-groups.test.ts";
const ITEM_FIELDS = "packages/rules-engine/src/item-fields.test.ts";
const WOTC_PARSER = "packages/legacy-wotc/src/parser.test.ts";
const LOADOUT_SLOTS = "packages/rules-engine/src/loadout-slots.test.ts";
const SHEET = "packages/sheet-model/src/index.test.ts";
const GOLDEN = "packages/rules-engine/src/golden-matrix.test.ts";
const EQUIPMENT_UI = "apps/web/src/equipment-ui.test.ts";
const ENCUMBRANCE = "packages/sheet-model/src/encumbrance.test.ts";
const PSIONICS = "packages/rules-engine/src/psionics.test.ts";
const ACTION_CARDS = "packages/sheet-model/src/universal-action-cards.test.ts";
const CONFORMANCE =
  "packages/rules-engine/src/construction-conformance.test.ts";

export const LEGACY_SPECIAL_CASES: Readonly<Record<string, LegacySpecialCase>> =
  {
    // --- D20RulesEngine: rules, categories and classes -------------------
    "CategoryOpt.Build": partial(
      "Builds the dynamic $$ category sets: class and _ParentClass, hybrid _BaseClass, CountsAsClass, Diverse Study (ID_FMP_FEAT_651 -> ID_FMP_PSEUDO_CLASS_216), Seeker, Versatile Master and Paragon Multiclassing records by ID, and the 'PowersAsClass' text string's class.",
      "rules-engine exceptions.ts EXCEPTION_IDS + evaluator category expansion. Missing: the 'PowersAsClass' text string (42 records outside Level1Rules, e.g. the Knowledge of Ancient Lives features) never adds its class to the power categories",
      test(EXCEPTIONS, "covers Diverse Study"),
      test(EXCEPTIONS, "covers Seeker and Versatile Master class powers"),
      test(
        EVALUATOR,
        "promotes CountsAsClass power categories for paragon multiclassing",
      ),
    ),
    "?A0x1e9d9cdc.DiverseStudyException": code(
      "Diverse Study: arcane-source powers match the pseudo-class category.",
      "exceptions.ts diverseStudyException",
      test(EXCEPTIONS, "covers Diverse Study"),
    ),
    "?A0x2c46c09a.ShouldChoose": code(
      "Deity choice is required for classes whose _PARSED_CLASS_FEATURE or Hybrid Talent Options mention Channel Divinity, except the Warpriest by name.",
      "exceptions.ts shouldChooseDeity / DEITY_CHOICE_EXCLUDED_CLASS_NAME",
      test(
        EXCEPTIONS,
        "requires a deity from either recovered class metadata field",
      ),
      test(
        EXCEPTIONS,
        "preserves the exact case-insensitive Warpriest exclusion",
      ),
      test(
        EVALUATOR,
        "keeps deity optional for uncovered and excluded classes",
      ),
    ),
    "?A0x2c46c09a.ContainsChannelDivinity": code(
      "Case-insensitive 'channel divinity' substring test behind ShouldChoose.",
      "exceptions.ts shouldChooseDeity",
      test(
        EXCEPTIONS,
        "requires a deity from either recovered class metadata field",
      ),
    ),
    "RulesElement.IsPsionicClass": notHandled(
      "A class is psionic when _PARSED_CLASS_FEATURE names Psionic Augmentation (power points, augmentable at-wills).",
      "no modern psionic/power-point model; augmentable powers are not calculated",
    ),
    PsionicDaily: code(
      "Prerequisite 'at least one psionic daily attack power': owned daily psionic attack powers.",
      "prerequisites.ts predicate kind (psionic-daily-attack)",
      test(PREREQUISITES, "reads %s [at least one psionic daily attack power]"),
    ),
    "?A0xca3c2cf6.PsionicConventionalist": code(
      "Psionic Conventionalist (ID_FMP_FEAT_2732) removes 2/4/6 power points by swapped power level.",
      "psionics.ts nativePsionics: an untyped Power Points statadd of -2/-4/-6 by the Level of the power its latest multiclass swap replaced (EXCEPTION_IDS.psionicConventionalist)",
      test(
        PSIONICS,
        "takes Psionic Conventionalist's power points by the swapped power's Level",
      ),
    ),
    "?A0xca3c2cf6.Psionics": code(
      "Power points: strips 'Augmentable' from locked powers' Keywords and adds 2/4/6 'Hybrid Power Points' per owned class at-will attack by its Level, then applies Psionic Conventionalist.",
      "psionics.ts nativePsionics, appended after every element's rules: the Hybrid Power Points literal (which ID_INTERNAL_INTERNAL_HYBRID_POWER_POINTS and Psionic Dabbler link into Power Points) and Keywords overlays for locked records. Unlocked = _AugmentVersions, no _SuppressAugments, not chosen by a Racial Trait (the original of its replacement chain). Psionic Dabbler's own 'modify Power Usage Encounter' makes its power fail the At-Will test, as the overlaid native field read does",
      test(
        PSIONICS,
        "adds 2/4/6 per owned unlocked augmentable at-will attack and strips locked keywords",
      ),
      "private: sample-chars/Beldin Hammertongue 11.dnd4e: Hybrid Power Points 6 (full Ardent) matches the cached stat",
    ),
    "?A0xca3c2cf6.CheckHybridPower": notHandled(
      "Hybrid characters: a power of one hybrid class is offered only when the other class already has a power of the same Power Type and Power Usage at that level (alternating hybrid power picks).",
      "modern power choices do not constrain hybrid characters by the other class's picks",
    ),
    DisallowClass: notHandled(
      "Hybrid power choice slots: once one class has the level's power (by Power Usage/Power Type; psionic classes count for encounter slots), the slot is limited to the other class.",
      "modern hybrid power choices offer both classes for every slot",
    ),
    "D20Choice.CheckReplaceElem": partial(
      "Which owned elements a retrain/replace choice may swap: same-level Prepare slots, multiclass power swaps (Display 'attack' at-wills), powerswap categories (unlocked augmentable at-wills), power-replace and the hybrid CheckHybridPower rule.",
      "character-domain retrainSelection / replaceSelection cover retraining. evaluator powerReplaceOptions reproduces power-replace (named gain, LOSE category, N = level or lower, N+ = N or higher, no re-swap of a multiclass/power-replace gain) for chosen powers only; the multiclass Display 'attack' and hybrid CheckHybridPower limits are not reproduced",
      test(CONFORMANCE, "reads a bare level as that level or lower"),
      test(
        CONFORMANCE,
        "applies the swap: the lost power is gone and the named power is held",
      ),
    ),
    "?A0x7555d940.FromDilettante": code(
      "Powers chosen through the Dilettante racial trait (ID_FMP_RACIAL_TRAIT_643) are treated as out-of-class/encounter; OverrideStat then reads 'dilettante:key ability' (Adept Dilettante).",
      "key-ability-overrides.ts powerOrigins: a power whose occurrence's parent is the Dilettante trait (EXCEPTION_IDS.dilettante) reads 'dilettante:key ability', damage following; the encounter usage is the trait's own modify Power Usage",
      test(
        KEY_ABILITY,
        "applies dilettante and multiclass overrides by where the power came from",
      ),
    ),
    FindDilettante: notHandled(
      "Prerequisite clauses about the Dilettante power's kind look up the Dilettante racial trait's chosen power by ID.",
      `${PREREQ_UNVERIFIED}; needs choice provenance in the prerequisite context (3 records)`,
    ),
    MeleeDilettante: notHandled(
      "Prerequisite 'you must have chosen a melee attack power for your Dilettante racial trait': the Dilettante power is an attack (Power Type) with a melee Attack Type.",
      `${PREREQ_UNVERIFIED} (FindDilettante)`,
    ),
    ImplementDilettante: notHandled(
      "Prerequisite 'you must have chosen an implement power for your Dilettante racial trait': the Dilettante power has the Implement keyword.",
      `${PREREQ_UNVERIFIED} (FindDilettante)`,
    ),
    "?A0x7555d940.FromMulticlassing": code(
      "Multiclass-sourced powers (Dilettante, Paragon Multiclassing IDs, multiclass feats) get the 'multiclass' (and, from feats, 'multiclass feat') keyword and read 'multiclass:key ability'.",
      "key-ability-overrides.ts powerOrigins (multiclass / multiclassFeat, through _AugmentParent), read by Combat Virtuoso's 'multiclass:key ability' and powers.ts nativeRowKeywords (Compensatory Insight's 'multiclass feat:damage')",
      test(
        KEY_ABILITY,
        "applies dilettante and multiclass overrides by where the power came from",
      ),
      test(
        POWERS,
        "adds 'multiclass' and 'multiclass feat' by the power's origin (FromMulticlassing)",
      ),
    ),
    "D20Workspace.ClassName": generic(
      "Displays a hybrid character's class as 'Hybrid A|B'.",
    ),
    "D20Workspace.RulesElementSource": generic(
      "Maps the 'Core' source to a book title (hybrid records to PHB3, otherwise PHB/Divine Power).",
      "presentation of sources; modern shows the authored source",
    ),
    "?A0x03aa98b1.HybridArmorProf": code(
      "An armor or shield Proficiency granted by a hybrid Grants record is deferred until the other hybrid half grants the same proficiency (a hybrid is proficient only with armor both classes grant).",
      "evaluator hybridGrantDeferred: such a grant (and a saved legacy element under it) is inactive unless another hybrid Grants occurrence's active grant rule names the same record; other sources (Armored Warlord, Battlefront Leader) still grant it",
      test(
        EVALUATOR,
        "grants a hybrid armor or shield proficiency only when both halves grant it",
      ),
      fixture(
        "sample-chars/Alysa Redfield.dnd4e",
        "Hybrid Fighter|Warlord: Scale comes only from Armored Warlord (without it Reflex drops 2 in Scale Armor); Heavy Shield from Battlefront Leader (Hybrid)",
      ),
    ),
    "D20Workspace.IsEssentials": code(
      "A character is 'Essentials' when any owned class has a _ParentClass (gates the Essentials magic armor table and auto-build).",
      "evaluator essentialsMagicArmorBonuses keys on the armor and enchantment, as EssentialsMagicArmor does; the class-level flag only feeds auto-build",
    ),
    "?A0x1e9d9cdc.CustomElement": generic(
      "Custom (homebrew) Language records get the Starting category; custom ritual scrolls get type Ritual.",
      "applies only to custom (homebrew) records the modern app does not author; a custom Language would get the Starting category",
    ),
    "?A0x1e9d9cdc.InitStockTypes": generic(
      "Registers the stock entity types by name.",
    ),
    "D20RulesEngine/RULE.cs": generic(
      "Rule-statement static strings (field names, slots, money).",
    ),
    ParseOneRule: code(
      "Rules XML statement parser: statement attributes (Usage, spellbook, type, ...). An unconditional `modify name=\"this\"` (no type, no requires/wearing/not-wearing) writes its value into the record itself at database load: 'Prereqs' replaces the prerequisites, any other field goes through UpdateSpecificField (replace the field or append it).",
      "content-pack import parses the same rule attributes; legacy-wotc self-modify.ts applyLoadTimeSelfModifies applies the load-time 'this' modify in the parser, so every consumer (compendium included) sees Hyrsam Fiddle's _ImplementForClass, Spiked Shield's WeaponEquiv, Deck of Many Things' Item Slot, Clarifying Impact's _BasicAttack and 36 paladin powers' Divine Sanction. Deliberate D091 difference: a value the authored field already lists (ListContains) leaves it alone, so Faervian +5/+6 keep all five _ImplementForPower power sources (native keeps only the last; the item text names every Implement class)",
      test(
        WOTC_PARSER,
        "writes an unconditional value into the record's own field at load",
      ),
      test(WOTC_PARSER, "replaces a field and the Prereqs, last value winning"),
      test(
        WOTC_PARSER,
        "keeps an authored list that already contains each value (D091, Faervian)",
      ),
      test(
        WOTC_PARSER,
        "leaves conditional, typed and list-addition this-modifies to run time",
      ),
    ),
    "?A0x1e9d9cdc.ParseRulesElement": generic(
      "Rules XML element parser (name, type, internal-id, source, revision-date).",
      "content-pack import",
    ),
    RulesElementFromAttributes: code(
      "Resolves a saved element by internal-id, then by name and type.",
      "legacy-dnd4e importDnd4e resolves by internal-id; with matchMissingDefinitionsIn a missing id falls back to the one same-named record of that type",
      test(
        "packages/legacy-dnd4e/src/definition-matching.test.ts",
        "uses the one same-named record everywhere the build names one",
      ),
    ),
    PrereqListStart: outOfScope("Writes a DependsOn block.", LEGACY_IO),
    PrereqList: outOfScope(
      "Writes non-core, non-internal prerequisite dependencies.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.ParseTextString": outOfScope(
      "Character file text strings; skips the _CLASSNAME text string.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.ParseCharacterPiece": outOfScope(
      "Character file section dispatch (Campaign, loot, RulesElementTally, ...).",
      LEGACY_IO,
    ),
    "D20Workspace.RulesElementIsOwned": code(
      "Source entitlements: an element is owned when one of its sources is entitled and its _RequiresID record is owned too.",
      "evaluator.ts source entitlement check, including the _RequiresID chain",
      test(
        EVALUATOR,
        "separates source entitlement, rules legality, active membership, and provider ownership",
      ),
    ),
    "D20Workspace.C_RulesElementField": partial(
      "Field lookup: name/Element Type/Flavor/Description/ID pseudo-fields, then 'modify' overlays, then the _AugmentParent power's overlays for an augment version, then the record's own field.",
      "item-fields.ts overlaidField/overlaidEntity resolve overlays by target ID, or by name/ID and type for any record (owned or not); loot records are read overlaid by power rows (withOverlaidItems), the wearing selectors and the item cards. An augment version (689 records with _AugmentParent) does not inherit overlays aimed at its parent power",
      test(POWERS, "materializes and deduplicates psionic augment versions"),
      test(
        ITEM_FIELDS,
        "applies value, list-addition and die-increase in order without mutating content",
      ),
      test(
        POWERS,
        "reads modified weapon properties, proficiency, damage and range",
      ),
      test(
        SHEET,
        "shows an item card with the character's modified weapon fields",
      ),
    ),
    "D20Workspace.IsAugmentablePower": code(
      "A power with _AugmentVersions is augmentable.",
      "powers.ts evaluatePowers expands _AugmentVersions",
      test(POWERS, "materializes and deduplicates psionic augment versions"),
    ),
    "D20Workspace.PowerAugmentCount": code(
      "Number of _AugmentVersions entries.",
      "powers.ts evaluatePowers",
      test(POWERS, "materializes and deduplicates psionic augment versions"),
    ),
    "D20Workspace.AugmentPowerVersion": code(
      "Resolves the Nth _AugmentVersions entry.",
      "powers.ts evaluatePowers",
      test(POWERS, "materializes and deduplicates psionic augment versions"),
    ),
    LoadRulesDatabase: code(
      "Rules database load; flags every Power carrying a _ThemePower field. ThemePowerRestriction (D20Choice::UpdateArrays) then makes those illegal in an exact $$CLASS Power select whose category names neither utility nor at-will, unless the character holds, at the choice's level, another element of that category whose Class field names one of its classes; CategoryMatch::Matches lets them through an exact-level 'N-N' category at any level up to N.",
      "evaluator.ts themePowerRestricted (candidate reason 'theme-power'); expressions.ts numericMatch for 'N-N' (no shipped category uses it). The rest of the load is legacy file I/O.",
      test(
        EVALUATOR,
        "keeps a theme power out of a $$CLASS encounter or daily slot until a class power of that kind is held",
      ),
      test(
        EXPRESSIONS,
        "reads an N-N level as exact, except for a theme power up to N",
      ),
    ),

    // --- D20RulesEngine: prerequisite parser ---------------------------
    SpecialCase: declarative(
      "Prerequisite alias table: about 60 exact clauses mapped to other records or combinations (shifter -> Razorclaw/Longtooth, spellscar, Fighter Weapon Talent, Flurry of Blows, 21st-level wizard/bard, Turn Undead, Harpers, House Vadalis, manifestations, healing infusions, dragon breath damage types, ...), plus generic Nth-level, race-plus-class and family branches.",
      "Exact aliases are Prereqs rewrites in content/corrections/93-prerequisites.part (records with print-prereqs) and the Shifter CountsAsRace in 92-legacy-special-cases.part; generic branches are prerequisites.ts legacyClause. Deliberately different (D090): legacy maps spellscar, Harpers, House Vadalis and Circle of Smoke to records nothing grants, so it always fails them; 93-prerequisites.part instead lets a representing option meet them (Harper Agent background or theme, a Vadalis background, the Spellscar CountsAsFeature) and leaves the original wording as an unverified alternative (Circle of Smoke has no option). Generalized in prerequisites.ts qualifiedClause (records without print-prereqs too): 'Nth-level <X>' (the 21st-level wizard/bard aliases), '<A> with the <B>', '<A> from <place>', '<B> <class>' (race-plus-class beyond the first word), and 'Cormyr' as every 'Cormyr (...)' record of a typed prefix's type. Deliberately different (D091): the Ghost of Eventide and Silverstar aliases are no longer rewrites, since legacy's readings needed a rogue only for Cormyr and dropped the implement qualifier from 'any arcane'; the parser reads the published text. Still open: '1 or more power points' (no power-point stat) and the Dilettante predicates stay unverified",
      test(
        PREREQUISITES,
        "resolves a bare race-family name through a granted CountsAsRace",
      ),
      test(PREREQUISITES, "reads Nth-level <class> as the level and the class"),
      test(
        PREREQUISITES,
        "meets a story membership by a representing option, else leaves it unverified",
      ),
      test(PREREQUISITES, "reads %s [dwarf fighter]"),
    ),
    FirstSpecialCase: notHandled(
      "Before name lookup: 'familiar' means Arcane Familiar; 'weapon focus'/'weapon expertise' mean any feat of that container.",
      "no record in the current pack uses these bare clauses unresolved",
    ),
    ProficiencySpecialCase: code(
      "Proficiency clause grammar: chosen skill, weapon groups by hands, non-spear polearm, superior weapon, heavy blade properties, armor/shield names.",
      "prerequisites.ts proficiencySpecialCase for comma and 'or' parts after a 'Proficiency with' prefix (weapon, group, hand-and-group, property phrases generalized to '<group> that has the <property> property', 'a superior weapon' generalized to 'a <category> weapon', and the armor/shield literals generalized to any Armor/Shield Proficiency record; a trailing relative clause and a first alternative's 'any' are distributed over every alternative), read before a same-named weapon or armor record; the prefixed clause itself keeps the 'proficiency' kind name-substring match unless a shared tail completes it ('light or heavy shields')",
      test(
        PREREQUISITES,
        "carries a proficiency prefix to later weapon-group clauses",
      ),
      test(
        PREREQUISITES,
        "distributes a trailing relative clause to every alternative",
      ),
      test(
        PREREQUISITES,
        "distributes a first alternative's any over a proficiency list",
      ),
      test(
        PREREQUISITES,
        "reads armor and shield proficiencies, sharing a tail",
      ),
    ),
    NonSpearPolearm: code(
      "'Non-spear polearm' proficiency: polearm group without the spear group.",
      "prerequisites.ts LEGACY_WEAPON_PHRASES",
    ),
    HeavyArmor: notHandled(
      "'Heavy armor' proficiency: any armor proficiency whose armor is heavy.",
      "no unresolved record uses it",
    ),
    Proficiency: code(
      "Builds '<kind> proficiency (<name>)' lookups for the proficiency parser.",
      "prerequisites.ts proficiencySpecialCase",
      test(
        PREREQUISITES,
        "carries a proficiency prefix to later weapon-group clauses",
      ),
    ),
    "?A0xf75eff9b.ProficiencyWeapon": code(
      "Resolves the weapon named in a 'Weapon Proficiency (...)' record.",
      "prerequisites.ts proficiencySpecialCase",
      test(
        PREREQUISITES,
        "carries a proficiency prefix to later weapon-group clauses",
      ),
    ),
    ByGroup: code(
      "Proficiency clause '<group>': weapon proficiencies whose weapon's Group contains it.",
      "prerequisites.ts proficiencySpecialCase",
      test(
        PREREQUISITES,
        "carries a proficiency prefix to later weapon-group clauses",
      ),
    ),
    ByHandAndGroup: code(
      "Proficiency clause 'one-/two-handed <group>': Group plus exact Hands Required.",
      "prerequisites.ts proficiencySpecialCase (hand-and-group)",
      test(
        PREREQUISITES,
        "distributes a trailing relative clause to every alternative",
      ),
    ),
    HighCritHeavyBlade: code(
      "'Any heavy blade with the high crit property': heavy blade Group with High Crit.",
      "prerequisites.ts, generalized to '<group> that has the <property> property'",
      test(
        PREREQUISITES,
        "distributes a trailing relative clause to every alternative",
      ),
    ),
    VersatileMace: code(
      "'Mace that has the versatile property'.",
      "prerequisites.ts, generalized to '<group> that has the <property> property'",
      test(
        PREREQUISITES,
        "distributes a trailing relative clause to every alternative",
      ),
    ),
    VersatileHeavyBlade: code(
      "'Any heavy blade that has the versatile property'.",
      "prerequisites.ts, generalized to '<group> that has the <property> property'",
      test(
        PREREQUISITES,
        "distributes a trailing relative clause to every alternative",
      ),
    ),
    MeleeLightBlade: code(
      "'Any melee light blade': light blade Group with a melee Weapon Category.",
      "prerequisites.ts proficiencySpecialCase",
    ),
    Superior: code(
      "'A superior weapon': a superior Weapon Category.",
      "prerequisites.ts, generalized to 'a <category> weapon'",
    ),
    CompanionSpecialCase: declarative(
      "Beast companion clauses (wolf/cat, 'Beast Mastery Class Feature (x or y)') resolve to Companion records.",
      "content/corrections/93-prerequisites.part rewrites them to 'X [Beast] Companion'",
    ),
    TwoKnowledgeSkills: declarative(
      "'Two knowledge skills': any two of Arcana, Dungeoneering, History, Nature, Religion trained.",
      "content/corrections/93-prerequisites.part rewrites the clause to the trained pairs; prerequisites.ts trainingInAnyOf reads the rewritten form",
      test(PREREQUISITES, "reads training in any two of a list as one clause"),
    ),
    HarperTraining: code(
      "Harper prerequisite: training in any two of four named skills, read whole before comma splitting.",
      "prerequisites.ts trainingInAnyOf reads any 'training in any N of A, B, ... or Z' block whole as the trained combinations; 93-prerequisites.part also rewrites the Harper of Legend clause to the trained pairs",
      test(PREREQUISITES, "reads training in any two of a list as one clause"),
    ),
    InternalizeBlock: code(
      "Clause 'membership in the Circle of Smoke and Whispers' maps to that record before comma splitting (LineParse otherwise splits at every depth-zero comma and ' and '); also applies the Prefixes table (training, worship, follower of, affiliated with, fluent in, ...) and carries a prefix's type to later comma parts.",
      "Prefixes: prerequisites.ts LEGACY_PREFIXES. Type carry-over (CreateElementPrereq skips other types): carriedParts hands a prefix's type to later comma parts and, as InternalizeOr hands the rest of the text to InternalizeBlock, to later ' or ' alternatives; inheritedTypeClause reads them as that type first ('trained in Bluff or Stealth' is Stealth training, not the Stealth skill). Whole clause, generalized: prerequisites.ts knownNameSpans never splits inside a known record name that contains a connector, so the Circle of Smoke clause stays one clause; it stays unverified (D090: its record is granted by nothing, so legacy always fails it). scripts/audit-prerequisites.ts reports any split inside a known name or a legacy whole clause, and any part read as another type than its carried prefix",
      test(PREREQUISITES, "keeps a membership naming a known record whole"),
      test(
        PREREQUISITES,
        "carries a prefix's type to the alternatives after it",
      ),
      test(
        PREREQUISITES,
        "does not split and, or, or a comma inside a known name",
      ),
    ),
    InternalizeElement: code(
      "Name lookup for a prerequisite token. Its walk of the same-named records skips Grants records, CountsAsRace records unless the prerequisite's owner is a Feat, and a Background named 'assassin' (so the Assassin background never meets a bare 'Assassin' clause); the internal-ID and '<name> <type>' links bypass the walk.",
      "prerequisites.ts internalizedDefinitions (the name walk) and compositeElement / typed references (the '<name> <type>' link); the 'assassin' name is EXCEPTION_NAMES.assassinBackground. A non-feat's bare 'Shifter' (the corrections CountsAsRace) still resolves through the evaluator's owned-token lookup, as native SpecialCase 'shifter' does.",
      test(
        PREREQUISITES,
        "skips what legacy InternalizeElement drops from a name lookup",
      ),
      test(
        PREREQUISITES,
        "resolves a bare race-family name through a granted CountsAsRace",
      ),
    ),
    AnyClassSpecific: code(
      "'Any class-specific multiclass feat': every multiclass feat, plus Student of the Plague and Adept Dilettante by name.",
      "prerequisites.ts classSpecificFamily",
      test(PREREQUISITES, "reads %s [any class-specific multiclass feat]"),
    ),
    AnyClassMoreSpecific: code(
      "Class-specific multiclass feats for classes with or without Psionic Augmentation.",
      "prerequisites.ts classSpecificFamily",
      test(
        PREREQUISITES,
        "does not count a psionic class's multiclass feat as non-psionic",
      ),
    ),
    AnyClassNoPsi: code(
      "'Any class that doesn't have the Psionic Augmentation class feature'.",
      "prerequisites.ts classSpecificFamily",
      test(
        PREREQUISITES,
        "reads %s [any class that doesn't have the Psionic Augmentation class feature]",
      ),
    ),
    AnyWarlockPact: code(
      "'Any warlock pact': any CountsAsPact or Eldritch Pact-category record.",
      "prerequisites.ts legacyClause",
      test(PREREQUISITES, "reads %s [any warlock pact]"),
    ),
    MulticlassDivine: code(
      "'Multiclass divine class': any multiclass feat of a divine class.",
      "prerequisites.ts legacyClause, generalized to 'multiclass <source> class'",
      test(
        PREREQUISITES,
        "reads multiclass source and more-than-one-class clauses",
      ),
    ),
    ParagonMulticlassing: code(
      "'Paragon multiclassing as a X': Paragon Multiclassing plus any multiclass X feat.",
      "prerequisites.ts legacyClause (and paragonMulticlassingInSource for 'in a martial class')",
      test(PREREQUISITES, "reads %s [paragon multiclassing as a fighter]"),
    ),
    RememberedKnack: code(
      "'Any class-specific multiclassing feat that grants training in a skill'.",
      "prerequisites.ts classSpecificFamily",
    ),
    MoreThanOneClass: code(
      "'Must have more than one class': hybrid or a CountsAsClass record.",
      "prerequisites.ts legacyClause (the Hybrid class name is EXCEPTION_NAMES.hybridClass)",
      test(
        PREREQUISITES,
        "reads multiclass source and more-than-one-class clauses",
      ),
    ),
    HealingInfusion: code(
      "Detects 'Healing Infusion:' power names for infusion-count clauses.",
      "prerequisites.ts healing-infusion-power predicate",
      test(PREREQUISITES, "reads %s [at least one healing infusion power]"),
    ),
    AnyFeat: code(
      "'Any X feat' / 'At least one X feat' / 'vampire bloodline feat' count feats by type.",
      "prerequisites.ts anyFeat ('any'/'at least one' X feat by feat type); 'vampire bloodline feat' is a content/corrections/93-prerequisites.part rewrite",
      test(PREREQUISITES, "reads %s [any multiclass fighter feat]"),
      test(PREREQUISITES, "reads %s [at least one arena fighting feat]"),
    ),
    AnyXXXClass: code(
      "'Any <source> Class' and 'non-<source>' class prerequisites.",
      "prerequisites.ts class-source kind (positive forms only; SpecialCase's 'Arcane Class' alias generalized to '<source> class'). A '<name> class' clause is a class requirement only when a class, hybrid class or CountsAsClass has that name; SpecialCase's 'any defender (class)' is generalized to any Role. Shared-word coordination ('Any martial or divine class'), which legacy InternalizeOr splits into an Unrecognized 'Any martial', is read as each alternative with the shared words (distributeSharedWords)",
      test(PREREQUISITES, "reads a class clause only when it names a class"),
      test(
        PREREQUISITES,
        "distributes a shared head or tail to an alternative missing it",
      ),
    ),
    Ignore: code(
      "Prerequisite clauses the parser skips (humanoid forms, three unverifiable clauses).",
      "prerequisites.ts LEGACY_IGNORED_CLAUSES, a hand list this audit checks against the legacy literals. Ignore yields no prerequisite, so InternalizeOr keeps only the other side: an ignored ' or ' alternative is dropped ('6th-level or higher utility power' needs 6th level)",
      test(PREREQUISITES, "treats the clauses legacy ignores as met"),
      test(
        PREREQUISITES,
        "drops an ignored alternative, as legacy InternalizeOr does",
      ),
    ),
    Unrecognized: code(
      "Unrecognized clauses become an illegal stub; four known non-clauses only suppress the debug log.",
      "prerequisites.ts: 'Unselectable' -> never (as legacy); other unrecognized clauses deliberately unverified rather than failing",
      test(
        PREREQUISITES,
        "keeps unresolved markers and unknown prose unverified",
      ),
    ),
    PrereqSpecialReason: generic(
      "Failure-reason text for exclusive (~) clauses.",
    ),
    InitializeAbilityScores: code(
      "Ability score records except 'any'.",
      "rules-engine ability-scores.ts ABILITY_SCORE_NAMES, the fixed six abilities",
      test(
        "packages/rules-engine/src/ability-scores.test.ts",
        "starts with 22 points and accepts the standard array",
      ),
    ),
    ListContains: code(
      "'any' matches every list entry. CalcModifiedValue uses it to skip a list-addition the field already contains.",
      "content-domain legacyListContains; item-fields.ts modifiedFieldValue (shared by item fields and powers.ts power fields) leaves the field unchanged, so AllAsThrown's Heavy Thrown, Two-Fisted Shooter's and Crossbow Savant's Load Free and Power of Skill's Lightning no longer repeat",
      test(
        WEAPON_GROUPS,
        "matches whole comma entries like native ListContains",
      ),
      test(
        ITEM_FIELDS,
        "skips a list-addition the field already contains, as native ListContains",
      ),
      test(
        POWERS,
        "adds a keyword only when the power does not already have it",
      ),
      fixture(
        "sample-chars/Hunzu 10.dnd4e",
        "Power of Skill list-adds Lightning to Divine Bolts (Divine, Implement, Lightning): keywords stay three, not 'Lightning, Lightning'",
      ),
    ),

    // --- D20RulesEngine: items and equipment --------------------------
    "D20Workspace.RulesElementIsBoon": code(
      "Magic Item Types containing 'boon'/'training' or equal to eleven named types are boons.",
      "equipment-ui.ts LEGACY_BOON_* / isLegacyBoonType, a hand list this audit checks against the legacy literals",
      test(EQUIPMENT_UI, "mirrors RulesElementIsBoon's words and exact types"),
      test(EQUIPMENT_UI, "files every boon with the special items"),
    ),
    "D20Workspace.CharLootIsAugment": partial(
      "Dragonshard Augment magic items are augments of another item (CharacterLootItem.IsAugment; CharLootAugment binds one to a magic weapon).",
      "powers.ts boundAugment reads a saved loot 'augment' binding so an augment-named limiter matches (2575583); there is no slot or command to bind an augment in the modern inventory, and the augment's own rules (Siberys Shard damage) are not applied to the bound item",
      test(
        POWERS,
        "matches an augment limiter on the item the augment is bound to",
      ),
    ),
    MeetsItemRequirement: code(
      "Two item Requirement texts check Internal records (living construct -> Can Use Components; ki focus users -> Ki Focus User); other items check their Prerequisite. EquipLoot lists an equipped item that fails as custom equipment (a house rule); the shop neither hides nor blocks it.",
      "rules-engine exceptions.ts ITEM_REQUIREMENT_RECORDS / meetsItemRequirement; evaluator item.requirement-unmet (equipped items only, character not rules-legal) shown as a house-rule issue",
      test(
        REQUIREMENTS,
        "checks the living construct and ki focus texts against Internal records",
      ),
      test(
        EVALUATOR,
        "accepts the item once the Internal record is owned, or unequipped",
      ),
    ),
    "?A0xf75eff9b.MeetsItemPrereq": code(
      "Item prerequisite 'familiar must be in active mode' always passes; so does every other.",
      "meetsItemRequirement ignores item Prerequisite, as legacy always passes it",
      test(REQUIREMENTS, "passes every other Requirement, as legacy does"),
    ),
    "D20Workspace.IsValidLoot": partial(
      "Enchantment/base compatibility: weapons via IsValidWeapon; superior implements when the enchantment's Magic Item Type equals the Group, a staff via Quarterstaff (ID_FMP_WEAPON_10) or a WeaponEquiv weapon; shields via ValidateShield; armor by Armor/Armor Category name and Minimum Enhancement; masterwork armor (a Minimum Enhancement Bonus) held without an enchantment only with Inherent Bonuses; Weapon/Armor enchantments never alone.",
      "equipment-ui.ts compatibleBaseItems covers armor, shields, minimum enhancement and superior implement types; masterwork armor (80 armors) can be bought and kept mundane without Inherent Bonuses, and superior-implement Quarterstaff/WeaponEquiv validation is not reproduced",
      test(
        EQUIPMENT_UI,
        "pairs armor and weapon enchantments only with compatible bases",
      ),
      test(
        EQUIPMENT_UI,
        "offers exact superior implements only when their authored type matches",
      ),
    ),
    "D20Workspace.IsEnchantment": code(
      "Armor/Weapon magic items and shield arms-slot items enchant a base item.",
      "equipment-ui.ts shopBrowseCategory / compatibleBaseItems",
      test(
        EQUIPMENT_UI,
        "pairs armor and weapon enchantments only with compatible bases",
      ),
    ),
    "?A0x0bed2cbe.ValidateShield": code(
      "Arms-slot enchantments named for shields require a shield base.",
      "equipment-ui.ts compatibleBaseItems keys shield enchantments on _IsEnchant 'Shield' rather than the 'shield' name",
      test(
        EQUIPMENT_UI,
        "pairs armor and weapon enchantments only with compatible bases",
      ),
    ),
    "?A0x0bed2cbe.IsShield": code(
      "Shield detection by Armor Type or _IsEnchant.",
      "rules-engine loadout-slots.ts isAuthoredShield",
      test(
        EQUIPMENT_UI,
        "pairs armor and weapon enchantments only with compatible bases",
      ),
    ),
    "?A0x0bed2cbe.IsValidWeapon": partial(
      "Weapon enchantment 'Weapon' field grammar: Spiked Gauntlets (base named 'spiked gauntlet'), Any Melee, Any melee except reach weapons, (Any) one-handed melee weapon, Any one-handed weapon, Any Ranged (IsRanged), Any thrown, else a list matching the base's Group, name or double weapon's _Secondary End group.",
      "equipment-ui.ts compatibleBaseItems: probing the pack, 'Any melee except reach weapons' (6 enchantments, e.g. Reckless Weapon), 'One-handed melee weapon' (6, e.g. Warsoul Weapon) and 'Spiked gauntlets' (5, e.g. Tigerclaw Gauntlets) offer no base at all; the _Secondary End group is not read; plural lists ('Axes, hammers, heavy blades', 6) also offer none",
      test(
        EQUIPMENT_UI,
        "pairs armor and weapon enchantments only with compatible bases",
      ),
    ),
    IsRanged: code(
      "A base is ranged by a ranged Weapon Category or a Range (thrown).",
      "equipment-ui.ts compatibleBaseItems 'any ranged'",
    ),
    "?A0x0bed2cbe.CharLootName": partial(
      "Composes '<enchantment> <base>' item names, replacing implement/weapon words.",
      "the name is an identity for _INTERNAL_MainHandWeapon/_INTERNAL_EquippedSymbol; modern matches the hint against formatInventoryItemName's D091 name (case-sensitive in loadout-slots named()), and never reads _INTERNAL_EquippedSymbol (symbol-slot holdings import unequipped)",
      test(
        LOADOUT_SLOTS,
        "places imported holdings where native CharLootSlot puts them",
      ),
    ),
    "?A0x0bed2cbe.TransformLoot": notHandled(
      "Buying a slotless magic item whose Weapon or Armor field names exactly one base turns it into that base plus the item as its enchantment.",
      "modern buys such an item on its own (no automatic base)",
    ),
    "?A0x0bed2cbe.CopyCost": code(
      "Item cost from Copper/Silver/Gold fields, else the Market Price text.",
      "equipment-ui.ts entityCurrencyCopper",
      test(EQUIPMENT_UI, "reads authored prices and ritual subtypes"),
    ),
    "D20Workspace.LootCost": partial(
      "Loot cost: the enchantment's cost when valid, else the base's; rituals divided by the '<type> Cost Modifier' stat + 1.",
      "equipment-ui.ts entityCurrencyCopper; the 'Ritual Cost Modifier' stat (Secret Formularies) does not discount ritual prices",
      test(EQUIPMENT_UI, "reads authored prices and ritual subtypes"),
    ),
    ImplementType: code(
      "Implement kind from Magic Item Type (Rod, Staff, Wand, Orb, Totem, Tome, Holy Symbol, Ki Focus), '<X> Implement'/'Implement, <X>' gear names, Holy Symbol/Totem/Ki Focus gear, and a superior implement's WeaponEquiv name or Group.",
      "item-fields.ts legacyImplementType (through legacyLootImplement): powers.ts loadouts make mundane Orb/Rod/Staff/Wand/Tome Implement and Totem gear (ID_FMP_GEAR_3/12/13/14/87/101) implement rows (Japheth sold his Rod Implement at level 15, so no row there)",
      test(POWERS, "treats mundane holy symbols as implement choices"),
      test(
        POWERS,
        "makes mundane implement gear implement rows, and a staff a Quarterstaff",
      ),
    ),
    "?A0xe93d131c.IsImplementName": outOfScope(
      "Same implement-name rule for the auto-build combo tables.",
      AUTO_BUILD,
    ),
    "D20Workspace.IsHolySymbol": code(
      "Holy symbol detection.",
      "powers.ts loadouts",
      test(POWERS, "treats mundane holy symbols as implement choices"),
    ),
    "D20Workspace.IsKiFocus": code(
      "Ki focus detection.",
      "powers.ts loadouts (ki focus implements are never an off-hand candidate)",
      test(
        POWERS,
        "pairs dual implements by legacy DetermineOffhand without a hand selection",
      ),
    ),
    "?A0x7555d940.IsKiFocus": code(
      "Ki focus detection, including the mundane Ki Focus gear (ID_FMP_GEAR_115). BuildWeaponsList (-Module-.cs ~22325) calls BuildKiList (~22237) for each equipped ki focus: one synthetic ki-focused loot per owned weapon base not already listed, pairing the bare base with the ki focus.",
      "item-fields.ts legacyIsKiFocus (LootImplement's 'Ki Focuses', the 'Ki Focuses Implement' channel); equipment-ui.ts MUNDANE_IMPLEMENT_IDS for the shop; powers.ts ki-focused weapon rows (2f9566d, BuildKiList)",
      test(
        POWERS,
        "names a ki focus 'Ki Focuses Implement' (LootImplement), not its item type",
      ),
      test(
        POWERS,
        "adds a ki-focused row per owned weapon base for an equipped ki focus (native BuildKiList)",
      ),
    ),
    "D20Workspace.IsStaff": code(
      "Staff detection: staff implement gear names, Staff magic items, Quarterstaff (ID_FMP_WEAPON_10), staff group.",
      "item-fields.ts legacyIsStaff, read by power rows and the 'staff' wearing selectors",
      test(
        EVALUATOR,
        "reads weapon selectors through categories, names, staves and hand slots (native HasLoot)",
      ),
      test(
        POWERS,
        "treats magic staves as both implements and quarterstaff weapons",
      ),
      test(REQUIREMENTS, "attacks with a staff as the Quarterstaff record"),
    ),
    "D20Workspace.IsMagicWeapon": code(
      "Staff and light-blade magic items used as weapons.",
      "powers.ts loadouts",
      test(
        POWERS,
        "treats magic staves as both implements and quarterstaff weapons",
      ),
    ),
    "?A0x7555d940.LootImplement": code(
      "Implement name for proficiency: staff, ki focus, ImplementType, _ImplementEquiv (base or enchantment), else 'instrument' for a bard _ImplementForClass item.",
      "item-fields.ts legacyLootImplement: powers.ts implement detection for non-weapon loot (BuildWeaponsList), implementKinds, the DetermineOffhand candidates and the row's implement channels; implementScopes for _ImplementForClass proficiency",
      test(POWERS, "treats an implement-equivalent weapon as that implement"),
      test(POWERS, "uses a pact blade only for its class's powers"),
      test(
        POWERS,
        "makes mundane implement gear implement rows, and a staff a Quarterstaff",
      ),
    ),
    "?A0x7555d940.ImplementName": code(
      "Implement name: Staff, 'Ki Focuses', ImplementType, _ImplementEquiv, bard 'instrument', else empty (LootImplement says 'Implement' for other _ImplementForClass items).",
      "item-fields.ts legacyLootImplement: BuildKeywordSet names its '<name> implement' channels from LootImplement, so 'ki focuses implement' and 'instrument implement' match",
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
      ),
      test(
        POWERS,
        "adds '<group> implement group' and 'instrument implement' channels",
      ),
    ),
    "?A0x7555d940.ImplementProficiency": code(
      "'Implement Proficiency (<kind>)' lookup.",
      "powers.ts IMPLEMENT_PROFICIENCY",
      test(
        POWERS,
        "lists every owned weapon and implement like legacy, marking proficiency",
      ),
    ),
    "D20Workspace.IsSpecialImplement": code(
      "An item whose (or whose enchantment's) _ImplementForClass names a record is a special implement for that class.",
      "powers.ts implementScopes; item-fields.ts legacyLootImplement (the base's field only, as the RulesElement overload). Deliberately different (D091): IMPLEMENT_CLASS_FIELDS reads _ImplementAsClass as an alias of _ImplementForClass (both honored). Native code never reads _ImplementAsClass, whose only official writer is ID_INTERNAL_INTERNAL_MELEE_WEAPONS_AS_WARLOCK_IMPLEMENTS (Avernian Knight's Melee Implement, ID_FMP_CLASS_FEATURE_2185: 'You can use any melee weapon as a warlock implement', list-adding ID_FMP_CLASS_7 to 74 melee weapons), so the feature did nothing in legacy",
      test(POWERS, "uses a pact blade only for its class's powers"),
      test(
        ITEM_FIELDS,
        "reads _ImplementAsClass as an alias of _ImplementForClass",
      ),
    ),
    "?A0x7555d940.ForClass": code(
      "_ImplementForClass on the base or enchantment matches an owned class by name or ID.",
      "powers.ts implementScopeMatcher; _ImplementAsClass is read as an alias (D091, see IsSpecialImplement)",
      test(POWERS, "uses a pact blade only for its class's powers"),
      test(POWERS, "reads _ImplementAsClass as an alias of _ImplementForClass"),
      test(
        EVALUATOR,
        "reads an _ImplementAsClass list-addition as _ImplementForClass (granted: %s)",
      ),
    ),
    "?A0x7555d940.ForPower": code(
      "_ImplementForPower on the base or enchantment, checked with CheckPower.",
      "powers.ts implementScopeMatcher",
      test(
        POWERS,
        "matches power-source and paragon-path scopes and universal implements",
      ),
    ),
    "?A0x7555d940.CheckPower": code(
      "_ImplementForPower list grammar: comma alternatives, 'PP <class>' paragon path powers, the power's Class, or a Power Source keyword.",
      "powers.ts implementScopeMatcher. Deliberately stricter: legacy CheckPower ends in an unconditional 'return true', so any non-empty _ImplementForPower matches every power; modern applies the scope",
      test(
        POWERS,
        "matches power-source and paragon-path scopes and universal implements",
      ),
      test(
        POWERS,
        "uses a weapon scoped to a power source as an implement for its powers",
      ),
    ),
    "?A0x7555d940.ImplementWeaponEquiv": code(
      "A staff implement used as a weapon is a Quarterstaff (ID_FMP_WEAPON_10).",
      "powers.ts Loadout proficiencyNames / requirementBase",
      test(
        POWERS,
        "treats magic staves as both implements and quarterstaff weapons",
      ),
    ),
    "?A0x7555d940.WeaponEquiv": code(
      "A superior implement or shield attacks as the weapon its WeaponEquiv names.",
      "powers.ts legacyWeaponEquiv",
      test(
        REQUIREMENTS,
        "names a weapon by ID or name, across sizes and double-weapon ends",
      ),
    ),
    WeaponEquiv: code(
      "WeaponEquiv lookup by name[:type].",
      "powers.ts legacyWeaponEquiv",
      test(
        REQUIREMENTS,
        "names a weapon by ID or name, across sizes and double-weapon ends",
      ),
    ),
    "?A0x7555d940.WeaponEnchant": partial(
      "The enchantment a weapon power reads: the base's EnchantEquiv record, else the enchantment (or the base when the enchantment has no Enhancement), else a staff or magic-item base itself.",
      "powers.ts uses the enchantment with Enhancement > 0; EnchantEquiv (10 items, e.g. Rod of Smiting, Boar Tusk Helm) is not read",
      test(POWERS, "applies an implement enhancement to fixed power dice"),
    ),
    "?A0x7555d940.EnhancementBonus": code(
      "Attack/damage enhancement from WeaponEnchant's Enhancement, else the base's.",
      "powers.ts parseEnhancement",
      test(POWERS, "applies an implement enhancement to fixed power dice"),
    ),
    "?A0x7555d940.OffhandEnhancementBonus": code(
      "The off-hand item's enhancement, for Dual Implement Spellcaster.",
      "powers.ts pairedImplement (2575583)",
      test(
        POWERS,
        "uses only the selected off-hand implement enhancement for dual implements",
      ),
    ),
    "?A0x7555d940.WeaponBase": code(
      "Weapon base for a power: Unarmed Attack (or the 'Unarmed Weapon' text override) for melee without a weapon; WeaponEquiv; staff as Quarterstaff.",
      "powers.ts legacyUnarmedWeaponBase ('Unarmed Weapon' text, else EXCEPTION_NAMES.unarmedAttack) and withUnarmedWeaponBase: a melee power's Unarmed row takes the record's keywords (name, ID, group, slot, properties; nativeRowKeywords' weapon type and '<group> group(weapon)'), proficiency bonus (Belt of the Brawler's Club +2) and Damage stepped by DieIncrease; the same base feeds requirements, strikers and CalcBonuses. Loadout.requirementBase for weapons",
      test(REQUIREMENTS, "attacks with a staff as the Quarterstaff record"),
      test(
        REQUIREMENTS,
        "rejects Unarmed for a requirement its record cannot meet",
      ),
      test(
        POWERS,
        "gives a melee power's Unarmed row the Unarmed attack record's keywords",
      ),
      test(
        POWERS,
        "uses the Unarmed Weapon text's record: its proficiency, die and group",
      ),
      test(POWERS, "steps the unarmed record's die with DieIncrease"),
    ),
    "?A0x7555d940.OffhandWeaponBase": code(
      "Off-hand base: a double weapon's _Secondary End, else WeaponBase.",
      "powers.ts nativeRowKeywords (the two-melee-weapon, two-blade channels). Requirements deliberately ignore it (D093): IsRestricted read it only for off-hand clauses, which no longer filter power rows",
      test(
        POWERS,
        "applies two-weapon channels only with a weapon in the off hand (native DetermineOffhand)",
      ),
    ),
    NormalizedName: code(
      "Weapon name for matching: a secondary end's _Primary End weapon, without a ' (large)' suffix.",
      "power-requirements.ts weapon naming",
      test(
        REQUIREMENTS,
        "names a weapon by ID or name, across sizes and double-weapon ends",
      ),
    ),
    NormalizedID: code(
      "Weapon ID for matching, through _Primary End and the non-large record.",
      "power-requirements.ts weapon naming",
      test(
        REQUIREMENTS,
        "names a weapon by ID or name, across sizes and double-weapon ends",
      ),
    ),
    "?A0x7555d940.AddWeaponKeywords": code(
      "Weapon keyword channels (military, Melee/Ranged Weapon, '<group> group', '<group> group(weapon)', name, ID, properties, thrown, Item Slot, off-hand -> one-hand); staff as Quarterstaff.",
      "powers.ts loadout tags (a staff without a weapon part takes the Quarterstaff's); nativeRowKeywords adds 'Melee Weapon'/'Ranged Weapon', '<group> group(weapon)' and the off-hand slot's 'one-hand'",
      test(
        POWERS,
        "tags a military weapon for military-qualified channels (AddWeaponKeywords)",
      ),
      test(
        POWERS,
        "gives a staff without a weapon part the Quarterstaff's weapon keywords (AddWeaponKeywords)",
      ),
      test(
        WEAPON_GROUPS,
        "matches each group's damage channel, including an overlaid group",
      ),
    ),
    "?A0x7555d940.AddArenaWeapons": notHandled(
      "With Arena Training, every 'Arena Weapon' property weapon's keywords join the power's keyword set.",
      "no modern Arena Training channel",
    ),
    "?A0x7555d940.ArenaTrainingImprovisedWeapon": code(
      "Arena Training (ID_FMP_CLASS_FEATURE_2893) lets non-proficient and improvised weapons use the improvised-weapon rules.",
      "powers.ts arenaImprovised: Unarmed without a base, a weapon, staff or unarmed base (the Unarmed attack record is Improvised) the character is not proficient with, or an Improvised one deals 1d8 (1d10 two-handed) with a +2 proficiency bonus",
      test(
        POWERS,
        "gives Arena Training improvised weapons 1d8 or 1d10 and +2 proficiency",
      ),
    ),
    "?A0x0bed2cbe.WieldingDefensive": code(
      "'defensive' selector: dual-wielding with a proficient defensive weapon (staff as Quarterstaff).",
      "equipment.ts wieldingDefensive: legacyIsDualWielding and an equipped base whose defensiveWeapon fact (evaluator.ts equippedItems: staff as the Quarterstaff, Defensive property, native IsProficient by owned Weapon Proficiency or the enchantment's Proficient As) is set. Feeds the Level 1 record's AC +1 Defensive",
      test(
        EVALUATOR,
        "reads DUAL-WIELDING and DEFENSIVE through native IsDualWielding (ItemSlot, double weapons, Ambidextrous)",
      ),
    ),
    "?A0x0bed2cbe.WieldingVersatile": code(
      "'versatile' selector: an equipped versatile weapon.",
      "equipment.ts",
      test(
        EQUIPMENT,
        "matches armor, weapon, slot, property, and versatile selectors",
      ),
    ),
    "?A0x0bed2cbe.DualWieldingConditional": code(
      "Dual-wielding selectors: plain, 'off-hand' (every equipped weapon off-hand), 'rapier-blade' (a rapier, ID_FMP_WEAPON_29 or the large rapier, with an off-hand light blade), else every equipped weapon in the listed groups.",
      "equipment.ts dualWieldingConditional (EXCEPTION_IDS.rapier/largeRapier); every equipped weapon's Group must be in the operand list (ListContainsOneOf), so 'heavy blade,light blade' also accepts two light blades. Feeds Two-Weapon Defense, Cutting Steps, Hafted Defense, Bladestorm Technique, Cross-Body Parry, Blade Dance",
      test(EQUIPMENT, "recognizes dual-wielding projections"),
      test(
        EVALUATOR,
        "reads DUAL-WIELDING and DEFENSIVE through native IsDualWielding (ItemSlot, double weapons, Ambidextrous)",
      ),
    ),
    HasLoot: code(
      "wearing/not-wearing selector dispatch (defensive, versatile, dual-wielding, dual-shield, slot, staff implement, only-weapon, _EquipmentEquiv).",
      "equipment.ts matchesEquipmentSelector / equipmentPredicate over evaluator.ts equippedItems: overlay-resolved fields, categories by ID and name (Two-Handed, each weapon group), the record name, IsStaff and WeaponEquiv; SLOT: compares each holding's CharLootSlot (item-fields.ts legacySlotMatches). _EquipmentEquiv has no record in the current pack",
      test(
        EVALUATOR,
        "reads weapon selectors through categories, names, staves and hand slots (native HasLoot)",
      ),
      test(
        EVALUATOR,
        "matches SLOT:off hand through each holding's CharLootSlot and keeps typed blade bonuses from stacking",
      ),
      test(
        ITEM_FIELDS,
        "matches SLOT:off hand for off-hand, both-hands and two-handed slots",
      ),
      test(
        EVALUATOR,
        "resolves weapon and armor fields through modify overlays, including BaseItem",
      ),
      test(
        EQUIPMENT,
        "matches armor, weapon, slot, property, and versatile selectors",
      ),
      test(EQUIPMENT, "recognizes the recovered singular dual-shield selector"),
      test(
        EVALUATOR,
        "exposes weapon groups and magic implement types to equipment rules",
      ),
    ),
    "?A0x0bed2cbe.CheckOnlyWeapon": code(
      "'only-weapon' selectors and dual wielding with a double weapon: at most one equipped hand item.",
      "equipment.ts onlyOneHandItem: at most one equipped holding whose base fills Two-hands/One-hand/Off-hand (a shield or off-hand implement breaks 'only weapon'); its double-weapon use is listed under IsDualWielding",
      test(
        EQUIPMENT,
        "treats any staff as a staff and counts hand slots for only-weapon",
      ),
      test(
        EVALUATOR,
        "reads weapon selectors through categories, names, staves and hand slots (native HasLoot)",
      ),
    ),
    "?A0x0bed2cbe.LootCheck": code(
      "Selector matching by category or weapon name, including 'Large <weapon>' variants.",
      "equipment.ts matchTerms over the record's categories by ID and name, its name (without 'Large '), split Group list and Hands Required; 'staff' matches any IsStaff record",
      test(
        EVALUATOR,
        "reads weapon selectors through categories, names, staves and hand slots (native HasLoot)",
      ),
      test(
        EQUIPMENT,
        "matches armor, weapon, slot, property, and versatile selectors",
      ),
    ),
    "D20Workspace.IsDualWielding": code(
      "Dual wielding: an off-hand weapon (staff as Quarterstaff) plus a main-hand weapon, or a double weapon alone.",
      "equipment.ts legacyIsDualWielding: non-armor bases whose native ItemSlot (evaluator.ts itemSlot via legacyItemSlot, so Ambidextrous counts) is off-hand plus one-hand or a second off-hand (DWSlotEquipped), or a lone double weapon (doubleWeapon, staff as Quarterstaff) with CheckOnlyWeapon",
      test(EQUIPMENT, "recognizes dual-wielding projections"),
      test(
        EVALUATOR,
        "reads DUAL-WIELDING and DEFENSIVE through native IsDualWielding (ItemSlot, double weapons, Ambidextrous)",
      ),
    ),
    "D20Workspace.IsDoubleWeapon": code(
      "Double weapon: two-handed with off-hand property or a _Secondary End.",
      "powers.ts legacyIsDoubleWeapon",
      test(
        REQUIREMENTS,
        "names a weapon by ID or name, across sizes and double-weapon ends",
      ),
    ),
    "D20Workspace.IsDualWeapon": notHandled(
      "A weapon is usable melee and ranged; a staff whose default power is Magic Missile counts as dual.",
      "no modern default-power model for staffs",
    ),
    IsDagger: code(
      "Dagger by name.",
      "equipment selectors; power-requirements.ts dagger clause (EXCEPTION_NAMES.dagger)",
      test(
        REQUIREMENTS,
        "reads the named two-handed, reach and thrown branches",
      ),
    ),
    IsMonkWeapon: code(
      "Monk weapons: club, dagger, spear, Monk Unarmed Strike by name, or a staff.",
      "power-requirements.ts isLegacyMonkWeapon (EXCEPTION_NAMES)",
      test(REQUIREMENTS, "treats Unarmed as a monk weapon"),
    ),
    IsTwoHandedWeapon: code(
      "Two-handed by Hands Required, or the stout property.",
      "power-requirements.ts two-handed clause",
      test(
        REQUIREMENTS,
        "reads the named two-handed, reach and thrown branches",
      ),
    ),
    IsUsedTwoHanded: code(
      "Two-handed use: versatile used in two hands, Hands Required, or stout.",
      "power-requirements.ts / powers.ts versatileUsedTwoHanded (per holding: the loadout's twoHandedEntryIds, D101)",
      test(
        REQUIREMENTS,
        "uses a versatile weapon two-handed for a Small character",
      ),
    ),
    VersatileUsedTwoHanded: code(
      "Versatile weapon damage +1 when _INTERNAL_VersatileUsedTwoHanded is set, except for a Small character with a non-small weapon.",
      "powers.ts versatile damage, per holding from loadout-slots.ts legacyLoadoutState (a versatile weapon in both hands; BuildInventoryEntry.wieldedTwoHanded, D101)",
      test(
        POWERS,
        "adds versatile damage only when the legacy two-handed choice is set",
      ),
      test(
        POWERS,
        "adds versatile damage for the holding the loadout wields two-handed (D101)",
      ),
      test(
        POWERS,
        "withholds the versatile +1 from a Small character's non-small weapon",
      ),
    ),
    VersatileUsedInTwoHands: code(
      "A versatile weapon is in two hands when the text string is set or a Small character wields a non-small weapon.",
      "powers.ts legacyRequirementContext versatileUsedTwoHanded",
      test(
        REQUIREMENTS,
        "uses a versatile weapon two-handed for a Small character",
      ),
    ),
    IsLargeWeapon: code("Size 'Large' weapon.", "equipment-ui inventory names"),
    CanUseLargeWeapons: partial(
      "Oversized / One Size Larger / Small character text strings change which weapon sizes fit.",
      "item-fields.ts legacyItemSlot for SLOT: selectors and the loadout hands (loadout-slots.ts, D102); an equipped Large weapon without it is a house-rule character issue (unwieldableWeaponIssues); powers.ts proficientWithWeapon denies a Large weapon's proficiency without it (IsProficient)",
      test(ITEM_FIELDS, "adjusts the Item Slot for size and Ambidextrous"),
      test(
        LOADOUT_SLOTS,
        "names weapons the character can't wield, and still places them as authored",
      ),
      test(
        POWERS,
        "gives a Large weapon its proficiency only with Oversized or One Size Larger",
      ),
    ),
    "?A0x0bed2cbe.SmallWithNonSmallWeapon": code(
      "Small characters wield non-small weapons two-handed unless One Size Larger.",
      "item-fields.ts legacySmallWithNonSmallWeapon, shared by power-requirements.ts versatile two-handed use and powers.ts versatile damage, which withholds the +1 (VersatileUsedTwoHanded; EXCEPTION_NAMES.smallSize/oneSizeLarger); the loadout holds the weapon in both hands and the Wield two-handed menu item is checked and inert (loadout-slots.ts inventoryForcedTwoHanded, D102)",
      test(
        REQUIREMENTS,
        "uses a versatile weapon two-handed for a Small character",
      ),
      test(
        LOADOUT_SLOTS,
        "holds a non-small versatile weapon in both hands for a Small character",
      ),
      test(
        POWERS,
        "withholds the versatile +1 from a Small character's non-small weapon",
      ),
    ),
    "?A0x0bed2cbe.ItemSlot": code(
      "Slot of a held item: staff as off-hand, versatile two-hands for Small characters, large weapons only with CanUseLargeWeapons, One Size Larger, Ambidextrous one-hand -> off-hand.",
      "item-fields.ts legacyItemSlot for SLOT: selectors; the loadout applies its size rules to the hands a weapon fills (loadout-slots.ts, from EvaluatedCharacter.loadoutSlotContext, D102); staff-as-off-hand and Ambidextrous only rename the slot for SLOT: matching, so placement ignores them; a weapon with no slot (unwieldable) is placed as authored and raised as a house-rule character issue",
      test(EQUIPMENT_UI, "limits explicit loadout choices to authored slots"),
      test(ITEM_FIELDS, "adjusts the Item Slot for size and Ambidextrous"),
      test(
        LOADOUT_SLOTS,
        "holds a two-handed weapon in one hand with One Size Larger",
      ),
    ),
    "?A0x0bed2cbe.CharLootSlot": code(
      "A holding's slot for HasLoot SLOT: — Two-hands (double weapon, versatile used two-handed), the _AlternateSlot when the loot is worn there, 'Main hand, off hand' for two equipped, Main hand (one-hand, or the _INTERNAL_MainHandWeapon item), Off hand, else ItemSlot.",
      "item-fields.ts legacyLootSlots; the main hand, alternate slot and two-handed use come from the resolved loadout (loadout-slots.ts legacyLoadoutState, D101), imported legacy encodings placing holdings without exact slots",
      test(ITEM_FIELDS, "names each equipped holding's hand slot"),
      test(
        LOADOUT_SLOTS,
        "derives the main hand, alternate slot and two-handed use from the loadout",
      ),
      test(
        EVALUATOR,
        "matches SLOT:off hand through each holding's CharLootSlot and keeps typed blade bonuses from stacking",
      ),
    ),
    "D20Workspace.CharLootItemSlot": code(
      "Item slots offered for equipping: ItemSlot plus the item's _AlternateSlot.",
      "loadout-slots.ts inventorySlotCandidates adds inventoryAlternateSlot (Spiked gauntlet, Wrist Razors, Dantrag's Bracers); never the double-click default (D101)",
      test(EQUIPMENT_UI, "limits explicit loadout choices to authored slots"),
      test(
        LOADOUT_SLOTS,
        "offers an item's _AlternateSlot beside its Item Slot",
      ),
    ),
    "?A0x0bed2cbe.SlotManip": partial(
      "Ring Slots stat, Additional Slot and _AlternateSlot handling when equipping.",
      "equipment-ui loadout; the 'Ring Slots' stat (Level 1 rules and two items, e.g. Many-Fingered Gloves) and Additional Slot are not read",
      test(
        EQUIPMENT_UI,
        "shows legacy equipped counts in deterministic modern slots",
      ),
    ),
    "?A0x0bed2cbe.ValidateEquip": code(
      "Two off-hand/ring items allowed; an item whose ItemSlot is empty (a weapon too big for the character) cannot be equipped.",
      "equipment-ui loadout; an unwieldable weapon may still be placed and is raised as a house-rule character issue (builder-diagnostics.ts unwieldableWeaponIssues, D102)",
      test(
        EQUIPMENT_UI,
        "shows legacy equipped counts in deterministic modern slots",
      ),
    ),
    "EquipDescription.Equip": code(
      "Equipping a hand slot sets _INTERNAL_VersatileUsedTwoHanded for the two-hand versatile choice and places an item in its _AlternateSlot.",
      "per holding: set-inventory-wielding (right-click Wield two-handed) and loadout placement in the alternate slot; legacy-dnd4e withLegacyLoadoutState writes the text strings and _AlternateSlot back (D101)",
      test(
        POWERS,
        "adds versatile damage only when the legacy two-handed choice is set",
      ),
      test(
        LOADOUT_SLOTS,
        "places imported holdings where native CharLootSlot puts them",
      ),
    ),
    ShouldExecute: code(
      "An owned but unequipped item's rules execute when its base has an empty Item Slot or a non-empty _AlwaysExecute.",
      "rules-engine evaluator.ts lootExecutes (9b8e67d)",
      test(
        EVALUATOR,
        "runs an unequipped slotted item that sets _AlwaysExecute",
      ),
    ),
    "?A0x0bed2cbe.ShouldExecuteEnchant": code(
      "An executing holding runs its enchantment unless an equipped Arms-slot base occupies the slot and the enchantment is an Arms item.",
      "evaluator.ts executedLoot",
      test(
        EVALUATOR,
        "skips an Arms enchantment while an equipped base fills the Arms slot",
      ),
    ),
    EquipLoot: code(
      "Runs every executing holding's base and enchantment once, flags house-ruled and requirement-failing items, applies Essentials magic armor, then item sets.",
      "evaluator.ts executedLoot / item.requirement-unmet / evaluateItemSets",
      test(
        EVALUATOR,
        "runs an unequipped slotted item that sets _AlwaysExecute",
      ),
      test(
        EVALUATOR,
        "accepts the item once the Internal record is owned, or unequipped",
      ),
    ),
    "?A0x0bed2cbe.EssentialsMagicArmor": code(
      "Non-masterwork armor with an enchantment gets the Essentials magic armor bonus by Armor Type and enhancement.",
      "evaluator.ts essentialsMagicArmorBonuses",
      test(
        EVALUATOR,
        "applies native magic-armor base adjustments but preserves masterwork armor",
      ),
    ),
    "?A0x0bed2cbe.Sets": code(
      "Item sets: each set count stat unlocks the Benefits whose Piece Count it reaches.",
      "rules-engine item-sets.ts evaluateItemSets",
      test(
        ITEM_SETS,
        "unlocks the benefits the equipped pieces reach and applies them",
      ),
    ),
    isGroupSet: code(
      "A set whose Tier is 'Group' counts party pieces.",
      "item-sets.ts",
      test(
        ITEM_SETS,
        "counts a group set's party pieces only while the character wields one",
      ),
    ),
    "ItemSetBenefit.PiecesRequired": code(
      "Benefit Piece Count.",
      "item-sets.ts",
      test(
        ITEM_SETS,
        "unlocks the benefits the equipped pieces reach and applies them",
      ),
    ),
    "D20Workspace.LootWeight": code(
      "Barding and mount/companion/familiar slot items do not count toward carried weight.",
      "sheet-model encumbrance.ts",
      test(
        ENCUMBRANCE,
        "uses base gear, signed quantities, decimal overrides and native weight exclusions",
      ),
    ),
    "D20Workspace.TallyLoot": code(
      "Carried weight: unslotted items unequip; Transportation gear does not count.",
      "sheet-model encumbrance.ts",
      test(
        ENCUMBRANCE,
        "uses base gear, signed quantities, decimal overrides and native weight exclusions",
      ),
    ),
    "D20Workspace.IsProficient": partial(
      "Weapon/armor/shield proficiency: 'Weapon Proficiency (<name>)' (large weapons only with CanUseLargeWeapons), the enchantment's Proficient As and Additional Proficiencies, 'Shield Proficiency (<x>)' and 'Armor Proficiency (<category>)'.",
      "powers.ts proficiencyNames (Proficient As; a Large weapon by legacyNormalizedWeaponName) and proficientWithWeapon (a Large weapon only with legacyCanUseLargeWeapons); Additional Proficiencies (no record in the current pack) is not read",
      test(
        POWERS,
        "adds a weapon's proficiency bonus only with its weapon proficiency",
      ),
      test(
        POWERS,
        "gives a Large weapon its proficiency only with Oversized or One Size Larger",
      ),
    ),
    "?A0x7555d940.GetProficiencyBonus": code(
      "Proficiency Bonus when proficient (Arena Training improvised +2 aside).",
      "powers.ts proficientWithWeapon, reading the overlay-resolved Proficiency Bonus (Deadeye Slinger's sling); Arena Training improvised weapons +2",
      test(
        POWERS,
        "reads modified weapon properties, proficiency, damage and range",
      ),
      test(
        POWERS,
        "adds a weapon's proficiency bonus only with its weapon proficiency",
      ),
    ),
    "D20Workspace.CharLootAllowDamage": code(
      "A loot's damage may be customized when its base has a Damage field (or is custom).",
      "powers.ts reads a saved Damage override",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
    ),
    "D20Workspace.CharLootDamage": code(
      "A loot's damage: its saved override, else the base's Damage.",
      "powers.ts loadouts weaponDamage (entry.overrides.Damage)",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
    ),
    "D20Workspace.SetCharLootDamage": code(
      "Stores a loot damage override.",
      "character-domain inventory overrides.Damage, read by powers.ts weaponDamage",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
    ),
    "?A0x03aa98b1.ProcessModify": code(
      "modify rules targeting 'this'/'BaseItem'; 'large ' name prefixes; a modify with neither name nor select targets the provider's most recent child. A 'this' modify runs here only with conditions (requires/wearing/not-wearing; ParseOneRule applied the others at load) and modifies the providing record. CalcModifiedValue applies a list-addition (skipped when ListContains), else a die-increase, else the value.",
      "evaluator.ts overlay: 'BaseItem' is the executing enchantment's holding base; a conditional 'this' targets the provider's own definition (Unforgettable Cudgel and 48 other implements' _PowerstatKeywords for a Divine/Arcane/Primal character, read by powers.ts nativeRowKeywords; Beast Mastery's _CS_ShortDescription), an unconditional one nothing (legacy-wotc applied it at import). item-fields.ts modifiedFieldValue keeps the native one-of precedence, and overlayTargets also modifies a weapon's 'Large <name>' record and steps dice with the native IncreaseDamageDie table. A modify with neither name nor select (precedingChildTarget) walks the provider's child list (me[13]) up to the rule cursor: one child per grant and replace, number per select, in rule order regardless of level or conditions, so it targets the preceding grant's record or what the preceding replace or select's last slot chose, and nothing before any child or for an empty slot",
      test(
        EVALUATOR,
        "resolves weapon and armor fields through modify overlays, including BaseItem",
      ),
      test(
        ITEM_FIELDS,
        "targets records by name, ID, type and Large size, never by context name",
      ),
      test(ITEM_FIELDS, "steps dice through the native one-handed table"),
      test(
        EVALUATOR,
        "modifies the providing record for a conditional this-modify only",
      ),
      test(
        ITEM_FIELDS,
        "applies only the list-addition, else die-increase, else value of one modify",
      ),
      test(EVALUATOR, "targets only the record the preceding grant made"),
      test(EVALUATOR, "does nothing before the provider has made a child"),
      test(EVALUATOR, "targets the most recent of several children"),
      test(
        EVALUATOR,
        "targets a preceding select's last chosen slot, or nothing",
      ),
      fixture(
        "CharacterBuilder/SampleChars/SampleHeroes/GeranHulmaster.dnd4e",
        "Gauntlets of Brilliance (heroic tier) grants Light, then a nameless modify Power Usage At-Will: only Light is at-will (usage 21/21)",
      ),
      fixture(
        "CharacterBuilder/SampleChars/SampleHeroes/Omin_Dran.dnd4e",
        "Student of Battle grants Inspiring Word, then nameless Power Usage Daily and Special modifies: only Inspiring Word changes (usage 13/13)",
      ),
    ),

    // --- D20RulesEngine: power math -------------------------------------
    "?A0x7555d940.SpecialCase": partial(
      "Fixed outputs: Bond of Censure dice by name, and exact hit lines (ongoing 10 family, Strength-only damage, damage-taken, rage strike, 3d10 + Constitution + half level, a 4[W] rewrite, 15 force).",
      "powers.ts nativeSpecialDamage ports Bond of Censure, the ongoing 10 lines and rage strike; the Strength-only, damage-taken, 3d10 + half level, 4[W] and 15 force lines are only flagged unsupported (unresolvedNativeSpecialCase)",
      test(
        POWERS,
        "projects recovered fixed-output native power special cases",
      ),
    ),
    EffectPower: declarative(
      "Storm Pillar has no Hit line; legacy substitutes a damage line by name.",
      "content/corrections 90-4ecb-corrections.part `_CalculatedHit`",
      test(
        POWERS,
        "calculates a correction-supplied hit line for a prose-only damage power",
      ),
    ),
    "?A0x7555d940.NonDamagePower": notHandled(
      "Four powers (two by name prefix, ID_FMP_POWER_7157, ID_FMP_POWER_11126) never get a damage line.",
      "modern parses their Hit prose; a correction could mark them non-damaging once a field exists",
    ),
    "D20Workspace.IsValidPowerCombo": code(
      "Coordinated Assault Attack (ID_FMP_POWER_11615) gets no weapon variants; otherwise implement/weapon/range checks, and IsRestricted for weapon powers and (AllowUnarmed) Unarmed.",
      "powers.ts candidates; EXCEPTION_IDS.coordinatedAssaultAttack",
      test(
        REQUIREMENTS,
        "gives Coordinated Assault Attack no variants (IsValidPowerCombo)",
      ),
      test(
        POWERS,
        "takes the implement path for a power that is both Weapon and Implement",
      ),
    ),
    IsRestricted: code(
      "Power Requirement 'You must be wielding ...' grammar (bow or crossbow, two shields, thrown and melee, reach, blowgun, dagger, spiked chain, ...) limits weapon variants; other clauses match a weapon Group or thrown property, or a WeaponSwap text.",
      "rules-engine power-requirements.ts isPowerRestricted; one-off wordings restated as `_WeaponRequirement` in content/corrections/94-power-requirements.part, whose extended selectors (named weapons, pairs, free hand) also cover the wordings legacy rejects (08-hard-coded-exceptions.md). Deliberately different (D093): clauses about the loadout (two melee weapons, two shields, a thrown and a melee weapon, a pair's other hand, a free hand) never remove a row",
      test(REQUIREMENTS, "cuts clauses as the native loop does"),
      test(
        REQUIREMENTS,
        "reads the named two-handed, reach and thrown branches",
      ),
      test(
        REQUIREMENTS,
        "never rejects a row for a second weapon or shield (D093)",
      ),
    ),
    "?A0x7555d940.WeaponSwap": code(
      "IsRestricted fallback: the '<class>-<needed>' stat text or a '<feat> association-<needed>' text names the weapon or its group.",
      "power-requirements.ts weapon swap text",
      test(
        REQUIREMENTS,
        "accepts a weapon swap text naming the weapon or its group",
      ),
    ),
    "?A0x7555d940.WeaponSwapCheck": code(
      "A swap text allows the weapon by name or '<group> group'.",
      "power-requirements.ts",
      test(
        REQUIREMENTS,
        "accepts a weapon swap text naming the weapon or its group",
      ),
    ),
    "?A0x7555d940.WeaponSwapAssociation": code(
      "'<feat> association-<needed>' swap texts.",
      "power-requirements.ts weapon swap text",
      test(
        REQUIREMENTS,
        "accepts a weapon swap text naming the weapon or its group",
      ),
    ),
    "?A0x7555d940.OtherRestrictions": code(
      "Requirement 'You must be using a shield.' needs a shield.",
      "Deliberately different (D093): power-requirements.ts isPowerRestricted never rejects a row for it; the card still prints the Requirement",
      test(
        REQUIREMENTS,
        "never rejects a row for the shield requirement or other wording",
      ),
    ),
    "?A0x7555d940.IsMeleePower": code(
      "Melee power, close weapon power, or the thrown-melee Requirement.",
      "powers.ts legacyPowerRange (THROWN_MELEE_REQUIREMENT), or a `thrown melee` `_WeaponRequirement` selector (power-requirements.ts weaponRequirementThrowsMelee)",
      test(REQUIREMENTS, "marks `thrown melee` as a thrown melee power"),
    ),
    "?A0x7555d940.IsRangedPower": code(
      "Ranged power (close, area burst, ranged unless thrown-melee, Stab and Shoot by name).",
      "powers.ts legacyPowerRange (EXCEPTION_NAMES.stabAndShoot)",
      test(REQUIREMENTS, "marks `thrown melee` as a thrown melee power"),
    ),
    FigureWeaponType: code(
      "A weapon is melee or ranged by Weapon Category; a melee weapon with a Range is also ranged.",
      "powers.ts weaponFitsPowerRange; legacyWeaponType for the Melee/Ranged Weapon and two-melee-weapon channels",
      test(
        POWERS,
        "uses Strength for ranged attacks with Heavy Thrown weapons",
      ),
    ),
    "?A0x7555d940.IsWeaponPower": code(
      "Weapon power by the Weapon keyword (substring).",
      "powers.ts weaponPower (exact keyword)",
      test(
        POWERS,
        "takes the implement path for a power that is both Weapon and Implement",
      ),
    ),
    "?A0x7555d940.IsImplementPower": code(
      "Implement power by the Implement keyword (substring).",
      "powers.ts implementPower (exact keyword)",
      test(
        POWERS,
        "takes the implement path for a power that is both Weapon and Implement",
      ),
    ),
    "?A0x7555d940.IsClose": code(
      "Close burst/blast detection.",
      "powers.ts legacyPowerRange",
      test(REQUIREMENTS, "marks `thrown melee` as a thrown melee power"),
    ),
    "?A0x7555d940.WhichAttack": code(
      "Melee-or-ranged attack line selection by weapon, and the best of 'A, B, or C' abilities.",
      "powers.ts dualAttackAlternatives (first ') or ', else ' with a melee weapon or two '; a ranged weapon takes the second) / attackLineAbility. D091: only lines naming a melee and a ranged alternative split, so Reactive Shot's 'Strength (thrown weapon) or Dexterity' keeps the better of the two for attack and damage (native: Dexterity attack with a ranged weapon but Strength damage, via MultipleAbilityChoices)",
      test(POWERS, "selects the current level line and highest listed ability"),
      test(
        POWERS,
        "splits 'with a melee weapon or two' attacks by the wielded weapon (native WhichAttack)",
      ),
    ),
    "D20Workspace.IsDualPower": code(
      "Dual-attack power detection from ') or ' / 'with a melee weapon or two'.",
      "powers.ts dualAttackAlternatives (see WhichAttack for the D091 Reactive Shot exception)",
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
      ),
    ),
    "?A0x7555d940.DetermineOffhand": code(
      "Off-hand pairing: the same item when two are equipped, else the first other equipped weapon or non-ki-focus implement, else a double weapon's other end.",
      "powers.ts legacyOffhand (2575583); requirements no longer read the off hand (D093)",
      test(
        POWERS,
        "pairs dual implements by legacy DetermineOffhand without a hand selection",
      ),
    ),
    "?A0x7555d940.DeterminePower": code(
      "Basic attack powers by _BasicAttack or the Melee/Ranged Basic Attack names.",
      "powers.ts basicAttackKind",
      test(
        POWERS,
        "uses the effective BA flag for eligibility and native basic-specific combat channels",
      ),
    ),
    IsBasicAttack: code(
      "Basic attack by name or _BasicAttack.",
      "powers.ts basicAttackKind",
      test(
        POWERS,
        "preserves direct ranged BA flags and honors an effective cleared flag",
      ),
    ),
    "?A0x7555d940.OverrideStat": code(
      "Attack ability overrides, in order: '<martial,melee>', 'melee basic', 'melee basic,melee weapon', 'ranged basic', 'ranged basic,bow group', 'ranged basic,thrown' (proficient), '<power ID>' and '<feat> association' ':key ability' text strings, the _Associated Feats association, the granting element's and the power's 'Key Ability' field, 'dilettante:' and 'multiclass:key ability', the '<power> <ability>' choice element (Damage Stat), and Strength for a Heavy Thrown ranged basic attack; _KeyAbilityAs redirects the lookup to another power.",
      "key-ability-overrides.ts keyAbilityOverride runs the steps in native order before powers.ts's choice element and heavy-thrown rule, then rangedBasicFallbackOverride; '<power name>:key ability' is also read (official Otherworldly Pulse/Call of Letherna choices key by name; native reads only the id, and their unforced values never beat the line's highest ability). Jim_Darkmagic probes now match legacy: Intelligent Blademaster MBA with Staff of Light Intelligence +9, 1d8+6; Dragon Breath with Powerful Breath Strength attacks and damages with Strength",
      test(
        KEY_ABILITY,
        "reads melee-basic text strings, gated by a melee weapon, and moves damage with the attack",
      ),
      test(
        KEY_ABILITY,
        "reads the power's and the granting element's Key Ability fields, attack only without DMG:",
      ),
      test(
        KEY_ABILITY,
        "tries martial melee first, before a power-id override",
      ),
      test(KEY_ABILITY, "wins over the `<power> <ability>` choice element"),
    ),
    "?A0x7555d940.OverrideStatList": code(
      "Key-ability override value grammar: 'DMG:' (also the damage ability), 'HALF-DMG:' (half the ability modifier to damage), a trailing '*' (only when proficient with the weapon) and '!' (forced even when lower); otherwise the highest listed ability wins.",
      "key-ability-overrides.ts overrideFromList, including native's quirk that DMG:/HALF-DMG: set the damage flags whenever the list is read; statalias names (int, dex) resolve through canonicalAbility. Jim_Darkmagic with Melee Training (Intelligence) now deals 1d8+3 with Staff of Light (half Intelligence, +2)",
      test(
        KEY_ABILITY,
        "needs a proficient weapon for a starred ability and halves HALF-DMG damage",
      ),
      test(
        KEY_ABILITY,
        "halves the damage of Melee Training's own overlaid attack line",
      ),
      test(
        KEY_ABILITY,
        "keeps the line's ability when a listed one is not higher",
      ),
      test(KEY_ABILITY, "names abilities by full name or statalias"),
    ),
    "?A0x7555d940.OverrideStatPower": code(
      "_KeyAbilityAs: a power takes its key-ability overrides from the power it names.",
      "powers.ts keyPower (by id, else power name) feeds every keyAbilityOverride step except _Associated Feats, which native reads from the evaluated power",
      test(
        KEY_ABILITY,
        "forces a `!` ability keyed by power id, including through _KeyAbilityAs",
      ),
    ),
    "?A0x7555d940.OverrideByAssociation": code(
      "'<feat> association:key ability' text strings for each feat in the power's _Associated Feats.",
      "key-ability-overrides.ts associationOverride: the first listed feat with a value wins; damage follows (11 association feats, e.g. Black Hood Slayer, Harrowing Swarm Scout)",
      test(
        KEY_ABILITY,
        "reads `<feat> association` text strings for the power's _Associated Feats",
      ),
    ),
    "?A0x7555d940.AttackSpecialCase": code(
      "Attack stat 'Highest Mental Ability' (exact) becomes HighestMentalAbility (Kelemvor's Judgment).",
      "powers.ts specialAttackAbility",
      test(
        POWERS,
        "resolves 'Highest mental ability' to Intelligence, Wisdom or Charisma, earlier ties first",
      ),
    ),
    "?A0x7555d940.HighestMentalAbility": code(
      "Highest of Intelligence, Wisdom and Charisma by score (ties keep the first).",
      "powers.ts highestScoreAbility(stats, MENTAL_ABILITIES)",
      test(
        POWERS,
        "resolves 'Highest mental ability' to Intelligence, Wisdom or Charisma, earlier ties first",
      ),
    ),
    "?A0x7555d940.HighestAbility": code(
      "Highest of the six ability scores (Strength first; ties keep the first), for 'your highest ability' attack stats and 'highest'/'ability' damage terms.",
      "powers.ts highestScoreAbility: 'your highest ability' attack lines (36) and '+ [your] highest ability [score] modifier' damage terms (39 Hit lines). D091: bare 'Highest ability ...' attack lines (native parses the non-ability 'ability') resolve the same way",
      test(
        POWERS,
        "uses the highest ability score for 'your highest ability' attack and damage (native HighestAbility)",
      ),
    ),
    ChosenAbility: code(
      "Attack/damage stat 'Chosen Ability' reads the 'Chosen Ability' text string (Abiding Reaper's choice: Reaping Disruption, Reaper's Repast).",
      "powers.ts chosenAbility / specialAttackAbility; without the text string the attack stat is Unknown and the damage term adds 0",
      test(
        POWERS,
        "reads 'Chosen ability' from the Chosen Ability text string",
      ),
    ),
    AbilityTranslation: code(
      "Ability names 'Chosen Ability'/'chosen' translate to the chosen ability.",
      "powers.ts: the 'chosen ability modifier' damage term and 'Chosen ability' attack stat read chosenAbility",
      test(
        POWERS,
        "reads 'Chosen ability' from the Chosen Ability text string",
      ),
    ),
    "?A0x7555d940.ParseDamage": code(
      "A power's `_DamageDie` field (set by `modify`: Empowered Dragon Breath d10, Greathorn's Goring Charge d8) replaces the first 'dN' of the dice expression, after the level's damage line is chosen.",
      "powers.ts withDamageDie (fixed dice only; a [W] expression has no 'dN' there)",
      test(
        POWERS,
        "replaces the dice size with a modified _DamageDie after the level's damage line (native ParseDamage)",
      ),
    ),
    "?A0x7555d940.CalcStatVsDefense": partial(
      "Attack stat parsing: beast's attack bonus, power-bonus suffixes, 'your highest ability', 'Primary ability', 'Chosen Ability', the '+1 per enemy adjacent to you' condition, then OverrideStat.",
      "powers.ts attackLineAbility / specialAttackAbility / powerBonusAtLevel ('+N' after 'ability [score] [modifier]' too); 'Primary ability' uses the class key abilities where native takes HighestAbility (owner decision pending), and the per-adjacent-enemy condition is not modeled; OverrideStat is key-ability-overrides.ts",
      test(
        POWERS,
        "chooses the best attack ability and retains explicit power bonuses",
      ),
      test(POWERS, "keeps the power bonus of %j at level %i"),
      test(
        POWERS,
        "resolves a primary-ability attack from the class's key abilities",
      ),
      test(
        BEAST,
        "uses the beast's attack bonus, [B] die and ability modifiers",
      ),
    ),
    "?A0x7555d940.CalcBAB": code(
      "Attack components: ability, half level, proficiency, enhancement; beast attack bonus.",
      "powers.ts combatStatEntries",
      test(
        POWERS,
        "adds a weapon's proficiency bonus only with its weapon proficiency",
      ),
      test(
        BEAST,
        "uses the beast's attack bonus, [B] die and ability modifiers",
      ),
    ),
    "?A0x7555d940.AttackLine": code(
      "Attack line fields in order: Attack, Primary Attack, tabbed Attack, Secondary Attack, Attack (Fortitude/Reflex/Will).",
      "powers.ts authoredAttacks",
      test(POWERS, "calculates each authored attack independently"),
    ),
    "?A0x7555d940.HitLine": code(
      "Hit line fields: Hit, tabbed Hit, Hit (Any).",
      "powers.ts authoredAttacks / effectiveField Hit",
      test(POWERS, "handles primary attacks and prose level scaling"),
    ),
    "?A0x7555d940.AttackPowerModRepl": code(
      "Exact 'Increase to +N at 11th/21st level' attack lines, and Blood Drain / Razor Storm / Dragon Breath / Dragon's Wrath by name, replace the power bonus by level.",
      "powers.ts powerBonusAtLevel: NATIVE_INCREASE_LINES and NATIVE_NAMED_INCREASES (EXCEPTION_NAMES), then the generic 'Level N:' lines",
      test(
        POWERS,
        "raises Dragon Breath's bonus by name and its damage by its increase sentence at level %i (native AttackPowerModRepl/ParseIncreaseLine)",
      ),
    ),
    "?A0x7555d940.ExtractPowerMods": code(
      "One exact attack-line suffix adds a Wisdom power bonus (Hawk's Talon).",
      "powers.ts extractedPowerBonus, read from the whole Attack field before the melee/ranged choice; the sentence is dropped before the ability parse",
      test(
        POWERS,
        "adds Hawk's Talon's Wisdom power bonus to either alternative (native ExtractPowerMods)",
      ),
    ),
    "?A0x7555d940.ParseIncreaseLine": code(
      "From the hit's first 'Increase damage to ' (else 'Increase to '), each clause from its first digit to ' at N' is the damage at level N, stepping on at the next ' level'; four exact lines (Kelemvor's Judgment, the breath lines) are rewritten first.",
      "powers.ts increasedDamageAtLevel / NATIVE_INCREASE_REWRITES; D091: a leading '+N bonus and' is skipped (Sun Flare, Improved Razor Storm), native reads it as damage",
      test(
        POWERS,
        "reads every threshold of a native-rewritten increase sentence at level %i",
      ),
      test(
        POWERS,
        "parses 'Increase to' damage sentences anywhere in the hit at level %i",
      ),
    ),
    "?A0x7555d940.HigherLevelDamage": partial(
      "Higher-level damage lines; Chilling Cloud by name at 21; one exact Constitution line; a riposte damage line trimmed.",
      "powers.ts lineAtLevel: 'Level N:' lines (native LevelIncrease) before the increase sentence (increasedDamageAtLevel); Chilling Cloud by name (EXCEPTION_NAMES.chillingCloud) deals twice its Intelligence modifier from 21st level (calculateDamage); the exact Constitution and riposte lines match no current record, and the separate 'Level 21'/'Level 11' fields are not read (no current damage record uses them)",
      test(
        POWERS,
        "keeps each attack's ability, hit dice, damage type, and bonus independent at level %i",
      ),
      test(
        POWERS,
        "doubles Chilling Cloud's Intelligence damage from 21st level by name and reads 'twice' terms",
      ),
    ),
    FindLine: code(
      "Theme power level lines ('Level N' specifics) and 'As above, but ' stripping.",
      "powers.ts lineAtLevel",
      test(POWERS, "handles primary attacks and prose level scaling"),
    ),
    "?A0x7555d940.CalcDamage": partial(
      "Damage parsing: twice/your/beast's ability, off-hand weapon, damage types; Defender's Gambit by name reads its tabbed hit field; NonDamagePower; DualImplementSpellcaster.",
      "powers.ts calculateDamage ('twice [your] X modifier' doubles the term; '[your] highest ability [score] modifier' is HighestAbility, 'chosen ability modifier' the chosen ability); Defender's Gambit is not special-cased, '(off-hand weapon)' ability terms use the row's own weapon, and a bare 'ability modifier' term follows the attack stat where native takes HighestAbility",
      test(POWERS, "adds every explicitly additive ability modifier to damage"),
      test(
        POWERS,
        "doubles Chilling Cloud's Intelligence damage from 21st level by name and reads 'twice' terms",
      ),
      test(
        POWERS,
        "deals flat damage from a dice-less expression, without roll-only bonuses (native CalcDamage)",
      ),
      test(
        POWERS,
        "recognizes ongoing damage expressed through an ability modifier",
      ),
    ),
    "?A0x7555d940.FindWeaponDamage": code(
      "[W]/[B] dice and the '[W] (off-hand weapon)' term.",
      "powers.ts calculateDamage reads every N[W] term; a '(off-hand weapon)' one (6 powers: Eruption of Steel, Whirling Frenzy, Twinclaw Rend, ...) takes the off-hand die",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
      test(
        POWERS,
        "uses the Unarmed Damage Die text string and the off-hand weapon's die",
      ),
    ),
    "?A0x7555d940.FigureWeaponDice": code(
      "Weapon dice: the loot's damage override, the off-hand weapon for off-hand dice, DieIncrease ('<keyword>:die' stats), Arena Training improvised 1d8/1d10, without a weapon the melee WeaponBase record's Damage (Unarmed attack, or the 'Unarmed Weapon' record), else the 'Unarmed Damage Die' text string or 1d4.",
      "powers.ts figureWeaponDice / dieIncreaseSteps over the row's keyword set (rowKeywordTags), the unarmed base via withUnarmedWeaponBase; the off-hand item is legacyOffhand (a double weapon's _Secondary End)",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
      test(
        POWERS,
        "steps weapon dice up by matching ':die' stats (DieIncrease)",
      ),
      test(
        POWERS,
        "uses the Unarmed Damage Die text string and the off-hand weapon's die",
      ),
      test(
        POWERS,
        "gives Arena Training improvised weapons 1d8 or 1d10 and +2 proficiency",
      ),
    ),
    "?A0x7555d940.DiceAdjustment": code(
      "Striker dice adjustments: '<feature> Dice' stats limited to the weapon name or '<group> group'.",
      "powers.ts strikerDiceAdjustment adds '<feature> Dice(<WeaponBase name>)' and '<feature> Dice(<group> group)' for each trimmed Group entry (native keeps the space after a comma, so its later groups never match; Longsword Finesse, Street Thug, Tunnel Stalker)",
      test(
        POWERS,
        "projects sneak attack only for recovered eligible weapon families",
      ),
    ),
    "?A0x7555d940.DualImplementSpellcaster": code(
      "Dual Implement Spellcaster (feat by name) adds the other hand's implement enhancement to an arcane implement power's damage roll made with a different item.",
      "powers.ts pairedImplement / legacyOffhand (2575583: off-hand row, DetermineOffhand without a saved hand, Arcane keyword, TwoDifferentWeapons)",
      test(
        POWERS,
        "uses only the selected off-hand implement enhancement for dual implements",
      ),
      test(
        POWERS,
        "pairs dual implements by legacy DetermineOffhand without a hand selection",
      ),
      fixture(
        "sample-chars/oleander_9.dnd4e",
        "Eyebite and the other arcane implement powers list the Vistani Buzuq +2 off-hand implement enhancement",
      ),
    ),
    "?A0x7555d940.CalcStrikers": code(
      "Hunter's Quarry, Warlock's Curse, Sneak Attack by feature ID; Sneak Attack needs a weapon power with a light blade or sling group, a hand crossbow or shortbow by name, or a weapon or '<group> group' in the 'Sneak Attack Weapons' text string.",
      "powers.ts conditionalStrikerDamage / sneakAttackWeapon: WeaponBase (Unarmed weapon for a melee power), ListContains on the Group field and record name, then the '+'-joined 'Sneak Attack Weapons' text against NormalizedName and '<group> group' (Longsword Finesse, Blowgun Training, Piercing Palm, …)",
      test(POWERS, "names a striker's usage from its feature's Usage field"),
      test(
        POWERS,
        "projects sneak attack only for recovered eligible weapon families",
      ),
      test(
        GOLDEN,
        "projects conditional striker damage without adding it to every hit",
      ),
    ),
    "?A0x7555d940.CalcStriker": code(
      "Striker reminder: '<feature> Dice'd6 (+ DiceAdjustment), '+<feature>' flat, the '<feature> Die' text string, once per the feature's Usage field (default round).",
      "powers.ts conditionalStrikerDamage: the standard feature's Name and overlay-resolved Usage ('once per turn' for Sneak Attack, 'once per round' otherwise), matching every cached striker line on the samples; it omits a zero-dice, zero-flat line native would print as '+0d6'",
      test(
        POWERS,
        "projects sneak attack only for recovered eligible weapon families",
      ),
      test(POWERS, "names a striker's usage from its feature's Usage field"),
      fixture(
        "CharacterBuilder/SampleChars/SampleHeroes/Drizzt.dnd4e",
        "every cached '+3d8 to damage once per round (Hunter's Quarry)' line, and Japheth's Warlock's Curse lines",
      ),
    ),
    "?A0x7555d940.HasStrikerFeature": code(
      "Hybrid striker features (ID_FMP_CLASS_FEATURE_1530/1531/1533) apply only to their class's powers.",
      "powers.ts conditionalStrikerDamage (EXCEPTION_IDS striker features)",
      test(POWERS, "limits hybrid striker damage to its class powers"),
    ),
    "?A0x7555d940.CalcBonuses": code(
      "A power field (indent <= 2, not a standard power field) named 'Special', an owned element (Brutal Scoundrel, Rageblood Vigor, a pact, an aegis...) or 'axe' with an axe-group WeaponBase, whose text is one of the exact rider sentences, adds Int/Wis/Con/Str to damage or Str to the attack; the dwarf line also needs Dwarf.",
      "native-power-field-bonuses.ts nativePowerFieldBonuses (NATIVE_BUILD_OPTION_BONUSES, STANDARD_POWER_FIELDS, EXCEPTION_NAMES.dwarf)",
      test(
        NATIVE_FIELD_BONUSES,
        "adds the rider named by an owned element, on every row",
      ),
      test(
        NATIVE_FIELD_BONUSES,
        "adds Strength to the attack for the attack-roll sentences",
      ),
      test(NATIVE_FIELD_BONUSES, "needs a Dwarf for the Special dwarf line"),
      test(NATIVE_FIELD_BONUSES, "applies an `Axe` rider only with an axe"),
    ),
    "?A0x7555d940.CalcMisc": partial(
      "Power 'beast' fields (CalcBeast) and 'weapon' fields matched against the WeaponBonuses table by exact text, group and off-hand flag.",
      "native-power-field-bonuses.ts ports the 16-line WeaponBonuses table (NATIVE_WEAPON_BONUSES) and, by D091, applies Constitution weapon riders outside the table for the weapons their sentence lists; the CalcBeast part is not ported",
      test(
        POWERS,
        "applies recovered weapon-field ability bonuses only to eligible families",
      ),
      test(
        NATIVE_FIELD_BONUSES,
        "uses the table's weapon groups (the axe-only line, the hammer or mace line)",
      ),
      test(
        NATIVE_FIELD_BONUSES,
        "needs an off-hand weapon for the two-melee-weapons line",
      ),
      test(NATIVE_FIELD_BONUSES, "halves Strength with C# truncation"),
      test(
        NATIVE_FIELD_BONUSES,
        "takes the weapons of a Constitution rider outside the table from its sentence (D091)",
      ),
    ),
    "?A0x7555d940.CalcBeast": partial(
      "One exact companion line adds Wisdom damage for a cat, spider or wolf companion.",
      "powers.ts companion damage; the cat/spider/wolf Wisdom line is not special-cased",
    ),
    "?A0x7555d940.CalcHealing": code(
      "Healing bonus stats 'Healing', '<power>:healing' and '<class>:healing'.",
      "powers.ts powerHealing; corrections add missing healing statadds",
      test(
        POWERS,
        "totals legacy healing stats for Healing powers, sharing typed maxima",
      ),
      test(POWERS, "counts a class power's power source for keyed healing"),
    ),
    "D20Workspace.PowerStats": partial(
      "Per-power stat block: DetermineWeapon/DeterminePower, IsValidPowerCombo, rows only with a Hit line, an EffectPower or the Healing keyword, no weapon for [B] hits, Commander's Strike by name gets no rows; then attack, damage, strikers, keywords, globals, versatile, misc, bonuses, healing, stacking.",
      "powers.ts evaluatePowers; Commander's Strike still gets rows (legacy gives it none). D095 divergence: a fixed-bonus summoned creature ('your level + N' with the Summoning keyword or a Summoned Creature stat block) skips CalcKeywords/CalcGlobal on attack and damage, taking only ALLY./COMPANION./SUMMON. and power-keyed stats",
      test(
        POWERS,
        "calculates no rows for a power with neither an attack nor a Hit line",
      ),
      test(
        POWERS,
        "gives a fixed-bonus summoned creature only creature and power-keyed bonuses (D095)",
      ),
      test(
        POWERS,
        "evaluates exact synthetic forms of three recovered level-one powers",
      ),
    ),
    "?A0x7555d940.BasicAttackOnly": code(
      "Charge/opportunity-attack-only modifiers apply to basic attacks.",
      "powers.ts powerAdditionalEffects",
      test(
        POWERS,
        "uses the effective BA flag for eligibility and native basic-specific combat channels",
      ),
    ),
    "?A0x7555d940.BuildKeywordSet": partial(
      "Keyword set for channel matching: weapon keywords, Arena weapons, implement names ('<name> implement', 'Ki Focuses Implement', '<group> implement group'), 'two-weapon', 'two-melee-weapon(-close)', 'two-blade', 'two-melee-offhand(-close)', attack types, Keywords, _ExtraKeywords, '<feat> association', name, ID, _AugmentParent, Class and paragon path, Power Usage, 'multiclass'/'multiclass feat', 'melee basic'/'ranged basic', and AdditionalKeywords: the power's, WeaponBase's and WeaponEnchant's _PowerstatKeywords, a '<keyword>?<class ID>' entry only for that class's powers (PossibleInsert, IsClassPower through BaseClass).",
      "powers.ts loadout tags + legacyPowerKeywordTags + nativeRowKeywords (LootImplement names, ki focuses, implement groups, the base's WeaponEquiv record, the DetermineOffhand two-weapon channels, Melee/Ranged Weapon, group(weapon), one-hand, multiclass, and legacyPowerstatKeywords over the overlaid records: the 49 conditional implement overlays such as Staff of Divinity's 'holy symbol implement' and Eladrin Sword Wizardry's 'wand implement?ID_FMP_CLASS_9'; legacyPowerClassChannels gives BaseClass a paragon path's class prerequisite and InsertParagonPath's '<class> Paragon Path' category ID for Sorcerous Power; a path power's own ID was already a Class keyword, so Pact Reward's and Stalker Bloodline's ID_FMP_PARAGON_PATH_<n>:damage stats applied before). Still missing: Arena weapons (AddArenaWeapons)",
      test(
        POWERS,
        "matches bonuses keyed by the power's class ID and the weapon's ID",
      ),
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
      ),
      test(
        POWERS,
        "names a ki focus 'Ki Focuses Implement' (LootImplement), not its item type",
      ),
      test(
        POWERS,
        "adds '<group> implement group' and 'instrument implement' channels",
      ),
      test(
        POWERS,
        "applies two-weapon channels only with a weapon in the off hand (native DetermineOffhand)",
      ),
      test(
        POWERS,
        "adds 'melee weapon' or 'ranged weapon' to weapon power rows",
      ),
      test(POWERS, "adds an augment version's _AugmentParent as a keyword"),
      test(
        POWERS,
        "adds the overlaid enchantment's _PowerstatKeywords (AdditionalKeywords)",
      ),
      test(
        POWERS,
        "adds a '?<class ID>' _PowerstatKeywords entry only to that class's powers",
      ),
      test(
        POWERS,
        "adds a paragon path power's ID and its '<class> Paragon Path' category (InsertParagonPath)",
      ),
    ),
    "?A0x7555d940.IsBlade": code(
      "Light or heavy blade group, for the 'two-blade' channel.",
      "powers.ts nativeRowKeywords",
      test(
        POWERS,
        "applies two-weapon channels only with a weapon in the off hand (native DetermineOffhand)",
      ),
    ),
    "?A0x7555d940.IsOffhand": code(
      "Off-hand property, for the 'two-melee-offhand' channels.",
      "powers.ts nativeRowKeywords",
      test(
        POWERS,
        "applies two-weapon channels only with a weapon in the off hand (native DetermineOffhand)",
      ),
    ),
    "?A0x7555d940.AttackTypeKeywords": code(
      "Melee/Ranged/Area/Close channels from Attack Type ('melee or ranged weapon' by the weapon).",
      "powers.ts combatStatEntries attackTypeTags",
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
      ),
    ),
    "?A0x7555d940.CalcKeywords": partial(
      "Keyword channel matching (:damage, :nonroll-damage, :attack, :info, parenthesized limiters incl. the bound augment); 'weapon attack rolls'/'weapon damage rolls' for weapon powers.",
      "powers.ts combatStatEntries / powerAdditionalEffects; combatStatEntries reads ':nonroll-damage' for any damage and ':damage' only for a damage roll (IsDamageRoll); powerAdditionalEffects reminders do not read ':nonroll-damage'",
      test(
        POWERS,
        "keeps conditional reminders and keyword info separate from totals and alternate equipment",
      ),
      test(
        POWERS,
        "matches an augment limiter on the item the augment is bound to",
      ),
    ),
    "?A0x7555d940.AttackKeyword": code(
      "Typed maximum for attack channels.",
      "powers.ts stackTypedComponents over combatStatEntries (one att_type_max per row)",
      test(
        POWERS,
        "shares typed bonus maxima across general and defense-specific implement channels",
      ),
    ),
    "?A0x7555d940.DamageKeyword": code(
      "Damage keyword components and typed maxima.",
      "powers.ts combatStatEntries + stackTypedComponents: one dmg_type_max per row, shared by an implement power's implement and weapon (pact blade) paths",
      test(
        POWERS,
        "applies one contribution once across overlapping implement and weapon channels",
      ),
      test(
        POWERS,
        "stacks a pact blade's typed bonus with Dual Implement Spellcaster's in one row maximum",
      ),
    ),
    "?A0x7555d940.AddPieces": generic(
      "Component explanation text.",
      "explanation text only; feeds no total",
    ),
    "?A0x7555d940.PieceComment": generic(
      "Component explanation text.",
      "explanation text only; feeds no total",
    ),
    "D20Workspace.RulesElementEncounterUses": code(
      "Six healing-word style powers by exact Special text get 2 uses per encounter (3 from level 16); _ADDITIONAL_USES field and stat add uses.",
      "powers.ts legacyEncounterUses sets EvaluatedPower.encounterUses (TWICE_PER_ENCOUNTER_SPECIALS in exceptions.ts; the overlaid _ADDITIONAL_USES of Fight On, Reaping Renewal, Martial Dilettante, Blurred Strike Ki Focus and 12 more; the '<ID>_ADDITIONAL_USES' stat). D091 divergences: whitespace runs compare as one space (Ardent Surge's Special has a line break, so native gives it 1 use) and _ADDITIONAL_USES adds to the twice-per-encounter count (native returns before reading it, so Fight On adds nothing to Inspiring Word). No sheet surface shows the count yet: the use boxes belong to the deferred M6 play tracker",
      test(
        POWERS,
        "gives a recovered 'twice per encounter' Special 2 uses, 3 from 16th level",
      ),
      test(
        POWERS,
        "adds the overlaid _ADDITIONAL_USES field and the '<ID>_ADDITIONAL_USES' stat",
      ),
      test(
        POWERS,
        "counts Fight On's additional use on top of Inspiring Word's two (D091)",
      ),
    ),

    // --- D20RulesEngine: companions ----------------------------------
    BeastAbilityScore: code(
      "Companion ability scores via 'Companion.' stats; 'ability' means the companion's Ability Score field.",
      "rules-engine beast-companion.ts",
      test(
        BEAST,
        "uses the beast's attack bonus, [B] die and ability modifiers",
      ),
      test(BEAST, "follows the Martial Power formulas for a 1st-level bear"),
    ),
    BeastDamage: code(
      "Beast damage die from the companion's Damage field.",
      "beast-companion.ts",
      test(
        BEAST,
        "uses the beast's attack bonus, [B] die and ability modifiers",
      ),
    ),
    BeastAttackBonus: code(
      "Beast attack bonus: level + Attack Bonus + companion 'attack rolls' bonuses.",
      "beast-companion.ts",
      test(BEAST, "follows the Martial Power formulas for a 1st-level bear"),
    ),
    BeastHitPoints: code(
      "Beast hit points: Hit Points at 1st Level + level x per level + companion bonuses.",
      "beast-companion.ts",
      test(BEAST, "follows the Martial Power formulas for a 1st-level bear"),
    ),
    BeastHealingSurges: code(
      "Beast healing surges: 2 + companion bonuses.",
      "beast-companion.ts",
      test(
        BEAST,
        "adds increases, tier bonuses and BEAST.* feats at 11th and 21st level",
      ),
    ),
    "BeastBlock.SetSpeed": code(
      "Beast speed + companion speed bonuses, with Secondary Speed.",
      "beast-companion.ts",
      test(BEAST, "follows the Martial Power formulas for a 1st-level bear"),
    ),
    "BeastBlock.SetBasicAttack": generic("Beast basic attack line text."),
    "BeastBlock.SetTrainedSkills": code(
      "Beast trained skills by name.",
      "beast-companion.ts",
      test(BEAST, "follows the Martial Power formulas for a 1st-level bear"),
    ),
    "CompanionStatBlock.GetCompanionStat": code(
      "Companion stats sum ALLY., COMPANION. and <type>. prefixed stats.",
      "derived-values.ts companionStatBonus",
      test(BEAST, "sums ALLY., COMPANION. and BEAST. bonuses"),
    ),
    "BeastBlock.SetDefenses": code(
      "Companion defense line.",
      "derived-values.ts BEAST_DEFENSE_STATS",
      test(BEAST, "follows the Martial Power formulas for a 1st-level bear"),
    ),
    "FamiliarBlock.Speed": code(
      "Familiar speed + companion speed bonuses, with Secondary Speed.",
      "derived-values.ts familiarSpeed / sheet-model familiar-card.ts",
      test(
        "packages/sheet-model/src/familiar-card.test.ts",
        "shows the familiar's fields with its master's defenses and bonuses",
      ),
    ),
    "FamiliarBlock.Update": generic("Familiar panel refresh."),

    // --- D20RulesEngine: auto-build and character I/O ------------------
    "?A0xe93d131c.DesiredArmor": outOfScope(
      "Auto-build armor choice; Battlerager Vigor and Tempest Technique pick Chainmail.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.AutoItem": outOfScope(
      "Auto-build implement purchase.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.AutoBaseItemName": outOfScope(
      "Auto-build base item from the combo tables (hybrid _BaseClass).",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.AutoImplementGroupName": outOfScope(
      "Auto-build implement group name.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.AutoWeapon": outOfScope(
      "Auto-build weapon purchase.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.FindOptimalArmor": outOfScope(
      "Auto-build masterwork armor by enhancement.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.RandomCombo": outOfScope(
      "Auto-build random magic armor/weapon.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.RandomItem": outOfScope(
      "Auto-build random magic item.",
      AUTO_BUILD,
    ),
    "?A0xe93d131c.CalculateStat": outOfScope(
      "Auto-build key ability; the free '+2 to one ability' race text gives none.",
      AUTO_BUILD,
    ),
    "D20Choice.AutoComplete": outOfScope(
      "Auto-choose: Essentials _Subclasses, feats without a Container, power level.",
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
    "D20Workspace.AutoAbilityScores": outOfScope(
      "Auto ability scores from suggestions or the class Key Abilities.",
      AUTO_BUILD,
    ),
    "D20Workspace.LevelUp": notHandled(
      "New-level text strings: starting money 100 gp, stored money, residuum.",
      "new native characters get no starting Carried Money (legacy and PHB: 100 gp); owner decision pending",
    ),
    "D20Workspace.LoadInternal": outOfScope(
      "Legacy file load and portrait paths.",
      LEGACY_IO,
    ),
    "D20Workspace.StockStatWeight": code(
      "Weight stat accessor.",
      "sheet-model encumbrance.ts sheetEncumbrance (with StrLoadAdjust and Weight Discount)",
      test(
        ENCUMBRANCE,
        "uses base gear, signed quantities, decimal overrides and native weight exclusions",
      ),
      test(
        ENCUMBRANCE,
        "retains unknown money/gear/strength and clamps negative stock weight",
      ),
    ),
    "D20Workspace.StockStatSTR": code(
      "Strength stat accessor.",
      "sheet-model encumbrance.ts sheetEncumbrance (with StrLoadAdjust and Weight Discount)",
      test(
        ENCUMBRANCE,
        "retains unknown money/gear/strength and clamps negative stock weight",
      ),
    ),
    "D20Workspace.StockStatXPNeeded": generic("XP Needed stat accessor."),
    SetStoredMoney: generic("Stored money per level."),
    "?A0x7f38ca63.WriteDetails": outOfScope(
      ".dnd4e details writer.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.WriteCompanions": outOfScope(
      ".dnd4e companions writer.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.WritePowerStat": outOfScope(
      ".dnd4e power stat writer.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.ParseStatAdd": outOfScope(
      ".dnd4e statadd reader.",
      `${LEGACY_IO}. This is the saved stat-block reader; the rules-XML ParseStatAdd (?A0x1e9d9cdc, MINONEMOD/HALFMOD) is rules-engine stats.ts`,
    ),
    SaveStats: outOfScope(".dnd4e stat block writer.", LEGACY_IO),
    "Campaign.FromXML": notHandled(
      ".dndcamp reader (Houserules/Restricted).",
      ".dndcamp house rules/Restricted lists change legality; the modern app has no .dndcamp support (owner decision: build or out of scope)",
    ),

    // --- RulesEngineCommon --------------------------------------------
    "MagicItem.CategoryName": code(
      "Shop/gear category names by Magic Item Type (boons, scrolls, consumables, alchemical, ki focuses, tattoos).",
      "equipment-ui.ts shopBrowseCategory",
      test(
        EQUIPMENT_UI,
        "uses authored fields for the modern taxonomy, slots, and subtypes",
      ),
    ),
    "GearItem.InitializeCategoryMembership": drift(
      "Gear implement categories by name: '<X> Implement', Totem, Holy Symbol; Spellbook/Ritual Book as Tomes.",
      "equipment-ui.ts MUNDANE_IMPLEMENT_IDS lists the implement gear by ID (Spellbook/Ritual Book stay adventuring gear); nothing checks the list against the '<X> Implement' names",
    ),
    "GearItem.CategoryName": code(
      "Ammunition and mount gear categories.",
      "equipment-ui.ts",
      test(
        EQUIPMENT_UI,
        "normalizes player-facing subtypes and classifies corpus edge cases",
      ),
    ),
    "EnchantmentItem.InitializeCategoryMembership": notHandled(
      "When the superior implements Accurate Staff/Dagger exist, implement enchantments also list under Magic Implements.",
      "presentation only; modern lists superior implements under implements",
    ),
    "EnchantmentItem.CategoryName": code(
      "Magic armor/weapon category names.",
      "equipment-ui.ts",
      test(
        EQUIPMENT_UI,
        "uses authored fields for the modern taxonomy, slots, and subtypes",
      ),
    ),
    "ImplementItem.InitializeCategoryMembership": generic(
      "Superior implements also list under '<Group>s'.",
      "shop presentation",
    ),
    "LootItem.InitializeCategoryMembership": generic(
      "Custom items list under Other.",
    ),
    "GearPageData.SetUpCharacterLootFilter": code(
      "Hides the internal Monk Unarmed Strike weapon from the gear list.",
      "InternalOnly records are hidden by the shop",
    ),
    "GearPageData.UpdateInternal": code(
      "Gear page grouping by slot.",
      "sheet-model encumbrance.ts sheetEncumbrance (gear weight and load, with StrLoadAdjust and Weight Discount)",
      test(
        ENCUMBRANCE,
        "uses base gear, signed quantities, decimal overrides and native weight exclusions",
      ),
    ),
    "GearPageData.UpdateHouseruledItems": generic(
      "Custom items list under Other.",
    ),
    "GearPageData.FindLootCategory": generic(
      "Category lookup with an Other fallback.",
    ),
    "GearPageData.HasSingleItem": notHandled(
      "Ammunition and rations packs: a _RelatedElement record pairs the bundle with its single item.",
      "modern buys bundles and singles independently (8 gear records)",
    ),
    "CharacterLootItem.IsPackageRelated": notHandled(
      "A gear item with a _RelatedElement of a different lot size is part of a package.",
      "see GearPageData.HasSingleItem",
    ),
    "CharacterLootItem.PackageCount": notHandled(
      "Quantity of a packaged item counts both the bundle and the singles.",
      "see GearPageData.HasSingleItem",
    ),
    "CharacterLootItem.PackageManipulation": notHandled(
      "Adding or removing packaged items rebalances bundles and singles.",
      "see GearPageData.HasSingleItem",
    ),
    "CharacterLootItem.GetLotSize": generic(
      "Lot size from the 'count' field, shown as '<name> (<quantity x lot>)'.",
      "inventory presentation; modern shows the holding quantity",
    ),
    "CharacterLootItem.UpdateInternal": generic(
      "Inventory row presentation (slots, _Item_Set_ID, augment flags).",
    ),
    "RulesEngineCommon/GearPageData.cs": generic("Gear page category names."),
    "BasicUtils.IsMagicImplement": code(
      "Rod/Staff/Wand/Orb magic items are implements.",
      "equipment-ui.ts IMPLEMENT_KINDS",
      test(
        EQUIPMENT_UI,
        "classifies every approved role from authored metadata",
      ),
    ),
    "BasicUtils.IsNonMagicImplement": generic(
      "Gear named 'Implement...' is a mundane implement.",
      "equipment-ui.ts MUNDANE_IMPLEMENT_IDS (see GearItem.InitializeCategoryMembership)",
    ),
    "BasicUtils.IsMonkTechnique": partial(
      "A power whose _ChildPower is a '[Movement Technique]' record is a monk full discipline.",
      "apps/web detail-stack.ts follows _ChildPower to a sibling card in builder detail panes; sheet power cards do not fold the movement technique into the attack card",
      test(
        "apps/web/src/detail-stack.test.ts",
        "shows each card once, stops loops and bounds the depth",
      ),
    ),
    "BasicUtils.AbbrAbilScoreName": generic("Ability abbreviations."),
    "LootItem.InitializeInternal": generic("Item rarity 'Common' default."),
    "HolySymbolLootSlot.IsItemCandidate": partial(
      "Holy symbol slot candidates: holy symbols and _ImplementEquiv 'Holy Symbol' items.",
      "equipment-ui loadout offers the symbol slot to items whose Item Slot names it; the 38 weapons whose _ImplementEquiv is Holy Symbol (Holy Avenger, Disrupting Weapon, ...) are not offered there",
      test(
        EQUIPMENT_UI,
        "shows implement slots only for their exact active proficiency IDs",
      ),
    ),
    "ArmorItem.InitializeInternal": generic("Shield detection for display."),
    "LootHelpers.CreateLootItem": generic("Shield detection for display."),
    "WeaponItem.InitializeInternal": generic(
      "Large weapon detection for display.",
    ),
    "WeaponItem.GetDamage": generic("Damage display ('d6' -> '1d6')."),
    "WeaponItem.ProfBonus": generic("Proficiency bonus display."),
    "AbilityInfo.InitializeInternal": generic(
      "Skill breakdown: the armor check penalty column applies to Strength, Constitution and Dexterity skills.",
      "skill totals come from the content's statadds; this is the legacy breakdown display",
    ),
    "SkillInfo.UpdateInternal": generic(
      "Skill row from '<skill> trained'/'misc' stats.",
    ),
    "RitualItem.InitializeInternal": generic("Ritual Key Skill display."),
    "RitualCategory.CreateGridView": generic("Ritual grid columns."),
    "AllItemSetsCategory.Find": generic("Item set lookup by _Item_Set_ID."),
    "AllItemSetsCategory.CreateGridView": generic("Item set grid columns."),
    "ArmorCategory.CreateGridView": generic("Armor grid columns."),
    "WeaponCategory.CreateGridView": generic("Weapon grid columns."),
    "SuperiorImplementCategory.CreateGridView": generic(
      "Superior implement grid columns.",
    ),
    "D20Char.UpdateProperties": generic("Character summary properties."),
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
      test(
        "apps/web/src/builder-ui.test.ts",
        "starts companion and familiar choices as their own presentation flows",
      ),
    ),
    "PanelModelCompanion.UpdatePanel": notHandled(
      "Sheet companion panel for Beast Mastery (ID_FMP_CLASS_FEATURE_1030), with low-light vision.",
      "no sheet companion card yet (familiar card only)",
    ),
    "MainWindow.UpdatePages": code(
      "Mage's Spellbook (ID_FMP_CLASS_FEATURE_2868) shows the spellbook page.",
      "modern spellbook choices come from content select rules",
      test(
        "packages/rules-engine/src/build-projection.test.ts",
        "saves a generated spellbook provider so its alternate pick attaches",
      ),
    ),
    "FeatPage.DoChooseFeat": declarative(
      "Choosing Student of Sword Magic adds a Spellbook to inventory.",
      "content/corrections/98-ritual-allowances.part gives the feat a FREEBEE:ID_FMP_GEAR_33 stat, so the Spellbook is a one-time free item (MainWindow.GiveFreebees) instead of being added on every pick; the correction itself is private content",
      test(FREEBEES, "lists each physical gift once with its provider level"),
    ),
    "MainWindow.GiveFreebees": code(
      "Gear page, Rituals page and auto-level: each FREEBEE:<id> character stat whose textstring <id> is not 'Given' adds one copy of <id> as loot (only marked when already owned), sets <id> = 'Given', then equips each given item that has an Item Slot, unequipping that slot.",
      "apps/web/src/freebee-gifts.ts + rules-engine freebees.ts pendingFreebeeItems + the character-domain give-freebees command, run by the builder whenever the current level is evaluated and folded into the edit's undo step. Deliberately different (D091): rituals are derived known records, not loot (known-records.ts); a gift takes only a free slot and never unequips the player's item; associates are not given (companion model)",
      test(FREEBEES, "lists each physical gift once with its provider level"),
      test(FREEBEES, "skips given markers and only marks a gift already owned"),
      test(
        "apps/web/src/freebee-gifts.test.ts",
        "gives physical gifts once, equipping slotted ones into free slots",
      ),
    ),
    "FeatPage.CategoryFromPrereq": generic(
      "Feat list grouping by prerequisite type.",
    ),
    "BackgroundPage.ChoiceMade": outOfScope(
      "Auto-choose: after a background is picked, each open Background Choice takes its first legal _IsBenefit option.",
      "the modern builder leaves background benefit choices to the player",
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
    "ClassPage.AddClassToPanel": generic(
      "Class detail panel (_PARSED_CLASS_FEATURE, _ParentClass, key fields).",
      "detail-pane presentation; see the coverage audit's reference-field scan",
    ),
    "ClassPage.DumpClassFeatures": generic(
      "Class feature list from _PARSED_CLASS_FEATURE.",
      "detail-pane presentation",
    ),
    "HybridClass.ClassFeatures": generic(
      "Hybrid class features from _PARSED_CLASS_FEATURE.",
      "detail-pane presentation",
    ),
    "HybridClass.ClassFeaturesList": generic(
      "Hybrid class feature list.",
      "detail-pane presentation",
    ),
    "ClassPage.AddPathDestinyToPanel": generic(
      "Paragon Multiclassing heading.",
    ),
    "ClassPage.Tier": generic("Tier display."),
    "RacePage.AddRaceToPanel": generic("Race page headings."),
    "App.StockElemToPanel": generic(
      "Detail panel: Special, Full Text, _PARSED_SUB_FEATURES/_PARSED_CHILD_FEATURES and Domains.",
      "detail-pane presentation; the coverage audit's reference-field scan follows these fields",
    ),
    "App.AddGrantedPowersToPanel": generic(
      "Detail panel: _DisplayPowers cards.",
      "detail-pane presentation (content-type-coverage)",
    ),
    "App.ElementControl": generic(
      "Detail panel: _RELATED_ITEMS tier variants.",
      "detail-pane presentation (content-type-coverage)",
    ),
    "GearPage.SetInfo_Click": generic("Item set info from _Item_Set_ID."),
    "SingleRule.SingleRule": generic("Item set rule display (_Item_Set_ID)."),
    "PowerDisplay.Build": generic(
      "Power detail: keywords, usage, display, _ChildPower movement technique.",
      "detail-pane presentation",
    ),
    "MonsterDisplay.Build": notHandled(
      "Mount detail shows the _Monster stat block (47 mounts).",
      "presentation gap: modern shows the mount's own record",
    ),
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
      "modern basic attacks come from evaluated powers; the two-weapon decision is IsDualWeapon's (see that entry)",
    ),
    "BasicAttackHolder.GetBasicAttacks": generic(
      "Basic attack cards.",
      "evaluated powers; the two-weapon decision is IsDualWeapon's (see that entry)",
    ),
    "MiniCharPanel.PowerListing": generic("Basic attacks in the mini panel."),
    "PanelModelSenses.UpdatePanel": generic("Senses panel (darkvision)."),
    "CharSummaryCard.Insight": generic("Passive insight."),
    "SecondWindCard.Update": code(
      "Second Wind card; dwarves (by race name) use it as a minor action.",
      'sheet-model universal-action-cards.ts reads `modify name="Second Wind"` overlays; the dwarf case is a correction',
      test(
        ACTION_CARDS,
        "applies Second Wind overlays: last Action Type wins, other fields become notes",
      ),
      test(
        ACTION_CARDS,
        "builds one Second Wind card with the legacy healing amount",
      ),
    ),
    "NoteHolder.GetShortDescription": notHandled(
      "Sheet notes use _CS_ShortDescription over Short Description, hidden when its '@<class feature>' is owned.",
      "sheet-model uses Short Description only (822 records carry _CS_ShortDescription; Hystan, Oleander, Silaqui, Drizzt, Japheth and Omin Dran own some)",
    ),
    "PowerCard.MonkMovementTechnique": partial(
      "Power cards append the _ChildPower movement technique (its Action Type, Attack Type and specifics).",
      "see BasicUtils.IsMonkTechnique: the technique stays its own card on the sheet",
    ),
    "PowerCardPower.UpdatePowerCardPower": partial(
      "Power card header: Keywords, Action Type, SPELLBOOK marker, racial/_SkillPower class block, Level.",
      "sheet-model power cards and power-classification.ts cover keywords, action, class and level; the 'SPELLBOOK' name subtext and the _SkillPower skill name as the class block are not shown (builder-ui reads _SkillPower for choices only)",
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
