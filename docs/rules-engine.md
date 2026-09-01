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
later level, so future grants do not activate prematurely.

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

## Remaining M4 closure work

- Close advanced power branches: augment/psionic versions, off-hand and dual-
  weapon/implement selection, high-crit and brutal dice, striker additions,
  healing, conditionals, and named power special cases.
- Add focused replacement/retraining selection UI and materialize newly granted
  providers so their nested choices can be edited immediately.
- Close and fixture psionic, Essentials, hybrid, companion, deity, paragon
  multiclass, and remaining equipment/native exception families.
- Build a representative golden matrix across tiers, power sources, equipment
  styles, companions, custom content, advancement, and retraining.
- Decide from browser profiling whether evaluation belongs in a worker and add
  incremental invalidation only if it materially improves interaction latency.
- Regenerate the semantic sheet and edited `.dnd4e` compatibility caches from
  authoritative evaluation; this crosses into M5 export closure.

Until that work passes the M4 exit criteria, this checkpoint is an engineering
vertical slice rather than a claim of complete legacy-builder parity.
