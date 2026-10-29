# Architecture decision log

### Action Point reminder policy (2026-10-24)

Status: superseded by D099 (2026-10-26): Action Point riders are ordinary
power-card riders, offered in Edit mode but off by default.

Owner decision: retain all Action Point benefit reminders in "Remember in
play", even when the Action Point card or another specific surface repeats
them. These benefits can influence the decision to spend a point. This applies
to self, ally and companion benefits, not just Demonskin Tattoo; other reminder
deduplication remains unchanged.

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
and browser View target desktop/tablet. Beyond parity, Play first establishes a
desktop/tablet sheet-shaped interaction before a separate purpose-built phone
surface adapts the same state and commands.

### D003 — Normalized native model with legacy adapters

`.dnd4e`, `.dndcamp`, WotC indexes/containers, and CBLoader formats are
compatibility boundaries. The native model uses versioned typed documents and
retains a preservation envelope for unknown legacy data.

### D004 — Versioned immutable content profiles

Characters pin a resolved profile and rules-semantics version. Content updates do
not silently alter existing characters. Migration is previewed and explicit.

Amended 2026-10-19: a browser whose active content is made only of server
packs activates a newly advertised server revision on its next load, without
asking, so content updates reach users without manual steps. Content a user
assembled with packs of their own is left alone. Characters still stay pinned;
each shows a content-update badge (news, not a warning) until the user reviews
and accepts it.

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

**Status:** the index and its typed AST remain the compendium query
architecture; the browser worker built around it for M2 was never adopted by
a production route and was retired by D062. A future consumer would build a
new worker client against the same package rather than reviving the removed
one.

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

**Status:** superseded by D082.

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

**Status:** superseded by D054 and then D063. Continuous structural safeguards
remain, but there is no later formal certification program.

M5 retains inexpensive structural safeguards: semantic landmarks and labels,
basic keyboard operation, non-forced viewport sizing, readable functional
layouts, and automated Letter/A4 print correctness. It does not require full
keyboard traversal, screen-reader audits, touch/zoom approval, physical-device
matrices, Safari coverage, raster print review, or subjective visual
accessibility sign-off while the interface is intentionally provisional.

Those checks were originally assigned to M5.5 after the product-owner design
pass, then moved after 1.0 by D054. D063 later removed the formal matrix
entirely while retaining a lightweight M9 browser check and continuous
safeguards.

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
that page instead of replacing it with a one-dropdown screen. Up to six
repeated Background slots share one candidate table while retaining their exact
evaluator order and per-slot compatibility. Skill Training slots render as
category-bounded toggle lists with an `X out of Y` count. A filled
single-slot scope behaves like a radio group: clicking another eligible skill
replaces the current selection immediately. These are presentation groupings
only: every background and skill still maps to its exact provider, rule ordinal,
and choice index. Clearing a trained skill writes a blank unresolved placeholder
at the same position, and filling chooses the first compatible unresolved
position, so history and legacy serialization do not compact or reorder.

Every shared large-table selection summary uses one chip per selected item,
including repeated Backgrounds. Activating the chip name opens that item's
detail card; its trailing X unresolves the exact backing slot. A chip derives
its leading entity/action/item icon and visual tone from the same shared
EntityCard and visual-language helpers as that selected entity's detail-card
header. Its soft tone fill, heavy full-tone top edge, thin full-tone bottom
divider, and thin neutral side edges are a compact projection of that header;
the icon is centered with the bold name on the header line. Power usage, item,
and neutral semantics therefore require no second mapping. The former
locate-in-table control and the prose **Current selection(s)** treatment are not
part of this interaction. Existing table selection limits remain authoritative.

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
category order as a presentation convention: Class, Race, Background, Theme,
Ability Scores, Skills, Powers, Spellbook, and Feats. Gender, alignment, and deity are
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

The recovered exact deity-alignment rule edits that same saved Alignment
choice; it is not a second derived field. For Paladin, Invoker, Hybrid
Paladin, and Hybrid Invoker, Character details explains the deity's alignment
beside the Alignment choice, but the choice stays freely editable: an
alignment that differs from the deity's is a derived house-rule issue
(`deityAlignmentIssue`), not a forced or disabled selection. A class change
removes the constraint without touching the occurrence. Cleric compatibility is intentionally not treated as identity, and
Avenger has no exact-alignment rule in the full corpus.

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
the three rule-backed examples. It exposes the primary legacy text fields
(the name itself is edited in the builder sidebar),
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

### D032 — Legacy builds are non-binding starting presets

Legacy `Build` and `Class Build` selections describe suggested packages rather
than a durable mechanical identity. The evaluator therefore treats their select
slots as optional. The level-1 UI removes them from required-choice and timeline
projections and presents eligible records in a one-shot preset table after a
class is chosen. The selected record uses the ordinary shared detail card so its
description and structured suggestions remain visible before application.
Applying one batches only exact-name, currently eligible suggestions into
still-open choices, reports the applied count immediately, and never overwrites
an existing selection.
Imported Build occurrences remain losslessly stored for legacy round trips even
though the modern builder does not ask the player to maintain one.

The timeline counts incomplete choices only at or below `effectiveLevel`.
Future-plan choices are neutral because they are planning opportunities, not
requirements for the current character. Stable colors, icons, and inset markers
carry ordinary complete/incomplete state without repeated prose or changing
font metrics. An incomplete subsection gives its header a strong warning fill
while retaining the ordinary content background; textual warnings remain for
exceptional house-rule and evaluation states.

Clearing an ordinary choice is a first-class character command, not transient
form state. It writes an unresolved placeholder into the same
provider/rule/index slot, clears the focused detail immediately, and uses the
normal autosave and undo path. “Unresolved” is not rendered as a candidate;
the absence of a selected visible button or table row communicates that state.
Dependent choices disappear through ordinary reevaluation of the now-unresolved
provider rather than by deleting unrelated historical occurrences.

### D033 — Feats and powers use metadata-backed selection tables

Feat and power choices use searchable row tables instead of dropdowns. Feats
show the legacy builder's compact `ShortDesc`; its `Prereqs` remains searchable
and appears in the focused detail pane rather than occupying a redundant column
after legal rows. Powers show authored flavor plus icon-only action and
attack-type fields; exact source
strings remain available through tooltips and accessible names. Repeated slots
from one rules selection share one multi-select table while continuing to write
the exact underlying slot and definition identities. Large result sets render a
bounded window over a full-corpus search to prevent candidate browsing from
stalling the editor. This changes only presentation: legality, source
entitlement, house-rule selection, command construction, autosave, and undo all
remain evaluator/domain responsibilities.

Table inspection and commitment are separate actions. A single click pins a row
in the shared detail pane; pointer hover and keyboard focus never replace that
inspection. Double-click commits the row selection, and Enter provides the
keyboard commit equivalent. Space retains normal button-click behavior and
therefore inspects without committing. Explicit Clear remains the consistent
way to return slots to unresolved. Parameterized feat-family rows remain
expanders: clicking one both inspects its representative definition and reveals
the exact parameter rows that can be committed.

### D034 — Content-derived runtimes live at application scope

The client-side router preserves one browser document across ordinary page
changes. Decoded packs, initialized rules workers, and exact-input evaluation
promises therefore belong to an application-scoped runtime rather than
individual route components. Resources are keyed by
immutable pack identity/revision, bounded to two recently used profiles per
cache family, and terminated only on eviction, initialization failure, or an
explicit content/profile change. Route unmount cancels UI delivery but does not
discard expensive immutable state. Full refresh remains a fresh reconstruction
from IndexedDB because dedicated workers and the document heap are destroyed;
neither Electron nor a service worker changes that boundary automatically.

### D035 — The level timeline expands from a compact navigation rail

The level plan is important navigation and status context but is not the
builder's primary work surface. Desktop layouts therefore reserve only a narrow
rail for the Plan action, level numbers, current-level indication, and stable
complete/incomplete/warning/planned markers. The complete timeline opens on
explicit request as an overlay over the builder, closes with its X action,
Escape, backdrop selection, or successful navigation, and does not resize the
choice and detail panes. Narrow layouts reduce the rail to the Plan trigger.

Choice pages and their adjacent detail cards participate in normal document
flow and grow to their content height. Tables retain bounded internal scrolling
because their candidate sets can be extremely large; ordinary cards, timelines,
and form sections do not. This keeps browser scrolling as the page's single
primary scroll model while giving the frequent selection-and-inspection task the
majority of horizontal space.

### D036 — Planned prerequisites are scoped to choice acquisition level

Candidate availability and selected-choice legality are evaluated against the
character projected through the choice's effective acquisition level, not the
current playable level and not the final planning horizon. Every occurrence and
stat contribution acquired at or before that level participates, so decisions
within one level can satisfy one another. Later choices are excluded and cannot
retroactively legalize an earlier selection.

The rules engine owns this boundary because it must apply equally to the builder
table, diagnostics, imports, and non-UI consumers. It derives context-only
historical snapshots through the same occurrence, grant, equipment, stat, and
stacking pipeline as an ordinary evaluation. These snapshots omit candidate and
power expansion, are cached by immutable content profile and the exact build
prefix through that level, and are bounded to 64 recent prefixes. This preserves
replacement and level-gated rule behavior without maintaining a second,
approximate prerequisite formula in React.

### D037 — Candidate tables expose complete, grouped, favorite-able sets

Feat and power table presentation follows the legacy specialized-page boundary
without changing rules identity or order in the engine. Feats use authored
subtype metadata first and resolved prerequisite metadata for broad semantic
fallback groups; powers use their authored skill/owner relationship. The UI
renders those categories as collapsible row groups and keeps family expansion
as a nested presentation concern.

Matching candidates are not capped. The table's bounded scroll container and
collapsed groups control ordinary DOM size, and virtualization remains a future
optimization only if profiling demonstrates a problem. A full-corpus Silaqui
selector exposed all 335 matching feat groups and expanded its 181-row General
group in about 0.28 seconds through browser automation.

Favorites are a browser-local, application-wide set of normalized content IDs.
Starring never selects a rules choice; it is durable comparison metadata shared
by feat and power tables and intended for reuse by later equipment tables. The
Favorites toggle is temporary table state and composes with text search.

### D038 — Character portraits are bounded, portable record metadata

An optional portrait lives in `CharacterRecord` outside the legacy `.dnd4e`
envelope. Uploads are decoded and normalized in the browser to a maximum
1600-pixel source edge. The record retains that normalized source, its dimensions,
and normalized square-crop coordinates so the user can reframe it later; it also
caches a 512-pixel square rendering for inexpensive library, builder, and print
display. Every display clips the square rendering to a circle.

The image fields accept only bounded PNG, JPEG, or WebP data URLs during record
validation. Keeping them in the record makes duplication and checksummed JSON
backup/restore complete without a second image lifecycle or orphan cleanup.
Portraits are application metadata and are deliberately omitted from both
preserved-original and regenerated legacy exports.

### D039 — A level workspace exposes one mechanical category at a time

The selected level remains the builder's primary unit, but its Class, Race,
Background, Theme, Ability Scores, Companion, Skills, Powers, Spellbook, Feats,
and optional Retraining categories are presented as one horizontal tab list.
Only the active category is mounted beside the shared detail pane.
Expanded-timeline links open the owning category, and the browser session
remembers the active category per visited level; this is transient navigation
state, not character data.

Theme is a presentation-only category immediately after Background. Theme
choices retain their exact evaluator ownership, selection state, candidate
table, and shared detail rendering; separating the tab does not re-parent or
serialize them differently.

Tabs use the standard tab/list/panel accessibility relationship and support
Left/Right/Home/End movement. Incomplete and warning cues do not alter text
metrics. Ordinary form content retains natural height, while large candidate
tables may consume the remaining desktop viewport and scroll internally. This
keeps the main choice surface visually focused without splitting progressive or
repeated rules choices that deliberately belong to one category.

The selected level is a visually distinct, non-interactive leading title in the
same strip, not a tab and not a separate pane heading. The outer choice pane is
layout-only and supplies no background, border, warning inset, or padding; the
active selection and shared detail surfaces provide the meaningful visual
boundaries. The unavailable-options control is temporarily withheld while its
compact placement is redesigned, without changing the engine's ability to
classify or intentionally select unavailable candidates later.

Each mounted category pane ends with a right-aligned **Next** action in the
choice surface, never the shared detail surface. It enables only when every
required evaluator choice represented by that category is resolved; optional
choices and warning/house-rule state do not block it, while the level-1 base
ability allocation counts as a required Ability Scores decision. Next follows
the same category and level activation paths as direct tab/rail navigation and
moves focus to the newly active tab. It advances through categories, then to the
first category of the immediately following level only while that level is at
or below `effectiveLevel`. At the final category of the effective level it
remains visible but disabled, making the current-character boundary explicit
without growing the planning horizon.

### D040 — Planning is level navigation, not a separate overview setting

The builder header is the single compact character summary: portrait and name
are followed by race, class, editable current level, and XP, while unresolved
and warning totals sit beside local save state. The former overview panel,
Role/Plan cells, and routine “Rules up to date” message are removed. Actual
evaluation failures remain visible.

The narrow level rail always exposes levels 1–30 under collapsible Heroic,
Paragon, and Epic tier headings. Only the effective character's tier is expanded
when a record first loads; players may open other tiers independently. Selecting
a level above the saved build creates all intervening frames and navigates there
without changing `effectiveLevel`. This supersedes D035's horizon-selection and
narrow-layout-collapse details: there is no separate plan-horizon input, and the
tiered rail remains directly operable on narrow layouts.

### D041 — Overview is the single navigable build checklist

The former expanded-plan overlay and bottom **Complete level history**
disclosure are replaced by a sibling **Overview** tab beside Build and
Character details. Overview reorganizes the compact choice summaries into
checklist panes for Character, Ability Scores, Companion, Skills, Powers,
Spellbook, Feats, Retraining, and Other rather than repeating a pane for every level. Each row carries
its owning level, and choices within a pane are ordered from earliest to latest.
It does not also expose the evaluator's raw
occurrence tree as “Stored features,” because that duplicates selections and
leaks an implementation-oriented representation into the interface. Completed
optional retraining remains in this history even though an unused retraining
slot is not a required decision.

Overview shows current levels by default. Its temporary **Show planned levels**
control reveals only future frames containing at least one saved selection, so
automatically created but untouched plan levels do not add noise. Every choice
row is navigation: activating it switches to Build, selects the owning
level and choice, and opens the corresponding category tab. The narrow 1–30
level rail remains Build's direct navigation surface and is hidden while the
checklists are open.

Checklist columns are pane-specific rather than mechanically repeating the
evaluator's fields. Character omits Level because its identity choices are not
presented as level-up decisions; Feats and Skills omit their constant choice
type; blank optional Background slots are absent. Paired character ability
increases collapse to one row per level, such as
`8 | Dexterity, Constitution`. Companion ability increases use the same compact
row shape in the separate Companion checklist. Optional retraining has its own explicit
`Level | From | → | To` pane. Feature-driven replacement choices remain with
the content they replace rather than being mislabeled as retraining.

The resulting row in Powers, Feats, Skills, or another applicable checklist is
annotated by exact replacement-occurrence identity, not by matching its name.
A compact superscript **R** keeps the table scannable; its tooltip and accessible
label state `Retrained from X at level Y`. This exposes provenance without
repeating the full explanation in every primary checklist row.

Power rows retain Level, Type, and selected Power. Type is the concise At-Will,
Encounter, Daily, Utility, or Item usage without repeating “Power,” including
for unresolved slots inferred from their authored candidate set. The row uses
the corresponding legacy power color. Checklist panes wrap at their intrinsic
content width instead of expanding every pane to a uniform large grid track.

### D042 — Rules choices prefer visible buttons or shared candidate tables

Native dropdowns are not the default rules-choice control because they hide the
candidate set and require a synthetic “Unresolved” option. Mutually exclusive
sets of eight or fewer low-information candidates use stable button/radio grids;
larger or information-rich candidate sets use the shared searchable table.
Clearing is an explicit adjacent action and continues to write the ordinary
unresolved placeholder through the domain command path. Starting presets use
the table plus their existing explicit Apply action. Retraining shows its prior
selection targets as buttons and its replacement candidates as a table. The
compact numeric current-level selector remains a dropdown because its ordered
1–30 scalar range is familiar and space-sensitive.

The shared candidate table now supports feats, powers, classes, class features,
deities, starting presets, and generic large choices. Its reusable shell owns
filtering, result counts, persistent content-ID favorites, inspection, sorting,
and commit behavior; type-specific columns are supplied by the table kind.
Tables initially sort alphabetically by Name. Activating another column header
sorts by that column with alphabetical Name as the stable tie-breaker, and
activating the current sort header reverses its direction. Missing values remain
last in either direction. Selection changes only the row highlight and never
promotes a row or adds a checkmark beside its name. Tables with six or fewer visible rows size
to their content, while larger sets consume the available viewport and scroll.
Every shared candidate table keeps a sticky selection summary between its
controls and column headers. Empty tables say **No selection**; otherwise the
summary renders one chip per selected item. Each chip name opens that option's
detail card and its trailing X unresolves the exact backing choice. There is no
separate locate-in-table control. This behavior belongs to the shared table
shell and does not apply to compact radio/button choices.
When a candidate-table pane opens, the first mounted table exclusively
initializes the shared detail card from its first existing selection; if that
table is unselected, later tables do not claim the card. Independently, every
mounted candidate table with an existing selection positions its first selected
row beneath the sticky header at the top of its own scroll viewport when space
allows, with the browser's scroll bound providing the ensure-visible fallback
near the end of the table. Selection order follows the existing choice-backed
`Set` insertion order, so repeated selections retain evaluator slot order.
Initialization is scoped to that pane opening and never reruns for selection,
filter, sort, or evaluation rerenders. Explicit inspection wins permanently
within the open pane. This changes neither row order nor filtering and does not
restore the removed user-triggered locator.
Deities show Name and authored Alignment. Class-feature rows use authored Short
Description where available and a concise description fallback otherwise.
Character details requests full candidate data for its owning choice levels
when that tab opens, preserving the normal bounded evaluator request outside
that workspace.

Equipment and Diagnostics are peer workspace tabs beside Build, Overview, and
Character details. This removes the persistent bottom disclosures and gives the
next equipment-design pass a dedicated surface without changing inventory data
or commands.

Class and preset tables have dedicated presentation models rather than relying
on the generic option summary. A class row uses its authored Short Description
and derives separate Role and Power Source labels from the first word of those
compound legacy fields, retaining the remainder as descriptive metadata. A
preset row uses the first complete sentence of its authored description; its
full text remains available in the shared detail pane.

Starting presets follow the class selector and remain collapsed by default
because applying one is optional. Generic nested Class Feature choices use the
authored provider feature's name when the evaluator/provider graph supplies it,
falling back through a shared parent category. If neither relationship exists,
the UI keeps the generic Class Feature label and does not infer a heading from
the candidate names.

The shared detail column also resolves unconditional `grant` statements to
user-facing Feat and Power records and stacks their full cards beneath the
granting option. It deliberately uses rule metadata rather than names found in
description prose. Conditional and internal grants are not presented as
unconditional benefits.

Power tables show an authored Level column. They share the alphabetical Name
default and interactive column sorting used by the other candidate tables;
selecting Level recreates the legacy checklist's level-oriented scan when
desired. Theme ownership headings use
the resolved theme name, such as `Theme (Dune Trader)`, rather than an anonymous
Theme label.

Regular and companion ability-increase occurrences share the same exactly-two
six-button interaction, but not the same category. Regular increases remain in
Ability Scores; `Companion`, `Familiar`, and `Companion Ability Increase`
choices live in Companion. This follows the recovered legacy ownership rather
than only the common control implementation: `CompanionPage.Update` enumerates
both companion and familiar choices, while `BeastCompanion` mounts
`AbilityLeveling.LevelChoices(..., companion: true)` within that page. A
familiar-owned nested choice also remains with its familiar in Companion.

The full local content corpus has no Feat selection rule owned by a Companion
or Familiar record, so the UI does not invent companion feat slots. Automatic
records whose IDs contain `FEAT_COMPANION` are typed Companion and model beast
stat progression; granted companion/familiar powers remain grants rather than
new player choices. Mounts remain equipment, while shaman spirit-companion
features and powers remain in their authored Class/Power/Feat categories.

### D043 — Inactive provider rules preserve but suppress their saved children

Statement-level `requires` controls whether a `select`, `grant`, or other rule
is active. The evaluator therefore distinguishes durable saved topology from
the active occurrence projection: when a provider rule becomes inactive, its
saved child and descendants stop contributing definitions, rules, stats, and
choices without being deleted. If the provider reactivates, its preserved child
can return. The evaluation lists each saved pick whose select rule's
`requires` switches it off (`dormantSelections`, with the blocking records) as
evaluation data for diagnostics and development. Dormant picks are silent in
the UI (owner decision 2026-10-25): no Diagnostics group, badge, warning or
note, because a pick only a `.dnd4e` save holds means nothing to a player and
reads as a bug. They are preserved silently and kept on export (see D098).

This is recovered generic behavior, not a Ranger exception. In the original
content, `ID_INTERNAL_GRANTS_RANGER` places
`requires="!ID_FMP_CLASS_FEATURE_1030"` on the Prime Shot/Running Attack
selector. Selecting Beast Mastery consequently makes a saved Prime Shot dormant;
switching away can restore it. Truly orphaned imported/custom occurrences whose
provider is absent remain recoverable under the existing compatibility policy.

