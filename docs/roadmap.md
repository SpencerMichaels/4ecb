# Delivery roadmap

## How milestones are used

Each milestone ends in a demonstrable, internally coherent release. A milestone
is complete only when its exit criteria pass; code existing on a branch is not
completion. Compatibility gaps discovered during implementation are recorded in
the parity report and either resolved or explicitly moved with rationale.

The sequence minimizes throwaway work while producing useful tools before the
full builder MVP.

## M0 — Compatibility and planning baseline

**Status:** substantially complete; this documentation closes its product-planning
portion.

### Outcomes

- Recovered file, content, rule-language, character-engine, campaign, and
  application-workflow specifications.
- Reproducible Nix analysis environment and smoke suite.
- Synthetic schemas and fixtures plus decompiled evidence.
- Product definition, architecture, release boundaries, and decision log.

### Exit criteria

- Existing reverse-engineering smoke suite passes.
- The modern plan links every required major feature to an owning subsystem and
  delivery milestone.
- MVP and final-product boundaries are explicit.
- Known legal/content-distribution constraint is reflected in architecture and
  deployment.

## M1 — Workspace and content-pack foundation

**Status:** complete (2026-08-31). Verification evidence and intentional M2
boundaries are recorded in [implementation-status.md](implementation-status.md).

### Goal

Establish the production monorepo and deterministically compile the legacy
corpus into an internal content pack.

### Deliverables

- TypeScript monorepo, formatting, linting, tests, build orchestration, and CI.
- React/Vite application shell with routing, error boundaries, worker RPC, and
  a deliberately minimal accessible component foundation.
- `content-domain`, `content-pack`, and `legacy-wotc` packages.
- First content-tool commands: `build`, `inspect`, `validate`, and `diff`.
- Deterministic pack manifest, normalized entities, provenance, diagnostics, and
  digest.
- Client-side pack import into IndexedDB with progress and cancellation.
- Synthetic freely distributable sample pack for CI and public development.

### Exit criteria

- Two builds from identical inputs produce byte-identical or canonically
  identical packs and the same digest.
- The full local corpus imports with every record accounted for as accepted,
  warned, or rejected; no silent drops.
- A pack can be imported, verified, activated, deactivated, and removed in the
  browser without corrupting user records.
- CI requires no proprietary corpus; a documented local full-corpus test path
  exists through `nix develop path:./reverse-engineering`.
- A development and production Docker image serves the application shell as an
  unprivileged process.
- The shell demonstrates coherent navigation, responsive structure, and all
  basic system states without making a finished theme or animation system an M1
  dependency.

## M2 — Compendium vertical slice

**Status:** complete (2026-08-31). Query semantics and measured budgets are in
[query-engine.md](query-engine.md); verification evidence is in
[implementation-status.md](implementation-status.md).

### Goal

Deliver the first independently useful public-facing capability and benchmark
the real content/query workload.

### Deliverables

- Worker-hosted query engine and serializable query AST.
- Cross-type search plus entity-specific pages for powers, feats, items, races,
  classes, paths, destinies, backgrounds, rituals, and other recovered types.
- Full-text search, range filters, facets, exclusion filters, sorting, stable
  paging, and detail relationships.
- URL/local saved-query representation that does not expose imported content.
- Pack/profile selector and basic diagnostics UI.
- Keyboard and screen-reader accessible filters and results.
- Measured performance budgets established from desktop and representative
  tablet hardware.

### Exit criteria

- Every normalized entity is discoverable by stable ID and appropriate typed
  filters.
- Search correctness has fixture tests for tokenization, facets, ranges,
  combinations, and stable ordering.
- Representative queries meet the measured budgets fixed during this milestone.
- Index construction does not block the UI thread and recovers from cancellation
  or tab restart.
- The application and private content pack operate offline after installation.

**Release characterization:** useful compendium alpha; not a character builder.

## M3 — Legacy character import, library, and read-only sheets

**Status:** complete (2026-08-31). The compatibility/storage contract and
verification evidence are recorded in
[character-import-and-sheets.md](character-import-and-sheets.md) and
[implementation-status.md](implementation-status.md).

### Goal

Make existing character collections usable without yet claiming full editing
parity.

### Deliverables

- Versioned IndexedDB character repositories and native backup/restore.
- Loss-preserving `.dnd4e` parser and import report.
- Character library, metadata editing, duplication, deletion with recovery, and
  content-profile binding.
- Read-only character inspection using authoritative selections and clearly
  labeled legacy cached calculations where engine coverage is incomplete.
- Initial `sheet-model`, browser renderer, print preview, and power/item cards.
- `.dnd4e` export/re-import pipeline with preservation diff.
- Missing-profile and missing-content recovery UX.

### Exit criteria

- All supplied sample characters import without crashes and produce actionable
  reports.
- Unknown elements/attributes in test fixtures survive a round trip where XML
  structure permits preservation.
- The original builder can open a curated set of exported characters, or every
  failure is documented with a compatibility fixture.
- Browser sheets contain the expected major sections and selected card content.
- Letter and A4 preview have no clipped sections or cards in automated golden
  tests.
- Backup/restore round-trips characters, profile bindings, sheet settings, and
  preserved legacy envelopes.

**Release characterization:** character viewer/import alpha; deliberately not
the MVP.

## M4 — Rules engine and generic character editor

### Goal

Implement the hardest compatibility core and build an editor driven by that core.

### Deliverables

- Recovered rule-language IR and evaluator.
- Fixed-point update lifecycle, grants, choices, prerequisites, stats, text
  updates, aliases, power modifications, and item/equipment behavior.
- Level history, starting at higher levels, advancement, and retraining.
- Modifier provenance and legality diagnostics.
- Recovered hard-coded exceptions with focused fixtures.
- Character commands, transactional edits, and session undo/redo.
- Generic builder shell and focused views for all core character domains.
- Engine parity reporter over synthetic fixtures and the private corpus.

### Exit criteria

- Every recovered rule statement and category-expression form has direct tests.
- Every documented hard-coded exception is implemented or marked as a blocking
  incompatibility with an approved resolution plan.
- A representative matrix across tiers, races, classes, builds, power sources,
  equipment styles, companions, and custom content can be created and advanced.
- Golden characters match expected selections, legality, statistics, attacks,
  power variants, and equipment at the agreed parity threshold.
- No UI component contains an alternative calculation formula for an
  engine-owned value.
- Invalid and incomplete characters remain editable and explain every blocking
  issue.

**Release characterization:** builder beta; broad compatibility work may still
block MVP declaration.

