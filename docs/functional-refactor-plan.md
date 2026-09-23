# Functional refactor and performance plan

## Purpose and authority

This document is the durable coordination record for the functional-code audit
and the approved follow-up sequence. It supplements the
[delivery roadmap](roadmap.md), [implementation status](implementation-status.md),
[decision log](decisions.md), [query-engine contract](query-engine.md), and
[interface design brief](interface-design-brief.md). Those documents remain
authoritative for product and compatibility behavior; this plan organizes a
cross-cutting refactor and performance program without reopening their settled
decisions.

The work must proceed through Stages 0–6 in the order recorded below. A fresh
lead subagent should own each stage. The coordinator reviews scope and
architecture, prevents overlapping edits, independently verifies completion,
and decides whether the exit criteria are met. A stage may be split into
coherent checkpoint commits, but the next stage does not begin until the
current stage is complete or a remaining issue has an explicit approved owner.

**Overall status:** in progress

**Next stage:** Stage 2 — Route-level lazy loading

## Audit context and evidence

The audit examined whether shared functional UI is genuinely shared, where
legacy or transitional structure remains, and which load and interaction paths
need measured improvement.

### Confirmed strengths and intentional boundaries

- `EntityCard` and its headers, bodies, and composed-item cards are shared by
  Build, Equipment, and Shop.
- Equipment and Shop share the Funds pane and wallet dialog.
- View and Print use the same semantic sheet model. Their distinct card
  presentations are intentional render-mode differences, not duplicate rules.
- Builder status and Diagnostics use one issue projection.
- Content, rules workers, and exact evaluations are cached at application
  scope, and Shop already limits displayed results to 200.
- Legacy XML envelopes, migrations, provenance, redirects, and compatibility
  adapters are supported boundaries. They must not be removed as “cruft” merely
  because they preserve older data or behavior.

A universal table abstraction is not an objective. Candidate tables, Inventory,
and Shop have materially different behavior. Reuse should target smaller proven
units—such as sortable headers, paging/window controls, and dialog lifecycle—
where it reduces duplication without flattening distinct semantics.

### Material findings

1. Builder candidate selectors can render every matching candidate. A real
   level-8 choice produced 3,708 candidates and an evaluation result of roughly
   963 KiB. This conflicts with the design brief's bounded-DOM requirement.
2. Shop synchronously scans, classifies, filters, groups, and sorts the catalog
   on the main thread. The general query worker is not used by the production
   Shop UI but is still shipped and precached.
3. On the local 38,339-record private pack, the audit measured approximately
   155 ms for Shop catalog classification, 92 ms for unfiltered grouping and
   sorting, and 161–206 ms per search projection. General query-index
   construction took approximately 5.2 seconds. These development-host
   measurements are diagnostic evidence, not representative-device release
   budgets, and the private pack must not enter public fixtures or commits.
4. Storage paths called “metadata” reads clone entire records. Content-pack
   listing reads encoded pack blobs, while character-library loading reads and
   migrates full characters twice.
5. The editor can queue hidden planning evaluation before the current-level
   evaluation whose result the user is waiting to see. One rules worker can
   therefore allow nonvisible work to delay the visible result.
6. Major application routes are eagerly imported. The audited production main
   JavaScript bundle was approximately 600 KiB raw / 173 KiB gzip with no route
   chunks.
7. Exact-evaluation caching exists both in the editor and app runtime. The
   runtime's nominal LRU does not refresh recency on cache hits, so it behaves
   closer to FIFO in that case.
8. Some content-installation paths decode and validate a pack in a worker and
   then repeat decoding and validation during storage.
9. `CharacterEditorPage.tsx` is approximately 6,669 lines and combines several
   separable state machines. Decomposition before behavioral coverage would
   increase rather than reduce change risk.

The cited sizes and timings are the audit baseline only. Stage 0 must produce
repeatable measurements and record the environment, fixture class, collection
method, variance, and raw evidence location before later stages claim an
improvement.

## Program-wide requirements

### Status vocabulary

Each stage has one status field using `pending`, `in progress`, `blocked`, or
`complete`. A lead must update that field and the progress/evidence log in the
same change that establishes the new state. `Complete` means every exit
criterion has direct evidence or an incompatibility is explicitly recorded
under an already approved later resolution plan.

### Regression discipline

Every implementation stage must:

- begin from Stage 0's behavioral and performance baselines;
- add focused regression tests before or with behavior-changing work;
- preserve invalid, incomplete, custom, imported, and legacy records without
  silently discarding evidence;
