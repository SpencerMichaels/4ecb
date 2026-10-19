# Interface design brief

This brief records the product-owner direction for M5.5 and the M5.6 browser
View sheet, plus the deferred desktop/tablet Play direction now owned by M5.8.
It governs the durable builder, Equipment, and parity View interfaces, then the
beyond-parity interaction language that the later phone play surface should
adapt. It is a product direction, not permission to copy another application's
protected visual assets.

**Status (2026-09-28):** M5.5 is complete. After the recorded prototype and
production review passes, the product owner gave final approval to the shipped
builder, library, Inventory/Loadout, Shop, and item-acquisition interactions.
M5.6 now owns only the refined browser View sheet. M5.7 owns final UI cleanup
and invited-beta hostability preparation; desktop/tablet Play moves to M5.8.

## Product character

- Present as a modern web application rather than a recreation of the legacy
  desktop program or a decorative digital character sheet.
- Use Pathbuilder 2e as the principal reference for information structure and
  workflow: per-level choices remain visible in a sidebar and the selected
  choice opens a focused editor in the main pane.
- Keep the design clean, minimal, fast, and information-focused. Avoid decorative
  flourishes and slow animation. Motion is appropriate only when it communicates
  state, location, causality, or progress, and must not delay interaction.
- Use simple monochrome interface icons from a consistent open icon system or
  original equivalents. Do not use emoji as application iconography.
- Support light and dark themes, initially following the browser/operating-system
  preference and allowing an explicit user override.

## D&D 4E visual language

- Preserve the recognizable legacy D&D 4E color mappings and icon concepts for
  semantic game information such as at-will, encounter, daily, and item powers,
  defenses, abilities, and other established stat categories.
- Re-create those meanings in an original, modern component system rather than
  copying legacy UI chrome or proprietary bitmap assets.
- Color and icons reinforce meaning but do not become the only carrier of state.

## Builder interaction model

- Use a guided workflow by default while allowing users to inspect choices from
  later levels without first completing every earlier choice.
- Use a hybrid structure: a compact portrait-and-identity header, a narrow
  ordered level rail, and focused detail/selection content in the main pane.
  A prominent portrait and directly editable character-name field lead the
  header. Its subtitle contains only the available race, class, and current
  level as natural space-separated text (for example, **Dwarf Paladin 7**),
  without separators or XP. Unresolved and warning totals sit with save state
  and actions. At rest the name field retains the previous plain heading
  appearance without a textbox border or fill; pointer hover adds only a subtle
  underline, while keyboard focus replaces it with a thicker accent-colored
  underline rather than a rectangular outline. Its visible text shares the exact
  left edge of the race/class/level subtitle. The current level is edited in
  that subtitle ("Dwarf Paladin · Level [7]", a frameless dropdown styled like
  the name field), not in Character details: it reshapes the whole build
  rather than describing the character. A wide, shallow statistics strip to
  the identity block's right shows the effective character level's evaluated
  maximum HP, Speed, Initiative, AC/Fortitude/Reflex/Will, and six ability
  scores. Four visually distinct clusters communicate hit points, movement,
  defenses, and abilities without visible group headings; ability pairs use
  fixed internal columns so their two rows remain aligned while each pair stays
  centered. Hovering any numeric total opens a native multiline tooltip with a
  player-facing breakdown of only the evaluator contributions that actually
  apply; this display preserves evaluator provenance rather than reconstructing
  formulas in the interface. Planning or selected-level evaluations never alter
  this strip, and unavailable current values appear as em dashes without a
  tooltip. Do not repeat these facts in
  a separate character-overview panel or continuously display a successful
  rules evaluation message.
- Treat a level, rather than an individual slot, as the main builder workspace.
  Selecting a level shows its mechanical choice categories as a horizontal tab
  list, including separate Background and Theme tabs, and mounts only the active
  category in the main pane. The level rail
  always offers levels 1–30, grouped into Heroic, Paragon, and Epic tiers; the
  current tier starts expanded and the other tiers start collapsed. Selecting a
  level beyond the saved build extends the plan through that level without
  advancing the current character. Preserve the last active category separately
  for each visited level.
