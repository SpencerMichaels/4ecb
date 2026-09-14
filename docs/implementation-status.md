# Implementation status

## Current stopping point

Milestones M1 through M5 are complete at their stated release boundaries. M4 is
the builder beta: it delivers the authoritative rules-backed editor and records
native parity risks. M5 is the functional MVP/core builder release. Profile
migration preview and explicit adoption are implemented, and the product owner
successfully opened, saved, and reopened several regenerated real level-8
characters in the original builder. Functional print regression coverage is complete in
Chromium and Firefox. Exhaustive cross-browser, keyboard, screen-reader, zoom,
touch, device, and visual-print validation is intentionally owned by M5.5 after
the interface is designed with the product owner. The installable PWA, update/offline
UX, content onboarding, public-distribution boundary, production Docker guide,
and authoritative exact-profile browser sheet are verified checkpoints.
The content model now supports an administrator-advertised immutable baseline
plus ordered local personal overlays. Same-origin downloads are size-bounded,
identity/digest verified, and cached for offline use; availability does not
imply activation. Profiles preview last-layer-wins collisions, materialize an
exact digest for existing workers, and preserve single-pack activation as a
one-layer migration. New character bindings record ordered layer digests and
the resolution policy. Personal packs have no upload path.
The focused Chromium workflow rendered a migrated one-layer profile, previewed
one layer with zero overrides and a resolved digest, and completed explicit
activation without console errors. Tablet and 375 px phone settings layouts
were also checked; the phone viewport had no horizontal overflow.
The first manual Hu attempt failed before opening because regenerated empty
`textstring` values self-closed; the legacy parser requires an explicit body.
Body-required leaves now serialize as paired tags, and that correction opens in
the original builder. The open then exposed evaluated ability totals written in
the base-allocation sheet field (Hu Wisdom 20 instead of 16). Both ability
scores then preserved the base allocation and Wisdom loaded correctly, but the
next run showed Strength and Intelligence one point high. Recovered native save
code proved that our extra root score block and levels-first ordering were
non-native; level-up choices themselves were not duplicated. Export now follows
the native sheet/campaign/levels/grabbag/text order, emits one sheet score block,
and rejects duplicate occurrence tokens. The newest correction opens in the
original builder, and PDFs exported there from the original and regenerated Hu
records are visually identical under manual comparison. Subsequent product-owner
testing successfully saved and reopened several regenerated real level-8
characters. That representative evidence closes the M5 legacy-application
criterion; future character-specific failures remain tracked compatibility bugs.

## Legacy construction-logic audit (2026-09-02)

A systematic documentation-only audit traced the original builder pages through
`D20Workspace` and the recovered native engine for candidate enumeration,
prerequisite internalization, Show Illegal behavior, grant/drop topology, choice
slots, fixed-point phases, level/history operations, replacements, suggestions,
ownership/duplicates, and save effects. The resulting
[construction-logic ledger](../reverse-engineering/docs/11-construction-logic-audit.md)
corrects the prior universal-order claim, records that suggestions guide Auto Pick
without changing legality, separates source entitlement from active/provider
ownership, refines the update/convergence sequence, and records the history-exit
and stale-evaluation boundary of native save. No production code or public fixture
depends on the decompiled application or ignored private corpus.

The P0 ownership follow-up is now implemented in the public evaluator model.
Candidate decisions separately report source entitlement, rules legality,
active definition/occurrence membership, and owning provider occurrences;
evaluated snapshots also expose the deduplicated membership projection. A
configured source list includes Core and recursively follows `_RequiresID`,
while an absent list retains the existing all-content-entitled local behavior.
Focused engine tests cover configured/unconfigured sources, dependency
entitlement, imported blocked occurrences, and provider identities. Builder
tests verify that unavailable source content remains explainable but cannot be
chosen as a house rule; rules-illegal content retains the explicit Show
Unavailable workflow.

The P1 construction-conformance follow-up adds public synthetic differentials
for deferred future grants, multi-iteration generated topology, level-one
grabbag timing, named definition drops, explicit replacement source identities
across ordinary/retrain/multiclass/power-swap/power-replace modes, replacement
chains, spellbook alternates, impossible replacement completeness, and current-
level regenerated export that rejects a historical evaluation and replaces
stale imported caches. Typed per-level `UserEdit` providers and recursive rule
statements now survive import, current-level projection, regenerated export,
and semantic re-import. Projection now synthesizes stable character-local
entities for them, and the evaluator executes their stat/grant/select effects
through the ordinary fixed-point path before regenerating sheet caches.

Named-select drops follow a saved selection through its active replacement
chain, blank selects materialize an available default and restart topology, and
an `existing` select with no active candidate does not make the character
incomplete. Contextual duplicate clearing now covers exact definitions and the
native one-hop Proficiency/Skill Training pass-through, preserves defaults and
same-definition replacement sources, removes derived descendants, and restarts
topology. The native prior-level active-mask edge remains documented for a later
temporal-membership model; it is not approximated with acquisition level.
Optional Auto Pick and UI sorting remain outside this follow-up.

The current M5.5 interaction pass replaces feat and power dropdowns with
searchable tables backed by authored legacy metadata. Feats expose printable
prerequisites in search/details and Short Description in the table, avoiding a
redundant prerequisite column for already-legal rows; powers expose flavor plus
icon-only action and attack types whose exact labels remain accessible. Repeated
at-will and other same-category slots share one multi-select table, and selected
rows update optimistically. Rows are organized into collapsible legacy-derived
type sections: authored feat subtypes take priority before prerequisite-derived
Race/Class/Skill/tier groups, while powers use their skill or owner metadata.
The former 150-row cap has been removed: every matching row is available without
changing the search. In the Silaqui/full-corpus browser check, all 335 matching
feat groups were present and expanding the 181-row General section took about
0.28 seconds through the browser control layer, so virtualization is not yet
justified. Any feat or power candidate can be starred without selecting it;
favorites persist by content ID across reloads and combine with text search and
type filtering. The complete public check passes all 265 tests, workspace
typechecks, the production/PWA build, both browser print suites, deterministic
content-pack checks, and the query benchmark; a clean live reload reported no
browser warnings or errors.

Character portraits are now browser-local, portable character metadata. The
shared editor accepts bounded PNG/JPEG/WebP/GIF uploads, normalizes the decoded
source to a 1600-pixel maximum edge, and provides pointer/touch panning plus
wheel and range-control zoom within a circular crop. It retains normalized crop
coordinates for later adjustment and caches a 512-pixel rendering. Circular
portraits appear on library cards, unobtrusively in the builder heading, and in
the printable sheet header. Portrait editing is intentionally confined to the
builder; the library and sheet are read-only presentation surfaces.
Portraits survive repository reconstruction, duplication, and checksummed JSON
backup/restore while remaining outside legacy export. Focused validation covers
record rejection, persistence/removal, and crop bounds. Live Chromium validation
loaded a synthetic landscape PNG under the existing strict image CSP, panned and
saved it, confirmed it survived reload and appeared on all three requested
surfaces, and reported no console errors. The complete public check passes all
270 tests, workspace typechecks, the production/PWA build, Chromium and Firefox
print checks, deterministic content-pack checks, and the query benchmark.

