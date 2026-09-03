# Executable rule language

`RulesElement/rules` is an ordered declarative program. There are exactly nine
statement names in the supplied engine; names and attributes are read
case-insensitively. Unknown statements are not a safe extension mechanism: retain
them for round trips, warn, and do not silently assign semantics.

| Opcode | XML statement | Purpose |
|---:|---|---|
| 0 | `statadd` | Add a numeric/string contribution. |
| 1 | `textstring` | Set/append character text. |
| 2 | `statalias` | Give a stat another lookup name. |
| 3 | `grant` | Add a specific record as a child occurrence. |
| 4 | `drop` | Remove/suppress an owned record or selection. |
| 5 | `select` | Create one or more user choices from a filtered type/category. |
| 6 | `replace` | Replace/retrain/power-swap an occurrence. |
| 7 | `suggest` | Add a nonbinding recommendation. |
| 8 | `modify` | Override or append a field on matching records. |

Every statement may be level-bounded by the parser's internal minimum/maximum
fields. In serialized data this is normally `Level="n"` or `Level="min-max"`.
Missing bounds mean levels 1 through 30. Rule order and placeholder position are
observable and must be retained.

## Observed grammar matrix

This table is exhaustive for the 27,240-record official corpus. Counts in
parentheses are attribute occurrences, useful for detecting parser/import
regressions. Required means present on every official occurrence; custom parts may
use case variants.

| Statement (count) | Required attributes | Optional observed attributes | Nonempty bodies |
|---|---|---|---:|
| `statadd` (12,584) | `name`, `value` | `type` (7,761), `condition` (1,706), `requires` (1,216), `wearing` (104), `zero` (74), `non-zero` (64), `not-wearing` (51), `half-point` (34), `statmin` (2) | 0 |
| `textstring` (1,013) | `name`, `value` | `condition` (55), `requires` (5) | 0 |
| `statalias` (10) | `name`, `alias` | — | 0 |
| `grant` (9,280) | `name`, `type` | `Level` (3,424), `requires` (146) | 0 |
| `drop` (4) | target form | `name` + `type` (2 each), or `select` (2) | 0 |
| `select` (668) | `type`, `number` | `Category` (596), `Level` (83), `name` (61), `spellbook` (49), `optional` (35), `existing` (32), `Prepare` (31), `requires` (19), `default` (9), `grant` (1) | 12 |
| `replace` (303) | mode-dependent | `optional` (281), `Level` (191), `multiclass` (181), `name` (110), `power-replace` (74), `retrain` (29), `powerswap` (19), `requires` (10) | 1 |
| `suggest` (1,687) | `name`, `type` | — | 0 |
| `modify` (1,738) | `Field`, target, mutation | `value` (1,427), `name` (1,356), `type` (800), `list-addition` (306), `requires` (61), `select` (33), `die-increase` (5) | 0 |

For `modify`, target is `name` with optional `type` or a named `select`; mutation is
one or more of `value`, `list-addition`, and `die-increase`. For `replace`, the
attributes themselves select the replacement mode; no `type` attribute occurs in
the official corpus. Meaningful `select`/`replace` body text supplies a choice name
or label. Meaningful free text inside `<rules>` must also be retained even when it
is not attached to a recognized statement; 15 supplied merged records contain it.

## Two evaluation passes

The engine first performs a **skeleton pass**, concerned with character topology:
`grant`, `drop`, `select`, and `replace` create or align child slots. It later
performs a **full pass**, applying stats, text, modifications, and suggestions while
also finalizing topology. This prevents ordinary stat order from deciding which
choices exist. The whole update is repeated to a fixed point; see
`05-character-engine.md`.

## Shared `requires` expressions

`requires` is a compact predicate over currently active character elements.

- A leading `!` negates the entire following expression.
- If the current expression contains any `|`, it is split as OR.
- Otherwise it is split on `&` as AND.
- A token surrounded by one outer pair of parentheses is evaluated recursively.
- A bare token asks whether an active record with that name/ID is owned.
- `Type:Categories` scans active records of `Type` and succeeds when one matches
  the category expression.
- Names, types, and operators' operands are compared case-insensitively.

This is **not conventional precedence**. At a recursion level, the existence of
any `|` makes that entire level an OR list. Parentheses are required to express
mixed grouping. Implement a compatibility parser, not a JavaScript/Python boolean
expression evaluator.

Examples (synthetic):

```text
Feature A&Feature B       both are required
Feature A|Feature B       either is sufficient
Feature A&(!Feature B)    A and not B
Power:Arcane,Encounter    an owned Power in both categories
```

