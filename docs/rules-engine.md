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
3. Materialize choice/replacement slots and evaluate structural constraints.
4. Apply stat operations, typed stacking, aliases, text values, and overlays.
5. Evaluate every candidate's internalized `Prereqs` expression against the
   projected character at that choice's acquisition level, then recheck selected
   elements at that same historical boundary and emit
   recoverable legality diagnostics.
6. Return values with provenance, completeness, legality, and diagnostics.

The full local corpus contains 54,012 statements across 38,339 entities. The
audit recognizes every observed opcode and attribute with no unexplained
required field. Public tests use synthetic content; private files remain ignored.

The recovered proficiency grammar includes `Can use the X implement`. The
prerequisite internalizer resolves that form to the concrete `Proficiency`
definition named `Implement Proficiency (X)` and emits an element prerequisite,
so ownership satisfies it while a known but unowned proficiency fails normally.
This also preserves corpus spellings such as `Ki focuses`: case-insensitive exact
definition resolution maps all nine observed implement names across 41 records
to one existing proficiency definition each. The original executable `Prereqs`
text remains authoritative; parallel `print-prereqs` display prose is not used
as an evaluator substitute.

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
removing level frames, effective level and ability changes, alternate-slot
spellbook choices, inventory, and text.
`CharacterTransaction` provides session undo/redo without mutating persisted
objects. Persistence remains explicit at the application boundary.

Legacy `<alternate>` entries are not generic bonus ownership when their provider
and `SelectName` resolve. Projection matches the provider definition, finds the
select rule whose `spellbook` attribute names that slot, and emits the alternate
as that choice's selected occurrence at the rule's effective level. This mirrors
the recovered native `ParseAlternate` → `FindProvider` path while leaving the
durable alternate envelope intact for exact export. Unresolvable envelopes
remain grabbag occurrences so malformed or custom evidence stays recoverable.

Duplicate-choice cleanup is evaluated at the choice's own effective level, as
the native `CheckPrevious` → `AlreadyHas` path does. An occurrence acquired at a
later level therefore cannot retroactively empty an earlier slot. This matters
for `existing="true"` features such as Adroit Explorer's Ambitious Effort: the
later feature preserves a second occurrence of an already-known encounter power
so its `_ADDITIONAL_USES` modification can apply, while the original level-3 or
level-7 power remains the resolved source choice. Active-definition membership
still collapses by definition; occurrence topology does not.

Prerequisites follow the same acquisition-level boundary. A choice at level X
sees the character projected through level X, including ability increases,
training, and other features acquired at X, but never receives credit for a
selection acquired at X+1 or later. Consequently a level-4 Dexterity increase
can satisfy a level-4 feat's Dexterity prerequisite, while a level-8 increase
cannot retroactively legalize that feat. Both candidate availability and saved
selection diagnostics use this boundary. The evaluator caches bounded
context-only snapshots by immutable profile and exact build prefix, so edits at
later levels reuse unaffected earlier prerequisite contexts.

Replacement gain candidates follow the replacement rule's mode. In particular,
`powerswap` supplies the gain category used by the native
`UpdateReplacement` path; it is not validated against the displaced power's
older select category. The prior select remains satisfied through the linked
replacement chain, while legality is decided by the active replacement slot.
Ordinary retraining continues to inherit its source select until its distinct
mode rules are implemented from equivalent evidence.