The M5.5 runtime pass moves immutable content-derived state out of route
components and into a bounded application-scoped cache. Decoded packs,
initialized rules workers, the most recent exact evaluation inputs, and built
Compendium indexes now survive Build/Sheet/Compendium/Characters navigation in
the same document. Content/profile changes explicitly invalidate the cache;
failed or least-recently-used worker entries terminate cleanly. Focused tests
cover concurrent decode/initialization deduplication, exact evaluation
memoization, invalidation, and worker disposal. Live Chromium verification built
the 38,339-record index once in 6,019 ms, navigated Compendium → Characters →
Compendium, reused the original completed index without presenting Cancel
indexing, and logged no warnings or errors. Full browser refresh remains one
intentional reconstruction from IndexedDB.

Verification for this slice: `nix develop path:. -c pnpm --filter
@4ecb/character-domain typecheck`, the equivalent `@4ecb/rules-engine` and
`@4ecb/legacy-dnd4e` typechecks, and `nix develop path:. -c pnpm vitest run
packages/character-domain packages/rules-engine packages/legacy-dnd4e` all
pass. The package run covers 145 passing tests in 16 files.

The final public checkpoint `nix develop path:. -c scripts/check.sh` passes 248
tests, every workspace typecheck, the production/PWA build, Chromium and Firefox
print checks, deterministic pack build/diff, and query benchmarks. The ignored
full-pack diagnostic covers all eight user samples: cached powers match 482/482
comparable fields and numeric stats match 536/537. The sole numeric difference
remains Idon Tkare's previously investigated `Barbarian Agility` cache value
(legacy 0, evaluated 1). Silaqui is 67/67 numeric and 71/71 power fields with no
evaluation diagnostics. A profile-identity-cached definition lookup prevents
resolved prerequisite parsing from rescanning all 38,339 definitions for every
candidate.

## M5.5 first builder-interface draft

- The working rules-backed editor now uses the approved hybrid structure: a
  compact portrait-and-identity header, tiered 1–30 level rail, and a
  selected-level workspace whose mechanical categories are horizontal tabs.
  Race, class, current level, and XP appear beside the portrait; unresolved and
  warning totals appear beside local save state. The redundant overview panel,
  role/plan facts, and routine successful-evaluation prose are removed. Only the active
  Class, Race, Background, Ability Scores, Skills, Powers, Spellbook, Feats, or
  optional Retraining category is mounted, and each visited level remembers its
  active category. Unresolved decisions are prominent, completed selections
  stay visible in compact form, and a chosen target creates every intervening
  level in one autosaved transaction without advancing the current effective
  level.
- The timeline now expands from a 4.5-rem level rail instead of permanently
  occupying roughly one-third of the workspace. The rail directly navigates
  levels and exposes stable status markers; its Plan action opens the complete
  timeline as a dismissible overlay without shifting the choice and option
  detail panes. On narrow layouts it collapses to the Plan trigger. Option
  detail cards and the expanded timeline use natural content height and browser
  scrolling; only large candidate tables retain bounded internal scrolling.
- The compact rail now exposes all 30 levels under collapsible Heroic, Paragon,
  and Epic headings. A loaded character starts with only its current tier open;
  other tiers can be expanded independently. Selecting a not-yet-built level
  creates every intervening frame, opens that level, and leaves the effective
  character level unchanged. The separate plan-horizon selector is removed;
  current level remains an explicit compact control in the identity header.
  Live Silaqui verification selected unplanned level 9, observed the saved
  horizon and current-level options extend through 9 while effective level
  remained 8, and restored the test record through undo. Reopening the builder
  restored Heroic-open/Paragon-and-Epic-closed defaults; the 1280px layout used
  an 88px rail, left 1113px for choices, and had no header overlap or horizontal
  overflow. The 2026-09-14 public check passed all 270 tests, typechecks,
  production/PWA build, Chromium/Firefox print checks, deterministic content
  checks, and query benchmark.
- The level-category tabs use native tab semantics, stable status color and
  icons, and Left/Right/Home/End keyboard navigation without typography or
  layout shifts. Timeline links activate the category that owns their target;
  selecting level-1 ability work likewise opens Ability Scores directly.
  Candidate tables retain the sole intentional inner scrollbar and grow with
  taller desktop viewports, while ordinary forms keep their natural height.
  Live full-profile verification on 2026-09-14 confirmed the complete seven-tab
  level-1 order, one mounted tab panel and one keyboard tab stop, per-level tab
  memory, ArrowLeft focus/content movement, no page-level horizontal overflow,
  visible ordinary-panel overflow, and table-only automatic overflow. The same
  checkpoint passed all 270 public tests, workspace typechecks, production/PWA
  build, Chromium/Firefox print checks, deterministic content checks, and query
  benchmark.
- The selected level is now the non-interactive leading title in the category
  strip rather than a separate pane heading. The outer choice pane no longer
  contributes a surface, border, inset warning, or padding: selection and detail
  surfaces sit independently against the page background. The redundant
  **Build workspace** eyebrow is removed, tier headings align left, and **Show
  unavailable options** is temporarily removed pending its later redesign.
  Live Silaqui inspection confirmed equal 46.4px level-title/tab heights, one
  keyboard tab stop, no heading exposed as a tab, transparent zero-border and
  zero-padding outer choice chrome, and no horizontal overflow.
- Desktop feat and power tables now use a 24rem minimum rather than the obsolete
  12rem fallback left over from the removed overview chrome, and subtract 30rem
  rather than 34rem when growing with a taller viewport. At the constrained
  1280×720 browser viewport, the Silaqui feat table grew from 192px to 384px
  while retaining its bounded row scroll and no horizontal overflow.
- Feat and power rows now separate browsing from commitment: single-click pins
  details, hover/focus do nothing, and double-click selects. Enter is the
  keyboard selection equivalent; Space remains inspection-only. Live Silaqui
  verification single-clicked Bloodhound Style without changing the selected
  feat, double-clicked it to replace Archery Mastery, selected Cruel Cut Style
  with Enter, and restored Archery Mastery through the normal undo path after
  each mutation.
- Verification on 2026-09-13 passed the complete public check (263 tests,
  workspace typechecks, production/PWA build, print checks, deterministic
  content checks, and query benchmark). Live full-corpus verification at 1280px
  measured a 72px rail and 1129px choice pane with visible detail/timeline
  overflow, correct Escape and backdrop focus return, and no console errors. At
  800px the level list collapsed to the Plan trigger with no horizontal
  overflow.
- The builder evaluates the current character and the full saved planning
  timeline as separate projections. Future choices can be inspected and edited
  out of order without entering current calculations. Lowering **Show plan
  through** hides levels for the session and never mutates saved frames; a
  durable separately hidden horizon remains a named schema follow-up rather
  than being encoded in unrelated character fields. Changing or extending the
  plan immediately invalidates both displayed projections: future levels show
  an evaluating state until a result for the exact saved horizon arrives,
  rather than rendering a stale current-level result as “no choices.”