**Status (2026-08-31): complete.** The authoritative editor, public cross-tier
goldens, exception ledger, parity reporter, and background evaluation worker are
verified. Unresolved native `SpecialCase`, hand-specific, historical-profile,
and prerequisite-tail findings are explicitly carried into M5, whose first
deliverable is closure of blocking M4 parity findings.

## M5 — MVP closure: credible legacy-builder replacement

**Status (2026-09-01): complete.** Automated closure passes, and the product
owner successfully opened, saved, and reopened several regenerated real level-8
characters in the original builder. Verified checkpoints make content-profile migration a
worker-evaluated preview followed by explicit adoption and add checksummed
backup inspection, restartable character migration recovery, persistence
requests, quota diagnostics, an installable offline PWA with explicit update
prompts, a hardened public Docker boundary, public-distribution notices, and
exact-profile authoritative browser sheets with a visible legacy-cache fallback.
Edited export now has explicit byte-preserving and 0.07a regenerated targets
with a semantic re-import gate. Automated Chromium and Firefox Letter/A4 PDF
matrices pass as functional regression evidence; broad cross-browser visual
print review belongs to 1.0 hardening after the real interface is designed. The
Representative original-application open/save/reopen compatibility is therefore
accepted at the M5 boundary; later character-specific findings remain ordinary
compatibility bugs rather than reopening the milestone. Content onboarding now provides bounded read-only
directory discovery plus an ordinary `.4ecp`/decrypted-rules file fallback.
Administrator runtime configuration may also advertise an ordered immutable
same-origin baseline; verified downloads cache offline without activation, and
users explicitly compose/adopt personal overlays above it. Materialized profile
digests and ordered layer bindings preserve existing character behavior.
The public import/rendering security pass, automated storage durability matrix,
and route-focus/contrast/responsive structural baseline are complete.
Exhaustive keyboard-only, screen-reader, zoom/reflow, and touch-target testing
across a formal matrix is not part of this project's plan (see decision D063);
continuous structural safeguards remain, and real reported problems are fixed
as ordinary bugs. The user
and recovery handbook now covers installation,
private content, profile migration, import/export, sheets, storage, updates,
recovery, and the known release limitations required by exit criterion 10.
First-class native creation now binds a blank level-1 build to an exact profile,
uses the generic evaluator/editor for required identity choices, advances with
canonical level records through 30, persists/reloads, and regenerates the edited
0.07a target. Deterministic audits against the 38,339-record private profile now
complete Human/Fighter, psionic Psion, companion Shaman, and Essentials Knight
paths through level 30, plus a recorded Hybrid Cleric/Fighter path through level 30. The older Hybrid report omitted its component IDs and is historical evidence
only.
They cover nested choices, ordinary and class-specific power replacement,
equipment, serialization, authoritative sheet construction, and edited-export
semantic re-import. This closes the automated cross-family advancement boundary
without claiming a private differential for every published build.
The first focused power-math closure slice now carries the saved main-hand
selection into explicit paired variants and implements the distinct off-hand
enhancement calculation for `Dual Implement Spellcaster`, backed by exact public
same-profile differentials. Remaining named/situational power exceptions use
the explicit diagnostic boundary below.
The following slice separately projects the recovered Hunter's Quarry,
Warlock's Curse, and Sneak Attack conditional damage families, including hybrid
class-power gates and Sneak Attack weapon eligibility. Unknown variants remain
unsupported under that boundary.
The recovered fixed-output `SpecialCase` slice now also covers Bond of
Censure's tier dice and ability suppression plus three exact ongoing-10 hit
forms and the exact Dexterity-modifier ongoing form. Exact-profile Hu power
fields consequently match 52/52, while a separate level-5 native selection
audit covers the Dexterity branch. Five identified native special entities
remain explicitly unsupported and recoverable.
Beast-ability damage now has an explicit provenance guard: character abilities
are not silently substituted for absent companion scores. The full-profile
native audit still fails to materialize a companion occurrence, so companion
ability substitution reports its absent provenance instead of guessing.

The remaining compatibility tail is closed for the automated M5 boundary by an
explicit support contract: exact implemented families calculate
authoritatively; `native-special-case:*`, `companion-ability:*`,
`prerequisite.unverified`, and unparsed-power diagnostics preserve unsupported
content visibly and editably. Item-set and inherent-bonus rules execute only
when imported or serialized content activates them; the application does not
invent an absent legacy campaign setting. Exact activation artifacts remain the
future validation path, not an unreported assumption.

### Goal

Turn the M4 builder into a credible, publicly deployable functional replacement
without treating its intentionally provisional interface as final.

### Deliverables

- Closure of blocking parity findings from M4.
- Complete `.dnd4e` import/export UX and compatibility target selection.
- Profile migration preview and explicit adoption.
- Finished browser sheet, Letter/A4 print layouts, blank-field controls,
  monochrome mode, power/item card options, and browser PDF workflow.
- Data-directory and portable-pack onboarding with ordinary file-input fallback.
- Storage persistence request, quota diagnostics, migration recovery, and
  verified backup/restore.
- Installable PWA, update UX, offline tests, and production Docker documentation.
- Public-distribution notices and separation from proprietary content.
- Structural accessibility, primary-browser functional smoke coverage,
  untrusted-input security review, and development-host performance budgets.

### MVP exit criteria

All of the following must be true:

1. A new user with a valid private content pack can create, advance, retrain,
   equip, save, reload, print, and export a level 1-30 character without the old
   application.
2. Core character-building behavior is generic across imported content; the
   release is not limited to a showcased subset of classes.
3. The agreed golden corpus passes calculation, choice, legality, power, item,
   and round-trip thresholds with no unexplained mismatches.
4. Exported compatibility characters open successfully in the legacy builder
   across the curated test matrix.
5. Character data survives browser restart, application upgrade, backup/restore,
   and interrupted migration tests.
6. Compendium and builder function offline after installation.
7. Sheets print correctly on Letter and A4, include familiar readable cards, and
   can blank mutable table fields.
8. The public Docker image and hosted build contain no proprietary official
   corpus.
9. Core workflows pass automated and live functional checks in the primary
   development browser, while semantic structure, labeled controls, basic
   keyboard operation, and non-forced viewport sizing remain intact. This
   project does not run a formal cross-browser/device or
   assistive-technology-matrix certification (see decision D063).
10. Installation, content import, backup, recovery, upgrade, and known
    compatibility limitations are documented.

**Release characterization:** functional MVP / core builder release; designed
Builder/Equipment closure follows in M5.5, the printable sheet in M5.6 (interactive View
deferred to M6), and invited-beta UI/deployment preparation in M5.7. Local play begins beyond parity
in M5.8; a lightweight stabilization pass remains staged in M9.