- distinguish exact same-profile goldens from cross-profile/private diagnostics;
- run focused tests while iterating, affected formatting, lint, and TypeScript
  checks, production build and real-browser exercise for browser-facing work,
  and `nix develop path:. -c bash scripts/check.sh` before stage closure;
- keep public tests independent of proprietary content and retain private-corpus
  checks as ignored/local diagnostics;
- record before/after metrics with comparable inputs and an explained test
  environment; and
- leave coherent checkpoint commits and a comprehensible worktree.

For UI changes, Chromium and Firefox interaction coverage is required where
the behavior is browser-dependent. Visual regression must cover every surface
materially changed, including representative desktop/tablet layouts, light and
dark themes where supported, loading/error states where relevant, and print
output when sheet or print paths can be affected. Visual evidence supplements
rather than replaces semantic and interaction assertions.

### Durable-document obligations

Every stage lead updates this plan's status and progress/evidence log. The same
change must also update the relevant durable subsystem document when observed
architecture, compatibility boundaries, performance budgets, or product
behavior change. Material architecture choices require a decision-log entry.
Stage completion and the next stopping boundary must be reflected in
`implementation-status.md`; `roadmap.md` must be updated if milestone scope or
ownership changes.

## Stage 0 — Establish measurable baselines

**Status:** complete

**Lead:** fresh Stage 0 subagent (`functional_stage0_baselines`), 2026-09-23

**Dependencies:** none

**Scope:** Add deterministic browser scenarios for cold library load, direct
editor load, warm character reopen, Build → Overview → Equipment → Shop →
Sheet navigation, broad candidate searches, Shop typing/filtering, save,
undo/redo, back/forward navigation, and deep links. Capture baseline screenshots
for selector tables, Shop, Inventory, dialogs, and print. Record bundle sizes,
worker requests, IndexedDB bytes and records read, long tasks, mounted-row
counts, query-to-paint timing, test hardware/software, run count, and variance.

**Initial guardrails:**

- No later stage may regress an applicable baseline metric by more than 10%
  without an explicit, documented tradeoff approved by the coordinator.
- Input and search interactions must not introduce a main-thread long task over
  50 ms.
- Candidate and Shop DOMs must be capable of a 200-row maximum; Stage 0 should
  expose the current candidate-table violation rather than hiding or waiving it.
- An exact cached evaluation should become visible within 100 ms.
- Warm tab changes must not recreate packs or workers.

**Risk:** Browser timing can be noisy, instrumentation can perturb the measured
path, and private full-profile evidence can accidentally leak into public
artifacts. Establish repeatable protocols and synthetic public workloads;
record private results separately.

**Required regression and visual evidence:** Deterministic scenario tests,
instrumentation self-tests where practical, repeat runs with variance, browser
screenshots for the named surfaces, Chromium and Firefox print evidence, and a
production build. Baselines must fail visibly when a guardrail is exceeded;
they must not become timing assertions so brittle that normal host variance
makes the suite unusable.

**Exit criteria:** All named journeys have repeatable behavioral baselines;
every metric has a definition and collection method; public and private evidence
are separated; screenshots are reviewed; current violations are recorded; and
the coordinator accepts the baseline as sufficient to evaluate Stages 1–6.

## Stage 1 — Storage and cache mechanics

**Status:** complete

**Lead:** fresh Stage 1 subagent (`functional_stage1_storage_cache`), 2026-09-23

**Dependencies:** Stage 0 complete

**Scope:** Read and partition character records once; add migration-safe,
metadata-only character and content-pack records or indexes; stop repeatedly
calling `listInstalled()` during advertised-pack processing; add a trusted
internal path to store a pack already decoded and validated; consolidate exact-
evaluation cache ownership; implement true LRU behavior; and remove the unused
Equipment `packId` prop.

**Risk:** IndexedDB schema and transaction changes can cause data loss or make
old installations unreadable. A trusted internal storage path could bypass
validation if exposed across the wrong boundary. Cache consolidation can create
profile or semantic-version contamination.

**Required regression and visual evidence:** Exercise every existing IndexedDB
schema generation, interrupted migrations, encoded and old object-form packs,
backup/restore, trash and deleted characters, invalid-pack rejection at every
public boundary, cache-key/version/profile isolation, malformed cache recovery,
quota and write-failure fallbacks, and real-browser library/content workflows.
Compare IndexedDB records/bytes read and warm-load timing with Stage 0. Capture
changed loading, error, and recovery states if presentation changes.