- Choice surfaces show valid candidates by default. **Show all options for this
  choice** is local to the focused choice, exposes same-category candidates
  blocked by objective rules, excludes category mismatches, resets when focus
  changes, and marks an intentionally selected unavailable candidate as a house
  rule. The focused/selected record renders in an adjacent source,
  prerequisite, description, and mechanical-detail pane. The UI adds no
  popularity or recommendation inference.
- Autosave now exposes loading, saving, saved, and failure states independently
  from rules evaluation. Selection controls update optimistically while a
  serialized background queue persists rapid edits. Storage failure rolls the
  complete pending suffix back to the last persisted build; undo and redo retain
  the same commit-before-success contract. The application shell adds system/light/dark theme preference,
  simple inline monochrome icons, and semantic color tokens preserving the
  established at-will, encounter, daily, and item mappings.
- Interactive state changes use color, icons, fills, and inset markers without
  changing typography or control geometry. Timeline entries retain identical
  font metrics and height when unresolved, selected, warned, or complete; skill
  buttons reserve the same two-line status area for trained, available, and
  unavailable explanations so choices do not shift during interaction.
- Future planning no longer blocks or contaminates compatibility output. The
  canonical legacy-export projection trims frames, nested choices, inventory,
  and alternates above `effectiveLevel`; the library uses that same projection
  for its post-export semantic re-import gate. The full native record remains
  unchanged.
- Production in-app-browser verification on 2026-09-02 used an uncommitted
  public 11-record synthetic profile. It created and completed a native level-1
  Human Fighter, planned through level 4 while current level remained 1,
  selected an objectively unavailable future feat through the temporary
  show-all mode, exercised autosave/undo/redo and the dark override, and passed
  regenerated 0.07a semantic re-import with the future plan retained only in
  the native record. At 900 px and 375 px the builder collapsed to one column
  with no horizontal overflow; the browser console had no warnings or errors.
- A Silaqui-focused oracle pass traced three prototype discrepancies through
  native `CategoryMatch`, replacement, and loot serialization paths. Completed
  retraining now retains its inactive source option; power-only `$$CLASS`
  matching recognizes the selected theme through `Class`/`_ThemePower`; and an
  exactly matched current loot tally recovers item selections omitted from the
  level acquisition record. Silaqui now has zero unresolved choices, Sly Gambit
  is legal in the level-7 encounter slot, and the existing Poison armor choice
  suppresses the false level-8 prompt while cached parity remains 67/67 numeric
  and 71/71 power fields.
- The second product-review pass changes the main interaction unit from one
  choice to one level. A selected level now renders all of its choice sections;
  timeline Background and Skill Training entries are aggregated summaries that
  navigate to their grouped controls. Silaqui's two selected backgrounds remain
  visible under one primary section while further optional slots reveal through
  **Add another background…**. Her five Skill Training slots render as one
  eight-skill toggle list with a live `5 out of 5` count and adjacent details.
  Browser verification exercised optimistic untrain/train, restored the original
  skills through undo, and found no fresh console errors or horizontal overflow
  at 1200 px or 375 px.
- Player-facing detail and sheet-card surfaces no longer dump internal content
  metadata. Raw categories, underscore-prefixed relationship fields, and
  uppercase underscore-delimited machine-token values remain available to the
  rules/query/export layers but are omitted from display. The builder and
  compendium now use `printPrerequisites` for authored prerequisite prose and
  never present the rules-engine `prerequisites` expression as player text.
- Silaqui's selected Rapid Shot Mastery now exposes the legacy optional power
  replacement at level 8, limited to her leveled Ranger at-will attacks; live
  verification replaced Fading Strike with Rapid Shot, observed immediate and
  persisted selection, then restored the original build through undo. Large
  parenthetical feat families now render as a family selector followed by a
  parameter selector while dispatching the original exact candidate. Live
  verification changed `Weapon Proficiency (Greatbow)` to the Handaxe variant,
  confirmed the exact timeline identity, and restored Greatbow through undo.
- Dependent rules choices now collapse into one numbered progressive section.
  Silaqui's level-8 feat, Rapid Shot Mastery selection, and resulting at-will
  replacement appear under one Archery Mastery heading and one timeline entry;
  the three exact saved occurrences and legacy export topology are unchanged.
- Repeated positional slots from one rule now share one section and timeline
  summary with an `X of Y chosen` status. A complete private-corpus audit found
  the generic treatment applies to paired ability increases, level-1 at-will
  powers, and hybrid-class pairs; Background and Skill Training remain under
  their existing specialized controls. Live Silaqui verification confirmed one
  level-8 ability section with Dexterity and Constitution as its two slots and
  one level-1 Power section with two slots.
- Choice-list filtering is now one temporary level-wide **Show unavailable
  options** control. Ability-increase groups omit repeated filter prose and
  empty candidate-detail cards. Generic optional replacements are presented as
  collapsed, category-specific retraining actions and are omitted from timeline
  summaries; existing retraining remains visible as completed history. Live
  Silaqui verification confirmed the unused level-5 actions, category-filtered
  Power editor and cancellation, and her saved level-6 Power retraining.
- The selected-level workspace now follows the legacy builder's recovered
  mechanical pane order: Class, Race, Background, Ability Scores, Skills,
  Powers, Spellbook, and Feats. Gender, alignment, and deity live outside the
  level timeline in a sibling Character details tab, matching the legacy
  builder's Build/Details separation, and render as compact labeled rows rather
  than unrelated full cards.
  Choice controls occupy one ordered middle list and update a single sticky
  detail viewer; no per-choice detail cards remain mounted. Single decisions no
  longer inherit the numbered progressive-flow chrome reserved for genuinely
  dependent multi-step choices. Live Silaqui verification confirmed the
  first-level group/row order, click-to-inspect Alignment details, one mounted
  detail viewer, no inline duplicates, and no horizontal overflow.
- Live Silaqui verification confirmed that level 1 and its timeline contain no
  identity choices, Character details orders Gender, Alignment, and Deity as
  three direct label/control rows with no nested headings, switching tabs hides
  the build workspace, and the 374 px viewport has neither horizontal overflow
  nor browser-console errors.
- Base ability scores now live only in the level-1 Ability Scores group, before
  racial increases, and no longer appear as an unrelated editor below the level
  workspace. The editor now mirrors the legacy 22-point-buy path: new native
  characters start from `8, 10, 10, 10, 10, 10`, escalating-cost steppers show
  points remaining and next-increase cost, exact allocations complete the level
  timeline item, and invalid/custom arrays remain editable with a house-rule
  status. Live Silaqui verification confirmed her existing standard allocation
  is recognized as complete, decrementing a score immediately reports the point
  difference, undo restores it, and the control has no horizontal overflow at
  374 px. A replacement choice with exactly one visible result treats that
  result as implied: choosing the source to replace dispatches the exact
  replacement immediately and omits the redundant **With** control. Live
  Silaqui verification selected Fading Strike and observed Rapid Shot applied,
  then restored the original build through undo.
- Paired ability-score increases now render as one ordered six-button selector
  with a live `N of 2 chosen` count. Selected abilities can be cleared, duplicate
  selection is impossible, and the other four abilities are disabled once both
  exact rules-engine slots are occupied. Live Silaqui level-8 verification
  confirmed immediate optimistic selection/clearing, restoration of her
  Constitution/Dexterity choices, and no horizontal overflow at 374 px.
