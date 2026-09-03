# Rules engine and authoritative build

## Boundary

`character-domain` owns the durable build tree and commands. `rules-engine`
accepts that projected build plus an immutable content pack and returns a pure
evaluated snapshot. React dispatches commands and renders results; it contains
no competing character formulas. The imported legacy snapshot is comparison
evidence, not an input to modern calculations.

The evaluator deliberately preserves invalid and incomplete states. Each
evaluated choice lists its structural candidates and current selection, while
diagnostics explain missing choices, unresolved definitions, prerequisites,
house rules, and nonconvergence. This lets users repair old, custom, or partially
built characters instead of preventing them from opening.

Choice availability does not collapse the legacy engine's different ownership
relations. Every candidate reports `sourceEntitled` (campaign/source access),
`rulesLegal` (the native-style legality bit), `activeDefinition` plus the active
occurrence IDs (global membership), and the provider occurrence IDs that own
those active occurrences. `eligible` remains the compatibility conjunction of
source entitlement and rules legality. With no entitlement list configured all
content is source-entitled; a configured list includes Core implicitly and
recursively honors `_RequiresID`. Source-unentitled imported selections remain
recoverable and diagnostic, but the ordinary choose command does not turn them
into house rules. Rules-illegal same-category candidates remain revealable and
selectable through the explicit unavailable/house-rule workflow.

## Recovered rule language

Content statements are parsed into a typed IR for `select`, `grant`, `modify`,
`statadd`, `statset`, `textstring`, `suggest`, `replace`, and `remove`. The
expression layer handles boolean category and requirement expressions, dynamic
class categories, level-qualified powers, equipment predicates, aliases, and
the recovered named exception hooks.

Evaluation proceeds as follows:

1. Resolve active build occurrences and equipped definitions for the effective
   level.
2. Iterate automatic grants to a fixed point with stable synthetic identities.
3. Materialize choice/replacement slots and evaluate every candidate's
   structural constraints and internalized `Prereqs` expression.
4. Apply stat operations, typed stacking, aliases, text values, and overlays.
5. Recheck selected elements against the final evaluated state and emit
   recoverable legality diagnostics.
6. Return values with provenance, completeness, legality, and diagnostics.

The full local corpus contains 54,012 statements across 38,339 entities. The
audit recognizes every observed opcode and attribute with no unexplained
required field. Public tests use synthetic content; private files remain ignored.

## Authoritative character history

`CharacterBuild` stores effective level, one nested root per acquired level,
typed per-level native user edits, grabbag occurrences, inventory, alternates,
base abilities, and text strings.
Every occurrence has a character-local ID, definition identity, acquisition
level, legality marker, children, and optional replacement link. Imported trees
are mapped against all provider slots even when those slots activate only at a
later level, so future grants do not activate prematurely. Legacy inventory rows
are level-history deltas; evaluation sums them into a current owned/equipped
projection before activating item rules or constructing power loadouts.

Native `UserEdit` containers are parsed and re-emitted as a generated provider
plus recursive typed rule statements. Projection synthesizes stable
character-local content entities and passes them alongside `EvaluationInput`,
so the evaluator executes their rules through the same index and fixed-point
phases as profile content. They are intrinsically source-entitled, affect
regenerated sheet caches, and never become shared pack records.

Commands cover choosing/removing/replacing/retraining occurrences, adding and
removing level frames, effective level and ability changes, inventory, and text.
`CharacterTransaction` provides session undo/redo without mutating persisted
objects. Persistence remains explicit at the application boundary.

## Verified parity and performance

The supplied private level-8 character matches all 72 numeric aliases shared by
the modern evaluation and legacy cached `StatBlock`, including ability-derived
values, typed modifier stacking, defenses, resources, senses, and skills. It
converges in one grant iteration. The immutable full-profile rules index,
known-definition tokens, and compiled prerequisite trees are cached by profile
array identity; per-character prerequisite ownership uses a normalized token
index. On the 38,339-record private pack, a four-pass Silaqui benchmark measures
approximately 5.7 seconds cold and 1.5 seconds warm in the development runner,
versus about 13.1 seconds on every pass before these caches. These are checkpoint
measurements, not final browser budgets.