When checking a provider's own rule, the engine can exclude that occurrence to
avoid self-satisfying prerequisites.

## Element `Prereqs` and the internal prerequisite tree

`RulesElement/Prereqs` is executable input, despite resembling English in some
records. It is distinct from `print-prereqs`, which is display text. At database
load, `D20RulesEngine.InternalizePrereqs` parses `Prereqs` once and stores a
native `Prereq` tree on the rules element; the public accessor is named
`RulesElement_internal_prereqs`, and the binary also names this field
`_INTERNAL_PREREQS`. The tree is derived runtime state, not a second XML field
that content-pack ingestion can copy directly.

The confirmed connective grammar is:

- semicolon-delimited blocks are joined with AND;
- top-level commas and the word `and` ordinarily join items with AND;
- a comma followed by `or` changes a comma-delimited list to OR, so
  `A, B, or C` means any one of the three;
- top-level `or` also creates an OR branch;
- parentheses protect nested separators.

Individual tokens are internalized rather than compared as prose. Exact names
and internal IDs resolve to `RulesElement` pointers; known prefixes and suffixes
limit the record type; levels, tiers, abilities, class/power-source tests,
training, proficiency, and other recognized phrases become value or predicate
nodes. Unrecognized tokens resolve to an illegal stub, so uncertainty is not
treated as eligibility. `CheckLegality` recursively evaluates the resulting
AND/OR tree against owned elements and the relevant character level.

The feat UI consumes that result through `choice.Legal(index)`: by default it
adds only legal and owned candidate records, while its `ShowIllegal` toggle also
adds failed candidates and displays `LegalExplanation`. This is the legacy
behavior the modern **Show unavailable options** control mirrors.

Evidence: recovered methods `InternalizePrereqs`, `InternalizeBlock`,
`InternalizeOr`, `InternalizeElement`, `CheckPrereq`, and `CheckLegality` in
`D20RulesEngine.dll`, plus `FeatPage.DisplayFeatTree` in
`CharacterBuilder.exe`. The original Arcane Admixture IV record corroborates
the field split: `Prereqs` contains `Arcane Admixture III,11th level, any arcane
class; Paragon Tier`, while its parallel `print-prereqs` is for presentation.

## Category expressions

Ordinary category constraints are comma-separated AND groups. Within a group,
`A|B` is OR. Prefixing an entry with `!` negates it. Entries resolve to category
records by ID or name. A record matches itself and every category in its
`Category` list.

Numeric entries constrain record level:

- `7`: exact level (for powers/items the engine applies special level rules);
- `7+`: level at least 7;
- `7-7`: exact-level form that additionally controls scalable-item matching;
- `$$LEVEL`: use the character's current level.

Dynamic prefixes, when first in the category string, filter against character
state before ordinary categories:

| Prefix | Meaning |
|---|---|
| `$$CLASS` | Belongs to a selected character class. |
| `$$HYBRID` | Belongs to selected hybrid-class categories. |
| `$$NOT_CLASS` | Does not belong to a selected class. |
| `$$MULTICLASS` | Belongs to multiclass-derived class categories. |
| `$$CLASS_OR_MULTICLASS` | Belongs to either selected class set. |
| `$$LEVEL` | Substitute current character level. |

Matching includes recovered exceptions for universal class skills, Seeker power
access, Diverse Study, Versatile Master, counts-as-class, and custom rules. Those
are catalogued in `08-hard-coded-exceptions.md`; omitting them changes offered
choices for legal published builds.

## `statadd`

```xml
<statadd name="Armor Class" value="+2" type="Feat"
         requires="Example Feature" wearing="armor:light"
         condition="against opportunity attacks"/>
```

`name` and `value` are required. Other recovered attributes are `type`, `requires`,
`wearing`, `not-wearing`, `condition`, `half-point`, `non-zero`, `zero`, and
`statmin`.

### Value parsing

A signed/unsigned numeric value is a constant. A nonnumeric signed value is a
link to another named stat with multiplier `+1` or `-1`; examples in the corpus
include `+Constitution modifier`. `ABILITYMOD(X)` requests the ability modifier of
the linked score. Recovered flags also support half-modifier/half-point behavior
and a minimum-one behavior. A `half-point="true"` numeric contribution carries
one signed half within its target stat; paired hybrid halves therefore make a
whole point, while the evaluated stat truncates a lone half before another stat
links to it. This matches native cached hybrid HP/surge components, which
serialize integer contribution values while retaining the combined half in the
stat total. Stat names can contain `[Choice Name]`; the bracketed named selection
is replaced with its chosen record ID before lookup.