- Character details now implements the complete recovered legacy text-field
  pattern: character/player/company/RPGA identity, age/height/weight, the three
  rule-backed identity choices, and Personality, Appearance, Character
  Background, Companions, Session/Campaign, and RPGA notes. Text edits update
  optimistically, autosave after a short pause or blur, survive `.dnd4e` export,
  refresh corresponding derived sheet fields, and keep the library title in sync
  with Character Name. Live Silaqui verification confirmed all fields load,
  temporary rename and restoration update immediately, the page has no console
  errors, and it has no horizontal overflow at 374 px.
- Silaqui's false level-6 house-rule warning was a presentation bug: warning
  detection flattened candidate decisions from every possible replacement
  target. It now evaluates the selected replacement only, correctly recognizing
  the imported Nimble Strike to Fading Strike retraining as rules-legal.
- A direct legacy-resource and recovered-code audit now documents the builder's
  visual language. The web shell uses its PHB navy, SteelBlue selection cue,
  neutral/ice/cream surfaces, and exact at-will, encounter, daily, utility, and
  item identities. Choice categories, entity details, compendium results, and
  navigation use tree-shaken Lucide monochrome symbols alongside text. The layout is
  denser and square-edged, with full-width bars and dividers replacing pill and
  floating-card chrome; a contrast-checked derived dark palette preserves the
  same semantic meanings. Live Silaqui checks covered light and dark desktop
  rendering plus both themes at 374 px, including an encounter-power detail
  pane, without clipped controls or horizontal spill.
- Timeline rows now use one category icon rather than a category icon plus a
  redundant completion check: unresolved icons are muted, completed icons are
  colored, and house rules retain a warning treatment. Presentation labels are
  independent of evaluator names, remove redundant `Choose` prefixes, and show
  usage before `Power` without repeating the surrounding level. Eligible entity
  details no longer carry a positive legality badge; unavailable choices and
  selected house rules remain explicit. Live Silaqui verification confirmed the
  concise level-1 labels, the single-icon rows, and an Encounter Power detail
  without a `Rules-legal` marker.
- Choice chrome now applies one hierarchy rule across generic, repeated,
  progressive, background, and skill controls: category bars are not echoed by
  type eyebrows, ordinary dropdowns omit the visible **Selection** boilerplate,
  and subordinate labels remain only where they distinguish real steps or
  slots. Silaqui's level-1 repeated group and timeline now say **At-Will
  Powers**, with only **Power 1** and **Power 2** beneath it. Her background
  benefit is a two-stage **Benefit type** and exact parameter control covering
  language, skill bonuses, class skills, and named benefits without changing
  the stored candidate. Background-association and exact-background
  prerequisites now limit those options to benefits supplied by at least one
  selected background; Silaqui consequently sees only Nature, Perception, and
  Athletics for both skill-bonus and add-class-skill choices. The unconfirmed
  Dragon 383 +1-to-two-skills form is intentionally not synthesized.
- Skill Training now separates different evaluator scopes rather than combining
  them into one ambiguous toggle list. Silaqui sees one **Dungeoneering or
  Nature** selector (`1 of 1`) followed by **Ranger skills** (`4 of 4`), with
  duplicate choices disabled across scopes. A filled one-slot scope replaces
  its selection when another eligible skill is clicked, without requiring an
  intermediate deselection.
  Level-1 point buy now uses one full-width row per ability and reports points
  as `X out of 22 points spent`; browser inspection confirmed the steppers no
  longer collide in the middle pane.
- Choice candidates now apply the legacy executable `Prereqs` expression before
  presentation. Silaqui's level-1 feat selector drops from 3,330 candidates to
  299 candidates plus its placeholder by default; **Show unavailable options**
  restores the full list, including Arcane Admixture IV. The implementation
  resolves prerequisite names/IDs through indexed definition tokens and caches
  each result per evaluation. Direct inspection of the legacy engine confirms
  `_INTERNAL_PREREQS` is an in-memory tree parsed from `Prereqs`, not a separate
  XML metadata field; `print-prereqs` remains display-only. The recovered
  `A, B, or C` grammar also eliminates Silaqui's false Archery Mastery warning.
- Planned prerequisite checks now use each choice's effective acquisition level
  rather than the final planning horizon. Same-level ability increases and
  owned features can unlock a choice, while later planned levels cannot leak
  backward; selected earlier choices retain a failed-prerequisite diagnostic if
  they qualify only later. Bounded build-prefix snapshots reuse the ordinary
  topology/stat pipeline. Public regression fixtures cover ability, level, and
  owned-feature prerequisites. The full Silaqui profile remains 67/67 numeric
  and 71/71 power-field matches with zero diagnostics; its scoped evaluation
  measured approximately 4.8 seconds cold and 0.55 seconds warm in the
  development runner, and a live level-1-to-8 plan expansion settled in 0.85
  seconds. The complete public check passes all 264 tests plus workspace
  typechecks, the production/PWA build, browser print checks, deterministic
  content-pack checks, and the query benchmark.
- Choice controls now recognize the same arbitrarily deep generated-grant
  ancestry that the build projection can materialize. This keeps an unresolved
  racial-trait selector enabled when its race grants an intermediate feature
  before exposing the actual choice. A single ordinary choice beneath a
  category bar no longer repeats its individual title, and grouped feat
  selectors suppress the redundant visible **Feat** field label while retaining
  an accessible control name.
- Rules reevaluation is now stale-while-revalidate for an unchanged planning
  horizon: the worker updates in the background while the last complete choice
  workspace remains mounted and optimistic controls remain responsive. A small
  profile-revision-keyed result cache reuses the unchanged current-level
  projection during future-level edits and recent exact projections during
  undo/redo. Only creating a genuinely new planning horizon shows the loading
  state because no result for those new levels exists yet.
- Full-profile evaluation now reuses immutable rules indexes, known-definition
  tokens, and compiled prerequisite trees. Prerequisite ownership tests use the
  evaluator's existing normalized token set instead of repeatedly scanning and
  normalizing every owned definition. A four-pass Silaqui/full-pack development
  benchmark improved from approximately 13.1 seconds on every pass to 5.7
  seconds cold and 1.5 seconds warm. A live level-10 selection kept the complete
  workspace visible throughout reevaluation and settled end-to-end in about
  2.3 seconds before the test plan and choice were restored through undo.
- Builder evaluations now expand complete candidate lists only for the viewed
  level. Other levels retain their exact choice topology, selected-candidate
  legality, and the active candidates needed by `existing` rules. The scoped
  result omits category mismatches that **Show unavailable options** is not
  allowed to reveal. Nested ordinary-retraining candidates are generated only
  after the user opens a retraining editor; completed selections retain their
  selected replacement while collapsed.
- On Silaqui, the ordinary level-8 builder projection now carries 3,861 direct
  candidate decisions instead of 144,490, and three nested replacement
  decisions instead of 112,597. Warm evaluation fell to approximately 0.45
  seconds (about 2.7 seconds cold). A live future level-10 selection remained
  usable while reevaluating and settled end-to-end in 0.69 seconds; opening a
  feat-retraining editor populated its on-demand target choices, and all test
  edits were restored through undo/cancel. Exhaustive compatibility evaluation
  remains available and unchanged in shape; category-parser reuse also reduced
  its warm benchmark from about 1.5 to 1.2 seconds.
