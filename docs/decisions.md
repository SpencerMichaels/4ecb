# Architecture decision log

This file records product-level decisions. Implementation-level decisions should
be added as short ADRs when they affect multiple packages, stored formats,
compatibility, deployment, security, or long-term maintenance.

## Settled decisions

### D001 — Offline-first, account-free ownership

Character and content data are owned by the browser installation and persisted
in IndexedDB. Accounts and a permanent user database are not prerequisites.
Portable export, backup, and cross-device transfer are explicit features.

### D002 — React, TypeScript, and Vite PWA

The browser application uses React, TypeScript, and Vite, with service-worker
offline support and Web Workers for rules, indexing, and heavy imports. Builder
and compendium target desktop/tablet; play mode is a purpose-built phone surface.

### D003 — Normalized native model with legacy adapters

`.dnd4e`, `.dndcamp`, WotC indexes/containers, and CBLoader formats are
compatibility boundaries. The native model uses versioned typed documents and
retains a preservation envelope for unknown legacy data.

### D004 — Versioned immutable content profiles

Characters pin a resolved profile and rules-semantics version. Content updates do
not silently alter existing characters. Migration is previewed and explicit.

### D005 — Separate durable character, play state, and derived snapshot

Build choices and possessions live in `CharacterRecord`; mutable table values
live in `PlayState`; calculated values live in disposable deterministic
snapshots. A play state references a specific character revision.

### D006 — Generic data-driven builder is required for MVP

The MVP cannot be a hand-coded showcase for a subset of races/classes. UI views
may be domain-specific, but required choices and legality come from the recovered
generic engine and content.

### D007 — Import and read-only viewing precede full editing

Read-only `.dnd4e` import, sheet viewing, and round-trip work ship as pre-MVP
milestones. Full editing remains an MVP requirement.

### D008 — One semantic sheet model, multiple render modes

Browser, print, and interactive play sheets consume the same `SheetDocument` and
card models. Rules and character domains do not contain PDF or CSS layout logic.
Browser print/save-to-PDF is the first PDF implementation; a deterministic PDF
backend can be added behind the model if evidence requires it.

### D009 — Public code, user-supplied proprietary corpus

The public application, hosted deployment, CI fixtures, and default Docker image
do not bundle the full official 4E corpus without later legal permission. Users
may import legally obtained local data or compile/mount private content packs.

### D010 — Optional encrypted relay, no server character ownership

Device handoff and live sessions use an optional WebSocket relay. The relay
orders and temporarily stores opaque encrypted envelopes, has no accounts, and
does not become the authoritative character database.

### D011 — Capability-based linked sessions

Player, DM, and read-only capabilities authorize session commands. A DM may apply
permitted damage/effects and observe a projection but cannot change build
choices. Operations are idempotent, ordered, visible in an audit log, and
recoverable after disconnection.

### D012 — WebSockets before WebRTC

WebSockets are the initial transport because reliability across mobile networks,
reverse proxies, and homelabs is more valuable than eliminating the small relay.
End-to-end payload encryption preserves privacy. WebRTC can be evaluated later
without changing the session command model.

### D013 — Phone receives a portable character slice

Desktop-to-phone handoff transfers a `PortablePlayBundle` containing the
character and referenced descriptions, not the complete content corpus. Manual
file transfer is the no-relay fallback.

### D014 — Project-local Nix tooling

Development and analysis dependencies that require installation are declared in
project-local Nix environments. Documentation and CI commands must not assume
host-global installations.

### D015 — Public relay is supported but optional

The project may operate a public short-lived relay to make QR handoff and linked
sessions convenient. Self-hosters can configure their own relay, and all core
building/local-play functionality works with no relay configured.

### D016 — Functional UI structure precedes visual refinement

Early UI work concentrates on information architecture, workflow completeness,
responsive structure, accessibility, and every meaningful system state. It uses
a restrained, replaceable baseline style and does not spend substantial effort
on branding, elaborate themes, or animation. Visual refinement is performed
later against functioning screens in short feedback loops with the product
owner. No workflow may depend on animation or decorative presentation for its
correctness.

