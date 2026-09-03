# Character engine and update lifecycle

## Core model

The runtime separates shared definitions (`RulesElement`) from character
occurrences (`CharElement`). An occurrence has a provider/parent, level, legality,
children aligned to executable rules, and replacement links. A character also owns
level frames, text strings, loot occurrences, field overlays, alternates, choice
objects, stat contribution lists, tallies, and derived caches.

This distinction is mandatory for a web implementation: selecting the same shared
feat definition at two points in history is not the same occurrence, and removing
one provider must not mutate the global definition or another character.

## Fixed-point update

`D20Workspace.Update`/`DoUpdate` rebuild rather than incrementally patch most
derived state. The recovered sequence is:

1. clear completeness/legality results, rule-derived stats, field modifications,
   suggestions, tallies, and calculation caches;
2. restore the six base ability scores and validate point-buy legality;
3. build dynamic category sets from current class/hybrid/counts-as selections;
4. for every level, run exactly two topology/skeleton passes in this order:
   the level's saved-selection root, the character grabbag root on level 1 only,
   and the internal level record (whose rule list also carries user edits); after
   each pass record active elements and rebuild dynamic category options;
5. after those two passes, drain grants deferred to that level, then record and
   rebuild category options once more;
6. execute every active occurrence in the global occurrence list;
7. for every level, execute the grabbag root on level 1 and then the internal
   level record with normal guts enabled;
8. perform a special psionic/augmentable-power pass;
9. rebuild ability and category-option caches;
10. tally inventory and determine equipped effects;
11. record final active-element membership, clear a selected definition that is
    no longer source-entitled, and update every active choice's replacement list,
    legality/selected bitsets, defaults, and completeness state;
12. restart from step 1 when topology changed.

The restart counter fails after it exceeds 30. Because the check occurs after an
`UpdateInternal` call, decompiled control flow can enter a 31st pass before
returning `false`. The original exposes no useful per-iteration convergence
trace in this path. A replacement should impose an explicit bound and add a
diagnostic containing the providers/rules that changed each iteration; it must
not return a plausible partial character.

All caches are scoped to both character and effective level. History mode evaluates
the character as of an earlier level without deleting later acquisition state.

## Leveling and history

`LevelUp(n)` appends level frames and their internal level definitions. `Delevel`
removes/rewinds frames only through explicit user action. `History(level)` changes
the evaluation horizon. Each acquisition remains attached to its original frame,
which enables exact retraining and historical sheets.

Level rules grant ability increases, feats, powers, paths/destinies, and other
choices through the same rule language; do not hard-code the normal level chart in
UI code. The internal level records are data. The engine nevertheless assumes the
supported range is 1–30.

## Choices, completeness, and defaults

Each active `select`/`replace` statement materializes a `D20Choice` tied to a
provider occurrence and rule position. Candidate eligibility includes:

- exact type plus category/dynamic category/level matching;
- source/campaign entitlement;
- statement `requires` and record prerequisites;
- duplicate/existing-selection rules;
- replacement/retraining mode and provider history;
- hard-coded published exceptions.

