# Implementation status

## Current stopping point

Milestones M1 through M4 are complete at their stated release boundaries. M4 is
the builder beta: it delivers the authoritative rules-backed editor, records the
remaining native parity risks as explicit M5 blockers, and does not claim public
MVP readiness. M5 is in progress. Profile migration preview and explicit
adoption are implemented; blocker closure, the legacy-builder export launch
matrix, finished printing, remaining storage upgrade/restart matrices,
onboarding, and public-release verification remain open. The installable PWA,
update/offline UX, public-distribution boundary, production Docker guide, and
authoritative exact-profile browser sheet are verified checkpoints, not an MVP
declaration.

## M5 checkpoints

### Profile migration preview and explicit adoption

- A character's pinned profile can no longer be changed by an ordinary library
  metadata save. Changing or accepting a content revision requires a separate
  preview and explicit adoption action.
- Preview evaluation runs in the rules worker. It checks every definition ID
  referenced by authoritative level history, grabbag, alternates, and inventory;
  compares referenced definitions when the exact source pack is installed; and
  reports calculated stat, power, completeness, legality, convergence, and
  diagnostic changes.
- A stored source digest is checked before treating an installed pack as the
  source revision. If that exact revision is unavailable, the UI says so and
  reports target-only compatibility evidence rather than fabricating a delta.
- Missing or illegal target content remains visible and adoptable when the
  evaluator converges, preserving the project's editable-invalid-state policy.
  Nonconvergent target evaluation blocks adoption.

Verification on 2026-08-31 used the project-local Nix environment: two focused
profile-migration tests, affected TypeScript projects, and affected ESLint files
passed. A live browser run installed and activated a public synthetic pack,
imported the public `.dnd4e` structural fixture, previewed its four missing
definition references, and explicitly adopted the profile with no console
warnings or errors. The full public suite is rerun before the checkpoint commit.

### Storage persistence, migration recovery, and verified backup

- New native backups are format version 2. Their manifest records the character
  count and a SHA-256 digest over the complete ordered character payload. Restore
  rejects a changed payload or count before opening a write transaction.
- Every restored record also passes the character-domain decoder, including
  required metadata, snapshot arrays and scalar maps, sheet settings, nested
  authoritative occurrences, inventory quantities, alternates, and build
  bounds. A self-checksummed payload cannot use the integrity field to bypass
  structural validation.
- Backup selection now performs a non-mutating preview first. It reports format
  version, checksum availability, active/trashed counts, and IDs that will
  replace existing records; restore requires a separate explicit action. Legacy
  version-1 backups remain structurally validated and are clearly labeled as
  unchecksummed.
- IndexedDB schema 3 adds a character migration journal. Lazy schema-1 migration
  writes the untouched prior record before conversion and removes the journal
  only in the same transaction that commits schema 2. Startup recovery restores
  a journaled prior record if an interrupted migration left the character
  missing, then restarts the ordinary migration.
- Content settings display the browser's current persistence decision, storage
  use, quota, and percentage used. A user-triggered action requests persistent
  storage where the API is supported and explains a denied request without
  treating it as durable-backup success.

Focused browser-storage tests cover checksummed round trip, tamper rejection, a
self-checksummed malformed schema-2 record, legacy backup inspection, and a
simulated interrupted migration recovery. Live
browser verification displayed the persistence/quota facts against the public
synthetic profile; backup export reported one complete record. Full
restart/upgrade/restore browser matrices remain part of M5 exit-criterion 5 and
are not claimed by this checkpoint. The checkpoint public suite passes 98 tests
across 23 files plus formatting, ESLint, every TypeScript project, the
production/PWA build, deterministic content checks, and the query benchmark.
After adding the comprehensive domain decoder and crafted self-checksummed
malformed-record fixture, the same public suite passes 100 tests.

### Installable PWA and public Docker boundary

- The production PWA presents explicit first-offline readiness, offline state,
  deferred update, and browser installation controls. Updates never silently
  reload the editor; the user chooses when to activate a waiting worker.
- Every application route carries the unofficial-product, local-data, and
  no-official-corpus notice. `NOTICE.md` establishes the repository, hosted
  build, CI, and image distribution boundary without treating it as legal
  advice.
- The production image serves immutable application assets from `/app/static`
  while keeping the reserved `/app/runtime-config.json` separately replaceable,
  outside the service-worker precache, and network-only. The application does
  not yet consume its fields. The image runs as the upstream unprivileged nginx
  user with a read-only root filesystem and a bounded writable `/tmp` in the
  documented invocation.
- The public suite now requires a standalone web manifest, service worker,
  runtime configuration, a generated-worker assertion that the configuration is
  network-only rather than precached, and absence of `.4ecp` and `.dnd4e`
  artifacts from the production web build. The deployment guide documents
  HTTPS, reverse-proxy caching, health checks, update behavior, and the
  browser-local backup boundary.

