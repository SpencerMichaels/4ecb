# Architecture

## System overview

The product is an offline-first web application with an optional synchronization
service. The local application is fully capable without the service.

```text
Legacy WotC data ----> compatibility adapters ----> versioned content profile
Legacy .dnd4e  -----> compatibility adapters ----> character record
                                                    |
character record + content profile + play state ---> rules engine
                                                    |
                                           evaluated snapshot
                                            /       |       \
                                      builder   sheet/print   phone play
                                                               |
                                                   encrypted session protocol
                                                               |
                                                    optional relay <--> DM app
```

The core architectural invariant is:

> Stored inputs are authoritative; calculated snapshots are reproducible;
> legacy caches are compatibility evidence, not the new source of truth.

## Runtime components

### Web application

A React, TypeScript, and Vite PWA supplies route-level, code-split experiences:

- `/characters` for the local character library and read-only sheets;
- `/compendium` for global search and entity detail;
- `/builder/:characterId` for desktop/tablet character construction;
- `/sheet/:characterId` for browser reference and print preview;
- `/play/:characterId` for phone-first table state; and
- `/settings` for imports, packs, backups, diagnostics, and relay configuration.

The UI communicates with rules, content-query, and import workers through typed
request/response messages. UI components do not access rules XML or implement
calculation formulas.

Initial UI implementation is intentionally visually conservative. It establishes
semantic page structure, navigation, responsive breakpoints, keyboard behavior,
loading/empty/error/invalid states, and reusable accessible controls before a
product theme or motion language is finalized. Theme tokens must remain easy to
replace; domain and feature components must not depend on ornamental effects or
animation timing for correctness.

### Content tool

The command-line content tool runs in the project-local Nix environment. It:

- decrypts and reads supported legacy containers;
- reads WotC indexes and CBLoader `.part`/`.index` sources;
- validates and merges content using compatibility semantics;
- normalizes records and compiles indexes;
- produces a deterministic, versioned content pack;
- reports conflicts, malformed records, unsupported statements, and provenance;
  and
- can inspect/diff packs without starting the web application.

The browser can perform the same logical import client-side when users select
legacy files, but the CLI is the reproducible and self-hosting-friendly path.

### Optional session relay

The relay is a small independent WebSocket service. It orders and temporarily
stores opaque encrypted envelopes; it does not own characters, interpret rules,
or require user accounts. It is absent from MVP deployment and introduced in M7.

## Monorepo organization

```text
apps/
  web/                 Browser application and PWA shell
  content-tool/        Deterministic import/compiler/inspection CLI
  session-relay/       Optional opaque-envelope relay (post-MVP)
  dm/                  Future adjacent product, not builder 1.0 scope

packages/
  content-domain/      Normalized game entities and provenance
  content-pack/        Pack manifest, codecs, validation, migration
  character-domain/    Durable character aggregate and edit commands
  play-domain/         Mutable table state and deterministic operations
  rules-engine/        Choice, prerequisite, stat, and legality evaluator
  query-engine/        Full text, facets, filters, sorting, query AST
  sheet-model/         Semantic sheets, sections, and reference cards
  legacy-wotc/         WotC.index/container compatibility
  legacy-dnd4e/        Loss-preserving character import/export
  legacy-campaign/     .dndcamp compatibility
  session-protocol/    Pairing, capabilities, encrypted message schemas
  browser-storage/     IndexedDB repositories, transactions, migration
  ui/                  Low-level accessible visual primitives

docs/                  Product plan and maintained implementation docs
reverse-engineering/   Legacy evidence, specifications, schemas, fixtures
```

Packages correspond to independently testable domain or runtime boundaries.
Feature pages remain in `apps/web` until a real second consumer justifies a new
package.

The shared `ui` package begins as a small structural/accessibility layer rather
than a comprehensive branded design system. Components are added when a real
workflow needs them. Visual exploration and higher-polish theming happen against
working screens with direct product-owner feedback, not as an up-front styling
project.

## Authoritative documents

### CharacterRecord

`CharacterRecord` contains durable character information:

```text
schemaVersion
characterId
recordRevision
createdAt / updatedAt
contentProfileRef
rulesSemanticsVersion
identity
buildTimeline[]
selections[]
inventory[]
permanentLoadout
wealth
rituals / companions
notes / portrait
campaignRef
legacyEnvelope?
```

Every occurrence—selection, inventory holding, customized power, companion—has a
stable occurrence ID in addition to any source rules-element ID. Commands edit
the record; components do not mutate nested fields directly.

`buildTimeline` preserves level-by-level selection and retraining intent. A
flattened current build is a derived projection. This is essential for legacy
export and for explaining how a character reached its current state.

`legacyEnvelope` retains unrecognized XML, attributes, ordering hints, and
compatibility caches needed for loss-preserving export. Recognized semantic data
is never read back from this envelope as the normal source of truth.