## M5.5 — Builder and Equipment interface closure

**Status (2026-09-28): complete.** The product owner approved the shipped
builder, library, Inventory/Loadout, Shop, unavailable-option, and item-owned
choice interactions after the recorded prototype and production review loop.
The exit-criterion evidence map is in
[`implementation-status.md`](implementation-status.md).

The product-owner direction for this milestone is recorded in
[`interface-design-brief.md`](interface-design-brief.md). Product design and
prototype approval precede the View refinement and later Play milestones. This project
does not run a formal assistive-technology/keyboard/zoom/touch-target
certification matrix (see decision D063); structural accessibility and
ordinary keyboard operation remain continuous constraints, and a lightweight
best-effort browser check remains part of M9.

### Goal

Close the durable builder, library, and Equipment interfaces with the product
owner. This work intentionally follows core builder parity so the accepted
interaction model can become the stable input to sheet and play-mode design.

### Deliverables

- Short UI prototype/review cycles covering information hierarchy, density,
  navigation, forms, choice resolution, typography, color, and restrained motion.
- Complete Loadout, Inventory, Shop, and Rituals & Practices workflows with one
  coherent Equipment information architecture and shared detail presentation.
- A redesigned unavailable-options workflow and an approved acquisition/display
  home for choices granted by items, preserving their exact occurrence identity.
- Focused functional smoke runs in the primary development browsers, preserving
  semantic structure, labeled controls, ordinary keyboard use, responsive
  layouts, and the existing automated print regression gate.
- Reconciled product and implementation documentation for the interface that
  actually ships, including removal of the former standalone Compendium.

### Exit criteria

- The product owner approves the principal builder, library, and Equipment
  interactions through the agreed feedback loop.
- Loadout, Inventory, Shop, and Rituals & Practices support their principal
  inspect, acquire/manage, and edit workflows without relying on the retired
  Compendium page.
- Unavailable candidate browsing and item-owned choices have approved homes in
  the interface and retain exact rules/serialization identity.
- The public functional gate and focused Chromium/Firefox workflows pass, with
  structural accessibility and responsive-layout safeguards intact.
- The roadmap, design brief, status record, and user-facing documentation agree
  on the shipped interface and on work deliberately deferred.

**Release characterization:** designed builder and Equipment release candidate.

**Initial M5.5 checkpoint (2026-09-02):** The first working builder-interface
draft is implemented over the real rules/storage commands. It establishes the
compact overview, complete level timeline, focused choice pane, temporary
show-all legality filter, truthful autosave states, responsive desktop/tablet
foundation, system/light/dark themes, monochrome interface icons, and existing
4E power-color semantics. Current level and saved future frames now operate as
separate evaluation/export projections; lowering the visible horizon is a
non-destructive session view until a dedicated persisted preference is added.
This checkpoint began the prototype feedback loop. At that point, the final
milestone reconciliation and the remaining Equipment/unavailable-choice work
were still required; the later checkpoints and closure record below supersede
that open-work statement.

The second product-owner review makes each level the main-pane workspace. Its
Class, Race, Background, Theme, Ability Scores, Companion, Skills, Powers,
Spellbook, Feats, and optional Retraining categories now appear as a horizontal
tab list, with only the active category mounted; the timeline remains its
compact status and navigation summary and opens the corresponding tab. Up to six
repeated background slots share one candidate table, and skill training uses a
single toggle list with an explicit chosen/required count. The
legacy placement of item-owned resistance choices in the Class pane is
documented for compatibility. The later accepted design resolves those choices
during Shop acquisition and presents their results with the owned item rather
than copying them into the advancement flow.

The follow-up choice pass adds exact legacy support for the three Archery
Mastery power replacements and groups large parenthetical feat families into a
family-plus-parameter control without changing the exact stored feat identity.
Feat and power selections now use searchable metadata tables: feat rows expose
the authored short description while prerequisite text remains searchable and
available in the detail pane; power rows use accessible monochrome action/attack
icons and authored flavor. Repeated
slots share one multi-select surface. Candidates are grouped into collapsible
legacy-derived type sections, the complete matching set is available without an
artificial row cap, and persistent content-ID favorites can be filtered while
the user compares options. Full-corpus profiling did not justify virtualization;
the table remains a bounded scrolling region.
The application shell retains decoded packs, rules workers, and memoized exact
evaluations across client-side route changes. The former general Compendium
worker and its browser index were later retired as unused (D062); Shop's
memoized main-thread filtering operates over content loaded once per character
session.
The persistent level timeline has been reduced to a narrow status/navigation
rail so the choice editor and its adjacent option detail remain the primary work
area. A sibling Overview tab now replaces the expanded-plan overlay and bottom
history disclosure with navigable Character, Ability Scores, Companion, Skills,
Powers, Spellbook, Feats, Retraining, and Other checklists whose rows carry their owning levels; it
does not duplicate the list with a raw “Stored features” tree. Planned levels are hidden
by default and the temporary toggle reveals only future frames that contain a
saved choice. Ordinary detail cards and sections grow naturally with the
document instead of introducing nested scrollbars; candidate tables remain the
intentional bounded-scroll exception. The rail exposes all 30 levels in
collapsible Heroic, Paragon, and Epic tiers. Navigating beyond the saved horizon
extends the plan automatically without advancing the current character,
replacing the separate plan-horizon input.
The latest density pass removes the remaining outer choice-pane card, integrates
the selected level as a non-clickable leading label in the category-tab strip,
and lets the selection and detail surfaces stand directly on the page
background. The temporary unavailable-options control is withheld until its
later focused redesign.
Planning legality now uses the projected character at each choice's acquisition
level rather than the final plan horizon: same-level increases and features may
satisfy prerequisites, while later selections cannot retroactively unlock an
earlier feat. The rules engine applies this consistently to candidate tables and
saved-choice diagnostics using bounded, prefix-keyed historical snapshots.
Character records now support portable portraits with a drag-and-zoom circular
crop editor. A prominent portrait identifies cards in the Characters library, a
prominent control accompanies the editable builder title, and the same circular
rendering appears on the printable character sheet. The normalized source, crop, and small
rendering travel with duplication and checksummed library backups but never alter
legacy `.dnd4e` exports. Only the builder exposes the editor; library and sheet
portrait displays remain read-only.
Rules-choice dropdowns have now been reduced to the compact numeric current-level
selector. Small sets use visible button/radio grids; larger and
information-rich choices share the searchable, favorite-able candidate table.
That table now covers Deity (with an Alignment column), starting presets, and
generic large choices in addition to feats and powers. Equipment and Diagnostics
are peer workspace tabs rather than disclosures below the builder, establishing
the dedicated surface for the next equipment pass.