Verification on 2026-08-31 used a production build in the project-local Nix
environment and a live Chromium browser. The installed service worker announced
offline readiness, restored the application after the preview server was fully
stopped, detected a rebuilt release, offered **Reload and update** and **Later**,
and deferred without console warnings or errors. The production Docker image
built successfully, returned `ok` from `/healthz`, served the external runtime
configuration, contained its service worker, manifest, and notice, and contained
no `.4ecp` or `.dnd4e` artifacts. It passed the same checks while running
read-only with a bounded temporary filesystem. Supported-browser critical-flow,
accessibility, security, and performance release matrices remain open M5 exit
criteria. The checkpoint public suite passes 102 tests across 24 files plus
formatting, ESLint, every TypeScript project, the production/PWA build,
deterministic content checks, and the query benchmark.

### Explicit original and edited `.dnd4e` export targets

- The library exposes two non-ambiguous targets. **Original imported file (no
  edits)** keeps the byte-exact M3 envelope path; **Legacy Character Builder
  0.07a** serializes current authoritative state and regenerated caches.
- Edited export requires a converged evaluation from the exact adopted content
  pack digest and the latest saved level. It writes fresh document-local
  occurrence tokens, repairs replacement links when their target remains
  representable, escapes XML content, and regenerates details, abilities, stats,
  selected-rule and loot tallies, and power calculations.
- Level history, grabbag, inventory, alternates, and text values come from the
  build. Opaque campaign and unknown root blocks remain byte-exact; companion
  journal, and unknown sheet blocks are carried into the regenerated sheet.
- Every edited download is re-imported first and compared with the build while
  ignoring regenerated local IDs. A difference in levels, choices, replacement
  topology, inventory, alternates, abilities, or text blocks the download.

Public structural fixtures cover edited ability/text/inventory state, XML
escaping, preserved opaque data, fresh tokens, repaired replacements,
regenerated sheet caches, semantic re-import, and the latest-level guard. These
checks establish the writer boundary but do not substitute for opening a
curated exported corpus in the original Windows application. M5 exit criterion
4 remains open until that launch matrix is recorded. The complete public gate
passes 108 tests across 24 files plus formatting, ESLint, every TypeScript
project, the production/PWA build and cache-boundary assertion, deterministic
content checks, and the query benchmark. A live Chromium run selected and
downloaded both targets against the public synthetic character: edited export
reported a passed semantic re-import, original export explicitly reported that
local edits were excluded, and the final post-fix flows added no console errors.

### Authoritative browser sheet with recoverable fallback

- `sheet-model` now projects a converged `EvaluatedCharacter` into identity,
  current ability/stat sections, selected feature groups, aggregated inventory,
  item cards, and every evaluated power/equipment variant. Field overlays and
  current content prose feed the cards. The visible equipment summary and cards
  both come from that model, including edited quantity and equipped state; the
  legacy snapshot remains a separate fallback input.
- The sheet evaluates in the rules worker only when the installed pack ID and
  digest match the character binding. Worker initialization repeats the digest
  assertion so a same-ID pack replacement cannot be evaluated after an earlier
  UI check.
- Missing or mismatched content, nonconvergence, and worker errors retain the
  imported sheet cache with an explicit warning. Sparse preserved characters do
  not gain fabricated zero-valued abilities.
- The existing Letter/A4, blank-hit-point, monochrome, power-card, item-card,
  and browser-print controls now operate on the authoritative model when that
  model is available. Supported-browser pagination goldens remain open.

Focused tests cover current engine stats over stale cached values, identity
updates, evaluated weapon variants, authoritative equipment quantities and
equipped state, inventory cards,
nonconvergence rejection, sparse-value preservation, and exact revision gating.
A live Chromium run opened the public synthetic character against its exact
bound digest, displayed the authoritative evaluation state and regenerated
inventory, omitted unknown abilities instead of showing zeroes, and produced no
console warnings or errors. The full public-suite result is recorded with the
checkpoint commit: 105 tests across 24 files plus formatting, ESLint, every
TypeScript project, the production/PWA build and cache-boundary assertion,
deterministic content checks, and the query benchmark.

## M4 delivered

- `rules-engine` parses every rule opcode and attribute found in the 38,339
  entity private corpus: 54,012 statements audit with no unknown opcode,
  attribute, or unexplained required field.
- Fixed-point grants and choices, category expressions, stat modifiers and
  aliases, text updates, field overlays, equipped-item predicates, structured
  prerequisites, provenance, and editable incomplete/illegal states.
- Schema-2 records with an authoritative level-tree build, stable occurrence
  IDs, retained retraining links, base abilities, inventory, text values, and a
  lazy migration from the M3 read-only record.
