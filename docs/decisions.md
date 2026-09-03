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

### D022 — Comprehensive UI validation follows UI design

M5 retains inexpensive structural safeguards: semantic landmarks and labels,
basic keyboard operation, non-forced viewport sizing, readable functional
layouts, and automated Letter/A4 print correctness. It does not require full
keyboard traversal, screen-reader audits, touch/zoom approval, physical-device
matrices, Safari coverage, raster print review, or subjective visual
accessibility sign-off while the interface is intentionally provisional.

Those checks apply to the interface that will actually ship, so M5.5 owns a
product-owner design pass followed by comprehensive desktop/tablet,
assistive-technology, performance, and visual-print validation. Existing
Chromium/Firefox functional print automation remains in the public gate as
valuable regression coverage; moving final UI validation does not discard it or
relax rules, storage, security, compatibility, or data-integrity requirements.

### D023 — Layered local content profiles with advertised baselines

Administrators may advertise an ordered immutable baseline of `.4ecp` URLs and
exact digests through non-secret runtime configuration. Browsers download with
the ordinary 128 MiB bound, validate the configured identity/digest, and retain
verified bytes in IndexedDB for offline use. Users may layer ordered personal
packs above that baseline; personal bytes never upload. Stable-ID collisions
use explicit `last-pack-wins-v1` resolution and are previewed before activation.
Installing or downloading never changes the active profile or an existing
character. Characters bind to the materialized digest, ordered source
IDs/digests, and resolution policy. Existing single-pack activation is read as
a one-layer profile. Changed immutable revisions require a new
revision-qualified pack ID; a digest may not replace an installed ID.

### D024 — Printed sheets are selectable views of one sheet model

The builder and printed character sheets use separate presentation layouts over
the same authoritative sheet model. Print preview exposes a sheet-template
choice. The first maintained template closely preserves the legacy sheet's page
and information geography because it is familiar and supplies the lowest-risk
starting point; later modern templates may redesign hierarchy and pagination.
Templates do not fork character data, rules evaluation, or content-profile
bindings. A new template is therefore presentation work with its own print
regression fixtures, not a new character format.

### D025 — Current level and planned build horizon are distinct

A character has a current effective level and may retain planned selections at
higher levels. Future selections remain editable and survive planning-horizon
changes, but do not contribute to current evaluation, sheets, or compatibility
exports until their level becomes active. Lowering the planning horizon hides
rather than destroys retained future work. Character commands autosave after
their transactional storage commit and remain undoable; the interface exposes
truthful saving, saved, and failure states instead of relying on an explicit
Save action.

### D026 — Choice browsing is category-bounded and optimistically responsive

The temporary **Show all** control expands a choice only to candidates that
belong to that slot's category but fail an objective legality constraint such as
a prerequisite. Category mismatches are evaluator diagnostics and recovery
evidence, not options for that slot, so the control never exposes them. Every
information-bearing choice presents the focused/selected record in an adjacent
detail pane. A selection updates the in-memory transaction and visible control
before storage completes; IndexedDB writes are serialized in the background.
Success remains truthful only after commit, and failure rolls the entire pending
suffix back to the last durable build.

### D027 — Levels are workspace pages and repeated slots use specialized controls

The main builder pane presents the selected level as one scrollable page with a
subsection for every choice; the timeline summarizes status and navigates into
that page instead of replacing it with a one-dropdown screen. Repeated
Background slots retain their evaluator order but progressively disclose
optional empty slots behind **Add another background…**. Skill Training slots
render as category-bounded toggle lists with an `X out of Y` count. A filled
single-slot scope behaves like a radio group: clicking another eligible skill
replaces the current selection immediately. These are presentation groupings
only: every background and skill still maps to its exact provider, rule ordinal,
and choice index. Clearing a trained skill writes a blank unresolved placeholder
at the same position, and filling chooses the first compatible unresolved
position, so history and legacy serialization do not compact or reorder.

Background-benefit records use a presentation-only two-stage control grouped
by their legacy names: language, +2 to one skill, add a class skill, background
benefit, and an explicit fallback for unknown forms. The second stage always
dispatches the original exact content record. The optional +1-to-two-skills
rule is deliberately not synthesized without confirmed legacy-builder storage
behavior. When repeated skill slots have different candidate sets, the UI
groups identical scopes into separate selectors so constrained grants and
ordinary class training remain visibly distinct.
Standard background-benefit candidates whose prerequisites name a background
association or exact background ID are eligible only while that association or
background is currently owned. This mirrors the legacy content's explicit
prerequisite fields and prevents unrelated class-skill, skill-bonus, language,
and named-benefit records from leaking into the default selector.

