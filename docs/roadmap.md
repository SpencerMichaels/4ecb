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

**Status:** in progress. Verified checkpoints make content-profile migration a
worker-evaluated preview followed by explicit adoption and add checksummed
backup inspection, restartable character migration recovery, persistence
requests, quota diagnostics, an installable offline PWA with explicit update
prompts, a hardened public Docker boundary, public-distribution notices, and
exact-profile authoritative browser sheets with a visible legacy-cache fallback.
Edited export now has explicit byte-preserving and 0.07a regenerated targets
with a semantic re-import gate. Automated Chromium and Firefox Letter/A4 PDF
matrices pass; Safari and cross-engine raster inspection remain open alongside
the original-application launch matrix, release matrices, and the other M5 exit
criteria. Content onboarding now provides bounded read-only
directory discovery plus an ordinary `.4ecp`/decrypted-rules file fallback.
The public import/rendering security pass, automated storage durability matrix,
route-focus/contrast/responsive accessibility baseline, and durable supported-
client release checklist are complete; full browser/keyboard/Safari/device
execution remains open.

### Goal

Turn the M4 builder into a supported, publicly deployable offline replacement.

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
- Accessibility, browser, security, and performance release passes.

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
9. Supported browsers pass critical workflows, keyboard navigation, and the
   release accessibility checklist.
10. Installation, content import, backup, recovery, upgrade, and known
    compatibility limitations are documented.

**Release characterization:** MVP / first supported replacement release.

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
- accessibility and keyboard interaction;
- content provenance and licensing boundaries;
- storage migrations, backups, and recovery;
- performance measurement on representative hardware;
- threat modeling and untrusted-input handling;
- documentation and architecture-decision updates; and
- reproducible project-local Nix tooling.

Visual polish is intentionally not a continuous speculative workstream during
early implementation. Each milestone must remain readable, responsive, and
accessible, but substantial theme and motion decisions wait until representative
workflows exist and can be reviewed interactively.

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