- Integrate the selected level label into the category strip as a visually
  distinct, non-interactive leading title: **Level 8 | Ability Scores | Feats |
  Retraining**, for example. Do not repeat it as a large heading above the
  strip. The outer choice workspace has no card background, border, or padding;
  the active choice surface and adjacent detail surface sit independently on
  the application background.
- When a user selects a target level, create the complete level timeline
  immediately and present its unresolved decisions. Include every level through
  the target: unresolved items are prominent, completed levels remain visible in
  a compact form, and future choices may be inspected out of order.
- Treat only unresolved decisions at or below the effective character level as
  incomplete. Future-plan decisions remain neutral until that level becomes
  current. Communicate completion and attention primarily through stable icon
  color and subsection-header fills rather than repeated status prose. Keep the
  selection contents on their ordinary surface color; state changes must not
  alter typography or move adjacent controls.
- Distinguish the character's current effective level from the build-planning
  horizon. Choices above the current level are preserved, visible, and editable
  so a player can plan many levels ahead, but they are inactive in current
  calculations and compatibility exports. Do not expose a separate plan-horizon
  input: navigating to a later level grows the plan as needed, and the current
  level control remains the explicit way to advance the playable character.
- Evaluate a choice at level X against the projected build through level X.
  Same-level decisions may satisfy one another—for example, a level-4 ability
  increase may unlock a level-4 feat—but no feature from a later planned level
  may leak backward into its candidates or legality. The final planning horizon
  is therefore not itself the prerequisite context for every earlier choice.
- Show candidates belonging to the choice category and currently legal by
  default. Each selection surface provides a temporary control that also
  reveals same-category options blocked by prerequisites or another objective
  rules limitation, with the reason for their status. Records that do not match
  the choice category are never browsing options for that slot. Do not persist
  this mode on the character or automatically apply it to later choice lists.
  Selecting an illegal option remains an intentional user action rather than an
  accidental consequence of changing the filter.
  Each candidate table carries this as a small icon-only toggle at its
  top-right corner (after the result count), matching the legacy builder's
  placement. It uses lucide's scale-of-justice glyph, and its accessible name
  and tooltip say "illegal options" — not merely "unavailable" — so the reason
  for exclusion (the rules would not allow the character to pick them) stays
  explicit (2026-09-24).
- Do not label choices as popular or recommended. The application may present
  objective legality, prerequisites, source, and mechanical consequences; it
  must not invent subjective build advice.
- Use one branded global header with two destinations: **Characters** and
  **Settings**. Character-specific Build and sheet views are
  reached from the character library and from one another rather than repeated
  as global destinations. Settings owns Display, Backups & storage, and Game
  content. Ordinary content status and add/review/use actions stay visible;
  pack composition, exact identities, raw XML import, and diagnostics live
  under deliberate advanced disclosure.
- Keep a sibling **Overview** tab beside Build and Character details. It presents
  concise checklist panes for Character, Ability Scores, Companion, Skills,
  Powers, Spellbook, Feats, Retraining, and Other, with choices ordered and labeled by level; it
  must not repeat the same selections in a second raw “stored features” tree. Current
  levels appear by default. A temporary **Show planned levels** checkbox reveals
  only future levels that already contain a saved choice, omitting empty plan
  frames. Activating any history row returns to Build at that level and opens
  the owning category tab.
- Tailor Overview columns to each checklist: Character has no redundant Level;
  Feats and Skills do not repeat their type in every row; optional empty
  Background slots stay hidden; paired ability increases share one row.
  Retraining has explicit From → To columns, while feature-driven power
  replacements remain Powers. Mark the resulting item in its normal checklist
  with a compact superscript **R** whose tooltip and accessible label identify
  the original item and retraining level. Power rows use concise usage labels and the
  familiar green/red/gray/blue power colors even while unresolved. Let panes
  wrap at content-sized widths rather than stretching every checklist equally.
- Keep important evaluation, save, and validation feedback immediate and
  comprehensible. In the builder, Character sheet is a peer top-level tab.
  Unresolved and warning counts and save state occupy the tab bar's trailing
  status area, followed by icon-only Undo and Redo controls with accessible
  names and tooltips. Interaction responsiveness is a product requirement.