- Transactional commands with undo/redo for abilities, effective level, level
  frames, choices, retraining, inventory, and text values.
- A desktop/tablet character editor for abilities, advancement, choices,
  materialized nested grants, focused retraining/replacements, inventory
  quantities/equipment, history, and engine diagnostics.
- A private-corpus audit and a supplied-character parity reporter, kept outside
  the distributable public fixtures.
- A renderer-neutral power result model with explicit equipment variants,
  attack/damage components, ordinary weapon and implement math, level-scaled
  hit lines, chosen abilities, enhancement/proficiency, weapon-group and
  implement-category bonuses, primary attacks, and effect-only calculations.
- Legacy alternates/spellbooks participate in ownership and power evaluation;
  serialized grants suppress duplicate fixed-point grants. Equipment projection
  recognizes weapon groups, magic implements, dual-use staves, and mundane holy
  symbols in the forms used by the corpus.
- Psionic parents materialize their augment-version records; heavy-thrown and
  weapon-as-implement calculations, multiple ability modifiers, ongoing damage,
  high-crit/brutal metadata, and recovery effects broaden the power model.
- Observed compound equipment selectors and common published prerequisite prose
  are evaluated, with unknown prose explicitly reported as unverified.
- Full-pack evaluation runs in a dedicated browser worker, preserving a
  responsive editor and one engine-owned calculation boundary.
- A distributable three-character golden matrix spans heroic, paragon, and epic
  play; martial, psionic, and primal sources; dual weapons and implements;
  companions, custom content, advancement, and retraining.

## M4 verification record

On 2026-08-31, the supplied level-8 character converged in one fixed-point
iteration and matched all 72 comparable cached numeric aliases. Its only
remaining legality findings are its explicit house-rule selection and one
custom feat prerequisite the imported content cannot prove. The public suite
also matches all 52 comparable cached attack/damage fields across its power
variants. The bundled nine-character cross-profile diagnostic matrix matches
501/509 numeric aliases and 277/371 cached power fields. The remaining sample
differences are concentrated in historical content revisions, removed internal
definitions, hand-specific calculations, and named native power exceptions.
The public suite passes 91 tests plus formatting, ESLint, all TypeScript
projects, the production/PWA build, deterministic content checks, and the query
benchmark. Live browser verification loaded the 38,339-record profile in the
rules worker, completed evaluation, persisted an edit, and restored it through
undo. See [m4-compatibility-ledger.md](m4-compatibility-ledger.md) for the M4
acceptance boundary and exact M5 blocker inventory.

## M3 delivered

- `character-domain`, `legacy-dnd4e`, and `sheet-model` packages separating the
  versioned durable record, compatibility adapter, and semantic rendering model.
- A SAX-based `.dnd4e` importer that extracts details, final cached stats,
  selections, level count, text strings, inventory, powers, and weapon
  calculations without dropping the source envelope.
- Exact legacy-envelope export and an export/re-import preservation diff. No-edit
  exports keep comments, whitespace, order, unknown attributes/elements, and
  opaque link tokens unchanged.
- IndexedDB schema v2 with character list/get/put, metadata and content-profile
  binding, sheet preferences, duplication, recoverable trash, permanent purge,
  and full native JSON backup/restore.
- An accessible local character library with `.dnd4e` import reports, explicit
  missing-profile state and rebinding, metadata editing, backup/restore, and
  checked legacy export.
- A browser sheet with summary sections, familiar usage-colored power/item
  cards, bound-content enrichment, cached-value warnings, blank hit points,
  Letter/A4 selection, monochrome mode, card inclusion switches, and browser
  print/save-to-PDF entry point.

## M3 verification record

On 2026-08-31:

- formatting, ESLint, all TypeScript projects, 35 unit/integration tests, and the
  production Vite/PWA build passed;
- the supplied private level-8 character imported as Hu Sheng-ming with 8 level
  records, 185 selected rules, 21 powers, 24 carried/equipped loot entries, and
  113 cached stat aliases; exact export/re-import comparison found no differing
  character;
- the live browser exercised file import, IndexedDB persistence, the structured
  import report, library navigation, final ability/defense/skill values, all 45
  power and item cards, and a reload after changing A4 plus blank-HP settings;
- rendered card geometry formed three stable columns and reported zero
  horizontal or vertical overflow for all 45 cards at the tested desktop
  viewport; print CSS uses explicit Letter/A4 page rules, three-column grids,
  and `break-inside: avoid` for sections and cards; and
- the seven-page legacy-generated Letter PDF was rendered and visually inspected
  as the reference for section hierarchy, usage colors, and three-by-three card
  density. The modern sheet intentionally omits legacy ornamental chrome.