### D044 — Equipment preserves exact holdings while adding an app-native slot projection

Equipment is an Inventory-first peer workspace whose Loadout control swaps its
left pane while retaining one focus-driven item-detail viewer. Shop is a peer
editor workspace whose Browse taxonomy also contains rituals, formulas, and
practices. Shop filtering is the memoized main-thread pipeline accepted in D062;
bounded pages prevent the editor from mounting the full 38,000-record profile
or 10,000-item catalog as one DOM table.

An inventory holding continues to own its exact ordered base/enchantment IDs,
quantity, legacy equipped quantity, overrides, legality, and nested item
choices. Optional app-native slot assignments identify both a stable slot and
the indexed physical copy within the holding. Multiple slot assignments may
refer to one copy for a two-handed item, while two identical rings use distinct
copy indices. Historical imports without assignments remain valid: their
legacy equipped count stays authoritative until the player makes the placement
explicit. Regenerated legacy export projects assignments back to
`equip-count`; exact modern slot identity is intentionally not invented in XML
that did not store it.

The wallet does not introduce a second wealth aggregate. The five legacy
denominations remain authoritative in inherited
`_PER_LEVEL_<N>_Carried Money` and `_PER_LEVEL_<N>_Stored Money` text strings.
Edits write only the current effective-level key. Purchases atomically add one
exact holding and spend carried funds before stored funds; sales remove one
copy and credit carried funds at the explicit legacy 20%, 50%, or 100% rate.

Terminal `+N` magic-item names are presentation families only when their
stripped name and compatibility fields match. Filtering always selects exact
variants first, and a family selector still commits the exact content ID.
Magic armor and weapon purchases require a compatible mundane base and retain
both IDs. Rituals, alchemical formulas, and martial practices remain exact
Ritual records distinguished by their authored `type`; ritual scrolls remain
separate quantity-bearing `Ritual Scroll` holdings, so owning a scroll never
makes its corresponding practice known. Spellbook alternates remain in Build.

This checkpoint does not claim complete native `IsValidLoot` or slot-pair
parity. Shield/implement equivalence, double-weapon secondary ends, dependent
hand/ring rebalancing, holy-symbol name storage, augments, package lot
reconciliation, automatic equipment, and custom-item editing require focused
follow-up from recovered paths rather than approximation in the UI. Item-owned
choices are no longer in this tail: Shop resolves them, including recursively
required choices on a selected candidate, before acquisition and stores their
exact occurrence tree for evaluation and legacy export.

A focused follow-up establishes that loadout eligibility accumulates every
authored slot-bearing classification on every definition in a holding. The two
fields, `Item Slot` and `Magic Item Type`, are independent evidence rather than
fallbacks. A magic holy symbol authored as both `Off-hand` and `Holy Symbol`
therefore remains eligible for hand placement and also appears in the dedicated
Holy symbol slot. This is the same metadata rule used by catalog slot facets and
does not infer eligibility from an item's display name.

Physical base-item classification takes precedence when those accumulated
classifications describe different aspects of a composed holding. An `Armor`
definition with authored `Armor Type: Shield` is a held shield and occupies only
Off hand. Its authored `Item Slot: Off-hand` corroborates that rule. A paired
magic shield definition may independently say `Arms Slot Item`/`Arms`, but that
is the enchantment's magic-item category and does not move the composed shield
from the hand to the Arms loadout slot. Ordinary non-shield `Armor` continues to
occupy Body. This rule uses domain fields across the holding and never searches
its display name for “shield.”

That same physical-identity precedence now governs item imagery. Loadout slot
icons are the canonical item-slot vocabulary for detail-card headers and
selection chips: notably Waist uses `SquareStar`, Head uses `HardHat`, Holy
symbol uses `Church`, rings use `Gem`, and Tattoo uses `Stamp`. A composed magic
shield therefore uses the Off-hand `Shield` icon even when its enchantment is
authored as an Arms Slot Item. Shared presentation code receives the physical
base definition explicitly; it does not infer a shield or belt from the display
name. Stale saved slot assignments are not displayed in a slot whose current
authored eligibility rejects the holding.

The same exact holding boundary is authoritative for item inspection. The
recovered builder presents a `CharacterLootItem` by rendering its base element
first and concatenating its enchantment element second. Accordingly, every
owned-item and loadout inspection resolves all ordered holding definition IDs
and uses the existing composed inventory name for the card title. Catalog
inspection remains a single-record view until the player chooses a compatible
base; that selection immediately uses the same composed detail path.

The modern weapon card projects those two records as one usable object rather
than exposing their storage boundary. Physical descriptors come from the base;
level, authored price denomination, rarity, enhancement, critical effect,
flavor, and magic rules come from the enchantment. Enhancement occupies its own
first descriptor line even when the title contains `+N`, matching the approved
scan order for composed and standalone magic weapons. Generic applicability
(`Weapon: Any`), item slot, and duplicative Full Text are omitted once a
concrete weapon base is present. Sources remain ordered and deduplicated in one
final footer. This is a presentation projection only: no synthetic content
record is stored, and purchase, evaluation, and export continue to preserve the
exact two IDs.

Ordinary slot-category magic items do not repeat their slot classification in
the header: authored labels such as `Neck Slot Item` collapse to `Item`, while
the level remains (`Item 6`). Their compact descriptor band places Enhancement
on its own first line, then Price, Slot, and Rarity on the second; authored
`Item Slot` is presented as `Slot`. Weapon and armor identity labels remain
`Weapon N` and `Armor N`. If a composed shield's enchantment carries the corpus'
distinct Arms classification, presentation follows the physical shield and
shows Off hand rather than Arms.

Unified composed weapon and armor cards remove the ordinary tinted detail
header's trailing margin. Their flavor band owns the entire
header-to-descriptor spacing, including the small asymmetric padding needed to
compensate the italic font's line box. This exception is scoped to unified
composed-item cards so it cannot alter power cards or ordinary detail-card
rhythm.

Composed magic armor follows the same projection boundary. The physical armor
or shield supplies armor bonus, check and speed modifiers, category, type,
slot, weight, icon, and source. The enchantment supplies level, enhancement,
price, rarity, flavor, properties, granted powers, and source. The approved
descriptor scan order is Enhancement; Armor bonus, Check, Speed; Category,
Type, Slot; then Price, Weight, Rarity. Generic armor applicability, duplicate
Full Text, and the two source-record headings are omitted after a concrete base
is chosen. Shields retain their physical Off hand identity even when the magic
definition belongs to the Arms item family.

### D045 — Global navigation names destinations, not character modes

The branded application header is the only global navigation surface. It
contains Characters, Compendium, and Settings; the former Build and Character
sheet entries were views of one selected character rather than durable global
destinations. The character library opens a character, and the character
builder exposes its own Character sheet action.

Settings groups browser-level concerns into Display, character-library backup
and restore, and Content. Theme preference defaults to the browser and operating
system through `prefers-color-scheme`; explicit Light and Dark overrides remain
browser-local. Characters is a compact library surface with Import and New
Character actions, and new characters open immediately with their name edited
later under Character details. A new character is held unsaved in memory
(`character-drafts.ts`) until its first change (a build edit, its name or a
portrait), so opening New character and closing it adds nothing to the
library (2026-10-18).

### D046 — Content browsing is contextual, not a global destination

The standalone Compendium was useful while query and entity-detail rendering
were being developed, but duplicated the tables and shared entity cards now
available in the character builder and Equipment workspace. Global navigation
therefore contains only Characters and Settings. The Compendium page, saved
queries, and entity-detail routes are removed; stale `#/compendium` hashes
canonicalize to `#/characters`.

The worker-backed query engine and shared entity-card renderer remain product
infrastructure. Builder choice tables and Equipment catalogs continue to use
them, so removing the global page does not narrow contextual content access.

### D047 — Builder page navigation is canonical hash state

The character editor stores page-like navigation in its bookmarkable hash. The
five workspace tabs are stable `tab` values; Build additionally owns `level`
and choice-section `section`, while Equipment owns only its section. Level-rail,
workspace-tab, choice-section, and Equipment-section activation push history.
An Overview checklist jump writes its final Build level/section as one entry.

Filters, inspected records, favorites, disclosures, form values, and character
commands remain component or character state and never enter browser history.
Back/Forward therefore restores navigation without undoing edits. Parsing drops
inapplicable parameters, invalid values fall back to the relevant default, and
post-evaluation section fallback canonicalizes with `replaceState`; identical
targets are ignored so synchronization cannot create duplicate entries. The
library, sheet, and settings hashes retain their existing identities.

### D048 — Production detail cards share one semantic power/item structure

Power and equipment details use the shared production `EntityCard` renderer in
builder, Equipment, and granted/theme contexts. A power header contains only its
action symbol and name on the left and authored usage, lower-case power type,
and level on the right; attack type remains a body descriptor. A missing or
blank Action Type renders no icon element or reserved space. Authored `No
Action` uses the Free Action symbol, and both values appear as **Free** in power
selection tables. Power Type, Power Usage, and Level are header-only. The exact
authored descriptor `Attack Type: Personal` displays as **Range: Personal**
because Personal describes the power's range, while the separate authored Power
Type (such as Attack or Utility) remains in the header. Other Attack Type values
retain their authored label, so Melee, Ranged, Close, Area, and custom
geometries are not reclassified. This is a display-only rule; imported
specifics remain unchanged. A read-only audit of the merged local corpus found
2,350 exact Personal values among 10,679 powers with Attack Type; their separate
Power Type values span Utility (1,826), Attack (268), Feature (16), Pact Boon
(4), and missing (236), confirming that Power Type is not an interchangeable
label. Header tone follows actual `Power Usage`
only—at-will green, encounter red, daily gray—so Utility is not a fourth usage
color. Power and item headers use the approved tinted treatment: the soft tone
is the background, normal text remains readable, and the full tone is retained
as border accent. Flavor precedes a text-only descriptor strip and
fixed-label-column rules rows. Source appears only on the top-level detail card.
A resolvable granted Power entity is an initially expanded nested card whose one
real power header is also its disclosure control; authored item `Power` prose is
not promoted into a synthetic power entity.

Recovered `PowerDisplay.BuildSpecificFields` explicitly emits Action Type plus
Attack Type, Target or Targets, and Attack. Its `standards` exclusions are power
type, power usage, class, level, keywords, action type, attack type, attack,
target, targets, and display. `CheckerSpecifics` does not sort everything else:
it walks those remaining visible fields in authored order and preserves
duplicate values. The production order adapts that evidence rather than
claiming literal legacy sorting: Requirement/Prerequisite and Trigger lead;
ordinary and Primary/Secondary/Tertiary Target, Attack, Hit, Miss, and Effect
clauses retain authored order as coherent combat phases; unknown/custom clauses
remain stable; Sustain and Aftereffect form the tail; and exact Special is last.

Item headers use user-facing type, level, and rarity rather than weapon/armor
subtype. Their monochrome Lucide icon is resolved from the finite imported-corpus
vocabulary: Sword for Weapon, Shirt for body Armor, Shield only for armor with
authored `Armor Type: Shield`, Backpack for Gear, the approved
slot/implement/consumable/reward icons for their exact families, and Sparkles for
Wondrous/Special/Any/blank fallback. Artifact or Dragonshard identity takes
precedence over another compatible type. The temporary card-proposal files are
visual evidence only and are not a production dependency.

### D049 — Evaluated-character caches are exact, versioned, and disposable

Rules evaluation remains authoritative and deterministic from the durable
character build plus its immutable content-profile revision. Product screens
may persist an evaluated snapshot only when its key includes the rules-cache
semantic version, exact pack ID and content digest, canonical projected input,
candidate-detail projection, replacement-detail projection, and power-output
mode. Any build, equipment, entitlement, profile, horizon, output, or engine
semantic change is therefore a cache miss rather than an incremental guess.

The cache lives in a separate bounded IndexedDB database and is never part of a
character record or backup. Missing, malformed, unreadable, or unwritable cache
state falls back to canonical worker evaluation; product correctness cannot
depend on derived storage. Only candidate-scoped product evaluations are
persisted. Exhaustive compatibility/reporting evaluations are intentionally
excluded because their complete candidate catalogs can be much larger.

Rules-worker initialization validates the requested manifest revision without
decoding the full pack. The first genuine cache miss loads the pack lazily, and
concurrent requests share that one load. An exact persistent hit can therefore
avoid both worker-side pack decoding and rules evaluation after a document
restart. This does not replace normal invalidation after edits and does not make
the imported legacy calculated cache authoritative.

### D050 — Character export is current-state and format-oriented

The compact character-card export disclosure offers exactly three destinations:
a versioned checksummed single-record `.4ecb` package, a regenerated `.dnd4e`
compatibility document, and the browser character-sheet print/PDF flow. The
`.4ecb` package reuses the native backup schema and restore validation rather
than introducing an unversioned raw-record format.

Every user-visible `.dnd4e` export represents current edited state and passes
the existing exact-profile evaluation and semantic re-import gates. Imported
source XML remains embedded inside the native record because regeneration uses
it to preserve unknown legacy fields, but the untouched original is no longer a
user export target. PDF remains browser print output rather than a stored or
server-generated artifact.

### D051 — Builder header is identity-first; level editing belongs to details

The builder header retains the character portrait and operational status, but
its identity treatment is deliberately simpler than D040. The portrait is
visually prominent relative to the adjacent text. Character name is a labeled,
directly editable text field backed by the existing `set-text` command,
optimistic save queue, and repository title synchronization. Its unfocused
resting state retains plain heading typography with no visible textbox border
or background; pointer hover supplies a subtle underline and keyboard focus
replaces it with a thicker accent-colored underline rather than a rectangular
outline. The name text and subtitle text begin at the same horizontal edge. The
subtitle is the available race, class, and effective-level number joined by
ordinary spaces only; it contains no labels, separators, placeholders, or XP.

The header no longer owns any level-changing control. Character details owns
the explicit 1–30 current-level selector and dispatches the same canonical
level-frame creation and `set-effective-level` commands previously used by the
header. The level rail remains navigation for viewing and authoring planned
levels, not a substitute for changing the playable character's effective
level. This supersedes only D040's header content and current-level-control
placement; its planning-horizon and level-rail decisions remain in force.

### D052 — Detail prose normalization is presentation-only

Imported descriptions and prose-like specifics remain byte-for-byte content
data; neither corpus compilation nor character import rewrites their whitespace
or inferred structure. The shared detail-card renderer normalizes presentation
at render time instead. It discards indentation at the start and end of each
source line, treats every non-empty source line as a paragraph boundary whether
or not blank lines intervene, and collapses repeated blank lines.

Recognizable authored headings and contiguous bulleted or numbered lines render
as semantic headings and lists. Ordinary prose paragraphs receive one uniform
CSS first-line indent after source indentation is removed; headings and list
items remain unindented. Text remains React text content rather than interpreted
HTML. Power/item rule rows and tabular or otherwise genuinely preformatted
specifics retain their established `preserve-lines` path.

### D053 — Loadout is two ordered icon stacks with rules-backed implement visibility

The Equipment Loadout pane presents two equal columns. The left column follows
body position from head to feet: Head, Neck, Body, Arms, Hands, Waist, and Feet.
The right column starts with Main hand and Off hand, then Holy symbol, Ki focus,
Ring 1, Ring 2, and Tattoo. Each slot is one compact horizontal row containing
its monochrome icon and name beside the select control. Loadout does not carry
per-slot Shop buttons; purchasing remains available through the existing Shop
tab and its ordinary filters. This presentation decision supersedes the earlier
loadout shop-shortcut checkpoint without changing the Shop workspace itself.
Each stack sizes its own icon-and-label track to that stack's longest label, then
uses a compact consistent gap before a dropdown track that shrinks with available
space and caps at `18rem`. The two stacks collapse to one responsive column at
`48rem` while retaining their independent alignment.

The installed Lucide 1.39.0 set determines the exact glyphs. The ordered left
column uses HardHat, Medal, Shirt, BicepsFlexed, Hand, SquareStar, and Footprints;
the ordered right column uses Sword, Shield, Church, Focus, Gem, Gem, and Stamp.
Lucide supplies no Helmet, Belt, Pants, or standalone Latin-cross/crucifix
alternative. HardHat is therefore the closest head-protection glyph, the product
owner selected the existing SquareStar glyph for Waist instead of a custom belt
glyph, Church replaces the plus-like Cross for an unambiguous Christian
association, and the existing Stamp glyph represents Tattoo.

Holy symbol and Ki focus are shown only when the current evaluator result
contains, respectively, the exact active definition IDs
`ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_(HOLY_SYMBOL)` and
`ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_(KI_FOCUSES)`. Names, aliases,
partial IDs, and case-folded matches do not grant visibility. Companion,
Familiar, and Mount remain appended to the right column only when owned
inventory has matching authored slot metadata; all three use PawPrint.

Every committed non-empty Loadout selection updates the shared equipment detail
viewer to that holding's resolved item definition. Focusing a populated native
select likewise restores its currently equipped item to the viewer, so keyboard
and pointer users can recover context without changing equipment. Native select
popup highlighting is intentionally not treated as inspection: browsers and
platform controls do not expose transient, not-yet-committed option highlights
with portable event semantics, and a popup can be cancelled. Loadout therefore
uses reliable `focus` and committed `change` behavior only; it does not add an
`input` or key-event preview and does not replace the native select with a custom
combobox.

### D054 — Sheet/play foundation precedes phone adaptation; comprehensive accessibility certification follows 1.0

**Status:** superseded by D064 for milestone ownership and by D063 for
accessibility scope. The architectural requirement that desktop/tablet Play
settle before phone adaptation remains accepted.

**Date:** 2026-09-18

M5.5 closes the builder, library, and complete Equipment workspace through the
product-owner feedback loop. Inventory, Shop, and Rituals & Practices require the
same focused workflow refinement already applied to Loadout; unavailable-option
browsing and item-owned choices also require approved homes before closure.

This decision originally assigned both screen modes to M5.6. D064 now splits
them: M5.6 owns the authoritative read-only desktop/tablet **View**, and M5.8
owns the character-sheet-shaped desktop/tablet **Play** interface plus its
separately persisted, versioned `PlayState`, deterministic commands,
provenance, history, and undo. Print remains its own page-oriented rendering.
M6 depends on M5.8 and consumes that settled state and interaction vocabulary in
a purpose-built, task-oriented phone surface; it does not compress the desktop
Play sheet to phone width.

There is no formal keyboard-only, screen-reader, zoom/reflow, touch-target, or
cross-client certification matrix at any point; D063 supersedes that part of
this decision. Continuous semantic structure, labels, focus behavior, ordinary
keyboard operation, contrast, reduced motion, responsive sizing, and automated
regression tests remain required. M9 retains a lightweight best-effort browser
workflow check plus print, security, data-migration, and performance hardening.

### D055 — Inventory foregrounds holdings and total funds without flattening legacy state

**Status:** accepted

**Date:** 2026-09-18

Inventory presents one compact total-funds summary in its normal state. Stable
AD/PP/GP/SP/CP stat cells include zero values rather than collapsing the balance
into variable-length prose. Editing reveals the authoritative carried and stored
CP/SP/GP/PP/AD values plus a read-only normalized total. This is presentation
only: inherited per-level
`Carried Money` and `Stored Money` strings remain separate, purchases still spend
carried before stored, and sales still credit carried funds.

The summary's Quick adjust field accepts exactly one signed or unsigned integer
amount in CP, SP, GP, PP, or AD, case-insensitively and with optional whitespace.
Unsigned input is positive. A positive delta credits carried funds; a negative
delta deducts carried first and stored second, matching purchase order. Parsing,
safe-integer checks, insufficient-funds rejection, and wallet arithmetic complete
before one batch writes canonical current-level carried and stored text strings,
so partial or stale denomination callbacks cannot expose an intermediate wallet.
Successful adjustments announce through the live region and briefly emphasize
only denomination cells whose displayed totals changed; failures retain and
focus the input, announce the error, and use a non-layout-shifting error flash.
Both effects respect reduced-motion preferences.

(Superseded by D086: the preference is removed and nothing re-mints a wallet.)
The browser-persisted **Keep large amounts in gold** display preference caps
automatic normalization at GP for Quick adjust, purchases, sales, and compact
totals. It does not prohibit PP or AD: explicitly entered larger coins remain
exact wallet denominations while affordable, and only a spend that must break
one converts its change to GP. This changes neither copper-equivalent wealth nor
the carried-first/stored-second transaction order, and legacy export continues
to serialize the resulting exact denomination records.

Each holding is one stable row with its canonical physical-item icon, name,
compact icon-mounted equipped marker, quantity stepper, and trailing actions. A
single equipped copy uses a check rather than redundant visible prose; multiple
copies retain a compact exact equipped/owned ratio, and a question marker plus
accessible text keeps historical unknown-slot counts unresolved and perceivable.
Sell is an icon-triggered menu that shows 20%, 50%, and 100% choices with actual
one-copy proceeds. All three use the largest denomination that exactly expresses
the 20% baseline, allowing exact decimals for the other rates only when needed,
so their values remain directly comparable. Unpriced holdings cannot be sold
but remain removable without proceeds through an in-place two-click destructive
action. The first click arms the button and the second removes the holding;
outside interaction or Escape disarms it.
Only one sale menu is open at a time; outside pointer interaction and Escape
dismiss it, and Escape or a completed sale restores focus to its trigger.

