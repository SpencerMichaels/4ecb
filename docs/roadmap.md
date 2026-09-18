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
matrices pass as functional regression evidence; cross-browser visual print
review belongs to M5.5 after the real interface is designed. The
Representative original-application open/save/reopen compatibility is therefore
accepted at the M5 boundary; later character-specific findings remain ordinary
compatibility bugs rather than reopening the milestone. Content onboarding now provides bounded read-only
directory discovery plus an ordinary `.4ecp`/decrypted-rules file fallback.
Administrator runtime configuration may also advertise an ordered immutable
same-origin baseline; verified downloads cache offline without activation, and
users explicitly compose/adopt personal overlays above it. Materialized profile
digests and ordered layer bindings preserve existing character behavior.
The public import/rendering security pass, automated storage durability matrix,
and route-focus/contrast/responsive structural baseline are complete. Full
keyboard, screen-reader, zoom, touch, Safari, and physical-device execution is
deliberately assigned to M5.5, after UI design with the product owner. The user
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
   keyboard operation, and non-forced viewport sizing remain intact. Exhaustive
   cross-browser, assistive-technology, touch, zoom, and visual validation is an
   M5.5 release-readiness gate after UI design.
10. Installation, content import, backup, recovery, upgrade, and known
    compatibility limitations are documented.

**Release characterization:** functional MVP / core builder release; designed
UI stabilization and its support matrix follow in M5.5.

## M5.5 — Builder UI design and release-readiness validation

The product-owner direction for this milestone is recorded in
[`interface-design-brief.md`](interface-design-brief.md). Product design and
prototype approval precede M6; comprehensive accessibility and broad client
certification may be deferred closer to 1.0 while structural accessibility
remains a continuous constraint.

### Goal

Design the durable builder interface with the product owner, then validate that
interface across supported desktop and tablet clients. This work intentionally
follows core builder parity so visual and interaction evidence is not invalidated
by a subsequent redesign.

### Deliverables

- Short UI prototype/review cycles covering information hierarchy, density,
  navigation, forms, choice resolution, sheets, typography, color, and restrained
  motion.
- Complete keyboard traversal and screen-reader announcement/validation review.
- 200% zoom, reflow, and touch-target review on supported desktop/tablet layouts.
- Critical-workflow smoke runs in desktop Chromium, Firefox, and Safari, plus
  iPadOS Safari and Android Chromium tablet where hardware is available.
- Cross-engine and device print/PDF review, including raster inspection where
  engine output differs.
- Representative interaction, initial-load, full-corpus import, evaluation, and
  print-preview timings on supported hardware.

### Exit criteria

- The product owner approves the principal builder, compendium, library, and
  sheet interaction designs through the agreed feedback loop.
- Every supported client passes the final critical-workflow matrix for the
  interface being shipped.
- Complete workflows are operable with a keyboard, validation and status changes
  are usable with the selected screen-reader matrix, and 200% zoom/reflow does
  not hide functionality.
- Supported tablet layouts meet the approved touch and responsive behavior.
- Letter/A4 print output is visually reviewed in supported engines with known
  engine-specific limitations documented.
- Representative hardware meets the release performance budgets fixed during
  this milestone.

**Release characterization:** first supported builder release candidate.

**Current M5.5 checkpoint (2026-09-02):** The first working builder-interface
draft is implemented over the real rules/storage commands. It establishes the
compact overview, complete level timeline, focused choice pane, temporary
show-all legality filter, truthful autosave states, responsive desktop/tablet
foundation, system/light/dark themes, monochrome interface icons, and existing
4E power-color semantics. Current level and saved future frames now operate as
separate evaluation/export projections; lowering the visible horizon is a
non-destructive session view until a dedicated persisted preference is added.
This checkpoint begins the prototype feedback loop; it does not claim product
owner approval or close the keyboard, screen-reader, zoom, touch, Safari,
physical-device, performance, or cross-engine visual-print exit criteria above.

The second product-owner review makes each level the main-pane workspace. Its
Class, Race, Background, Theme, Ability Scores, Companion, Skills, Powers,
Spellbook, Feats, and optional Retraining categories now appear as a horizontal
tab list, with only the active category mounted; the timeline remains its
compact status and navigation summary and opens the corresponding tab. Up to six
repeated background slots share one candidate table, and skill training uses a
single toggle list with an explicit chosen/required count. The
legacy placement of item-owned resistance choices in the Class pane is
documented for compatibility, but its redesigned presentation is deferred to
the equipment workspace rather than copied into the advancement flow.

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
The application shell now retains decoded packs, rules workers, memoized exact
evaluations, and Compendium indexes across client-side route changes. The first
full-corpus Compendium initialization still reconstructs state from IndexedDB;
subsequent navigation reuses it rather than replaying the six-second index build.
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

