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

### Printed reference completeness

Both sheet paths retain Size, Gender, Age, Height, Weight, Alignment, Deity and
RPGA in identity metadata. Evaluated Size/Gender/Alignment/Deity selections take
precedence over imported identity caches; edited free-text fields use the existing
detail-text overlay. Page 1's right-aligned identity area has two separately
bordered, side-by-side tables: Size/Deity/Alignment and Theme/Paragon path/Epic
destiny. Both have three label/value rows, sized to contents within a shared
62%-of-header maximum;
labels stay whole while long values may wrap. Missing values show em dashes.
Size, Deity and Alignment are not duplicated in Character Details. Populated
Gender, Age, Height, Weight and RPGA stay in that reference table before notes.

Encumbrance is model data, not React arithmetic. The fallback path uses the
cached gear `Weight` stat. The evaluated path reconstructs the native stock
weight input from current-level aggregated inventory: base (not enchantment)
weights, custom per-item Weight overrides, signed quantity history, integer
stock-weight truncation, and the native transportation/barding/mount-slot/
companion-slot/familiar-slot exclusions. Evaluated Weight contributions then
adjust that stock input. Unknown definitions without a valid weight override
leave carried weight unknown rather than inventing zero.

Recovered evidence: `D20Workspace.UpdateLoot`/`LootWeight`/`CharLootWeight`,
`GearPageData.UpdateTotalEncumbrance`, `UpdateCarriedMoneyWeight`, `UpdateLoad`
and `UpdateEncumbranceLimit`. Carried coin pounds are
`floor((cp + sp + gp + pp + ad / 10) / 50)`; stored coins do not count.
Negative stock weight clamps to zero before adding coins. The displayed normal
limit is `(Strength + StrLoadAdjust) * 10 + Weight Discount`; native load states
compare against adjusted Strength ×10/×20/×50 without Weight Discount. That
distinction is preserved, not silently corrected. Unknown/custom currency keeps
the carried weight and load unknown, while a known limit may still be shown.
The browser-local Settings “Count coin weight” preference defaults to on and
applies to both sheet-model paths. Off omits carried coins entirely, including
unknown/custom wallet text, but never invents missing gear weight. It changes
sheet encumbrance/load only, not wallet amounts, inventory weights, load limits,
character data, or native compatibility exports.
Encumbrance appears as a compact line inside Inventory. Each inventory row also
projects its quantity-inclusive weight using the same base/override rules before
stock-stat truncation, displayed at the right of the item cell in muted text.

## Durable record version 2

The IndexedDB `characters` store uses the character UUID as its key and indexes
`updatedAt` and `deletedAt`. A record contains:

