# Decrypted game-data format (`D20Rules`)

## Document envelope

The logical database is UTF-8 XML:

```xml
<?xml version="1.0" encoding="utf-8"?>
<D20Rules game-system="D&amp;D4E">
  <RulesElement name="Example" type="Feat"
                internal-id="ID_EXAMPLE_FEAT_1"
                source="Example Source" revision-date="2026-01-01">
    ...
  </RulesElement>
</D20Rules>
```

Element and attribute comparisons in the legacy reader are generally
case-insensitive. IDs should nevertheless be emitted with their original casing
and treated as opaque strings. XML order matters for rule execution and merge
precedence, so an importer must not sort children casually.

The root's `game-system` is `D&D4E`. Top-level `RulesElement` is the normal record;
CBLoader can also preserve arbitrary top-level raw elements.

## `RulesElement`

Official database attributes are:

| Attribute | Meaning |
|---|---|
| `internal-id` | Stable primary key and reference target. |
| `name` | Display name and fallback lookup key. |
| `type` | Open-ended record kind, interned by the engine. |
| `source` | Comma-separated source names; the engine stores at most five. |
| `revision-date` | Optional opaque revision/date metadata. |

The engine indexes by ID, by name, and by `(name,type)`. Character loading first
uses the serialized ID, then falls back to `(name,type)` so renamed or missing
records can become illegal stubs instead of destroying the character.

Direct content is a mixed sequence:

- free text: the main description/body;
- `Category`: comma-separated memberships, unioned during CBLoader appends;
- `Flavor`: short presentation text;
- `Prereqs`: machine-evaluated prerequisite expression;
- `print-prereqs`: display-only prerequisite prose;
- `specific name="…"`: typed metadata field whose body is its value;
- `rules`: ordered executable statements described in `04-rule-language.md`.

`specific` names are an extensible data dictionary, not a closed schema. Examples
include level, class, usage, action type, attack type, enhancement, cost, weight,
weapon properties, and many UI/card fields. Preserve unknown names, duplicates,
text, and order. Field lookup is case-insensitive; modification rules can replace
or append field values at runtime.

## Record types

`type` is open-ended. A replacement must not model it as a database enum. Important
families in the supplied corpus include:

- character choices: `Race`, `Class`, `Hybrid Class`, `Build`, `Background`,
  `Theme`, `Deity`, `Paragon Path`, `Epic Destiny`, `Feat`, `Skill`, `Power`,
  `Class Feature`, `Racial Trait`, and `Proficiency`;
- inventory: `Weapon`, `Armor`, `Gear`, `Magic Item`, `Item Set`, `Item Set
  Benefit`, `Ritual`, and `Ritual Scroll`;
- engine/meta records: `Level`, `Category`, `source`, `Internal`, `Grants`,
  `suggestions`, and `CountsAsFeature`;
- companion records: `Companion`, `Familiar`, and related feature/power records.

The complete observed set and counts are machine-readable in the profile JSON.

## Identity and references

Rule attributes named `name` commonly contain an `internal-id`, despite the name
of the attribute. Treat each rule according to its statement grammar. Categories
may be referenced by display name or ID because the engine's string table resolves
both. References can be forward references because the database is loaded before
rules execute.

## Parsing requirements for a modern implementation

Use a lossless XML model at the import boundary and a normalized domain model for
evaluation. The lossless layer should retain:

- unknown elements/attributes and comments where practical;
- mixed root text and its relative position;
- duplicate `specific` fields and rule order;
- original strings and casing;
- source file/provenance and merge operation.

The normalized layer may index IDs and parsed expressions, but exported legacy
XML should be constructed from the lossless representation plus intentional edits.
Reject duplicate IDs only after merge semantics have been applied; a later whole
`RulesElement` intentionally replaces an earlier one.