The equipment pass now provides an Inventory-first Equipment workspace whose
Loadout control swaps the main pane while retaining the shared inspector, plus
a peer Shop workspace whose Browse taxonomy includes rituals, formulas, and
practices. Exact slot/copy assignments augment rather than replace legacy
equipped counts; a five-denomination carried/stored wallet
uses inherited per-level compatibility strings; and atomic buy/sell operations
retain exact holding IDs. The full item and practice catalogs use memoized
main-thread filters, level ranges, and bounded pages.
Compatible terminal `+N` magic variants share a presentation family while exact
filtered variants, base/enchantment IDs, and transaction identity remain
unchanged. Known rituals/formulas/practices are distinct from quantity-bearing
scrolls, and Spellbook remains in Build. Dependent hand/ring movement,
holy-symbol/implement exceptions, augments, package lots, automatic/custom
equipment remain named follow-up work rather than silently approximated
native parity. Item-owned choice handling (for example an Armor of
Resistance damage type) is implemented (2026-09-24, simplified 2026-09-24,
paginated per-choice with a Power detail card 2026-09-25, a chosen
candidate's own further choice resolved at purchase time rather than
leaking into the Build tab 2026-09-28): a Shop purchase whose item grants
its own choice (one or more) prompts for each on its own paginated dialog
page, in order, before any compatible-base-item pairing — a Power choice
gets a two-column picker-plus-detail-card page so the player can see what
each option does, a simpler choice stays a plain picker, and a further
choice the chosen candidate itself requires gets its own nested page too,
recursively, rather than ever surfacing later as a locked, mis-categorized
Build-tab choice. A resolved choice shows as a parenthesized suffix on the
item's own name
everywhere it is displayed — `Banded Mail of Resistance +2 (Fire)` — and a
resolved Power choice also gets an adjacent sibling detail card after the item's
full card, the same way a granted power is presented; the choice is fixed
for the life of the item, matching the product owner's stated real-world
model. There is deliberately no in-app editor for an already-owned holding
whose choice was never resolved (not observed in practice; every purchase
resolves it, and legacy imports either already carry the recovered choice
or didn't have one in the original game either).

Builder navigation now participates in browser Back/Forward at the page-like
boundary: workspace tabs, Build levels and choice sections, Equipment's
Inventory/Loadout state, and Shop Browse state have bookmarkable canonical
hashes. Overview jumps
directly to one final Build destination; in-page filters, disclosures, choices,
and edits do not add history entries. Invalid or unavailable nested values
recover by replacement without disturbing library or character-sheet routes.

**M5.5 closure (2026-09-28):** The builder, library, Loadout, Inventory, shared
detail cards, navigation, candidate tables, header statistics, Shop, and
ritual/practice browsing all received accepted product-owner passes. The final
review also approved the shipped per-table illegal-option control; recursive,
purchase-time item-owned choice flow; resolved-name suffix and sibling Power
card; destructive-only two-click confirmation; immediate reversible equipment
changes; and matched compact wallet sizing. The product owner gave final
approval to the resulting shipped interaction on 2026-09-28. All exit criteria
pass; the evidence map and latest verification totals are recorded in
[implementation-status.md](implementation-status.md).

This closure deliberately leaves browser View to M5.6, final UI cleanup and
invited-beta hostability to M5.7, local desktop/tablet Play to M5.8, phone
adaptation to M6, and the lightweight best-effort browser/visual-print,
security, migration, and representative-device hardening pass to M9. The
project does not run a formal release-client or accessibility-certification
matrix (D063). Remaining native equipment edge cases named in D044 are visible
compatibility limitations under the existing support contract, not hidden
M5.5 interface blockers.

## M5.6 — Printable character sheet

**Status (2026-10-16): complete.** The product owner accepts the printable sheet:
page-1 summary and continuations, scratchpad, character reference pages, power
and item cards, and the Session Notes template, reviewed against real characters
in the browser print preview. Scope was narrowed by product-owner decision: the
interactive browser View sheet is unfinished and moves to M6, where it will be
designed alongside the mobile interface. Until then the builder's Character
sheet tab and the library's sheet action open print preview directly
(`#/characters/:id?preview=1`). The synthetic dense-card overflow assertion
(Synthetic power 01 at the 6.5 pt floor) is accepted as a known boundary for
pathological card text rather than a closure blocker; the fixture and assertion
are unchanged. Closure verification: all 910 workspace tests, workspace
typecheck and lint pass through Nix, plus product-owner visual review; the
automated print matrix was not rerun for closure. The original View-oriented
goal and exit criteria below are retained for history and now belong to M6.

**Final print audit follow-up (2026-10-16):** Implemented encumbrance in Items,
populated Character Details at the start of Character Record (including Size,
without expanding page 1), page-1-style reminder continuation panes, and ruled
identity/title/page footers on card pages without changing physical card sizes.
Current order is summary/nearby continuations, scratchpad, references, then cards,
with continuous numbering. Owner feedback and the recorded dense-card print-fit
gate remain; this is not milestone closure.

**Overview real-data review (2026-10-14):** The approved summary/scratchpad study
is now connected to the shared sheet model in print preview. Full feature/feat
rules, equipment, power indexes and character notes paginate into reference
pages; the accepted physical cards remain unchanged. Continue owner feedback
against actual characters. This does not close M5.6 or resolve its existing
dense-card print-fit blocker. See `sheet-overview-prototype.md`.

**Summary and scratchpad accepted (2026-10-15):** The product owner accepts
page 1 and the working-surface scratchpad,
with segmented surge tracking, reserved handwriting areas and measured power-use
continuations. Reference pages and the known summary-continuation style mismatch
remain separate review work; this does not close M5.6. Full character reference
pages now follow the power/item cards in a first draft for owner feedback, with
origin groups sorted by level/name, full-description panes, and full-width
equipment and power indexes (separate Range/Target columns). This is not final
reference acceptance or milestone closure.

**Printed-card product review accepted (2026-10-14):** Power and item card
presentation is accepted after the fixed-size layout, equipment comparisons,
item-power grouping, action/sustain indicators, readability settings, additional
effects and class-feature-specific clause refinements. This is a card checkpoint,
not milestone closure. Next: refine the first two reference pages of the printable
sheet. The automated dense-card overflow boundary remains explicit; see the
current verification results in `implementation-status.md`.

### Goal

Bring the authoritative browser **View** sheet to a refined, product-owner-
approved state so the web application is mostly at parity with the original
Character Builder. This milestone is read-only sheet/reference work: print
remains its existing page-oriented presentation, while mutable at-table play is
explicitly deferred beyond parity.

### Deliverables

- A refined browser View sheet with approved information hierarchy, navigation,
  reference cards, equipment, rituals, notes, and print entry points.
- Browser reference coverage and familiar information geography sufficient to
  replace the original Character Builder's normal character-viewing workflow.
- Clear View, Build, and print entry points over the shared semantic
  `SheetDocument` and card models, without introducing mutable play state.
- Focused product-owner prototype/review cycles for the View hierarchy,
  density, reference-card treatment, navigation, and recovery states.

### Exit criteria

- The product owner approves the principal browser View interface as the
  refined character-reference experience.
- A representative character can be inspected through all major sheet sections,
  cards, equipment, rituals, and notes with an obvious path to existing print
  preview.
- Exact-profile values remain rules-derived and reproducible; missing-profile,
  nonconvergent, and legacy-cache recovery states remain explicit.
- View and print consume the shared semantic sheet/card model without
  presentation logic entering the rules engine.
- Browser View has focused automated coverage and a live representative
  workflow pass, with no mutable `PlayState` feature required for completion.

**Release characterization:** refined browser character reference; mostly at
original Character Builder parity.

**Initial M5.6 checkpoint (2026-09-30):** The first reviewable View now separates
the screen reference from the page-oriented print template while both consume
the same semantic sheet model. Screen View has an at-a-glance summary, sticky
section navigation, complete interactive power references, equipment and item
references, learned rituals/formulas/practices, features, notes, recovery
guidance, and direct Build/print entry points. Print retains the established
three-column card grid but moves long features, equipment, learned references,
and notes out of narrow summary columns. Card projection filters machine-only
metadata, preserves repeated authored clauses in order, exposes flavor and
prerequisites, and normalizes the small legacy table-markup vocabulary without
interpreting arbitrary HTML. Product-owner review and any resulting hierarchy
or density revisions remain required before milestone closure.

**Print parity revision (2026-09-30):** Product-owner review rejected the first
generic print flow. The replacement follows the supplied Hu and Fei Zhu sheets
and recovered CharacterSheetViewer layout: two bounded, purpose-built reference
pages precede fixed-aspect physical cards; cards are explicitly chunked nine per
page in a three-by-three grid, never expand with content, omit flavor and
presentation metadata, and use compact legacy-style power and item projections.
Chromium and Firefox now verify the resulting five-page synthetic Letter/A4
matrix in both color modes. Further product-owner visual review remains part of
M5.6.

**Per-attack card revision (2026-09-30, refined 2026-10-01):** Printed power
cards treat each authored attack phase independently. A compact row now combines
the calculated total, resolved authored formula, and defense—for example,
`⚔ +12 · STR+2 vs AC | One creature`—while the associated Hit and following
phase-bound effects remain immediately beneath it. Numbered multiattacks use a
compact ordinal; `Fortitude` and `Reflex` shorten to `Fort` and `Ref` only in the
calculated header cell. The attack cell fits its content and long targets wrap
in the remaining width. The action/range and attack header bands remain
contiguous; requirements and other setup rules follow the first attack band
before its Hit text.

**Usage-first card revision (2026-10-01):** Physical power cards now emphasize
the At-Will, Encounter, or Daily limit players most often need during play.
Usage drives the default green/red/gray treatment, Utility is an additional word
in the bottom type bar, and numeric level shares that same bar at the right. The
Utility bottom bar remains blue while the rest of the card uses its usage color.
The legacy three-checkbox matrix and separate class/level/source footer are
gone. An off-by-default Display setting can switch every Utility card accent to
blue for users who prefer the original builder's convention without hiding the
actual usage text.
Live review confirmed both the default and legacy-blue projections.
Utility classification now follows explicit `Power Type: Utility` metadata
rather than treating every attackless card as Utility; non-Utility delegated
attacks and feature/rules-item cards retain their actual identity without an
invented attack row. Printed title bars omit a used-state checkbox, action icons
are optically centered, and Opportunity Action uses the reaction symbol. Rule
clauses use semantic inter-section spacing: attack-resolution and trigger/effect
groups stay tight, while independent clauses separate; the gap tightens only
for compact or condensed fixed-size cards. Each weapon-compatible power lists a
compact weapon-name, total-bonus, and damage row for every compatible owned
weapon after its authored rules, without repeating equipment state or the
defense already visible in the header; the equipped-first variant continues to
drive the header calculation. Attack and damage calculations are phase-aware:
all summaries use a bottom table with one row per weapon. Single attacks or
identical repeated calculations have separate Attack and Damage columns;
distinct phases add numbered attack columns. Damage types remain in the
calculation data and authored rules, but are not repeated in the table.
Cards measure their rendered body to choose the largest fitting text size;
weapon summaries share that size. Explicit main/off-hand roles constrain the
equipped phases; inventory alternatives remain hypothetical loadouts. Missing
legacy phase data and unsupported companion calculations remain visible as
dashes and authored rules rather than acquiring inferred totals.

## M5.7 — Invited-beta UI and hostability preparation

### Goal

Complete the final UI cleanup around the parity product and make the existing
static PWA/container foundation easy for the product owner to host for a small,
known beta group: friends in their D&D group. This is beta preparation, not a
new server-owned data architecture and not the later M9 release-hardening pass.

### Deliverables

- A final coherent cleanup pass across the shipped builder, library, Equipment,
  browser View, print entry, settings, onboarding, empty/error/recovery states,
  and cross-workspace navigation.
- Character-specific power-card prose in in-app detail cards, browser View, and
  print shows known named ability modifiers and half-level values inline, with
  a display preference that resolves authored ability alternatives to the
  character's best available option.
- Calculated power cards in Equipment and browser View offer an equipped-first
  selector and compact comparison of every compatible owned weapon. Optional
  tooltip abbreviations and selected-weapon `[W]` expansion remain browser-only;
  print keeps authored prose and lists concise calculated lines for compatible
  equipped variants. Build selection cards instead retain general formulas,
  complete authored Hit clauses, and authored combat order in one consistent
  rules layout, with compact numbered labels for primary and subsequent attack
  phases and uninterrupted Attack/Hit/following-Effect groups. Damage-only Hit
  rows collapse to a concise Damage formula; any rider retains the full Hit row.
- Settings presents ordinary appearance, content, backup, and storage jobs in
  plain language, with content layering identities and diagnostics behind
  deliberate advanced disclosure.
- A reproducible beta image and straightforward small-group run/update procedure
  built on the already implemented unprivileged static-PWA Docker image, health
  endpoint, runtime configuration, and private-content boundary.
- Operator guidance for HTTPS/reverse proxy setup, private pack advertisement,
  browser-local data ownership, backup expectations, upgrades, rollback, and
  beta feedback/known-limit reporting.
- A focused end-to-end invited-beta rehearsal: clean-browser onboarding,
  install/offline reload, content setup, character workflow, backup/restore,
  image restart/update, and recovery guidance.

### Exit criteria

- The product owner approves the final parity-surface cleanup for invited beta.
- A clean host can build and run the documented production image, expose the
  health check, apply non-secret runtime configuration, and serve the PWA behind
  HTTPS without bundling proprietary content.
- A beta tester can follow the documented onboarding path, use the builder/View
  workflow, install and reload offline, and create and restore a portable backup
  without operator access to browser-owned character data.
- The beta rehearsal records exact commands, observed results, known limits, and
  a rollback/update path suitable for the product owner's small D&D group.
- The milestone does not claim M9's broader browser/visual-print, security,
  migration, representative-device, or release-performance hardening.

**Release characterization:** easily hostable invited beta of the parity
builder; the container foundation predates this milestone and broader 1.0
hardening remains in M9.

## M5.75 — Editable printed sheet

### Goal

Let players choose what their printed sheet contains without touching the
build: View and Edit modes on the print preview, hiding cards and pages,
reminder control and card ordering (plan and owner decisions:
[`sheet-editing-plan.md`](sheet-editing-plan.md), D099).

### Phases

0. **Done (2026-10-25).** Stable card keys from provenance and the card
   deck in sheet-model (`sheetCardDeck`); no visible change.
1. **Done (2026-10-25).** `SheetLayout` persistence, `?preview=1&edit=1`
   and the toolbar View | Edit control; right-click (or a key on a focused
   card) to hide/show cards (item cards via `showPowerCard`), with hidden
   cards always shown in Edit mode (header kept, body marked "Hidden"); a
   toolbar Sections menu of section checkboxes (overview and card pages
   included, none locked) whose rows reorder by drag or Alt+Up/Alt+Down
   (section ordering pulled forward), with copies of the unnumbered
   scratchpad and session notes; and a global Reset in the toolbar.
2. **Done (2026-10-26, after phase 3).** Reminders: right-click a page-1
   reminder row (or a continuation row) in Edit mode to hide or show it;
   power-card riders, Action Point riders included, are offered off by
   default (the Action Point special case is gone), one row per source;
   same-page duplicates are never offered. Custom reminders, provenance
   hints, per-row/per-section reset and starring were not approved.
3. **Done (2026-10-25).** Card ordering: drag a card onto another, on any
   page, in Edit mode (drag only, no keyboard reorder for now); stored as
   `cardOrder` only when it differs from the default deck order and merged
   with the current deck (new cards follow their default predecessor).
4. Optional: reminder ordering, one-off print scope.

### Exit criteria

- Layout edits never re-evaluate the character or move "last modified".
- Each phase's synthetic tests (key stability, round trips, routes, page
  renumbering) pass, and the owner approves the panel visually, including at
  140% zoom.