The equipment pass now fills that dedicated surface with Loadout, Inventory,
Shop, and Rituals & Practices tabs. Exact slot/copy assignments augment rather
than replace legacy equipped counts; a five-denomination carried/stored wallet
uses inherited per-level compatibility strings; and atomic buy/sell operations
retain exact holding IDs. The full item and practice catalogs use the retained
Compendium query worker, typed filters, level ranges, and 200-record pages.
Compatible terminal `+N` magic variants share a presentation family while exact
filtered variants, base/enchantment IDs, and transaction identity remain
unchanged. Known rituals/formulas/practices are distinct from quantity-bearing
scrolls, and Spellbook remains in Build. Dependent hand/ring movement,
holy-symbol/implement exceptions, augments, package lots, automatic/custom
equipment, and item-owned choice editing remain named follow-up work rather
than silently approximated native parity.

Builder navigation now participates in browser Back/Forward at the page-like
boundary: all five workspace tabs, Build levels and choice sections, and the
four Equipment sections have bookmarkable canonical hashes. Overview jumps
directly to one final Build destination; in-page filters, disclosures, choices,
and edits do not add history entries. Invalid or unavailable nested values
recover by replacement without disturbing library or character-sheet routes.

## M6 — Local phone play mode

### Goal

Add the at-table player experience without requiring networking.

### Deliverables

- `play-domain`, structured effects, deterministic play commands, operation
  history, and reconciliation into the durable character.
- Phone-first dashboard, powers, effects, equipment, and journal views.
- Interactive power cards and resource reset/rest workflows.
- Portable play-bundle import/export containing only character-relevant content.
- PWA installation and offline behavior tested on supported iOS and Android.

### Exit criteria

- A player can run a full encounter and extended-rest cycle in airplane mode.
- Damage, healing, temporary HP, surges, action points, death saves, power use,
  recharge, and effect expiry have transition and undo tests.
- Derived values visibly respond to structured play effects with provenance.
- A portable play bundle provides all referenced powers/items without requiring
  the complete corpus on the phone.
- Temporary equipment and treasure changes require explicit reconciliation into
  the durable character.

**Release characterization:** local play beta.

## M7 — Encrypted transfer and linked sessions

### Goal

Connect desktop, phone, and future DM clients without adding accounts or central
character storage.

### Deliverables

- Versioned `session-protocol` and capability model.
- QR-based encrypted one-time device handoff.
- WebSocket relay with opaque envelopes, TTL, limits, health checks, and Docker
  deployment.
- Player, DM, and read-only session capabilities.
- Command ordering, acknowledgement, retry, encrypted snapshots, late join,
  disconnect, and resynchronization behavior.
- Player-visible remote-operation audit history.
- Public-relay operator documentation and self-hosted configuration.

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

## M9 — 1.0 product hardening

### Goal

Declare the complete character-builder product stable and supportable.

### Deliverables

- Compatibility backlog triage and documented support matrix.
- Schema/protocol stability commitments and migration policy.
- Recovery and diagnostics UI, security review, accessibility audit, and
  production performance pass.
- Relay abuse controls and operational runbook.
- Complete player, content-author, self-hoster, and integration documentation.
- Release/upgrade/rollback process and signed artifacts where infrastructure
  permits.
- A dedicated visual-refinement pass conducted through short prototype and
  review cycles with the product owner, covering typography, color, density,
  iconography, character sheets, responsive details, and restrained motion.

### Final-product exit criteria

- All capabilities in the final-product definition are shipped and documented.
- No known issue risks silent character-data loss or silent rules corruption.
- Native data, content packs, play bundles, and session protocol have documented
  versions and tested forward migration.
- The application remains fully useful for building and local play with the
  relay disabled.
- The future DM application has a stable, tested integration contract.
- Public and self-hosted deployment paths have repeatable release checks and
  recovery procedures.

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

Visual polish and exhaustive interface validation are intentionally not
continuous speculative workstreams during early implementation. Each milestone
must preserve sound semantic structure and usable functional controls, while
substantial design, assistive-technology, device, and visual-validation work
waits for M5.5, when representative workflows can be reviewed interactively.

## Recommended first implementation slice

Begin M1 with one end-to-end vertical slice:

1. define a minimal normalized `RulesElement` and pack manifest;
2. compile a tiny synthetic pack with the CLI;
3. import it into IndexedDB through a Worker;
4. list and inspect its records in the web shell;
5. package the shell in the production Docker image; and
6. run the same flow in CI.

This validates package boundaries, worker messaging, storage, runtime schemas,
Nix tooling, and deployment before the complete corpus makes failures difficult
to localize.
