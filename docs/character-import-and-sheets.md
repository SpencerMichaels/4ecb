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
portrait? { sourceDataUrl, sourceWidth, sourceHeight, crop { x, y, size }, renderedDataUrl }
legacy { format, origin?, version?, gameSystem?, legality?, sourceXml }
snapshot { details, abilities, stats, selections, powers, loot, textStrings }
build { effectiveLevel, levels { root, userEdit? }, grabbag, inventory, alternates,
        baseAbilities, textStrings }
```

The build is authoritative for modern edits. Its level frames preserve nested
selection history, occurrence IDs, acquisition levels, house-rule markers,
replacement links, and a typed recursive representation of any native
`UserEdit` provider and rule statements. The snapshot remains an imported legacy cache used for
fallback display and parity checks. Existing schema-1 records migrate lazily
when read. Library title/notes, profile binding, trash state, sheet preferences,
and the optional portrait are native metadata and do not modify the compatibility
file. Portrait uploads are normalized to a maximum 1600-pixel source edge before
storage; the retained source and normalized crop allow later reframing, while a
512-pixel square derivative keeps library and sheet rendering cheap. Both are
stored as bounded image data URLs so ordinary character duplication and JSON
backup/restore remain self-contained. A
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
level tree, per-level `UserEdit` containers, grabbag, alternates, base abilities,
and inventory into the authoritative build. An `<alternate>` retains its
`SelectName` and provider identity. During evaluation, that pair is resolved to
the provider's matching `spellbook` select rule and the alternate choice is
projected into that logical slot; the legacy engine's `ParseAlternate` follows
the same `FindProvider(provider, SelectName)` path before replacing the slot's
element. If no exact provider/slot can be resolved, the choice remains owned as
recoverable grabbag evidence rather than being discarded. Custom extensions,
comments, whitespace, cached sheet
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

The original imported envelope remains embedded as internal preservation input,
but is no longer exposed as an untouched-file download. The user-facing
`.dnd4e` export always evaluates the authoritative current build against its
exact bound pack revision, allocates fresh
document-local occurrence tokens, repairs representable replacement links,
serializes level history (including typed `UserEdit` payloads), grabbag,
inventory, alternates, and text values, and
regenerates the `CharacterSheet` calculation caches. Campaign and unknown root
elements are copied from the source envelope; companion, journal, and unknown
sheet blocks are retained. XML user content is escaped; an invalid XML 1.0 code point blocks the
export rather than being silently changed or producing a malformed document.
Spellbook edits update the existing alternate envelope—or create one for a
native character—rather than inserting the extra known spell into ordinary
level children.

Native-created records use the same regenerated export path. Recovered
`SaveCharacter`/`WriteCharacterSheet` behavior writes the
single base-allocation `AbilityScores` block inside the leading
`CharacterSheet`; final adjusted scores belong in `StatBlock`. Edited export
follows that native order before campaign data, level history, grabbag, and text
state. Import still tolerates root-level scores from non-native producers, but
the legacy-builder target does not emit that alternate form.

Before download, edited output is re-imported and compared to the authoritative
level, selection, replacement, inventory, alternate, ability, and text
structure. Export is blocked when that semantic check fails, evaluation does
not converge, the exact pack revision is unavailable, or the evaluation horizon
does not equal the build's current effective level. Library metadata remains outside both export
targets. Structural round-trip coverage is automated; the curated original-
application launch matrix remains an open M5 release check.

Typed `UserEdit` payloads are projected as stable character-local content
entities alongside `EvaluationInput`. Their rules use the same fixed-point,
stat, choice, and power paths as profile content, remain intrinsically
source-entitled, and contribute to regenerated sheet caches without being
published into a shared content pack. The original-import target remains byte
exact; the edited target retains and executes the typed rules.

The automated compatibility boundary preserves unsupported native power and
prerequisite behavior as explicit evaluator diagnostics while retaining the
source envelope and cached sheet. This differs from the original-builder
matrix: semantic re-import proves modern round-trip consistency, while only the
manual Windows open/save/reopen check proves original-application acceptance.

`docs/legacy-builder-launch-matrix.md` records the recovered one-argument file
open contract, CBLoader merged-cache path, deterministic regenerated candidate
commands, and the actual 2026-09-01 runtime blocker. Semantic re-import remains
separate from an observed original-application open.

## Deferred source-envelope retirement

The complete `LegacyEnvelope.sourceXml` is now classified as transitional debt.
It was the correct loss-preserving boundary before engine-backed editing and
cache regeneration existed, but it is not the intended permanent source of
native character semantics. Removing it immediately is unsafe because edited
export still extracts campaign, journal, companion-presentation, unknown root,
unknown sheet, and unknown root-attribute fragments from the imported document.
The existing round-trip comparison covers the authoritative `CharacterBuild`,
not those copied fragments or every regenerated cache field.

The 2026-09-17 read-only corpus audit examined the eight supplied correction
characters and nine bundled sample heroes:

- all 17 files use the same known root and `CharacterSheet` element vocabulary;
- none contains an unknown root element;
- every embedded `D20CampaignSetting` is empty;
- every sheet-level `Companions` block is empty; companion rules remain in the
  level tree and companion prose is already represented through character
  detail text; and
- one bundled hero contains one structured journal entry.

The public structural fixture deliberately retains synthetic unknown root and
sheet elements so the extension boundary remains tested. The audit establishes
that the official observed preservation tail is narrow; it does not authorize
discarding journal data, future imported campaign policy, historical wrappers,
or third-party extensions.

The remaining data is classified as follows:

- Level trees, choices, replacement links, grabbag, inventory, alternates, base
  abilities, text strings, and typed `UserEdit` rules are authoritative native
  build state and are regenerated.
- `StatBlock`, `RulesElementTally`, `LootTally`, and `PowerStats` are disposable
  generated caches. The normalized legacy snapshot remains useful for fallback
  display and parity diagnostics, but is not editable authority.
- Campaign policy, structured journal entries, meaningful companion
  presentation, historical wrapper forms, and extra attributes or children in
  recognized authoritative containers are meaningful data not yet completely
  normalized.
- Unknown root/sheet extensions and unknown root attributes are currently
  preservation data rather than understood semantics. A future normalized
  compatibility model may retain them as typed generic element trees at explicit
  document anchors instead of retaining the whole source document.
- Comments, whitespace, BOM, original formatting/order, and document-local
  `charelem` token spellings are non-semantic and need not survive byte-for-byte
  once the untouched-original export target is gone.

Retirement is deferred and will proceed in stages:

1. Define the supported official 0.07a and observed historical input boundary,
   including wrapper and duplicate/order behavior.
2. Normalize campaign, journal, companion-presentation, container attributes,
   and extension payloads without consulting the original file at export time.
3. Make edited export source-independent: the writer consumes only the build,
   normalized compatibility data, exact evaluation, and bound content profile.
4. Expand comparison from `CharacterBuild` parity to complete normalized
   document semantics and improve generated-cache fidelity where legacy or
   third-party consumers require it.
5. Add a record-schema migration that first makes `sourceXml` optional, retains
   a rollback-safe transition, and removes it only after corpus and original-
   builder compatibility verification passes.

The decisive automated exit criterion is:

```text
import .dnd4e -> discard source XML -> export -> re-import
-> compare complete normalized semantics
```

That comparison must include campaign, journal, companion/extension payloads,
container attributes, and user content as well as the existing build topology.
Until this criterion passes, the source-independent writer and storage migration
are explicitly deferred and `sourceXml` remains required preservation input.

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

M5.6 refines that browser renderer into an authoritative read-only **View** mode
and adds a distinct desktop/tablet **Play** mode over the same `SheetDocument`
and card models. Play mutations belong exclusively to persisted `PlayState` and
its deterministic commands; they do not rewrite evaluated snapshots or the
durable character build. M6 adapts those commands and models to a task-oriented
phone interface rather than shrinking the desktop Play sheet.

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

- The evaluator recomputes general choices, grants, prerequisites, stats, text,
  overlays, equipment predicates, legality, ordinary weapon/implement power
  variants, explicit main/off-hand pairing, and the named dual-implement
  enhancement path. Quarry, curse, and sneak-attack damage is retained as a
  separate conditional projection, including the recovered hybrid and weapon
  gates, and edited export writes that projection back to the legacy
  `Conditions` cache. Other situational and remaining named special-case
  branches remain incomplete.
- The editor handles abilities, level frames, ordinary choices, inventory, and
  undo/redo. Focused replacement picking and choices supplied by newly created
  synthetic grant providers still need their dedicated editing flow.
- Edited builds regenerate both the semantic browser sheet and the explicit
  0.07a `.dnd4e` target from a converged exact-profile evaluation. The no-edit
  target remains exact. Original-application launch-matrix evidence is still
  required before compatibility release closure.
- Candidate lists apply both structural constraints and the legacy executable
  `Prereqs` expression. Failed or unrecognized prerequisites are hidden by
  default and remain recoverable through **Show unavailable options**; an
  imported selected illegal option remains visible and explained by diagnostics.
- Full card prose requires the matching content pack because `.dnd4e`
  `PowerStats` contains calculations but not every rule field.
- Portrait file URLs from the Windows application are retained in XML but are
  not dereferenced by the web application.
- Exact pagination varies with card prose and browser print engines. The current
  Chromium and Firefox functional fixtures have no card overflow and complete
  extracted text; Safari/device execution and cross-engine raster inspection
  belong to 1.0 hardening.