**Exit criteria:** Metadata listings do not clone payload blobs or full
characters; existing data and backup/restore remain recoverable; no public API
can store unvalidated content; cache ownership and true LRU behavior are covered
by tests; applicable performance guardrails pass; durable storage/cache
architecture is updated; and the full repository check passes.

## Stage 2 — Route-level lazy loading

**Status:** pending

**Dependencies:** Stage 1 complete

**Scope:** Extract `HideFlavortextContext` from the large card module, then
lazy-load Settings, editor, and sheet routes without changing route semantics,
focus, offline behavior, or print output.

**Target:** Reduce initial-route JavaScript from the audited approximately
173 KiB gzip to 120 KiB gzip or less, while preserving the applicable Stage 0
interaction and warm-navigation guardrails.

**Risk:** Chunk failures, service-worker precache changes, suspense/focus
regressions, offline deep-link failures, and eager imports hidden elsewhere can
erase the intended gain or make navigation less reliable.

**Required regression and visual evidence:** Test every route, redirect,
deep-link refresh, browser back/forward flow, route focus target, offline reload,
service-worker update path, and print behavior in production builds. Record the
chunk graph and compressed sizes. Capture and review loading/error states plus
representative route screenshots in Chromium and Firefox.

**Exit criteria:** The compressed initial-route target is met or an explicit
measured exception is approved; major routes are independently chunked;
navigation, offline use, focus, and print remain correct; no worker or content
resource is recreated by warm tab navigation; durable deployment/architecture
documents reflect the chunking boundary; and the full repository check passes.

## Stage 3 — Bound Builder candidate rendering

**Status:** pending

**Dependencies:** Stage 2 complete

**Scope:** Extract the candidate selector into a behaviorally tested module and
add paging or windowing with no more than 200 mounted result rows. Filtering and
grouping continue to cover the whole candidate corpus. Preserve selected-item
initial positioning, favorites, inspection, sorting, keyboard and double-click
activation, focus, `aria-sort`, selection chips, exact occurrence identity, and
the rule that selection does not reorder rows.

**Targets:** At most 200 mounted result rows; p95 search-to-paint below 100 ms;
no input long task above 50 ms; and no silent truncation of search/filter
semantics.

**Risk:** Windowing can break table semantics, accessibility, focus restoration,
selected-row discovery, variable-height rows, grouped sections, or test-browser
behavior. Refactoring the selector can accidentally change rules commands or
the inspected-versus-selected distinction.

**Required regression and visual evidence:** Cover empty, short, exactly-200,
and thousands-row sets; whole-corpus search and grouping; selected items outside
the first window; favorites; all sort directions; inspection, single-click,
double-click, Enter, and Space behavior; clearing and multi-select limits;
keyboard focus through page/window changes; and accessible names/`aria-sort`.
Run Chromium and Firefox interaction tests and desktop/tablet light/dark visual
regression for each affected selector shape. Compare DOM counts, long tasks,
and p95 query-to-paint against Stage 0.

**Exit criteria:** All selector contracts remain behaviorally covered; no more
than 200 result rows mount; targets pass on the defined benchmark environment;
no evaluator or persistence semantics change; the interface design brief is
updated if implementation details become normative; and the full repository
check passes.

## Stage 4 — Decide Shop's indexing architecture

**Status:** pending

**Dependencies:** Stage 3 complete

**Product decision gate:** This stage must stop after both prototypes have
comparable evidence and before either architecture is adopted. Present the
results and a recommendation to the product owner/coordinator. Implementation
may resume only after the architecture choice is explicitly approved and
recorded in `decisions.md` and `query-engine.md`.

**Scope:** Prototype and measure two approaches against the same full-profile
and synthetic workloads:

1. extend and reconnect the existing general query worker; and
2. build a smaller Shop-specific indexed projection, likely worker-backed.

The audit recommendation is to prototype the lightweight Shop index first
because general index construction measured approximately 5.2 seconds, but that
recommendation is not approval to adopt it. The chosen implementation must
remove any unused query-worker asset from the shipped and precache graphs.

**Targets:** No Shop first-open main-thread task above 50 ms; p95 query-to-paint
below 100 ms; at most 200 mounted rows; identical exact-record filtering,
classification, family folding, sorting, purchase/give behavior, and result
ordering where ordering is part of the current contract; and no unused query
worker in shipped/precache assets.