## M5.8 — Desktop/tablet local-play foundation

### Goal

Add the first mutable at-table experience beyond original Character Builder
parity. Establish renderer-independent play state and a desktop/tablet Play
sheet before any phone-specific adaptation.

### Deliverables

- A desktop/tablet Play sheet backed by first-class, separately persisted,
  versioned `PlayState`, deterministic commands, operation history, and undo.
- Interactive HP, temporary HP, surges, action points, death saves, power usage,
  recharge/rest, and structured effect workflows using shared card models.
- Clear state ownership and switching among View, Play, Build, and print,
  including persistence after reload and explicit reconciliation of durable
  character changes, temporary equipment, and treasure.
- Product-owner prototypes and approval for the desktop/tablet Play interaction
  and the shared state/command vocabulary that the later phone surface adapts.

### Exit criteria

- The product owner approves the principal desktop/tablet Play interface.
- Derived rules values remain reproducible from the character and profile;
  mutable table state is isolated in versioned `PlayState` with provenance.
- Damage, healing, temporary HP, surges, action points, death saves, power use,
  recharge, rest, effect expiry, reconciliation, and undo have deterministic
  transition tests.
- Reloading preserves an in-progress local play session without silently
  changing the durable build.
- View, Play, and print consume the shared semantic sheet/card model without
  presentation logic entering the rules engine.

