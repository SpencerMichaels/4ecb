# Character import, storage, and sheets

## Boundary

M3 makes existing collections useful without pretending that cached legacy
calculations are a modern rules engine. Three packages own the boundary:

- `legacy-dnd4e` parses compatibility XML, produces diagnostics, retains the
  original envelope, and exports it losslessly;
- `character-domain` defines the versioned browser record and portable native
  backup; and
- `sheet-model` converts a read snapshot plus optional content entities into
  renderer-neutral sections and cards.

React renders the model. It never parses XML or calculates a character value.

## Durable record version 1

The IndexedDB `characters` store uses the character UUID as its key and indexes
`updatedAt` and `deletedAt`. A record contains:

```text
schemaVersion = 1
id, title, notes
createdAt, updatedAt, deletedAt?
profileBinding? { packId, contentDigest? }
sheetSettings { paper, monochrome, blankHitPoints, powerCards, itemCards }
legacy { format, version?, gameSystem?, legality?, sourceXml }
snapshot { details, abilities, stats, selections, powers, loot, textStrings }
```

Library title/notes, profile binding, trash state, and sheet preferences are
native metadata and do not modify the compatibility file. A backup is a
versioned JSON object containing every active and trashed record, including the
complete envelope, profile references, and settings.

## Import semantics

The importer validates a `D20Character` root case-insensitively and reports an
unexpected game system, a missing `CharacterSheet`, and preserved unknown root
elements. It reads:

- display details and base ability inputs;
- final values and aliases from cached `StatBlock` (used in preference to base
  ability inputs on the read-only sheet);
- selected rules and short descriptions from `RulesElementTally`;
- cached powers, usage/action, weapons, attacks, damage, and provenance from
  `PowerStats`;
- current positive/equipped inventory from `LootTally`;
- root text strings and authoritative level count; and
- race/class/theme/path/destiny fallbacks from selected rules when older
  `Details` blocks omit them.

The normalized snapshot is explicitly tagged `legacy-cache`. It is a read model,
not editable build state. Authoritative level trees, alternates, loot history,
unresolved slots, custom extensions, comments, whitespace, and all other XML
remain in `sourceXml` even where M3 does not project them.

## Export compatibility

M3 no-edit export returns `sourceXml` exactly, including a leading BOM if one was
present. The UI immediately re-imports the result and requires an identical
preservation comparison before offering the download. Thus an imported file that
opened in the original builder remains the same compatibility file.

This is intentionally narrower than future edited export. M4/M5 must serialize
engine-backed authoritative state, repair occurrence links, regenerate
`CharacterSheet`, and merge preserved unknown extensions. Until then, editing
library metadata never implies editing the `.dnd4e` document.

## Content-profile behavior

Import binds the active immutable content pack when one exists. The binding pins
both pack ID and digest. A missing pack is visible in the library and sheet;
users can install it or explicitly rebind the character. A bound installed pack
enriches cards by stable element ID with full normalized specifics and
descriptions. Without it, cached names, usage, attacks, and damage still render,
but rules text can be incomplete.

## Sheet and print behavior

The semantic model exposes identity, final abilities, defenses, resources,
senses, skills, feature groups, notes, inventory, powers, and cards. The browser
renderer supplies a conservative desktop/tablet layout modeled on the legacy
sheet's familiar hierarchy, not its proprietary artwork.

Print mode hides application navigation and warnings, uses an explicit
three-column grid, prevents breaks inside cards and summary sections, and
provides Letter and A4 page rules. Blank hit points, card inclusion, and
monochrome preferences persist with the character. Browser printing is the PDF
workflow; no PDF bytes are stored in the character.

## Known limitations before M4/M5

- Calculations and legality are not recomputed after import.
- M3 does not edit build choices, level history, equipment, or legacy XML.
- Full card prose requires the matching content pack because `.dnd4e`
  `PowerStats` contains calculations but not every rule field.
- Portrait file URLs from the Windows application are retained in XML but are
  not dereferenced by the web application.
- Exact pagination varies with card prose and browser print engines. The current
  structural layout and supplied sample have been checked for card overflow;
  M5 owns the supported-browser Letter/A4 golden matrix and release-grade tuning.