```text
schemaVersion = 2
id, title, notes
createdAt, updatedAt, deletedAt?
profileBinding? { packId, contentDigest? }
sheetSettings { paper, monochrome, blankHitPoints, powerCards, itemCards }
  (kept for compatibility; ignored since D083: paper is an app setting,
  cards always print, no blank HP or monochrome mode)
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
version 5, backfills small character/content-pack metadata sidecars and a
separate rendered-portrait-thumbnail store, migrates the character, and removes
the completed journal entry. Payload stores remain authoritative. Character
writes, restores, trash changes, and lazy migrations update their summary and
thumbnail in the same transaction. Library listing reads summaries and the
bounded rendered thumbnails in one transaction without cloning source XML,
build history, or the retained portrait source (which may be much larger).

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

### Missing content matched by name (D096)

When Settings → Importing characters → "Match missing content by name" is on
(the default), the library passes the active content to `importDnd4e`
(`matchMissingDefinitionsIn`). Every saved identity is checked: level-tree
occurrences, `UserEdit` children and rule `name` attributes, grabbag,
alternate providers and choices, loot base/enchantment/augment elements and
their saved children, and known records. Text strings keyed by a record ID (a
given `FREEBEE` marker, `LOOTNOTE_<id>__<id>__<name>`) follow the match.

- **Name:** a missing ID takes the one content record of the same type whose
  name matches after decoding XML entities, collapsing whitespace and
  folding case (`matchableName`).
- **Class suffix:** a missing ID no record names exactly, whose saved name
  ends in "(<Class>)" naming one of the character's classes, takes the one
  record of its type named without the suffix ("Mountain Guide (Ranger)" →
  "Mountain Guide"). The character's classes are its saved Class and Hybrid
  Class records plus every CountsAsClass their records grant (directly or via
  Grants), so a Hunter is also a Ranger; multiclass feats' CountsAsClass
  grants don't count. Other parentheticals are never stripped. Basis
  `class-suffix`, with the class as `className`.
- **Grant** (approved as implemented, 2026-10-23): a still-missing child of a matched parent takes the one record
  of its type the parent's record grants at the child's saved `Level` (from
  `RulesElementTally`) that the build doesn't already hold. Once a child is
  matched to the ID the parent grants, evaluation adopts the saved child as
  that grant, so nothing is granted twice.
- **Never on ambiguity:** two or more same-named records (by the exact name,
  or by the name without its class suffix) leave the ID missing; the report
  lists the candidates with a warning.

The import report's `definitionMatching` lists `matched` (saved ID, name,
type, new ID, basis), `ambiguous` and `unmatched`. Changed identities keep
their saved name and type plus `importedDefinitionId`; exports write the new
ID. Matches are silent in the UI (D098): no toast, badge or Diagnostics note;
the report and `importedDefinitionId` keep them. Unmatched IDs remain
missing-content issues as before.

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
  display and parity diagnostics, but is not editable authority. One
  exception: native saves keep an item's choices and grants only beneath its
  `LootTally` row (per-level `loot` rows are always flat), so import recovers
  them from there and edited export writes them there and not in the
  per-level rows, keeping the build's `charelem` tokens unique.
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

### Class-feature-specific power clauses

Evaluated personalized View/print power fields hide only proven inactive siblings
of a resolved single-choice Class Feature selection (D077). The parent rule's
literal category defines the family using complete content definitions; the
selected option must be legal/source-entitled and the sole active family member.
Clause labels must uniquely match sibling feature names. Uncertain/custom,
multi-choice/composite and duplicate-name cases remain visible, as do ordinary
rules labels. Generic Build descriptions and legacy-cache sheets keep all
clauses. Raw authored content and character selections remain recoverable.

### Additional effects on power cards

`SheetCard.additionalEffects` and each equipment variant expose renderer-neutral
reminders with an explicit authoritative-evaluation or legacy-cache source.
Modern reminders come from conditional global attack/damage contributions and
matching contextual `:attack`, `:damage`, `:damage-roll`, or authored `:info` stats,
plus recovered striker expressions. Conditions never augment ordinary totals.
The model preserves providers and contribution IDs, and deduplicates repeated
aliases by contribution identity rather than discarding equal authored prose
from distinct providers. Comma keyword predicates require every keyword, and
parenthesized equipment limits match the selected base/enchantment definitions.
Damage-roll reminders require dice; attack reminders require an attack.

The card chooses the equipped main hand, then another equipped variant, then the
existing first available fallback. Imported cache display uses the saved
`_INTERNAL_MainHandWeapon` and equipped loot where available before the historical
first-weapon fallback. Its Conditions string remains verbatim and cannot be
mixed into evaluated output. Equipment-specific reminders on carried variants
remain inspectable in the model without appearing on the default card.
Printed populated effects are part of the fitted body with the established
readability floor; empty effects omit the section and reserved writing area,
returning that space to the rules body. Dense content remains
subject to the visible overflow boundary, not silent truncation or smaller text.
The separate native Action Point and dwarf Second Wind card specializations,
and generated keyword families beyond the supported loadout context, are not
implemented by this ordinary PowerStats projection.

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

### Feature notes and legacy power-card parts

Evaluated sheets follow the legacy CharTracker for three record-driven parts
(`sheet-model/src/feature-notes.ts`, `power-card-header.ts`):

- **Feature notes** (`NoteHolder.GetShortDescription`). A feature, feat or
  racial trait's sheet line is its `_CS_ShortDescription` when that is
  non-empty, else its `Short Description`. `text@Feature` shows `text` until
  the character owns the class feature `Feature` (Weapon Mastery gives way to
  Paragon Weapon Mastery); a bare `@` (624 records: choice placeholders such as
  "Level 1 Mage Encounter Powers", subrace shells) and `InternalOnly` records
  never show. A hidden feature is left out of `CharacterSheetModel.features`,
  so it has no page-1 row, reference entry or reminder; its choices still
  appear as their own features or cards. The coverage audit counts it as
  accounted for.
- **Class block** (`UpdatePowerCardPower`). `SheetCard.classBlock` is the
  power's Class record name; for a classless power, "Racial" when its Display
  names a racial power (legacy writes "Racial Power" in a CLASS box), else the
  `_SkillPower` skill's name. The card's type bar ends with it before the level
  ("Monk · Level 1"). Legacy's "*" level placeholder is not copied.
- **Spellbook** (`UpdatePowerCardPower`, `IsSpellbook`). A power known only
  through a spellbook select slot (a legacy `<alternate>`) has
  `SheetCard.spellbook`, printed as a "Spellbook" subtitle beside its name.
- **Movement technique** (`PowerCard.MonkMovementTechnique`). A power whose
  `_ChildPower` record is named "[Movement Technique]" carries
  `SheetCard.movementTechnique` (action, attack type and body fields minus the
  legacy power-card excludes), printed after the attack and before the weapon
  table. As in legacy, the technique keeps its own card too; builder detail
  panes show it only inside the discipline's card. Other child powers are
  unaffected.

## Sheet and print behavior

The printed overview follows D078: one combat summary, a paper scratchpad with
usage continuations when needed, measured full-description references, then the
enabled power/item card pages. Reference origin/level metadata is distinct from
publication source; missing grant/acquisition levels remain explicitly unknown.
`CharacterSheetModel.overview` preserves feature summaries and full rules as
distinct values, training, ability checks, explicit inventory slots and reminder
candidates. Both evaluated and legacy-cache projections supply it; recovery
pages retain their source warning. The React renderer paginates prose, not rules
calculations. Power/item physical cards retain their separate accepted layout.
See `sheet-overview-prototype.md` for the approved geography and review limits.

The scratchpad has no Date or XP fields. A separate ruled Session Notes template
is appended after all character references and enabled power/item card pages.
It is unnumbered and excluded from the character sheet's continuous numbering,
so players can print extra copies independently. It reserves most of the page
for notes, with blank Treasure and XP writing panes below; recorded character
XP is not prefilled on this reusable template. A Date field appears on the right
side of the Session notes header only. Pane styling and the identity/section
footer match the rest of the sheet, without a page-number element.
Encounter powers occupy the scratchpad's wider left column; Daily
powers and then Consumables stack independently on the right. Consumables use
the item-card gold header, all owned inventory (including hidden-card items),
and authored item/category or consumable-power metadata, never name guessing.
Stacks of one through five use the same square boxes as power tracking; larger or custom fractional
quantities use a remaining-count box beside the original quantity. Empty stocks
are omitted. All three row streams paginate using measured heights without
shrinking text or changing inventory data; fixed-size item cards have no stock
trackers.

Consumables share ordinary pane borders; only the header uses the muted 20%
item-gold/white subheading tint. Remaining-stock boxes are right-aligned.
Row icons use the same metadata mapping as item cards, including composed base
items. Parenthetical name annotations are omitted unless two distinct owned
names would otherwise become identical (case-insensitive); those variants retain
their annotations for disambiguation. Immediate interrupts use Lucide `trending-up`
everywhere the shared action icon appears.

Basic Attacks includes owned powers whose effective `_BasicAttack` field is
Melee or Ranged, including active feat overlays, as well as the ordinary basic
attacks. The internal flag is typed metadata, never a printed property. Each
flagged nonstandard power gets one row labelled only by its power name, using
an eligible equipped calculation (main hand first, then other equipped, then
the highest-ranked available variant). Ordinary basic attacks retain their
weapon alternatives. Weapon compatibility filtering does not reject an
implement spell merely because its implement can also be a melee weapon.
The power keeps its authored attack ability, damage and other rules; the table
does not turn it into the Strength-based ordinary MBA. Native basic-specific
attack/damage channels also recognize the effective flag. Full riders and
alternative weapon calculations remain on the power card.

Cached-only recovery sheets recognize direct authored BA flags but do not guess
feat-generated overlays from prose or selected feat names. Full evaluated sheets
use active rule overlays, so deselecting a granting feat removes eligibility.
Prose-only or conditional permissions without a flag are not automatically
promoted; the full authored power/feat description remains available.

Channel Divinity members are recognized from an authored Channel Divinity field
or keyword, projected as shared-usage metadata through both model paths. A group
occupies the earliest member's place in normal encounter ordering, retains each
member's action icon, and shares one set of encounter boxes. Within the group,
members sort by action hierarchy then alphabetically, without the general
attack/utility tie-breaker. Power names alone never establish shared usage.

The summary's optional Defensive traits table groups signed `resist:*` totals
(positive resistance, negative vulnerability), conditional resistance/save
contributions and death-save modifiers. Native conditions retain numeric values,
wording and provider names separately; inapplicable equipment contributions are
excluded and conditional bonuses are never summed. Unresolved expressions remain
explicit rather than becoming guessed numbers. Authored self-immunity clauses and
explicit defensive fields are retained whole; this is not a general natural-
language rules parser or an assertion that all prose-only defenses are detected.
Legacy snapshots lack conditional stat-add provenance, so no native conditions
are fabricated from cached totals; selected full rules remain in references.
Benefits and sources are separate columns with alternating row backgrounds,
without visible table/category headers. Compact clauses are self-contained
(`Resist 5 fire`, `Vulnerable 5 cold`, `Immune to acid`), while authored conditional
wording is retained. Related resistance/immunity/vulnerability/save entries are
adjacent without blank category gaps; row striping continues across groups.
Structured save modifiers explicitly say `to saves`/`to death saves` after any
bonus or penalty type, before the unchanged condition. This wording is generated
from stat provenance rather than substituted into arbitrary prose.
Summary save rows abbreviate `against` to `vs` for display only, retaining full
model/reference wording and unmodified source names. Applied native contributors
supply total provenance; conditional entries retain their own provider. Cached
totals say Legacy cache rather than inventing a source. The same defensive list
and sources are retained in full references. Player, theme, paragon
path, epic destiny and company occupy the header's identity area when present.
The summary reminder column uses feature/item source metadata to split actionable
entries into class, racial, feat and item-property panes, retaining unattributed
effects in Other reminders. Empty categories are omitted; measured truncation
accounts for pane overhead and retains omitted entries in full references.
Equipped item reminders handle both freeform `Property` paragraphs and declared
weapon/superior-implement `Properties` keywords. Named properties use the item's
authored Full Text Properties section first, then matching Weapon Property
definitions; numeric and parenthetical parameters are retained. Conditional
target-dependent wording such as `against ... enemies subject to your effects`
is actionable even without `when`/`if`. Plain always-on numeric bonuses, item
powers, flavor and group prose are not promoted by this extraction. This remains
a display heuristic, not exhaustive proof of automatic calculation coverage.
Missing/malformed explanations are not invented; original item/card/reference
fields remain intact. Hidden item cards do not suppress equipped reminders.
All extracted properties for one item display name are grouped as separate
paragraphs under a single reminder heading, with duplicate paragraphs omitted.
The grouped entry is a single measured fitting unit and remains complete in
references when it cannot fit the summary.
Evaluated weapon/implement variants retain a stable inventory `equipmentId` for
display projection. Their sheet names reuse the inventory's shared composed-name
formatter (including explicit custom names), not the engine's component-name
string. Older in-memory results can resolve by their exact power:inventory
variant identity; unknown/unarmed names retain their existing fallback. This
changes presentation only, not rule identifiers or attack/damage calculations.

The semantic model exposes identity, final abilities, defenses, resources,
senses, skills, feature groups, notes, inventory, powers, and cards. The browser
renderer supplies a conservative desktop/tablet layout modeled on the legacy
sheet's familiar hierarchy, not its proprietary artwork.

M5.6 refines that browser renderer into an authoritative read-only **View** mode
as the final major original-Character-Builder-parity surface. M5.7 cleans up the
parity UI and prepares the existing PWA/container foundation for invited beta.
M5.8, explicitly beyond parity, adds a distinct desktop/tablet **Play** mode over
the same `SheetDocument` and card models. Play mutations belong exclusively to
persisted `PlayState` and its deterministic commands; they do not rewrite
evaluated snapshots or the durable character build. M6 depends on M5.8 and
adapts those commands and models to a task-oriented phone interface rather than
shrinking the desktop Play sheet.

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

Fixed print cards use their measured body height to select normal, compact, or
condensed typography, starting with the largest size. Only rendered content
affects fitting; omitted fields and inactive level variants do not shrink the
text. Weapon summaries inherit body typography, and card fitting runs when
print preview or print media makes the otherwise hidden cards measurable.

Power variants retain per-attack bonus, damage expression, damage type, and
explicit hand role. Printed summaries use a compact `+bonus → expression`
form without repeating the defense or word `damage`. Distinct phases form a
bottom table with one weapon row and numbered attack columns; single attacks
and identical phase calculations use separate weapon, to-hit, and damage
columns labeled Weapon, Attack, and Damage. Equality compares resolved ability,
numerical to-hit, damage expression, and availability, not defense or hand-role
labels. Distinct columns stay labeled Attack 1, Attack 2, etc. Matching
known bonuses across phases for every weapon, but differing damage, use one
shared Attacks column and numbered Dmg columns instead. Damage types remain
in the data and authored rules rather than being repeated in the table. Authored Hit text retains conditions,
ongoing damage, and other riders. Legacy caches with only one attack/damage
summary cannot supply missing secondary calculations; unavailable phase cells
show a dash, and companion math remains explicitly unsupported.

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