Double-clicking a holding is a shortcut into the existing Loadout resolution
and command path, not a second equipment algorithm. An assigned holding removes
all of its exact assignments. An unassigned holding chooses the first compatible
open slot in current visible Loadout order, or the required Main hand/Off hand
bundle for a two-handed item. Only when no compatible slot is open may it target
the first occupied compatible slot. That reversible displacement happens
immediately and does not receive a destructive-action confirmation.
Holdings with unresolved legacy equipped counts and no deterministic inferred
slots remain unchanged and direct the player to Loadout.

Quantity reduction and sale retain equipped copies ahead of unequipped copies.
When an equipped copy must be removed, the reversible unequip happens
immediately, and known slot assignments are reindexed to the remaining
contiguous copy identities. Quantity
updates replace the holding in place instead of moving its row, and zero-quantity
holdings are removed rather than retained invisibly.

### D056 — Inventory categories describe item roles without changing holdings

**Status:** accepted

**Date:** 2026-09-19

Inventory uses the same presentation-only physical-role taxonomy as modern
Shop Browse, in display order: Adventuring gear, Ammunition, Armor & shields,
Companion, familiar & mount, Consumables, Implements, Special items, Weapons,
Wondrous items, Worn items, and Miscellaneous. Shop-only enchantment acquisition
categories project to their resulting physical role. Ordinary reusable Gear is
Adventuring gear; mechanically active carried magic such as onyx figurines is
Wondrous items. Ritual Scroll holdings remain Consumables; learned rituals are
not holdings.

The classifier reads every resolved component and repeated authored specific,
never display names, flavor, or descriptive prose. Consumables and Ammunition
take precedence over equipment roles. A composed physical base then preserves
its physical identity; the remaining categories follow authored Browse-role
evidence. Missing, custom, or ambiguous content falls back to Miscellaneous and
remains visible. Grouping never changes
holding IDs, equipped assignments, choices, durable order, rules behavior, or
legacy export topology.

Sections omit empty categories and count holding rows rather than owned copies.
All populated categories initially expand except Miscellaneous; the current
editor component retains later expansion choices. Semantic toggle buttons and
ordinary table structure provide the interaction without making collapse state
part of the character document.

### D057 — Equipment is Inventory-first; Shop is a peer workspace

**Status:** accepted

**Date:** 2026-09-19

Equipment opens directly on Inventory and does not add a second tab bar inside
the character editor. Its route-backed Loadout control swaps only the main pane
between Inventory and the existing rules-backed slot projection; the shared
item detail viewer remains fixed in the right pane. Shop is a peer top-level
character-editor workspace. Its ordinary Browse control exposes the modern
role-based item taxonomy alongside rituals, alchemical formulas, and martial
practices; ritual scrolls appear with other Consumables. This presentation
change does not merge learnable-record Known state, quantity-bearing holdings,
or exact content-ID semantics.

Canonical navigation represents Equipment, its optional Loadout pane,
Shop, and the active Shop category. Existing Equipment deep links remain
compatible: Inventory maps to Equipment, Loadout maps to Equipment with the
Loadout pane visible, Shop maps to Shop/Items, and Rituals & Practices maps to
Shop/Rituals. Pane switches update the route, and browser Back/Forward therefore
restores the same visible state rather than retaining component-only navigation.

### D058 — Shop uses a derived acquisition view over exact holding topology

**Status:** accepted

**Date:** 2026-09-21

Shop presents a modern role-based Browse taxonomy with the original builder's
categories available only as an advanced filter. Rituals, alchemical formulas,
and martial practices share this catalog and its Buy/Give actions; ritual
scrolls remain quantity-bearing Consumables. Slot, subtype, affordability,
proficiency, known state, sorting, and magic-item family folding are presentation
projections over exact content records and never replace their stable IDs.

Enchantments are inspected independently and choose a compatible physical item
only at acquisition time. Compatibility is derived from authored type,
compatibility, and minimum-enhancement fields rather than display-name guesses.
Weapon, armor, and shield enchantments compose with an exact compatible physical
record. A standard magic implement retains the legacy standalone `[Magic Item]`
shape; a superior implement retains `[Superior Implement, Magic Item]` in that
order. The UI may interpret both as one semantic implement/enchantment pair, but
that interpretation is derived and is not a second persisted model. Imported,
unknown, custom, or ambiguous element sequences remain exact and recoverable.

Buy and Give are separate commands over the same exact item choice. Give spends
zero currency. `_CannotBeBought` and missing-price records retain a disabled Buy
control with an explanatory tooltip but remain eligible for Give. Proficiency is
a filter and visual cue, never an acquisition gate. A compatible-item chooser is
independent of the descriptive detail card; a single eligible choice bypasses
the chooser. Enchantment aliases remove carrier words only for Shop display and
search, while canonical names and IDs remain authoritative.

### D059 — Builder status counts and Diagnostics share one issue projection

**Status:** accepted

**Date:** 2026-09-22

The builder header remains a compact status surface: it shows only nonzero
icon-and-count indicators, with accessible labels and concise tooltips. Detailed
explanations and repair actions belong to the Diagnostics workspace; house
rules, which may be entirely legitimate table choices rather than problems,
have their own House rules workspace opened from the house-rule badge.

Unresolved required choices, evaluator warnings, evaluator errors, and explicit
house rules are four separate categories. A required-choice diagnostic appears
only as unresolved; an explicitly house-ruled occurrence appears only as a house
rule and is not promoted to a warning or error merely because it is
rules-ineligible. Actual evaluator limitations remain warnings or errors
according to their engine severity. Ability-score incompleteness and
out-of-bounds completed point buys follow the same unresolved and house-rule
split.

One deduplicated structured issue projection supplies both the status counts and
the Diagnostics lists. Diagnostics explains the issue and its mechanical or
legality effect, and links back to the exact builder choice or ability-score
surface when that target is known. This prevents a header count from disagreeing
with the detailed issues intended to explain it.

### D060 — Shared CSS primitives own cross-workspace visual contracts

**Status:** accepted

**Date:** 2026-09-23

Cross-workspace heading roles, collapsible table-section rows, item icons,
dialog shells, and primary/icon button anatomy are named shared primitives.
Feature styles retain only their deliberate surface-specific differences, such
as Shop density, Inventory equipped state, or the branded portrait-dialog
header. Detail cards likewise expose named header, subheading, flavor,
descriptor, and rules anatomy; tone and composition variants adjust that
anatomy through variables rather than repeating structural spacing rules.

`apps/web/src/styles/primitives.css` loads before the existing surface
stylesheet so feature rules can continue to specialize primitives without
increasing specificity. Tests that inspect CSS concatenate the stylesheets in
runtime order. Chromium computed-style checks lock the shared heading roles and
detail-card rhythm in addition to the existing structural tests. Refactoring a
shared primitive therefore requires both component-contract verification and
visual comparison across the representative responsive/theme matrix.

### D061 — IndexedDB listings use transactional metadata sidecars

**Status:** accepted

**Date:** 2026-09-23

Schema 5 adds `characterMetadata`, `characterPortraits`, and
`contentPackMetadata` sidecar stores. Text/numeric metadata remains separate
from the domain-validated rendered thumbnail (bounded to 5 MiB); the retained
portrait source, accepted up to 20 MiB, remains only in the authoritative
character record. The stores are backfilled while upgrading schema generations
1–4. A schema-5 database whose content-pack projection is incomplete from an
interrupted development build repairs missing and orphaned rows from the
authoritative pack store. Healthy listings compare keys without cloning encoded
pack values. Historical character, pack, settings, and migration-journal stores
remain untouched and authoritative. Every later payload mutation updates or
removes its projections in the same IndexedDB transaction, including backup
restore, trash/restore, purge, lazy character migration, pack install, and pack
removal.

Public content installation continues to decode and validate untrusted objects
or bytes. A separate internal package subpath can produce a storage artifact
only by decoding and validating the exact encoded bytes that artifact contains;
forged artifacts are rejected at runtime. Imported, advertised, and newly
generated legacy packs therefore cannot pair a valid decoded object with
corrupt or mismatched stored bytes. Digest collision checks and atomic payload/
metadata writes still occur at the storage seam. Exact evaluation promise
caching belongs only to the application runtime, whose 32-entry bound now
refreshes recency on hits; the editor no longer maintains a second cache.

### D062 — Shop keeps its main-thread filtering; the unused general query worker is retired

**Status:** accepted

**Date:** 2026-09-23

Functional refactor Stage 4 was scoped to decide whether Shop should adopt the
general query-engine worker (D017) or a new Shop-specific index. Reading
`ShopWorkspace.tsx`'s filtering pipeline (category → advanced filters → search
→ slot/subtype → family grouping → sort) found only linear per-record work,
each stage memoized on its real dependencies; `entities`/`byId` are loaded
once per character session rather than reconstructed per render. No
exponential/geometric complexity or unnecessary reload was found, so no new
indexing architecture is adopted and Shop's existing main-thread approach is
kept as-is.

The audited general query worker (`query.worker.ts`, `QueryWorkerClient`, and
`AppContentRuntime.getQueryClient`) had zero production callers — Shop never
adopted it after its M2 introduction (D017) — yet it was still built, shipped
(~58 KB / ~17 KB gzip), and precached by the service worker. That dead code
path is removed from the web app. `packages/query-engine` itself, its typed
AST, and `scripts/benchmark-query.ts`'s budgets/evidence (still exercised by
`scripts/check.sh`) are unaffected; this decision only retires the unused
browser worker wiring around it. A future feature that needs full-text/facet
query over the compendium can still build a new worker client against the
existing package.

### D063 — No formal accessibility-certification or cross-client support-matrix program

**Status:** accepted

**Date:** 2026-09-23

**Supersedes:** the certification scope of D054 and M10 as originally written
in `roadmap.md`.

This project's actual audience is the product owner and a small group of
hobbyist players who mostly interact with the product owner directly — not a
public commercial release with compliance obligations. The roadmap previously
carried a dedicated post-1.0 milestone (M10) for formal accessibility
certification (end-to-end keyboard-only audits, screen-reader testing against
a documented browser/assistive-technology matrix, 200% zoom/reflow across
desktop/tablet/phone, and a public accessibility statement), plus matching
formal-support-matrix, release-signing, and relay-abuse-control-runbook
deliverables in M9, and public-relay-operator documentation in M7. That level
of ceremony matches a vendor with compliance or support obligations to
strangers, not this project.

M10 is removed from the roadmap. Continuous structural safeguards continue
unchanged: semantic structure, labeled controls, ordinary keyboard operation,
contrast, reduced motion, and responsive sizing remain required throughout
implementation, exactly as before. What changes is that there is no dedicated
certification pass, formal matrix, or public statement layered on top of that
baseline — real accessibility or cross-browser complaints from actual users
are fixed as ordinary bugs against the continuous baseline, at whatever
priority the product owner judges appropriate, not staged into a compliance
program.

M9 keeps a security review, data-migration reliability, a lightweight
best-effort check in whatever browsers the actual users run, and player-facing
documentation (install, import, backup/recovery, known limitations). It drops
release signing, a published support matrix, formal self-hoster/integration
documentation, and a relay abuse-control runbook as separate deliverables.

M7's linked-session/device-handoff feature is kept — it's genuinely useful for
running a session with the product owner's own table — but its scope stops at
working reliably for that group. Public-relay-operator documentation, abuse
controls, and a self-hosted configuration guide for third parties are dropped;
if someone outside the group ever wants to operate this themselves, that is a
new, separately scoped ask, not something built speculatively now.

### D064 — View parity, invited beta, and local Play are separate milestones

**Status:** accepted

**Date:** 2026-09-28

The post-M5.5 sequence is split around a clear compatibility boundary. M5.6 is
only the refined, authoritative browser View sheet. Its goal is to bring the web
application mostly to original Character Builder parity through a complete,
approved read-only character reference; it does not create mutable table state.

M5.7 performs final cleanup of the parity UI and prepares an easily hostable
invited beta for the product owner's D&D group. The production image,
unprivileged static server, runtime-configuration path, health endpoint,
offline PWA, and proprietary-content separation already exist; M5.7 packages,
documents, and rehearses that foundation for a small known group. It does not
move browser-owned characters into a server, add accounts or a relay, or claim
the later M9 browser/visual-print, security, migration, representative-device,
and release-performance hardening.

M5.8 owns everything formerly assigned to the Play portion of M5.6: the
desktop/tablet Play sheet; separately persisted, versioned `PlayState`;
deterministic play commands, history, provenance, and undo; mutable HP and
resources; power use and rest/recharge; structured effects; persistence and
mode switching; and explicit reconciliation with durable character changes.
This capability is explicitly beyond legacy-builder parity. M6 may begin its
phone adaptation only after M5.8 establishes and verifies the shared play-state
and command vocabulary.

### D065 — Settings favors ordinary jobs; ability alternatives are presentation choices

**Status:** accepted

**Date:** 2026-09-28

Settings presents three ordinary browser-level jobs directly: **Display**,
**Backups & storage**, and **Game content**. The default Game content surface
shows readiness, content in use, host-provided content, browser-added content,
and the ordinary add/review/use flow. Pack identities, digests, ordered
composition, collision IDs, raw rules-XML import, directory discovery, and
quota diagnostics remain available under a collapsed **Advanced content
management** disclosure. This changes presentation and terminology, not the
content-profile, exact-revision, or browser-local storage contracts.

Power-card presentation may resolve an authored list of alternative abilities
to the character's highest corresponding ability modifier. This browser-local
Display preference is enabled by default and can be disabled to retain the
authored alternatives. Equal modifiers prefer the higher underlying score,
then abilities marked as key abilities in the class record's authored order,
then the power's authored order. Resolution occurs only when every listed
modifier is available; otherwise the prose remains unchanged. The same
character-aware formatter supplies in-app power detail cards, the browser View,
and print without changing content, character selections, attack calculations,
or serialized data.

### D066 — Power weapon variants use selection plus comparison, not duplicated cards

**Status:** accepted

**Date:** 2026-09-29

Interactive power details show one compatible weapon variant at a time. They
default to the equipped main-hand variant, then another equipped variant, then
the first compatible owned variant. A compact selector and collapsed comparison
table retain every compatible evaluated variant, with equipped main/off-hand
status and pairings visible. Selecting a variant changes presentation only; it
does not equip an item or mutate the character.

Two default-on browser Display preferences control interactive prose only. One
replaces a fully annotated ability phrase with its underlined signed value and
an identifying tooltip. The other replaces `[W]` expressions with the selected
variant's authoritative weapon dice. Browser View uses the same interaction.
Print keeps full ability wording and authored `[W]` prose because tooltips and a
single interactive selection do not survive on paper. Instead, one printed
power card lists each compatible owned weapon once near the bottom of its body.
Every table form orders equipped main hand first, then equipped off hand,
then other equipped weapons/implements, then inventory alternatives. Sorting
preserves the original order within each group and does not mutate the model.
Every printed weapon summary uses a compact table with a weapon column and
calculation cells containing `+bonus → expression`. Single attacks and
identical repeated calculations use a three-column table labeled Weapon,
Attack, and Damage for like-for-like alignment. Distinct
phases add numbered attack-column headers.
Weapon names use normal body weight rather than subsection-heading bold.
Table and cell text explicitly inherit the card body's dark ink color; row
tints do not change text color.
The table is anchored at the bottom of the available card body, with a minimum
section gap above it; rules remain in normal order above the table, and adaptive
card fitting continues to account for both rules and table height.
Soft alternating row backgrounds, without cell borders, make both forms
recognizable as tables without competing with the card border. Multiattack
headers use a slightly stronger tint. Columns size to their contents across the full
available width rather than reserving a fixed percentage for weapon names;
names wrap at word boundaries only when space requires it.
The word `damage`, equipment-state labels, and defenses already shown in the
attack bands are omitted. Damage types are not repeated in the table; authored
Hit rules and item descriptions supply that context. Cells wrap at the arrow
when needed. Table damage expressions omit spaces around `+` (for example
`2d10+5`), independently of body prose formatting. Collapse requires the same
resolved ability, numerical to-hit,
damage expression, and availability across phases. Defense, intrinsic-bonus,
and weapon-role labels alone do not split identical table values. Distinct
columns use Attack 1, Attack 2, etc.; the body attack
bands already identify abilities. A power with matching known to-hit values
across phases for every weapon, but differing
damage expressions, instead uses one shared Attacks column and Dmg 1/Dmg 2/etc.
columns. Ability labels remain in the body headers, even if the abilities differ
but the resulting bonuses match. A missing or ineligible phase
shows a dash. The equipped-first default supplies each attack header, using the
eligible equipped hand for a phase that explicitly requires it. Inventory
alternatives remain visible as hypothetical loadouts without equipping them.
Phase damage uses the same recovered parser and component rules as the
existing primary summary; the single primary cache remains the compatibility
export boundary. Unavailable companion values and unstructured legacy caches
do not acquire invented per-phase totals.
The print fallback preserves every ordered authored attack header and its Hit
block even when a cached export supplies only the primary calculation. Missing
secondary totals show a dash rather than removing the phase or reusing the
primary total. A generic Attack field following an explicit secondary-section
marker stays in that secondary section.
Secondary target cells are blank unless that phase supplies explicit target
metadata. General primary target wording is not automatically copied: a
secondary attack may be constrained to the same creature by the first Hit's
prose, and repeating `one creature` could imply a new choice. Adding phase-aware calculations requires a rules cache
revision bump: older derived evaluations must not pass the top-level shape
check and silently omit phase data. Version v4 invalidates the pre-phase v3
cache without modifying character builds or legacy snapshots.

### D067 — Build power cards preserve complete authored combat clauses

**Status:** superseded by D079 (2026-10-18): Build cards are the printed,
evaluated card with its weapon table.

**Date:** 2026-09-29

Build selection dialogs do not show weapon-specific calculations or a weapon
selector. Their purpose is comparing general power choices before committing to
one, so they retain authored formulas such as `2[W] + STR` and abbreviate named
abilities to `STR`, `CON`, `DEX`, `INT`, `WIS`, and `CHA` without substituting
character values.

Build power cards use one consistent aligned rules layout rather than a separate
colored Attack/Hit section. A Hit clause remains whole: damage and its associated
conditions, movement, or other effects are never split into separate summary
and rule rows. Multiattack cards replace long combined labels such as
`PRIMARY ATTACK` with compact numbered row labels such as `TARGET 1`,
`ATTACK 1`, `TARGET 2`, and `ATTACK 2`; they do not add separate phase rows.
An Attack, its adjacent Hit rows, and following Effect rows form one visual group
with a shared label column and no internal separators. A before-attack Effect is
unconditional setup and remains a separate row above that group.

A clearly damage-only Hit row is labeled `DAMAGE`, and its displayed formula
omits the redundant word “damage.” Typed damage, weapon alternatives, and level
scaling remain eligible. Any condition, movement, ongoing damage, target-based
clause, additional attack, or other rider keeps the authored `HIT` label and
complete prose; the presentation must prefer a false negative over hiding a
rule.

Internal descriptor, rule, and Source dividers use a deliberately lower-contrast
version of the shared border color. The card outline and header boundary remain
the stronger visual hierarchy. Undivided rows inside one combat group use half
the normal inter-row spacing while retaining the normal outer group padding, so
the sequence reads as one unit without crowding its neighboring blocks.

Requirement/Prerequisite and Trigger still lead. All other combat clauses retain
their authored order, including Effects before an Attack, Effects after a Hit,
and Effects that bridge primary and secondary phases. This relies on explicit
corpus timing and ordering rather than guessing from the generic `Effect` label.
D066 continues to govern calculated Equipment and browser View cards, where
weapon switching supports play rather than power selection.

### D068 — View and print use distinct layouts over a sanitized semantic sheet

**Status:** accepted

**Date:** 2026-09-30

Browser View and print are distinct presentations over one semantic sheet/card
model. View is a navigable desktop/tablet reference with an at-a-glance summary,
complete interactive cards, equipment, learned references, features, notes,
recovery guidance, and direct Build/print actions. The print action first shows
the actual print projection in an explicit in-app preview, then invokes the
browser print/save dialog from that preview; native print UI is not treated as a
reliable preview surface. Print remains page-oriented: compact statistics use
purpose-built panels, narrative data is either placed in bounded readable note
panels or represented by a compact index, and the fixed physical-card grid
remains separate. Print inclusion preferences never hide the corresponding
browser View reference. D069 defines the physical-card projection in detail.

The semantic model owns content classification and card sanitation rather than
either renderer. Post-overlay power fields pass the canonical user-facing-field
predicate; machine labels, identifiers, and presentation metadata do not reach
cards. Repeated authored clauses retain ordinal order. Supported flavor and
printable prerequisites are first-class card data. Rituals, alchemical formulas,
and martial practices are learned references rather than physical equipment;
Ritual Scroll remains an item. Missing/custom inventory stays recoverable and
visible. Legacy paragraphs normalize into safe plain-text structure. Legacy
tables preserve rows/cells as semantic React tables, including tab-delimited
rows wrapped in a table tag and HTML tr/th/td forms; surrounding prose remains
in order. Corpus attributes are never copied and cell contents remain escaped
text. Arbitrary imported markup is never injected as HTML. Malformed or
unrecognized structures retain the conservative plain-text fallback.

This separation allows View hierarchy and print pagination to evolve without
forking rules calculations or character data. A legacy cache without matching
content may identify a generic Ritual but cannot reliably recover whether it was
an alchemical formula or martial practice; the model keeps that limitation
explicit instead of guessing.

