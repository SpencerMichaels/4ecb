# M4 compatibility ledger

## Purpose and acceptance boundary

M4 is the builder-beta milestone. It establishes one authoritative, editable
rules model and records every known compatibility risk; it is not the public MVP.
The approved roadmap assigns closure of blocking parity findings to M5.

Two kinds of evidence must not be conflated:

- Same-profile goldens evaluate a build and content definitions made for one
  another. These are pass/fail tests and must match exactly.
- Historical `.dnd4e` caches do not identify the exact content snapshot that
  produced them. Comparing them with the later supplied corpus is diagnostic.
  A difference may be an engine defect, published erratum, or removed internal
  record. It is never silently treated as an exact same-profile golden.

An imported historical character remains useful regardless: its original XML
and cached sheet survive losslessly, while authoritative editing begins only
against an explicitly bound content profile. M5 owns migration preview and
explicit profile adoption.

## Recovered behavior ledger

| Family                             | M4 disposition                            | Evidence or M5 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule statement IR                  | Implemented                               | Every opcode and attribute in 54,012 statements is audited; parser/evaluator fixtures cover every recovered form.                                                                                                                                                                                                                                                                                                                                                                                        |
| Dynamic class categories           | Implemented                               | Class, hybrid, class-descended versus multiclass `CountsAsClass`, Hybrid `_BaseClass`, `PowersAsClass`, paragon multiclassing, universal skills, Diverse Study, Seeker, Versatile Master, and custom feat/power bypasses have direct fixtures.                                                                                                                                                                                                                                                           |
| Fixed-point grants and choices     | Implemented                               | Automatic grants converge, serialized grants deduplicate, generated nested choices materialize durably, and invalid/incomplete choices remain editable.                                                                                                                                                                                                                                                                                                                                                  |
| Advancement and replacement        | Implemented                               | Level frames, effective level, start-above-1 imports, ordinary retraining, power swaps, replacement provenance, and undo/redo are covered.                                                                                                                                                                                                                                                                                                                                                               |
| Psionic versions                   | Implemented                               | An augmentable parent activates and deduplicates the corpus `_AugmentVersions` records, so every augment gets its own calculation.                                                                                                                                                                                                                                                                                                                                                                       |
| Essentials and hybrid data paths   | Implemented with recorded risk            | Full-profile Knight reaches level 30 with zero diagnostics. The historical Hybrid 68-choice/two-unverified report omitted its component IDs and is not reproducible; a recorded Hybrid Cleric/Fighter path reaches level 30 with 65 choices, eight retrainings, and zero diagnostics. Alternate class/build records, automatic grants, explicit base-class aliases, talent choices, and sibling duplicate suppression use the generic evaluator. Broader per-build differentials remain future evidence. |
| Companions and deities             | Implemented with recorded risk            | Companion ownership/stat rules and ordinary companion prerequisites are evaluated; deity names/domains and Channel Divinity-style alternatives are structured predicates. Beast-ability prose does not substitute the character's ability and reports `companion-ability:<power-id>`. A private audit selects a beast power but no companion occurrence, so score substitution remains outside the M5 supported boundary pending an exact activation artifact.                                           |
| Natural-language prerequisites     | Implemented with safe fallback            | Ability, level/tier, training, power source, class/hybrid class, identity, bracketed typed feat/power references, negation, proficiency, deity/domain, multiclass markers, and alternatives are evaluated. Unknown prose remains editable and reports `prerequisite.unverified`; M5 never converts uncertainty into legality.                                                                                                                                                                            |
| Equipment predicates               | Implemented for observed serialized forms | Armor/shield, weapon category/property and negation, slot, only-weapon, versatile, dual wielding with distinct operands, dual shields, defensive, implements, holy symbols, ki focuses, staves, and compound selectors have fixtures. Item-set/inherent rules execute when imported or serialized content activates them; no artifact supports synthesizing the native campaign fallback.                                                                                                                |
| Ordinary power math                | Implemented                               | Ability/half-level, proficiency, enhancement, category/power stat channels, heavy thrown, weapon-as-implement damage, multiple abilities, fixed and `[W]` dice, primary attacks, level lines, ongoing damage, magic criticals, high crit, brutal metadata, recovery classification, and effect-only calculations are explainable.                                                                                                                                                                        |
| Hand-specific and named power math | Supported with explicit tail diagnostics  | M5 projects saved hand pairs, implements `Dual Implement Spellcaster`, and projects quarry/curse/sneak attack conditionally. The fixed-output slice covers Bond of Censure, fixed ongoing-10 forms, and the Dexterity-modifier branch. Same-profile public differentials cover each branch; Hu is 52/52. Unknown striker variants and five identified native special entities remain recoverable with explicit diagnostics.                                                                              |
| Performance placement              | Implemented                               | Full evaluation runs in a dedicated worker that loads the immutable pack once. The main thread projects commands and renders returned authoritative values; it contains no alternate formulas.                                                                                                                                                                                                                                                                                                           |