- Ordinary client-side page changes reuse decoded content, rules workers,
  memoized exact evaluations, and content-query indexes for the active immutable
  profile. A route must not present multi-second content initialization merely
  because its previous component was unmounted. A full browser refresh may show
  one truthful startup reconstruction from persistent browser storage.
- Selecting an option updates the visible control and its detail pane
  immediately; IndexedDB persistence and rules reevaluation continue in the
  background. Every information-bearing selection surface keeps the focused or
  selected option's source, prerequisites, description, and mechanical fields
  in an adjacent detail pane.
- Give the selected category and adjacent detail card the available main-pane
  space without mounting every category into one tall document. Ordinary forms
  retain their natural content height rather than acquiring nested scrollbars;
  bounded candidate tables are the deliberate exception because their result
  sets can contain thousands of rows, and may expand vertically with the
  viewport before their rows scroll internally.
- Organize feat and power tables into collapsible semantic type sections using
  authored subtype/owner metadata and the legacy prerequisite-derived fallback.
  Do not silently truncate matching candidates. Let players star candidates
  without selecting them and temporarily filter the table to those persistent
  content-ID favorites while comparing options.
- Sort every candidate table alphabetically by Name initially. Column headings
  are interactive sort controls: a new heading sorts on that field with Name as
  the tie-breaker, while activating the current heading reverses its direction.
  Selection itself never changes row order.
- Present each same-level pair of ability increases as one six-button,
  exactly-two selector. Character increases belong to Ability Scores;
  companion increases, companion/familiar selection, and companion-owned
  follow-up choices belong to Companion. The level-1 racial ability bonus
  selector also belongs to Ability Scores, after the base-score controls,
  while the exact evaluator choice remains unchanged.
- Repeated Background slots use one **Backgrounds** candidate table for up to
  six choices. The shared table preserves each exact evaluator slot and its
  legality while presenting the full selection limit as one multi-select
  surface.
- Legacy Build records are starting presets, not persistent mechanical choices.
  Present them immediately after class selection in a collapsed **Starting
  presets** disclosure containing a searchable table and explicit Apply action.
  Each row summarizes the preset with the first sentence of its authored
  description. The inspected preset drives the shared detail pane, with the
  complete description followed by the suggested feature, feat, skill, and
  power list.
  Applying it fills only matching, currently open, rules-legal level-1 choices,
  reports the result immediately, and never overwrites work already chosen. An
  imported legacy Build occurrence remains preserved internally for round-trip
  compatibility without appearing as a to-do.
- Skill Training uses one toggle list rather than repeated dropdowns. It shows
  every category-valid skill, marks trained skills, permits direct train/untrain
  toggles, and announces **X out of Y skills chosen** while preserving the
  evaluator's positional slots underneath.
- Large parenthetical feat families use progressive two-stage selection: choose
  the feat family first, then its weapon, implement, skill, or other parameter.
  This is presentation-only; the selected exact legacy feat remains visible in
  the timeline and is the identity stored by the character.
- Information-rich or numerous choices use one shared searchable table system
  rather than native dropdowns. Every such table provides consistent
  click-to-inspect, commit, Clear, result-count, and browser-local favorite
  behavior. Feat rows show name and the authored Short Description. Printable
  prerequisites remain searchable and appear in the focused detail pane; they
  are omitted as a standing column because legal choices already satisfy them,
  while unavailable rows state why they are blocked. Power rows show name and a
  compact authored flavor summary;
  action type and attack type are each represented by one monochrome icon, with
  the exact source value retained as its tooltip and accessible name. Power
  usage keeps the familiar 4E at-will/encounter/daily/utility color treatment.
  A single row click pins that candidate in the shared detail pane; hover and
  focus alone do not replace the inspected record. Double-click commits the
  selection. Enter is the keyboard commit equivalent, while Space/single-click
  remains inspection-only. A committed choice still updates selection state
  immediately while reevaluation and autosave run in the background. Selection
  never reorders rows: only an explicit search or Favorites filter may change
  what is shown. The selected row's green highlight is sufficient, so tables do
  not add a redundant checkmark beside its name. Short tables size to their
  actual rows; only larger result sets expand into the available viewport and
  scroll. When a tab or pane first opens, its first shared candidate table uses
  its first existing selection to initialize the adjacent detail pane. Every
  mounted candidate table independently positions its first selected row at the
  top of its own viewport when possible, or at least keeps it visible. This is
  one-time opening behavior: later selections, filters, sorting, and rerenders do
  not trigger automatic repositioning or replace an option the user explicitly
  inspected.