**Risk:** A general index may improve queries while making first use materially
slower. A Shop-specific index may duplicate query semantics or drift from
catalog classification. Worker transfer/serialization cost may move rather than
remove latency. Changing the documented production query architecture without
the decision gate would create durable-contract drift.

**Required regression and visual evidence:** Use identical fixtures and metric
definitions for both prototypes. Test modern/legacy Browse taxonomies, dynamic
filters, search, every sort, affordability/proficiency/known filters, exact
magic variants and family expansion, buy/give, cancellation, profile changes,
worker restart/failure, offline use, and the 200-row bound. Capture first-open
and typing traces plus desktop/tablet light/dark Shop states in Chromium and
Firefox.

**Exit criteria:** Prototype evidence and recommendation are reviewed; the
product decision is explicitly approved and durably recorded; the selected
implementation meets all targets and behavioral tests; obsolete shipped assets
are removed; query-engine and interface documentation match production; and the
full repository check passes.

## Stage 5 — Evaluation scheduling

**Status:** pending

**Dependencies:** Stage 4 complete

**Scope:** Prioritize the visible current-level evaluation ahead of planning or
other hidden horizons. After that behavior is proven, investigate multi-horizon
batching or reusable evaluation snapshots only when measurements show a benefit.
Do not implement incremental evaluation without parity evidence and a separately
reviewed rules-boundary design.

**Risk:** Scheduling and cancellation changes can publish stale results, starve
planning work, cross character/profile boundaries, or create subtle differences
in rules output. Incremental evaluation is explicitly outside the approved
scope unless separately authorized.

**Required regression and visual evidence:** Cover exact evaluator goldens,
private diagnostics, current/planning/selected horizon combinations, request
priority, cancellation, stale-result suppression, profile/character changes,
cache hits and misses, nonconvergence/error recovery, undo/save sequencing, and
sheet parity. Record time-to-visible-result and hidden-work completion against
Stage 0. Capture any changed loading/status states and exercise them in Chromium
and Firefox.

**Exit criteria:** Visible evaluation cannot wait behind queued hidden planning
work; no stale or cross-profile result can publish; exact public goldens and
relevant private diagnostics remain truthful; applicable timing targets pass;
any batching/snapshot addition has independent evidence; rules-engine and
implementation-status documents are updated; and the full repository check
passes.

## Stage 6 — Decompose large orchestration modules

**Status:** pending

**Dependencies:** Stage 5 complete and behavioral coverage from Stages 0–5

**Scope:** Extract editor controller/state hooks, separate candidate-selection
behavior, extract dialog lifecycle and small sortable-header behavior, and
replace source-text implementation tests with rendered behavioral tests where
appropriate. Retain source scanning where it enforces a security boundary or a
deliberate structural contract. Avoid a universal table abstraction and avoid
moving evaluator-owned logic into UI helpers.

**Risk:** Large mechanical moves can conceal behavioral changes, create cyclic
dependencies, or turn meaningful domain differences into brittle generic APIs.
Source-text tests must not be removed until equivalent behavior or structural
protection exists.

**Required regression and visual evidence:** Map every moved state machine and
existing contract to focused tests before extraction. Exercise complete builder,
Equipment, Shop, View, and print journeys; save/undo/redo; deep links; error and
recovery states; accessibility interactions; and exact evaluator/sheet parity.
Compare Stage 0–5 metrics to ensure module boundaries did not regress runtime
behavior. Run representative Chromium/Firefox desktop/tablet visual regression,
including dialogs and selector/detail-card surfaces.

**Exit criteria:** The large orchestration modules have smaller cohesive
responsibilities with documented ownership; shared behavior is extracted only
where semantics agree; redundant source-text tests are replaced without losing
security/structural assertions; no rules, persistence, accessibility, visual,
or performance regression remains; durable architecture and implementation
status are current; and the full repository check passes.

## Progress and evidence log

Append entries; do not rewrite earlier evidence except to correct a factual
error with an explicit correction note. Each entry should include date, stage,
status transition, lead, commit(s), commands, measurements/artifacts, durable
documents changed, and remaining work or blockers. Never link or commit private
corpus artifacts.