### D017 — M2 uses a purpose-built in-memory query index

The first physical compendium index is a dependency-free, worker-hosted inverted
token index over normalized entities. It precomputes normalized facets and
numeric sort/filter values, resolves ID-valued facets to display names, and
builds relationship edges from stable-ID references. The public serializable
query AST remains independent of this implementation so a later measured need
can replace it without changing URLs, saved searches, builder choice dialogs, or
UI contracts. Full-corpus measurements met the M2 budgets without adding a
search runtime or prebuilt binary index.

### D018 — IndexedDB stores verified encoded pack bytes

New content-pack installations retain the original verified `.4ecp` bytes in
IndexedDB rather than cloning the much larger decoded object graph. Readers
decompress and decode on demand in a worker. This keeps the installed private
corpus close to its approximately 5.6 MiB gzip size and makes storage writes
proportional to the portable artifact. M1 object-form records remain readable so
the change does not invalidate existing browser installations.

### D019 — M3 preserves the complete legacy character envelope verbatim

Before the modern rules engine can regenerate every legacy cache, an imported
character stores the complete `.dnd4e` XML string alongside a normalized,
versioned read model. Export returns that envelope unchanged, so comments,
ordering, unknown elements and attributes, unresolved choices, and compatibility
caches survive. Library metadata, content binding, and sheet preferences live
outside the envelope. M4 commands will make normalized authoritative state
editable; engine-backed export will then update recognized XML while retaining
unknown extensions. The UI labels all M3 calculations as legacy cached values.

### D020 — Edited `.dnd4e` export is a separate explicit compatibility target

The byte-exact imported envelope remains available as **Original imported file
(no edits)** and never silently absorbs native edits. **Legacy Character Builder
0.07a** is a separate target that requires a converged exact-profile evaluation,
regenerates recognized authoritative structures and `CharacterSheet` caches,
and merges opaque campaign/extension data from the envelope. It allocates fresh
document-local occurrence tokens and repairs representable replacement links.
The application re-imports and semantically compares edited output before
download. Structural round-trip success is necessary but does not claim old-
application compatibility until the curated launch matrix passes.

### D021 — Browser directory onboarding reads normalized sources, not keys

The progressive directory picker discovers portable `.4ecp` packs and
recognized decrypted/merged `.dnd40.xml` files through a bounded, read-only
scan. It keeps directory handles ephemeral and reads only the candidate the user
chooses to install. Rules XML is parsed, normalized, compressed, and validated
in a worker before IndexedDB commit. The ordinary file picker accepts the same
formats as a Firefox/Safari fallback. Encrypted-container decryption, update URL
processing, and loose `.part` merging remain in the project-local Nix content
tool so the public browser does not acquire private keys or a legacy updater
attack surface.

## Deferred decisions and decision points

These are deliberately deferred until a milestone produces the evidence needed
to choose well.

### Content-pack physical encoding

Start with a deterministic, inspectable representation. Adopt compression,
binary records, prebuilt indexes, SQLite/WASM, or another encoding only when M1
measurements demonstrate a concrete startup, size, or memory problem.

### Incremental rules evaluation

Implement a correct deterministic pipeline first. Add dependency graphs and
incremental invalidation during M4 only where profiling identifies expensive
repeated work.

### Dedicated PDF backend

Ship browser printing if it meets Letter/A4 acceptance tests. Adopt a separate
client-side PDF implementation if supported browsers cannot paginate cards and
sections consistently enough.

### Relay implementation language and ephemeral store

Select the smallest maintainable runtime during M7. The protocol, privacy
boundary, TTL, and Docker contract matter more than Node versus another runtime.
Use memory for development; choose optional SQLite or equivalent only if the
required restart behavior warrants it.

### Public-relay operating limits

Room TTL, payload limits, connection limits, and rate limits require realistic
M7 bundle sizes and load tests. Secure conservative defaults are fixed before a
public endpoint launches.

## ADR template

Future decisions should include:

```text
Title
Status: proposed | accepted | superseded
Date
Context
Decision
Consequences
Alternatives considered
Evidence / milestone that triggered the decision
```