A saved child in the same positional slot is retained when still eligible. A
selected record that fails prerequisites or category constraints remains selected,
is flagged illegal, and makes the character illegal. The engine clears it in the
separate duplicate check when the same definition is already active elsewhere
(except the rule's default and replacement-source cases), or when the definition
is no longer source-entitled. It does not silently substitute an ordinary user
choice. Defaults and automatic choices may fill slots; native auto-completion is
heuristic and can be random after suggestion and preferred-option passes. A
required active blank slot makes the character incomplete, not necessarily
rules-illegal. A replacement or `existing` choice with no possible occurrence
to lose is specially exempted from incompleteness.

`Choose` itself enforces source entitlement, but it does not require the
candidate's `Legal` bit. The legacy pages normally hide failed candidates; their
Show Illegal/house-rule mode exposes them with `LegalExplanation` and permits a
selection that the next update marks illegal. Loaded custom or missing definitions
use an illegal stub and remain recoverable.

Suggestions highlight candidates and guide native auto-completion. They never
grant directly or change legality, but auto-completion can select a suggested
legal candidate and thereby satisfy a slot.

## Legality

Completeness and legality are independent booleans. Rules legality can be lost by:

- illegal ability score allocation;
- failed record prerequisite or category/level restriction;
- an occurrence explicitly saved as house-ruled;
- a missing definition represented by an illegal stub;
- invalid replacement/retraining or duplicate choice;
- campaign/source/entitlement policy;
- invalid base/enchantment or equipment state;
- a custom record marked as house rule.

The engine retains illegal choices so they can be explained and repaired. The web
domain model should attach structured diagnostics to occurrences and choices rather
than reduce this to one global boolean.

Printed prerequisite prose is never the evaluator. Machine prerequisites include
the compact `requires` grammar and internal prerequisite records recovered from the
database. Show both, but decide legality from the machine form.

## Ability scores

The workspace exposes six score names, base and derived values, modifiers, point
cost, legality, blank detection, and automatic assignment. Base scores are
authoritative character input; racial/level/item effects are stat contributions.
The standard modifier is floor((score − 10) / 2), including correct floor behavior
for values below 10. Point-buy validation and automatic arrays are engine behavior,
not mere form validation.

The exact native `AbilityCost` table for scores 8 through 18 is
`0, 1, 2, 3, 4, 5, 7, 9, 11, 14, 18`. `TotalCost` sums those values and subtracts
10, which makes `8, 10, 10, 10, 10, 10` the zero-spend starting allocation. It
returns invalid for a score outside 8–18 or when more than one score is below
10. `LegalAbilityScores` accepts a nonblank allocation only when `TotalCost` is
exactly 22; it does not reject or rewrite an invalid allocation. The familiar
standard array `16, 14, 13, 12, 11, 10` therefore costs exactly 22 points.

`AbilityScorePage.ScoresComplete` and the house-rule indicator demonstrate that
completeness and point-buy legality are distinct: an explicitly entered rolled
or custom array may be complete while remaining house-ruled. Racial bonuses and
level increases operate on derived scores/contributions, while `score_base` is
the point-buy input serialized in `CharacterSheet/AbilityScores`.

## Stats and explanations

Each stat stores aliases and a list of contributions with provider, type,
conditions, linked stat, and flags. Calculation is lazy/cached per effective level.
Cycle protection is required for linked stats. Return both the final value and an
explanation containing applied and suppressed contributions; the legacy
`CharacterSheet/StatBlock` demonstrates this model.

Typed stacking, conditional buckets, ability-modifier links, and string stats are
specified in `04-rule-language.md`. Field `modify` overlays must be active before
power/item calculations consume record fields.

## Loot and equipment

Inventory entries combine base item, optional enchantment, quantities, equipped
quantity, optional custom name/weight/damage/silver/power-card fields, augmentation,
notes, level acquired, and house-rule state.

Compatibility operations include:

- validate base/enchantment pairing and item level;
- compute price/currency and weight;
- add/remove quantities and independently equip quantities;
- enforce slots, two-handed/double weapon, dual-wield, shield, implement, ki focus,
  holy symbol, and alternate-slot behavior;
- auto-equip, auto-select magic items, and auto-calculate gold;
- evaluate proficiency and item-set counts/benefits;
- support custom loot and custom rituals;
- expose equipment selectors to `wearing`/`not-wearing` stat rules.

Equipping changes derived rules and therefore triggers a full fixed-point update.

## Power calculations

Power statistics are a function of `(character, power, weapon-or-implement,
calculation flags)`. The engine selects valid weapon/power combinations and
defaults, then computes attack bonus, defense, damage, keywords, components,
critical data, and conditional text. A power may have multiple augment versions;
psionic classes unlock them specially.

Do not persist one attack/damage number as primary state. Recompute each legal
combination and serialize it under `PowerStats` as an export cache.

## User edits and house rules

The engine supports per-level user edits that add a stat bonus, grant a record,
create a free selection, or drop a record, each with a comment. It also supports a
grabbag of unleveled elements, custom items/rituals, field overrides, and explicit
house-rule legality. These are first-class compatibility features, not malformed
input. Keep them namespaced from official definitions and visibly identify their
provenance.

## Determinism requirements

Given ordered game data, campaign, and authoritative character state, evaluation
must be deterministic. Use stable occurrence IDs internally, ordered child slots,
ordered contribution lists, and explicit fixed-point phases. Never depend on hash
map iteration, database row order without an ordinal, locale collation, or wall
clock time.