`EvaluationInput.candidateDetailLevels` provides a presentation-only projection
for interactive builders. Choices outside those levels retain selected and
active candidate decisions required for legality and completeness, while the
requested levels expand their selectable-category candidates. Optional
replacement lists are independently requested through
`candidateDetailReplacementChoiceIds` when their editor opens. Omitting both
fields preserves the exhaustive compatibility/reporting result. With subsequent
category-parser reuse, exhaustive Silaqui evaluation measures approximately 5.1
seconds cold and 1.2 seconds warm; the ordinary level-8 builder projection is
approximately 2.7 seconds cold and 0.45 seconds warm.

The character remains intentionally reported as illegal because its file marks
a house-rule selection and the corpus cannot prove one custom feat
prerequisite. Those are evidence-preserving diagnostics rather than parity
failures. Its ordinary power results also match all 52 comparable cached attack
and damage fields across weapon, implement, and unarmed variants. These two
counts are separate because the legacy `PowerStats` blocks are cached per
power/loadout combination.

Run `pnpm evaluate:matrix PACK.4ecp [CHARACTER.dnd4e ...]` inside the project
Nix environment for JSON-lines reports over multiple legacy characters. With no
character arguments it uses the bundled sample heroes. This matrix is diagnostic:
it records incomplete/illegal imports and every stat/power mismatch rather than
relaxing assertions to make a percentage pass.

The initial nine-character bundled-sample baseline was 494/509 comparable
numeric stat aliases and 219/371 cached power attack/damage fields. The current
checkpoint is 513/514 and 331/371 after projecting legacy alternates, suppressing
duplicate serialized grants, recognizing corpus equipment groups/implements,
consuming category-specific combat stats, and broadening ordinary power
semantics. The latest audit corrected two direct legacy-engine differences:
Versatile damage now requires the serialized
`_INTERNAL_VersatileUsedTwoHanded` choice, and the alternate native `Weapon`
clause wording used by Crushing Blow adds the Constitution modifier for an
axe, hammer, or mace. Native race `Skill Bonuses` and background `Benefit`
specifics now materialize their old merged-database contributions without
duplicating explicit racial bonus grants. Equipped-loadout predicates also no
longer leak onto carried alternate power variants. These samples were created
against unidentified older content and are
cross-profile compatibility evidence, not exact public test fixtures.

An additional ignored eight-character correction corpus exercises a different
compatibility surface. It now converges and completes all seven records with
zero unresolved choices, matches 536/537 comparable numeric aliases and 482/482
cached power fields with no unsupported power branches, and passes seven
regenerated-export semantic re-imports. The eighth record also converges, matches
all 67 numeric aliases and 71 power fields, and passes regenerated semantic
re-import while retaining one incomplete and one legality diagnostic. Those
cache totals remain cross-profile
diagnostics. Hybrid `half-point` rules now combine signed halves within a stat
and truncate before linked-stat consumption, closing the prior surge mismatch.
Native magic-armor composition also adjusts a non-masterwork base through the
recovered light/heavy enhancement table before typed stacking, closing both AC
alias pairs. The one residual numeric difference is retained because its own
serialized feature description and dependent defense contribution contradict
the cached alias. Three legacy skill-power selections also remain explicitly
category-ineligible: current level choices require a class utility, while the
exact pack models skill-power substitution through a separate feat choice. The
public assertions are instead synthetic exact fixtures for contribution
provenance, structural weapon/magic-item identity, uniquely categorized nested
race choices, equipment-channel and weapon-branch semantics, and the recovered
power forms below.

## M4 closure and M5 blockers

M4's exact public matrix spans three tiers and the required build dimensions.
Full evaluation now runs off the main thread. Psionic augment records, common
prerequisites, the observed equipment-selector language, recovery
classification, and ordinary weapon/implement variants are directly covered.

The remaining hand-specific, situational, and named native exceptions are M5
MVP blockers, as are authoritative cache regeneration and edited `.dnd4e`
export. The complete disposition is maintained in
[m4-compatibility-ledger.md](m4-compatibility-ledger.md). M4 is therefore a
completed builder beta, not a claim of complete legacy-builder parity or a
public MVP.