### D069 — Physical print cards use a fixed legacy-derived projection

**Status:** accepted

**Date:** 2026-09-30

The physical power/item cards are a separate, minimal projection from browser
View cards. The supplied Hu and Fei Zhu PDFs and recovered
`CharacterSheetViewer` implementation establish a fixed 233 by 321 device-pixel
card contract, three cards across by three cards down, with text reduced or
trimmed inside the boundary. Web print therefore chunks selected cards into
explicit nine-card pages and uses a fixed 233:321 aspect at paper-specific
physical dimensions. Content must never increase a card's height.

Power cards project the title, optional regular-weight keywords band with a key
icon as the first subheader row, action/range icon band, compact
attack/defense/target band when applicable, authored rules clauses in order,
calculated compatible-weapon lines, a populated-only Additional effects section, and the
usage-first type bar defined by D071. Attackless utility powers do not receive
invented attack values. Item cards use their own legacy-derived stat grid,
properties/power region, and compact footer. Flavor text, source citations,
verbose full text already represented by structured fields, internal
identifiers, and other presentation-only metadata do not appear on physical
cards. The interactive browser cards remain free to expose richer context and
weapon switching.
Keywords retain their softer background (12% card color versus 20% for
action/attack). Internal subheader dividers use 35% card color mixed with white;
the bottom divider retains the full card color. Long titles wrap at their
preferred title size, consuming space within the fixed card rather than
clipping text or moving the utility frequency badge, which remains anchored at
the top right. Body fitting and the existing readable floor still apply.
Composed-item cards merge the ordered public fields of every inventory element,
so a magic weapon or armor card keeps the base item's physical statistics as
well as its enchantment's enhancement, level, critical, properties, and powers.

Within a power card, action labels omit the redundant word `Action`. Authored
Sustain action fields add a second line in that cell with a `step-forward` icon
and the action type, without removing the full Sustain clause from the body.
Both compact
combat bands use an icon-left layout: action plus range on the first row, then
the per-attack formula, calculated total/defense, and wrapping target defined by
D070. Target text must be complete even when the row becomes taller; the fixed
card body yields space rather than truncating the target. Action symbols are
optically centered; Opportunity Action shares the reaction symbol because it is
a triggered response rather than a standard action. The title bar has no
paper-used checkbox: physical-card state is left to table practices such as
flipping or turning a card. Spacing follows authored rule structure rather than
every row uniformly: Hit, Miss, and associated Effect clauses remain a tight
attack-resolution group, and Trigger stays tight with its Effect; Special,
Sustain, prerequisites, requirements, and other independent clauses begin a
visibly separated section. Compact cards reduce that section gap and condensed
cards remove it before sacrificing text or fixed card geometry.

Character-view and printed rules select current-level text only for the
level-scaling grammars confirmed in the corpus: newline `Level N:` alternatives,
inline `Increase damage to ... at Nth level` clauses, and Dragon Breath-style
`Increase to +N bonus and ... damage at Nth level` chains. The highest threshold
not exceeding the character level applies. A damage tier replaces only the
damage phrase so that conditions and movement in the same Hit clause survive.
Repeated complete ability/bonus/defense alternatives are candidates for the
existing modifier, raw-score, class-key-order, then authored-order selection;
the selected clause remains otherwise verbatim. Unrecognized prose is
not rewritten; this boundary prevents a density optimization from silently
changing a power's meaning.

The pre-card pages likewise use bounded, named panels rather than a generic
multi-column dump: a character dashboard followed by indexes and note/portrait
panels. This is a print compatibility boundary, not a requirement that browser
View imitate the legacy sheet visually.

### D070 — Printed attacks pair authored formulas with unambiguous totals

**Status:** accepted

**Date:** 2026-09-30

Each authored attack phase is a first-class evaluated value rather than a
single power-wide attack cache. The rules engine preserves its ordinal, resolved
ability, intrinsic power bonus, defense, target, final attack bonus, and the
components that produced that bonus. Multiattack powers therefore calculate
each phase independently; an explicit power ability choice applies only to a
phase that actually offers that ability or names `Primary ability`. Generic
`Primary ability` resolves like native `CalcStatVsDefense`: `HighestAbility`,
the highest of all six scores with earlier scores winning ties, whatever the
class's key abilities are (amended 2026-10-28 by owner decision; it first
used the selected class's authored key-ability order).

Each phase also retains its own ordered Hit clause, level-relevant damage
expression and type (including compound types), damage component provenance,
and explicit main/off-hand role. Repeated whitespace-prefixed Hit fields bind
to their surrounding attack ordinal. Secondary attack-type overrides drive
their own contextual contributions. The first damage clause supplies the
immediate type; ongoing and other rider damage remains in authored prose.
Equipped hand restrictions affect the phase's table-cell eligibility while
owned inventory alternatives remain available for comparison. Companion
attack/damage stays explicitly unsupported until its stat block is modeled.

The physical card renders one compact band per phase:
`⚔ +12 · STR+2 vs AC | target`. The calculated total leads, while a centered
dot separates the authored formula and preserves an intrinsic power bonus
without confusing it with the total. Multiattack bands have no ordinal prefixes:
their top-to-bottom order identifies each phase, while weapon-table columns
retain their numbered labels. The same cell
uses a default-on browser Display preference, “Show equipped weapon to-hit bonus
in attack headers.” Disabling it removes the equipped total and center-dot
prefix, leaving the abbreviated authored formula and defense (for example
`STR+2 vs Ref`). Weapon-table calculations and interactive cards do not change.
The preference is browser-local and persistent; intrinsic power bonuses remain
visible because they are part of the power, not the equipped weapon. The cell
abbreviates only the long defense names `Fortitude` and `Reflex` to `Fort` and
`Ref`; underlying calculations and authored rules text retain the full names.
The action/range and primary attack/target rows share a first-column split sized
to the wider intrinsic action or attack cell at each fitted font size. Reset the
shared width before refitting to avoid retaining a stale larger split.
The combined attack cell uses that shared width and the target receives the
remaining width, wrapping vertically when needed. The action/range and first
attack bands remain visually contiguous;
Requirement, trigger, and other unconditional setup follow the first attack
band but precede Hit. Hit and following phase-bound effects remain directly
below their attack band, preserving scan order and avoiding detached
damage/effect summaries.

Authoritative evaluations project the structured attacks through the shared
sheet model. Legacy snapshots also expose their cached weapon attack stat and
total as presentation variants so a known `DEX`, `WIS`, and similar value is not
degraded to an `ABILITY` placeholder. Unsupported legacy multi-phase caches
remain recoverable as authored prose rather than inventing independent totals.

### D071 — Printed power identity prioritizes usage over Utility classification

**Status:** accepted

**Date:** 2026-10-01

At-Will, Encounter, and Daily are the mechanically important identities players
scan for during play, while Utility is an additional power classification rather
than a fourth usage frequency. Printed power cards therefore use usage for their
default border and header color: green for At-Will, red for Encounter, and gray
for Daily. Non-Utility title and bottom bars use the same solid usage color with
white text. A Utility card keeps its usage color everywhere except the bottom
type bar, which is always Utility blue and reads forms such as `AT-WILL UTILITY
POWER`; the numeric power level, when present, is right-aligned in the same bar.
The three-checkbox frequency matrix is omitted.
Utility titles additionally show a fixed-size rounded W/E/D badge at the right,
using green/red/gray for At-Will/Encounter/Daily with bold white letters and a
white outline. It is independent of the blue Utility preference; long titles
yield space to the badge. Monochrome uses a white badge with dark text and border.
Full usage wording remains in the footer, and title badges do not shrink with
body fitting. This applies to printed utility power cards, not non-utility powers.
The separate class/level/source footer is removed because class origin is not
needed during play, keywords already carry Arcane, Divine, Martial, and similar
descriptors, and physical cards do not need source citations.

Utility classification comes only from the authored `Power Type: Utility`
metadata. An attackless power is not inferred to be Utility: feature/rules-item
powers such as Divine Challenge and Divine Sanction, and delegated attacks such
as Opportunity Attack, retain their authored non-Utility identity and simply
omit a calculated attack band when none exists.

An off-by-default browser Display preference may reproduce the original
builder's all-blue Utility card style for users who prefer that visual
convention. It changes the Utility card's title, borders, dividers, and tinted
bands from the usage color to Utility blue; the already-blue bottom bar remains
unchanged and continues to name the actual At-Will, Encounter, or Daily
frequency. Monochrome print overrides both color treatments.

**Superseded (2026-10-16, corrected 2026-10-17):** The preference is removed and
the all-blue Utility card is now the only behavior: the whole card uses Utility
blue, and the top-right usage badge (green / red / gray) carries At-Will,
Encounter, or Daily.

**Feature cards (2026-10-17):** A power carrying an authored Rules Item (for
example Divine Sanction, `Power Type: Feature`) is a rules reference, not a usable
power, even when its data says `Power Usage: At-Will`. Its printed card uses
plum (`#5e3a78`, distinct from every usage and item color) and the type bar reads **Feature**;
feature cards sort before at-will cards. Power and item cards omit an empty
action band or subheading instead of reserving a blank line.

### D072 — Keep Lucide after small-size icon evaluation

Status: accepted (supersedes the brief Nerd Fonts integration). Date: 2026-10-01.

The product owner rejected the selected Nerd Fonts `nf-fa-dice_d20` glyph as
too detailed for the small printed attack-header space. Revert the local font
subset, loading/print-readiness paths, font-generation tooling and notices;
retain Lucide as the icon source. After evaluating `dice-5` as well, the product
owner chose `dices` for the attack-roll field.
All earlier power-card presentation changes remain intact.

### D073 — Item cards retain item identity with structured, wrapping rules

Status: accepted. Date: 2026-10-01.

Bring printed items into the fixed-size power-card presentation language without
assigning an overall power frequency to an item that may have several powers.
Keep orange item identity, add the existing shop/equipment category icon to the
title, and reuse its canonical category mapping. The sheet model exposes neutral
item/base-type metadata; icon selection remains a web presentation concern.

Combat values use item-specific rows: melee Proficiency / Damage / Critical;
ranged-capable Range / Proficiency / Damage / Critical on one wrapping row; implement
Critical; armor/shield AC bonus then nonzero penalties. Omit absent values and
empty rows. Enhancement is never a subheader stat (revised 2026-10-16): a bare
`+N` only repeats the item name and is omitted, while `+N <what it modifies>`
(e.g. `+2 AC`, `+2 Fortitude, Reflex, and Will`) leads the card body verbatim
before powers and properties. Use
dot-separated values in softly tinted rows without boxed cells.
Retain the earlier bold uppercase stat-label styling, per visual feedback.
Noncombat enums become compact metadata prose on the footer's left; slot,
weight, and price share its right with dot separators. Only worn items show
slots; held weapons and implements do not. A Critical entry with a rider or
conditional wording is freeform:
keep its entire value as a labeled Critical line in the body and omit it from
the subheader. Prices remain in the footer, including silver/copper denominations.
Activated rules and freeform properties live in the body. Unknown fields are
preserved there until their semantics are established, not classified by guessing
from a short value. Weapon keyword `Properties` occupy a wrapping
regular stat-subheader row below the numeric stats, with the same background,
labels, values and spacing. Its final bottom divider is omitted; stat-only
subheaders keep their bottom boundary. General paragraph-style `Property`
entries remain in the body; these are distinct authored field types, not aliases.
Compact weapon Properties may omit numeric qualifiers present in the weapon's
authored Full Text Properties block (for example Gouge's Brutal 1). A shared
content helper restores an unambiguous exact property-heading value for item
details, sheet cards and power weapon metadata. Explicit compact values win;
ambiguous or missing evidence stays unchanged. Never infer from descriptive
prose outside the Properties block or mutate the stored corpus.
Recognized usage/action prefixes
become per-power headings; unfamiliar prose is never rewritten speculatively.
Item power metadata may be authored in either the field label or the value.
Recognize both, including No Action and consumables. Following visual feedback,
item-power headings now place action and canonical usage together with a single
bullet separator, rather than pushing usage to the right edge. Color the whole
inset header with established light power-subheading colors (`#aaddaa`,
`#ddbbbb`, `#d3d3d3`) for At-Will/Encounter/Daily with dark text, matching
the native LinerAtWill/LinerEncounter/LinerDaily palette rather than diluted mixes or
dark title headers; Consumable and unknown headers retain the orange tint with dark
text. Monochrome uses the neutral light header with dark text.
Usage-colored 1px outlines surround each complete power subsection, including
its heading and body clauses (green/red/gray for
At-Will/Encounter/Daily, orange for Consumable); monochrome outlines are black.
Regular-weight, comma-separated keywords appear below, aligned with action text rather than
the icon; disabling icons removes the reserved icon column.
The icon aligns to the action's first text line, not the
whole wrapped heading. Consumable prefixes may end with a colon, period/newline
or newline (Coin of Good Luck); frequency and action capitalization normalize
without changing original content. Explicit Trigger,
Effect, Hit and other known authored clause labels render in bold, with Augment
clauses separated but still associated with their activated power. Flowform's
Augment is an authored power modification, not a passive item Property.
Preserve unfamiliar activation forms and all remaining prose; do not guess rules.
General item rules (Special, Property, Critical riders and unknown notes) follow
activated powers. Only explicitly labeled Prerequisite/Requirement fields precede
them. Clauses authored inside a power remain inside that power, including its
Special and Augment clauses. Cards without powers retain their authored order.
Preserve authored order
within each group. Item-action headings and their rule bodies form inset bordered
subsections, with a colored top strip and padded white body; general item rules
remain outside those boxes. Their headings are not the item stat header:
body-aligned bold usage/action text, an optional leading action symbol, and a
modest adaptive gap. A tinted rounded strip inset within the body makes the
granted power easy to spot without resembling the top subheader's cell grid;
the outer border groups the heading with its rules. Action symbols are
controlled by the existing printed-card icon preference; category icons
in item titles remain independent of that preference.
Combine category and level in the bottom bar and label numeric weight/price with
units. Inventory quantity is not an inherent item property and is omitted from
physical cards. Honor both legacy Armor Bonus and AC Bonus. Omit identified flavor
and retain unstructured custom instructions when structured rules are unavailable.
Keep fixed card dimensions and adaptive fitting rather than growing cards.
Printed weapon proficiency is signed. Recognized heroic/paragon/epic tier
parentheses move from item titles to footer metadata without changing stored
names. Item-action prose is slightly inset beneath its colored heading strip.
Subsequent power attacks use the same inset strip language, preserving their
attack/target data but omitting the main header's cell borders; the first attack
retains its existing top-band treatment.
Inset subsection headers match the main subheader background, rather than using
a darker tint. Secondary-attack prose shares the item-power text inset. Hide
separators at the start of wrapped target/stat rows, using measured row positions
during fitting. Remove their occupied space too, aligning wrapped target icons
with the attack icon above. Restore separators before measuring the natural
layout; keep a wrapped secondary target on its own row to avoid wrap oscillation.
Secondary target headers use only authored phase metadata, even if a calculated
equipment variant supplies primary-target wording. Preserve same-target
constraints in the authored Hit prose rather than implying a new target choice.

Evidence: recovered `PowerCardItem.UpdatePowerCardItem` field composition,
product-owner item-card audit approval, and synthetic presentation fixtures.
This checkpoint does not close M5.6 or replace its broader acceptance gates.

### D074 — Card rules labels must come from authored rules

Status: accepted. Date: 2026-10-14.

Do not synthesize novel rules sections from calculated metadata. Recovery was
an invented heading that duplicated healing/temporary-hit-point sentences from
Hit or Effect; omit it from sheet card fields while retaining rules-engine
metadata. Compatibility diagnostics likewise belong to separate interactive
warnings, not rules fields or physical cards. Preserve original authored labels
and text, including legitimate repeated fields. Approved calculated attack/damage
headers and tables remain presentation, not extra rules sections. The legacy
Additional effects is confirmed by recovered `PowerCardPower.cs`; product-owner
feedback now omits the entire section and writing area when there are no effects.

### D075 — Preferred printed card size with readable adaptive fitting

Status: accepted. Date: 2026-10-14.

Display settings expose a browser-local preferred printed card text size from
6.5–10 pt in half-point steps, defaulting to 8 pt instead of the previous 6.7 pt.
The preference applies to power and item cards, including body text, weapon
tables, keywords, subheaders, and proportionally sized titles/labels/footers.
Compact labels keep a 4.7 pt floor; titles keep an 8 pt floor and usage bars a
5.5 pt floor. Physical card geometry and pagination do not change.

Title sizes remain consistent between sparse and dense cards. Keep titles and
footers at their preferred sizes, but fit body text, weapon tables, keywords,
subheaders, additional attack headings and embedded item-action headings together.
Keeping subheaders fixed squeezed multiattack body text excessively; the accepted
follow-up permits subheading shrinkage to share the space pressure. Power and
item cards use the same size and fitting policy, starting at the preferred size.

For each visible card's body, try the preferred size first, then half-point
decrements down to a 6.5 pt minimum, replacing the unreadable 4.8 pt floor.
Saved 6 pt preferences are raised to 6.5 pt. Reduce section spacing at 7 pt and
again at the minimum rather than shrinking below the floor.
Check body, card, and header-cell overflow; do not shrink other cards because
one card is dense. Refit on resize, print, and rerender so increasing a
preference restores the largest fitting size rather than retaining an old fit.
Screen print preview flags any card that still overflows at the minimum. Do not
silently lower the floor or drop authored rules to force a pass. Exceptionally
dense cards require a further overflow/continuation layout decision; physical
print overflow remains a visible acceptance blocker rather than a resolved case.
Invalid saved preferences fall back to 8 pt. The preference is presentation-only
and does not modify character data or rules calculations.

Amended 2026-10-29 (owner): the floor is 6 pt (`MIN_PRINT_CARD_TEXT_SIZE`),
and the preference range is 6–10 pt. Section spacing still condenses at 6.5 pt
and below, so a card that fit at 6.5 pt lays out exactly as before; only cards
that overflowed at 6.5 pt now try 6 pt.

### D076 — Additional effects retain situational rules and calculation provenance

Status: accepted. Date: 2026-10-14.

Printed power cards populate the recovered Additional effects area from the
selected equipped/main-hand/default power variant. Do not pool reminders from
all owned equipment alternatives. The rules engine supplies conditional attack
and damage contributions separately from ordinary totals, preserving authored
condition text, evaluated amounts, bonus types, providers, and contribution IDs.
Native global attack/damage stats, matching contextual keyword stats, comma
keyword conjunctions, and exact base/enchantment name limits are supported.
Native opportunity-attack and charge-only condition spellings remain restricted
to basic attacks, including powers authored with `_BasicAttack`.
Keyword `:info` values remain authored text. Existing recovered striker damage
expressions also appear here with their provider and cadence.
Printed reminders lead with their known provider as a bold `Name:` label.
Move an exact matching trailing provider suffix out of the displayed prose
without changing the stored reminder/provenance. Do not infer providers from
arbitrary parentheses or rewrite legacy-cache text whose provider is unknown.

The shared sheet model tags these effects as authoritative evaluation output.
Fallback sheets project the selected serialized weapon's `Conditions` verbatim
and tag it as legacy-cache; cached text never enters authoritative calculations.
Saved main-hand and equipped inventory evidence select the legacy variant when
available, with the historical first-cache fallback retained for incomplete
imports. Original clauses remain in the card body. Populated effects share the
body's adaptive fitting and 6.5 pt floor; an empty card omits the section and
reserved writing area, yielding that space back to its rules body.
Fixed card dimensions and visible overflow reporting remain unchanged.

Evidence: `PowerCardPower.AddPowerDetails` uses `DefaultWeapon` and
`PowerStats.conditions`; native `CalcConditionals`, `InfoKeyword`, `IsKeyword`,
`IsLimiterName`, `BasicAttackOnly`, `CalcStriker`, and `MergeConditionals` establish
the separate reminder channel. Public synthetic fixtures cover provenance,
equipment selection, keyword conjunction/limits, alias deduplication and legacy
preservation. The private Hu sample confirms Censure of Unity on damage-roll
cards. This is ordinary power-card coverage: the distinct native Action Point
card and dwarf Second Wind specialization remain separate parity work, as do
special generated keyword families outside the current power-loadout model.

### D077 — Personalized power clauses follow resolved class-feature choice families

Status: accepted (2026-10-14).

Personalized evaluated View/print cards omit named clauses that uniquely match
an inactive sibling of a confirmed single-choice Class Feature selection. Derive
the family from the parent feature's literal `select` category and the complete
content definitions, not a hardcoded list or a potentially trimmed candidate
list. Require a legal, source-entitled selected option, one resolved choice slot,
and exactly one active family member. Normalize whitespace/case only when
matching labels; retain authored field ordering and text.

Unresolved/custom choices, non-converged evaluation, multi-pick or composite
selectors, duplicate names and standard rules labels remain visible. Generic
Build details and legacy-cache sheets remain unfiltered; stored content and
selections are unchanged. This is an approved display enhancement rather than
legacy parity: recovered `BuildSpecifics` enumerates the fields, and
`RulesElementSpecificIsHidden` returns false. Local metadata confirms the parent
selection/category relationship for Avenger's Censure and Divine Covenant.

### D078 — Integrate the approved printed overview without mutable Play state

Status: accepted (2026-10-14).

The production print preview adopts the reviewed summary/scratchpad design.
One summary prioritizes defenses, health, awareness and basic attacks, with
abilities/skills/languages adjacent. The paper scratchpad centralizes mutable
writing spaces. Full selected feature/feat rules, equipment, power indexes and
notes flow through measured two-column reference pages, preserving content and
marking continuations. The fixed-size physical cards are unchanged.

Keep full feature text, prerequisites and user-facing fields distinct from
authored short descriptions in the sheet model. Use exact definition IDs, not
name-only corpus joins; retain missing-rule/source boundaries explicitly.
Model-derived ability checks and training do not create a second React evaluator.
Inventory retains explicit slots and hidden-card items; unknown slots are labelled.

Channel Divinity's explicit authored field or keyword establishes its scratchpad grouping. Other
shared allowances must have comparable evidence before grouping. Reminders reuse
authored conditional/ally-facing class/racial/feat text, equipped item properties
and existing Additional Effects, prioritizing ally-facing entries. This display
heuristic is not exhaustive mechanical inference; full descriptions remain in
references. Bound optional summary content, never silently discard detail rules.

Tracking hearts, skulls, usage boxes, AP and XP are printable affordances only;
no persisted PlayState or character mutation is introduced. Real-character
feedback continues under M5.6. Overview-only PDF diagnostics supplement, but do
not relax, the existing dense physical-card overflow assertion.

Scratchpad stock-tracking feedback (2026-10-16): generic Session notes and
Treasure writing panes are removed in favor of owned Consumables below Daily
powers in the right column, independent of Encounter powers on the left. Date
appears only in the Session Notes pane header; XP writing space moves to that
separate ruled template, appended after all references/cards. It has Session
notes, Treasure and XP panes, without prefilled recorded XP or a page number.
The numbered character sheet remains continuous and excludes this repeat-print
template. Its identity/section footer otherwise matches. Small stocks use power-tracking boxes and larger stacks a count
box; classification follows authored inventory metadata, not names or the
item-card visibility checkbox. Item cards remain stock-tracker-free after the
rejected bottom-strip trial. All three tracking streams use measured pagination.
Consumables retain ordinary pane borders, with muted item-card gold only in the header,
and use shared item-card icons. Parentheticals are suppressed unless different
owned names would collide without them.

Shared-use placement (2026-10-16): Channel Divinity stays in the encounter table
at its earliest sorted member's position (owner-selected option 2), not in a
separate subsection. Each member retains its action icon; all share one set of
boxes. Members sort by action then alphabetically. The original definitions use
a specific Channel Divinity field even when their Keywords contain only Divine;
recognition must preserve that authored distinction rather than add a fake
keyword or infer shared usage from a power's name.

### Basic-attack alternatives (2026-10-16)

Status: accepted.

Owned powers with an effective authored `_BasicAttack` value of Melee/Ranged
join the summary Basic Attacks table. Keep power eligibility separate from
equipment `basicAttackTypes`: a staff can deliver a ranged implement power even
though the physical staff is a melee weapon. Each nonstandard BA power is
labelled by its power name alone and uses one eligible equipped/main-hand-first
calculation, falling back to the best available variant. Ordinary basic attacks
retain multiple weapon rows. Preserve the power's own ability/damage; native
basic-specific bonus channels recognize the effective flag after overlays.
This is metadata-driven, not a Power of Skill name special case or prose parser.
Cached recovery does not fabricate feat overlays absent authoritative evaluation.

### D079 — One card classification and one card format for builder and sheet

Status: accepted (2026-10-18).

An audit found three power/item card renderers (builder `EntityCard`, printed
`PrintPowerCard`/`PrintItemCard`, the screen sheet `Card`) on two data paths
(raw content specifics vs. `SheetCard`), each classifying cards itself. The
builder showed "At-Will feature" and "Encounter attack 7" while print showed
"Feature" and "Encounter power". Like the legacy builder, the product uses one
card format on every surface.

Classification lives only in `sheet-model/src/power-classification.ts`
(`classifyPower`, `powerActionLabel`, `powerActionRank`). Following legacy
`PowerCardFactory`, the card type is Utility for `Power Type: Utility`, else
the usage with "(Special)" removed; the authored attack/feature Power Type is
never shown. A power is anything with an action: class-feature powers such as
Divine Challenge and Lay on Hands are At-Will/Encounter powers. A **Feature**
card is a rules reference: a `Rules Item`, or `Power Type: Feature` with no
action (Divine Sanction). Companion stat blocks without an action keep their
usage. Builder tones match printed cards: usage colors, Utility blue, plum
features. Compact labels read "Encounter 7", "Daily Utility 2", "Feature".

Free and No Action are distinct actions (No Action powers work even when unable
to take actions). No Action keeps its own label and uses the Lucide `minus`
icon; Opportunity Action uses Lucide `redo-dot` and Immediate Reaction `redo-2`,
beside Immediate Interrupt's `trending-up`: one arrow family for triggered actions;
action order is Standard, Move, Minor, Free, No Action, triggered.

Cards show only the power text tier at the character's level; beyond a power's
later tiers the base tier is shown. Builder cards present clauses exactly as
printed cards do (no builder-only relabelling). Builder detail panes reuse the
printed card components in a fluid "panel" layout with builder additions
(availability, relationship, source below the card); other choices (class,
race, feats, …) adopt the same card frame. Every builder card is the
character's evaluated card, including the printed weapon table: the Build tab
at the level being viewed, Equipment and Shop at the current level. This
supersedes D067's authored-formula Build cards. Rules clauses keep weapon dice
as [W]; weapon-specific damage appears only in the weapon table, so the
"Replace [W] with the selected weapon's dice" setting is removed. Item prices
and weights group thousands ("3,400 gp").

Panel cards (builder, on-screen sheet) have dark-theme paper, ink and card
colors; printed cards and the print preview always use light paper. Panel cards
keep the printed width-to-text ratio (2.47in at 8pt) and grow downward rather
than widening; other choices' reference cards use the same width. Panel flavor
text sits directly under the name bar, as in published power blocks; printed
cards omit it.

### D080 — Builder character sidebar and level picker

Status: accepted (2026-10-18).

Builder detail cards are now one card wide, so the full-width character header
and the always-visible level rail no longer earn their space. Every builder tab
shares one sticky left sidebar beside the tab bar: a large centered portrait,
the editable name and race/class/level line, then the key numbers arranged like
the printed Play-data card (abilities as score + modifier, defenses, health,
then initiative, speed and passive senses). Resistances and other notes stay
on the sheet. The sidebar is its own component (`BuilderCharacterStats`),
borrowing the Play card's arrangement rather than sharing the print
component, because the two are expected to diverge; values and tooltips come
from the evaluated stats and shared derived values as before.

Level switching is rare (play mostly fills the newest level), so the level
plan moves behind the Build tab's own "Level N ▾" heading, which drops down a
tier-by-level grid keeping the former rail's completion status (a dropdown,
matching its chevron, rather than a modal). It is not in
the sidebar and has no extra arrows. The section tabs replace the former
Next button: level tab tables instead end at the bottom of the window, later
tables in a tab sharing the first one's height, and short lists shrinking to
their rows. Detail
columns are one card wide and flush right; below 63rem the sidebar folds above
the workspace.

