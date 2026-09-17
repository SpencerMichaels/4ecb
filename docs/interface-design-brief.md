# Interface design brief

This brief records the product-owner direction for M5.5. It governs the durable
builder interface and supplies the interaction language that later phone play
mode should extend. It is a product direction, not permission to copy another
application's protected visual assets.

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
  Race, class, current level, and XP sit beside the portrait; unresolved and
  warning totals sit with save state and actions. Do not repeat these facts in a
  separate character-overview panel or continuously display a successful rules
  evaluation message.
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
  The unavailable-options control is temporarily absent during the current
  compact-layout prototype and will return in a later focused design pass.
- Do not label choices as popular or recommended. The application may present
  objective legality, prerequisites, source, and mechanical consequences; it
  must not invent subjective build advice.
- Use one branded global header with two destinations: **Characters** and
  **Settings**. Character-specific Build and sheet views are
  reached from the character library and from one another rather than repeated
  as global destinations. Settings owns Display, character-library backup and
  restore, and Content configuration.
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
  comprehensible. Interaction responsiveness is a product requirement.
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
  follow-up choices belong to Companion.
- Repeated Background slots use one primary **Choose background** section;
  already selected extras remain visible and optional empty slots appear one at
  a time through **Add another background…**. A revealed empty slot can be
  removed with the same compact X action used for a completed optional
  background; removing one never clears the required primary background.
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
  scroll.
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
- In Character details, Gender and Alignment use visible button groups. Deity
  uses the shared table with Deity and Alignment columns, favorites, filtering,
  Clear, and the adjacent detail pane.
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
- Template identity and relevant print options must be explicit in previews and
  exports; adding a template must not change existing saved characters' rules
  interpretation.

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

The temporary **Show unavailable options** control is level-wide rather than
repeated in every choice. Compact choices whose candidate records add no useful
player-facing explanation, notably ability increases, omit the empty detail
pane and supporting filter prose.

Ordinary optional replacement rules are presented as retraining, matching the
player-facing game concept. An unused retraining slot is absent from the level
rail and Overview history and initially renders only **Retrain a skill…**, **Retrain a feat…**,
and **Retrain a power…** actions for categories actually available. Activating
one reveals a category-filtered editor that can be cancelled before a choice is
made. An imported or completed retraining remains visible in the level pane and
Overview history, but not as a required decision, and can be explicitly removed
with the same compact X affordance used for other optional additions to restore
the replaced selection. Special replacements that
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
modern information-architecture requirement. Equipment uses sibling Loadout,
Inventory, Shop, and Rituals & Practices tabs with one shared detail viewer.
The Shop is a paged query-worker view of exact records; terminal `+N` variants
may share a presentation family, but filtering and every transaction retain
the exact content ID. The Loadout assigns exact owned copies to explicit slots,
while Inventory owns quantities, carried/stored wealth, and legacy-percentage
sales. Known rituals/formulas/practices and quantity-bearing scrolls remain
distinct. Spellbook alternates stay in Build. Item-owned configuration remains
evaluable and recoverable; a later focused pass will move its editor into this
workspace with a clear link to character-level consequences.

## Validation sequencing

M5.5 first establishes and receives product-owner approval for the principal
interaction design. Comprehensive accessibility certification and the broad
browser, operating-system, assistive-technology, and physical-device matrix may
be scheduled closer to 1.0. Semantic HTML, labeled controls, keyboard-operable
native primitives, reduced-motion behavior, readable contrast, and non-forced
responsive sizing remain continuous engineering constraints so later validation
does not require a wholesale rewrite.