The private character and reference PDF remain ignored local evidence. Public
tests use only synthetic XML. See
[character-import-and-sheets.md](character-import-and-sheets.md) for the storage,
compatibility, and known-limitations contract.

## M2 delivered

- A versioned serializable query AST and dependency-free `query-engine` package
  with Unicode tokenization, quoted phrases, relevance, include/exclude facets,
  numeric ranges, stable sorting/paging, self-excluding facet counts, and
  bidirectional stable-ID relationships.
- A dedicated worker that loads the active immutable pack from IndexedDB,
  constructs the index away from React, services typed query/detail requests,
  and is safely terminated on cancellation or profile/page changes.
- Cross-type search and explicit pages for powers, feats, magic items, weapons,
  armor, gear, races, classes, paths, destinies, backgrounds, themes, and
  rituals, plus searchable values for every typed facet.
- Fragment-addressed queries and entity details, browser-local named saved
  searches, accessible include/exclude controls, level ranges, sort controls,
  result/empty/loading/error states, and stable pagination.
- Compact IndexedDB pack storage using verified encoded `.4ecp` bytes with
  transparent reads of older M1 object-form installations.
- A reproducible full-pack benchmark with enforced index, broad-query, and
  representative-query budgets.

## M2 verification record

On 2026-08-31:

- formatting, ESLint, all TypeScript projects, 24 unit/integration tests, the
  production Vite/PWA build, and the synthetic public suite passed;
- every full-corpus benchmark stayed within budget: approximately 4,978 ms
  index construction, 456 ms unfiltered, and 0.4-80 ms representative queries;
- the browser exercised full text, exact fragment restoration, entity-type and
  level filters, source exclusion, named saved-query persistence, stable detail
  URLs, ID-resolved outbound relationships, and worker reconstruction after
  reload against all 38,339 private records;
- the unprivileged production Docker PWA imported and activated the private
  pack; after its server was stopped completely, an offline reload restored the
  application and returned all 38,339 IndexedDB-backed records.

The query contract and budgets are maintained in
[query-engine.md](query-engine.md). The public suite builds and benchmarks only
synthetic content; `pnpm benchmark:query tmp/content/full-local.4ecp` exercises a
private local pack.

## M1 delivered

- A pnpm/TypeScript monorepo and project-local Nix toolchain with pinned lock
  files, formatting, linting, type checking, unit tests, production build, and
  public CI.
- `content-domain`, `legacy-wotc`, and `content-pack` packages with streaming
  `D20Rules` parsing, normalized records, preservation of unknown data,
  diagnostics, total record accounting, deterministic serialization, digest
  validation, summaries, and pack diffs.
- A command-line content tool with `build`, `inspect`, `validate`, and `diff`.
- A typed IndexedDB repository supporting verified install, collision rejection,
  list/get, activate/deactivate, and removal without touching future user data.
- A minimal React/Vite PWA shell with a typed import worker, gzip decoding,
  validation, progress, cancellation, error containment, local persistence,
  pack lifecycle controls, and a deliberately basic record inspector.
- Unprivileged development and production Docker targets with a production
  health check and SPA/offline asset serving.
- Synthetic distributable XML for public tests plus a private-corpus script that
  reproduces CBLoader's ordered merge with the verified reference merger before
  building a pack.

## Verification record

On 2026-08-31 the following passed in the root Nix environment:

- formatting, ESLint, TypeScript checks, 10 unit tests, Vite production build,
  and PWA service-worker generation;
- two independent synthetic builds compared byte-for-byte, followed by pack
  validation and a zero-change semantic diff;
- the reverse-engineering smoke suite, including schemas, sample characters,
  campaign XML, decryption/hash evidence, and merge semantics;
- the supplied full private merged corpus: 38,339 accepted records, zero
  rejected records, 41 explicit missing-source warnings, zero unaccounted raw
  top-level records, and a valid approximately 5.6 MiB compressed pack;
- browser import of both synthetic and full packs, activation, filtering,
  normalized detail rendering, IndexedDB persistence, and no console errors.

The public CI and repository do not require or contain the private corpus. Run
`nix develop path:. --command bash scripts/check.sh` for the public suite. With
the supplied ignored legacy files present, run `nix develop path:. --command
bash scripts/build-private-content.sh` for the ordered full-corpus path. Do not
feed a previously merged/decrypted CBLoader snapshot back through the parts
merger; begin from `combined.dnd40.original.xml` as the script does.

## Deferred by design

- M5 owns the explicitly recorded native exception blockers, regenerated
  `.dnd4e` snapshots, exhaustive cross-browser print goldens, profile adoption,
  and MVP parity closure.
- M6 and M7 own mobile play state and encrypted relay-linked sessions.
- Visual theming, animation, and fine interaction polish wait for the tighter
  user feedback loop requested for later UI work.