**Navigation cleanup (2026-10-18).** The portrait, name and race/class/level
sit on the page above the sidebar's stat groups, which are unboxed and use
the printed Play card's group colors (with hue-derived dark-theme tints). The
funds are a stat group shown on every tab: five coin tiles (Platinum, Gold,
Silver, Copper, Diamond; "AD" if abbreviated) and a quick-adjust field top
right shaped like a coin tile (type "-15 gp", Enter), in one 3 × 2 grid, values with thousands separators
under their labels and never truncated. Tiles show actual coins and edit in
place (double-click or Enter); there is no edit-funds dialog. A "Merge carried
and stored funds" setting (on by default) shows one set of coins, edits adding
to carried and spending carried before stored; when off, a Carried / Stored
switch chooses which location the tiles and quick adjust use. Quick adjust changes the coin typed
("-1pp" spends one platinum): added coins are carried, spent coins come from
that coin (carried before stored), and only a shortfall makes change, by
breaking the nearest larger coin or spending smaller ones. Purchases keep the
recovered legacy change-making order. Every detail column is one card wide. Tabs are Build, Details,
Loadout, Inventory and Shop: Overview is removed (the character sheet replaces
it; old links fall back to Build), Equipment splits into Inventory and Loadout,
and Diagnostics is reached only from the status badges, so it is hidden when
nothing needs attention. The app header is removed: the builder's Character
sheet, Settings and Close icons follow undo/redo, the library has a visible
title and Settings gear, and Settings has a close button.

### D081 — Implement powers list only usable implements (rules over legacy)

Status: accepted (2026-10-18); amended 2026-10-19 (now a display setting).

Amendment (2026-10-22, owner): any item the engine decides this character can use
as an implement counts as proficient for implement powers, whatever field makes
it an implement (e.g. Rose Scythe of Chauntea for a divine or primal character).
On weapon attacks it still needs weapon proficiency. The display filter reuses
the engine's implement decision rather than re-deriving it.

Amendment (2026-10-19): legacy offers every _owned_ weapon and implement, not
only equipped ones: its `CheckPower` ends in an unconditional `return true`,
so the unequipped Quick Crossbow appears on Arizona's Sacred Flame. The engine
now lists every owned weapon and implement for an implement power like legacy,
and marks each variant `proficient`. The rule below is a presentation setting,
"Only show implements you're proficient with" (on by default), applied by the
sheet model on screen and in print. `.dnd4e` export writes every variant, so
cached-parity tools no longer report these rows as mismatches.

The legacy builder's PowerStats offers every equipped item to an Implement
power and even adds a plain weapon's enhancement bonus (Hu Sheng-Ming's
Way-Leader Gouge +1 shows +10 on Shining Symbol, like his holy symbol). By the
4E rules an implement power uses only an implement the character is proficient
with; with anything else in hand the attack gets no implement benefits, which
is the Unarmed (no implement) calculation. This is a deliberate, owner-approved
departure from the legacy oracle.

Implement powers list: implements matching an active "Implement Proficiency
(…)" or "Arcane Implement Proficiency (…)" element; weapons those proficiencies
name by weapon or group (e.g. a swordmage's blades, a monk's weapons); and
Unarmed, labeled as before with a "No implement" tooltip. If the content
records no implement proficiency at all, implements are still listed rather
than leaving only Unarmed. Weapon powers are unchanged. Cached-parity tools
report the dropped legacy weapon rows (Hu's gouge, Piri's spear and dagger) as
expected mismatches.

Items also become implements through authored metadata: `_ImplementForClass`
and `_ImplementForPower` scopes (a class's class and paragon path powers,
"PP <class>" paragon path powers, a power source or "@Power Source:<name>",
with a race qualifier such as "warlock(dwarf)" requiring that race) make an
item usable for matching powers regardless of proficiency (pact blades,
Alfsair Spear, Star of Corellon); `_ImplementEquiv` makes a weapon count as
an implement kind for proficiency (Holy Avenger as a holy symbol); and
`_UniversalImplement` makes it usable for any implement power. Weapon
proficiency bonuses never apply to implement attacks.

### D082 — The browser installs portable packs only (supersedes D021)

Status: accepted (2026-10-18).

D021 let the browser turn a decrypted, merged `.dnd40.xml` into a pack and scan
a legacy data directory for sources, under Settings → Advanced content options.
In practice every group gets content as an advertised server pack or a `.4ecp`
built with the content tool, decryption and `.part` merging already required
the tool, and the advanced section (pack digests, quota numbers, raw XML
import) was developer tooling in a user screen. The main import button already
accepted only `.4ecp`, so D021's "ordinary file picker accepts the same
formats" had drifted from the code.

The web app now installs `.4ecp` packs only, through Settings → Game content;
raw rules XML, directory scanning and pack-identity fields are removed from the
browser along with the web-only `legacy-rules-import` and `content-onboarding`
modules. All conversion (`import`, `merge`, `compile`, `inspect`) lives in the
project-local content tool. Exact versions and storage quota diagnostics are
dropped; `pnpm content-tool inspect` covers digests. Asking the browser for
persistent storage moves to a library banner (D083).

### D083 — Print options, paper size and persistent storage

Status: accepted (2026-10-18).

The per-character print options (paper, monochrome, blank hit points, power
and item card inclusion) were reachable only in the deferred screen sheet view
that every route skips for print preview. Blank hit points is dropped (the
scratchpad tracks play), cards always print, and monochrome is left to the
browser's print dialog; the stored `sheetSettings` fields stay in the record
for compatibility but the sheet ignores them. Paper size can't be left to the
print dialog: the sheet is a fixed-size, measured layout pinned by
`@page size`. It is a per-user preference, not character data: an app-wide
Settings → Printed sheet Letter | A4 control, defaulting from the browser
locale (`paper-size.ts`). The print-preview toolbar keeps only Back and Print.

The library shows a standing banner, on arrival and only while the browser
supports persistent storage, has not granted it, and the library has
characters, explaining in plain terms that browsers can clear saved data and
offering "Keep my characters". A refusal turns it into a backup suggestion;
dismissal is remembered, and Settings → Backups & storage keeps the request.

### D084 — Replacement candidates get the same legality as ordinary choices

Status: accepted (2026-10-18).

What a replacement (retraining, power swap, power replace) may take was built
by the shared candidate code but skipped the prerequisite pass that ordinary
choices get, so the Retrain dialog offered feats the character didn't qualify
for. Every offered candidate, ordinary or replacement, now goes through one
prerequisite check (`withPrerequisites` in `evaluator.ts`). For a
replacement it is evaluated at the replacement's level on the character
without the occurrence being given up and everything it granted, and
without the slot's current pick: per the product owner, what a retrain gives
up can never count toward what it takes. The retrained definition itself is
not offered (Endurance → Endurance changes nothing).

### D085 — Action icons and attack headers are fixed, not settings

Status: accepted (2026-10-19).

Two printed-card display settings are removed, each keeping one behavior.
Action icons are integral to how the rest of the app presents powers, so
printed power cards always show the action symbol beside the power name (the
action band shows the timer icon) and item cards always show it in item-power
headers. Attack headers never include the equipped weapon's total to-hit
bonus: the weapon table on each card lists every weapon's bonus, and one place
to look it up is clearer than two. Headers show the ability formula against
the defense (`STR vs AC`, `DEX+2 vs Ref`). The settings' stored preferences
(`4ecb.showEquippedAttackBonus.v1`, `4ecb.showPrintTitleActionIcon.v1`) are no
longer read.

### D086 — Coins are never consolidated automatically

Status: accepted (2026-10-19). Supersedes the **Keep large amounts in gold**
preference.

Player feedback: coins "simplified themselves" (1,500 gp became 15 pp, large
totals became astral diamonds), which read as an import bug. Purchases and
sales re-minted the whole wallet from a copper total unless the preference was
on. Now no transaction re-mints a wallet. A purchase still pays carried funds
before stored (the recovered legacy order) but from the coins themselves
(`payWalletCopper`): it spends the price's gold, silver and copper, and breaks
the nearest larger coin only for a shortfall, as quick adjust does. A sale adds
its proceeds as gold, silver and copper. The preference is removed.
Consolidation is an explicit wallet action (`consolidateCurrency`): coins
become the fewest of equal value up to platinum, each location on its own.
Like moving a character to trash it takes two clicks (it sits beside the
quick-adjust field, so a misclick is easy). Astral diamonds are kept and never
minted. They are treasure rather than change, and a level-30 hoard still
reads fine in platinum.

Quick adjust takes a bare number as gold (`50`, `-15`) and `d` as well as `ad`
for astral diamonds, since prices are
quoted in gold and players typed numbers that were silently rejected. Its
error, previously screen-reader only, shows in a bubble under the field until
the next keystroke, Escape or blur. A changed coin count rolls like an
odometer: each changed digit turns in from below as the count grows, from
above as it shrinks, the rightmost first, while its tile pulses. A count typed
into its own cell changes without either: the user already knows the number.
With reduced motion the new digits show at once.

### D087 — A saved house-rule flag yields to the live check

Status: accepted (2026-10-19).

Each selection stores `legality: "rules-legal" | "houserule"`. The `.dnd4e`
format carries it, so it must round-trip, and it marks a deliberate house rule.
But it was also used to freeze the builder's verdict at the moment of the
pick, and it was never re-checked. So it disagreed with the live evaluation
whenever that verdict changed: a prerequisite the parser couldn't read yet
("Training in Endurance"), or training gained after the pick.

Now a pick whose only problem is an unverifiable prerequisite is saved
rules-legal (`pickLegality`); the live `prerequisite.unverified` warning
speaks for it. And the evaluator honors a saved `houserule` flag on a
selected choice only while that pick is still ineligible: once it is eligible
with a satisfied prerequisite, the occurrence evaluates as rules-legal, with no
house-rule warning and no effect on `legal`. Selections without a choice to
re-check (roots, grants) keep their flag. The stored flag itself is unchanged,
so a `.dnd4e` export still writes it until the pick is re-chosen.

### D088 — Power rows follow legacy PowerStats; healing has its own line

Status: accepted (2026-10-19).

Legacy `D20Workspace.PowerStats` gives a power calculated rows ("weapon rows")
only when it has a Hit line. Two exceptions are hardcoded: Storm Pillar gets a
substitute damage line, and a power whose Keywords include "Healing" gets a
placeholder Unarmed row so `CalcHealing` can attach "regain an additional N
hit points" (from the `Healing`, `<power>:healing` and `<class>:healing`
stats, typed bonuses sharing one maximum). Weapon powers keep a weapon only if
its category matches the power's range (`FigureWeaponType`, `IsMeleePower`,
`IsRangedPower`): a thrown melee weapon is also ranged, close weapon powers
take both, a "ranged" power with the thrown-melee requirement is melee, and
"Stab and Shoot" is ranged. A power with both the Implement and Weapon
keywords takes the implement path (`IsValidPowerCombo` tests Implement first),
listing every owned weapon and implement; an implement without a weapon die
(a rod) deals only the ability modifier on a `[W]` power. Combat bonuses match
the power keywords native `CalcKeywords` adds: the power's name and internal
ID, its Class references and their names, `_ExtraKeywords`, `_Associated
Feats` as "<feat> association", and Power Usage, plus the equipment's
definition IDs (Hexblade content keys Pact Reward as `ID_FMP_CLASS_7:damage`).
Dual Implement Spellcaster's bonus is an "off-hand enhancement", sharing one
maximum with pact-blade transfers of the same bonus.

We match the range rule, and give rows only to a power with an attack or a Hit
line (keeping an attack without a Hit line, for its attack bonus). Healing is
not hijacked onto a weapon row: an evaluated power carries `healing` (bonus and
sources), shown on its card as one additional effect per source ("Healer's
Lore: Regain an additional 5 hit points."). Beyond legacy, which reads only
`Healing`, `<power name>:healing` and `<class>:healing`, healing keyed by the
power's internal ID (Vigorous Spirit) or one of its keywords (Golden Halo's
`divine:healing`) also counts, as the game rules intend; a class power also
counts as its class's power source (Healing Word is a divine healing power,
though its keywords omit Divine); conditional healing
bonuses ("while you are bloodied") become reminders. Content corrections stay
a last resort, for elements that carry no rules at all: always-on Healer's
Lore, Improved Inspiring Word, Tactical Inspiration, Expert Rejuvenation and
Beatific Healer, and conditional Holy Resolve, Revitalizing Dabbler,
Protector Spirit, Scar's Gift, Gift of Life (+1d6) and Mournland Dedicate
(+2d6). Jadehand Action already reminds on the Action Point card. `.dnd4e` export still
writes legacy's placeholder row and `<Healing>` element for compatibility.
Storm Pillar's damage line is a content correction, the hidden
`_CalculatedHit` field, not a name check in code. A weapon without a category
(custom content) is offered to any weapon power.

### D089 — Content special cases go in corrections, not code

Status: accepted (2026-10-20). See `docs/coverage-audit-proposal.md`.

When legacy behavior, or a gap in the content, targets particular content (an
ID, a name, a field value), we fix it in `content/corrections/*.part` wherever
the rule language or a field can express it: a field overlay, an added grant or
statadd, `Unselectable`, a type change. Code is reserved for engine semantics
the data cannot express. Any IDs or names that code keys on live in one
registry (`EXCEPTION_IDS`), each with a test, never as inline literals.

Existing code exceptions are reviewed against the coverage audit's legacy
special-case inventory, and each is moved into corrections or justified there.
Corrections never add copied published prose; they may change structure,
fields, rules and numbers. Where only prose would fix something, presentation
handling or leaving it is preferred. This supersedes the "port verbatim first"
policy in `reverse-engineering/docs/08-hard-coded-exceptions.md`.

A record's machine-read `Prereqs` text counts as structure: a correction may
rewrite it into a form the prerequisite parser resolves, since players see
`print-prereqs`, which stays as published (product owner, 2026-10-21).

### D090 — Story memberships are met by a matching option, else unverified

Status: accepted (2026-10-21).

Some prerequisites name a story membership or condition: "membership in the
Harpers", "member of House Vadalis", "Membership in the Circle of Smoke and
Whispers", "you have a spellscar". Legacy maps these to Internal records that
no content grants, so it fails them for every character.

We count such a clause as met when the character owns an option that
represents it:

- **Harpers:** the Harper Agent background or theme.
- **House Vadalis:** a Vadalis background.
- **Spellscar:** Student of the Plague, any Spellscarred class feature, or
  the Spellscarred Harbinger theme or background.