### D028 — Raw content metadata is preserved but not presented as rules text

Imported categories, underscore-prefixed specifics, rules-engine prerequisite
expressions, and specific values made only of uppercase underscore-delimited
machine tokens remain losslessly stored and available to the rules, query, and
compatibility layers. Builder detail, compendium detail, and sheet-card
presentation omit them, along with the legacy renderer's named internal fields
such as `Display`, `InternalOnly`, equivalence links, and granted-power IDs.
Player-facing prerequisite text comes only from the separate
printable-prerequisite field. This follows the legacy builder's
separation between display fields and internal relationship metadata: its card
path rejects underscore fields and applies type-specific standard-field
exclusions, while its generic detail path does not enumerate the entire raw
specific collection.

### D029 — Archery mastery is an exact legacy exception; feat families are presentation groups

The three published Archery Mastery class-feature IDs synthesize an optional
replacement choice for their corresponding Expert Archer power. Eligible
targets are owned, leveled Ranger at-will attack powers; the replacement remains
an exact occurrence with `replacesId`, preserving retraining history and legacy
serialization. This is deliberately ID-bounded because these feature records
carry associated-power metadata but no declarative replacement rule.

Large parenthetical feat families use a two-stage control when at least four
currently visible candidates share the same outer base name. The first stage
chooses the family and the second its parameter; only the final exact candidate
is dispatched. Thus `Weapon Proficiency` plus `Greatbow` still stores and exports
the original `Weapon Proficiency (Greatbow)` definition. Smaller families remain
ordinary exact choices, and this grouping never changes rules eligibility.

Dependent choices whose provider is the preceding choice's selected occurrence
are also grouped for presentation. They remain separate evaluated and stored
choices, but the level pane and timeline expose one progressive flow. This
keeps multi-part decisions such as Archery Mastery together without introducing
a special composite domain command or weakening round-trip compatibility.
Repeated slots from the same provider, rule ordinal, type, and level are also
one presentation group with separate exact controls. Corpus auditing confirms
this general rule covers paired ability increases, level-1 at-will selections,
and hybrid-class pairs without conflating unrelated choices.

Generic optional replacement rules are an on-demand retraining affordance, not
a standing choice card or timeline to-do. Their skill, feat, and power actions
filter only the replaceable targets while retaining the evaluator's exact
replacement candidates and command. Named replacement consequences remain in
their owning progressive flow. The unavailable-choice filter is shared by the
selected level, and compact mechanical choices may omit a non-informative
candidate detail pane.

Selected-level choices use the legacy builder's mechanical creation-pane
category order as a presentation convention: Class, Race, Background, Ability
Scores, Skills, Powers, Spellbook, and Feats. Gender, alignment, and deity are
excluded from levels and the level timeline and live in a sibling Character
details tab. This does not change provider ownership, rule order, or
serialization. Each category contains compact controls and the workspace owns
one focus-driven detail viewer, matching the legacy checklist/`InfoViewer`
relationship without reproducing its modal wizard navigation. Numbered step
chrome is limited to actual dependent flows; simple detail choices render as
one label and one control.
Choice headings follow the same rule across all categories: the outer bar names
the legacy workflow category once, an inner heading is retained only when it
identifies a distinct decision or dependent flow, and generic dropdowns do not
visibly repeat the word **Selection**. Repeated power groups derive their
player-facing usage label from same-category candidates (for example,
**At-Will Powers**) and keep positional labels only where they distinguish
multiple exact slots.
Base ability scores are part of the level-1 Ability Scores presentation even
though they remain scalar fields in the native build rather than evaluated
choice occurrences. Replacement choices suppress their result selector only
when the underlying replacement rule has exactly one candidate and that
candidate is visible; selecting the replaced occurrence then dispatches that
exact candidate automatically.

Base ability entry defaults to the legacy 22-point-buy workflow. A new native
character starts at `8, 10, 10, 10, 10, 10`; the level-1 editor uses compact
plus/minus steppers, reports points remaining, shows the cost of the next
increase, and offers an atomic reset to that allocation. The level timeline and
overview count an allocation with unspent points as unresolved. Exact 22-point
allocations are complete; overspent, out-of-range, or multiple-low-score arrays
are retained and displayed as house rules. Direct numeric entry remains
available for rolled/custom characters, preserving the legacy builder's
separation between recoverability and legality. Racial and level adjustments
remain outside these base inputs.

