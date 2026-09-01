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
3. Materialize choice/replacement slots and structurally eligible candidates.
4. Apply stat operations, typed stacking, aliases, text values, and overlays.
5. Check prerequisites for selected elements against the final evaluated state.
6. Return values with provenance, completeness, legality, and diagnostics.

The full local corpus contains 54,012 statements across 38,339 entities. The
audit recognizes every observed opcode and attribute with no unexplained
required field. Public tests use synthetic content; private files remain ignored.

## Authoritative character history

`CharacterBuild` stores effective level, one nested root per acquired level,
grabbag occurrences, inventory, alternates, base abilities, and text strings.
Every occurrence has a character-local ID, definition identity, acquisition
level, legality marker, children, and optional replacement link. Imported trees
are mapped against all provider slots even when those slots activate only at a
later level, so future grants do not activate prematurely. Legacy inventory rows
are level-history deltas; evaluation sums them into a current owned/equipped
projection before activating item rules or constructing power loadouts.

Commands cover choosing/removing/replacing/retraining occurrences, adding and
removing level frames, effective level and ability changes, inventory, and text.
`CharacterTransaction` provides session undo/redo without mutating persisted
objects. Persistence remains explicit at the application boundary.

## Verified parity and performance

The supplied private level-8 character matches all 72 numeric aliases shared by
the modern evaluation and legacy cached `StatBlock`, including ability-derived
values, typed modifier stacking, defenses, resources, senses, and skills. It
converges in one grant iteration. Indexed category values keep a complete
evaluation at roughly 1.5 seconds in the development runner on the full pack;
this is a checkpoint measurement, not a final browser budget.

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
checkpoint is 501/509 and 277/371 after projecting legacy alternates, suppressing
duplicate serialized grants, recognizing corpus equipment groups/implements,
consuming category-specific combat stats, and broadening ordinary power
semantics. These samples were created against unidentified older content and are
cross-profile compatibility evidence, not exact public test fixtures.

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

Human/Fighter, Psion, Shaman, and Knight paths complete level 30, while a
two-component Hybrid path completes level 10. Every path passes persistence,
authoritative-sheet, and edited-export semantic round-trip gates. Psion and
Knight have zero diagnostics; Fighter, Shaman, and Hybrid preserve only visible
`prerequisite.unverified` prose. These are deterministic private-profile
workflows, not a claim that every class or named native power exception is
closed.