Schema 2 implements the first authoritative subset of this aggregate. It adds a
level-tree `CharacterBuild` with stable occurrence IDs, retraining links, base
abilities, inventory, text values, and transactional commands. Imported schema-1
records migrate lazily in the browser. The normalized legacy `CharacterSheet`
snapshot remains a comparison/read model and never becomes authoritative; the
verbatim envelope remains the compatibility source for no-edit export.

### PlayState

`PlayState` is a separate mutable overlay:

```text
schemaVersion
playStateId
characterId
baseRecordRevision
playRevision
currentHp / temporaryHp
surgesUsed / actionPoints
deathSaveFailures
powerUses{}
effects[]
equipmentOverrides[]
treasureLedger[]
sessionNotes[]
operationLog[]
sessionBinding?
```

Play operations include stable operation IDs, actor IDs, timestamps, base
revisions, and structured payloads. Commands include damage, healing, temporary
HP, resource use, power use/recharge, effect application/removal, turn advance,
temporary equipment changes, and treasure entries.

Effects include source, duration, expiry trigger, stacking group, visibility,
mechanical modifier statements, and descriptive fallback text. Durations use
game events such as “start of source's next turn,” not wall-clock timers.

Temporary equipment and treasure can be explicitly reconciled into the durable
character record after play. They are not silently committed by session traffic.

### EvaluatedCharacterSnapshot

This immutable projection combines a character record, content profile, engine
semantics version, optional campaign restrictions, and optional play state. It
contains:

- derived statistics and totals;
- every contributing modifier and its provenance;
- active choices and remaining choice requirements;
- legality diagnostics and prerequisite explanations;
- resolved powers, attacks, and equipment variants;
- sheet-ready semantic facts; and
- input fingerprints for cache validation.

Snapshots may be cached but are disposable. Given identical versioned inputs,
evaluation must be deterministic.

### PortablePlayBundle

A portable play bundle transfers one character to a phone without transferring
the full corpus. It contains:

- the necessary character subset;
- current play state;
- evaluated and sheet/card projections;
- only referenced power/item/feature descriptions needed during play;
- content and engine fingerprints; and
- format/version metadata.

The bundle is a portable file and the encrypted payload used in QR pairing.

## Content model and profiles

### Content pack

A content pack is immutable and content-addressed. Its logical contents are:

```text
manifest
  pack format version
  pack ID and digest
  source/provenance inventory
  engine compatibility range
  dependencies and overlays
  compilation options
entities
  normalized records keyed by stable ID and type
rules
  parsed rule IR and preserved source expressions
indexes
  full-text tokens, facets, sort keys, relationship indexes
diagnostics
  compilation warnings and unsupported behavior
```

The physical encoding may evolve independently behind `content-pack`. The first
implementation should optimize for deterministic generation, streaming import,
browser storage, and debuggability before adopting a complex binary format.

### ContentProfile

A content profile is an ordered set of immutable packs plus resolution policy:

```text
profileId
profileRevision
orderedPackRefs[]
campaignRestrictions?
conflictPolicy
rulesSemanticsVersion
resolvedDigest
```

Characters pin a resolved profile revision. Installing a newer pack does not
alter them. Profile migration produces a preview of missing IDs, changed rules,
new diagnostics, and calculated differences before the user accepts it.

Custom content uses namespaced IDs and explicit overlays. Conflicts are visible;
load order is never an accidental filesystem-order behavior.

## Legacy compatibility adapters

Compatibility packages isolate recovered quirks from the clean domain:

- `legacy-wotc` implements the encrypted container, WotC index, update, and
  CBLoader merge semantics already specified under `reverse-engineering/`.
- `legacy-dnd4e` separates authoritative inputs from regenerated `CharacterSheet`
  and calculation caches, while preserving unknown extensions.
- `legacy-campaign` maps restrictions and house-rule elements to a profile
  overlay.

Import produces a structured report containing mapped fields, preserved unknown
data, missing content references, stale caches, repairs, and lossy decisions.
Export validates against the compatibility schemas and, where practical, is
loaded by the original application in automated or manual conformance tests.

Export is explicit about its target compatibility profile. New application-only
features that cannot be represented in `.dnd4e` remain in native exports and
produce warnings rather than being silently discarded.

## Rules engine

The engine implements the recovered rule language and fixed-point character
update lifecycle. Internally it should expose phases rather than a single opaque
`calculate()` call:

1. resolve content profile and character occurrences;
2. establish level/history context;
3. apply grants and removals;
4. discover and resolve choices;
5. evaluate prerequisites and legality;
6. apply stat, text, alias, and power-modification statements;
7. resolve equipment, weapon, implement, and power combinations;
8. apply campaign and play-state effects;
9. produce diagnostics and modifier provenance; and
10. materialize the evaluated snapshot.