`power-replace="GAIN:LOSE"` is its own mode (native `PowerReplaceCategory`,
`ChoiceMatch`, `BuildReplaceList`, `CheckReplaceElem`). GAIN names the one
Power gained: an exact, case-insensitive name, an ID, or "Name Power". LOSE is
an ordinary category string that an owned power must match to be lost. There
is no class restriction unless LOSE names one. A bare level `N` means level N
or lower, and `N+` means N or higher. The power may be held at the swap's own
level, but not if another multiclass or power-replace swap gained it. The gain
belongs to the swap's provider; it does not take over the lost power's slot.
If GAIN names no power, the swap offers nothing. A GAIN starting with `$`
(Secrets of Belial's `$$NOT_CLASS`) is a choice instead: any power matching
`GAIN,LOSE` at the lost power's level or lower. Two native behaviours are not
reproduced. Only chosen powers can be lost here, while native also allows
granted ones. The hybrid `CheckHybridPower` limit is also missing.

A power's level for category matching is its Level field, or else, when the
record has no Level field at all, the bare number in its `<Category>`, which is
where native reads it. An empty Level field stays level 0, as before. Two power
records have only the category number: Power Strike and Backstab. They become
choosable in a regular class encounter slot once their prerequisite feat is
owned (Powerful Strike, Thief's Backstab). This is how the legacy builder
offers them. Where the two values disagree (four records), the Level field
wins.

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
fields preserves the exhaustive compatibility/reporting result. With
acquisition-level prerequisite snapshots enabled, the development runner
measures Silaqui at approximately 7.8 seconds cold and 1.6 seconds warm for the
exhaustive diagnostic, and 4.8 seconds cold and 0.55 seconds warm for the
ordinary level-8 builder projection. The browser's application-level exact
evaluation cache still bypasses unchanged projections entirely.

That exact cache now survives a document restart. Its SHA-256 key covers the
rules-cache semantic version, exact pack ID/content digest, and canonical
`EvaluationInput`, including candidate and power-output projections. Entries
are disposable, shape-checked, bounded by least-recent use, and isolated from
durable character/backup storage; any read, validation, deletion, or quota
failure falls through to the worker. Exhaustive candidate evaluations are not
persisted. The worker validates only the pack manifest during initialization,
then shares one lazy full-pack decode across concurrent misses, so a persistent
hit does not pay the former duplicate worker decode.

Advance `RULES_EVALUATION_CACHE_VERSION` for changes to evaluated math, input
semantics or output projections, even when added output fields are optional.
Shape validation cannot distinguish an older otherwise-valid power record
missing newly computed metadata. The effective basic-attack flag projection
uses v9 (`evaluated-character-v9-2026-10-16-effective-basic-attack-flags`);
runtime regression tests require pre-v9 cached powers to miss and recompute.
Fresh command-line evaluations alone do not validate a browser cache upgrade.

Builder routes explicitly request full candidates only where a selectable UI is
visible: the chosen Build level or the Character details choice levels.
Overview, Equipment, and Diagnostics retain topology, selected candidates, and
legality without expanding catalogs. A distinct selected/current Build horizon
still requests its visible level so level-local ability controls remain
complete. The editor does not consume `EvaluatedCharacter.powers`—its power
detail cards use content entities—so editor requests omit attack/loadout
materialization. Authoritative sheets continue to request powers while omitting
unused choice catalogs, and omission of `includePowers` remains compatibility
equivalent to `true` for every other caller.

Browser performance entries named `4ecb:*` cover character-record readiness,
main-thread content readiness, build projection, worker readiness, worker
content load/evaluation/round-trip, evaluation source (worker or persistent
cache), and the first returned character evaluation. These diagnostics are
best-effort and never affect loading behavior.

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

The standing check is
`pnpm parity:baseline [--pack PACK.4ecp] [--accept] [--jobs N]`. It
evaluates the player characters in `sample-chars/` and the SampleHeroes on a
pool of worker threads (cores, capped by available memory; output is the
same for any job count), writes `tmp/parity/latest.json`, and diffs per-character
match counts and mismatch keys against the accepted
`tmp/parity/baseline.json`. It exits 1 on any new key. Run it after an
engine or content change, then `--accept` once each new difference is
fixed or classified in `docs/implementation-status.md`.

The initial nine-character bundled-sample baseline was 494/509 comparable
numeric stat aliases and 219/371 cached power attack/damage fields. The current
checkpoint is 513/514 and 331/371 after projecting legacy alternates, suppressing
duplicate serialized grants, recognizing corpus equipment groups/implements,
consuming category-specific combat stats, and broadening ordinary power
semantics. The latest audit corrected two direct legacy-engine differences:
Versatile damage now requires the serialized
`_INTERNAL_VersatileUsedTwoHanded` choice, and the alternate native `Weapon`
clause wording used by Crushing Blow adds the Constitution modifier for an
axe, hammer, or mace. Background `Benefit` text is display-only too
(2026-10-19): the native engine never reads it, and parsing it double-counted
real rules (Luskan Benefit, the Shifter backgrounds), applied conditional
bonuses ("+5 to Endurance checks made due to thirst") unconditionally, and
invented a `skill Misc` stat. Bundled hero Japheth's Streetwise +2 came from a
`statadd` on the Baldur's Gate element itself in older content; the current
Forgotten Realms regional backgrounds carry no rules. Race `Skill Bonuses` text is display-only
(2026-10-19): the native engine never reads that field, every race grants its
bonuses through `<Skill> Bonus` racial traits, and parsing the text invented
stats such as "to choice of one other Misc" (Kalashtar, Shardmind) and gave
Moon/Sun Elf eladrin the standard Arcana/History bonuses on top of their
chosen ones. The parser had masked a projection defect: saved grant children
were matched to their parent's grant rules by position, so a record saved
against older content (bundled heroes Omin Dran, Binwin Bronzebottom) shifted
onto the wrong slots and suppressed current grants such as Diplomacy Bonus.
Saved grant children now first claim the grant whose target they are
(`assignChildSlots`); a child whose categories name an unclaimed container
grant becomes that container's selection (Bonus At-Will Power under Human
Power Selection, Dilettante under Half-Elf Power Selection); others keep their
own position if free and of the select's exact type, else take the first free
select of their type (2026-10-23: an older Deva save's Elven no longer fills
the newer Race Ability Bonus select; native `CopyLoadedChoice` would drop it).
A saved child no slot can take stays owned, fills no choice and raises the
`occurrence.unslotted` warning. Aeofel's
Arcana/History remain short because current content moved them behind the
Eladrin Subrace choice his record never made. Defense-keyed damage stats (`will:damage`, e.g. Resplendent
Gloves) apply to powers that target that defense, as legacy Hold Foe shows.
Equipped-loadout predicates also no
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

A dice-less damage expression (the hit text up to its first " damage", with no
sentence ending before it) that starts with an ability modifier or a number is
flat damage, as native `CalcDamage` computes it: Staggering Note's "Charisma
modifier thunder damage" is the bare modifier, Well of Shadows' secondary "5 +
Charisma modifier necrotic damage" 5 plus it (a later "ongoing" rider does not
replace it). Native `IsDamageRoll` is false for it, so
the weapon's enhancement, `damage rolls`, `:damage` keyword stats and
versatile do not apply; `damage` and `:nonroll-damage` do (the latter also for
damage rolls), and striker reminders still attach.