| Date       | Stage   | Status transition      | Evidence and remaining work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-23 | Program | — → approved           | Functional audit and Stages 0–6 approved. All stages remain pending; Stage 0 is next. Audit measurements above require repeatable Stage 0 baselines before they are used as optimization claims.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-23 | Stage 0 | pending → in progress  | Fresh lead `functional_stage0_baselines` added a deterministic 681-record public fixture and a production-preview Chromium harness for every named journey and metric. Three runs recorded 118.9 ms median direct-editor readiness, 58.0 ms warm reopen, 28.6 ms candidate and 31.2 ms Shop median query-to-paint, no interaction-attributed Long Tasks, no warm-tab worker creation, and a 600,058-byte / 172,260-byte-gzip main bundle. The candidate DOM guardrail fails honestly at 420 rows; Shop passes at 200. Cold library and first direct-editor reads are approximately 797,000 and 1,192,771 payload bytes, dominated by content-pack reads. Public screenshots for the candidate table, Inventory, funds dialog, Shop, Sheet View, and print media were reviewed; the established Chromium/Firefox PDF gate remains the cross-engine print authority. Raw evidence and definitions are in `docs/functional-performance-baseline.md` and `docs/evidence/functional-baseline-2026-09-23/`. Focused fixture test, typecheck, lint, production build, three-run browser harness, and full `nix develop path:. -c bash scripts/check.sh` pass (69 files / 504 tests plus Chromium/Firefox print and PWA/content gates). Remaining: coordinator acceptance before marking Stage 0 complete or beginning Stage 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-09-23 | Stage 0 | in progress → complete | Coordinator reviewed and accepted the public fixture, raw three-run report, visual evidence, honest 420-row failure, metric definitions, and full verification evidence. Stage 0 is complete with no deferred exit criterion; Stage 1 — Storage and cache mechanics is next.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-23 | Stage 1 | pending → in progress  | Fresh lead `functional_stage1_storage_cache` implemented IndexedDB schema 5 metadata sidecars with upgrade backfill from schemas 1–4 and atomic payload/projection writes; changed the library to one metadata/portrait read and partition; moved pack listings to manifest/origin projections; and reused one installed-pack snapshot for advertised baselines. Character text metadata excludes both portrait forms; a separate targeted store preserves the rendered library thumbnail (still bounded by the domain's 5 MiB limit), while tests prove that the retained source image (accepted up to 20 MiB) and legacy source XML remain only in the authoritative record. The internal content-storage proof is created only by decoding and validating the exact encoded bytes it carries; corrupt, mismatched, and forged artifacts are rejected while both public install APIs still validate. The editor cache was removed, the application runtime's 32-entry cache became true LRU, and the unused Equipment `packId` was removed. The final comparable three-run production baseline reduced cold-library median payload from ~797,000 to 1,822 bytes (-99.77%) and direct-editor median payload from 1,192,771 to 469,440 bytes (-60.64%); direct-editor (+2.0%), warm reopen (+3.6%), and bundle gzip (+0.6%) remain within the 10% guardrail. No interaction Long Task or warm-tab worker appeared. Focused suites pass 46 tests, and full `nix develop path:. -c bash scripts/check.sh` passes formatting, lint, 69 files / 512 tests, workspace typechecks, production/PWA build, Chromium/Firefox print matrices, content determinism/validation, and the query benchmark. Raw evidence is in `docs/evidence/functional-stage1-2026-09-23/functional-baseline.json`. Remaining: coordinator review and acceptance before Stage 1 is marked complete. |
| 2026-09-23 | Stage 1 | in progress → complete | Coordinator reviewed the schema-5 migration and recovery paths, exact-byte validation boundary, portrait payload separation and explicit upper bound, cache isolation/LRU coverage, and comparable performance evidence. An independent final-tree `nix develop path:. -c bash scripts/check.sh` passed formatting, lint, 69 files / 512 tests, workspace typechecks, production/PWA build, Chromium/Firefox print matrices, content determinism/validation, and the query benchmark. Every Stage 1 exit criterion is accepted with no deferred incompatibility; Stage 2 — Route-level lazy loading is next.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Coordinator checklist for each handoff

- Confirm the lead read `AGENTS.md`, this plan, and all stage-linked durable
  documents rather than relying on conversation history.
- Confirm scope stayed within the approved stage and no private data entered a
  public fixture, report, screenshot, or commit.
- Review architectural deviations and require the Stage 4 decision gate.
- Independently run proportionate focused checks and the full repository check
  before accepting stage completion.
- Verify before/after measurements use comparable inputs and record variance.
- Verify changed UI in real browsers and review the required visual evidence.
- Confirm stage status, progress log, implementation status, decisions, and
  subsystem documents state the same boundary.
- Confirm commits are focused and the worktree contains only documented,
  intentional changes.
