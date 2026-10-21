# Coverage audit proposal

Status: accepted by the product owner (2026-10-20); policy recorded as D089.
Steps 1–2 (registry, reference fields) implemented as `pnpm audit:coverage`.

## Problem

Several recent player reports came from character options the UI never
handled, not from wrong rules:

- **Hexblade pacts** (Trait Package): the detail pane showed no benefits,
  because nothing followed `_PARSED_CLASS_FEATURE`.
- **Familiars:** the sheet had no place for them.
- **The Widow of Arach-Tinilith spiderling:** it existed only as a community
  power card.

The existing private audits test the rules engine, not presentation.
`audit:rules` checks rule syntax. `audit:native-workflow` builds one
deterministic character through every level. Neither asks whether every option
a character can choose or receive is shown by the builder and the sheet.

A first inventory of the full pack shows the size of the gap:

- **74 content types.** About 20 are internal plumbing (Category, Internal,
  Grants, `CountsAs*`, …).
- **About 30 types can be chosen or granted to a character.**
- **The sheet's features list shows only 8:** Racial Trait, Class Feature,
  Feat, Theme, Background, Paragon Path, Epic Destiny and Language.
- **Types outside that list, not yet traced to any other sheet surface:**
  Trait Package (34), Domain (granted 231 times), Background Choice (213),
  God Fragment, Deity and Companion.

## Proposal

One private command, `pnpm audit:coverage [PACK.4ecp]`, in the style of
`audit:native-workflow`. It reads the exact private pack and writes an ignored
JSON report plus a short ranked Markdown summary. It reports gaps for triage;
it never fixes anything itself.

### 1. Type registry

A checked-in registry (`packages/sheet-model` or `apps/web`, whichever owns the
surfaces) classifies every content type. Each entry names where the type is
expected to appear, from this set:

- builder choice editor
- detail-pane layout: structured, card or generic
- sheet surface: features, power cards, items, familiar/companion cards,
  identity or notes
- `internal`: never shown

The audit fails on any pack type missing from the registry, or on a type whose
registered surface never renders it. A public synthetic test keeps the registry
honest for the types in `fixtures/content/synthetic.dnd40.xml`. New or rare
categories therefore have to be decided on explicitly; they can't be missed.

### 2. Reference fields

Scan every specific field of every entity for values that resolve to other
entities' IDs or names. Report each (entity type, field) pair with its count
and example entries, for example:

- `Trait Package._PARSED_CLASS_FEATURE` → Class Feature
- `Class Feature._DisplayPowers` → Power
- `Race.Racial Traits` → Racial Trait

Each pair is then marked as followed or not followed by the detail pane and
the sheet. Unfollowed pairs with many entries are the likeliest silent gaps;
the pact bug was one of these.

### 3. Sheet completeness on generated characters

Extend the native-workflow builder to generate a matrix rather than one
character:

- every Class, Hybrid Class, Race, Theme, Paragon Path and Epic Destiny
- at levels 1, 11, 21 and 30
- choosing the first eligible candidate for every choice, preferring options
  not yet covered

For each character, every active occurrence must appear on some sheet surface
or belong to a registry-`internal` type. Report the occurrences that appear
nowhere, grouped by type and provider. Evaluation errors such as
`grant.missing-target` and unresolved required choices are reported as well.

### 4. Choice reachability

For every `select` rule in the content, check two things:

- the builder maps its type or category to a choice editor;
- at least one generated character is offered at least one candidate.

The report lists choices with no editor and choices that are never offered
anything. The latter usually means broken content, like the nine empty
duplicate familiars.

### 5. Legacy special cases

The legacy applications contain behavior keyed to specific content by ID, name
or field value, not by the rule language.
`reverse-engineering/docs/08-hard-coded-exceptions.md` describes the known
families in prose. This audit turns them into a complete, checkable inventory.

- **Extraction.** Decode every string literal in the decompiled engine and
  applications, including the mangled C++/CLI literals: about 250 meaningful
  ones in `D20RulesEngine`, plus the managed literals in `CharacterBuilder`,
  `CharacterSheetViewer` and `RulesEngineCommon`. Record each with the
  function that uses it, and classify it as a content ID, content name, field
  name, type value, or format/UI text. The last group is dropped.
- **Inventory.** List each special case once:
  - the function
  - the content it targets, with matching pack entities and their counts
  - what it does
- **Status against the modern code.** Each special case is one of:
  - handled declaratively (content or a correction)
  - handled in code (e.g. `rules-engine/src/exceptions.ts`)
  - handled by a separate hand-written list that may drift
  - not handled
- **Example found while scoping.** `RulesElementIsBoon` hard-codes a list of
  magic-item types: Glory Boon, Battle Scars, Templar Brand, Echo of Power,
  Elemental Gift, Primal Blessing, Dragonshard Augment, Veiled Alliance
  Mystery, … The modern equivalent is a separate hand-written list in
  `apps/web/src/equipment-ui.ts`, and nothing checks that the two agree.

### Policy change: corrections over code

`08-hard-coded-exceptions.md` currently says to port each native branch
verbatim first and generalize later. Proposed replacement, to be recorded as a
decision once accepted:

1. **Prefer content corrections.** A special case that targets particular
   content is fixed in `content/corrections/*.part` wherever the rule language
   or a field can express it. Examples: a field overlay, an added grant or
   statadd, `Unselectable`, a type change.
2. **Code only for engine semantics.** Code is reserved for behavior the data
   cannot express. Any ID or name it keys on comes from one registry
   (`EXCEPTION_IDS`), each with a test, never inline literals.
3. **Existing code exceptions are reviewed with the inventory.** Each one is
   either moved into corrections or justified in the report.
4. **Corrections stay free of copied official text.** A correction may change
   structure (types, fields, rules, numbers) but not add published prose.
   Where only prose would fix something, we prefer presentation-level handling
   or leave it.

## Order of work

1. **Registry and reference-field audit (1 and 2):** cheap and fast, and they
   point at the likeliest silent gaps.
2. **Legacy special-case inventory (5):** the extraction script and the first
   classified report.
3. **Generated-character matrix (3 and 4):** the largest piece; it reuses the
   native-workflow machinery.

Each step ends with a ranked gap report for the product owner to triage. Fixes
go through the usual flow: a correction where possible, otherwise code.

## Verification

- Public: a synthetic registry test and unit tests for the literal decoder and
  the reference-field scanner.
- Private: the audit runs against `tmp/content/full-local.4ecp`. Its reports
  stay ignored, like other private-corpus diagnostics.