**Release characterization:** beyond-parity local-play interaction foundation;
phone adaptation follows only after this milestone in M6.

## M6 — Local phone play mode

### Goal

After M5.8 is complete, adapt its approved local-play experience to a
purpose-built phone interface without requiring networking.

### Deliverables

- Phone-first dashboard, powers, effects, equipment, and journal views.
- The interactive (non-printable) character View sheet deferred from M5.6,
  designed together with the mobile interface; until then sheet entry points
  open the printable sheet's print preview.
- Phone interaction patterns for the shared PlayState commands, cards, effects,
  resource adjustment, undo, and rest workflows established in M5.8.
- Portable play-bundle import/export containing only character-relevant content.
- PWA installation and offline behavior tested on supported iOS and Android.

### Exit criteria

- A player can run a full encounter and extended-rest cycle in airplane mode.
- Every M5.8 play transition remains available and understandable on the phone
  surface without compressing the desktop sheet layout.
- Derived values visibly respond to structured play effects with provenance.
- A portable play bundle provides all referenced powers/items without requiring
  the complete corpus on the phone.
- Temporary equipment and treasure changes require explicit reconciliation into
  the durable character.

**Release characterization:** local play beta.

## M7 — Encrypted transfer and linked sessions

### Goal

Connect desktop, phone, and future DM clients without adding accounts or central
character storage. This is for the product owner's own table, not a public
relay service, so the deliverables below stop at "works reliably for that
group," not a hosted-service operator's product.

### Deliverables

- Versioned `session-protocol` and capability model.
- QR-based encrypted one-time device handoff.
- WebSocket relay with opaque envelopes, TTL, limits, and Docker deployment
  for self-hosting by the product owner.
- Player, DM, and read-only session capabilities.
- Command ordering, acknowledgement, retry, encrypted snapshots, late join,
  disconnect, and resynchronization behavior.
- Player-visible remote-operation audit history.

Formal public-relay-operator documentation, abuse controls, and a self-hosted
configuration guide for third parties are not part of this milestone — a brief
note on running the provided Docker image is enough. If someone else ever
wants to operate this for their own table, that's a later, separately scoped
ask.