- When a large table has overflow, its static selection summary uses one chip
  per selected item instead of a prose **Current selection(s)** sentence. The
  chips and column headings remain in ordinary document flow rather than
  floating over the page or rows. Clicking
  the chip name opens the detail card, and its trailing X unselects the exact
  backing choice. Each chip mirrors that entity's detail-card header: the same
  shared entity-family, power-action, or item icon leads the bold header-style
  name. At compact scale, the chip keeps the header's soft tone background,
  heavier full-tone top edge, thin full-tone bottom divider, and thin neutral
  side edges rather than a uniform badge border. Its icon and text share one
  vertically centered line with compact versions of the header padding,
  line-height, and rhythm. Ordinary entities use the established neutral tone.
  Icons are decorative; the name and trailing X remain separate labeled
  controls. There is no locate-in-table action.
  Selection limits and row order remain unchanged.
- Class rows show the authored Short Description rather than the quotation-like
  Flavor text, with separate Role and Power Source columns. Legacy Role and
  Power Source fields combine a category with explanatory prose (for example,
  `Defender. ...`); the presentation model splits each into a concise first-word
  label and retained description so tables can stay compact without discarding
  the authored explanation.
- Class-feature choices use the same table interaction rather than compact radio
  buttons, with an authored Short Description column when present and the first
  sentence of the full description as a fallback. A generic nested choice takes
  the name of its authored class-feature provider (for example, **Avenger's
  Censure**) when that relationship exists. If the legacy rule supplies no such
  parent name, retain the conservative **Class Feature** heading rather than
  inferring one from candidate names. Use the same authored name in Overview so
  the history and editable section remain consistent.
- The shared detail column follows explicit executable grant relationships.
  When an inspected option unconditionally grants a user-facing feat or power,
  render that referenced definition as another full detail card immediately
  below the granting option. Resolve the authored content ID; do not infer a
  relationship by parsing description prose. Conditional and internal grants
  remain engine behavior until the interface can explain their conditions
  without implying that they always apply.
- A magic weapon owned as a base plus enchantment appears as one item card, not
  two nested definition cards. Its compact fact band uses deliberate semantic
  lines with naturally sized inline facts and vertical separators: combat
  values; construction values; physical/economic values; then properties.
  Rarity belongs in that band rather than the header. Reserve full-width rule
  rows for prose, and keep their labels whole.
- Repeated feat or power slots in one section share a single multi-select table
  and one **X of Y chosen** count. Selected rows remain visible. To keep large
  feat corpora responsive, search always covers the complete candidate set but
  the DOM renders a bounded result window and tells the player when filtering
  is needed to reach the remainder.
- Autosave every committed character change. Show concise saving, saved, and
  failure states without interrupting ordinary work, retain transactional undo
  and redo, and never imply persistence before the storage commit succeeds.
- Prefer visible controls over native dropdowns for rules choices. Small,
  low-information mutually exclusive sets use stable button/radio grids; a lack
  of selection communicates unresolved state without adding “Unresolved” as a
  fake candidate. Larger or information-rich sets use the shared table. Clear
  remains a real edit that restores the exact slot to an unresolved placeholder,
  autosaves, and remains undoable. The compact current-level control may remain
  a dropdown because it selects one scalar from a long, familiar numeric range.
- Character details is compact: Player, Company and RPGA # (and Age, Height,
  Weight) are inline-label fields side by side; Gender and Alignment are
  segmented controls as wide as their options, labelled on the left; Deity
  uses the shared table with the adjacent detail pane; the six notes sit under
  one row of tabs (a dot marks notes with text). The name is edited only in
  the sidebar and the level beside it.