- Optional additions now have a complete reversible interaction. A newly
  revealed empty background slot can be removed; a completed extra background
  can be removed without touching the required primary slot; and completed
  ordinary retraining exposes the same accessible X action, which clears the exact
  replacement slot so the evaluator restores its source selection. Removal uses
  the ordinary optimistic save and undo transaction. Focused browser checks
  covered empty background and retraining cancellation plus the presence of
  removal actions on Silaqui; a public command regression covers completed
  background and retraining slots.
- The level workspace now uses one **Level X** heading, with no redundant
  current/choices labels. Required choices at or below the effective level use
  stable warning color and inset markers; completed choices use the established
  colored icons without repeating **Complete**, while future-plan choices remain
  visually neutral and do not increase unresolved counts. Optional backgrounds
  and retraining share a compact accessible X removal action.
- Legacy Build records are now optional one-shot starting presets rather than
  persistent level-1 selections. They use one dropdown plus Apply button, and
  the selected preset's authored description and structured suggestion list
  appear in the shared right-hand detail pane. Eligible presets fill only
  matching open legal choices in one undoable batch, leave existing work
  untouched, report the applied count or a no-match result immediately, and are
  omitted from the timeline and unresolved counts; imported Build occurrences
  remain preserved for exact compatibility. Focused tests cover suggestion
  parsing, multi-slot preset application, and evaluator completeness. A live
  full-profile test selected Hunter Ranger and applied 12 class-feature, feat,
  skill, and power choices to a fresh Ranger in one action.
- Incomplete current-level groups and their individual subsections now give the
  header a substantially stronger warning fill while leaving the choice contents
  on their ordinary surface background. A fresh-character browser check verified
  the treatment in the dark theme; future-plan groups remain neutral. The
  temporary test character was moved to the recoverable app trash afterward.
- Ordinary choice dropdowns now commit **Unresolved** through an exact-slot
  character command and optimistically clear the control and detail pane rather
  than snapping back to the prior selection. A live Silaqui check cleared Hunter
  Fighting Style, observed the saved unresolved state and header-only warning
  treatment after reevaluation, then restored Hunter Fighting Style through
  Undo.
- A live Silaqui check confirmed the level-8 heading is simply **Level 8**, the
  timeline reads **Feat · Archery Mastery**, and the progressive mastery flow
  still offers both **Twin Strike** and **Fading Strike** as replacement targets.
  The earlier level-1 at-wills remain present; domain and evaluator regressions
  separately enforce later-frame replacement overlays and retention of earlier
  choices when a later selector grants another use.
- A representative cross-character builder review found that the bundled
  level-3 Wizard Jim Darkmagic displayed two generic required **Power** choices
  even though his alternate Daily and Utility spellbook selections were saved.
  Recovered `D20RulesEngine.ParseAlternate` calls
  `FindProvider(provider, SelectName)` and replaces the element in that exact
  `spellbook` select slot. Evaluation now projects the preserved alternate
  envelope through the same provider/rule relationship, and editing upserts the
  alternate rather than creating an ordinary level child. Jim consequently
  moves from two unresolved choices/two errors to complete, legal, and zero
  diagnostics; the UI presents **Daily Spell** and **Utility Spell** beneath a
  distinct **Spellbook** group. Live testing changed the daily alternate,
  persisted it, undid it, and confirmed Freezing Cloud after reload.
- Continuing that review found false unresolved level-3/7 encounter slots on
  Japheth and Raidon. Both choose an already-known power again through Adroit
  Explorer's `existing="true"` Ambitious Effort feature. Native
  `CheckPrevious`/`AlreadyHas` evaluates duplication at the original choice's
  historical level, so the later extra-use occurrence must not erase it. The
  evaluator now preserves both occurrence identities while keeping one active
  definition membership. The same review found that level-13/15 `powerswap`
  gains were being checked against the displaced level-3/1 category; gain
  legality now uses the replacement rule's category, matching native
  `UpdateReplacement`. Japheth is consequently complete, legal, and diagnostic
  free; Raidon has no unresolved slots or category errors.
- The nine bundled heroes now have no unexplained required builder choices
  except Binwin's item-owned resistance choice, which remains assigned to the
  deferred equipment-pane work. Six evaluate complete/legal without
  diagnostics. Geran retains two explicitly serialized house-rule powers and
  unverified legacy feat prerequisites. Raidon retains three missing-definition
  diagnostics for two cached Monk class-feature records and one generated
  Focused Expertise variant absent from the installed pack, plus two unverified
  legacy feat prerequisites; the importer preserves that evidence rather than
  inventing rules for it.
- `nix develop path:. -c scripts/check.sh` passes 262 tests across 40 files,
  formatting, ESLint, all TypeScript projects, the production/PWA build,
  Chromium/Firefox Letter and A4 print artifacts, deterministic content checks,
  and the query benchmark.

This is a coherent prototype checkpoint, not M5.5 completion. Product-owner
review and the milestone's comprehensive keyboard, screen-reader, 200% zoom,
touch, Safari/tablet hardware, performance, and visual-print matrices remain.

## M5 checkpoints

### Automated closure boundary and final security review

- Exact implemented compatibility families remain authoritative. Five
  identified native `SpecialCase` entities, absent-companion ability
  substitution, unknown prerequisite prose, and unparsed power expressions keep
  stable diagnostics; no cached field or selection is discarded to improve a
  percentage.
- Item-set and inherent-bonus rules are supported when imported or serialized
  content activates their ordinary rules. No available private character or
  settings artifact activates the recovered implicit campaign fallback, so M5
  does not synthesize one. A same-profile activation artifact is the required
  future differential.
- Public cross-tier fixtures plus full-profile Fighter, Psion, Shaman, Knight,
  Hybrid Cleric/Fighter, Hu, fixed-special, and companion-blocker audits cover
  the generic automated boundary. Unknown-revision caches remain diagnostics.
- The advertised-baseline extension adds one same-origin read boundary. Runtime
  configuration pins identity/digest; downloads and decoding are bounded and
  validated before IndexedDB storage, never auto-activate, and add no upload
  endpoint. Native creation, migration, evaluation, sheets, and regenerated
  export retain their prior trust boundaries. Bounded
  decoders, schema-validated workers/storage, text-only rendering, XML escaping,
  checksummed backup, atomic migration, CSP, and corpus-exclusion gates cover
  the completed behavior. Residual local-device access, weakened deployment
  headers, unsupported rules, and the manual legacy application remain
  documented operator/user risks.

### Seven-sample private compatibility correction pass

- A new ignored seven-character corpus exposed three importer/evaluator defects
  without changing the same-profile golden contract. Power damage contributions
  now deduplicate by serialized rule-contribution provenance, so one rule seen
  through overlapping implement/weapon channels applies once while distinct
  providers remain additive.