Keep ordinary numeric values exact in the compatibility evaluator and preserve
the half-point flag separately from their serialized integer value. Strings are
valid stat values and use a separate last-value/stacked concatenation path.

### Applicability and stacking

- `requires` uses the predicate grammar above.
- `wearing` must match current equipped loot; `not-wearing` must not match it.
  Equipment selectors include `armor:`, `weapon:`, `implement:`, `SLOT:`,
  `only-weapon:`, `DUAL-WIELDING:`, `VERSATILE:`, property names, and `*`.
- `condition` is descriptive conditional context, retained in the contribution
  rather than automatically proving natural-language combat state.
- `zero` contributes only when the running base is zero; `non-zero` only when it
  is nonzero.
- `statmin` associates the contribution with a minimum-stat prerequisite used by
  the original legality/display logic.

Untyped contributions stack. For each positive typed-bonus group, only the largest
applies. For each typed penalty group, only the most negative applies. A
nonnegative contribution can cancel the same typed penalty; the internal sentinel
type value `10000` cancels/zeroes its typed group. Preserve every contribution for
explanation even when it loses stacking.

## `textstring` and `statalias`

`textstring name="…" value="…"` sets character text and may carry `requires` and
`condition`. Some engine strings are stackable and concatenate rather than replace;
keep contributions/provenance instead of flattening at parse time.

`statalias name="canonical" alias="alternate"` adds a case-insensitive alias to
the same stat object. Aliases can be declared before all contributions are known.

## `grant`

```xml
<grant name="ID_EXAMPLE_FEATURE" type="Class Feature" Level="1"/>
```

`name` and `type` identify a concrete record. Optional `requires` gates it and
`Level` bounds it. A grant owns a positional child `RulesElement`; ownership and
parentage matter for later removal, replacement, legality, and serialization.
Duplicate grants do not naively duplicate global ownership: the tally tracks
providers while element occurrences retain topology.

## `drop`

`drop` identifies a target by `name`/`type` or a named `select`. It suppresses the
corresponding child/selection while the dropping provider is active. Deactivation
must be reversible on the next fixed-point update.

## `select`

Required attributes are `type` and integer `number`. `Category` filters candidates.
Optional recovered attributes are `name`, `Level`, `requires`, `optional`,
`spellbook`, `Prepare`, `existing`, `default`, and `grant`. A small number of
records use the element body as the selection's name/label.

Semantics:

- create `number` positional choice slots;
- candidate record type must match and its category/level expression must match;
- for a `Power` candidate only, the native `$$CLASS`/`$$NOT_CLASS` test also
  treats the selected theme as a class-category value; the power's `Class` or
  `_ThemePower` field supplies that membership even when the normalized
  category list does not contain the theme ID;
- exclude already selected values unless the statement permits/requires existing;
- `optional` unresolved slots do not make the character incomplete;
- `default` is filled when available but remains a real choice;
- named selects are addressable by brackets, `modify/@select`, alternates, and UI;
- `spellbook` groups learned alternatives; `Prepare` links preparation to a class;
- `existing` selects among already owned occurrences rather than the whole DB;
- `grant` links a companion grant behavior used by a published special case.

Candidate ordering comes from database/type order plus suggestion ranking; do not
use localized display-name sorting as domain identity.

## `replace`

`replace` creates a selection that displaces another occurrence and records a
`replaces` link. Recovered attributes include `name`, `requires`, `Level`,
`optional`, `multiclass`, `power-replace`, `retrain`, and `powerswap`. These modes
change eligible source/target sets for normal replacement, level retraining,
multiclass power swap, and specific power replacement.

The displaced occurrence is retained in history, not deleted. It can become active
again if the replacing provider disappears or a character level is rewound.
The native choice retains the displaced occurrence as the source option for a
completed replacement. Candidate construction must therefore include the
selected replacement's `replaces` target even though that target is inactive;
otherwise a saved retraining is falsely displayed as an empty choice.

## `suggest`

`suggest name="…" type="…"` adds ranking/display guidance. Suggestions do not grant
or satisfy a required choice and must not affect legality.

## `modify`

```xml
<modify name="Target" type="Power" Field="Keywords"
        list-addition="Fire" requires="Example Feature"/>
```

`Field` is required. A target can be identified by `name` plus optional `type`, or
through a named `select`. `requires` gates the modification. Mutation modes are:

- `value`: replace field value;
- `list-addition`: append a list item (the engine understands conditional
  `value?provider` forms used in the corpus);
- `die-increase`: increase a recovered damage-die representation by steps.

Modifications are overlays on immutable game data. They must be recomputed each
update and included in field lookup, power cards, item properties, and downstream
rules without permanently editing the shared `RulesElement`.
