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
4. for every level, run two topology/skeleton passes over the level record, saved
   user edits, and its element tree; record active elements and drain deferred
   grants after each pass;
5. execute non-level/grabbag character elements;
6. for every level, execute full rules with normal guts enabled;
7. perform a special psionic/augmentable-power pass;
8. rebuild ability and category-option caches;
9. tally inventory and determine equipped effects;
10. record final element ownership, validate children and choices, erase choices
    whose providers are no longer owned, and update selection state;
11. mark the character incomplete for any unresolved active nonoptional choice;
12. restart from step 1 when topology changed.

The restart loop is capped at 30 iterations. A replacement should expose failure
to converge as a diagnostic containing the providers/rules that changed each
iteration; it must not return a plausible partial character.

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

A saved child in the same positional slot is retained when still eligible. If it
is no longer eligible, it is flagged illegal or cleared according to the rule mode;
the engine avoids silently substituting another user choice. Defaults and automatic
choices may fill deterministic slots. A required active blank slot makes the
character incomplete, not necessarily rules-illegal.

Suggestions rank or highlight candidates but never satisfy a slot.

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