- Cached power variants now match evaluated loadouts by their serialized
  weapon/magic-item definition set when available. Unknown older records fall
  back to order-insensitive canonical display tokens; rendered name order is no
  longer treated as identity. Public synthetic differentials cover Dwarven
  Thrower, Luckblade, and Foe-Seeking ordering.
- Legacy race selections nested under a generated Grants subtree are recovered
  only when the parent race's category leaves exactly one matching descendant.
  Both observed private cases now have zero unresolved choices; ambiguous
  structures retain the ordinary required-choice diagnostic.
- Exact public power fixtures cover Howling Strike's combined `[W]` plus extra
  die, Knockdown Assault's ability-only damage, and Call of the Beast's deferred
  conditional damage. Follow-up recovered-code slices add qualified implement
  aliases, actual melee/ranged weapon-channel selection, power weapon-field
  bonuses, weapon-reach attack-branch selection, Rage Strike's literal output,
  versatile two-handed damage, and serialized two-hand slot keywords. Across
  the seven ignored samples, all seven evaluations converge and complete with
  zero unresolved choices; the expanded eight-character diagnostic is 536/537
  numeric aliases and 482/482 power fields with no unsupported power branches. These caches
  are not known-profile goldens. All eight regenerated edited exports pass
  semantic re-import.
- The hybrid surge discrepancy was a real evaluator gap: native `half-point`
  contributions carry a signed half within their target stat, combine before
  truncation, and truncate before linked stats consume the result. The observed
  hybrid's serialized `3` and `4` surge components therefore represent 3.5 and
  4.5 and correctly add the missing whole point; public synthetic tests also pin
  the lone-half link boundary and negative half direction.
- The two armor discrepancies were also evaluator gaps, not content drift.
  Recovered `EquipLoot` calls `EssentialsMagicArmor` after composing base armor
  with its enchantment. Its native heavy-armor table adds +1 to a non-masterwork
  base at enhancement +2, while leaving enhancement as a distinct typed bonus;
  this produces the serialized 7 and 8 Armor contributions from current bases 6
  and 7. Public fixtures pin the +2 adjustment and the nonzero-minimum masterwork
  bypass.
- The one remaining numeric cache difference is retained as internally
  inconsistent evidence: one feature cache omits the base bonus that both its
  own serialized description and dependent defense contribution retain. Three
  older skill-power selections in ordinary level utility slots also remain
  `choice.ineligible`: the current exact pack exposes skill-power substitution
  through a separate feat selection, and the recovered native category matcher
  does not authorize bypassing the level rule's class category. No cache total
  or legality diagnostic was suppressed to improve the aggregate.

### Companion ability provenance guard

- Recovered power parsing treats `beast's <ability> modifier` as the selected
  companion's score, not the character's same-named score. Until companion
  occurrences and their stat blocks are connected to power evaluation, these
  clauses are removed from ordinary character-ability math and reported as
  `companion-ability:<power-id>`.
- A public synthetic fixture prevents the prior silent substitution. An ignored
  full-profile level-9 audit selected the corresponding beast power through a
  complete, legal workflow, but did not materialize its requested companion;
  that run is blocker reproduction, not companion parity evidence.
- No local character or settings artifact activates the recovered inherent-bonus
  entity, so inherent fallback behavior remains unimplemented rather than being
  inferred from the entity alone.

### Fixed-output native power special cases

- Power math now ports the recovered early-return behavior for `Bond of
Censure`: its conditional movement prose yields `1d10`, or `2d10` at level
  21, without incorrectly adding the mentioned Intelligence modifier. Ordinary
  implement enhancement still applies after that native branch.
- Three recovered hit-text branches now retain their fixed `ongoing 10` output:
  the exact Brilliant Beacon radiant line, Baleful Gaze of the Basilisk's
  stunned/poison line, and Contagion's longer failed-save line.
- Public same-profile fixtures cover heroic/epic Bond output, +1 implement
  enhancement, and all three ongoing forms. Other recovered `SpecialCase`
  strings remain explicitly tagged `native-special-case:<power-id>` rather than
  receiving guessed math.
- The ignored supplied Hu level-8 exact-profile comparison improved from 49/52
  to 52/52 cached power fields while retaining 72/72 numeric aliases. Its two
  legality diagnostics are unchanged. The unrelated nine-character historical
  matrix remains 501/509 aliases and 277/371 power fields with 67 conditional
  variants; those unknown-revision caches remain diagnostics, not goldens.
- A follow-up exact-pack inventory identified six remaining native branches.
  The level-5 Dexterity ongoing branch has a reproducible, zero-diagnostic
  native selection path and now produces `ongoing 10+<Dexterity modifier>`.
  The other five identified entities remain unsupported pending equivalent
  exact-profile selection or character evidence.

### Conditional striker power projections

- The renderer-neutral power model now separates conditional damage from the
  ordinary hit total. The recovered `Hunter's Quarry`, `Warlock's Curse`, and
  `Sneak Attack` class-feature IDs use evaluated tier-scaled dice, optional flat
  bonuses, and rule-generated die-size text overrides with named cadence and
  provenance.
- Hybrid quarry, curse, and sneak-attack IDs apply only to powers from their
  Ranger, Warlock, or Rogue class category. Sneak Attack additionally checks the
  recovered crossbow/light-blade/shortbow/sling weapon families. Unknown class
  feature variants carrying those names remain visible in `unsupported` rather
  than receiving guessed behavior.
- Exact public fixtures require epic `3d8+2` quarry damage to stay outside the
  ordinary `1d8` hit, verify hybrid class-power exclusion, enforce Sneak Attack
  weapon eligibility, and retain an unknown-variant diagnostic. Evaluated
  textstring rules now feed power math, so content-authored die overrides are
  authoritative rather than limited to imported text input. Edited 0.07a export
  regenerates these expressions in each weapon variant's `Conditions` cache.
- The ignored historical matrix remains 501/509 numeric aliases and 277/371
  cached power fields. Its new diagnostic-only projection records 67 conditional
  variants: 48 Hunter's Quarry and 19 Warlock's Curse. This is regression and
  plausibility evidence, not same-profile parity.

### Explicit hand pairing and dual-implement selection

- Power evaluation now consumes the durable `_INTERNAL_MainHandWeapon` value,
  identifies the selected equipped main hand and a distinct equipped off hand,
  and exposes both roles and the paired equipment name on calculated variants.
  Alternate legal variants remain present, matching the legacy `PowerStats`
  boundary rather than treating current hand selection as inventory deletion.
- The recovered `Dual Implement Spellcaster` native exception recognizes the
  exact feat ID or name. For implement powers, only the selected main-hand
  variant receives the distinct off-hand implement's enhancement as an
  explainable damage component. An ambiguous multi-off-hand state adds no bonus
  rather than inventing a pairing. Swapping unequal +3/+2 implements in the public
  same-profile differential swaps attack enhancement and off-hand damage bonus
  exactly; an off-hand-only weapon fixture also proves stable explicit pairing.
- The ignored nine-character historical matrix remains 501/509 comparable
  numeric aliases and 277/371 cached power fields after the change. Those
  unknown-revision caches are regression diagnostics, not goldens. The native
  `SpecialCase` and situational striker/conditional tails use the later explicit
  diagnostic boundary.