- Equipment and Diagnostics are full workspace tabs beside Build, Overview, and
  Character details. They do not remain as collapsed disclosures below every
  workspace; the Equipment tab is the integration point for the forthcoming
  equipment redesign.

## Character-sheet templates

- Screen-oriented builder views and printed sheets are distinct layouts sharing
  the same authoritative sheet model.
- Printing supports an explicit sheet-template selection so multiple formats can
  coexist without forking character data or calculation behavior.
- The first template is a close modern implementation of the legacy sheet. Its
  principal compatibility goal is familiar information geography: users should
  find a given value in roughly the same part of the same page as before.
- A later modern template may substantially redesign hierarchy, density, and
  pagination while retaining the recognizable 4E power and stat semantics.
- Template identity must be explicit in previews and exports; adding a template
  must not change existing saved characters' rules interpretation.
- The sheet has no per-character print options (D083): power and item cards
  always print, monochrome is the browser print dialog's job, and paper size
  is an app setting (Settings → Printed sheet, Letter | A4, defaulting from
  the browser locale). The print-preview toolbar holds only Back and Print
  icon buttons.

### App-wide conventions (polish pass, 2026-10-18)

- Dialogs share one contract (`primitives.css`): a branded header with the
  title and a close ×, a body, and a footer with [Cancel] [Back] [Primary] on
  the right and any other action (download a backup, remove portrait, the
  purchase summary) on the left. Declining is always "Cancel", never "Not now"
  or "Maybe later"; Esc equals Cancel.
- Successes the page already shows produce no message; failures and warnings
  are floating toasts on every page (library, Settings); ongoing work shows
  inline beside the control that started it.
- Character problems are builder issues in the status badges, never banners:
  missing bound content and failed rules evaluation are errors with their own
  Diagnostics entries. The only standing banner is the library's
  persistent-storage prompt, shown on arrival while it is actionable.
- Settings closes (× or Esc) back to the page it was opened from. Its sections
  group settings by where they apply (Display, Builder & Equipment, Power
  cards, Printed sheet, Backups & storage, Game content); single choices from
  a few options are segmented controls (`SegmentedControl`).

### Browser View and deferred Play modes

- **View (M5.6)** is the authoritative read-only desktop/tablet character
  reference. It
  prioritizes quick scanning, navigation among major sections, complete reference
  cards, equipment, rituals, notes, and an obvious path to print preview.
- **Play (M5.8, beyond parity)** is a separate desktop/tablet,
  character-sheet-shaped interface. It may share visual components with View,
  but mutable HP, resources, power usage, effects, and temporary equipment state
  are backed by `PlayState` commands, history, and undo rather than changes to
  calculated sheet values.
- View, Play, and print consume the same semantic `SheetDocument` and card models
  while retaining layouts appropriate to reading, interaction, and paper.
- The M6 phone application depends on M5.8, then reuses its PlayState and command
  semantics while reorganizing them into Dashboard, Powers, Effects, Equipment,
  and Journal tasks. It is not a narrow breakpoint of the desktop Play sheet.

Rules choices created by the immediately preceding selection are presented as
one progressive choice flow, not as independent level cards. The first chosen
entity names the flow when available, and numbered steps keep the initiating
choice, its dependent feature choice, and any resulting replacement together.
This is presentation-only: each step still dispatches and stores its exact
rules-engine occurrence. Archery Mastery therefore reads as one section that
flows from the feat to Rapid Shot Mastery to the at-will power being replaced.

Repeated positional slots emitted by one rules selection are likewise one
section with an explicit completion count. Each slot remains independently
selectable and stored. This covers the paired ability increases at levels 4,
8, and later intervals, the usual pair of level-1 at-will powers, and the two
class slots of a hybrid character. Slot-specific controls such as Background
and Skill Training retain their more specialized grouped presentations.

The illegal-options toggle is local to each candidate table (see above), not
one level-wide control. Compact choices whose candidate records add no useful
player-facing explanation, notably ability increases, omit the empty detail
pane and supporting filter prose; they also have no candidate table and so
carry no illegal-options toggle.