### Exit criteria

- Relay compromise does not disclose character/session payloads or encryption
  keys under the documented threat model.
- Duplicate, delayed, reordered, and temporarily disconnected traffic converges
  in protocol tests.
- Unauthorized capabilities cannot mutate protected state.
- Desktop-to-phone transfer succeeds through QR pairing, while file transfer
  remains functional without a relay.
- A reference DM-protocol client can observe projections and apply permitted
  effects without access to build-edit commands.

**Release characterization:** connected play release; integration point for the
future DM application.

## M8 — Custom content and campaign authoring

### Goal

Make supported customization convenient rather than file-format-only.

### Deliverables

- Custom pack import/export, dependencies, namespaces, overlay ordering, and
  conflict diagnostics.
- Forms for commonly authored rules elements and reusable rule snippets.
- Advanced source/IR editor for constructs not covered by forms.
- Validation preview showing grants, choices, prerequisites, calculations, and
  affected characters.
- Campaign-profile editor for allowed sources, bans, grants, house rules, and
  versioned updates.
- Legacy `.part`, `.index`, and `.dndcamp` compatibility where representable.

### Exit criteria

- A user can create a representative race, feat, power, item, and campaign
  restriction, package them, and use them in a character.
- Custom content cannot inject executable code or unrestricted HTML.
- Conflicts and lossy legacy exports are visible before activation/export.
- A custom pack and campaign profile can be backed up, shared, imported, and
  upgraded independently of characters.

## M9 — 1.0 stabilization

### Goal

Declare the character-builder product stable for its actual audience: the
product owner and a small group of hobbyist players who mostly interact with
the product owner directly. This is not a public commercial release, so this
milestone is not a formal compliance/support-matrix exercise; it closes out
reliability and the things that would actually hurt a friend's saved
character.

### Deliverables

- Recovery and diagnostics UI, a security review (untrusted content/import
  handling), and a production performance spot-check.
- Schema/protocol migration policy: content packs, play bundles, and the
  session protocol keep working across updates without silent data loss.
- Player-facing documentation: installation, content import, backup/recovery,
  and known limitations, written for people who actually use the tool.
- Post-beta visual corrections with the product owner where M5.7's final parity-
  UI cleanup or real tester feedback reveals a concrete issue; this is not a
  second speculative redesign pass.
- A best-effort pass in whatever browsers the actual users run, fixing real
  reported problems rather than auditing a formal client matrix.

Formal self-hoster/integration documentation, release signing, a published
support matrix, and a relay abuse-control runbook are not part of this
milestone — they're vendor-facing ceremony this project doesn't need. If a
future DM client is actually built, its integration contract gets whatever
documentation that work needs at the time, not speculatively here.

### Exit criteria

- No known issue risks silent character-data loss or silent rules corruption.
- Content packs, play bundles, and the session protocol survive an update
  without breaking existing saved data.
- The application remains fully useful for building and local play with the
  relay disabled.
- Player-facing documentation covers install, import, backup/recovery, and
  known limitations.

## Cross-cutting workstreams

The following are continuous rather than deferred to a cleanup milestone:

- compatibility fixtures and parity reporting;
- structural accessibility and basic keyboard operation during functional work;
- content provenance and licensing boundaries;
- storage migrations, backups, and recovery;
- development-host performance budgets, with representative hardware measured
  during stabilization;
- threat modeling and untrusted-input handling;
- documentation and architecture-decision updates; and
- reproducible project-local Nix tooling.

### Calculation-gap queue (2026-10-22)

The 2026-10-24 owner task list is separately ordered by implementation
complexity in [`tasks-triage.md`](tasks-triage.md), with quick-win checkpoints
before equipment-history repairs and the broader feat-power audit.

Ranked from `audit:legacy-special-cases`, `audit:modifiers`,
`audit:parity-coverage` and `evaluate:matrix` (see implementation status,
"Player report: Oleander"). Each item is confirmed on a sample or probe
character before it is fixed, one slice per item.

- **Tier 1, wrong numbers (items 2–7 done 2026-10-23, plus Staff Expertise
  on staff weapon attacks; see implementation status):**
  1. ~~Legacy-backed sample mismatches~~ (triaged 2026-10-22, implementation
     status "Legacy parity baseline"): Raidon Kane's dice, Magic Missile,
     Freezing Cloud/Fireball/Bloody Fangs dice and Geran's +1 are content
     revisions, not engine gaps. `pnpm parity:baseline` now guards the
     remaining differences.
  2. Unconditional `attack rolls` / `damage rolls` statadds never applied
     (~100 records: Epic Combatant, cloth-armor non-proficiency, Inherent
     Bonuses damage).
  3. Attack key-ability overrides (native `OverrideStat`: `:key ability`
     textstrings, `DMG:`/`HALF-DMG:`/`!`/`*`, `_KeyAbilityAs`, Key Ability
     fields; ~90 records, e.g. Melee Training, Intelligent Blademaster).
  4. Weapon `modify` overlays (Properties, Range, damage die) and weapon
     selectors (multi-group weapons, two-handed, staff as Quarterstaff).
  5. Power keyword channels (ki focuses, implement groups, instrument,
     two-blade, two-weapon checks).
  6. Mundane implement gear rows; Sneak Attack Weapons; hybrid armor
     proficiency needing both halves.
  7. ~~Target-less `modify` rules over-apply~~: real; `select=` fixed in
     `89590ba`, nameless in `f2bb532` (latent: nameless `drop`, nameless
     `UniversalClassSkill`; no content uses them).
  8. ~~Fixed-bonus ally damage (D095)~~: fixed `ac996dc`. Open: Wyrm Form /
     Dragon Bite / Breath Weapon / Chasme Gore attack rows use the fixed-line
     path without character-wide attack bonuses (D095 doesn't clearly cover
     them).
- **Tier 2, missing reminders:** done 2026-10-23 (Conditional modifiers pane,
  Play data card lines, stat-tile tooltips, power-card reminders). Left:
  `damage(<item>)` textstrings (Challenge-Seeking), `ally.melee:damage`
  (Infernal Pincer), one `check:<other>` example.
- ~~**From four more player saves (2026-10-23)**~~: all fixed — Villain's
  Menace (`da275bc`), ki-focused weapon rows (`2f9566d`), dice-less damage
  (`095daae`, `fbcaef2`); the Arcane Wisp card was a retired community card
  (`1b92954`).