A "your level + N vs. X" attack line is the attack bonus alone (plus bonuses
keyed to the power). When the power is a summoned creature's (the Summoning
keyword, or a stat block naming a "Summoned Creature") it is a fixed-bonus
creature under D095: attack and damage add the creature's `ALLY.`,
`COMPANION.` and `SUMMON.` stats (`attack rolls`; `damage`, and `damage rolls`
for a damage roll) and power-keyed stats, but none of the summoner's weapon,
implement, keyword or character-wide bonuses. Its damage keeps the dice, the
named ability modifiers and flat terms. Other "your level + N" powers made by
the character (Wyrm Form Basic Bite, Breath Weapon, boons) keep ordinary
damage.

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
`Dual Implement Spellcaster` exception is evaluated by exact feat identity/name
and applies only to powers whose Keywords include both "implement" and
"arcane". A row adds a different equipped implement's enhancement to damage,
with a named provenance component: the main-hand row pairs with the single
off-hand implement (no bonus if several make it ambiguous), an off-hand row
pairs with the main-hand item, and with no hand selection each row uses native
`DetermineOffhand` (the first other equipped weapon or non-ki-focus implement;
`legacyOffhand` in `powers.ts`). A non-weapon item with `_ImplementEquiv`
(e.g. an instrument) is an implement, as in native `LootImplement`. Public
same-profile fixtures swap two unequal implement enhancements and require the
bonus to follow the hand selection exactly; the private `oleander_9` sample
matches legacy on every arcane implement row.