## Representative golden matrix

`packages/rules-engine/src/golden-matrix.test.ts` is distributable and exact. It
covers:

1. a heroic Human/Fighter martial build with two weapons and an equipped
   dual-wielding predicate;
2. a paragon Kalashtar/Psion build with augment versions and an enhanced
   implement; and
3. an epic Wilden/Shaman build with a companion, a historical retraining link,
   an enhanced totem, and visible house-rule content.

Together with command/history, expression, prerequisite, equipment, and named
exception fixtures, the matrix verifies selections, completeness/legality,
statistics, attacks, power variants, equipment, advancement, and retraining.

## Historical diagnostic baseline

Against the supplied later content pack, the nine bundled legacy heroes match
501/509 comparable numeric aliases and 277/371 cached attack/damage fields. Run:

```sh
pnpm evaluate:matrix tmp/content/full-local.4ecp
```

The residual clusters are dominated by old-versus-current power dice and feat
tier values, removed internal definitions, hand-specific weapon calculations,
and named native power exceptions. This baseline is a regression signal: M5 may
improve it, but must not reduce a same-profile golden merely to imitate a cache
created by a different content revision.

The first M5 hand-selection slice keeps that historical comparison at 501/509
numeric aliases and 277/371 cached power fields. It is evidence that explicit
pairing did not perturb the diagnostic baseline, not proof of same-profile hand
parity; the exact public hand/dual-implement differentials are the pass/fail
evidence for this slice.

The next M5 slice preserves those 501/509 and 277/371 historical totals while
reporting conditional damage separately: the nine unknown-revision samples
project 67 variants, comprising 48 Hunter's Quarry and 19 Warlock's Curse
variants. Drizzt's diagnostic projection is `3d8` once per round, consistent
with its cached condition text, but that agreement is not relabeled as a golden.

The fixed-output `SpecialCase` slice also preserves the historical totals. Its
separate exact-profile Hu diagnostic moves from 49/52 to 52/52 cached power
fields by removing an incorrectly inferred Intelligence modifier from Bond of
Censure; the supplied +1 implement enhancement remains. The comparison retains
its existing legality diagnostics and does not discard evidence.

A separate ignored seven-character correction corpus is also diagnostic rather
than golden evidence. After provenance deduplication, structural cached-variant
matching, unique nested race-choice recovery, and three exact named power
forms, all seven records converge and complete with zero unresolved choices.
Recovered equipment channels, weapon-specific bonuses, attack-branch choice,
literal native output, Versatile handling, and weapon-slot keywords bring the
power diagnostic to 411/411 cached fields with no unsupported powers. The
numeric diagnostic is 469/470 after implementing the recovered hybrid
`half-point` boundary and native `EssentialsMagicArmor` base adjustment. Seven
regenerated edited exports pass semantic re-import. The one residual numeric
difference is internally inconsistent; three older skill-power selections
remain category-ineligible under both the current level rules and the recovered
native category matcher. These findings are preserved because the files'
originating content revisions are not established.

## M4 exit-criterion mapping

- Rule-language coverage is enforced by the corpus audit and direct parser,
  expression, evaluator, and stat tests.
- Every recovered native exception family is implemented or has an explicit
  diagnostic boundary and exact-evidence resolution mechanism.
- The public cross-tier matrix and command tests cover the required build,
  advancement, companion, equipment, custom-content, and retraining dimensions.
- Exact same-profile goldens pass; unbound historical caches use the separate
  diagnostic contract.
- React consumes worker evaluation and does not own calculation formulas.
- Missing definitions, unresolved choices, house rules, failed prerequisites,
  and unverified prose remain visible and editable with provenance diagnostics.

This satisfies M4's builder-beta boundary. M5 adopts the documented explicit
diagnostic target above; only the manual original-builder export matrix remains
outside automated closure.