M5's full-profile native workflow audit now verifies that generic choices can
be selected out of order, nested generated-grant providers become durable, and
retraining chains keep prior slots satisfied without dangling replacement
links. Rule-level acquisition controls early-granted power swaps, projection
propagates effective acquisition through legacy-nested descendants, and dynamic
class categories distinguish primary Essentials ancestry from multiclass
markers while binding Hybrid Class records through their explicit `_BaseClass`.
Multi-slot choices reject duplicate siblings.

Human/Fighter, Psion, Shaman, Knight, and a recorded Hybrid Cleric/Fighter path
complete level 30. Every path passes persistence,
authoritative-sheet, and edited-export semantic round-trip gates. Psion and
Knight have zero diagnostics. Fighter and Shaman also reach zero diagnostics
after typed bracketed feat prerequisites and prerequisite-aware retraining
prevent illegal custom-power replacements. A historical Hybrid run preserved
two `prerequisite.unverified` findings but omitted its component IDs, so it
cannot support parser changes. These are deterministic private-profile
workflows, not a claim that every class or named native power exception is
closed.

The recovered fixed-output power branch is partially ported. Bond of Censure
uses native `1d10`/epic `2d10` output, suppresses the conditional prose's
Intelligence modifier, and still receives ordinary implement enhancement.
Exact Brilliant Beacon, Baleful Gaze of the Basilisk, and Contagion hit forms
produce `ongoing 10`. Public same-profile tests cover these forms; other decoded
`SpecialCase` strings report `native-special-case:<power-id>` until their full
components are modeled.

The exact slowed/ongoing hit form that adds Dexterity is also ported as
`ongoing 10+<Dexterity modifier>`. The full private profile can select that
level-5 power through a complete, legal native workflow with no diagnostics;
the generated character remains ignored and is not a public golden.

Ordinary named parsing also preserves Howling Strike's level-scaled extra die
beside its weapon dice, treats Knockdown Assault as ability-only damage without
weapon/enhancement damage additions, and records Call of the Beast's psychic
damage as a next-turn conditional expression rather than an immediate hit.
Exact synthetic fixtures pin all three forms. Unknown prose still takes the
explicit unsupported path.

Power prose naming a `beast's <ability> modifier` is not a character-ability
reference. Such a clause is excluded from ordinary ability math and emits
`companion-ability:<power-id>` until the selected companion occurrence and its
stat block are available to the power evaluator. The private level-9 audit
currently selects a qualifying power but no companion occurrence, so it proves
the blocker rather than the substitution result.

For the M5 automated boundary, unimplemented recovered branches remain visible
as `native-special-case:*`, `companion-ability:*`, `unparsed-hit`, or
`prerequisite.unverified`. These diagnostics are supported outcomes: they do
not authorize a guessed calculation or illegal selection, and the imported
definition plus legacy cache remain available for inspection. Item-set and
inherent-bonus definitions use ordinary evaluation only when a build or import
explicitly activates them; no implicit campaign flag is synthesized.

Power loadouts now consume the durable `_INTERNAL_MainHandWeapon` selection and
project explicit main/off-hand roles plus the paired equipment name without
discarding alternate `PowerStats` variants. The recovered native
`Dual Implement Spellcaster` exception is evaluated by exact feat identity/name:
an implement attack made through the selected equipped main-hand implement adds
the distinct equipped off-hand implement's enhancement to damage, with a named
provenance component. If multiple equipped off-hand implements make that pair
ambiguous, the engine adds no bonus rather than selecting one by inventory
order. Public same-profile fixtures swap two unequal implement
enhancements and require the bonus to follow the hand selection exactly. The
ignored nine-character historical matrix remains cross-profile diagnostic
evidence; it is not used to define these calculations.

Recovered striker features are projected separately from unconditional hit
damage. `Hunter's Quarry`, `Warlock's Curse`, and `Sneak Attack` consume their
evaluated `... Dice` stat, optional flat stat, and generated `... Die` text
override to produce an explainable conditional expression and cadence. Hybrid
feature IDs apply only to powers carrying the corresponding Ranger, Warlock, or
Rogue class category. Sneak Attack additionally requires a recovered eligible
weapon family. Unknown class-feature variants with those names remain in the
power's `unsupported` list instead of inheriting guessed semantics.