A parenthesized stat limiter (`implement:damage(<name>)`) matches the row's
base, its enchantment, or the augment bound to the row's item through the
loot `augment` override (native `CalcKeywords` + `FindLoot`). Binding only
arrives through import; there is no builder control for it yet.

Owned loot executes like native `EquipLoot`/`ShouldExecute`: a holding runs
its rules when equipped, or when owned and its base has an empty `Item Slot`
or a non-empty `_AlwaysExecute`. Its enchantment runs with it unless an
equipped Arms-slot base already occupies the arms slot and the enchantment is
also Arms. Each definition runs once across holdings. Executing is not
equipping: `wearing`/`not-wearing` predicates and weapon/implement rows still
require an equipped holding (`lootExecutes`/`executedLoot` in `evaluator.ts`).
The ignored nine-character historical matrix remains cross-profile diagnostic
evidence; it is not used to define these calculations.

Power combat-stat selection follows native `CalcKeywords`/`IsKeyword` for
comma-conjoined keyword predicates and `IsLimiterName` for parenthesized base/
enchantment names. Each attack phase supplies its own target defense; power
keywords qualify damage. Thus authored channels such as
`implement,will:attack(Synthetic orb)` and
`implement,Fire:damage(Synthetic orb)` contribute only to the matching implement
variant and attack/power context. Contributions must already be applied by the
evaluator, preserving training requirements, conditions and tier-scaled values;
no second formula is synthesized from descriptive property names. Matching
channels share typed bonus maxima and deduplicate contribution provenance —
one maximum per row (native `att_type_max`/`dmg_type_max`), so an implement
power used through a pact blade applies one maximum across its implement- and weapon-path
bonuses: the blade's transferred off-hand enhancement and Dual
Implement Spellcaster's do not stack.
Equipment's `Weapon` category does not turn an Implement power into a Weapon
power. Unenchanted Superior Implement bases also appear as implement variants.
This resolves the executable rules behind Undeniable/Unerring/Unstoppable and
Energized, whether those rules live on the base or its training feat. Their prose
reminders are omitted, while original item rules remain available. Evaluation
cache v8 invalidates pre-fix totals.

Attack phases now retain their own ordered Hit field, optional attack-type
override, evaluated damage components/expression, immediate damage type, and
explicit main/off-hand role. The same damage parser and recovered exception,
enhancement, typed contribution, and dual-implement rules are reused per phase;
the existing power-wide primary cache remains the legacy export projection.
Compound types preserve authored `and`/`or` connectors. Ongoing and other rider
damage stays in authored prose rather than being added to the immediate-hit
summary. Companion phases are unavailable and retain `companion-ability:*`
diagnostics, including when the companion appears only in a secondary attack.
Equipped roles determine phase eligibility for the sheet's comparison table;
inventory alternatives remain available as hypothetical loadouts.

Recovered striker features are projected separately from unconditional hit
damage. `Hunter's Quarry`, `Warlock's Curse`, and `Sneak Attack` consume their
evaluated `... Dice` stat, optional flat stat, and generated `... Die` text
override to produce an explainable conditional expression and cadence. Hybrid
feature IDs apply only to powers carrying the corresponding Ranger, Warlock, or
Rogue class category. Sneak Attack additionally requires a recovered eligible
weapon family. Unknown class-feature variants with those names remain in the
power's `unsupported` list instead of inheriting guessed semantics.