### First-class native character creation

- The Characters route can create a profile-bound native record without an
  imported `.dnd4e`. Creation requires the active pack's canonical
  `ID_INTERNAL_LEVEL_1`, pins its ID and digest, persists six base ability inputs
  of 10, and enters the existing rules-worker editor.
- Required Race, Class, Feat, and generated nested choices are supplied by the
  level/content rules and use the same generic durable choice commands as
  imported builds. The editor's shared canonical-level constructor advances the
  same build through level 30.
- Native records carry a minimal 0.07a compatibility envelope explicitly marked
  as native. The library omits the meaningless no-edit target and offers only
  regenerated 0.07a export. Root-level authoritative ability input is written
  separately from the derived sheet cache so a rule-derived bonus cannot become
  a compounded base score after re-import.
- The public synthetic profile now includes level 1, Class, Race, Feat, and
  nested Race Ability Bonus candidates. Unit/integration smoke coverage resolves
  all required identity choices, advances level 1 through 30, rejects missing
  canonical levels/inexact profiles/unsafe names, and round-trips a native build
  whose base Dexterity 10 evaluates to 12.

Live production-browser verification on 2026-09-01 imported and activated the
seven-record public profile, created a native character, displayed the required
generic choices, resolved Race/Class/Feat and nested ability choice to a
complete legal build, reloaded with every selection persisted, exposed only the
edited export target, and passed its semantic re-import gate without console
warnings or errors. This closes the old-application dependency for starting a
character; the remaining M4 compatibility and legacy-application matrices still
block complete M5 closure. Comprehensive UI validation belongs to M5.5 and does
not block this functional milestone.
The complete public gate passes 143 tests across 30 files plus formatting,
ESLint, every TypeScript project, the production/PWA build, Chromium/Firefox
print artifacts, deterministic content checks, and the query benchmark.

### Full-profile native advancement audit

- `pnpm audit:native-workflow PACK.4ecp [--max-level=N]
[PREFERRED_DEFINITION_ID ...]` builds a native record from an exact private
  pack, resolves prerequisite-aware candidates deterministically, advances
  through canonical levels, follows ordinary and power-swap retraining, equips
  an item, JSON-decodes the saved record, constructs the authoritative sheet,
  and requires edited `.dnd4e` semantic re-import parity. Private content and
  output remain ignored evidence. Its JSON report repeats `maxLevel` and every
  preferred definition ID so results remain reproducible independently of
  terminal history.
- The audit exposed and closed generic durability defects: out-of-order
  sibling choices no longer create sparse arrays; generated choices can
  materialize through arbitrarily nested grant ancestors; a provider cannot
  select itself recursively; and active replacement chains satisfy every prior
  select/replacement slot while later retraining targets only the active chain.
  Level-qualified replacements use the rule's effective level even when their
  provider was granted at level 1. Primary-class grant ancestry extends
  `CountsAsClass` aliases for Essentials choices, Hybrid Class `_BaseClass`
  aliases feed both `$$CLASS` and `$$HYBRID`, and repeated multi-slot choices
  exclude already selected siblings.
- Durable nested occurrences use the enclosing legacy level while projection
  propagates the effective grant/select level through descendants. This retains
  correct advancement timing and makes edited legacy XML semantic re-import
  exact for later choices nested beneath a level-1 class. The audit resolves
  dependency-ready choices before temporarily blocked parent-level slots.
- On 2026-09-01, an explicit Human/Fighter path against the 38,339-record local
  profile reached level 30 complete at every level, resolved 63 choices and 8
  retrainings, retained all 8 replacement targets, equipped one item, survived
  domain serialization, produced an authoritative sheet with 20 cards plus one
  item card, and passed regenerated 0.07a semantic re-import. Bracketed
  definition prerequisites such as `Blood Thirst [Multiclass Vampire] feat`
  are now verified by typed name, and prerequisite-aware retraining avoids an
  illegal custom power. The rerun is complete and legal with zero diagnostics.
  This is one real-profile workflow, not evidence that every class/build family
  passes M5 criterion 2.
- The same 38,339-record profile now has additional deterministic family
  evidence. Human/Psion reaches level 30 complete and legal with 63 choices,
  nine retrainings, zero diagnostics, and exact persistence/sheet/export gates.
  Human/Shaman reaches level 30 complete and legal with 61 choices, eight
  retrainings, and zero diagnostics after the same prerequisite-aware candidate
  policy. Human/Knight reaches level 30 complete and legal with 50 choices and
  zero diagnostics, exercising the Essentials class-alias and nested
  future-grant paths. A Hybrid shell with two distinct imported component
  classes historically reached level 30 complete with 68 resolved choices,
  eight intact retraining links, and two preserved unverified prerequisites,
  but that report did not retain its preferred component IDs and cannot be
  reproduced exactly. A newly recorded Hybrid Cleric/Fighter request reaches
  level 30 complete and legal with 65 resolved choices, eight intact
  retrainings, and zero diagnostics. Broader class/build sampling remains useful
  future evidence rather than an allowlist requirement.

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
- A reconstruction test saves native metadata, exact profile binding, and every
  sheet preference, discards the repository instance, and requires a newly
  constructed repository over the same database to return the complete record.
  An application-upgrade fixture creates the historical database version 2 with
  a schema-1 character, legacy object-form pack, and active-profile setting. The
  current repositories upgrade it to database version 3, migrate the character,
  preserve and read the pack and setting, create the journal store, and leave no
  stale journal entry.
- Content settings display the browser's current persistence decision, storage
  use, quota, and percentage used. A user-triggered action requests persistent
  storage where the API is supported and explains a denied request without
  treating it as durable-backup success.

Focused browser-storage tests cover checksummed round trip, tamper rejection, a
self-checksummed malformed schema-2 record, legacy backup inspection, repository
reconstruction, historical application upgrade, and a simulated interrupted
migration recovery. Live
browser verification displayed the persistence/quota facts against the public
synthetic profile; backup export reported one complete record. The automated
restart, application-upgrade, restore, and interrupted-migration matrix covers
the four durability cases in M5 exit criterion 5. Exhaustive supported-client UI
traversal is deferred to M5.5. The original
checkpoint public suite passed 98 tests
across 23 files plus formatting, ESLint, every TypeScript project, the
production/PWA build, deterministic content checks, and the query benchmark.
After adding the comprehensive domain decoder and crafted self-checksummed
malformed-record fixture, that public suite passed 100 tests. The current full
M5 public gate, including the durability matrix, passes 119 tests across 26
files.

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
read-only with a bounded temporary filesystem. Core security review remains an
M5 concern; exhaustive supported-client accessibility and device-performance
matrices are M5.5 work. The checkpoint public suite passes 102 tests across 24 files plus
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

The original-application boundary now has a repeatable candidate builder and
an exact recovered launch contract in `docs/legacy-builder-launch-matrix.md`.
The 2026-09-01 candidate set includes a public custom-content diagnostic, an
ignored exact-profile imported level-8 character, and an ignored native
exact-profile level-1 character. All three pass edited-export semantic
re-import; the native case is complete, legal, converged, and diagnostic-free.
This host could not execute the Windows matrix because neither project Nix
shell contains Wine/Xvfb, no project-local prefix or offline Microsoft .NET
Framework runtime exists, and no Wine package is already available in the Nix
store. No original-application pass is claimed; M5 exit criterion 4 remains
open pending observed UI results on a prepared compatibility host.

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