Repeated ability-increase slots from one legacy select rule render as one
six-ability toggle grid rather than positional dropdowns. The UI preserves the
two exact underlying occurrences, allows each ability at most once, updates the
count optimistically, and requires clearing one selected ability before choosing
a different one when all slots are occupied.

The Character details tab covers the legacy finishing-data pattern, not merely
the three rule-backed examples. It exposes the seven primary legacy text fields,
Gender/Alignment/Deity choices, and the six known `NOTE_` information fields.
Text edits remain exact `set-text` commands, debounce into the existing
optimistic save queue, and are projected into regenerated CharacterSheet details
where the legacy format has a corresponding cache field. Name edits also update
the native library title. Portrait manipulation and arbitrary journal-entry
management remain separate later surfaces, matching their distinct legacy data
models rather than pretending they are ordinary strings.

The interactive visual language preserves the legacy builder's semantic and
spatial grammar without reproducing its period Windows chrome. The exact sheet
identities are authoritative: at-will is `#006400`/`#AADDAA`, encounter is
`#8B0000`/`#DDBBBB`, daily is `#808080`/`#D3D3D3`, utility is
`#000080`/`#BBBBDD`, and items are `#FF8C00`/`#FFE3CC`. The application shell
uses the recovered PHB navy `#1D3D5D`, neutral `#DEDCCB`, SteelBlue selection
cue `#4682B4`, cool ice canvas, and cream detail surface. A derived dark palette
keeps those semantic identities while lifting their visible accents for
contrast. Dense square-edged groups, full-width category bars, dividers, and a
persistent information pane replace rounded floating-card chrome. Tree-shaken
Lucide SVG components provide a consistent open-source monochrome icon set for
entity families and status; emoji, private-use icon-font glyphs, and proprietary
legacy raster/logo assets are excluded. Completed timeline choices color their
single category icon while unresolved choices leave it muted; a redundant
checkmark is not added. Player-facing choice titles remove evaluator phrasing
such as `Choose` and reorder internal names such as `Power Encounter 1` to
`Encounter Power` within an already level-scoped list. Positive `Rules-legal`
badges are omitted; only unavailable options and actual house rules receive a
legality marker. System UI type remains
the control/body default, with the recovered Goudy Old Style role represented
by a conservative old-style serif stack only for app and page identity. The
evidence and confidence boundary are recorded in
`reverse-engineering/docs/10-visual-language.md`.

### D030 — Candidate legality uses executable `Prereqs`, not printable prose

Every choice candidate is filtered through the same prerequisite evaluator used
for selected-choice diagnostics. Failed prerequisites and unrecognized tokens
are unavailable by default but remain visible through **Show unavailable
options**, matching the legacy feat page's `choice.Legal`/`ShowIllegal` path.
Selected imported illegal records remain recoverable.

The authoritative field is `RulesElement/Prereqs`. The legacy engine parses it
at database load into its in-memory `_INTERNAL_PREREQS` tree; `print-prereqs` is
presentation-only. The modern content index retains the source expression and
resolves its names and IDs against indexed definition tokens. Candidate results
are memoized per evaluation so the 38,339-record private profile does not repeat
full-pack scans. The connective and internalization evidence is specified in
`reverse-engineering/docs/04-rule-language.md`.

### D031 — Choice ownership dimensions remain separate

Candidate decisions expose source entitlement, rules legality,
active-definition membership, active occurrence identities, and provider
occurrence ownership independently. The older `eligible` field remains a
compatibility aggregate and is true only when both source entitlement and rules
legality pass. Absence of an entitlement list preserves local/offline behavior
by entitling every source; a configured list adds Core and follows the recovered
`_RequiresID` dependency recursively.

**Show unavailable options** reveals same-category rules-illegal choices and may
store one as an explicit house rule, matching `D20Choice.Choose` checking source
ownership rather than the `Legal` bit. Source-unentitled content may be shown to
explain the restriction, but ordinary selection controls disable it and command
handlers reject it rather than relabeling it as a house rule. Already-imported
source-unentitled, illegal, custom, or missing occurrences remain recoverable and
carry structured diagnostics.

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