The engine and domain are UI-independent TypeScript. Expensive evaluation runs in
a Web Worker. Initial implementation may recalculate broadly; incremental
dependency invalidation should be introduced only after profiling proves which
work dominates.

Every result exposes its components. A defense total, for example, is not just
`24`; it is a total plus base formula, ability contribution, class, armor, feat,
enhancement, item, conditional, play-effect, and manual modifiers with source
IDs.

## Character editor

The editor is driven by unresolved choices and diagnostics from the engine,
rather than a fixed wizard hard-coded around known classes. Feature modules
provide navigation and editing views for identity, abilities, race, class,
skills, feats, powers, equipment, level advancement, retraining, and related
domains, but the engine determines what is required and legal.

Edits are expressed as commands and applied transactionally:

```text
chooseElement
replaceSelection
retrainSelection
advanceLevel
changeStartingLevel
addInventoryHolding
equipHolding
customizeHolding
setCampaignProfile
```

The UI supports incomplete and temporarily invalid drafts. It distinguishes
blocking errors, warnings, unresolved required choices, and legal-but-unusual
states. Undo/redo is command-based within an editing session.

## Compendium and query engine

The compendium operates on normalized typed fields plus full rule text. Queries
are represented as a serializable AST supporting:

- full-text terms and phrases;
- type-specific predicates;
- numeric and level ranges;
- include/exclude multi-select facets;
- source, tier, usage, action, keyword, slot, rarity, class, race, ability, and
  other indexed dimensions;
- sort keys and stable pagination; and
- relationship queries such as granted powers or prerequisite references.

Indexing and querying run in a Worker. The first implementation should benchmark
the real corpus before selecting a third-party search implementation. The query
AST and typed facet contract insulate UI and saved searches from that choice.

The same query primitives power compendium pages and builder choice dialogs, with
the builder adding engine-provided legality and recommendation context.

## Sheet and card rendering

`sheet-model` converts an evaluated snapshot into a layout-neutral `SheetDocument`:

```text
metadata
sections[]
  header / abilities / defenses / hit points / skills / attacks / features
  power index / equipment / wealth / portrait / notes / rituals / companions
cards[]
  summary / action point / basic attack / power / item
renderWarnings[]
```

Reference-card models contain semantic labeled fields, not preformatted HTML.
One visual card component supports:

- static browser reference;
- print layout; and
- interactive play mode, where activation dispatches a `PlayState` command.

Print settings form a persisted `SheetRenderProfile` with paper size, orientation,
included sections, card options, color mode, font scale, and blank-field policy.
Print CSS uses explicit page boxes, break controls, fixed card grids, and cut-safe
margins. US Letter and A4 both have golden-output tests.

The initial PDF path is browser print/save-to-PDF. A future deterministic PDF
backend may consume the same `SheetDocument`; PDF concerns must not enter the
rules engine or character record.

The recovered viewer is supporting evidence: it already separates panel models,
page layouts, card factories, and card types, and its PDF path snapshots rendered
pages into XPS before conversion. The modern system preserves the useful
separation while replacing WPF/XPS and the legacy visual assets.

## Phone play mode

Play mode is a dedicated responsive application surface, not the desktop builder
compressed to phone width. It is installable as part of the same PWA and is
code-split from builder-heavy UI.

Primary navigation:

- **Dashboard:** HP, temporary HP, surges, action points, defenses, saves,
  movement, senses, and quick adjustments.
- **Powers:** cards, filters, usage state, recharge, and weapon variants.
- **Effects:** active conditions, sources, durations, manual modifiers, and
  expiry controls.
- **Equipment:** current loadout, consumables, quick item reference, and temporary
  overrides.
- **Journal:** treasure ledger, session notes, and operation history.

The player can always use play mode locally. A network outage never prevents a
local HP or power-use update.

## Pairing and session synchronization

### Device handoff

The desktop creates an encrypted portable play bundle and a short-lived relay
room. A QR code contains the room locator and a client-side encryption secret in
a URL fragment or equivalent non-server-visible channel. The phone retrieves and
decrypts the bundle, stores it locally, and acknowledges completion. The room
expires quickly. Manual bundle export/import is always available.

### Session model

Session messages are versioned envelopes:

```text
protocolVersion
sessionId
messageId
actorId
capability
characterId
baseRevision
sequence?
ciphertext
```

The encrypted payload contains deterministic play commands, acknowledgements,
snapshots, and resynchronization requests. Message IDs make retries idempotent;
server sequence numbers provide an agreed order. Raw last-write-wins replacement
of the whole play document is prohibited because order matters for damage,
temporary HP, effects, and resource use.

Capabilities distinguish player control, DM effect/damage control, and read-only
observation. The DM cannot alter build selections. Remote mutations are visible
in an audit log and can be corrected through compensating commands.