Ordinary optional replacement rules are presented as retraining, matching the
player-facing game concept, on their own builder tab (**Retraining**, as in the legacy builder; last,
after Shop, as the least used; 2026-10-18). The tab is an overview table of
every level up to the current one that can retrain (one retrain per level):
Lvl, Kind, Replaced, With, and edit/remove buttons, so every retrain is visible
at once however many levels there are. Clicking a row shows its replacement
in the details pane; double-clicking it or its edit button opens a **Level N
retraining** dialog with three always-present accordion items, **Retrain a
skill / feat / power**, one open at a time, beside a details card. An open
item shows a Replace table (what is given up, all sections expanded) and the
replacement table. Changes apply as they are made, so the dialog has only a
close ×. Nothing is
applied on its own, even with a single possible replacement. Choosing in
another kind than the level's current retrain confirms first, since it removes
that retrain. Retraining is never a required decision and stays out of the
level picker's progress. Old `tab=build&section=retraining` links open the
Retraining tab. Special replacements that
are consequences of another choice, such as Rapid Shot Mastery, remain inside
that choice's progressive flow rather than being relabeled as retraining.

## Priority journey

Optimize the first design and prototype around this end-to-end journey:

1. Create a new character against the active content profile.
2. Make guided build choices and inspect upcoming choices.
3. Advance directly to a desired level while resolving required decisions.
4. Review the completed build and its remaining warnings or illegal choices.
5. Produce a readable printed character sheet for use in a game.

Import, retraining, equipment browsing, and detailed correction workflows must
remain supported, but they are secondary when resolving early design tradeoffs.

## Equipment workspace

