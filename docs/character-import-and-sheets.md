# Character import, storage, and sheets

## Boundary

M3 makes existing collections useful without pretending that cached legacy
calculations are a modern rules engine. Three packages own the boundary:

- `legacy-dnd4e` parses compatibility XML, produces diagnostics, retains the
  original envelope, and exports it losslessly;
- `character-domain` defines the versioned browser record and portable native
  backup; and
- `sheet-model` converts either a converged authoritative evaluation or the
  preserved read snapshot plus optional content entities into renderer-neutral
  sections and cards.

React renders the model. It never parses XML or calculates a character value.

## Durable record version 2

The IndexedDB `characters` store uses the character UUID as its key and indexes
`updatedAt` and `deletedAt`. A record contains:

```text
schemaVersion = 2
id, title, notes
createdAt, updatedAt, deletedAt?
profileBinding? { packId, contentDigest? }
sheetSettings { paper, monochrome, blankHitPoints, powerCards, itemCards }
legacy { format, origin?, version?, gameSystem?, legality?, sourceXml }
snapshot { details, abilities, stats, selections, powers, loot, textStrings }
build { effectiveLevel, levels, grabbag, inventory, alternates,
        baseAbilities, textStrings }
```

The build is authoritative for modern edits. Its level frames preserve nested
selection history, occurrence IDs, acquisition levels, house-rule markers, and
replacement links. The snapshot remains an imported legacy cache used for
fallback display and parity checks. Existing schema-1 records migrate lazily
when read. Library title/notes, profile binding, trash state, and sheet
preferences are native metadata and do not modify the compatibility file. A
backup is a versioned JSON object containing every active and trashed record,
including the complete envelope, build, profile references, and settings.

New native backups use format version 2 with a character count and SHA-256
payload digest. Restore first presents a non-mutating inspection of active,
trashed, and conflicting records, then verifies the payload again before its
single write transaction. The checksum detects payload corruption; it is not an
authenticity claim, and every nested character record is independently decoded
before storage. Version-1 backups remain importable with an explicit warning
that they predate checksums. IndexedDB schema 3 journals the untouched schema-1
record before lazy conversion and recovers that record if migration is
interrupted before commit. Automated durability fixtures reconstruct a
repository over the same database, and upgrade the historical database version
2 while preserving its schema-1 character, legacy object-form content pack, and
active-profile setting. Opening the current repository upgrades the database to
version 3, migrates the character, and removes the completed journal entry.

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
not editable build state. The importer also projects the complete serialized
level tree, grabbag, alternates, base abilities, and inventory into the
authoritative build. Custom extensions, comments, whitespace, cached sheet
values, and other unmodeled XML remain in `sourceXml`.

Native creation starts from the active pack's exact ID/digest and canonical
`ID_INTERNAL_LEVEL_1` definition. It persists a level-1 root, six base ability
inputs of 10, empty inventory/history extensions, and a minimal valid 0.07a
envelope marked `origin: native`; it does not invent a legacy calculation
snapshot. The ordinary evaluator immediately exposes the level record's Race,
Class, Feat, and nested choices. The same canonical-level constructor advances
the record through level 30.

## Export compatibility

M3 no-edit export returns `sourceXml` exactly, including a leading BOM if one was
present. The UI immediately re-imports the result and requires an identical
preservation comparison before offering the download. Thus an imported file that
opened in the original builder remains the same compatibility file.

The library now makes that behavior an explicit **Original imported file (no
edits)** target. A separate **Legacy Character Builder 0.07a** target evaluates
the authoritative build against its exact bound pack revision, allocates fresh
document-local occurrence tokens, repairs representable replacement links,
serializes level history, grabbag, inventory, alternates, and text values, and
regenerates the `CharacterSheet` calculation caches. Campaign and unknown root
elements are copied from the source envelope; companion, journal, and unknown
sheet blocks are retained. XML user content is escaped; an invalid XML 1.0 code point blocks the
export rather than being silently changed or producing a malformed document.

Native-created records omit the no-edit target because no imported original
exists. Edited export writes root-level authoritative `AbilityScores` as well as
the derived `CharacterSheet` ability cache; import prefers the root values for
the build so racial or other rule modifiers cannot be compounded on round trip.