Otherwise the clause stays unverified. That is a warning, not illegal, because
the DM can grant the membership in play. A membership with no representing
option (the Circle of Smoke and Whispers) is always unverified. Implemented as
prerequisite corrections under D089.

### D091 — Legacy import first; export to the old builder is best-effort

Status: accepted (2026-10-21).

Priority goes to importing legacy characters into this app correctly. Export
back to the original builder is best-effort: we don't maintain backwards
compatibility with it. Where a better feature in this app conflicts with the
old builder's behavior, the new builder wins.

Consequences:

- Content corrections, new records (for example the `ID_4ECB_*` aliases) and
  fields only this app reads are allowed, even though an exported `.dnd4e`
  may then carry elements the old builder doesn't know.
- No legacy-safe corrections bundle is maintained, and export is not filtered
  for the old builder, unless a concrete need comes up.
- The legacy engine remains the behavioral oracle for interpreting legacy
  characters and content (AGENTS.md). This decision is about which way
  compatibility must hold, not about how rules are recovered.

### D092 — The character library is a table with a detail pane

Status: accepted (2026-10-21). Refines D045's "compact library surface".

The Characters page lists characters in a sortable table with a sticky
detail pane, as the builder's selection tables do. Per-character actions
live only in the pane, which is just a header band (identity, role line,
actions). The product owner simplified it on 2026-10-21: no filter box, no
Play data stats in the pane, and no content-update indicator in the
library, since an update applies to every character at once and the
builder's status badge handles it when a character is opened. The page
header's buttons carry one-word text labels (the builder header stays
icon-only). Emptying the trash, a bulk irreversible action, uses an explicit
confirmation dialog rather than the two-click arm.

Consequences:

- The library may show evaluated values (today only the role line). They
  come from a disposable library summary, never a source of truth, or from
  a live evaluation in a worker that never blocks the page.
- New library metadata fields bump `CHARACTER_METADATA_VERSION`, so
  existing rows backfill on read.

### D093 — Requirement != Prerequisite: situational requirements keep card rows

Status: accepted (2026-10-22, product owner). A deliberate divergence from
legacy `IsRestricted` under D091.

A power's Requirement limits when the power can be used, not whether it can
be chosen or what its card shows. Legacy `IsRestricted`/`OtherRestrictions`
dropped every weapon row that the current loadout couldn't use, so Press of
Steel ("You must be using a shield.") had no attack, damage or Additional
effects on a character without a shield.

Consequences:

- Clauses that identify the weapon making the attack (a light or heavy
  blade, a dagger, a reach, two-handed or thrown weapon, a bow or crossbow, a
  spiked chain, a monk weapon, a named weapon or group) still select which
  weapon rows a card shows.
- Clauses about the rest of the loadout never remove a row: "You must be
  using a shield.", "two melee weapons", "two melee weapons or a ranged
  weapon", "two shields", "both a thrown weapon and a melee weapon", and in
  a `_WeaponRequirement` a pair's other hand (`a & b` is met by either) or a
  `free hand`.
- The card still prints the Requirement line, so the player sees the
  condition. The rule lives in `power-requirements.ts` (`isPowerRestricted`).

### D094 — Healing powers without a Hit line get no attack row

Status: accepted (2026-10-22). A deliberate divergence from legacy
`PowerStats` under D091.

Native `D20Workspace.PowerStats` calculates a row for a power with a Hit
line, for Storm Pillar by name, and for any power whose Keywords contain
`Healing`. A Healing power with no attack (Healing Word, Inspiring Word,
Destined for Greatness, Longtooth Shifting, Boundless Endurance) therefore
gets an Unarmed row with AttackStat `Unknown`, no defense or damage, and an
"attack bonus" of half level plus any untyped attack bonuses. It is not an
attack and nothing can roll it.

Consequences:

- The evaluator gives such a power no weapon rows; its healing comes from
  `EvaluatedPower.healing`.
- The `.dnd4e` writer still emits the placeholder row on export, so files
  read by the old builder and viewer keep the shape they expect.
- The parity check (`pnpm parity:baseline`) lists these cached rows as
  legacy placeholders, not as mismatches.

### D095 — Companions, summons and familiars take only rules-backed bonuses

Status: accepted (2026-10-23). Partly a deliberate divergence from legacy
under D091.

Native `D20Workspace.PowerStats` runs `CalcKeywords` and `CalcGlobal` on
every row, so the character's `attack rolls`, `damage` and `damage rolls`
reach beast-companion power rows after `CalcBAB` returns the beast attack
bonus early. Legacy's own beast stat block (`BeastBlock.SetAttackBonus`)
leaves them out, so the power-row behaviour follows from code order, not a
rule.

Decision:

- **Beast companions** take no character-wide bonuses: beast attack bonus
  (level + category bonus + `ALLY.`/`COMPANION.`/`BEAST.` stats) plus
  power-keyed bonuses only. Martial Power pp.39, 43 ("treated as separate
  creatures"; beast powers "use the beast's attack bonus"); Inherent Bonuses
  are for PCs (DMG2 p.138).
- **Summons that attack with the summoner's statistics** (e.g. "Wisdom vs.
  Reflex") are ordinary character rows with every non-temporary bonus,
  including implement enhancement and implement feats. Rules Compendium
  pp.120–121; matches legacy.
- **Fixed-bonus creatures** ("your level + N": hexblade and binder allies)
  take only creature and power-keyed bonuses, on attack and damage alike, as
  their description "specifies otherwise".
- **Familiars** can't attack (Arcane Power p.138), so nothing applies.

Consequences: a beastmaster with Inherent Bonuses or Epic Combatant shows
lower beast-power numbers than the legacy sheet. Research notes are in the
ignored `tmp/summon-research/`.

### D096 — Import matches missing content by unique name and type

Status: accepted (2026-10-23). Product-owner decision.

Players' `.dnd4e` files built with content sources we don't ship save
records under IDs our content lacks, though the same records exist under
other IDs (a Hunter saved with `ID_FMP_CLASS_FEATURE_3327` "Aspects of the
Wild (Hunter)", ours `ID_DBB_CLASS_FEATURE_100014`). Players often don't know
which sources they used.

Decision:

- On `.dnd4e` import, a saved internal-id missing from the active content is
  pointed at the content record with the same name and type when exactly one
  exists. Names compare with XML entities decoded, whitespace collapsed and
  case folded. Several same-named records means no match; the import warns
  and lists the candidates.
- A saved child of a matched record whose own name differs (a theme's
  "Ghost of the Past Starting Feature", ours "Level 1 Ghost of the Past
  Starting Feature") takes the one record of its type that the matched
  parent grants at its level (the legacy record's `Level` specific) and the
  build doesn't already hold. Nothing else is matched structurally. The
  product owner approved this grant alignment as implemented (2026-10-23);
  it is not provisional.
- A saved name ending in "(<Class>)" whose class is one of the character's
  own — its Class and Hybrid Class records, and every CountsAsClass those
  records grant (a Hunter, the Essentials Ranger build, counts as Ranger) —
  takes the one record of its type named without that suffix, when no record
  has the saved name itself ("Mountain Guide (Ranger)", ours "Mountain
  Guide"). Exact names always win; a class the character lacks (including
  one only a multiclass feat counts it as) and any other parenthetical
  ("(heroic tier)", "(level 8)") is never stripped; several same-named
  records mean no match. Reported with basis `class-suffix` (2026-10-23).
- It is the Settings option "Match missing content by name" (Importing
  characters), on by default.
- Each changed identity keeps its saved name and type and records the saved
  ID as `importedDefinitionId`; the untouched original stays in
  `legacyEnvelope.sourceXml`. Exports write the matched ID (D091). Matches are
  silent in the UI (D098); the import report keeps them.

Implemented in `packages/legacy-dnd4e/src/definition-matching.ts`.

### D097 — Inventory, loadout and wealth are one current state

Status: accepted (2026-10-24). Product-owner decision.

Legacy `.dnd4e` files store gear as per-level `loot` transactions that
`D20Workspace.TallyLoot` sums (a later level records a sale or unequip as a
negative count), and money as per-level `_PER_LEVEL_<n>_Carried/Stored
Money` text. The builder exposed the raw rows as holdings: Hu Sheng-Ming's
level-5 Gouge and Belt of Vigor purchases showed as owned and equipped,
and equipping them edited the level-5 row that his level-6 row still
cancelled, so nothing changed.

Decision:

- Inventory, loadout and wealth (every denomination) are **one current
  state** on every surface. Players never see or reason about them per
  level, and no UI views them "at an earlier level". Every edit —
  equip/unequip, add/remove, buy/sell, quantity, coins — changes the current
  state, from any tab and at any viewed level.
- `CharacterBuild.inventory` holds only current, concrete holdings: one per
  item (same name and elements), non-negative counts, valid slots. Rules
  evaluation, the sheet, Equipment, Shop and Loadout all read it, and an
  evaluation at an earlier viewed level still carries today's holdings and
  their saved item choices (`evaluationInventory`, `build-projection.ts`).
- Imported per-level rows are kept verbatim as
  `CharacterBuild.inventoryHistory` (never read for current state). Import
  and the format-3 upgrade of stored characters
  (`CHARACTER_BUILD_FORMAT_VERSION` 2 → 3, journalled like the format-1
  upgrade) fold them with `currentInventoryHoldings`: counts sum, an
  over-equipped sum stays owned so it executes as before, items summing to
  nothing are gone, the first row's ID identifies the holding.
- Buying an owned item adds copies to that holding; an edit that makes a
  holding another item's twin joins it.
- Export to the legacy builder (best-effort, D091) writes the preserved
  history, then one delta row per changed item at the current level, so
  legacy TallyLoot sums to the current holdings; an unedited import writes
  its rows back unchanged. Holdings bought above a lowered level are
  exported at the current level.
- The current wallet is the latest stored wallet text **at or below the
  character's level** (`resolveCharacterWallet`, `walletTextLevel(text,
kind, effectiveLevel)`); edits write the character's level's key
  (`currentWalletTextKey`). Amended 2026-10-28: the first rule read the
  latest key at any level, so levelled-down legacy saves showed and edited a
  stale higher wallet (Beatrix, level 8, showed her level-10/11 "100 gp"
  over level 8's "1 pp; 48 gp"; "copy of character", level 5, showed level
  6's "15 gp" over "786 gp"), and export copied it over the real one. Native
  evidence: `GetPerLevelText(ws, null, name)` (`-Module-.cs` ~16170) reads
  only `_PER_LEVEL_<current level>_<name>`, `WritePLDetailTag` (~12068)
  saves that as the CharacterSheet `CarriedMoney`/`StoredMoney` (which
  always equals the current level's key in the player saves), and
  `D20Workspace.LevelUp` (~877–960) copies every `_PER_LEVEL_<n>_*` text to
  level n+1 while lowering a level leaves the higher keys. So raising the
  character's level (`set-effective-level`, `add-level`) carries the current
  wallet text to each new level, overwriting stale keys; lowering keeps them
  unread. Export writes the wallet keys verbatim, stale higher ones included
  (loss-free; re-import and legacy both ignore them, and legacy's own
  LevelUp overwrites them).

Implemented in `packages/character-domain/src/build.ts`,
`packages/legacy-dnd4e/src/{index,writer}.ts`,
`packages/rules-engine/src/build-projection.ts` and
`packages/sheet-model/src/index.ts`.

### D098 — Success and non-actionable states are silent

Status: accepted (2026-10-25). Product-owner decision.

"We should never display a nonactionable notification, or notification
indicating that success occurred. Success should happen cleanly and
silently."

Decision:

- No toast, banner, badge, Diagnostics group or status line reports success
  ("Imported", "N choices applied", "Authoritative rules evaluation") or a
  state the player can do nothing about.
- `.dnd4e` storage artifacts never surface as user-facing issues: dormant
  saved picks (D043) and records matched by name on import (D096) are kept
  silently for export. The import report and `EvaluatedCharacter` still
  carry them as data for diagnostics and development.
- Problems the player can act on (warnings, errors, missing content, house
  rules, content updates), progress and loading indicators, and empty states
  inside always-present controls remain.

Implemented in `apps/web/src/builder-diagnostics.ts`,
`apps/web/src/CharacterEditorPage.tsx`, `apps/web/src/import-report.ts`,
`apps/web/src/ChoiceEditors.tsx` and `apps/web/src/CharacterSheetPage.tsx`.

### D099 — The printed sheet has an editable, per-character layout

Status: accepted (2026-10-25), phases 0–3 implemented (phase 2, reminders,
on 2026-10-26, after phase 3). Product-owner plan
and decisions in `docs/sheet-editing-plan.md` §7.

Decision:

- A character's sheet layout is presentation, never build input: an
  optional `CharacterRecord.sheetLayout` (`SheetLayout`,
  `packages/character-domain/src/sheet-layout.ts`) beside `sheetSettings`
  and `portrait`. No schema bump; backups, export, duplicate and trash carry
  it unchanged; the rules engine and `.dnd4e` import/export never see it.
  It stores only deltas from the default sheet (`hiddenSections`,
  `hiddenCards`, `shownCards`, `sectionOrder`, `sectionCopies`, `cardOrder`,
  `reminders`), so new cards and reminders get default behavior; vanished
  keys are ignored, not pruned. `normalizeSheetLayout` reads stored values
  leniently (malformed entries are dropped; an empty layout is the default).
- Item cards are the exception (owner decision 1): whether a holding prints
  its card is the holding's legacy `showPowerCard` flag, so it round-trips
  to the old builder. It is presentation, not a build edit: evaluation input
  (`evaluationInventory`) never carries it, and the sheet applies it after
  evaluation, so toggling it never re-evaluates. Legacy-cache sheets, whose
  item cards have no holding, use the layout's lists instead.
- Layout edits do not touch the library's "last modified" order (owner
  decision 5): `CharacterRepository.updateMetadata` keeps `updatedAt` when
  it only changes `sheetLayout` (`null` resets it) or `itemCardsShown`.
- Cards and sections have stable keys built in sheet-model from
  provenance, never text: `power:<definitionId>` (legacy name fallback +
  `#n`), `item:<holdingId>`, `item-set:<id>`, `companion:<id>`,
  `play:character`/`play:skills`; sections `summary` (the overview: page 1 by default, with its continuation
  pages), `scratchpad`, `reference:<features|items|power-index|rituals|profile>`,
  `cards` (every card page) and `session-notes`, in that default order. A retrained
  power is a new card and starts from defaults.
- The card deck order (`sheetCardDeck`) lives in sheet-model, and the pure
  `applySheetLayout` selects what prints: hidden cards leave the deck before
  it is cut into 9-card pages; hiding a card never removes its power from
  the scratchpad usage boxes or power index; hidden sections count no pages,
  so page numbers chain without them. Layout never computes a value.
- The print preview has View and Edit modes
  (`#/characters/<id>?preview=1&edit=1`; `?print=1` is always View; the
  builder and library link to View). Edit keeps the paper preview and puts
  the card controls on the paper (owner feedback 2026-10-25, replacing a
  "Sheet contents" checkbox panel): every card hides or shows on
  right-click, like the legacy builder's card "Hide" (keyboard: focus the
  overlay, "Hide <name>" / "Show <name>", then Enter, Space, the Menu key or
  Shift+F10); a plain click does nothing, leaving it for dragging. Owner
  follow-ups (2026-10-25): no visible per-card button and no long press —
  the ⋮ buttons were too noisy and touch screens are out of scope for now;
  and no menu while hide/show is the only card action (a menu returns only
  with a second action, e.g. Customize). Edit mode always shows hidden cards
  (the legacy one-shot "Restore Hidden Power Cards" became a "Show hidden"
  toggle, then the owner dropped the toggle): a hidden card stays in its deck
  position with its header and type bar as printed and the rest of the body
  blanked behind a large faint "Hidden" (border kept). View mode and
  printing always omit hidden cards — `beforeprint` turns Edit's reveal and
  every edit control off synchronously. The card overlays are out of flow
  (they take their card's grid area), screen-only and never inside probe
  copies, so they change no card size or fit.
- Sections are not right-clicked (owner, 2026-10-25: right-clicking an
  entire page is unintuitive). Edit's toolbar has a **Sections** button
  opening a small popover (`SheetSectionsMenu.tsx`, sharing ActionMenu's
  dismissal: Escape returns focus to the button, an outside click or Tab out
  closes) with one row per section in print order, each an ordinary
  checkbox: Overview (page 1 by default, with its continuation pages), Play
  scratchpad, each reference group, Power & item cards (every card page;
  single cards still hide by right-click) and Session notes. No row is
  locked (owner: e.g. hide the overview to reprint only some cards) and a
  group that prints nothing for this character is an ordinary row too. A
  hidden section simply does not render; hiding every section leaves an
  empty preview with no notice.
- Sections reorder (owner, 2026-10-25): drag a row (native drag and drop,
  a grip handle on each row, a focus-coloured rule marking the drop edge),
  or press Alt+Up / Alt+Down on a focused row. The order is stored as
  `sectionOrder` only when it differs from `SHEET_SECTION_IDS`; the lenient
  normalizer drops unknown ids and appends missing ones in default order.
  `SheetOverview` renders the sections in that order and chains page
  numbers through it (hidden sections count no pages; the overview's
  continuation pages stay with it and its "more reminders on page N" note
  follows).
- Play scratchpad and Session notes print no page number and take none
  (owner, 2026-10-25): the numbered sections run on as if those pages were
  not there (e.g. Overview 1, two scratchpads, cards 2–4, notes, reference
  5…), and the scratchpad's "Tracking continues on the next page…" names no
  page. Their footers keep the title and centred identity; the empty number
  column balances the grid.
- Those two rows also carry a copies stepper (− button, number field, +
  button: "Fewer copies of …" / "Copies of …" / "More copies of …"): at
  least 1 (the checkbox prints none), no maximum; a typed whole number saves
  at once and anything else reverts on blur. Stored as `sectionCopies`
  only above 1 (the normalizer drops non-integers and counts below 1); the
  section prints its whole page set that many times, one after another, at
  its place in the order. Only the grip drags a row, so the checkbox and
  field keep ordinary pointer input. Reset restores one copy.
- The toolbar packs from the start (Back, View | Edit, then Edit's
  Sections and Reset; Print at the end), and each View | Edit option
  reserves its bold width, so the control never moves between modes. Reset
  is an arm-then-confirm "Reset" / "Confirm reset" button (accessible name
  "Reset sheet layout to defaults"): layout cleared (default order, every
  section and card shown), every holding prints its card; disabled at the
  defaults. Bulk group toggles were dropped. Saves are silent and
  serialized (D098); only a failure shows, with a retry.
- Cards reorder (phase 3, owner decision 4 "cards move anywhere in the
  deck"; built before phase 2, which the owner postponed): in Edit mode,
  press on a card's overlay and drag it onto another card, on any page
  (native drag and drop; the card itself is the drag image and fades in
  place). A focus-coloured rule in the gap on the target card's left or
  right edge marks whether it lands before or after it; dropping on the
  first card's left half or the last card's right half moves a card to
  either end. A plain click still does nothing and right-click still
  hides/shows. Drag only for now: the owner dropped the planned Alt+Arrow
  keys (the app has almost no other key bindings). Any card moves anywhere,
  including Play data, Skills, Action Point, Second Wind and item cards, and
  hidden cards keep their place (Edit mode shows them in deck position) and
  move like any other. The order is stored as `cardOrder` (deck card keys)
  only when it differs from the default deck order; the lenient normalizer
  drops non-strings and repeats, Reset clears it, and a new order keeps
  stored keys of cards no longer in the deck after the key they followed.
  `applySheetLayout` merges it with the current deck before print cuts it
  into 9-card pages (plan §4): listed cards in stored order, a card the
  order does not list (new since it was saved) right after its nearest
  default-order predecessor, vanished keys ignored.
- Page-1 reminders show and hide (phase 2, owner-approved 2026-10-26;
  supersedes the "Action Point reminder policy (2026-10-24)"). There are
  two kinds of candidate. **Detected** reminders (the page-1 reminders as
  before) are on by default. **Riders** — reminders a power card's rider
  line (`additionalEffects`) already prints, which the old dedup removed —
  are off by default; Action Point riders are ordinary riders now (the
  `actionPointEffects` special case is gone). A reminder another page-1
  pane already shows (Conditional modifiers, defensive traits) or the
  companion card's notes show is never a candidate, so nothing prints twice
  on one page. One row per source: a source's riders fold into its detected
  row, or else into one rider row worded as the source (an item's property
  text, e.g. Gauntlets of Blood's "You gain a +2 bonus to damage rolls
  against bloodied targets"), the rider text only when the source has none.
  `withSheetOverview` emits `reminderCandidates` (`id`, `defaultShown`)
  in page order without splicing; `reminders`/`summaryReminders` are the
  default-layout result. Ids come from provenance, never text:
  `feature:<definitionId>` (`feature:<group>:<name>` without content),
  `item:<holdingId>` (an equipped item's grouped actionable properties;
  `item:name:<name>` without a holding), `effect:<sourceKey>:<provider>`
  (`sourceKey` is `def:<definitionId>`, `inv:<holdingId>` or
  `prov:<providerId>`), with `#2`… on a repeat. `SheetLayout.reminders`
  maps ids to "show"/"hide", stored only where it differs from the default
  (`withSheetReminderShown`); vanished ids are ignored, not pruned, and
  Reset clears them. `applySheetLayout` decides: an explicit hide drops a
  reminder, an explicit show keeps it, otherwise `defaultShown`. Showing a
  rider (pinning) never removes the card's line, and hiding a card never
  changes a reminder. In Edit mode, right-clicking a reminder row on page 1
  or its continuation pages toggles it with no menu (no keyboard binding,
  owner); rows that are off stay in place in their category, faded, with no
  "Hidden" mark (owner, 2026-10-26: the fade is enough). Edit mode
  fits page 1 with those rows included, so it may run longer than the
  print. View mode and print (`beforeprint`) show only rows that are on,
  without edit behaviour; probe copies never carry it. Toggling never
  re-evaluates. Custom reminders, provenance hints, per-row or per-section
  reset, starring and reminder ordering were not approved.
- A monk full discipline's movement technique prints once, on the
  discipline's card (owner decision 2026-10-28, a layout choice, not a
  rules one): `deckPowerCards` drops the technique's own card from the deck
  (print and screen sheet) when an owned power's card carries it as
  `SheetCard.movementTechnique`. Legacy prints both (PowerCard
  `MonkMovementTechnique` plus the technique's own card). A technique the
  character owns without its discipline keeps its card, and the technique
  stays in `model.powers`, so page-1 lists and the power index are
  unchanged. Builder detail panes already show it only inside the
  discipline's card.

Implemented in `packages/character-domain/src/sheet-layout.ts`,
`packages/browser-storage/src/character-repository.ts`,
`packages/sheet-model/src/{card-deck,sheet-layout,overview}.ts`,
`apps/web/src/{CharacterSheetPage,SheetEditTarget,SheetSectionsMenu,SheetOverview}.tsx`
and `apps/web/src/routes.ts`.

### D100 — Swordmage Warding counts once; hand slots follow native CharLootSlot

Status: accepted (2026-10-26), owner-approved player bug fix.

Context: a swordmage wielding a longsword and wrist razors got Swordmage
Warding twice (+6 AC). The current WotC record adds the warding to AC in
two untyped statadds, one for a light blade and one for a heavy blade, so
both fire when both are wielded; older WotC data typed both lines
"Swordmage Warding" (SampleHeroes `GeranHulmaster.dnd4e`). Legacy counts it
once even with the untyped lines: native `CalculateStatAddValue` evaluates a
linked stat against the parent stat's `type_max`, so the second
"Swordmage Warding"-typed link adds 0 (`sample-chars/DV.dnd4e`: AC 26 with a
longsword and arms-worn wrist razors; the 2 above modern's 24 is an old
CBLoader Wrist Razors `DUAL-WIELDING:` +2 line the current part removed).
The modern stat table applied type caps within one stat only, so the
correction below reproduced the native result for this feature
(superseded by D103: the engine now shares the caps and the correction is
gone).
Separately, the modern `SLOT:` selector compared the raw
`Item Slot` ("Off-hand") with "off hand", so `SLOT:off hand` (Swordmage
Warding's +3, Brawler Style, Brawler Guard, Guarded Flourish, Improved
Swordmage Armor) never matched.

Decision:

- A content correction (`content/corrections/90-4ecb-corrections.part`)
  typed both AC lines "Swordmage Warding", so the bonus counted once,
  as native does (D091: the class feature grants one field, +1 or +3).
  (Superseded by D103: removed; the generic statlink rule counts it once,
  and under that rule the typed lines would have added nothing.)
- `SLOT:` compares native `CharLootSlot` (`legacyLootSlots` in
  `rules-engine/src/item-fields.ts`), so a shield, an off-hand weapon, two
  of one weapon or a two-handed weapon fills the off hand, as native does.
- The legacy loot `_AlternateSlot` flag (wrist razors on the arms) stays
  where the importer already keeps it, in the holding's loot overrides; the
  evaluator reads it there, as it reads `augment`. Export is unchanged and
  loss-free. There is no builder control to move an item to its alternate
  slot yet; that UI waits for an owner decision. (Superseded by D101: the
  loadout is now the source of all three hand facts.)

### D101 — The loadout is the source of the main hand, alternate slot and two-handed use

Status: accepted (2026-10-27), owner-approved (part 1 of the Equipment-tab
slot work; size rules and unwieldable weapons follow separately).

Context: D100's `CharLootSlot` read three facts only from imported legacy
data: the loot `_AlternateSlot` flag, `_INTERNAL_MainHandWeapon` and
`_INTERNAL_VersatileUsedTwoHanded`. Placement in our own Equipment tab never
fed them, so Wrist Razors placed in the main hand still counted as off-hand,
natively built characters could never wear them on the arms, and nothing
could wield a versatile weapon two-handed. Native sets all three while
equipping: `EquipDescription.Equip` (RulesEngineCommon) sets
`_INTERNAL_VersatileUsedTwoHanded` to 1 or 0 on any hand-slot equip (the
"two-handed" versatile candidate) and passes `in_alt_slot` when the slot
name contains the item's `_AlternateSlot`; `D20Workspace.AddLoot` /
`AddEquippedLoot` (D20Workspace.cs ~3290–3390) set
`_INTERNAL_MainHandWeapon` to the item whenever an `ItemSlot` "off-hand"
item is equipped; `CharLootItemSlot` offers the Item Slot plus
`_AlternateSlot` (only Wrist Razors → Arms, Spiked gauntlet → Hands and
Dantrag's Bracers → Feet carry one).

Decision:

- The loadout resolver moves to `rules-engine/src/loadout-slots.ts` (sheet-model
  and the web app re-export it), so the evaluator, the Equipment tab and the
  sheet place holdings with one function. An item's `_AlternateSlot` is a
  slot candidate; a double-click never defaults to it.
- `legacyLoadoutState` derives the native facts from the resolved loadout:
  the holding alone in the main hand (not a weapon in both hands, as native
  sets the text only for off-hand items) is `_INTERNAL_MainHandWeapon`, a
  holding placed in its alternate slot is worn there, and a versatile
  weapon in both hands is used two-handed. `CharLootSlot` and the power
  rows (hand order and the versatile +1 damage/requirements) read them from
  there, never from the raw text strings or loot overrides.
- Two-handed use is per holding (native keeps one character-wide text
  string): `BuildInventoryEntry.wieldedTwoHanded`, set by the
  `set-inventory-wielding` command, which also moves an exactly placed
  holding into both hands (displacing what held them) or out of the off hand.
  The Equipment tab offers it as a right-click "Wield two-handed" menu item
  on a versatile weapon's inventory row or loadout slot.
- Imported holdings without exact slots (legacy equip counts) are placed by
  the resolver from the imported state, as native `CharLootSlot` would show
  them: a loot flagged `_AlternateSlot` in its alternate slot, a versatile
  weapon in both hands when `_INTERNAL_VersatileUsedTwoHanded` is set and the
  holding has no modern choice, a one-handed item in the main hand, else the
  `_INTERNAL_MainHandWeapon` item, other off-hand items in the off hand. An
  imported holding that cannot be placed keeps its legacy state so it stays
  rules-active. Once a holding has exact slots or a wielding choice, the
  legacy encodings no longer apply to it; nothing needs migrating.
- Export (`withLegacyLoadoutState`, via `legacyExportedBuild`) writes the
  loadout back as `_AlternateSlot` ("1", or "0" over an earlier imported
  "1"), `_INTERNAL_MainHandWeapon` and `_INTERNAL_VersatileUsedTwoHanded`.
  A loadout nobody placed by hand is written back as imported. Per-holding
  two-handed use exports as the one native flag, so a re-import applies it
  to every versatile weapon, as native does.

### D102 — The loadout applies the character's size; unwieldable weapons are a house rule

Status: accepted (2026-10-27), owner-approved (part 2 of the Equipment-tab
slot work).

Context: after D101 the Equipment tab's slot logic (`inventoryRequiresBothHands`,
the Loadout selects, double-click equip, `set-inventory-wielding`) read only
the record's Item Slot, while the evaluator's `SLOT:` matching applies native
`ItemSlot` (`-Module-.cs` ~19019): a halfling's longsword sat in the main hand
with a free off hand, but the engine counted it as two-handed. Native
`ItemSlot` returns an empty slot for a weapon the character can't wield (a
non-small two-handed weapon for a Small character; a Large weapon without
`CanUseLargeWeapons`), and native `ValidateEquip` (~20144) then refuses to
equip it. Native `BuildWeaponsList` (~22312) lists every owned weapon for
power rows regardless of slot.

Decision:

- The evaluator exposes the size facts native `ItemSlot` reads as
  `EvaluatedCharacter.loadoutSlotContext` (Small, Oversized, One Size
  Larger, Ambidextrous; cache v64). The loadout resolver takes them through
  `loadoutContext(textStrings, slotContext)` and applies `legacyItemSlot` to
  the hands a weapon fills: a Small character holds a non-small versatile
  weapon in both hands, One Size Larger holds a two-handed weapon in one.
  The Equipment tab, the sheet and the evaluator pass the same facts.
- A weapon placed in one hand that now needs both (saved before the loadout
  knew the character's size) also fills the other hand when it is free; the
  durable build changes only on the next loadout edit.
- Staff-as-off-hand and Ambidextrous only rename the slot `SLOT:` compares;
  loadout placement ignores them.
- The right-click "Wield two-handed" item stays on a versatile weapon whose
  two-handed use the character's size forces, checked and inert, with the
  reason as its tooltip.
- Unlike native, a weapon the character can't wield may still be placed
  (owner decision: allow with an issue). It fills the hands its record
  names, and the builder raises one house-rule character issue per equipped
  weapon (`unwieldableWeaponIssues`, via `withCharacterIssues`) naming the
  weapon and why. Its attack rows stay, as native lists every owned weapon.

Follow-up (2026-10-27, cache v65): power rows now apply native
`IsProficient`'s size rule too. A Large weapon has no proficiency without
`CanUseLargeWeapons`, and with it the weapon is matched by its normalized
name (no " (large)").

### D103 — A statlink shares its parent stat's type caps

Status: accepted (2026-10-27), owner-approved (follow-up to D100).

Context: native `CalculateStatValue` (D20RulesEngine `-Module-.cs`
~36160) adds a stat's statadds in order, each typed one through
`AddStatValue` (~36000) against one per-type cap list (`type_max`). A
statadd whose value links another stat (`+X`, `-X`, a bare name,
`ABILITYMOD(X)`; `ParseStatAdd` ~31955 allows only a ±1 multiplier) is
valued by `CalculateStatAddValue` (~36137), which evaluates the linked
stat with the PARENT's cap list. The linked stat's typed bonuses therefore
compete with the parent's: AC's two untyped links to Swordmage Warding
(typed "Swordmage Warding" inside) add it once (`sample-chars/DV.dnd4e`),
a skill's own feat bonus does not stack with a feat bonus in its "Misc"
stat, and Passive Perception's item bonus does not stack with Perception's.
The result is then added under the link's own type, so a link typed like
its linked stat's bonuses adds nothing (the cap already holds the value);
that is why D100's typed correction could not survive this rule. A typed
literal `value="0"` zeroes its type for good (`SetStatToZero` ~36063).
The modern stat table evaluated every link independently and capped types
within one stat only.

Decision:

- `StatAccumulator` (`rules-engine/src/stats.ts`) evaluates a stat in
  order with native `AddStatValue`/`SetStatToZero` caps and evaluates
  every link against the parent's caps. A stat evaluated on its own (its
  sheet value, a stand-alone link display) starts its own caps, as native
  does with a null `type_max`.
- Provenance keeps applied contributions summing to the total: an untyped
  `+` link is credited with what its pieces actually added (a link whose
  pieces are all capped is "typed-stacking" at 0); a typed or transformed
  link is credited with its result.
- D100's Swordmage Warding content correction is removed.
- Native also drops zero/non-zero-gated statadds inside a linked stat; no
  linked stat in the content carries one, so the modern zero gate is kept
  unchanged. (Superseded by D104: the engine now drops them, as native.)

Cache v66.

### D104 — Conditions the engine never decided are audited; native gates and dual wielding

Status: accepted (2026-10-28), owner-approved postmortem step 1 (follow-up to
D100: `SLOT:off hand` never matched and nothing noticed).

Context: `pnpm audit:selectors` (private corpus) traces every condition the
evaluator decides (opt-in `condition-trace.ts` on `equipmentPredicate`,
`requires`, zero/non-zero/`statmin` gates, statlinks, select categories)
over the 43 sample characters and about 2,100 generated equipment probes,
and flags operands that are never true, never false or unrecognized. It
found engine gaps against native D20RulesEngine:

- `statmin` (Superior Defense) was parsed but never evaluated. Native
  `StatAddApplies` (`-Module-.cs` ~36109) drops the statadd while the named
  stat is below the number.
- Zero/non-zero gates were decided in order against the running untyped
  sum. Native `CalculateStatValue` (~36160–36270) keeps gated statadds out
  of the sum, adds them untyped and uncapped, and picks the non-zero group
  when the finished sum is non-zero, else the zero group; a linked stat's
  gated statadds land in locals that are never added. An untyped literal
  `0` sets the stat to 0 and ends it (~36222).
- `MINONEMOD(X)`/`HALFMOD(X)` statadd values (Storm Adept, Shared
  Prescience) were read as links to a stat of that name. Native
  `ParseStatAdd` (~31955) reads them as X's ability modifier, at least 1 /
  halved.
- `DUAL-WIELDING:` counted any two equipped weapons and matched multi-group
  operands by assigning one weapon per group. Native `IsDualWielding`
  (D20Workspace.cs, `DWSlotEquipped` ~18860) needs a non-armor item whose
  ItemSlot is off-hand plus a one-hand one (or two off-hand items;
  Ambidextrous makes one-hand items off-hand), or a lone double weapon;
  `DualWieldingConditional` (~19300) then requires every equipped weapon's
  Group to be in the operand list, and special-cases `rapier-blade`
  (a rapier with an off-hand light blade, Bladestorm Technique).
- `DEFENSIVE:` (the Level 1 record's AC +1) held for any equipped Defensive
  weapon. Native `WieldingDefensive` (~19206) needs dual wielding and
  proficiency with the Defensive weapon (staff read as the Quarterstaff);
  PHB2's Defensive property agrees.
- A group item set's party count (the "<set> Set Count" textstring) never
  reached the "<set> Set Count" stat its benefits link. Native
  `GroupSetCounts` (~19691) adds it while a piece is equipped and the
  textstring exists.

Decision: implement each as native does (cache v67). The audit stays as a
standing check; a flagged operand is fixed or listed in its `TRIAGED` table
with a reason. Content typos it found (misspelled `modify` targets such as
"Predator's Strike", Stalwart Assault's "constition modifier") fail in
native too and wait for an owner decision on corrections.

Consequence: Drizzt (SampleHeroes, older builder) now gets Cross-Body Parry
and Blade Dance's Dexterity damage with two scimitars, as native code and
the power text ("two light blades, two heavy blades, or a heavy blade and a
light blade") say; his cached rows omit it. The cause in that older save is
not established.

### D105 — Departures from native behavior that the rules require

Status: accepted (2026-10-28), owner-approved review of every D091-cited
departure (AGENTS.md: follow legacy unless it is inconsistent with the
rules). Page numbers are PDF page indexes of the 4eBooks rulebooks.

Context: the engine diverged from recovered native behavior in a dozen
places, citing D091 ("the new builder wins"). D091 is about which way export
compatibility must hold, not about overriding the oracle. Each departure was
re-checked against the printed rules: those where native contradicts the text
change or stay modern, the rest revert to native.

Decision — the builder departs from native here (cache v83):

- **Reactive Shot** (Martial Power 2 p41, "Strength (thrown weapon) or
  Dexterity"): a thrown weapon uses Strength for attack and damage, any
  other weapon Dexterity for both. Native WhichAttack (`-Module-.cs`
  ~23628) gives a bow a Dexterity attack but Strength damage; modern took
  the higher of the two. `thrownWeaponAlternative` in content-domain
  `power-text.ts` (parsed at pack build).
- **A `Weapon` rider counts once per attack** (PHB p81 Giant's Wake, p84
  Fangs of Steel): native CalcMisc (~25992) adds a matching rider once per
  `Weapon` field, so a power repeating it under its secondary Hit adds it
  twice to every attack. `native-power-field-bonuses.ts`.
- **Psionic Dabbler** (PHB3 p195): grants 2/4/6 power points by the swapped
  at-will's level. Its own `modify` makes the power Encounter, so native
  `Psionics` (~16312) counts nothing wherever that modify reaches the power
  (it targets the last `replace` slot's child; no save shows which slot a
  swap lands in). `psionics.ts` counts the power the feat swapped in by its
  record's own Power Usage either way.
- **Armor Specialization (Chainmail)** (PHB p202) and **Battle Agility**
  (Martial Power 2 p24) remove only the chain/scale check penalty: their
  untyped literal `Armor Penalty 0` also zeroed a heavy shield's -2 (D104).
  Content correction typed `Chain`/`Scale`, as Armor Supremacy and Eladrin
  Armor are (`content/corrections/9E-rules-divergences.part`).
- **Weapon damage riders native's table misses**: Smashing Hammer (Martial
  Power p20), Earthfast Assault and Stonechannel Strike (p124), Press Forward
  and Keystone Collapse (p28), Brutal Rebuke (p15), Titan's Hammer (p24),
  Barreling Swing (Martial Power 2 p28), Skullcrusher (PHB p85; its record
  says "the target is blinded" where native's table line reads "your
  enemy"), plus Storm of Blows (PHB p82), Fangs of Steel (p84), Elegant
  Strike (Divine Power p96) and Reaping Lunge (Martial Power p27). Native
  WeaponBonuses (~25976) matches exact texts, so these add nothing although
  each power grants the modifier. They get CBLoader's own `<power
ID>,<group> group:damage` statadds in `9E-rules-divergences.part`; the
  former code superset in `native-power-field-bonuses.ts` is gone. The eight
  siblings CBLoader parts already cover (Driving Flurry, Gale of Steel,
  Agonizing Assault, Assured Strike, Protective Sweep, Meticulous Stab,
  Cross-Body Parry, Blade Dance) are unchanged.

Kept modern, where native contradicts the text or nullifies the feature:

- **Fight On** (Martial Power 2 p143): Inspiring Word gets its extra use;
  native's twice-per-encounter match returns before `_ADDITIONAL_USES`.
- **Ardent Surge** (PHB3 p24): 2 uses (3 from 16th). Native's exact Special
  compare fails only on CBLoader's line-broken text; on stock data it gives 2.
- **Faervian**: keeps all five `_ImplementForPower` sources; native's
  load-time self-`modify` keeps only the last, while the item says any
  implement class may use it.
- **Chilling Cloud** at 21+: keeps the cold damage type that native's by-name
  rewrite drops (its Hit names cold; display only).
- **Bare "Highest ability" attack lines**: resolve to the highest score.
  Trey Spectre 12's saved Sohei Flurry row (Wisdom, +18) shows legacy does
  the same, so this may not be a departure.
- **"+ primary ability modifier" damage** (Elemental Eruption, Soul
  Scourge): resolves like "Primary ability"; native's unknown "primary"
  stat adds 0.
- **`_ImplementAsClass`** is read as an alias of `_ImplementForClass`:
  native reads only the latter, so Avernian Knight's Melee Implement ("use
  any melee weapon as a warlock implement") did nothing.
- **"+N bonus and XdY" increase lines** (Sun Flare, Improved Razor Storm):
  the dice after the bonus are read; native parses from the first digit.
- **Parenthetical weapon terms in damage** (added 2026-10-28, cache v88;
  owner-confirmed):
  native CalcDamage (~24760) stops at the first term that is not followed by
  "+", so Eruption of Steel's "2[W] (main weapon) + 2[W] (off-hand weapon) +
  Strength modifier + Dexterity modifier" (Martial Power 2) deals 2[W] alone,
  and Deceptive Steel's "2[W] (off-hand) + Strength modifier" and Binding
  Cahulaks' "1[W] + 1[W] (off-hand end) + Strength modifier" lose Strength.
  Native ParseWeaponDmg (~24133) also uses the main die for "(off-hand)" and
  "(off-hand end)". The builder reads every term and rolls those two with the
  off-hand weapon (a double weapon's other end), as the power text says.
- **"+ <ability> (off-hand weapon)" damage terms**: native looks up a stat
  named "<ability> (off-hand weapon)", which does not exist (adds 0); the
  builder adds the ability modifier. No current record has such a term.
- **Conditional reminders of linked statadds** (2026-10-28): a reminder
  states the bonus the statadd would add, with its `-` sign and
  HALFMOD/MINONEMOD. Native `BuildConditionalString` (BasicUtils.cs ~149)
  prints the linked stat's stand-alone value (or ability modifier) without
  them, which would state a different bonus than the one the rule grants.
  No content conditional has a negative or HALF/MINONE link today, so no
  shown number changes (`StatAccumulator.#raw` in `stats.ts`).
- **A holy symbol worn in the holy symbol slot runs its rules** (PHB p62,
  "a cleric wearing or holding a magic holy symbol"; added 2026-10-28 with
  queue item 4; owner-confirmed 2026-10-28). Native keeps that slot as the
  `_INTERNAL_EquippedSymbol` text string outside the equip count
  (`D20Workspace.AddEquippedLoot`, `EquipHolySymbol`), so `ShouldExecute`
  skipped a worn-only standalone symbol's own statadds (Symbol of Courage's
  save bonus). The modern loadout follows native otherwise: the slot is not
  a hand for `SLOT:` selectors, exports as equip-count 0 plus the text
  string, and native `comes_before` lists its rows as equipped.
- **A WeaponEquiv row keeps its item's own Critical** (owner-confirmed
  2026-10-28): loot that attacks as its WeaponEquiv weapon (e.g. a Rod of
  Smiting as a mace) shows the item's Critical (+1d10 force per plus), not
  the equivalent weapon's. Native power stats never read Critical; the item
  text grants its critical to attacks made with it.
- **A retrained theme's later features are lost** (Neverwinter Campaign
  Setting, "Changing Themes": "When you do lose a theme, you lose all the
  features that it granted to you"; added 2026-10-28 with the new-saves
  pass). Mellivora-L7 took Explorer at level 1 and retrained it to Gladiator
  at level 2 (`replaces=` the Explorer element), yet legacy still lists
  "Level 5 Explorer Feature" in its level-5 tally and applies its +2
  `Endurance Misc` (legacy Endurance 9, builder 7): native keeps the grants
  the replaced level-1 element schedules for later levels. The builder drops
  every feature of the replaced theme. Inferred from the save, not traced
  in native code.

Consequence: no sample character owns a changed power or feature, so parity
is unchanged. Code comments that cite these departures cite D105; D093
(power requirements) and D095 (summoned creatures) stay as decided.

### D106 — Earlier-level prerequisite snapshots carry no inventory

Status: accepted (2026-10-28), owner decision (follows D097; D091 divergence).

Context: a pick made at level L is checked against a nested "character at
level L" evaluation (`prerequisiteScopeAt` in `rules-engine/src/evaluator.ts`).
Since D097 every holding enters at level 1, and the snapshot's input and
cache key carried the whole inventory and every rules text string, so any
equipment, loadout, item-set or `USAGE_` edit recomputed one nested
evaluation per earlier level (about 5 s cold in the browser for a level-9
character). Native `UpdateInternal` (D20Workspace.cs ~137-268) records each
level's element bitmask before `TallyLoot`/`EquipLoot` and re-records only
the latest level after loot; `CheckOnePrereq` (`-Module-.cs` ~30077) tests
`HasRulesElement(char, elem, level)` against that per-level bitmask and a
pre-loot ability cache, so native earlier levels see no item grants at all.

Decision:

- An earlier level's snapshot evaluates the build through that level with
  `inventory: []`, without occurrences stored beneath an item, and with only
  the text strings the nested pass reads (`select default="[KEY]"` keys from
  the content, `PowersAsClass`). Its cache key is that reduced input.
- The scope adds what the character's items grant now (inventory-kind
  occurrences and their descendants from the current evaluation) to its owned
  definitions and dynamic categories. Items therefore count toward
  earlier-level picks exactly as before D106, deliberately unlike native: a
  4e feat whose prerequisite is lost stops working, so "has it now" is the
  test (D091, new builder wins).
- Item ability-score bonuses no longer reach earlier-level ability
  prerequisites. No stock item adds an ability score.
- A current-level scope (a retrain's exclusions at the character's level)
  keeps the full input with inventory.
- An item's own choices (provider with inventory ancestry) are checked at the
  current level, as native `ExecuteLoot` runs at `LatestLevel()`, not at the
  holding's projected level 1.

Consequences: equipment and text edits reuse every earlier snapshot (Hu
Sheng-Ming at level 9, Node: warm re-evaluation after an unequip ~430 ms →
~170 ms). Parity baseline unchanged. Cache v85.

### D107 — Associates: a stat block parsed at pack build, numbers from the master

Status: accepted (2026-10-28), owner-approved feature.

Context: the pack has 54 `Associate` records (Heroes of the Feywild, Heroes
of the Elemental Chaos, The Book of Vile Darkness, Dragon 405/406/414): fey
beast companions, summoned creatures, elemental companions, a quasit, a
mount. They have no rules, only a prose stat block relative to the master
("HP your bloodied value", "Defenses your defenses + 2", "your level + 5 vs.
AC", "1d8 + one-half your level damage", "Level 21: 2d8 + …"). Legacy shows
nothing for them; the community card sets restate them as fake power cards
whose numbers are typed per level (the Fey Beast Tamer's blink dog is one
point too high from 3rd level on).

Decision:

- **Parsed once, at pack build.** The legacy-wotc import parses each
  Associate record's description into a typed `AssociateStatBlock`
  (content-domain) and stores it on the record as the internal field
  `_Associate Stat Block` (versioned JSON); lines it cannot place become
  `associate.stat-block-unparsed` pack diagnostics. All 54 parse with none.
  The engine never reads the prose. A pack built before D107 has no field and
  so no associates.
- **Which associates a character has** is the content's own signal, a
  positive `FREEBEE:<associate id>` stat (Elemental Companion, Summon
  Warlock's Ally (Elemental), Demonic Companion, …). Sources that gave the
  creature only through a community card (Fey Beast Tamer, Summon Natural
  Ally with its aspect and level gates, Unleash Monolith, Summon Flame
  Zephyr) carry the FREEBEE on that card (`9F-associates.part`, D089).
- **Numbers** come from one place, `associateStatistics` in
  `derived-values.ts`, over the master's evaluated stats at the master's
  level: HP (bloodied value, healing surge value or fixed), defenses (your
  defenses plus the block's bonuses; base + level; or fixed), initiative and
  Perception (yours + N), attack (level + N, or fixed) and damage (dice plus
  ½ level, level, named, "or" and highest ability modifiers and flat terms,
  at the highest damage step reached). A summoned creature (role "Summoned
  Creature") also takes the `SUMMON.` creature bonuses (Alien Summoning), as
  D095's fixed-bonus creatures do. `EvaluatedCharacter.associates`; cache
  v86.
- **Sheet**: one associate card per associate in the companion frame
  (`kind: "associate"`, deck key `companion:<id>`, after the beast and
  familiars), hideable and reorderable like the other cards. Its traits and
  powers are sections of the card, not separate power cards, as the
  companion cards' stat blocks are. Page-1 reminders whose source is a
  feature that only gives the creature, and that name no game term, are
  dropped as shown on the card.
- **Community cards**: the 54 Tivaan/community power cards restating an
  associate become inert Internal records under the same ID (imports
  resolve, exports keep the ID). Their per-level helpers stay granted:
  legacy saves store all 29, and orphaning them would raise unslotted
  occurrences.
- **Content errors** fixed with compendium text (iws.mx): Living Zephyr's
  13th/23rd-level damage steps, the Sidhe House Guard's "highest ability
  modifier".

Consequences: Sylestine (level 12) prints a Trained Blink Dog card with HP
41, AC 27, Fort/Ref/Will 25, initiative +6, Perception +15, Blinking Bite
+17 vs. AC for 1d8 + 6; the community card printed AC 28 / 26. Her
legacy power-usage comparison loses the community card's row (26 → 25
comparable). Rider prose inside a hit line ("damage equal to 10 + your
Wisdom modifier") stays text. Players need a content republish
(`scripts/publish-content.sh`) for the cards to appear.

### D108 — Shop loot validity follows native IsValidLoot, with four fixes

Status: accepted (2026-10-28), roadmap queue item 7; package presentation
amended the same day (owner decision: one combined row).

Context: the Shop paired enchantments with bases by its own reading of the
Weapon/Armor fields. Native `D20Workspace.IsValidLoot`, `IsValidWeapon`,
`ValidateShield`, `TransformLoot`, `LootCost` and the gear page's package
handling (`CharacterLootItem.PackageManipulation`) decide what can be held.

Decision: `apps/web/src/loot-validity.ts` ports them (native `ListContains`
whole-entry matching, IsValidWeapon's phrases, a staff superior implement
as Quarterstaff and a dagger by WeaponEquiv, masterwork armor alone only
with Inherent Bonuses, Armor/Weapon enchantments never alone, a slotless
magic item naming one weapon or armor becomes base + enchantment). Weapon
enchantments that fit a superior implement also list under Implement
enchantments (`EnchantmentItem.InitializeCategoryMembership`). Rituals cost
`100 / (Ritual Cost Modifier + 1)` percent (Secret Formularies). Buying or
giving Arrow/Arrows, Crossbow Bolt(s), Sling Bullet(s) or Journeybread(s)
rebalances the pair into full packages plus singles. Deliberate differences
(D091):

- An Armor magic item whose Armor field names shields (Shield of Turathi
  Defiance) may go on those shields; native has no path and never sells it.
- An empty list entry matches nothing: native's `stristr("", "")` would make
  barding (no Armor Category) a base for any item without an Armor field.
  Barding is never a magic-armor base (legacy lists it in its own category).
- A slotless item whose TransformLoot pair is invalid stays on its own;
  native refuses the purchase.
- Two content lists native cannot read are corrected in
  `96-content-fixes.part`: Berserk Weapon's plural "Axes, hammers, heavy
  blades" and Soulwarding Armor's "Chain, Scale, or Plate".
- Presentation (owner decision 2026-10-28): a pair is one inventory row of
  its total units under the package's name ("Arrows" 35), legacy-style, on
  the Equipment workspace, the sheet's page-1 equipment and inventory
  reference, and its item card (`sheet-model` `inventory-packages.ts`
  `inventoryPackageGroups`; the package holding stands for the row, else the
  singles). Storage keeps the two native holdings, so `.dnd4e` export writes
  native rows and each holding keeps its own record's price and weight (the
  row's weight sums them). The row's −/+ and Remove set its units and
  rebalance (`packageQuantityCommands`); Sell one sells one single item at
  the single's price (Arrow 4 cp), breaking a package when no singles are
  owned (`packageSaleCommands`). Legacy names the row for the single item
  while singles are owned, and its Sell on a package-only row removes a whole
  package; the modern row always sells one unit.

Consequences: 17 enchantments that offered no base now do (Warsoul, Reckless,
Tigerclaw, Greater Stonewall Shield…), 38 artifacts and intelligent items
come with their weapon or armor, "Any" armor enchantments no longer reach
shields, and the 80 masterwork armors show disabled Buy/Give (with the
reason) unless the character has Inherent Bonuses. Evaluation is unchanged.

### D109 — Every PowersAsClass value counts

Status: accepted (2026-10-28), roadmap queue item 6.

Context: native `CategoryOpt::Build` (`-Module-.cs` ~30610) reads the
`PowersAsClass` text string with `GetCharText`, which keeps only the last
applicable value (`CalculateStringValue` without stacking), and lets a Power
match `$$CLASS` through that one class. Level1Rules sets it to Any Class
(`ID_FMP_CLASS_0`, the category of the 677 skill and racial utility
powers); Knowledge of Ancient Lives (40 class variants), Witch (Wizard) and
the level 5 Order Adept feature set another class, which in native ends the
Any Class powers for those characters.

Decision: the builder joins every applicable value's class to `$$CLASS` and
`$$NOT_CLASS` for Power candidates, each from the level its provider adds it
(native builds the categories per choice level). PHB3 p165 (PDF page) lets any
character take a skill power in place of a class utility power, and each of
those features adds a class ("You can choose Cleric powers when choosing or
retraining a class power"), replacing none. The builder already seeded Any
Class into `$$CLASS`; this keeps that seed alongside the new classes.

Consequences: DV (Order Adept) is offered Wizard utility powers in the
level-6 utility slot, as native does, and keeps its skill powers there, which
native drops.

These are deliberately deferred until a milestone produces the evidence needed
to choose well.

### Source-independent `.dnd4e` writer and storage

`LegacyEnvelope.sourceXml` is transitional compatibility debt, not the intended
permanent native character model. The current edited writer still parses that
complete imported document to copy campaign, journal, companion-presentation,
unknown root, unknown sheet, and unknown root-attribute payloads. Its semantic
re-import gate proves parity only for the normalized `CharacterBuild`; it does
not prove that every meaningful part of the `.dnd4e` document is understood.

A read-only 2026-09-17 audit covered the eight supplied correction characters
and nine bundled sample heroes. All 17 use the same known root and
`CharacterSheet` vocabulary, none has an unknown root element, all 17 embedded
campaign blocks are empty, and all sheet-level companion blocks are empty. One
bundled hero contains a structured journal entry. The public structural fixture
continues to exercise synthetic unknown root and sheet extensions. The static
official corpus therefore makes the preservation tail small, but not empty.

Generated `StatBlock`, `RulesElementTally`, `LootTally`, and `PowerStats` data is
disposable cache or compatibility output and must be regenerated from an exact
build/profile evaluation. It must not justify retaining a source document as
authoritative state. Campaign policy, journal entries, meaningful companion
presentation, historical wrappers, and extension data are different: until
normalized, they are authoritative or user-authored payloads that would be lost
if `sourceXml` were removed. The current preservation envelope also does not
fully protect unknown attributes or children nested inside recognized structures
that the edited writer replaces wholesale.

The deferred migration is staged: define the supported official/historical
format boundary; normalize the remaining campaign, journal, companion, wrapper,
attribute, and extension payloads; make the writer consume only authoritative
build state, normalized compatibility data, an exact evaluation, and the bound
content profile; expand semantic comparison to the complete normalized document;
then introduce a character-record schema migration that makes `sourceXml`
optional before removing it. Unknown third-party extensions may remain as a
typed generic element tree at explicit document anchors; preserving an entire
opaque source file is not required.

The decisive exit criterion is:

```text
import .dnd4e -> discard source XML -> export -> re-import
-> compare complete normalized semantics
```

The comparison must cover campaign, journal, companion/extension payloads,
container attributes, and user content in addition to levels, choices,
replacement topology, inventory, alternates, abilities, and text strings.
Original-builder open/save/reopen and representative sheet comparison remain
separate compatibility evidence. This migration is deferred and has not been
implemented; `sourceXml` remains required until the complete gate passes.

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

### D110 — Creature stat blocks parsed at pack build (mounts first)

Status: accepted (2026-10-29): the stored model, then the card layout
(owner decisions, roadmap queue item 10).

Legacy showed a mount's `_Monster` stat block only in the builder's detail
pane (`MonsterDisplay.Build`), as split text, and never printed it. The
owner asked for a creature card instead (a card in the companion frame:
defense and HP tiles, speed and senses, ability scores, then attacks and
traits), generic enough that a summoned creature can reuse it later. Following
the pack-build parsing rule, the import parses each `_Monster` block once into
the versioned internal field `_Creature Stat Block` (`CREATURE_STAT_BLOCK_VERSION`
in content-domain, covered by the stored-IR golden guard), with
`mount.stat-block-unparsed` diagnostics for lines it cannot place.

Two shapes, because the content has two kinds of block: `fixed` keeps a
published monster block's printed numbers (a monster's ability modifiers
include half its level, so nothing is recomputed), and `master` stores an
owner-relative block ("HP your bloodied value", "your level + 5 vs. AC") as an
associate stat block (D107), so one model and one function
(`associateStatistics`) cover every owner-relative creature. The `master`
respelling is a spelling adapter in front of the associate parser, not a
second parser.

Fit, measured before any UI was built (Arial metrics, the companion card
CSS, 6 pt floor, `tmp/queue10/fit-creature.mjs`): the tile layout overflows
the printed card for 31 of 47 blocks, worst Silver Dragon Steed at 155%.

Card layout (owner decisions):

- **One creature card, or two, never a continuation.** A mount prints a
  creature card in the companion frame (sheet-model `creature-card.ts`,
  web `CreatureCard.tsx`, which shares the stat and entry parts with the
  associate card). When the whole card fits the printed card at the 6 pt
  floor it prints as one card. When it does not, it prints as two
  deliberately formatted cards: a **stats** card (identity, defense and HP
  tiles, initiative/perception/speed/senses, abilities, skills and
  languages, notes, passive traits and auras, the load table) and an
  **actions** card titled "<creature> — Actions" (attacks, triggered, minor
  and move actions, each shown like a power entry). Never "(continued)".
- **Compact frame.** Defense and HP tiles share one row; initiative and
  perception join the speed line; notes take the body text size, so they
  shrink with it.
- **Printed text.** The alignment line, a description that only repeats
  the stat block (the Celestial steeds, Silver Dragon Steed) and the
  description's flavor prose stay off the printed card; its tables (the
  load table) stay. The builder's panel card shows the whole description.
  Rules text is never abbreviated or reworded. The mount's item card keeps
  its price and load, not the block.
- **Split by measurement, not a stored hint.** The print preview renders
  each creature's whole card at print size in a hidden probe copy
  (`print-card-probe`), as page 1 measures its panes, and the fit hook's
  `onFit` reports whether it fits at the floor; `applySheetLayout`'s
  `splitCreatures` then puts the stats and actions cards in the creature's
  deck place. Measuring in the browser follows the real fonts, the reader's
  preferred card text size and future CSS changes, which a pack-build
  font-metric hint would not; the metric model
  (`tmp/queue10b/fit-split.mjs`) is evidence only: 13 of 47 blocks overflow
  as one card and every stats and actions half fits at 8 pt.
- **Edit mode.** The deck key is `creature:mount:<holding id>` (companions
  run, after associates); the actions card's key adds `:actions` with the
  creature's key as its `layoutKey`, so hiding either half hides both and
  dragging either moves the pair; the stored card order holds only the
  creature's key.
- **Page-1 reminders** from what gives the creature (its holding, or a
  summon's providers) are dropped by provenance as the associate card's
  are (D107).
- **Content**: Cat's `_Monster` (Dragon 399, CBLoader 40-gear.part) is
  restored by `content/corrections/9G-creatures.part` (a stray "Large
  natural beast (mount) - XP 175" line and "Skills s Athletics"), so the
  full pack builds with no `mount.stat-block-unparsed` diagnostic. The
  parse is unchanged, so the stored version stays 1.

### D111 — Summoned creatures print as creature cards; the power keeps the summoning

Status: accepted (2026-10-29): owner decision (roadmap queue item 11), the
parse and its field boundaries chosen within it.

Context: summon powers carry their creature in their own fields: Player's
Handbook 2 special commands (`" Standard action"`, `" Opportunity Attack"`,
"Instinctive Effect", "Intrinsic Nature", "Symbiosis") after an Effect
that summons it, or stat fields (`Hit Points`, `Defenses`, `Speed`,
`Statistics`, `Creature`/`Size`/`Origin`/`Type`, traits and actions: Bound
Soul, Earth-friend, Servant of the Staff, the hexblade and binder pact
creatures). The longest overflowed the printed power card at the old
6.5 pt floor (Summon Mind Weirds 119%, Simulacrum, Summon Elemental
Warrior and Bound Soul 107%).

Decision:

- **The power keeps its card** (name, usage, keyword and action bands, the
  Effect, augments, its own attack and the evaluated attack rows); the
  creature's block moves to a **creature card** (D110's frame and split
  rule: one card when it fits at the 6 pt floor, else stats and
  "— Actions" cards, never a continuation; rules text never rewritten).
  When in doubt a field stays on the power card: fields after "Augment",
  Servant of the Staff's Attack and Hit, Summon Elemental Warrior's
  per-element riders of the attack its Effect describes.
- **Parsed at pack build** into the power's `_Creature Stat Block`
  (version 2, `master` kind) with `powerFields`, the power's field names
  the block shows (legacy-wotc `summon-creature.ts`). Stat fields are
  respelled as associate stat blocks (D107). A special-command summon
  takes the Summoning keyword's rules (Player's Handbook 2 p. 220: hit
  points your bloodied value, defenses yours without temporary bonuses)
  and the size, speed, defense bonuses and resistances the Effect's
  sentences about the creature give; a conditional bonus stays in the
  Effect, and a defense bonus of a subject not read as the creature, or no
  "you summon a …" sentence, is a `summon.stat-block-unparsed` diagnostic
  that leaves the power card whole. Its commands are attacks you make with
  your own statistics (D095), so their text is kept whole and personalized
  like the power card's.
- **Numbers** come from `associateStatistics` with role "Summoned Creature",
  so `SUMMON.` creature bonuses (Alien Summoning) reach its defenses and
  any "your level + N" attack (D095).
- **Sheet**: origin `{ kind: "summon", powerId }`, deck key
  `creature:summon:<power id>`, after mounts in the companions run, type
  bar "Summoned creature". Its provenance is the power's occurrences (and
  the Internal records that granted them), so page-1 reminders from them
  dedup by provenance. The builder's power and item details show its panel
  card under the power card.

Consequences: on the full pack 118 of 196 summon powers carry a creature;
3 are diagnostics (Dancing Weapon and Animate Arbalester, whose Effect
throws a weapon; Fleeting Thoughts (Augment 1)) and Bound Soul's damage
lines ("your intelligence, Wisdom, or Charisma", no "modifier") print as
text with 3 more; the other 75 have none of their own (associates, the
community trait and attack cards, Effect-only summons, Summon Elemental
Warrior). By the font-metric model at 6.5 pt the overflowing power cards
drop (Simulacrum 107% → 33%, Mind Weirds 119% → 82%, Bound Soul 107% →
0%); Summon Elemental Warrior keeps its fields (107% at 6.5 pt, 91% at the
6 pt floor): moving its per-element riders would leave a creature card
whose stats half alone overflows. 21 of 118 creature cards split, and
every half fits.
Open, for the owner: the power card's attack band and weapon table still
show the summoner's total for the first command (the engine row legacy
also prints), while the command text is on the creature card; the
hexblade pact powers now print an empty body and their trait cards
(auras, special movement) stay separate cards. Glyph of Warding is a trap,
not a summon, and keeps its card (115% at 6.5 pt, 87% at 6 pt).