The legacy builder unusually displays item-owned selections, such as Armor of
Resistance's damage type, in the wearer's Class pane. Preserve that underlying
choice and its legacy export topology, but do not treat the placement as a
modern information-architecture requirement. **Equipment** is the Inventory
workspace rather than a container for another tab bar. Its Loadout button swaps
the main pane from Inventory to the two responsive slot stacks; the inverse
Inventory button swaps it back. The shared item inspector remains fixed in the
right pane across both views. **Shop** is a peer character-editor tab. Its
alphabetical Browse taxonomy covers physical equipment roles, enchantment
families, rituals, alchemical formulas, and martial practices without another
tab strip. Ritual scrolls are Consumables rather than a parallel ritual
category. An advanced Legacy category filter retains the original builder's
names without making that long mixed taxonomy the primary navigation. Slot and
subtype filters show only values present in the current result set; unavailable
filters stay in place, disabled with a dash, so the toolbar does not jump.
Affordable and Proficient begin enabled, and filter/sort choices survive Browse
changes for the editor session. Shop renders bounded pages of exact records;
terminal `+N` variants may share a presentation family, but filtering and every
transaction retain the exact content ID. A collapsed family selects the highest
exact level not above the character level, falls back to its lowest member,
shows `N+` when higher members exist, and expands in deterministic low-to-high
order. The Loadout assigns exact owned copies to explicit slots,
using two responsive slot stacks whose dropdowns align after the longest label
within that stack and retain a compact maximum width. Shields use their authored shield/base-item identity to
occupy Off hand even when a paired magic definition has an Arms magic-item
classification. Committing a non-empty slot selection inspects that item in the
shared detail viewer; focusing a populated slot restores its current item. The
native select remains intact, and transient popup highlighting does not preview
details because it has no reliable cross-browser event contract. Inventory leads
with one compact total-funds summary whose stable AD/PP/GP/SP/CP columns include
zero values. Its compact width matches the Shop rail's wallet while shrinking
safely at narrow breakpoints. A Quick adjust field accepts one signed denomination amount;
positive adjustments credit carried funds and negative adjustments spend carried
before stored in one transaction. A shared Edit action opens the same modal for
direct carried/stored denomination editing from Equipment and Shop. Shop keeps
the compact Funds summary above its sticky detail rail. Holdings use
canonical item icons, concise equipped state, compact quantity controls, and
trailing sell/remove actions. The holdings table is divided into collapsible
role sections aligned with modern Shop Browse: Adventuring gear, Ammunition,
Armor & shields, Companion, familiar & mount, Consumables, Implements, Special
items, Weapons, Wondrous items, Worn items, and Miscellaneous. Empty
sections are omitted, the heading count means holding rows rather than total
owned quantity, and all populated sections begin expanded except Miscellaneous.
Expansion choices last for the current editor session. Classification is a
presentation projection of authored metadata across every resolved component
and repeated specific; it does not sort or mutate durable Inventory order.
Ordinary reusable gear appears under Adventuring gear; mechanically active
carried magic appears under Wondrous items. Unresolved/custom holdings stay
recoverable under Miscellaneous rather than being guessed from their names.
Sales disclose their actual proceeds at the recovered percentage choices;
reductions remove unequipped copies first and immediately unequip only when no
unequipped copy remains. Inventory
row double-clicks use the same Loadout assignment path: an assigned holding
unequips, while an unassigned holding chooses the first open compatible slot in
visible Loadout order. A necessary but reversible displacement proceeds
immediately; unresolved historical slot identity remains untouched. Removing a
holding without proceeds is destructive and therefore uses an in-place
two-click confirmation that can be disarmed with Escape or outside interaction. Known
rituals/formulas/practices and quantity-bearing scrolls remain distinct.
Spellbook alternates stay in Build. Item-owned configuration (for example an
Armor of Resistance damage type) is evaluable and recoverable without
changing its rules occurrence or legacy export topology. A Shop purchase
whose item grants its own choice (one or more) prompts for each on its own
acquisition-dialog page, in order, before any compatible-base-item pairing —
including a further choice the chosen candidate itself requires (for
example a granted power that itself asks which ability governs it), which
gets its own page too rather than ever surfacing later as a separate,
mis-attributed Build-tab choice; once made, a choice is fixed for the life
of the item. A choice whose
candidates are Powers shows a two-column picker-plus-detail-card page (the
same layout Build's choice editors use) so the player can see what each
option actually does before picking; a simpler choice (a resistance type, a
language) stays a plain compact picker. A resolved choice displays as a
parenthesized suffix on the item's own name — `Banded Mail of Resistance +2
(Fire)` — everywhere that name is shown (Inventory, Loadout, Shop, the
shared item inspector), and a resolved Power choice also gets its own
adjacent sibling detail card after the item's full card, the same way a
granted power is presented, rather than as a separate editor surface in this
workspace (2026-09-24: an initial separate-editor design was replaced with
this simpler one the same day; 2026-09-25: per-choice pages and the Power
detail card added).

M5.5 closure applied the same focused review standard to the formerly
under-refined tabs:

- **Inventory** makes current holdings, quantities, carried/stored state, sale
  outcomes, inspection, item configuration, and recovery states easy to follow.
- **Shop** makes its modern and optional legacy Browse taxonomies, dynamic
  slot/subtype filters, exact magic variants, affordability/proficiency/known
  filters, purchasing, free acquisition, and resulting inventory state explicit.
  Buy and Give are independent row actions; nonpurchaseable records keep a
  disabled Buy control and an active Give control.
- Each workspace received a live full-profile workflow pass and product-owner
  approval; item-owned choices are resolved at Shop purchase time and shown as
  part of the item's own name everywhere it is displayed, without changing
  their rules occurrence or legacy export topology.

## Validation sequencing

M5.5 established and received product-owner approval for the principal builder,
library, and Equipment interaction design. M5.6 now refines and approves the
browser View sheet as the final major parity surface. M5.7 then performs final
UI cleanup and prepares the existing container/PWA foundation for an invited
beta. M5.8 establishes desktop/tablet Play state and interaction before the M6
phone adaptation.
The project does not run a formal accessibility-certification or cross-client
support matrix (D063). A lightweight best-effort browser workflow and visual
print check remain an M9 hardening responsibility.
Semantic HTML, labeled controls, keyboard-operable
native primitives, reduced-motion behavior, readable contrast, and non-forced
responsive sizing remain continuous engineering constraints so later validation
does not require a wholesale rewrite.