Before download, edited output is re-imported and compared to the authoritative
level, selection, replacement, inventory, alternate, ability, and text
structure. Export is blocked when that semantic check fails, evaluation does
not converge, the exact pack revision is unavailable, or the evaluation horizon
is behind the latest saved level. Library metadata remains outside both export
targets. Structural round-trip coverage is automated; the curated original-
application launch matrix remains an open M5 release check.

## Content-profile behavior

Import binds the active immutable content pack when one exists. The binding pins
both pack ID and digest. A missing pack is visible in the library and sheet;
users can install it or explicitly migrate the character. Profile migration is a
separate worker-evaluated workflow: it previews missing and changed referenced
definitions, calculated stat and power changes, legality/completeness, and
diagnostics before adoption. The stored source digest must match the installed
source pack before value differences are presented; otherwise the preview is
explicitly target-only. A bound installed pack enriches cards by stable element
ID with full normalized specifics and descriptions. Without it, cached names,
usage, attacks, and damage still render, but rules text can be incomplete.

## Sheet and print behavior

The semantic model exposes identity, final abilities, defenses, resources,
senses, skills, feature groups, notes, inventory, powers, and cards. The browser
renderer supplies a conservative desktop/tablet layout modeled on the legacy
sheet's familiar hierarchy, not its proprietary artwork.

When the exact content pack ID and digest bound to the character are installed,
the sheet runs the authoritative build through the rules worker and projects
current stats, selections, inventory, field overlays, and every calculated power
loadout. Both the equipment summary and item cards consume that active sheet
model, so stale cached quantities or equipped state cannot leak into an
authoritative sheet. Worker initialization checks the digest again so a same-ID pack
replacement cannot race the UI check. A missing/mismatched profile,
nonconvergence, or evaluation error leaves the original cached sheet visible
with an explicit legacy-cache warning. Unknown inputs stay absent rather than
being fabricated as zeroes.

Print mode hides application navigation and warnings, uses an explicit
three-column grid, prevents breaks inside cards and summary sections, and
provides Letter and A4 page rules. Blank hit points, card inclusion, and
monochrome preferences persist with the character. Browser printing is the PDF
workflow; no PDF bytes are stored in the character.

The public release harness drives the production sheet route in pinned headless
Chromium and Firefox with a synthetic long/short-prose character. It generates
Letter and A4 PDFs in color and monochrome, checks every page dimension, all card
names and headings in extracted text, blank hit points, hidden application
chrome, computed monochrome colors, and DOM card overflow. Chromium PDFs are
tagged; Firefox 154 PDFs are explicitly recorded as untagged. The PDFs remain
ephemeral test output; the harness records five correctly sized pages for each
current browser/variant combination.

## Current limitations before M4/M5 closure

- The M4 evaluator recomputes general choices, grants, prerequisites, stats,
  text, overlays, equipment predicates, legality, and ordinary weapon/implement
  power variants. Advanced critical, augment, off-hand, striker, healing, and
  named special-case branches remain incomplete.
- The editor handles abilities, level frames, ordinary choices, inventory, and
  undo/redo. Focused replacement picking and choices supplied by newly created
  synthetic grant providers still need their dedicated editing flow.
- Edited builds regenerate both the semantic browser sheet and the explicit
  0.07a `.dnd4e` target from a converged exact-profile evaluation. The no-edit
  target remains exact. Original-application launch-matrix evidence is still
  required before compatibility release closure.
- Candidate lists are structurally filtered up front. Full prerequisite
  evaluation currently runs for selected choices, so a newly selected illegal
  option remains editable and is then explained by diagnostics.
- Full card prose requires the matching content pack because `.dnd4e`
  `PowerStats` contains calculations but not every rule field.
- Portrait file URLs from the Windows application are retained in XML but are
  not dereferenced by the web application.
- Exact pagination varies with card prose and browser print engines. The current
  Chromium and Firefox release fixtures have no card overflow and complete
  extracted text; Safari execution and cross-engine raster inspection remain in
  the M5 supported-browser matrix.