- **Remaining audit gaps (owner-ordered queue, 2026-10-28).** Sources:
  `reverse-engineering/docs/12-calculation-logic-audit.md` and the
  partial/not-handled entries in `apps/content-tool/src/legacy-special-cases.ts`
  (run `pnpm audit:legacy-special-cases`). No `sample-chars/` save exercises
  the number-changing ones. Work top to bottom; strike items as they land.
  1. ~~Associates (54 `Associate` records; Fey Beast Tamer blink dog): data
     model, engine numbers, companion-style card~~ — done (D107, `ac5f3ea`).
  2. ~~Prerequisite IR cache order-dependence; `regenerate:edited-dnd4e`
     duplicate tokens~~ — done: the cache is keyed on profile, owner and text
     and no longer depends on the caller's tokens (`23f9b88`); export writes
     flat per-level loot rows like native (`242c4a8`). Open, awaiting the
     owner (D097 amendment): the current wallet must be the highest money key
     at or below the character's level — levelled-down saves (Beatrix,
     "copy of character") show and export a stale higher-level wallet.
  3. ~~Sheet display: power short descriptions in notes; monk movement
     technique cards; `PowerCardPower.UpdatePowerCardPower`~~ — done
     (`2ad4731`): `_CS_ShortDescription` notes with "@" hiding, a card class
     block and Spellbook subtitle, the movement technique on the full
     discipline's card. Layout choices await the owner's visual review.
  4. ~~Number-changing power and item gaps~~ — done: power rows
     (`ab5740e`…`5751d44`: WeaponEquiv loot attacks as its weapon with
     EnchantEquiv, native SpecialCase lines, Defender's Gambit, Valiant
     Strike's reminder; AddArenaWeapons, Commander's Strike, NonDamagePower
     already native), stat engine (`620774f`, `ad7dfc1`: CalcBAB caps, empty
     type, CalcBeast in the engine) and equipment (`8192120`…`ad50818`: Ring
     Slots, holy symbol slot and `_INTERNAL_EquippedSymbol`, augment-parent
     field overlays). Left: Additional Slot (one Large-only record); damage
     `abilmod` cap sharing (no content). Awaiting the owner: Critical on
     WeaponEquiv rows, the D105 parenthetical-damage and worn-symbol bullets.
  5. Move content text parsing out of evaluation into pack generation (the
     standing rule in CLAUDE.md/AGENTS.md): power attack/hit lines, increase
     sentences, the WeaponBonuses table and CalcBonuses riders in `powers.ts`
     (~34 parse sites), and the per-profile prerequisite internalization in
     `prerequisites.ts`, stored as normalized fields/IR in the pack. Done after
     item 4 so those fixes are ported once; the full parity baseline is the
     safety net.
  6. Legality: hybrid power picks (`CheckHybridPower`, `DisallowClass`,
     `D20Choice.CheckReplaceElem`; 5 hybrid samples); Dilettante
     prerequisites (`FindDilettante`, `ImplementDilettante`,
     `MeleeDilettante`); `CategoryOpt.Build` PowersAsClass (DV's Order Adept
     feature); `RulesElement.IsPsionicClass`.
  7. Shop: `IsValidLoot`, `IsValidWeapon`, `TransformLoot`, `LootCost`,
     package entries, `EnchantmentItem.InitializeCategoryMembership`,
     `GearPageData.HasSingleItem`.
  8. Probably out of scope: `MonsterDisplay.Build`, `App.GodFragments`.
- ~~**Postmortem parity batch (2026-10-28)**~~: done (see implementation
  status and `reverse-engineering/docs/12-calculation-logic-audit.md`), with
  the owner's decisions of 2026-10-28 applied: `sample-chars/` is the
  canonical parity baseline (SampleHeroes informational); "Primary ability"
  follows native; rules-checked departures recorded in D105; the five typo
  modifies corrected; new characters start with 100 gp; power cards show
  "Encounter (2×)"; augments attach/detach by right-click; locked
  augmentable rows show version 0; Shifter is native code; `.dndcamp` is out
  of scope; the theme-power reason quotes the Dark Sun rule. Open: the
  companion display question (associates such as the Fey Beast Tamer blink
  dog have no data model; beast companions and familiars already print as
  cards).
- ~~**From the Swordmage Warding report (2026-10-27)**~~: both done.
  1. Statlinks share the parent stat's type caps (native
     `CalculateStatAddValue`; D103, `9abfdb4`); the Warding content
     correction is retired.
  2. Large-weapon proficiency follows native `IsProficient` /
     `CanUseLargeWeapons` (`02544d0`). Left (no numbers affected today): the
     `defensive` selector ignores proficiency, "Implement Proficiency
     (Proficient Weapons)" and Additional Proficiencies aren't read; native
     drops zero-gated statadds inside a link and its untyped literal `0`
     isn't modelled.
- **Tier 3:** shop pairing for enchantments with unparsed base restrictions,
  `UniversalClassSkill`, gated resistances, summoning powers whose creature
  attacks sit in " Standard action"/" Minor Action" fields (86+ powers; no
  rows in legacy either).
- **Owner decisions needed:** hybrid power alternation, augment versions
  inheriting parent overrides, a builder control for binding augments, sheet
  short descriptions (`_CS_ShortDescription`).

Visual polish and exhaustive interface validation are intentionally not
continuous speculative workstreams during early implementation. Each milestone
must preserve sound semantic structure and usable functional controls. Product
design is closed through focused owner review. This project does not run a
formal cross-browser/device support matrix or an accessibility certification
program (see decision D063): real accessibility or compatibility complaints
from actual users get fixed as ordinary bugs against the continuous structural
baseline above, not staged into a dedicated audit milestone.

## Possible future enhancements

Recorded ideas with no milestone commitment:

- **Shortened weapon names in card weapon tables (2026-10-18).** When a name
  would wrap in a weapon table, shorten it only as far as needed: abbreviate
  enchantment words before the base weapon, never the `+N`, cutting at
  syllable boundaries from a hyphenation library (`hyphen`/`hypher`, Liang's
  TeX patterns: "Defensive Warhammer +2" → "Def. Warhammer +2"), keeping names
  unique among the character's weapons, with the full name on hover and a small
  override table for bad cuts. Deferred as more complex than its benefit today;
  wrapped names already hang-indent and keep `+N` attached.

## Historical first implementation slice

M1 began with this end-to-end vertical slice:

1. define a minimal normalized `RulesElement` and pack manifest;
2. compile a tiny synthetic pack with the CLI;
3. import it into IndexedDB through a Worker;
4. list and inspect its records in the web shell;
5. package the shell in the production Docker image; and
6. run the same flow in CI.

This validates package boundaries, worker messaging, storage, runtime schemas,
Nix tooling, and deployment before the complete corpus makes failures difficult
to localize.