### Data-directory and portable-pack onboarding

- Content settings accepts portable `.4ecp` files and decrypted/merged
  `.dnd40.xml` through the ordinary file input. Rules XML is compiled with the
  production parser/content-pack builder in a worker, compressed, validated, and
  committed only after validation succeeds.
- Browsers with the File System Access API expose a read-only directory picker.
  Discovery examines names only, stops after four nested levels or 2,000
  entries, and offers supported candidates for a separate install action.
  Handles are kept only in component memory.
- Browsers without that progressive API receive an explicit Firefox/Safari-safe
  fallback message and use the ordinary file picker for the same formats.
- The UI documents that encrypted containers and loose `.part` files must be
  processed with the local Nix content tool. The public app does not retain
  decryption keys or interpret legacy update metadata.
- Pack input and decompressed output have separate 128 MiB checks. Gzip output is
  consumed incrementally and cancelled before JSON parsing when it crosses the
  decoded cap, preventing a small compressed pack from expanding without bound.
- Local profile IDs are limited to 64 safe ASCII identifier characters, and
  display names to 120 trimmed, control-free characters. The checks run before
  worker creation; generated packs enforce them again, and encoded portable
  packs are decoded and revalidated inside the storage repository before commit.

Public tests cover source classification, bounded read-only discovery without
opening candidate files, deterministic browser-side compilation of the
synthetic rules XML, compressed pack decode, and digest equality. Live Chromium
rendering confirms the directory control and labeled ordinary-file fallback;
the actual OS directory chooser remains a user-mediated system surface. The
onboarding page produced no Chromium console errors. The complete public gate
passes 117 tests across 26 files plus formatting, ESLint, every TypeScript
project, the production/PWA build and cache-boundary assertion, deterministic
content checks, and the query benchmark. Adversarial cases additionally cover a
small gzip expanding past the decoded limit, an oversized encoded input,
oversized generated output, unsafe/oversized profile identifiers, control
characters, and storage-boundary revalidation.

### Public import and rendering security pass

- Portable-pack decoding now validates the complete nested normalized domain
  before digest checking or IndexedDB storage. Manifest counts, entities,
  attributes, specific fields, rule statements and children, extensions,
  preserved/rejected nodes, diagnostics, and provenance are all required.
- Packs are limited to 100,000 accepted or rejected records and preserved XML
  nodes to 100 levels of nesting in addition to the independent encoded and
  decoded byte limits. The complete known private corpus remains below both
  record and byte ceilings.
- Hosted HTML carries a same-origin CSP. The reference nginx image applies that
  policy with frame denial, no-sniff, no-referrer, same-origin opener/resource,
  and least-privilege browser-feature headers to health, configuration, asset,
  and application routes. A public test also prevents executable-markup sinks
  from entering the React application source.

Focused adversarial tests reject an incomplete nested rule and a preserved node
beyond the depth ceiling before validation/storage. A production build loaded
under the HTML policy in live Chromium, installed its service worker, reported
offline readiness, rendered content onboarding, and produced no console warning
or error. The rebuilt image ran with a read-only root and bounded temporary
filesystem; application, immutable-asset, runtime-configuration, and health
routes all returned the required security policy while retaining their distinct
cache behavior. The complete public gate passes 123 tests across 27 files. This
checkpoint is a structural and security baseline, not the comprehensive
interface validation owned by M5.5.

### Structural accessibility and responsive-shell baseline

- Hash-route changes now move focus to the new `main` landmark while preserving
  the browser's ordinary initial focus. The focus helper has missing-landmark and
  successful-handoff tests.
- The 720 px body minimum was removed. At tablet/narrow breakpoints the header,
  navigation, compendium workspace, library/editor forms, sheet columns/cards,
  and fact grids wrap or stack; fixed three-column card rules remain scoped to
  print.
- A palette contract checks every normal-size shell/status/action/power/item
  foreground/background pair at the WCAG AA 4.5:1 threshold. The item-card
  orange was darkened because its prior white-text contrast did not pass.
- The durable checklist distinguishes this low-cost structural baseline from
  the comprehensive Firefox/Safari/tablet/keyboard/screen-reader/zoom/touch and
  visual-print evidence owned by M5.5.

Live production Chromium found one `h1`, one `main`, no duplicate IDs, and no
unnamed native interactive controls on the top-level empty-state Settings,
Characters, and Compendium routes. Clicking between routes placed focus on the
new `main` with `tabIndex=-1`; the fresh initial load kept body focus and the
updated shell had no forced minimum width or console warnings/errors. The full
public gate passes 127 tests across 29 files. Full keyboard, assistive-
technology, device, and visual validation waits for the designed interface in
M5.5.

### Chromium and Firefox Letter/A4 functional PDF regression gate

- Chromium 152, Firefox 154, geckodriver 0.37, and Poppler are pinned in the
  project-local Nix shell. The public gate starts the production preview and
  ephemeral headless browser profiles, seeds a synthetic schema-2 character,
  and prints the real sheet route through Chromium's debugging protocol and the
  standard Firefox WebDriver print command.
- The fixture contains 18 powers with alternating long/short prose, six item
  cards, features, skills, equipment, and blank hit points. Four variants cover
  Letter/A4 crossed with color/monochrome.
- Each browser/variant combination produces a five-page PDF. Every page—not just
  the first—measures 612 × 792 points for Letter or approximately 595 × 842 for
  A4. Extracted text contains both section headings and the first/last power and
  item, while the mutable hit-point value and application chrome are absent. All
  24 cards report no DOM overflow, and monochrome variants compute white headers
  with black text. Chromium output is tagged; Firefox 154 output is explicitly
  recorded as untagged.
- Firefox ignores the named-page switch when a global Letter page is present.
  The character sheet therefore installs a same-origin global print stylesheet
  for the persisted Letter/A4 choice; named pages remain a progressive
  enhancement. Both engines now honor the selected paper size.

The harness deletes its browser profile and PDFs and uses only public synthetic
data. `scripts/check.sh` includes this real-browser print gate after the
production build. It closes M5's functional Letter/A4 boundary. Safari/device
execution and cross-engine raster inspection are M5.5 visual-validation work.

### User and recovery documentation

The maintained user guide now covers hosted/PWA and reference-Docker
installation, project-local private pack construction, bounded content and
character import, storage persistence, exact-revision profile migration, both
compatibility export targets, sheet/PDF controls, checksummed backup inspection
and restore, application updates, offline and migration recovery, destructive
actions, and troubleshooting. It also names the current blank-character,
compatibility, legacy-launch, current browser evidence, deferred M5.5 UI
validation, Firefox tagging, and reserved-runtime-configuration limitations.
This closes the documentation boundary in M5 exit criterion 10; it does not
claim that the later M5.5 design and release-readiness matrix has run.

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
513/514 numeric aliases and 331/371 cached power fields. The remaining sample
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