The relay stores only opaque envelopes and minimal expiry/routing metadata. It
may use memory or SQLite for short-lived recovery, with a configurable TTL and
strict size/rate limits. It exposes health checks and metrics that contain no
character content.

### Disconnection and reconciliation

Clients continue recording local operations while disconnected. On reconnect
they submit unacknowledged commands, receive ordered missing commands, replay
from the last agreed snapshot, and surface semantic conflicts that cannot be
resolved automatically. The protocol includes periodic encrypted snapshots so a
late joiner need not replay an unbounded history.

## Browser persistence

IndexedDB stores application metadata, content packs, profiles, characters,
play-state documents, query indexes, and migration journals in separate logical
repositories. Large immutable packs and mutable user records are not placed in a
single replacement-prone object.

Storage rules:

- transactions cover each user-visible mutation;
- migrations are restartable and preserve the previous record until commit;
- content packs are verified by digest before activation;
- snapshots and indexes are rebuildable caches;
- user-authored documents are never evicted by application cleanup code;
- the application requests persistent storage where supported and explains the
  browser's decision; and
- native backup bundles are versioned, checksummed, and inspectable before
  restore.

The service worker precaches the application shell and manages versioned static
assets. It does not cache user content through ordinary HTTP cache semantics.
Application upgrade UI detects when a new shell is ready and avoids refreshing
during an active edit without consent.

## Deployment

### MVP container

The MVP image contains a static, unprivileged web server and built assets:

```text
/app/static
/app/runtime-config.json
/data/content/          optional read-only mounted packs
```

The runtime-configuration path is reserved for future default pack URLs, feature
flags, base path, storage guidance, and relay URL without rebuilding the image;
the current application does not load those fields. The file stays outside the
service-worker precache and is network-only so later operator overrides cannot
be shadowed by the build-time default. The image has a health endpoint,
read-only root filesystem support, no bundled proprietary corpus, and documented
reverse-proxy/HTTPS configuration.

### Post-MVP Compose deployment

```text
web       static PWA
relay     optional WebSocket service
volume    optional relay SQLite/ephemeral state
```

The relay is independently optional and horizontally replaceable. Character
storage does not move into the relay merely because it exists.

## Security boundaries

- Content packs, legacy XML, portraits, notes, and imported HTML-like text are
  untrusted inputs.
- Rendering escapes content; rich rules text uses a small parsed markup model,
  never unrestricted HTML.
- XML parsing disables external entities and resource fetching.
- Archive imports enforce entry-count, path, compression-ratio, and total-size
  limits.
- Worker messages and stored documents are schema-validated at runtime.
- Cryptography uses browser/platform primitives and a reviewed protocol; the
  project does not invent encryption constructions.
- Pairing secrets are redacted from logs and excluded from server-visible query
  strings.
- The public relay includes TTL, size, connection, and rate limits to constrain
  abuse without accounts.

## Testing and compatibility strategy

### Test layers

1. **Unit tests:** parser, rule statement, domain command, effect, query, and
   migration behavior.
2. **Fixture tests:** synthetic cases under `reverse-engineering/fixtures` for
   every recovered grammar and hard-coded exception.
3. **Corpus tests:** structural and semantic validation across the complete local
   dataset without publishing its prose in test artifacts.
4. **Golden character tests:** imported sample characters compared against
   recovered legacy calculations, choices, equipment, and powers.
5. **Round-trip tests:** legacy import/export/re-import with semantic and
   preservation diffs.
6. **Browser integration tests:** storage, workers, offline operation, undo,
   profile migration, and import progress.
7. **Visual and print tests:** sheet and card screenshots plus extracted PDF text,
   page count, dimensions, clipping checks, Letter, A4, color, and monochrome.
8. **Protocol tests:** duplicate delivery, reordering, disconnect, late join,
   expiry, capability denial, and encrypted snapshot recovery.
9. **Original-application smoke tests:** a curated exported corpus opened in the
   legacy builder where automation or repeatable manual testing is practical.

### Compatibility reporting

Engine parity is reported by feature and corpus coverage rather than one vague
percentage. Reports list:

- parsed and unsupported rule statements;
- unresolved IDs and content conflicts;
- prerequisite and availability mismatches;
- stat and modifier mismatches;
- power/weapon variant mismatches;
- lossy import/export fields; and
- hard-coded exception coverage.

No mismatch is hidden by accepting legacy cached totals as the engine result.
Caches may be used as an oracle during development and as a degraded read-only
fallback when content is missing.

## Observability and supportability

The browser includes a user-invoked diagnostics export containing versions,
feature flags, sanitized errors, profile manifests, and validation reports.
Character names, notes, game prose, portraits, and pairing secrets are excluded
unless the user explicitly selects them.

The relay exposes operational counts and latency without payloads. Logs use
opaque session/message identifiers and enforce retention limits.
