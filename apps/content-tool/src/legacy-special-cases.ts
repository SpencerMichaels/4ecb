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
const REQUIREMENTS = "packages/rules-engine/src/power-requirements.test.ts";
const EXCEPTIONS = "packages/rules-engine/src/exceptions.test.ts";
const EQUIPMENT = "packages/rules-engine/src/equipment.test.ts";
const EVALUATOR = "packages/rules-engine/src/evaluator.test.ts";
const PREREQUISITES = "packages/rules-engine/src/prerequisites.test.ts";
const BEAST = "packages/rules-engine/src/beast-companion.test.ts";
const FREEBEES = "packages/rules-engine/src/freebees.test.ts";
const ITEM_SETS = "packages/rules-engine/src/item-sets.test.ts";
const WEAPON_GROUPS = "packages/rules-engine/src/weapon-groups.test.ts";
const GOLDEN = "packages/rules-engine/src/golden-matrix.test.ts";
const EQUIPMENT_UI = "apps/web/src/equipment-ui.test.ts";
const ENCUMBRANCE = "packages/sheet-model/src/encumbrance.test.ts";
const ACTION_CARDS = "packages/sheet-model/src/universal-action-cards.test.ts";

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
    "?A0xca3c2cf6.PsionicConventionalist": notHandled(
      "Psionic Conventionalist (ID_FMP_FEAT_2732) removes 2/4/6 power points by swapped power level.",
      "no modern power-point stat",
    ),
    "?A0xca3c2cf6.Psionics": notHandled(
      "Power points: strips 'Augmentable' from locked powers' Keywords and adds 2/4/6 'Hybrid Power Points' per owned class at-will attack by its Level, then applies Psionic Conventionalist.",
      "no modern power-point model (RulesElement.IsPsionicClass); 'Hybrid Power Points' has no record in the current pack",
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
      "character-domain retrainSelection / replaceSelection cover retraining; the multiclass Display 'attack' and hybrid CheckHybridPower limits are not reproduced",
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
    "?A0x7555d940.FromMulticlassing": partial(
      "Multiclass-sourced powers (Dilettante, Paragon Multiclassing IDs, multiclass feats) get the 'multiclass' (and, from feats, 'multiclass feat') keyword and read 'multiclass:key ability'.",
      "key-ability-overrides.ts powerOrigins marks Dilettante, Paragon Multiclassing, multiclass power-swap and multiclass-feat powers, so Combat Virtuoso's 'multiclass:key ability' applies; legacyPowerKeywordTags still adds no 'multiclass'/'multiclass feat' keyword, so Compensatory Insight's 'multiclass feat:damage' is not applied",
      test(
        KEY_ABILITY,
        "applies dilettante and multiclass overrides by where the power came from",
      ),
    ),
    "D20Workspace.ClassName": generic(
      "Displays a hybrid character's class as 'Hybrid A|B'.",
    ),
    "D20Workspace.RulesElementSource": generic(
      "Maps the 'Core' source to a book title (hybrid records to PHB3, otherwise PHB/Divine Power).",
      "presentation of sources; modern shows the authored source",
    ),
    "?A0x03aa98b1.HybridArmorProf": notHandled(
      "An armor or shield Proficiency granted by a hybrid Grants record is deferred until the other hybrid half grants the same proficiency (a hybrid is proficient only with armor both classes grant).",
      "evaluator grants each hybrid half's whole list: probing Alysa Redfield without Armored Warlord, modern still owns Armor Proficiency (Scale) from Hybrid Fighter alone (31 hybrid Grants records list armor or shields)",
    ),
    "D20Workspace.IsEssentials": code(
      "A character is 'Essentials' when any owned class has a _ParentClass (gates the Essentials magic armor table and auto-build).",
      "evaluator essentialsMagicArmorBonuses keys on the armor and enchantment, as EssentialsMagicArmor does; the class-level flag only feeds auto-build",
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
    ParseOneRule: generic(
      "Rules XML statement parser: statement attributes (Usage, spellbook, type, ...) and the 'modify this Prereqs' shortcut.",
      "content-pack import parses the same rule attributes",
    ),
    "?A0x1e9d9cdc.ParseRulesElement": generic(
      "Rules XML element parser (name, type, internal-id, source, revision-date).",
      "content-pack import",
    ),
    RulesElementFromAttributes: generic(
      "Resolves a saved element by internal-id, then by name and type.",
      LEGACY_IO,
    ),
    PrereqListStart: generic("Writes a DependsOn block.", LEGACY_IO),
    PrereqList: generic(
      "Writes non-core, non-internal prerequisite dependencies.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.ParseTextString": generic(
      "Character file text strings; skips the _CLASSNAME text string.",
      LEGACY_IO,
    ),
    "?A0x7f38ca63.ParseCharacterPiece": generic(
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
      "evaluator field overlays apply to the targeted definition only; an augment version (689 records with _AugmentParent) does not inherit overlays aimed at its parent power",
      test(POWERS, "materializes and deduplicates psionic augment versions"),
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
    LoadRulesDatabase: generic(
      "Rules database load (_ThemePower index).",
      LEGACY_IO,
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
    Proficiency: generic(
      "Builds '<kind> proficiency (<name>)' lookups for the proficiency parser.",
    ),
    "?A0xf75eff9b.ProficiencyWeapon": generic(
      "Resolves the weapon named in a 'Weapon Proficiency (...)' record.",
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
    InternalizeElement: generic(
      "Name lookup for a prerequisite token; excludes CountsAsRace for non-feats and the 'assassin' class/paragon name clash.",
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
    HealingInfusion: generic(
      "Detects 'Healing Infusion:' power names for infusion-count clauses.",
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
      "equipment-ui.ts isAuthoredShield",
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
    "?A0x0bed2cbe.CharLootName": generic(
      "Composes '<enchantment> <base>' item names, replacing implement/weapon words.",
      "character-domain formatInventoryItemName",
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
    ImplementType: partial(
      "Implement kind from Magic Item Type (Rod, Staff, Wand, Orb, Totem, Tome, Holy Symbol, Ki Focus), '<X> Implement'/'Implement, <X>' gear names, Holy Symbol/Totem/Ki Focus gear, and a weapon's WeaponEquiv name or Group.",
      "powers.ts loadouts recognize magic implements, superior implements, _ImplementEquiv and the Holy Symbol/Ki Focus gear names only: mundane Orb/Rod/Staff/Wand/Tome Implement and Totem gear (ID_FMP_GEAR_3/12/13/14/87/101) give no implement variant (Japheth owns the Rod Implement)",
      test(POWERS, "treats mundane holy symbols as implement choices"),
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
      "Ki focus detection, including the mundane Ki Focus gear (ID_FMP_GEAR_115).",
      "powers.ts loadouts read the 'Ki Focus' name; equipment-ui.ts MUNDANE_IMPLEMENT_IDS for the shop",
    ),
    "D20Workspace.IsStaff": code(
      "Staff detection: staff implement gear names, Staff magic items, Quarterstaff (ID_FMP_WEAPON_10), staff group.",
      "powers.ts legacyIsStaff",
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
      "powers.ts implementKinds / implementScopes (2575583 reads _ImplementEquiv on non-weapons); the bard instrument case is the _ImplementForClass scope",
      test(POWERS, "treats an implement-equivalent weapon as that implement"),
      test(POWERS, "uses a pact blade only for its class's powers"),
    ),
    "?A0x7555d940.ImplementName": partial(
      "Implement name for keyword channels ('<name> implement'): Staff, 'Ki Focuses', ImplementType, _ImplementEquiv, bard 'instrument'.",
      "powers.ts tags '<Magic Item Type> implement', so 'ki focus implement' never matches the content's 'ki focuses implement' channel and no 'instrument implement' tag exists (see BuildKeywordSet)",
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
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
      "powers.ts implementScopes",
      test(POWERS, "uses a pact blade only for its class's powers"),
    ),
    "?A0x7555d940.ForClass": code(
      "_ImplementForClass on the base or enchantment matches an owned class by name or ID.",
      "powers.ts implementScopeMatcher",
      test(POWERS, "uses a pact blade only for its class's powers"),
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
      "powers.ts unarmed loadout; Loadout.requirementBase and the 'Unarmed Weapon' text for requirements (EXCEPTION_NAMES)",
      test(REQUIREMENTS, "attacks with a staff as the Quarterstaff record"),
      test(
        REQUIREMENTS,
        "rejects Unarmed for a requirement its record cannot meet",
      ),
    ),
    "?A0x7555d940.OffhandWeaponBase": outOfScope(
      "Off-hand base: a double weapon's _Secondary End, else WeaponBase.",
      "Deliberately different (D093): IsRestricted read it only for off-hand clauses, which no longer filter power rows (a second weapon is loadout state)",
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
      "powers.ts loadout tags; the 'Melee Weapon'/'Ranged Weapon', 'group(weapon)' and off-hand 'one-hand' channels are listed under BuildKeywordSet",
      test(
        POWERS,
        "tags a military weapon for military-qualified channels (AddWeaponKeywords)",
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
    "?A0x7555d940.ArenaTrainingImprovisedWeapon": notHandled(
      "Arena Training (ID_FMP_CLASS_FEATURE_2893) lets non-proficient and improvised weapons use the improvised-weapon rules.",
      "not modeled",
    ),
    "?A0x0bed2cbe.WieldingDefensive": partial(
      "'defensive' selector: dual-wielding with a proficient defensive weapon (staff as Quarterstaff).",
      "equipment.ts defensive selector does not require dual wielding, proficiency or the staff-as-Quarterstaff base",
      test(
        EQUIPMENT,
        "matches armor, weapon, slot, property, and versatile selectors",
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
    "?A0x0bed2cbe.DualWieldingConditional": partial(
      "Dual-wielding selectors: plain, 'off-hand' (every equipped weapon off-hand), 'rapier-blade' (a rapier, ID_FMP_WEAPON_29 or the large rapier, with an off-hand light blade), else every equipped weapon in the listed groups.",
      "equipment.ts dual-wielding selector; 'rapier-blade' is not special-cased",
      test(EQUIPMENT, "recognizes dual-wielding projections"),
    ),
    HasLoot: code(
      "wearing/not-wearing selector dispatch (defensive, versatile, dual-wielding, dual-shield, slot, staff implement, only-weapon, _EquipmentEquiv).",
      "equipment.ts matchesEquipmentSelector / equipmentPredicate",
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
    "?A0x0bed2cbe.CheckOnlyWeapon": partial(
      "'only-weapon' selectors and dual wielding with a double weapon: at most one equipped hand item.",
      "equipment.ts 'only-weapon:' needs exactly one equipped weapon; legacy counts every equipped Two-hands/One-hand/Off-hand item (a shield or off-hand implement also breaks 'only weapon'), and the double-weapon dual-wielding branch is not modeled",
    ),
    "?A0x0bed2cbe.LootCheck": code(
      "Selector matching by category or weapon name, including 'Large <weapon>' variants.",
      "equipment.ts",
      test(
        EQUIPMENT,
        "matches armor, weapon, slot, property, and versatile selectors",
      ),
    ),
    "D20Workspace.IsDualWielding": partial(
      "Dual wielding: an off-hand weapon (staff as Quarterstaff) plus a main-hand weapon, or a double weapon alone.",
      "equipment.ts dual-wielding counts two equipped weapons; a lone double weapon (with CheckOnlyWeapon) does not count",
      test(EQUIPMENT, "recognizes dual-wielding projections"),
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
      "power-requirements.ts / powers.ts versatileUsedTwoHanded",
      test(
        REQUIREMENTS,
        "uses a versatile weapon two-handed for a Small character",
      ),
    ),
    VersatileUsedTwoHanded: code(
      "Versatile weapon damage +1 when _INTERNAL_VersatileUsedTwoHanded is set, except for a Small character with a non-small weapon.",
      "powers.ts versatile damage",
      test(
        POWERS,
        "adds versatile damage only when the legacy two-handed choice is set",
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
    CanUseLargeWeapons: notHandled(
      "Oversized / One Size Larger / Small character text strings change which weapon sizes fit.",
      "size-based wielding is not modeled",
    ),
    "?A0x0bed2cbe.SmallWithNonSmallWeapon": partial(
      "Small characters wield non-small weapons two-handed unless One Size Larger.",
      "power-requirements.ts versatile two-handed use for requirements and powers.ts versatile damage (EXCEPTION_NAMES.smallSize/oneSizeLarger); slots do not model size",
      test(
        REQUIREMENTS,
        "uses a versatile weapon two-handed for a Small character",
      ),
    ),
    "?A0x0bed2cbe.ItemSlot": partial(
      "Slot of a held item: staff as off-hand, versatile two-hands for Small characters, large weapons only with CanUseLargeWeapons, One Size Larger, Ambidextrous one-hand -> off-hand.",
      "equipment-ui loadout slots read Item Slot; size, staff-as-off-hand and Ambidextrous are not modeled",
      test(EQUIPMENT_UI, "limits explicit loadout choices to authored slots"),
    ),
    "?A0x0bed2cbe.CharLootSlot": generic("Slot display names."),
    "D20Workspace.CharLootItemSlot": partial(
      "Item slots offered for equipping: ItemSlot plus the item's _AlternateSlot.",
      "equipment-ui loadout reads Item Slot only; _AlternateSlot (Spiked gauntlet, Wrist Razors, Dantrag's Bracers) is not offered",
      test(EQUIPMENT_UI, "limits explicit loadout choices to authored slots"),
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
      "Two off-hand/ring items allowed.",
      "equipment-ui loadout",
      test(
        EQUIPMENT_UI,
        "shows legacy equipped counts in deterministic modern slots",
      ),
    ),
    "EquipDescription.Equip": partial(
      "Equipping a hand slot sets _INTERNAL_VersatileUsedTwoHanded for the two-hand versatile choice and places an item in its _AlternateSlot.",
      "the loadout's versatile two-hand choice writes the text string; _AlternateSlot is not offered (CharLootItemSlot)",
      test(
        POWERS,
        "adds versatile damage only when the legacy two-handed choice is set",
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
      "powers.ts proficiencyNames (Proficient As); large-weapon size and Additional Proficiencies (no record in the current pack) are not read",
      test(
        POWERS,
        "adds a weapon's proficiency bonus only with its weapon proficiency",
      ),
    ),
    "?A0x7555d940.GetProficiencyBonus": code(
      "Proficiency Bonus when proficient (Arena Training improvised +2 aside).",
      "powers.ts proficientWithWeapon",
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
    "D20Workspace.SetCharLootDamage": generic(
      "Stores a loot damage override.",
      "character-domain inventory overrides",
    ),
    "?A0x03aa98b1.ProcessModify": generic(
      "modify rules targeting 'this'/'BaseItem'; 'large ' name prefixes.",
      "evaluator field overlays",
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
      "powers.ts weaponFitsPowerRange",
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
    "?A0x7555d940.IsClose": generic("Close burst/blast detection."),
    "?A0x7555d940.WhichAttack": code(
      "Melee-or-ranged attack line selection by weapon, and the best of 'A, B, or C' abilities.",
      "powers.ts phaseAlternatives / attackLineAbility",
      test(POWERS, "selects the current level line and highest listed ability"),
    ),
    "D20Workspace.IsDualPower": code(
      "Dual-attack power detection from ') or ' / 'with a melee weapon or two'.",
      "powers.ts phaseAlternatives",
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
    "?A0x7555d940.AttackSpecialCase": notHandled(
      "Attack stat 'Highest Mental Ability'.",
      "powers.ts highestAbility covers 'your highest ability' forms only",
    ),
    "?A0x7555d940.HighestMentalAbility": notHandled(
      "Highest of Intelligence, Wisdom and Charisma (ties keep the first).",
      "see AttackSpecialCase",
    ),
    ChosenAbility: notHandled(
      "Attack/damage stat 'Chosen Ability' reads a chosen-ability text string.",
      "not modeled",
    ),
    AbilityTranslation: notHandled(
      "Ability names 'Chosen Ability'/'chosen' translate to the chosen ability.",
      "not modeled",
    ),
    "?A0x7555d940.CalcStatVsDefense": partial(
      "Attack stat parsing: beast's attack bonus, power-bonus suffixes, 'your highest ability', 'Primary ability', 'Chosen Ability', the '+1 per enemy adjacent to you' condition, then OverrideStat.",
      "powers.ts attackLineAbility / highestAbility / powerBonusAtLevel; 'Chosen Ability' and the per-adjacent-enemy condition are not modeled; OverrideStat is key-ability-overrides.ts",
      test(
        POWERS,
        "chooses the best attack ability and retains explicit power bonuses",
      ),
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
      "powers.ts combatStatComponents",
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
    "?A0x7555d940.HigherLevelDamage": partial(
      "Higher-level damage lines; Chilling Cloud by name at 21; one exact Constitution line; a riposte damage line trimmed.",
      "powers.ts lineAtLevel handles the generic lines; Chilling Cloud (ID_FMP_POWER_7406) at 21st level keeps its base damage; the exact Constitution and riposte lines match no current record",
      test(
        POWERS,
        "keeps each attack's ability, hit dice, damage type, and bonus independent at level %i",
      ),
    ),
    FindLine: code(
      "Theme power level lines ('Level N' specifics) and 'As above, but ' stripping.",
      "powers.ts lineAtLevel",
      test(POWERS, "handles primary attacks and prose level scaling"),
    ),
    "?A0x7555d940.CalcDamage": partial(
      "Damage parsing: twice/your/beast's ability, off-hand weapon, damage types; Defender's Gambit by name reads its tabbed hit field; NonDamagePower; DualImplementSpellcaster.",
      "powers.ts calculateDamage; Defender's Gambit is not special-cased and '(off-hand weapon)' ability terms use the row's own weapon",
      test(POWERS, "adds every explicitly additive ability modifier to damage"),
      test(
        POWERS,
        "recognizes ongoing damage expressed through an ability modifier",
      ),
    ),
    "?A0x7555d940.FindWeaponDamage": partial(
      "[W]/[B] dice and the '[W] (off-hand weapon)' term.",
      "powers.ts reads [W]/[B]; '[W] (off-hand weapon)' (6 powers: Eruption of Steel, Whirling Frenzy, Twinclaw Rend, ...) uses the row's own weapon die rather than the off-hand weapon's",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
    ),
    "?A0x7555d940.FigureWeaponDice": partial(
      "Weapon dice: the loot's damage override, the off-hand weapon for off-hand dice, DieIncrease ('<keyword>:die' stats), Arena Training improvised 1d8/1d10, unarmed 'Unarmed Damage Die' text string or 1d4.",
      "powers.ts weaponDamage; not modeled: '<keyword>:die' increases (Deadly Soldier, Throwing Master), the 'Unarmed Damage Die' text string (Brutal Brawler, Bladed Fists), Arena Training improvised dice, off-hand dice",
      test(POWERS, "produces explainable weapon and unarmed variants with %s"),
    ),
    "?A0x7555d940.DiceAdjustment": notHandled(
      "Striker dice adjustments: '<feature> Dice' stats limited to the weapon name or '<group> group'.",
      "powers.ts conditionalStrikerDamage reads '<feature> Dice' only",
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
    "?A0x7555d940.CalcStrikers": partial(
      "Hunter's Quarry, Warlock's Curse, Sneak Attack by feature ID; Sneak Attack needs a weapon power with a light blade or sling group, a hand crossbow or shortbow by name, or a weapon or '<group> group' in the 'Sneak Attack Weapons' text string.",
      "powers.ts conditionalStrikerDamage / sneakAttackWeapon: the 'Sneak Attack Weapons' text string (13 feats, e.g. Longsword Finesse, Street Thug, Blowgun Training) is not read, and the fixed list accepts every crossbow-group weapon where legacy names only the hand crossbow",
      test(
        POWERS,
        "projects sneak attack only for recovered eligible weapon families",
      ),
      test(
        GOLDEN,
        "projects conditional striker damage without adding it to every hit",
      ),
    ),
    "?A0x7555d940.CalcStriker": partial(
      "Striker reminder: '<feature> Dice'd6 (+ DiceAdjustment), '+<feature>' flat, the '<feature> Die' text string, once per the feature's Usage field (default round).",
      "powers.ts conditionalStrikerDamage reads Dice, flat and Die; DiceAdjustment and the Usage field are not read (fixed condition text)",
      test(
        POWERS,
        "projects sneak attack only for recovered eligible weapon families",
      ),
    ),
    "?A0x7555d940.HasStrikerFeature": code(
      "Hybrid striker features (ID_FMP_CLASS_FEATURE_1530/1531/1533) apply only to their class's powers.",
      "powers.ts conditionalStrikerDamage (EXCEPTION_IDS striker features)",
      test(POWERS, "limits hybrid striker damage to its class powers"),
    ),
    "?A0x7555d940.CalcBonuses": code(
      "Exact weapon-group prose fields add ability damage/attack; one Dwarf-only Wisdom line.",
      "powers.ts powerWeaponSpecificBonuses",
      test(
        POWERS,
        "applies recovered weapon-field ability bonuses only to eligible families",
      ),
    ),
    "?A0x7555d940.CalcMisc": partial(
      "Power 'beast' fields (CalcBeast) and 'weapon' fields matched against the WeaponBonuses table by exact text, group and off-hand flag.",
      "powers.ts powerWeaponSpecificBonuses ports two WeaponBonuses lines; the rest of the table is not ported",
      test(
        POWERS,
        "applies recovered weapon-field ability bonuses only to eligible families",
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
      "powers.ts evaluatePowers; Commander's Strike still gets rows (legacy gives it none)",
      test(
        POWERS,
        "calculates no rows for a power with neither an attack nor a Hit line",
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
      "Keyword set for channel matching: weapon keywords, Arena weapons, implement names ('<name> implement', 'Ki Focuses Implement', '<group> implement group'), 'two-weapon', 'two-melee-weapon(-close)', 'two-blade', 'two-melee-offhand(-close)', attack types, Keywords, _ExtraKeywords, '<feat> association', name, ID, _AugmentParent, Class and paragon path, Power Usage, 'multiclass'/'multiclass feat', 'melee basic'/'ranged basic'.",
      "powers.ts loadout tags + legacyPowerKeywordTags. Missing channels: 'ki focuses implement' (modern tags 'ki focus implement'; probed on RaidonKane, Implement Expertise (Ki Focuses) adds nothing with a Magic Ki Focus), 'instrument implement' (3 records), '<group> implement group' (14 Implement Expertise records), 'two-melee-offhand(-close)' (Tempest Technique), 'two-blade' (Fey Blades), 'multiclass feat' (Compensatory Insight), 'melee weapon'/'ranged weapon' (Dirty Fighting, Internalize the Basic Kata), 'group(weapon)', the off-hand slot's 'one-hand', _AugmentParent and the paragon path. 'two-weapon,weapon:' (Two-Weapon Fighting) and 'two-melee-weapon:' (Cutting Steps) apply whenever the row's item is equipped, without legacy's second-weapon check",
      test(
        POWERS,
        "matches bonuses keyed by the power's class ID and the weapon's ID",
      ),
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
      ),
    ),
    "?A0x7555d940.IsBlade": notHandled(
      "Light or heavy blade group, for the 'two-blade' channel.",
      "see BuildKeywordSet ('two-blade')",
    ),
    "?A0x7555d940.IsOffhand": notHandled(
      "Off-hand property, for the 'two-melee-offhand' channels.",
      "see BuildKeywordSet ('two-melee-offhand')",
    ),
    "?A0x7555d940.AttackTypeKeywords": code(
      "Melee/Ranged/Area/Close channels from Attack Type ('melee or ranged weapon' by the weapon).",
      "powers.ts combatStatComponents attackTypeTags",
      test(
        POWERS,
        "uses recovered implement aliases and variant-specific range channels",
      ),
    ),
    "?A0x7555d940.CalcKeywords": partial(
      "Keyword channel matching (:damage, :nonroll-damage, :attack, :info, parenthesized limiters incl. the bound augment); 'weapon attack rolls'/'weapon damage rolls' for weapon powers.",
      "powers.ts combatStatComponents / powerAdditionalEffects; ':nonroll-damage' (6 Staff of Missile Mastery items) is not read",
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
      "powers.ts combatStatComponents maxima",
      test(
        POWERS,
        "shares typed bonus maxima across general and defense-specific implement channels",
      ),
    ),
    "?A0x7555d940.DamageKeyword": code(
      "Damage keyword components and typed maxima.",
      "powers.ts combatStatComponents",
      test(
        POWERS,
        "applies one contribution once across overlapping implement and weapon channels",
      ),
    ),
    "?A0x7555d940.AddPieces": generic("Component explanation text."),
    "?A0x7555d940.PieceComment": generic("Component explanation text."),
    "D20Workspace.RulesElementEncounterUses": notHandled(
      "Six healing-word style powers by exact Special text get 2 uses per encounter (3 from level 16); _ADDITIONAL_USES field and stat add uses.",
      "use tracking belongs to the deferred M6 play tracker; add `_ADDITIONAL_USES` support and corrections then",
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
    "BeastBlock.SetDefenses": generic("Companion defense line."),
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
    "D20Workspace.LevelUp": generic(
      "New-level text strings: starting money 100 gp, stored money, residuum.",
      "character-domain starting wealth",
    ),
    "D20Workspace.LoadInternal": generic(
      "Legacy file load and portrait paths.",
    ),
    "D20Workspace.StockStatWeight": generic("Weight stat accessor."),
    "D20Workspace.StockStatSTR": generic("Strength stat accessor."),
    "D20Workspace.StockStatXPNeeded": generic("XP Needed stat accessor."),
    SetStoredMoney: generic("Stored money per level."),
    "?A0x7f38ca63.WriteDetails": generic(".dnd4e details writer."),
    "?A0x7f38ca63.WriteCompanions": generic(".dnd4e companions writer."),
    "?A0x7f38ca63.WritePowerStat": generic(".dnd4e power stat writer."),
    "?A0x7f38ca63.ParseStatAdd": generic(".dnd4e statadd reader."),
    SaveStats: generic(".dnd4e stat block writer."),
    "Campaign.FromXML": generic(".dndcamp reader (Houserules/Restricted)."),

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
    "GearPageData.UpdateInternal": generic("Gear page grouping by slot."),
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
